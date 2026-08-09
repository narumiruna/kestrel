package dev.narumi.kestrel.core.library

import android.content.Context
import androidx.room.withTransaction
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.library.db.KestrelDatabase
import dev.narumi.kestrel.core.library.db.LibraryDao
import dev.narumi.kestrel.core.library.db.LibraryItemEntity
import dev.narumi.kestrel.core.library.db.LibraryItemRecord
import dev.narumi.kestrel.core.library.db.PendingSyncChangeEntity
import dev.narumi.kestrel.core.library.db.PlaceEntity
import dev.narumi.kestrel.core.library.db.RouteEntity
import dev.narumi.kestrel.core.library.db.RouteRevisionEntity
import dev.narumi.kestrel.core.library.db.SyncStatus
import dev.narumi.kestrel.core.library.db.WaypointEntity
import dev.narumi.kestrel.core.location.LatLng
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID

interface LibraryRepository {
    val items: Flow<List<LibraryItemWithContent>>
    val sortMode: Flow<FavoritesSortMode>

    suspend fun addPlace(
        name: String,
        lat: Double,
        lng: Double,
        description: String? = null,
        tags: List<String> = emptyList(),
    ): String

    suspend fun addRoute(
        name: String,
        waypoints: List<LatLng>,
        defaultSpeedKmh: Double,
        mode: String,
        description: String? = null,
    ): String

    suspend fun getItem(itemId: String): LibraryItemWithContent?

    suspend fun renameItem(
        itemId: String,
        newName: String,
    )

    suspend fun updatePlace(
        placeId: String,
        lat: Double,
        lng: Double,
    )

    suspend fun updateRouteParams(
        routeId: String,
        speedKmh: Double,
        mode: String,
    )

    suspend fun removeItem(itemId: String)

    suspend fun reorderItem(
        itemId: String,
        toIndex: Int,
    )

    suspend fun touchItem(itemId: String)

    suspend fun setSortMode(mode: FavoritesSortMode.Mode)

    companion object {
        @Volatile private var instance: LibraryRepository? = null

        fun getInstance(context: Context): LibraryRepository =
            instance ?: synchronized(this) {
                instance ?: RoomLibraryRepository(
                    database = KestrelDatabase.getInstance(context.applicationContext),
                    prefs = KestrelPrefs(context.applicationContext),
                ).also { instance = it }
            }
    }
}

