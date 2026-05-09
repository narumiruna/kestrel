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
import dev.narumi.kestrel.core.library.db.PlaceEntity
import dev.narumi.kestrel.core.library.db.RouteEntity
import dev.narumi.kestrel.core.library.db.RouteRevisionEntity
import dev.narumi.kestrel.core.library.db.WaypointEntity
import dev.narumi.kestrel.core.library.migration.FavoriteToLibraryMigrator
import dev.narumi.kestrel.core.location.LatLng
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.UUID

interface LibraryRepository {
    val items: Flow<List<LibraryItemWithContent>>
    val sortMode: Flow<FavoritesSortMode>

    suspend fun ensureMigrated()

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

    suspend fun renameItem(itemId: String, newName: String)

    suspend fun updatePlace(placeId: String, lat: Double, lng: Double)

    suspend fun updateRouteParams(routeId: String, speedKmh: Double, mode: String)

    suspend fun removeItem(itemId: String)

    suspend fun reorderItem(itemId: String, toIndex: Int)

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

    override val items: Flow<List<LibraryItemWithContent>> =
        dao.observeLibraryItems().map { records -> records.map(LibraryItemRecord::toDomain) }

    override val sortMode: Flow<FavoritesSortMode> = prefs.favoritesSortMode

    override suspend fun ensureMigrated() {
        if (prefs.libraryRoomMigratedValue()) {
            resolveLegacyStartupPreference()
            return
        }

        val startup = prefs.startupPreferenceValue()
        val migration =
            if (dao.countLibraryItems() == 0) {
                FavoriteToLibraryMigrator.migrate(
                    favorites = prefs.legacyFavoritesValue(),
                    startupPreference = startup,
                )
            } else {
                null
            }
        database.withTransaction {
            if (migration != null) {
                migration.rows.forEach { row ->
                    row.place?.let(dao::insertPlace)
                    row.route?.let(dao::insertRoute)
                    row.routeRevision?.let(dao::insertRouteRevision)
                    if (row.waypoints.isNotEmpty()) {
                        dao.insertWaypoints(row.waypoints)
                    }
                    dao.insertLibraryItem(row.libraryItem)
                }
            }
        }
        val startupLibraryItemId =
            migration?.startupLibraryItemId
                ?: startup.libraryItemId
                ?: startup.favoriteName?.let(dao::findLibraryItemIdByName)
        updateStartupPreference(startupLibraryItemId)
        prefs.setLibraryRoomMigrated(true)
    }

