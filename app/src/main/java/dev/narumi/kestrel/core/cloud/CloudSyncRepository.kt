package dev.narumi.kestrel.core.cloud

import android.content.Context
import androidx.room.withTransaction
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.library.PendingPlaceSyncPayload
import dev.narumi.kestrel.core.library.buildPlaceLibraryRows
import dev.narumi.kestrel.core.library.db.KestrelDatabase
import dev.narumi.kestrel.core.library.db.LibraryDao
import dev.narumi.kestrel.core.library.db.PendingSyncChangeEntity
import dev.narumi.kestrel.core.library.db.SyncConflictEntity
import dev.narumi.kestrel.core.library.db.SyncStateEntity
import dev.narumi.kestrel.core.library.toPendingPlaceSyncPayload
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID

private val CLOUD_SYNC_STATE_KEYS =
    listOf(
        SyncStateKeys.CURSOR,
        SyncStateKeys.LAST_SYNCED_AT,
        SyncStateKeys.LAST_ERROR,
        SyncStateKeys.USER_ID,
    )

data class CloudSyncState(
    val cursor: String? = null,
    val lastSyncedAt: Long? = null,
    val lastError: CloudMessage? = null,
    val userId: String? = null,
)

data class CloudPlaceConflict(
    val id: String,
    val libraryItemId: String,
    val baseVersion: Int?,
    val remoteVersion: Int,
    val localName: String,
    val localDescription: String?,
    val localLatitude: Double,
    val localLongitude: Double,
    val cloudName: String,
    val cloudDescription: String?,
    val cloudLatitude: Double,
    val cloudLongitude: Double,
)

internal fun CloudSyncState.requiresBootstrapFor(
    sessionUserId: String,
    hasSyncedContentMissingLibraryItems: Boolean = false,
): Boolean = cursor == null || userId != sessionUserId || hasSyncedContentMissingLibraryItems

internal fun collectCloudLibraryItems(
    places: List<CloudPlacePayload>,
    routes: List<CloudRoutePayload>,
    libraryItems: List<CloudLibraryItemPayload>,
): List<CloudLibraryItemPayload> =
    buildMap {
        libraryItems.forEach { item -> put(item.id, item) }
        places.mapNotNull(CloudPlacePayload::libraryItem).forEach { item -> putIfAbsent(item.id, item) }
        routes
            .filter { route -> route.currentRevision != null }
            .mapNotNull(CloudRoutePayload::libraryItem)
            .forEach { item -> putIfAbsent(item.id, item) }
    }.values.toList()