private class RoomLibraryRepository(
    private val database: KestrelDatabase,
    private val prefs: KestrelPrefs,
) : LibraryRepository {
    private val dao: LibraryDao = database.libraryDao()
    private val json = Json { ignoreUnknownKeys = true }

    override val items: Flow<List<LibraryItemWithContent>> =
        dao.observeLibraryItems().map { records -> records.map(LibraryItemRecord::toDomain) }

    override val sortMode: Flow<FavoritesSortMode> = prefs.favoritesSortMode

    override suspend fun addPlace(
        name: String,
        lat: Double,
        lng: Double,
        description: String?,
        tags: List<String>,
    ): String {
        val rows =
            buildPlaceLibraryRows(
                name = name,
                lat = lat,
                lng = lng,
                description = description,
                tags = tags,
                sortOrder = (dao.getMaxSortOrder() ?: -1) + 1,
                now = System.currentTimeMillis(),
                uuidFactory = { UUID.randomUUID().toString() },
            )
        database.withTransaction {
            dao.insertPlaceWithLibraryItem(place = rows.place, item = rows.item)
            val record = checkNotNull(dao.getLibraryItem(rows.item.id))
            upsertPendingPlaceChange(
                record = record,
                type = uploadChangeTypeNameForPlaceMutation(record.item.remoteId),
                updatedAt = rows.item.updatedAt,
            )
        }
        return rows.item.id
    }

    override suspend fun addRoute(
        name: String,
        waypoints: List<LatLng>,
        defaultSpeedKmh: Double,
        mode: String,
        description: String?,
    ): String {
        val rows =
            buildRouteLibraryRows(
                name = name,
                waypoints = waypoints,
                defaultSpeedKmh = defaultSpeedKmh,
                mode = mode,
                description = description,
                sortOrder = (dao.getMaxSortOrder() ?: -1) + 1,
                now = System.currentTimeMillis(),
                uuidFactory = { UUID.randomUUID().toString() },
            )
        dao.insertRouteWithLibraryItem(
            route = rows.route,
            revision = rows.revision,
            waypoints = rows.waypoints,
            item = rows.item,
        )
        return rows.item.id
    }

    override suspend fun getItem(itemId: String): LibraryItemWithContent? = dao.getLibraryItem(itemId)?.toDomain()

    override suspend fun renameItem(
        itemId: String,
        newName: String,
    ) {
        val trimmedName = normalizedLibraryItemName(newName) ?: return
        val record = dao.getLibraryItem(itemId) ?: return
        val updatedAt = System.currentTimeMillis()
        database.withTransaction {
            when (record.item.kind) {
                LibraryItemKind.Place ->
                    record.item.placeId?.let {
                        dao.renamePlace(it, trimmedName, updatedAt)
                        markPlaceDirty(record.item.id, updatedAt)
                    }
                LibraryItemKind.Route -> record.item.routeId?.let { dao.renameRoute(it, trimmedName, updatedAt) }
            }
        }
    }

    override suspend fun updatePlace(
        placeId: String,
        lat: Double,
        lng: Double,
    ) {
        val updatedAt = System.currentTimeMillis()
        database.withTransaction {
            dao.updatePlace(placeId, lat, lng, updatedAt)
            val record = dao.getLibraryItemsSnapshot().firstOrNull { it.placeId == placeId }
            if (record != null) {
                markPlaceDirty(record.id, updatedAt)
            }
        }
    }

    override suspend fun updateRouteParams(
        routeId: String,
        speedKmh: Double,
        mode: String,
    ) {
        dao.updateRoute(routeId, speedKmh, mode, System.currentTimeMillis())
    }

    @Suppress("TooGenericExceptionCaught")
    override suspend fun removeItem(itemId: String) {
        val record = dao.getLibraryItem(itemId) ?: return
        val startupPreference = prefs.startupPreferenceValue()
        val shouldResetStartupPreference = isStartupFavoriteItem(startupPreference, itemId)
        if (shouldResetStartupPreference) {
            // Move the cross-store preference first so a successful delete can never leave a
            // dangling startup reference. A database failure restores the previous preference.
            prefs.setStartupPreference(StartupPreference(StartupPreference.Mode.Last))
        }
        try {
            database.withTransaction {
                when (record.item.kind) {
                    LibraryItemKind.Place ->
                        record.item.placeId?.let {
                            if (record.item.remoteId == null) {
                                dao.deletePendingSyncChangesForItem(record.item.id)
                                dao.deletePlace(it)
                            } else {
                                val updatedAt = System.currentTimeMillis()
                                upsertPendingPlaceChange(
                                    record = record,
                                    type = CloudPlaceUploadChangeTypes.DELETE,
                                    updatedAt = updatedAt,
                                )
                                dao.updatePlaceSyncStatus(it, SyncStatus.Deleted, updatedAt)
                                dao.updateLibraryItemSyncStatus(record.item.id, SyncStatus.Deleted, updatedAt)
                            }
                        }
                    LibraryItemKind.Route -> record.item.routeId?.let { dao.deleteRoute(it) }
                }
            }
        } catch (error: Exception) {
            if (shouldResetStartupPreference) {
                withContext(NonCancellable) {
                    runCatching { prefs.setStartupPreference(startupPreference) }
                }
            }
            throw error
        }
    }

    override suspend fun reorderItem(
        itemId: String,
        toIndex: Int,
    ) {
        database.withTransaction {
            val reordered = reorderLibraryItems(dao.getLibraryItemsSnapshot(), itemId, toIndex)
            if (reordered.isNotEmpty()) {
                dao.upsertLibraryItems(reordered)
            }
        }
    }

    override suspend fun touchItem(itemId: String) {
        val touch = touchLibraryItemValues(System.currentTimeMillis())
        dao.touchLibraryItem(itemId, touch.lastUsedAt, touch.updatedAt)
    }

    override suspend fun setSortMode(mode: FavoritesSortMode.Mode) {
        prefs.setFavoritesSortMode(mode)
    }

    private suspend fun markPlaceDirty(
        itemId: String,
        updatedAt: Long,
    ) {
        val record = dao.getLibraryItem(itemId) ?: return
        val nextStatus = syncStatusForPlaceMutation(record.item.remoteId)
        record.item.placeId?.let { dao.updatePlaceSyncStatus(it, nextStatus, updatedAt) }
        dao.updateLibraryItemSyncStatus(record.item.id, nextStatus, updatedAt)
        val updatedRecord = dao.getLibraryItem(itemId) ?: return
        upsertPendingPlaceChange(
            record = updatedRecord,
            type = uploadChangeTypeNameForPlaceMutation(record.item.remoteId),
            updatedAt = updatedAt,
        )
    }

    private suspend fun upsertPendingPlaceChange(
        record: LibraryItemRecord,
        type: String,
        updatedAt: Long,
    ) {
        val payload = record.toPendingPlaceSyncPayload() ?: return
        val existing = dao.getPendingSyncChangeForItem(record.item.id)
        val createdAt = existing?.createdAt ?: updatedAt
        dao.upsertPendingSyncChanges(
            listOf(
                PendingSyncChangeEntity(
                    id = existing?.id ?: record.item.id,
                    libraryItemId = record.item.id,
                    clientMutationId = existing?.clientMutationId ?: randomUuid(),
                    type = preserveCreateType(existing?.type, type),
                    baseVersion = existing?.baseVersion ?: record.item.remoteVersion,
                    payloadJson = json.encodeToString(payload),
                    createdAt = createdAt,
                    updatedAt = updatedAt,
                ),
            ),
        )
        dao.deleteSyncConflictsForItem(record.item.id)
    }
}

