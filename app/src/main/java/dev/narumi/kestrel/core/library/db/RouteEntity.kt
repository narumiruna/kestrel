package dev.narumi.kestrel.core.library.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "routes",
    indices = [
        Index(value = ["remote_id"], unique = true),
        Index(value = ["current_revision_id"]),
    ],
)
data class RouteEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "remote_id") val remoteId: String? = null,
    val name: String,
    val description: String? = null,
    @ColumnInfo(name = "default_speed_kmh") val defaultSpeedKmh: Double,
    val mode: String,
    @ColumnInfo(name = "current_revision_id") val currentRevisionId: String,
    @ColumnInfo(name = "sync_status") val syncStatus: SyncStatus = SyncStatus.LocalOnly,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
)
