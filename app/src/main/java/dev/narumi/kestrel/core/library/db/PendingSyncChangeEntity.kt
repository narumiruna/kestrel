package dev.narumi.kestrel.core.library.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "pending_sync_changes",
    indices = [Index(value = ["library_item_id"])],
)
data class PendingSyncChangeEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "library_item_id") val libraryItemId: String,
    @ColumnInfo(name = "client_mutation_id") val clientMutationId: String,
    val type: String,
    @ColumnInfo(name = "base_version") val baseVersion: Int? = null,
    @ColumnInfo(name = "payload_json") val payloadJson: String,
    @ColumnInfo(name = "created_at") val createdAt: Long,
    @ColumnInfo(name = "updated_at") val updatedAt: Long,
)
