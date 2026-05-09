package dev.narumi.kestrel.core.library.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface LibraryDao {
    @Transaction
    @Query("SELECT * FROM library_items ORDER BY sort_order ASC, created_at ASC")
    fun observeLibraryItems(): Flow<List<LibraryItemRecord>>

    @Transaction
    @Query("SELECT * FROM library_items WHERE id = :itemId")
    suspend fun getLibraryItem(itemId: String): LibraryItemRecord?

    @Query("SELECT COUNT(*) FROM library_items")
    suspend fun countLibraryItems(): Int

    @Query("SELECT * FROM library_items ORDER BY sort_order ASC, created_at ASC")
    suspend fun getLibraryItemsSnapshot(): List<LibraryItemEntity>

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
    suspend fun findLibraryItemIdByName(name: String): String?

    @Query("SELECT MAX(sort_order) FROM library_items")
    suspend fun getMaxSortOrder(): Int?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertPlace(place: PlaceEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertRoute(route: RouteEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertRouteRevision(revision: RouteRevisionEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertWaypoints(waypoints: List<WaypointEntity>)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertLibraryItem(item: LibraryItemEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertSyncStates(states: List<SyncStateEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertLibraryItems(items: List<LibraryItemEntity>)

    @Query("UPDATE places SET name = :newName, updated_at = :updatedAt WHERE id = :placeId")
    suspend fun renamePlace(
        placeId: String,
        newName: String,
        updatedAt: Long,
    )

    @Query("UPDATE routes SET name = :newName, updated_at = :updatedAt WHERE id = :routeId")
    suspend fun renameRoute(
        routeId: String,
        newName: String,
        updatedAt: Long,
    )

    @Query("UPDATE places SET lat = :lat, lng = :lng, updated_at = :updatedAt WHERE id = :placeId")
    suspend fun updatePlace(
        placeId: String,
        lat: Double,
        lng: Double,
        updatedAt: Long,
    )

    @Query(
        "UPDATE routes SET default_speed_kmh = :speedKmh, mode = :mode, updated_at = :updatedAt WHERE id = :routeId",
    )
    suspend fun updateRoute(
        routeId: String,
        speedKmh: Double,
        mode: String,
        updatedAt: Long,
    )

    @Query("UPDATE library_items SET last_used_at = :lastUsedAt, updated_at = :updatedAt WHERE id = :itemId")
    suspend fun touchLibraryItem(
        itemId: String,
        lastUsedAt: Long,
        updatedAt: Long,
    )

    @Query("DELETE FROM places WHERE id = :placeId")
    suspend fun deletePlace(placeId: String)

    @Query("DELETE FROM routes WHERE id = :routeId")
    suspend fun deleteRoute(routeId: String)
}
