package dev.narumi.kestrel.core.cloud

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.narumi.kestrel.core.library.LibraryItemKind
import dev.narumi.kestrel.core.library.PendingPlaceSyncPayload
import dev.narumi.kestrel.core.library.db.KestrelDatabase
import dev.narumi.kestrel.core.library.db.LibraryItemEntity
import dev.narumi.kestrel.core.library.db.LibraryItemRecord
import dev.narumi.kestrel.core.library.db.PendingSyncChangeEntity
import dev.narumi.kestrel.core.library.db.PlaceEntity
import dev.narumi.kestrel.core.library.db.RouteEntity
import dev.narumi.kestrel.core.library.db.RouteRevisionEntity
import dev.narumi.kestrel.core.library.db.SyncStateEntity
import dev.narumi.kestrel.core.library.db.SyncStatus
import junit.framework.TestCase.assertNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CloudSyncRepositoryTest {
    private lateinit var database: KestrelDatabase
    private lateinit var repository: CloudSyncRepository
    private lateinit var authProvider: FakeCloudSyncSessionProvider
    private lateinit var api: FakeCloudSyncApi
    private val json = Json { ignoreUnknownKeys = true }
    private var nextId = 0

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        database =
            Room
                .inMemoryDatabaseBuilder(context, KestrelDatabase::class.java)
                .allowMainThreadQueries()
                .build()
        authProvider =
            FakeCloudSyncSessionProvider(
                CloudSession(
                    accessToken = "access-token",
                    accessTokenExpiresAt = 1_800_000_000_000,
                    refreshToken = "refresh-token",
                    sessionId = "session-1",
                    userId = "user-1",
                    username = "tester",
                ),
            )
        api = FakeCloudSyncApi()
        repository =
            CloudSyncRepository(
                database = database,
                authRepository = authProvider,
                apiClient = api,
                uuidFactory = { "generated-${++nextId}" },
            )
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun syncNow_uploadsLocalOnlyPlace_andBindsReturnedRemoteIds() =
        runBlocking {
            seedSyncCursor()
            seedPlace(
                place =
                    PlaceEntity(
                        id = "local-place-1",
                        name = "Local only place",
                        lat = 25.03,
                        lng = 121.56,
                        description = "Created on device",
                        tags = listOf("city"),
                        syncStatus = SyncStatus.LocalOnly,
                        createdAt = NOW,
                        updatedAt = NOW,
                    ),
                item =
                    LibraryItemEntity(
                        id = "local-item-1",
                        kind = LibraryItemKind.Place,
                        placeId = "local-place-1",
                        sortOrder = 0,
                        syncStatus = SyncStatus.LocalOnly,
                        createdAt = NOW,
                        updatedAt = NOW,
                    ),
            )
            seedPendingChange(
                PendingSyncChangeEntity(
                    id = "local-item-1",
                    libraryItemId = "local-item-1",
                    clientMutationId = "mutation-1",
                    type = CloudSyncUploadChangeType.PLACE_CREATE.name,
                    payloadJson =
                        json.encodeToString(
                            PendingPlaceSyncPayload(
                                description = "Created on device",
                                latitude = 25.03,
                                longitude = 121.56,
                                name = "Local only place",
                                tags = listOf("city"),
                            ),
                        ),
                    createdAt = NOW,
                    updatedAt = NOW,
                ),
            )
            api.changeResponses += emptyChangesResponse(nextCursor = "6")
            api.changeResponses += emptyChangesResponse(nextCursor = "7")
            api.uploadResponse =
                CloudSyncUploadResponse(
                    serverTime = SERVER_TIME,
                    uploaded =
                        listOf(
                            CloudSyncUploadUploadedResult(
                                clientMutationId = "mutation-1",
                                libraryItem =
                                    cloudLibraryItem(
                                        id = "remote-item-1",
                                        placeId = "remote-place-1",
                                        version = 3,
                                    ),
                                place = cloudPlace(id = "remote-place-1", name = "Local only place"),
                                status = "uploaded",
                            ),
                        ),
                )

            repository.syncNow()

            val record = database.libraryDao().getLibraryItem("local-item-1")
            requireNotNull(record)
            assertEquals("remote-item-1", record.item.remoteId)
            assertEquals(3, record.item.remoteVersion)
            assertEquals(SyncStatus.Synced, record.item.syncStatus)
            assertEquals("remote-place-1", record.place?.remoteId)
            assertEquals(SyncStatus.Synced, record.place?.syncStatus)
            assertNull(database.libraryDao().getPendingSyncChangeForItem("local-item-1"))
            assertTrue(
                database
                    .libraryDao()
                    .observeSyncConflicts()
                    .first()
                    .isEmpty(),
            )
            val uploadedChange =
                api.uploadRequests
                    .single()
                    .changes
                    .single()
            assertEquals(CloudSyncUploadChangeType.PLACE_CREATE, uploadedChange.type)
            assertEquals("mutation-1", uploadedChange.clientMutationId)
            assertNull(uploadedChange.remotePlaceId)
        }

    @Test
    fun syncNow_uploadsSyncedPlaceUpdate_andClearsPendingChange() =
        runBlocking {
            seedSyncCursor()
            seedPlace(
                place =
                    PlaceEntity(
                        id = "local-place-1",
                        remoteId = "remote-place-1",
                        name = "Dirty place",
                        lat = 25.03,
                        lng = 121.56,
                        description = "Local edit",
                        tags = listOf("city"),
                        syncStatus = SyncStatus.Dirty,
                        createdAt = NOW,
                        updatedAt = NOW,
                    ),
                item =
                    LibraryItemEntity(
                        id = "local-item-1",
                        remoteId = "remote-item-1",
                        kind = LibraryItemKind.Place,
                        placeId = "local-place-1",
                        sortOrder = 0,
                        syncStatus = SyncStatus.Dirty,
                        remoteVersion = 1,
                        createdAt = NOW,
                        updatedAt = NOW,
                    ),
            )
            seedPendingChange(
                PendingSyncChangeEntity(
                    id = "local-item-1",
                    libraryItemId = "local-item-1",
                    clientMutationId = "mutation-2",
                    type = CloudSyncUploadChangeType.PLACE_UPDATE.name,
                    baseVersion = 1,
                    payloadJson =
                        json.encodeToString(
                            PendingPlaceSyncPayload(
                                description = "Local edit",
                                latitude = 25.03,
                                longitude = 121.56,
                                name = "Dirty place",
                                remoteLibraryItemId = "remote-item-1",
                                remotePlaceId = "remote-place-1",
                                tags = listOf("city"),
                            ),
                        ),
                    createdAt = NOW,
                    updatedAt = NOW,
                ),
            )
            api.changeResponses += emptyChangesResponse(nextCursor = "8")
            api.changeResponses += emptyChangesResponse(nextCursor = "9")
            api.uploadResponse =
                CloudSyncUploadResponse(
                    serverTime = SERVER_TIME,
                    uploaded =
                        listOf(
                            CloudSyncUploadUploadedResult(
                                clientMutationId = "mutation-2",
                                libraryItem =
                                    cloudLibraryItem(
                                        id = "remote-item-1",
                                        placeId = "remote-place-1",
                                        version = 2,
                                    ),
                                place = cloudPlace(id = "remote-place-1", name = "Cloud place"),
                                status = "uploaded",
                            ),
                        ),
                )

            repository.syncNow()

            val record = database.libraryDao().getLibraryItem("local-item-1")
            requireNotNull(record)
            assertEquals("remote-item-1", record.item.remoteId)
            assertEquals(2, record.item.remoteVersion)
            assertEquals(SyncStatus.Synced, record.item.syncStatus)
            assertEquals("remote-place-1", record.place?.remoteId)
            assertEquals(SyncStatus.Synced, record.place?.syncStatus)
            assertNull(database.libraryDao().getPendingSyncChangeForItem("local-item-1"))
            val uploadedChange =
                api.uploadRequests
                    .single()
                    .changes
                    .single()
            assertEquals(CloudSyncUploadChangeType.PLACE_UPDATE, uploadedChange.type)
            assertEquals(1, uploadedChange.expectedVersion)
            assertEquals("remote-place-1", uploadedChange.remotePlaceId)
        }

    @Test
    fun syncNow_persistsConflictSnapshot_forDirtyPlaceUpload() =
        runBlocking {
            seedSyncCursor()
            seedPlace(
                place =
                    PlaceEntity(
                        id = "local-place-1",
                        remoteId = "remote-place-1",
                        name = "Dirty place",
                        lat = 25.03,
                        lng = 121.56,
                        description = "Local edit",
                        tags = listOf("city"),
                        syncStatus = SyncStatus.Dirty,
                        createdAt = NOW,
                        updatedAt = NOW,
                    ),
                item =
                    LibraryItemEntity(
                        id = "local-item-1",
                        remoteId = "remote-item-1",
                        kind = LibraryItemKind.Place,
                        placeId = "local-place-1",
                        sortOrder = 0,
                        syncStatus = SyncStatus.Dirty,
                        remoteVersion = 1,
                        createdAt = NOW,
                        updatedAt = NOW,
                    ),
            )
            seedPendingChange(
                PendingSyncChangeEntity(
                    id = "local-item-1",
                    libraryItemId = "local-item-1",
                    clientMutationId = "mutation-3",
                    type = CloudSyncUploadChangeType.PLACE_UPDATE.name,
                    baseVersion = 1,
                    payloadJson =
                        json.encodeToString(
                            PendingPlaceSyncPayload(
                                description = "Local edit",
                                latitude = 25.03,
                                longitude = 121.56,
                                name = "Dirty place",
                                remoteLibraryItemId = "remote-item-1",
                                remotePlaceId = "remote-place-1",
                                tags = listOf("city"),
                            ),
                        ),
                    createdAt = NOW,
                    updatedAt = NOW,
                ),
            )
            api.changeResponses += emptyChangesResponse(nextCursor = "8")
            api.changeResponses += emptyChangesResponse(nextCursor = "9")
            api.uploadResponse =
                CloudSyncUploadResponse(
                    serverTime = SERVER_TIME,
                    conflicts =
                        listOf(
                            CloudSyncUploadConflictResult(
                                clientMutationId = "mutation-3",
                                cloudLibraryItem =
                                    cloudLibraryItem(
                                        id = "remote-item-1",
                                        placeId = "remote-place-1",
                                        version = 2,
                                    ),
                                cloudPlace = cloudPlace(id = "remote-place-1", name = "Cloud place"),
                                reason = "remote version changed",
                                status = "conflict",
                            ),
                        ),
                )

            repository.syncNow()

            val conflict = database.libraryDao().getSyncConflict("mutation-3")
            assertNotNull(conflict)
            requireNotNull(conflict)
            assertEquals("local-item-1", conflict.libraryItemId)
            assertEquals(1, conflict.baseVersion)
            assertEquals(2, conflict.remoteVersion)
            assertEquals("local-item-1", conflict.pendingChangeId)
            assertNotNull(database.libraryDao().getPendingSyncChangeForItem("local-item-1"))
            val uploadedChange =
                api.uploadRequests
                    .single()
                    .changes
                    .single()
            assertEquals(CloudSyncUploadChangeType.PLACE_UPDATE, uploadedChange.type)
            assertEquals(1, uploadedChange.expectedVersion)
            assertEquals("remote-place-1", uploadedChange.remotePlaceId)
        }

    @Test
    fun syncNow_uploadsSyncedPlaceDelete_andClearsPendingChange() =
        runBlocking {
            seedSyncCursor()
            seedPlace(
                place =
                    PlaceEntity(
                        id = "local-place-1",
                        remoteId = "remote-place-1",
                        name = "Deleted place",
                        lat = 25.03,
                        lng = 121.56,
                        description = "Delete me",
                        tags = listOf("city"),
                        syncStatus = SyncStatus.Deleted,
                        createdAt = NOW,
                        updatedAt = NOW,
                    ),
                item =
                    LibraryItemEntity(
                        id = "local-item-1",
                        remoteId = "remote-item-1",
                        kind = LibraryItemKind.Place,
                        placeId = "local-place-1",
                        sortOrder = 0,
                        syncStatus = SyncStatus.Deleted,
                        remoteVersion = 3,
                        createdAt = NOW,
                        updatedAt = NOW,
                    ),
            )
            seedPendingChange(
                PendingSyncChangeEntity(
                    id = "local-item-1",
                    libraryItemId = "local-item-1",
                    clientMutationId = "mutation-4",
                    type = CloudSyncUploadChangeType.PLACE_DELETE.name,
                    baseVersion = 3,
                    payloadJson =
                        json.encodeToString(
                            PendingPlaceSyncPayload(
                                description = "Delete me",
                                latitude = 25.03,
                                longitude = 121.56,
                                name = "Deleted place",
                                remoteLibraryItemId = "remote-item-1",
                                remotePlaceId = "remote-place-1",
                                tags = listOf("city"),
                            ),
                        ),
                    createdAt = NOW,
                    updatedAt = NOW,
                ),
            )
            api.changeResponses += emptyChangesResponse(nextCursor = "10")
            api.changeResponses += emptyChangesResponse(nextCursor = "11")
            api.uploadResponse =
                CloudSyncUploadResponse(
                    serverTime = SERVER_TIME,
                    uploaded =
                        listOf(
                            CloudSyncUploadUploadedResult(
                                clientMutationId = "mutation-4",
                                status = "uploaded",
                            ),
                        ),
                )

            repository.syncNow()

            assertNull(database.libraryDao().getPendingSyncChangeForItem("local-item-1"))
            val uploadedChange =
                api.uploadRequests
                    .single()
                    .changes
                    .single()
            assertEquals(CloudSyncUploadChangeType.PLACE_DELETE, uploadedChange.type)
            assertEquals(3, uploadedChange.expectedVersion)
            assertEquals("remote-place-1", uploadedChange.remotePlaceId)
        }

    @Test
    fun syncNow_bootstrapAndChangesImportEquivalentRows() =
        runBlocking {
            val bootstrapRows = importFixture(bootstrap = true)
            database.clearAllTables() // This test owns an in-memory database only.
            nextId = 0
            val changesRows = importFixture(bootstrap = false)
            assertEquals(bootstrapRows, changesRows)
            assertEquals("local-place-1", database.libraryDao().findPlaceIdByRemoteId("remote-place-1"))
            assertEquals("local-route-1", database.libraryDao().findRouteIdByRemoteId("remote-route-1"))
            assertEquals("generated-2", database.libraryDao().findRouteRevisionIdByRemoteId("revision-2"))
            assertNull(database.libraryDao().findRouteRevisionIdByRemoteId("revision-1"))
            assertNull(database.libraryDao().findRouteIdByRemoteId("incomplete-route"))
            val route = changesRows.single { it.item.kind == LibraryItemKind.Route }.route!!
            assertEquals(listOf(0, 1), route.waypoints.map { it.sequence })
            assertEquals(listOf("generated-3", "generated-4"), route.waypoints.map { it.id })
            assertEquals(7.0, route.waypoints.first().speedKmh)
            assertEquals(2.0, route.waypoints.last().pauseSeconds)
            assertEquals(4, changesRows.single { it.item.remoteId == "remote-item-1" }.item.remoteVersion)
            assertEquals("7", repository.syncState.first().cursor)
        }

    @Test
    fun syncNow_changesImportsEmbeddedOnlyLibraryItems() =
        runBlocking {
            seedSyncCursor()
            val item = cloudLibraryItem("embedded-item", "embedded-place", 1)
            api.changeResponses +=
                CloudChangesResponse(
                    places = listOf(cloudPlace("embedded-place", "Embedded").copy(libraryItem = item)),
                    nextCursor = "6",
                    serverTime = SERVER_TIME,
                )
            api.changeResponses += emptyChangesResponse("7")
            repository.syncNow()
            assertNotNull(database.libraryDao().findLibraryItemIdByRemoteId("embedded-item"))
        }

    @Test
    fun syncNow_bootstrapRetainsItsExplicitItemPruningBoundary() =
        runBlocking {
            val item = cloudLibraryItem("embedded-item", "embedded-place", 1)
            api.bootstrapResponse =
                CloudBootstrapResponse(
                    places = listOf(cloudPlace("embedded-place", "Embedded").copy(libraryItem = item)),
                    syncCursor = "6",
                    serverTime = SERVER_TIME,
                )
            api.changeResponses += emptyChangesResponse("7")
            repository.syncNow()
            // Bootstrap currently prunes against explicit libraryItems, unlike a delta.
            assertNull(database.libraryDao().findLibraryItemIdByRemoteId("embedded-item"))
            assertNotNull(database.libraryDao().findPlaceIdByRemoteId("embedded-place"))
        }

    @Test
    fun syncNow_importFailureRollsBackRowsAndDoesNotAdvanceCursor() =
        runBlocking {
            for (bootstrap in listOf(true, false)) {
                database.clearAllTables()
                seedExistingImportRows()
                seedSyncCursor()
                if (bootstrap) database.libraryDao().deleteSyncState("cloud_sync_cursor")
                val response =
                    importResponse().copy(
                        routes = listOf(importResponse().routes.first().copy(createdAt = "invalid timestamp")),
                    )
                enqueueImport(response, bootstrap)
                val before = librarySnapshot()
                assertTrue(runCatching { repository.syncNow() }.isFailure)
                assertEquals(before, librarySnapshot())
                assertEquals(if (bootstrap) null else "5", repository.syncState.first().cursor)
                assertNull(database.libraryDao().findPlaceIdByRemoteId("remote-place-2"))
                api.changeResponses.clear()
            }
        }

    @Test
    fun syncNow_bootstrapClearsOldAccountSyncedRowsButKeepsLocalRows() =
        runBlocking {
            seedExistingImportRows()
            seedPlace(
                PlaceEntity(id = "local-only", name = "Local", lat = 25.0, lng = 121.0, createdAt = NOW, updatedAt = NOW),
                LibraryItemEntity(id = "local-only-item", kind = LibraryItemKind.Place, placeId = "local-only", sortOrder = 9, createdAt = NOW, updatedAt = NOW),
            )
            database.libraryDao().upsertSyncStates(listOf(SyncStateEntity("cloud_user_id", "previous-user")))
            enqueueImport(CloudBootstrapResponse(syncCursor = "6", serverTime = SERVER_TIME), bootstrap = true)
            repository.syncNow()
            assertEquals(listOf("local-only-item"), librarySnapshot().map { it.item.id })
            assertNull(database.libraryDao().findRouteIdByRemoteId("remote-route-1"))
            assertEquals("user-1", repository.syncState.first().userId)
        }

    @Test
    fun syncNow_recoversRejectedCursorsThroughBootstrap() =
        runBlocking {
            val expectedRows = importFixture(bootstrap = true)
            val cursorErrors =
                listOf(
                    CloudApiException(statusCode = 410, code = "SYNC_CURSOR_EXPIRED", message = "cursor expired"),
                    CloudApiException(statusCode = 400, message = "since cursor is ahead of server state"),
                )
            for (error in cursorErrors) {
                database.clearAllTables()
                nextId = 0
                seedExistingImportRows()
                seedSyncCursor()
                api.requestedCursors.clear()
                api.changeFailure = error
                enqueueImport(importResponse(), bootstrap = true)

                repository.syncNow()

                assertEquals(expectedRows, librarySnapshot())
                assertEquals(listOf("5", "6"), api.requestedCursors)
                assertEquals("7", repository.syncState.first().cursor)
                assertNull(repository.syncState.first().lastError)
            }
        }

    @Test
    fun syncNow_changesApplyDeletionAfterUpserts() =
        runBlocking {
            seedSyncCursor()
            api.changeResponses +=
                CloudChangesResponse(
                    places = listOf(cloudPlace("deleted-place", "Deleted")),
                    libraryItems = listOf(cloudLibraryItem("deleted-item", "deleted-place", 1)),
                    deletions = listOf(CloudDeletionPayload(entityId = "deleted-place", entityType = CloudSyncEntityType.PLACE)),
                    nextCursor = "6",
                    serverTime = SERVER_TIME,
                )
            api.changeResponses += emptyChangesResponse("7")
            repository.syncNow()
            assertTrue(librarySnapshot().isEmpty())
            assertNull(database.libraryDao().findPlaceIdByRemoteId("deleted-place"))
            assertEquals("7", repository.syncState.first().cursor)
        }

    private suspend fun importFixture(bootstrap: Boolean): List<LibraryItemRecord> {
        seedExistingImportRows()
        if (!bootstrap) seedSyncCursor()
        enqueueImport(importResponse(), bootstrap)
        repository.syncNow()
        return librarySnapshot()
    }

    private fun enqueueImport(
        response: CloudBootstrapResponse,
        bootstrap: Boolean,
    ) {
        if (bootstrap) {
            api.bootstrapResponse = response
        } else {
            api.changeResponses +=
                CloudChangesResponse(
                    places = response.places,
                    routes = response.routes,
                    libraryItems = response.libraryItems,
                    nextCursor = response.syncCursor,
                    serverTime = response.serverTime,
                )
        }
        api.changeResponses += emptyChangesResponse("7")
    }

    private suspend fun librarySnapshot(): List<LibraryItemRecord> =
        database.libraryDao().getLibraryItemsSnapshot().sortedBy { it.remoteId ?: it.id }.map {
            checkNotNull(database.libraryDao().getLibraryItem(it.id))
        }

    private suspend fun seedExistingImportRows() {
        seedPlace(
            cloudPlace("remote-place-1", "Before").toPlaceEntity("local-place-1"),
            cloudLibraryItem("remote-item-1", "remote-place-1", 1).toLibraryItemEntity("local-item-1", "local-place-1", null),
        )
        database.libraryDao().insertRouteWithLibraryItem(
            route = RouteEntity(id = "local-route-1", remoteId = "remote-route-1", name = "Before", defaultSpeedKmh = 5.0, mode = "Once", currentRevisionId = "local-revision-1", syncStatus = SyncStatus.Synced, createdAt = NOW, updatedAt = NOW),
            revision = RouteRevisionEntity(id = "local-revision-1", remoteId = "revision-1", routeId = "local-route-1", revisionNumber = 1, createdAt = NOW),
            waypoints = emptyList(),
            item = LibraryItemEntity(id = "local-route-item", remoteId = "remote-route-item", kind = LibraryItemKind.Route, routeId = "local-route-1", sortOrder = 2, syncStatus = SyncStatus.Synced, createdAt = NOW, updatedAt = NOW),
        )
    }

    private fun importResponse(): CloudBootstrapResponse {
        val placeItem = cloudLibraryItem("remote-item-1", "remote-place-1", 4)
        val routeItem = CloudLibraryItemPayload(createdAt = SERVER_TIME, id = "remote-route-item", kind = CloudLibraryItemKind.ROUTE, routeId = "remote-route-1", sortOrder = 2, updatedAt = SERVER_TIME)
        val route =
            CloudRoutePayload(
                createdAt = SERVER_TIME,
                id = "remote-route-1",
                name = "Route",
                defaultSpeedKmh = 5.0,
                mode = CloudRouteMode.ONCE,
                updatedAt = SERVER_TIME,
                libraryItem = routeItem,
                currentRevision =
                    CloudRouteRevisionPayload(
                        createdAt = SERVER_TIME,
                        createdBy = "user-1",
                        defaultSpeedKmh = 8.0,
                        id = "revision-2",
                        mode = CloudRouteMode.LOOP,
                        revisionNumber = 2,
                        waypoints =
                            listOf(
                                CloudWaypointPayload(latitude = 26.0, longitude = 122.0, sequence = 1, pauseSeconds = 2.0),
                                CloudWaypointPayload(latitude = 25.0, longitude = 121.0, sequence = 0, speedKmh = 7.0),
                            ),
                    ),
            )
        return CloudBootstrapResponse(
            places = listOf(cloudPlace("remote-place-1", "After").copy(libraryItem = placeItem.copy(version = 99)), cloudPlace("remote-place-2", "New")),
            routes = listOf(route, route.copy(id = "incomplete-route", currentRevision = null, libraryItem = routeItem.copy(id = "incomplete-item", routeId = "incomplete-route"))),
            libraryItems = listOf(placeItem, cloudLibraryItem("remote-item-2", "remote-place-2", 1), routeItem),
            syncCursor = "6",
            serverTime = SERVER_TIME,
        )
    }

    private suspend fun seedSyncCursor() {
        database.libraryDao().upsertSyncStates(
            listOf(
                SyncStateEntity("cloud_sync_cursor", "5"),
                SyncStateEntity("cloud_user_id", "user-1"),
            ),
        )
    }

    private suspend fun seedPlace(
        place: PlaceEntity,
        item: LibraryItemEntity,
    ) {
        database.libraryDao().insertPlaceWithLibraryItem(place, item)
    }

    private suspend fun seedPendingChange(change: PendingSyncChangeEntity) {
        database.libraryDao().upsertPendingSyncChanges(listOf(change))
    }
}