@Suppress("TooManyFunctions")
class CloudSyncRepository internal constructor(
    private val database: KestrelDatabase,
    private val authRepository: CloudSyncSessionProvider,
    private val apiClient: CloudSyncApi,
    private val uuidFactory: () -> String = ::randomUuid,
) {
    private val dao: LibraryDao = database.libraryDao()
    private val json = Json { ignoreUnknownKeys = true }
    private val syncMutex = Mutex()

    val syncState: Flow<CloudSyncState> =
        dao.observeSyncStates(CLOUD_SYNC_STATE_KEYS).map { states -> states.toCloudSyncState() }

    val placeConflicts: Flow<List<CloudPlaceConflict>> =
        dao.observeSyncConflicts().map { conflicts -> conflicts.mapNotNull(::toPlaceConflict) }

    suspend fun syncNow() {
        syncMutex.withLock {
            val failure = runCatching { syncInternal() }.exceptionOrNull()
            if (failure != null) {
                handleSyncFailure(failure)
            }
        }
    }

    suspend fun syncOnForeground() {
        if (authRepository.currentSession() == null) {
            return
        }

        runCatching {
            syncNow()
        }
    }

    suspend fun resolveConflictUseCloud(conflictId: String) {
        database.withTransaction {
            val conflict = dao.getSyncConflict(conflictId) ?: return@withTransaction
            if (applyCloudConflictSnapshot(conflict)) {
                dao.deletePendingSyncChangesForItem(conflict.libraryItemId)
                dao.deleteSyncConflictsForItem(conflict.libraryItemId)
            }
        }
    }

    suspend fun resolveConflictUseLocal(conflictId: String) {
        database.withTransaction {
            val conflict = dao.getSyncConflict(conflictId) ?: return@withTransaction
            val pendingChange = dao.getPendingSyncChangeForItem(conflict.libraryItemId) ?: return@withTransaction
            dao.upsertPendingSyncChanges(
                listOf(
                    pendingChange.copy(
                        clientMutationId = uuidFactory(),
                        baseVersion = conflict.remoteVersion,
                        updatedAt = System.currentTimeMillis(),
                    ),
                ),
            )
            dao.deleteSyncConflictsForItem(conflict.libraryItemId)
        }
        syncNow()
    }

    suspend fun resolveConflictKeepBoth(conflictId: String) {
        database.withTransaction {
            val conflict = dao.getSyncConflict(conflictId) ?: return@withTransaction
            val localSnapshot = conflict.decodeLocalSnapshotOrNull() ?: return@withTransaction
            if (applyCloudConflictSnapshot(conflict)) {
                duplicateLocalPlaceSnapshot(localSnapshot)
                dao.deletePendingSyncChangesForItem(conflict.libraryItemId)
                dao.deleteSyncConflictsForItem(conflict.libraryItemId)
            }
        }
    }

    private suspend fun syncInternal() {
        val session = requireSession()
        val state = loadSyncState()
        val hasSyncedContentMissingLibraryItems = dao.countSyncedContentMissingLibraryItems() > 0
        if (state.requiresBootstrapFor(session.userId, hasSyncedContentMissingLibraryItems)) {
            bootstrap()
        } else {
            changes(checkNotNull(state.cursor))
        }
        val uploadError = uploadPendingPlaceChanges()
        finishSyncAfterUpload(
            uploadError = uploadError,
            fetchChanges = { loadSyncState().cursor?.let { changes(it) } },
            storeError = ::storeSyncError,
        )
    }

    private suspend fun bootstrap() {
        val session = requireSession()
        val response = withAuthorizedSession { apiClient.bootstrap(it.accessToken) }
        database.withTransaction {
            val existingState = loadSyncState()
            if (existingState.userId != null && existingState.userId != session.userId) {
                clearAllSyncedRows()
            }

            applyCloudUpserts(response.places, response.routes, response.libraryItems)

            pruneMissingSyncedRows(
                placeRemoteIds = response.places.map(CloudPlacePayload::id),
                routeRemoteIds = response.routes.map(CloudRoutePayload::id),
                routeRevisionRemoteIds = response.routes.mapNotNull { it.currentRevision?.id },
                libraryItemRemoteIds = response.libraryItems.map(CloudLibraryItemPayload::id),
            )
            storeSyncSuccess(
                cursor = response.syncCursor,
                serverTime = response.serverTime,
                userId = session.userId,
            )
        }
    }

    private suspend fun changes(cursor: String) {
        val session = requireSession()
        try {
            val response = withAuthorizedSession { apiClient.getChanges(it.accessToken, cursor) }
            database.withTransaction {
                applyCloudUpserts(response.places, response.routes, response.libraryItems)

                response.deletions.forEach { deletion ->
                    when (deletion.entityType) {
                        CloudSyncEntityType.PLACE -> dao.deletePlaceByRemoteId(deletion.entityId)
                        CloudSyncEntityType.ROUTE -> dao.deleteRouteByRemoteId(deletion.entityId)
                        CloudSyncEntityType.ROUTE_REVISION -> dao.deleteRouteRevisionByRemoteId(deletion.entityId)
                        CloudSyncEntityType.LIBRARY_ITEM -> dao.deleteLibraryItemByRemoteId(deletion.entityId)
                        CloudSyncEntityType.DEVICE_STATE -> Unit
                    }
                }

                storeSyncSuccess(
                    cursor = response.nextCursor,
                    serverTime = response.serverTime,
                    userId = session.userId,
                )
            }
        } catch (error: CloudApiException) {
            recoverSyncCursor(error) {
                database.withTransaction {
                    dao.deleteSyncState(SyncStateKeys.CURSOR)
                }
                bootstrap()
            }
        }
    }

    // Runs inside the caller's transaction; bootstrap pruning and delta deletions stay separate.
    private suspend fun applyCloudUpserts(
        places: List<CloudPlacePayload>,
        routes: List<CloudRoutePayload>,
        libraryItems: List<CloudLibraryItemPayload>,
    ) {
        val resolvedPlaceIds = mutableMapOf<String, String>()
        val resolvedRouteIds = mutableMapOf<String, String>()
        val placeEntities =
            places.map { place ->
                val localId = dao.findPlaceIdByRemoteId(place.id) ?: uuidFactory()
                resolvedPlaceIds[place.id] = localId
                place.toPlaceEntity(localId)
            }
        if (placeEntities.isNotEmpty()) {
            dao.upsertPlaces(placeEntities)
        }

        val routeRows = mutableListOf<CloudRouteSyncRows>()
        routes.forEach { route ->
            val currentRevision = route.currentRevision ?: return@forEach
            val localRouteId = dao.findRouteIdByRemoteId(route.id) ?: uuidFactory()
            val localRevisionId = dao.findRouteRevisionIdByRemoteId(currentRevision.id) ?: uuidFactory()
            resolvedRouteIds[route.id] = localRouteId
            routeRows +=
                route.toRouteSyncRows(
                    routeId = localRouteId,
                    revisionId = localRevisionId,
                    waypointIdFactory = uuidFactory,
                )
        }
        upsertRouteRows(routeRows)

        val libraryItemEntities =
            buildLibraryItemEntities(
                places = places,
                routes = routes,
                libraryItems = libraryItems,
                resolvedPlaceIds = resolvedPlaceIds,
                resolvedRouteIds = resolvedRouteIds,
            )
        if (libraryItemEntities.isNotEmpty()) {
            dao.upsertLibraryItems(libraryItemEntities)
        }
    }

    private suspend fun uploadPendingPlaceChanges(): CloudMessage? {
        val pendingChanges = dao.getPendingSyncChanges().filter { it.type.startsWith("PLACE_") }
        val uploadChanges = pendingChanges.mapNotNull(::toUploadChange)
        if (uploadChanges.isEmpty()) {
            return null
        }

        val response = withAuthorizedSession { apiClient.upload(it.accessToken, CloudSyncUploadRequest(uploadChanges)) }
        database.withTransaction {
            response.uploaded.forEach { uploaded -> applyUploadedPlace(pendingChanges, uploaded) }
            response.conflicts.forEach { conflict -> persistConflict(pendingChanges, conflict) }
        }
        return if (response.failed.isNotEmpty()) CloudMessage(CloudMessageId.SyncUploadFailed) else null
    }

    private suspend fun applyUploadedPlace(
        pendingChanges: List<PendingSyncChangeEntity>,
        uploaded: CloudSyncUploadUploadedResult,
    ) {
        val pendingChange = pendingChanges.firstOrNull { it.clientMutationId == uploaded.clientMutationId } ?: return
        val place = uploaded.place
        val libraryItem = uploaded.libraryItem

        if (place == null || libraryItem == null) {
            if (pendingChange.type == CloudSyncUploadChangeType.PLACE_DELETE.name) {
                dao.deletePendingSyncChangesForItem(pendingChange.libraryItemId)
                dao.deleteSyncConflictsForItem(pendingChange.libraryItemId)
            }
            return
        }

        val localItemId = dao.findLibraryItemIdByRemoteId(libraryItem.id) ?: pendingChange.libraryItemId
        val localPlaceId = dao.findPlaceIdByRemoteId(place.id) ?: dao.getLibraryItem(localItemId)?.item?.placeId
        if (localPlaceId == null) {
            return
        }

        dao.markPlaceUploaded(localPlaceId, place.id)
        dao.markLibraryItemUploaded(
            itemId = localItemId,
            remoteId = libraryItem.id,
            remoteVersion = libraryItem.version,
            updatedAt = libraryItem.updatedAt.toEpochMillis(),
        )
        dao.deletePendingSyncChangesForItem(localItemId)
        dao.deleteSyncConflictsForItem(localItemId)
    }

    private suspend fun persistConflict(
        pendingChanges: List<PendingSyncChangeEntity>,
        conflict: CloudSyncUploadConflictResult,
    ) {
        val pendingChange = pendingChanges.firstOrNull { it.clientMutationId == conflict.clientMutationId } ?: return
        val cloudLibraryItem = conflict.cloudLibraryItem ?: return
        dao.upsertSyncConflicts(
            listOf(
                SyncConflictEntity(
                    id = conflict.clientMutationId,
                    libraryItemId = pendingChange.libraryItemId,
                    pendingChangeId = pendingChange.id,
                    kind = "Place",
                    baseVersion = pendingChange.baseVersion,
                    remoteVersion = cloudLibraryItem.version,
                    localSnapshotJson = pendingChange.payloadJson,
                    cloudSnapshotJson = json.encodeToString(conflict),
                    createdAt = System.currentTimeMillis(),
                ),
            ),
        )
    }

    private suspend fun applyCloudConflictSnapshot(conflict: SyncConflictEntity): Boolean {
        val cloudConflict = conflict.decodeCloudSnapshotOrNull()
        val cloudPlace = cloudConflict?.cloudPlace
        val cloudLibraryItem = cloudConflict?.cloudLibraryItem
        val localPlaceId =
            cloudPlace?.let { place ->
                dao.getLibraryItem(conflict.libraryItemId)?.item?.placeId ?: dao.findPlaceIdByRemoteId(place.id)
            }
        return if (cloudPlace == null || cloudLibraryItem == null || localPlaceId == null) {
            false
        } else {
            dao.upsertPlaces(listOf(cloudPlace.toPlaceEntity(localPlaceId)))
            dao.upsertLibraryItems(
                listOf(
                    cloudLibraryItem.toLibraryItemEntity(
                        localId = conflict.libraryItemId,
                        localPlaceId = localPlaceId,
                        localRouteId = null,
                    ),
                ),
            )
            true
        }
    }

    private suspend fun duplicateLocalPlaceSnapshot(localSnapshot: PendingPlaceSyncPayload) {
        val now = System.currentTimeMillis()
        val rows =
            buildPlaceLibraryRows(
                name = localSnapshot.name,
                lat = localSnapshot.latitude,
                lng = localSnapshot.longitude,
                description = localSnapshot.description,
                tags = localSnapshot.tags,
                sortOrder = (dao.getMaxSortOrder() ?: -1) + 1,
                now = now,
                uuidFactory = uuidFactory,
            )
        dao.insertPlaceWithLibraryItem(rows.place, rows.item)
        val record = dao.getLibraryItem(rows.item.id) ?: return
        val payload = record.toPendingPlaceSyncPayload() ?: return
        dao.upsertPendingSyncChanges(
            listOf(
                PendingSyncChangeEntity(
                    id = rows.item.id,
                    libraryItemId = rows.item.id,
                    clientMutationId = uuidFactory(),
                    type = CloudSyncUploadChangeType.PLACE_CREATE.name,
                    payloadJson = json.encodeToString(payload),
                    createdAt = now,
                    updatedAt = now,
                ),
            ),
        )
    }

    private fun toUploadChange(change: PendingSyncChangeEntity): CloudSyncUploadChange? {
        val payload = change.decodePayloadOrNull() ?: return null
        val type = change.type.toCloudSyncUploadChangeTypeOrNull() ?: return null
        return CloudSyncUploadChange(
            clientMutationId = change.clientMutationId,
            expectedVersion = change.baseVersion,
            place =
                if (type == CloudSyncUploadChangeType.PLACE_DELETE) {
                    null
                } else {
                    CloudSyncUploadPlace(
                        description = payload.description,
                        latitude = payload.latitude,
                        longitude = payload.longitude,
                        name = payload.name,
                        tags = payload.tags,
                    )
                },
            remoteLibraryItemId = payload.remoteLibraryItemId,
            remotePlaceId = payload.remotePlaceId,
            type = type,
        )
    }

    private fun PendingSyncChangeEntity.decodePayloadOrNull(): PendingPlaceSyncPayload? = decodePlacePayloadOrNull(payloadJson)

    private fun SyncConflictEntity.decodeLocalSnapshotOrNull(): PendingPlaceSyncPayload? = decodePlacePayloadOrNull(localSnapshotJson)

    private fun SyncConflictEntity.decodeCloudSnapshotOrNull(): CloudSyncUploadConflictResult? =
        try {
            json.decodeFromString<CloudSyncUploadConflictResult>(cloudSnapshotJson)
        } catch (_: SerializationException) {
            null
        }

    private fun decodePlacePayloadOrNull(payloadJson: String): PendingPlaceSyncPayload? =
        try {
            json.decodeFromString<PendingPlaceSyncPayload>(payloadJson)
        } catch (_: SerializationException) {
            null
        }

    private fun toPlaceConflict(conflict: SyncConflictEntity): CloudPlaceConflict? {
        val local = conflict.decodeLocalSnapshotOrNull() ?: return null
        val cloud = conflict.decodeCloudSnapshotOrNull()?.cloudPlace ?: return null
        return CloudPlaceConflict(
            id = conflict.id,
            libraryItemId = conflict.libraryItemId,
            baseVersion = conflict.baseVersion,
            remoteVersion = conflict.remoteVersion,
            localName = local.name,
            localDescription = local.description,
            localLatitude = local.latitude,
            localLongitude = local.longitude,
            cloudName = cloud.name,
            cloudDescription = cloud.description,
            cloudLatitude = cloud.latitude,
            cloudLongitude = cloud.longitude,
        )
    }

    private fun String.toCloudSyncUploadChangeTypeOrNull(): CloudSyncUploadChangeType? = runCatching { CloudSyncUploadChangeType.valueOf(this) }.getOrNull()

    private suspend fun buildLibraryItemEntities(
        places: List<CloudPlacePayload>,
        routes: List<CloudRoutePayload>,
        libraryItems: List<CloudLibraryItemPayload>,
        resolvedPlaceIds: Map<String, String>,
        resolvedRouteIds: Map<String, String>,
    ) = collectCloudLibraryItems(places, routes, libraryItems).map { item ->
        val localId = dao.findLibraryItemIdByRemoteId(item.id) ?: uuidFactory()
        item.toLibraryItemEntity(
            localId = localId,
            localPlaceId = resolveLocalPlaceId(item.placeId, resolvedPlaceIds),
            localRouteId = resolveLocalRouteId(item.routeId, resolvedRouteIds),
        )
    }

    private suspend fun upsertRouteRows(routeRows: List<CloudRouteSyncRows>) {
        if (routeRows.isEmpty()) {
            return
        }

        routeRows.forEach { rows ->
            dao.upsertRoutes(listOf(rows.route))
            dao.upsertRouteRevisions(listOf(rows.revision))
            dao.deleteWaypointsForRouteRevision(rows.revision.id)
            if (rows.waypoints.isNotEmpty()) {
                dao.insertWaypoints(rows.waypoints)
            }
            dao.deleteSyncedRouteRevisionsForRouteExcept(rows.route.id, rows.revision.id)
        }
    }

    private suspend fun clearAllSyncedRows() {
        dao.deleteAllSyncedLibraryItems()
        dao.deleteAllSyncedPlaces()
        dao.deleteAllSyncedRoutes()
        dao.deleteAllSyncedRouteRevisions()
    }

    private suspend fun pruneMissingSyncedRows(
        placeRemoteIds: List<String>,
        routeRemoteIds: List<String>,
        routeRevisionRemoteIds: List<String>,
        libraryItemRemoteIds: List<String>,
    ) {
        if (libraryItemRemoteIds.isEmpty()) {
            dao.deleteAllSyncedLibraryItems()
        } else {
            dao.deleteSyncedLibraryItemsNotIn(libraryItemRemoteIds)
        }

        if (placeRemoteIds.isEmpty()) {
            dao.deleteAllSyncedPlaces()
        } else {
            dao.deleteSyncedPlacesNotIn(placeRemoteIds)
        }

        if (routeRemoteIds.isEmpty()) {
            dao.deleteAllSyncedRoutes()
        } else {
            dao.deleteSyncedRoutesNotIn(routeRemoteIds)
        }

        if (routeRevisionRemoteIds.isEmpty()) {
            dao.deleteAllSyncedRouteRevisions()
        } else {
            dao.deleteSyncedRouteRevisionsNotIn(routeRevisionRemoteIds)
        }
    }

    private suspend fun resolveLocalPlaceId(
        remoteId: String?,
        resolvedPlaceIds: Map<String, String>,
    ): String? {
        if (remoteId == null) {
            return null
        }

        return resolvedPlaceIds[remoteId]
            ?: dao.findPlaceIdByRemoteId(remoteId)
            ?: error("Missing local place for remote id $remoteId")
    }

    private suspend fun resolveLocalRouteId(
        remoteId: String?,
        resolvedRouteIds: Map<String, String>,
    ): String? {
        if (remoteId == null) {
            return null
        }

        return resolvedRouteIds[remoteId]
            ?: dao.findRouteIdByRemoteId(remoteId)
            ?: error("Missing local route for remote id $remoteId")
    }

    private suspend fun <T> withAuthorizedSession(block: suspend (CloudSession) -> T): T = withAuthorizedSession(authRepository, requireSession(), block)

    private fun requireSession(): CloudSession = authRepository.currentSession() ?: throw CloudMessageException(CloudMessage(CloudMessageId.SignInRequired))

    private suspend fun loadSyncState(): CloudSyncState = dao.getSyncStates(CLOUD_SYNC_STATE_KEYS).toCloudSyncState()

    private suspend fun storeSyncSuccess(
        cursor: String,
        serverTime: String,
        userId: String,
    ) {
        dao.upsertSyncStates(
            listOf(
                SyncStateEntity(SyncStateKeys.CURSOR, cursor),
                SyncStateEntity(SyncStateKeys.LAST_SYNCED_AT, serverTime.toEpochMillis().toString()),
                SyncStateEntity(SyncStateKeys.USER_ID, userId),
                SyncStateEntity(SyncStateKeys.LAST_ERROR, ""),
            ),
        )
    }

    private suspend fun storeSyncError(message: CloudMessage) {
        database.withTransaction {
            dao.upsertSyncStates(listOf(SyncStateEntity(SyncStateKeys.LAST_ERROR, message.toStoredSyncError())))
        }
    }

    private suspend fun handleSyncFailure(error: Throwable): Nothing {
        if (error is CancellationException) throw error
        storeSyncError(error.toCloudMessage(CloudErrorContext.Sync))
        throw error
    }

    companion object {
        @Volatile private var instance: CloudSyncRepository? = null

        fun getInstance(context: Context): CloudSyncRepository {
            val applicationContext = context.applicationContext
            return instance ?: synchronized(this) {
                instance
                    ?: CloudSyncRepository(
                        database = KestrelDatabase.getInstance(applicationContext),
                        authRepository = CloudAuthRepository.getInstance(applicationContext),
                        apiClient =
                            CloudApiClient(
                                baseUrlProvider = {
                                    KestrelPrefs(applicationContext).cloudSettingsValue().apiBaseUrl
                                },
                            ),
                    ).also { instance = it }
            }
        }
    }
}

