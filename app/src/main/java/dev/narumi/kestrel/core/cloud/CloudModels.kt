package dev.narumi.kestrel.core.cloud

import kotlinx.serialization.Serializable

@Serializable
data class CloudSession(
    val accessToken: String,
    val accessTokenExpiresAt: Long,
    val refreshToken: String,
    val sessionId: String,
    val userId: String,
    val username: String,
)

@Serializable
internal data class LoginWithTotpRequest(
    val username: String,
    val password: String,
    val totpCode: String,
)

@Serializable
internal data class LoginWithRecoveryCodeRequest(
    val username: String,
    val password: String,
    val recoveryCode: String,
)

@Serializable
internal data class RefreshSessionRequest(
    val refreshToken: String,
)

@Serializable
internal data class AuthSessionResponse(
    val accessToken: String,
    val accessTokenExpiresAt: String,
    val refreshToken: String,
    val session: SessionPayload,
    val user: UserPayload,
)

@Serializable
internal data class SessionPayload(
    val id: String,
)

@Serializable
internal data class UserPayload(
    val id: String,
    val username: String,
)

@Serializable
internal data class CloudBootstrapResponse(
    val places: List<CloudPlacePayload> = emptyList(),
    val routes: List<CloudRoutePayload> = emptyList(),
    val libraryItems: List<CloudLibraryItemPayload> = emptyList(),
    val syncCursor: String,
    val serverTime: String,
)

@Serializable
internal data class CloudChangesResponse(
    val places: List<CloudPlacePayload> = emptyList(),
    val routes: List<CloudRoutePayload> = emptyList(),
    val libraryItems: List<CloudLibraryItemPayload> = emptyList(),
    val deletions: List<CloudDeletionPayload> = emptyList(),
    val nextCursor: String,
    val serverTime: String,
)

@Serializable
internal data class CloudPlacePayload(
    val createdAt: String,
    val deletedAt: String? = null,
    val description: String? = null,
    val id: String,
    val libraryItem: CloudLibraryItemPayload? = null,
    val latitude: Double,
    val longitude: Double,
    val name: String,
    val tags: List<String> = emptyList(),
    val updatedAt: String,
)

@Serializable
internal data class CloudRoutePayload(
    val createdAt: String,
    val currentRevision: CloudRouteRevisionPayload? = null,
    val defaultSpeedKmh: Double,
    val deletedAt: String? = null,
    val description: String? = null,
    val id: String,
    val isPublic: Boolean = false,
    val libraryItem: CloudLibraryItemPayload? = null,
    val mode: CloudRouteMode,
    val name: String,
    val updatedAt: String,
)

@Serializable
internal data class CloudRouteRevisionPayload(
    val createdAt: String,
    val createdBy: String,
    val defaultSpeedKmh: Double,
    val id: String,
    val mode: CloudRouteMode,
    val revisionNumber: Int,
    val waypoints: List<CloudWaypointPayload> = emptyList(),
)

@Serializable
internal data class CloudWaypointPayload(
    val latitude: Double,
    val longitude: Double,
    val pauseSeconds: Double? = null,
    val sequence: Int = 0,
    val speedKmh: Double? = null,
)

@Serializable
internal data class CloudLibraryItemPayload(
    val createdAt: String,
    val deletedAt: String? = null,
    val id: String,
    val kind: CloudLibraryItemKind,
    val lastUsedAt: String? = null,
    val pinned: Boolean = false,
    val placeId: String? = null,
    val routeId: String? = null,
    val sortOrder: Int,
    val updatedAt: String,
    val version: Int = 1,
)

@Serializable
internal data class CloudSyncUploadRequest(
    val changes: List<CloudSyncUploadChange>,
)

@Serializable
internal data class CloudSyncUploadChange(
    val clientMutationId: String,
    val expectedVersion: Int? = null,
    val place: CloudSyncUploadPlace? = null,
    val remoteLibraryItemId: String? = null,
    val remotePlaceId: String? = null,
    val type: CloudSyncUploadChangeType,
)

@Serializable
internal data class CloudSyncUploadPlace(
    val description: String? = null,
    val latitude: Double,
    val longitude: Double,
    val name: String,
    val tags: List<String> = emptyList(),
)

@Serializable
internal enum class CloudSyncUploadChangeType { PLACE_CREATE, PLACE_UPDATE, PLACE_DELETE }

