package dev.narumi.kestrel.core.library.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import dev.narumi.kestrel.core.library.LibraryItemKind

@Entity(
    tableName = "library_items",
    foreignKeys = [
        ForeignKey(
            entity = PlaceEntity::class,
            parentColumns = ["id"],
            childColumns = ["place_id"],
            onDelete = ForeignKey.CASCADE,
        ),
        ForeignKey(
            entity = RouteEntity::class,
            parentColumns = ["id"],
            childColumns = ["route_id"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [
        Index(value = ["remote_id"], unique = true),
        Index(value = ["place_id"]),
        Index(value = ["route_id"]),
        Index(value = ["sort_order"]),
    ],
)
data class LibraryItemEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "remote_id") val remoteId: String? = null,
    val kind: LibraryItemKind,
    @ColumnInfo(name = "place_id") val placeId: String? = null,
    @ColumnInfo(name = "route_id") val routeId: String? = null,
    @ColumnInfo(name = "sort_order") val sortOrder: Int,
    @ColumnInfo(name = "last_used_at") val lastUsedAt: Long? = null,
    @ColumnInfo(name = "sync_status") val syncStatus: SyncStatus = SyncStatus.LocalOnly,
    @ColumnInfo(name = "remote_version") val remoteVersion: Int? = null,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
)