    override suspend fun addPlace(
        name: String,
        lat: Double,
        lng: Double,
        description: String?,
        tags: List<String>,
    ): String {
        ensureMigrated()
        val now = System.currentTimeMillis()
        val placeId = UUID.randomUUID().toString()
        val itemId = UUID.randomUUID().toString()
        val sortOrder = (dao.getMaxSortOrder() ?: -1) + 1
        database.withTransaction {
            dao.insertPlace(
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
            )
            dao.insertLibraryItem(
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
        return itemId
    }

    override suspend fun addRoute(
        name: String,
        waypoints: List<LatLng>,
        defaultSpeedKmh: Double,
        mode: String,
        description: String?,
    ): String {
        ensureMigrated()
        val now = System.currentTimeMillis()
        val routeId = UUID.randomUUID().toString()
        val revisionId = UUID.randomUUID().toString()
        val itemId = UUID.randomUUID().toString()
        val sortOrder = (dao.getMaxSortOrder() ?: -1) + 1
        database.withTransaction {
            dao.insertRoute(
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
            )
            dao.insertRouteRevision(
                RouteRevisionEntity(
                    id = revisionId,
                    routeId = routeId,
                    revisionNumber = 1,
                    createdAt = now,
                ),
            )
            dao.insertWaypoints(
                waypoints.mapIndexed { index, waypoint ->
                    WaypointEntity(
                        id = UUID.randomUUID().toString(),
                        routeRevisionId = revisionId,
                        sequence = index,
                        lat = waypoint.lat,
                        lng = waypoint.lng,
                    )
                },
            )
            dao.insertLibraryItem(
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
        return itemId
    }

    override suspend fun getItem(itemId: String): LibraryItemWithContent? {
        ensureMigrated()
        return dao.getLibraryItem(itemId)?.toDomain()
    }

    override suspend fun renameItem(itemId: String, newName: String) {
        ensureMigrated()
        val trimmedName = newName.trim()
        if (trimmedName.isEmpty()) return
        val record = dao.getLibraryItem(itemId) ?: return
        val updatedAt = System.currentTimeMillis()
        database.withTransaction {
            when (record.item.kind) {
                LibraryItemKind.Place -> record.item.placeId?.let { dao.renamePlace(it, trimmedName, updatedAt) }
                LibraryItemKind.Route -> record.item.routeId?.let { dao.renameRoute(it, trimmedName, updatedAt) }
            }
            val startup = prefs.startupPreferenceValue()
            if (startup.mode == StartupPreference.Mode.Favorite && startup.libraryItemId == itemId) {
                prefs.setStartupPreference(startup.copy(favoriteName = trimmedName))
            }
        }
    }

    override suspend fun updatePlace(placeId: String, lat: Double, lng: Double) {
        ensureMigrated()
        dao.updatePlace(placeId, lat, lng, System.currentTimeMillis())
    }

    override suspend fun updateRouteParams(routeId: String, speedKmh: Double, mode: String) {
        ensureMigrated()
        dao.updateRoute(routeId, speedKmh, mode, System.currentTimeMillis())
    }

    override suspend fun removeItem(itemId: String) {
        ensureMigrated()
        val record = dao.getLibraryItem(itemId) ?: return
        database.withTransaction {
            when (record.item.kind) {
                LibraryItemKind.Place -> record.item.placeId?.let(dao::deletePlace)
                LibraryItemKind.Route -> record.item.routeId?.let(dao::deleteRoute)
            }
            val startup = prefs.startupPreferenceValue()
            if (startup.mode == StartupPreference.Mode.Favorite && startup.libraryItemId == itemId) {
                prefs.setStartupPreference(StartupPreference(StartupPreference.Mode.Last))
            }
        }
    }

    override suspend fun reorderItem(itemId: String, toIndex: Int) {
        ensureMigrated()
        database.withTransaction {
            val reordered = reorderLibraryItems(dao.getLibraryItemsSnapshot(), itemId, toIndex)
            if (reordered.isNotEmpty()) {
                dao.upsertLibraryItems(reordered)
            }
        }
    }

    override suspend fun touchItem(itemId: String) {
        ensureMigrated()
        val now = System.currentTimeMillis()
        dao.touchLibraryItem(itemId, now, now)
    }

    override suspend fun setSortMode(mode: FavoritesSortMode.Mode) {
        prefs.setFavoritesSortMode(mode)
    }

    private suspend fun resolveLegacyStartupPreference() {
        val startup = prefs.startupPreferenceValue()
        if (startup.libraryItemId != null || startup.favoriteName == null) return
        updateStartupPreference(dao.findLibraryItemIdByName(startup.favoriteName))
    }

    private suspend fun updateStartupPreference(libraryItemId: String?) {
        val startup = prefs.startupPreferenceValue()
        if (startup.mode != StartupPreference.Mode.Favorite && libraryItemId == null) return
        prefs.setStartupPreference(
            startup.copy(
                libraryItemId = libraryItemId,
                favoriteName = startup.favoriteName,
            ),
        )
    }
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

internal fun LibraryItemRecord.toDomain(): LibraryItemWithContent {
    val placeDomain = place?.toDomain()
    val routeDomain = route?.route?.toDomain()
    val revisionDomain = route?.currentRevision?.toDomain()
    val waypointDomains = route?.waypoints.orEmpty().map(WaypointEntity::toDomain).sortedBy { it.sequence }
    return LibraryItemWithContent(
        item = item.toDomain(),
        name = placeDomain?.name ?: routeDomain?.name.orEmpty(),
        kind = item.kind,
        place = placeDomain,
        route = routeDomain,
        currentRevision = revisionDomain,
        waypoints = waypointDomains,
    )
}

internal fun LibraryItemEntity.toDomain(): LibraryItem =
    LibraryItem(
        id = id,
        remoteId = remoteId,
        kind = kind,
        placeId = placeId,
        routeId = routeId,
        sortOrder = sortOrder,
        lastUsedAt = lastUsedAt,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

internal fun PlaceEntity.toDomain(): Place =
    Place(
        id = id,
        remoteId = remoteId,
        name = name,
        lat = lat,
        lng = lng,
        description = description,
        tags = tags,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

internal fun RouteEntity.toDomain(): Route =
    Route(
        id = id,
        remoteId = remoteId,
        name = name,
        description = description,
        defaultSpeedKmh = defaultSpeedKmh,
        mode = mode,
        currentRevisionId = currentRevisionId,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

internal fun RouteRevisionEntity.toDomain(): RouteRevision =
    RouteRevision(
        id = id,
        remoteId = remoteId,
        routeId = routeId,
        revisionNumber = revisionNumber,
        createdAt = createdAt,
    )

internal fun WaypointEntity.toDomain(): Waypoint =
    Waypoint(
        id = id,
        routeRevisionId = routeRevisionId,
        sequence = sequence,
        lat = lat,
        lng = lng,
        speedKmh = speedKmh,
        pauseSeconds = pauseSeconds,
    )
