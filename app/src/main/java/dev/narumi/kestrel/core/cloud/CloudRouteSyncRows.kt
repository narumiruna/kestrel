package dev.narumi.kestrel.core.cloud

import dev.narumi.kestrel.core.library.LibraryItemKind
import dev.narumi.kestrel.core.library.db.LibraryItemEntity
import dev.narumi.kestrel.core.library.db.PlaceEntity
import dev.narumi.kestrel.core.library.db.RouteEntity
import dev.narumi.kestrel.core.library.db.RouteRevisionEntity
import dev.narumi.kestrel.core.library.db.SyncStatus
import dev.narumi.kestrel.core.library.db.WaypointEntity
import java.time.Instant

internal data class CloudRouteSyncRows(
    val route: RouteEntity,
    val revision: RouteRevisionEntity,
    val waypoints: List<WaypointEntity>,
)

internal fun CloudPlacePayload.toPlaceEntity(localId: String): PlaceEntity =
    PlaceEntity(
        id = localId,
        remoteId = id,
        name = name,
        lat = latitude,
        lng = longitude,
        description = description,
        tags = tags,
        syncStatus = SyncStatus.Synced,
        createdAt = createdAt.toEpochMillis(),
        updatedAt = updatedAt.toEpochMillis(),
    )

internal fun CloudRoutePayload.toRouteSyncRows(
    routeId: String,
    revisionId: String,
    waypointIdFactory: () -> String,
): CloudRouteSyncRows {
    val currentRevision = checkNotNull(currentRevision) { "Cloud route $id is missing current revision" }
    return CloudRouteSyncRows(
        route =
            RouteEntity(
                id = routeId,
                remoteId = id,
                name = name,
                description = description,
                defaultSpeedKmh = currentRevision.defaultSpeedKmh,
                mode = currentRevision.mode.toLocalMode(),
                currentRevisionId = revisionId,
                syncStatus = SyncStatus.Synced,
                createdAt = createdAt.toEpochMillis(),
                updatedAt = updatedAt.toEpochMillis(),
            ),
        revision =
            RouteRevisionEntity(
                id = revisionId,
                remoteId = currentRevision.id,
                routeId = routeId,
                revisionNumber = currentRevision.revisionNumber,
                createdAt = currentRevision.createdAt.toEpochMillis(),
            ),
        waypoints =
            currentRevision.waypoints
                .sortedBy(CloudWaypointPayload::sequence)
                .map { waypoint ->
                    WaypointEntity(
                        id = waypointIdFactory(),
                        routeRevisionId = revisionId,
                        sequence = waypoint.sequence,
                        lat = waypoint.latitude,
                        lng = waypoint.longitude,
                        speedKmh = waypoint.speedKmh,
                        pauseSeconds = waypoint.pauseSeconds,
                    )
                },
    )
}

internal fun CloudLibraryItemPayload.toLibraryItemEntity(
    localId: String,
    localPlaceId: String?,
    localRouteId: String?,
): LibraryItemEntity =
    LibraryItemEntity(
        id = localId,
        remoteId = id,
        kind = kind.toLocalKind(),
        placeId = localPlaceId,
        routeId = localRouteId,
        sortOrder = sortOrder,
        lastUsedAt = lastUsedAt?.toEpochMillis(),
        syncStatus = SyncStatus.Synced,
        remoteVersion = version,
        createdAt = createdAt.toEpochMillis(),
        updatedAt = updatedAt.toEpochMillis(),
    )

internal fun CloudRouteMode.toLocalMode(): String =
    when (this) {
        CloudRouteMode.ONCE -> "Once"
        CloudRouteMode.LOOP -> "Loop"
        CloudRouteMode.PING_PONG -> "PingPong"
    }

internal fun CloudLibraryItemKind.toLocalKind(): LibraryItemKind =
    when (this) {
        CloudLibraryItemKind.PLACE -> LibraryItemKind.Place
        CloudLibraryItemKind.ROUTE -> LibraryItemKind.Route
    }

internal fun String.toEpochMillis(): Long = Instant.parse(this).toEpochMilli()
