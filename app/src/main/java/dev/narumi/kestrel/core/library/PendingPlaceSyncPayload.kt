package dev.narumi.kestrel.core.library

import dev.narumi.kestrel.core.library.db.LibraryItemRecord
import dev.narumi.kestrel.core.library.db.SyncStatus
import kotlinx.serialization.Serializable

@Serializable
internal data class PendingPlaceSyncPayload(
    val description: String? = null,
    val latitude: Double,
    val longitude: Double,
    val name: String,
    val remoteLibraryItemId: String? = null,
    val remotePlaceId: String? = null,
    val tags: List<String> = emptyList(),
)

internal fun LibraryItemRecord.toPendingPlaceSyncPayload(): PendingPlaceSyncPayload? {
    val place = place ?: return null
    return PendingPlaceSyncPayload(
        description = place.description,
        latitude = place.lat,
        longitude = place.lng,
        name = place.name,
        remoteLibraryItemId = item.remoteId,
        remotePlaceId = place.remoteId,
        tags = place.tags,
    )
}

internal fun syncStatusForPlaceMutation(remoteId: String?): SyncStatus =
    if (remoteId == null) {
        SyncStatus.LocalOnly
    } else {
        SyncStatus.Dirty
    }

internal fun uploadChangeTypeNameForPlaceMutation(remoteId: String?): String =
    if (remoteId == null) {
        "PLACE_CREATE"
    } else {
        "PLACE_UPDATE"
    }