@Serializable
internal data class CloudSyncUploadResponse(
    val conflicts: List<CloudSyncUploadConflictResult> = emptyList(),
    val failed: List<CloudSyncUploadFailedResult> = emptyList(),
    val serverTime: String,
    val uploaded: List<CloudSyncUploadUploadedResult> = emptyList(),
)

@Serializable
internal data class CloudSyncUploadUploadedResult(
    val clientMutationId: String,
    val libraryItem: CloudLibraryItemPayload? = null,
    val place: CloudPlacePayload? = null,
    val status: String,
)

@Serializable
internal data class CloudSyncUploadConflictResult(
    val clientMutationId: String,
    val cloudLibraryItem: CloudLibraryItemPayload? = null,
    val cloudPlace: CloudPlacePayload? = null,
    val reason: String,
    val status: String,
)

@Serializable
internal data class CloudSyncUploadFailedResult(
    val clientMutationId: String,
    val message: String,
    val status: String,
)

@Serializable
internal data class CloudDeletionPayload(
    val deletedAt: String? = null,
    val entityId: String,
    val entityType: CloudSyncEntityType,
)

@Serializable
internal enum class CloudLibraryItemKind { PLACE, ROUTE }

@Serializable
internal enum class CloudRouteMode { ONCE, LOOP, PING_PONG }

@Serializable
internal data class RegisterRemoteDeviceRequest(
    val clientDeviceId: String,
    val name: String,
    val appVersion: String? = null,
    val remoteControlEnabled: Boolean,
)

@Serializable
internal data class PollRemoteCommandsRequest(
    val clientDeviceId: String,
)

@Serializable
internal data class ReportDeviceStateRequest(
    val clientDeviceId: String,
    val playbackState: RemotePlaybackState,
)

@Serializable
internal data class ReportDeviceStateResponse(
    val state: RemoteDeviceStatePayload,
)

@Serializable
internal data class RemoteDeviceStatePayload(
    val lastReportedAt: String,
    val playbackState: RemotePlaybackState,
)

@Serializable
internal data class AckRemoteCommandRequest(
    val clientDeviceId: String,
    val status: RemoteCommandStatus,
    val errorMessage: String? = null,
)

@Serializable
internal data class RemoteCommandsPollResponse(
    val commands: List<RemoteCommandPayload> = emptyList(),
    val serverTime: String,
)

@Serializable
internal data class RemoteCommandPayload(
    val appliedAt: String? = null,
    val createdAt: String,
    val deliveredAt: String? = null,
    val deviceId: String,
    val errorMessage: String? = null,
    val expiresAt: String,
    val id: String,
    val payload: kotlinx.serialization.json.JsonElement,
    val status: RemoteCommandStatus,
    val type: RemoteCommandType,
)

@Serializable
internal data class RemoteDevicePayload(
    val appVersion: String? = null,
    val createdAt: String,
    val id: String,
    val lastCommand: RemoteCommandPayload? = null,
    val lastSeenAt: String,
    val name: String,
    val online: Boolean = false,
    val platform: String,
    val remoteControlEnabled: Boolean,
    val revokedAt: String? = null,
    val state: RemoteDeviceStatePayload? = null,
)

@Serializable
internal data class RemotePointPayload(
    val latitude: Double,
    val longitude: Double,
)

@Serializable
internal data class RemoteSetPointPayload(
    val point: RemotePointPayload,
)

@Serializable
internal data class RemoteStartRoutePayload(
    val waypoints: List<RemotePointPayload> = emptyList(),
    val speedKmh: Double,
    val mode: CloudRouteMode,
)

@Serializable
internal enum class RemotePlaybackState { IDLE, SINGLE, ROUTE, PAUSED }

@Serializable
internal enum class RemoteCommandType { SET_POINT, START_ROUTE, STOP }

@Serializable
internal enum class RemoteCommandStatus { QUEUED, DELIVERED, APPLIED, FAILED, EXPIRED }

@Serializable
internal enum class CloudSyncEntityType { PLACE, ROUTE, ROUTE_REVISION, LIBRARY_ITEM, DEVICE_STATE }

@Serializable
internal data class ErrorResponse(
    val code: String? = null,
    val message: String? = null,
)

@Serializable
internal data class RevokeSessionResponse(
    val session: RevokedSessionPayload,
)

@Serializable
internal data class RevokedSessionPayload(
    val id: String,
    val revokedAt: String,
)
