package dev.narumi.kestrel.core.library.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
@Suppress("TooManyFunctions")
abstract class LibraryDao {
    @Transaction
    @Query("SELECT * FROM library_items ORDER BY sort_order ASC, created_at ASC")
    abstract fun observeLibraryItems(): Flow<List<LibraryItemRecord>>

    @Transaction
    @Query("SELECT * FROM library_items WHERE kind = 'Place' ORDER BY sort_order ASC, created_at ASC")
    abstract fun observePlaceLibraryItems(): Flow<List<LibraryItemRecord>>

    @Transaction
    @Query("SELECT * FROM library_items WHERE kind = 'Route' ORDER BY sort_order ASC, created_at ASC")
    abstract fun observeRouteLibraryItems(): Flow<List<LibraryItemRecord>>

    @Transaction
    @Query("SELECT * FROM library_items WHERE id = :itemId")
    abstract suspend fun getLibraryItem(itemId: String): LibraryItemRecord?

    @Transaction
    @Query("SELECT * FROM library_items WHERE id = :itemId")
    abstract suspend fun getStartupLibraryItem(itemId: String): LibraryItemRecord?

    @Transaction
    @Query("SELECT * FROM library_items WHERE kind = 'Place' AND sync_status IN ('LocalOnly', 'Dirty', 'Deleted')")
    abstract suspend fun getPendingPlaceUploadRecords(): List<LibraryItemRecord>

    @Query("SELECT * FROM library_items ORDER BY sort_order ASC, created_at ASC")
    abstract suspend fun getLibraryItemsSnapshot(): List<LibraryItemEntity>