private class FakeCloudSyncSessionProvider(
    private var session: CloudSession?,
) : CloudSyncSessionProvider {
    override fun currentSession(): CloudSession? = session

    override suspend fun refreshSessionIfCurrent(expectedSession: CloudSession): CloudSession? = session
}

private class FakeCloudSyncApi : CloudSyncApi {
    val changeResponses = ArrayDeque<CloudChangesResponse>()
    val requestedCursors = mutableListOf<String>()
    var changeFailure: CloudApiException? = null
    val uploadRequests = mutableListOf<CloudSyncUploadRequest>()
    var uploadResponse: CloudSyncUploadResponse = CloudSyncUploadResponse(serverTime = SERVER_TIME)
    var bootstrapResponse: CloudBootstrapResponse? = null

    override suspend fun bootstrap(accessToken: String): CloudBootstrapResponse = checkNotNull(bootstrapResponse) { "unexpected bootstrap" }

    override suspend fun getChanges(
        accessToken: String,
        since: String,
    ): CloudChangesResponse {
        requestedCursors += since
        changeFailure?.let { error ->
            changeFailure = null
            throw error
        }
        return checkNotNull(changeResponses.removeFirstOrNull()) {
            "missing fake change response for since=$since"
        }
    }

    override suspend fun upload(
        accessToken: String,
        request: CloudSyncUploadRequest,
    ): CloudSyncUploadResponse {
        uploadRequests += request
        return uploadResponse
    }
}

private fun emptyChangesResponse(nextCursor: String) =
    CloudChangesResponse(
        nextCursor = nextCursor,
        serverTime = SERVER_TIME,
    )

private fun cloudPlace(
    id: String,
    name: String,
) = CloudPlacePayload(
    createdAt = SERVER_TIME,
    id = id,
    latitude = 25.03,
    longitude = 121.56,
    name = name,
    updatedAt = SERVER_TIME,
)

private fun cloudLibraryItem(
    id: String,
    placeId: String,
    version: Int,
) = CloudLibraryItemPayload(
    createdAt = SERVER_TIME,
    id = id,
    kind = CloudLibraryItemKind.PLACE,
    placeId = placeId,
    sortOrder = 0,
    updatedAt = SERVER_TIME,
    version = version,
)

private const val NOW = 1_715_000_000_000L
private const val SERVER_TIME = "2026-05-13T12:00:00.000Z"
