package dev.narumi.kestrel.core.library.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "sync_conflicts",
    indices = [Index(value = ["library_item_id"])],
)
data class SyncConflictEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "library_item_id") val libraryItemId: String,
    @ColumnInfo(name = "pending_change_id") val pendingChangeId: String,
    val kind: String,
    @ColumnInfo(name = "base_version") val baseVersion: Int? = null,
    @ColumnInfo(name = "remote_version") val remoteVersion: Int,
    @ColumnInfo(name = "local_snapshot_json") val localSnapshotJson: String,
    @ColumnInfo(name = "cloud_snapshot_json") val cloudSnapshotJson: String,
    @ColumnInfo(name = "created_at") val createdAt: Long,
)