private object SyncStateKeys {
    const val CURSOR = "cloud_sync_cursor"
    const val LAST_SYNCED_AT = "cloud_last_synced_at"
    const val LAST_ERROR = "cloud_last_error"
    const val USER_ID = "cloud_user_id"
}

private const val SYNC_CURSOR_EXPIRED_CODE = "SYNC_CURSOR_EXPIRED"

// A successful delta fetch clears the stored error. Retain a partial upload
// failure after that fetch, without changing its pending mutations or cursor.
internal suspend fun finishSyncAfterUpload(
    uploadError: CloudMessage?,
    fetchChanges: suspend () -> Unit,
    storeError: suspend (CloudMessage) -> Unit,
) {
    fetchChanges()
    if (uploadError != null) storeError(uploadError)
}

// /sync/changes has an uncoded 400 for invalid or ahead-of-server cursors. The
// cursor comes from sync state, not user input. Recover once through bootstrap;
// bootstrap errors propagate and never re-enter changes, so this cannot loop.
internal suspend fun recoverSyncCursor(
    error: CloudApiException,
    bootstrap: suspend () -> Unit,
) {
    if ((error.statusCode == 410 && error.code == SYNC_CURSOR_EXPIRED_CODE) || error.statusCode == 400) {
        bootstrap()
    } else {
        throw error
    }
}

private fun List<SyncStateEntity>.toCloudSyncState(): CloudSyncState {
    val values = associate { it.key to it.value }
    return CloudSyncState(
        cursor = values[SyncStateKeys.CURSOR]?.takeIf(String::isNotBlank),
        lastSyncedAt = values[SyncStateKeys.LAST_SYNCED_AT]?.toLongOrNull(),
        lastError = storedSyncError(values[SyncStateKeys.LAST_ERROR]),
        userId = values[SyncStateKeys.USER_ID]?.takeIf(String::isNotBlank),
    )
}

private fun randomUuid(): String = UUID.randomUUID().toString()
