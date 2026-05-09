package dev.narumi.kestrel.core.library.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "places",
    indices = [Index(value = ["remote_id"], unique = true)],
)
data class PlaceEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "remote_id") val remoteId: String? = null,
    val name: String,
    val lat: Double,
    val lng: Double,
    val description: String? = null,
    @ColumnInfo(name = "tags_json") val tags: List<String> = emptyList(),
    @ColumnInfo(name = "sync_status") val syncStatus: SyncStatus = SyncStatus.LocalOnly,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
)
