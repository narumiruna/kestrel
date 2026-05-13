package dev.narumi.kestrel.core.cloud

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.narumi.kestrel.core.library.LibraryItemKind
import dev.narumi.kestrel.core.library.PendingPlaceSyncPayload
import dev.narumi.kestrel.core.library.db.KestrelDatabase
import dev.narumi.kestrel.core.library.db.LibraryItemEntity
import dev.narumi.kestrel.core.library.db.PendingSyncChangeEntity
import dev.narumi.kestrel.core.library.db.PlaceEntity
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
                uuidFactory = { "generated-id" },
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

    override suspend fun refreshSession(): CloudSession? = session
}

private class FakeCloudSyncApi : CloudSyncApi {
    val changeResponses = ArrayDeque<CloudChangesResponse>()
    val uploadRequests = mutableListOf<CloudSyncUploadRequest>()
    var uploadResponse: CloudSyncUploadResponse = CloudSyncUploadResponse(serverTime = SERVER_TIME)

    override suspend fun bootstrap(accessToken: String): CloudBootstrapResponse {
        error("bootstrap should not be called in these tests")
    }

    override suspend fun getChanges(
        accessToken: String,
        since: String,
    ): CloudChangesResponse =
        checkNotNull(changeResponses.removeFirstOrNull()) {
            "missing fake change response for since=$since"
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