private object CloudPlaceUploadChangeTypes {
    const val CREATE = "PLACE_CREATE"
    const val DELETE = "PLACE_DELETE"
}

private fun preserveCreateType(
    existingType: String?,
    nextType: String,
): String =
    if (existingType == CloudPlaceUploadChangeTypes.CREATE && nextType != CloudPlaceUploadChangeTypes.DELETE) {
        CloudPlaceUploadChangeTypes.CREATE
    } else {
        nextType
    }

private fun randomUuid(): String = UUID.randomUUID().toString()

internal data class LibraryItemTouchValues(
    val lastUsedAt: Long,
    val updatedAt: Long,
)

internal fun normalizedLibraryItemName(newName: String): String? = newName.trim().takeIf { it.isNotEmpty() }

internal fun isStartupFavoriteItem(
    startupPreference: StartupPreference,
    itemId: String,
): Boolean =
    startupPreference.mode == StartupPreference.Mode.Favorite &&
        startupPreference.libraryItemId == itemId

internal fun touchLibraryItemValues(now: Long): LibraryItemTouchValues =
    LibraryItemTouchValues(
        lastUsedAt = now,
        updatedAt = now,
    )

internal data class PlaceLibraryRows(
    val place: PlaceEntity,
    val item: LibraryItemEntity,
)

internal data class RouteLibraryRows(
    val route: RouteEntity,
    val revision: RouteRevisionEntity,
    val waypoints: List<WaypointEntity>,
    val item: LibraryItemEntity,
)

internal fun buildPlaceLibraryRows(
    name: String,
    lat: Double,
    lng: Double,
    description: String?,
    tags: List<String>,
    sortOrder: Int,
    now: Long,
    uuidFactory: () -> String,
): PlaceLibraryRows {
    val placeId = uuidFactory()
    val itemId = uuidFactory()
    return PlaceLibraryRows(
        place =
            PlaceEntity(
                id = placeId,
                name = name,
                lat = lat,
                lng = lng,
                description = description,
                tags = tags,
                createdAt = now,
                updatedAt = now,
            ),
        item =
            LibraryItemEntity(
                id = itemId,
                kind = LibraryItemKind.Place,
                placeId = placeId,
                sortOrder = sortOrder,
                createdAt = now,
                updatedAt = now,
            ),
    )
}

internal fun buildRouteLibraryRows(
    name: String,
    waypoints: List<LatLng>,
    defaultSpeedKmh: Double,
    mode: String,
    description: String?,
    sortOrder: Int,
    now: Long,
    uuidFactory: () -> String,
): RouteLibraryRows {
    val routeId = uuidFactory()
    val revisionId = uuidFactory()
    val itemId = uuidFactory()
    return RouteLibraryRows(
        route =
            RouteEntity(
                id = routeId,
                name = name,
                description = description,
                defaultSpeedKmh = defaultSpeedKmh,
                mode = mode,
                currentRevisionId = revisionId,
                createdAt = now,
                updatedAt = now,
            ),
        revision =
            RouteRevisionEntity(
                id = revisionId,
                routeId = routeId,
                revisionNumber = 1,
                createdAt = now,
            ),
        waypoints = buildWaypointEntities(revisionId, waypoints, uuidFactory),
        item =
            LibraryItemEntity(
                id = itemId,
                kind = LibraryItemKind.Route,
                routeId = routeId,
                sortOrder = sortOrder,
                createdAt = now,
                updatedAt = now,
            ),
    )
}

internal fun buildWaypointEntities(
    routeRevisionId: String,
    waypoints: List<LatLng>,
    uuidFactory: () -> String,
): List<WaypointEntity> =
    waypoints.mapIndexed { index, waypoint ->
        WaypointEntity(
            id = uuidFactory(),
            routeRevisionId = routeRevisionId,
            sequence = index,
            lat = waypoint.lat,
            lng = waypoint.lng,
        )
    }

internal fun reorderLibraryItems(
    items: List<LibraryItemEntity>,
    itemId: String,
    toIndex: Int,
): List<LibraryItemEntity> {
    val fromIndex = items.indexOfFirst { it.id == itemId }
    if (fromIndex < 0 || items.isEmpty()) return emptyList()
    val clampedIndex = toIndex.coerceIn(0, items.lastIndex)
    if (clampedIndex == fromIndex) return emptyList()
    val reordered = items.toMutableList()
    val item = reordered.removeAt(fromIndex)
    reordered.add(clampedIndex, item)
    return reordered.mapIndexed { index, current -> current.copy(sortOrder = index) }
}
