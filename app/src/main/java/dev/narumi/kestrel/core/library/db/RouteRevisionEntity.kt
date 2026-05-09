package dev.narumi.kestrel.core.library.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "route_revisions",
    foreignKeys = [
        ForeignKey(
            entity = RouteEntity::class,
            parentColumns = ["id"],
            childColumns = ["route_id"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [
        Index(value = ["remote_id"], unique = true),
        Index(value = ["route_id"]),
    ],
)
data class RouteRevisionEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "remote_id") val remoteId: String? = null,
    @ColumnInfo(name = "route_id") val routeId: String,
    @ColumnInfo(name = "revision_number") val revisionNumber: Int,
    @ColumnInfo(name = "created_at") val createdAt: Long,
)
