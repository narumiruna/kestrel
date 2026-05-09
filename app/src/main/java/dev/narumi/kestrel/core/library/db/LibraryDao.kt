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

    @Query("SELECT COUNT(*) FROM library_items")
    abstract suspend fun countLibraryItems(): Int

    @Query("SELECT * FROM library_items ORDER BY sort_order ASC, created_at ASC")
    abstract suspend fun getLibraryItemsSnapshot(): List<LibraryItemEntity>

    @Query(
        """
        SELECT library_items.id
        FROM library_items
        LEFT JOIN places ON places.id = library_items.place_id
        LEFT JOIN routes ON routes.id = library_items.route_id
        WHERE places.name = :name OR routes.name = :name
        ORDER BY library_items.sort_order ASC, library_items.created_at ASC
        LIMIT 1
        """,
    )
    abstract suspend fun findLibraryItemIdByName(name: String): String?

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

    @Insert(onConflict = OnConflictStrategy.ABORT)
    abstract suspend fun insertSyncStates(states: List<SyncStateEntity>)

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

    @Query("DELETE FROM library_items WHERE id = :itemId")
    abstract suspend fun deleteLibraryItem(itemId: String)

    @Query("DELETE FROM places WHERE id = :placeId")
    abstract suspend fun deletePlace(placeId: String)

    @Query("DELETE FROM routes WHERE id = :routeId")
    abstract suspend fun deleteRoute(routeId: String)
}
