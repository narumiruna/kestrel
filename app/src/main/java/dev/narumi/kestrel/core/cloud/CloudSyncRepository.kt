package dev.narumi.kestrel.core.cloud

import android.content.Context
import androidx.room.withTransaction
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.library.db.KestrelDatabase
import dev.narumi.kestrel.core.library.db.LibraryDao
import dev.narumi.kestrel.core.library.db.SyncStateEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.IOException
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
    val lastError: String? = null,
    val userId: String? = null,
)

class CloudSyncRepository private constructor(
    context: Context,
) {
    private val applicationContext = context.applicationContext
    private val database = KestrelDatabase.getInstance(applicationContext)
    private val dao: LibraryDao = database.libraryDao()
    private val prefs = KestrelPrefs(applicationContext)
    private val authRepository = CloudAuthRepository.getInstance(applicationContext)
    private val apiClient = CloudApiClient(baseUrlProvider = { prefs.cloudSettingsValue().apiBaseUrl })
    private val syncMutex = Mutex()

    val syncState: Flow<CloudSyncState> =
        dao.observeSyncStates(CLOUD_SYNC_STATE_KEYS).map { states -> states.toCloudSyncState() }

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

    private suspend fun syncInternal() {
        val state = loadSyncState()
        if (state.cursor == null) {
            bootstrap()
        } else {
            changes(state.cursor)
        }
    }

    private suspend fun bootstrap() {
        val session = requireSession()
        val response = withAuthorizedSession { apiClient.bootstrap(it.accessToken) }
        database.withTransaction {
            val existingState = loadSyncState()
            if (existingState.userId != null && existingState.userId != session.userId) {
                clearAllSyncedRows()
            }

            val resolvedPlaceIds = mutableMapOf<String, String>()
            val resolvedRouteIds = mutableMapOf<String, String>()
            val routeRows = mutableListOf<CloudRouteSyncRows>()

            val placeEntities =
                response.places.map { place ->
                    val localId = dao.findPlaceIdByRemoteId(place.id) ?: randomUuid()
                    resolvedPlaceIds[place.id] = localId
                    place.toPlaceEntity(localId)
                }
            if (placeEntities.isNotEmpty()) {
                dao.upsertPlaces(placeEntities)
            }

            response.routes.forEach { route ->
                val currentRevision = route.currentRevision ?: return@forEach
                val localRouteId = dao.findRouteIdByRemoteId(route.id) ?: randomUuid()
                val localRevisionId = dao.findRouteRevisionIdByRemoteId(currentRevision.id) ?: randomUuid()
                resolvedRouteIds[route.id] = localRouteId
                routeRows +=
                    route.toRouteSyncRows(
                        routeId = localRouteId,
                        revisionId = localRevisionId,
                        waypointIdFactory = ::randomUuid,
                    )
            }
            upsertRouteRows(routeRows)

            val libraryItemEntities =
                response.libraryItems.map { item ->
                    val localId = dao.findLibraryItemIdByRemoteId(item.id) ?: randomUuid()
                    item.toLibraryItemEntity(
                        localId = localId,
                        localPlaceId = resolveLocalPlaceId(item.placeId, resolvedPlaceIds),
                        localRouteId = resolveLocalRouteId(item.routeId, resolvedRouteIds),
                    )
                }
            if (libraryItemEntities.isNotEmpty()) {
                dao.upsertLibraryItems(libraryItemEntities)
            }

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
                val resolvedPlaceIds = mutableMapOf<String, String>()
                val resolvedRouteIds = mutableMapOf<String, String>()

                val placeEntities =
                    response.places.map { place ->
                        val localId = dao.findPlaceIdByRemoteId(place.id) ?: randomUuid()
                        resolvedPlaceIds[place.id] = localId
                        place.toPlaceEntity(localId)
                    }
                if (placeEntities.isNotEmpty()) {
                    dao.upsertPlaces(placeEntities)
                }

                val routeRows = mutableListOf<CloudRouteSyncRows>()
                response.routes.forEach { route ->
                    val currentRevision = route.currentRevision ?: return@forEach
                    val localRouteId = dao.findRouteIdByRemoteId(route.id) ?: randomUuid()
                    val localRevisionId = dao.findRouteRevisionIdByRemoteId(currentRevision.id) ?: randomUuid()
                    resolvedRouteIds[route.id] = localRouteId
                    routeRows +=
                        route.toRouteSyncRows(
                            routeId = localRouteId,
                            revisionId = localRevisionId,
                            waypointIdFactory = ::randomUuid,
                        )
                }
                upsertRouteRows(routeRows)

                val libraryItemEntities =
                    response.libraryItems.map { item ->
                        val localId = dao.findLibraryItemIdByRemoteId(item.id) ?: randomUuid()
                        item.toLibraryItemEntity(
                            localId = localId,
                            localPlaceId = resolveLocalPlaceId(item.placeId, resolvedPlaceIds),
                            localRouteId = resolveLocalRouteId(item.routeId, resolvedRouteIds),
                        )
                    }
                if (libraryItemEntities.isNotEmpty()) {
                    dao.upsertLibraryItems(libraryItemEntities)
                }

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
            if (error.isRecoverableCursorError()) {
                database.withTransaction {
                    dao.deleteSyncState(SyncStateKeys.CURSOR)
                }
                bootstrap()
                return
            }
            throw error
        }
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

    private suspend fun <T> withAuthorizedSession(block: suspend (CloudSession) -> T): T {
        val currentSession = requireSession()
        return try {
            block(currentSession)
        } catch (error: CloudApiException) {
            if (error.statusCode != 401) {
                throw error
            }
            val refreshedSession = authRepository.refreshSession() ?: error("Session expired. Please sign in again.")
            block(refreshedSession)
        }
    }

    private fun requireSession(): CloudSession = authRepository.currentSession() ?: error("Not signed in")

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

    private suspend fun storeSyncError(message: String) {
        database.withTransaction {
            dao.upsertSyncStates(listOf(SyncStateEntity(SyncStateKeys.LAST_ERROR, message)))
        }
    }

    private suspend fun handleSyncFailure(error: Throwable): Nothing {
        val message =
            when (error) {
                is CloudApiException -> error.message
                is IOException -> error.message ?: "Cloud sync failed"
                is IllegalStateException -> error.message ?: "Cloud sync failed"
                else -> "Cloud sync failed"
            }
        storeSyncError(message)
        throw error
    }

    companion object {
        @Volatile private var instance: CloudSyncRepository? = null

        fun getInstance(context: Context): CloudSyncRepository =
            instance ?: synchronized(this) {
                instance ?: CloudSyncRepository(context.applicationContext).also { instance = it }
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
private const val SYNC_CURSOR_AHEAD_MESSAGE = "since cursor is ahead of server state"

private fun CloudApiException.isRecoverableCursorError(): Boolean =
    (statusCode == 410 && code == SYNC_CURSOR_EXPIRED_CODE) ||
        (statusCode == 400 && message == SYNC_CURSOR_AHEAD_MESSAGE)

private fun List<SyncStateEntity>.toCloudSyncState(): CloudSyncState {
    val values = associate { it.key to it.value }
    return CloudSyncState(
        cursor = values[SyncStateKeys.CURSOR]?.takeIf(String::isNotBlank),
        lastSyncedAt = values[SyncStateKeys.LAST_SYNCED_AT]?.toLongOrNull(),
        lastError = values[SyncStateKeys.LAST_ERROR]?.takeIf(String::isNotBlank),
        userId = values[SyncStateKeys.USER_ID]?.takeIf(String::isNotBlank),
    )
}

private fun randomUuid(): String = UUID.randomUUID().toString()