    @Query("SELECT MAX(sort_order) FROM library_items")
    abstract suspend fun getMaxSortOrder(): Int?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertPlace(place: PlaceEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertRoute(route: RouteEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertRouteRevision(revision: RouteRevisionEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertWaypoints(waypoints: List<WaypointEntity>)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertLibraryItem(item: LibraryItemEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun upsertSyncStates(states: List<SyncStateEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun upsertPendingSyncChanges(changes: List<PendingSyncChangeEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun upsertSyncConflicts(conflicts: List<SyncConflictEntity>)

    @Query("SELECT * FROM pending_sync_changes ORDER BY created_at ASC")
    abstract suspend fun getPendingSyncChanges(): List<PendingSyncChangeEntity>

    @Query("SELECT * FROM pending_sync_changes WHERE library_item_id = :libraryItemId LIMIT 1")
    abstract suspend fun getPendingSyncChangeForItem(libraryItemId: String): PendingSyncChangeEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun upsertPlaces(places: List<PlaceEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun upsertRoutes(routes: List<RouteEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun upsertRouteRevisions(revisions: List<RouteRevisionEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun upsertLibraryItems(items: List<LibraryItemEntity>)

    @Transaction
    open suspend fun insertPlaceWithLibraryItem(
        place: PlaceEntity,
        item: LibraryItemEntity,
    ) {
        insertPlace(place)
        insertLibraryItem(item)
    }

    @Transaction
    open suspend fun insertRouteWithLibraryItem(
        route: RouteEntity,
        revision: RouteRevisionEntity,
        waypoints: List<WaypointEntity>,
        item: LibraryItemEntity,
    ) {
        insertRoute(route)
        insertRouteRevision(revision)
        insertWaypoints(waypoints)
        insertLibraryItem(item)
    }

    @Query("UPDATE places SET name = :newName, updated_at = :updatedAt WHERE id = :placeId")
    abstract suspend fun renamePlace(
        placeId: String,
        newName: String,
        updatedAt: Long,
    )

    @Query("UPDATE routes SET name = :newName, updated_at = :updatedAt WHERE id = :routeId")
    abstract suspend fun renameRoute(
        routeId: String,
        newName: String,
        updatedAt: Long,
    )

    @Query("UPDATE places SET lat = :lat, lng = :lng, updated_at = :updatedAt WHERE id = :placeId")
    abstract suspend fun updatePlace(
        placeId: String,
        lat: Double,
        lng: Double,
        updatedAt: Long,
    )

    @Query(
        "UPDATE routes SET default_speed_kmh = :speedKmh, mode = :mode, updated_at = :updatedAt WHERE id = :routeId",
    )
    abstract suspend fun updateRoute(
        routeId: String,
        speedKmh: Double,
        mode: String,
        updatedAt: Long,
    )

    @Query("UPDATE library_items SET last_used_at = :lastUsedAt, updated_at = :updatedAt WHERE id = :itemId")
    abstract suspend fun touchLibraryItem(
        itemId: String,
        lastUsedAt: Long,
        updatedAt: Long,
    )

    @Query("UPDATE library_items SET sort_order = :sortOrder, updated_at = :updatedAt WHERE id = :itemId")
    abstract suspend fun updateLibraryItemSortOrder(
        itemId: String,
        sortOrder: Int,
        updatedAt: Long,
    )

    @Query("UPDATE places SET remote_id = :remoteId, sync_status = 'Synced' WHERE id = :placeId")
    abstract suspend fun markPlaceUploaded(
        placeId: String,
        remoteId: String,
    )

    @Query(
        """
        UPDATE library_items
        SET remote_id = :remoteId, remote_version = :remoteVersion, sync_status = 'Synced', updated_at = :updatedAt
        WHERE id = :itemId
        """,
    )
    abstract suspend fun markLibraryItemUploaded(
        itemId: String,
        remoteId: String,
        remoteVersion: Int,
        updatedAt: Long,
    )

    @Query("UPDATE library_items SET sync_status = :syncStatus, updated_at = :updatedAt WHERE id = :itemId")
    abstract suspend fun updateLibraryItemSyncStatus(
        itemId: String,
        syncStatus: SyncStatus,
        updatedAt: Long,
    )

    @Query("UPDATE places SET sync_status = :syncStatus, updated_at = :updatedAt WHERE id = :placeId")
    abstract suspend fun updatePlaceSyncStatus(
        placeId: String,
        syncStatus: SyncStatus,
        updatedAt: Long,
    )

    @Query("DELETE FROM pending_sync_changes WHERE library_item_id = :libraryItemId")
    abstract suspend fun deletePendingSyncChangesForItem(libraryItemId: String)

    @Query("DELETE FROM sync_conflicts WHERE library_item_id = :libraryItemId")
    abstract suspend fun deleteSyncConflictsForItem(libraryItemId: String)

    @Query("SELECT * FROM sync_state WHERE key IN (:keys)")
    abstract suspend fun getSyncStates(keys: List<String>): List<SyncStateEntity>

    @Query("SELECT * FROM sync_state WHERE key IN (:keys)")
    abstract fun observeSyncStates(keys: List<String>): Flow<List<SyncStateEntity>>

    @Query("SELECT id FROM places WHERE remote_id = :remoteId LIMIT 1")
    abstract suspend fun findPlaceIdByRemoteId(remoteId: String): String?

    @Query("SELECT id FROM routes WHERE remote_id = :remoteId LIMIT 1")
    abstract suspend fun findRouteIdByRemoteId(remoteId: String): String?

    @Query("SELECT id FROM route_revisions WHERE remote_id = :remoteId LIMIT 1")
    abstract suspend fun findRouteRevisionIdByRemoteId(remoteId: String): String?

    @Query("SELECT id FROM library_items WHERE remote_id = :remoteId LIMIT 1")
    abstract suspend fun findLibraryItemIdByRemoteId(remoteId: String): String?

    @Query("DELETE FROM waypoints WHERE route_revision_id = :routeRevisionId")
    abstract suspend fun deleteWaypointsForRouteRevision(routeRevisionId: String)

    @Query("DELETE FROM route_revisions WHERE route_id = :routeId AND id != :keepRevisionId AND remote_id IS NOT NULL")
    abstract suspend fun deleteSyncedRouteRevisionsForRouteExcept(
        routeId: String,
        keepRevisionId: String,
    )

    @Query("DELETE FROM route_revisions WHERE remote_id = :remoteId")
    abstract suspend fun deleteRouteRevisionByRemoteId(remoteId: String)

    @Query("DELETE FROM sync_state WHERE key = :key")
    abstract suspend fun deleteSyncState(key: String)

    @Query("DELETE FROM library_items WHERE id = :itemId")
    abstract suspend fun deleteLibraryItem(itemId: String)

    @Query("DELETE FROM library_items WHERE remote_id = :remoteId")
    abstract suspend fun deleteLibraryItemByRemoteId(remoteId: String)

    @Query("DELETE FROM library_items WHERE sync_status = 'Synced'")
    abstract suspend fun deleteAllSyncedLibraryItems()

    @Query("DELETE FROM library_items WHERE sync_status = 'Synced' AND remote_id NOT IN (:remoteIds)")
    abstract suspend fun deleteSyncedLibraryItemsNotIn(remoteIds: List<String>)

    @Query("DELETE FROM places WHERE id = :placeId")
    abstract suspend fun deletePlace(placeId: String)

    @Query("DELETE FROM places WHERE remote_id = :remoteId")
    abstract suspend fun deletePlaceByRemoteId(remoteId: String)

    @Query("DELETE FROM places WHERE sync_status = 'Synced'")
    abstract suspend fun deleteAllSyncedPlaces()

    @Query("DELETE FROM places WHERE sync_status = 'Synced' AND remote_id NOT IN (:remoteIds)")
    abstract suspend fun deleteSyncedPlacesNotIn(remoteIds: List<String>)

    @Query("DELETE FROM routes WHERE id = :routeId")
    abstract suspend fun deleteRoute(routeId: String)

    @Query("DELETE FROM routes WHERE remote_id = :remoteId")
    abstract suspend fun deleteRouteByRemoteId(remoteId: String)

    @Query("DELETE FROM routes WHERE sync_status = 'Synced'")
    abstract suspend fun deleteAllSyncedRoutes()

    @Query("DELETE FROM routes WHERE sync_status = 'Synced' AND remote_id NOT IN (:remoteIds)")
    abstract suspend fun deleteSyncedRoutesNotIn(remoteIds: List<String>)

    @Query("DELETE FROM route_revisions WHERE remote_id IS NOT NULL")
    abstract suspend fun deleteAllSyncedRouteRevisions()

    @Query("DELETE FROM route_revisions WHERE remote_id IS NOT NULL AND remote_id NOT IN (:remoteIds)")
    abstract suspend fun deleteSyncedRouteRevisionsNotIn(remoteIds: List<String>)
}
