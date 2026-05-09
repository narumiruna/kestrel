package dev.narumi.kestrel.core.library

import dev.narumi.kestrel.core.library.db.LibraryItemEntity
import dev.narumi.kestrel.core.library.db.LibraryItemRecord
import dev.narumi.kestrel.core.library.db.PlaceEntity
import dev.narumi.kestrel.core.library.db.RouteEntity
import dev.narumi.kestrel.core.library.db.RouteRevisionEntity
import dev.narumi.kestrel.core.library.db.SyncStatus
import dev.narumi.kestrel.core.library.db.WaypointEntity

internal fun LibraryItemRecord.toDomain(): LibraryItemWithContent {
    val placeDomain = place?.toDomain()
    val routeDomain = route?.route?.toDomain()
    val revisionDomain = route?.currentRevision?.toDomain()
    val waypointDomains =
        route
            ?.waypoints
            .orEmpty()
            .map(WaypointEntity::toDomain)
            .sortedBy { it.sequence }
    return LibraryItemWithContent(
        item = item.toDomain(),
        name = placeDomain?.name ?: routeDomain?.name.orEmpty(),
        kind = item.kind,
        place = placeDomain,
        route = routeDomain,
        currentRevision = revisionDomain,
        waypoints = waypointDomains,
    )
}

internal fun LibraryItemEntity.toDomain(): LibraryItem =
    LibraryItem(
        id = id,
        remoteId = remoteId,
        kind = kind,
        placeId = placeId,
        routeId = routeId,
        sortOrder = sortOrder,
        lastUsedAt = lastUsedAt,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

internal fun LibraryItem.toEntity(syncStatus: SyncStatus = SyncStatus.LocalOnly): LibraryItemEntity =
    LibraryItemEntity(
        id = id,
        remoteId = remoteId,
        kind = kind,
        placeId = placeId,
        routeId = routeId,
        sortOrder = sortOrder,
        lastUsedAt = lastUsedAt,
        syncStatus = syncStatus,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

internal fun PlaceEntity.toDomain(): Place =
    Place(
        id = id,
        remoteId = remoteId,
        name = name,
        lat = lat,
        lng = lng,
        description = description,
        tags = tags,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

internal fun Place.toEntity(syncStatus: SyncStatus = SyncStatus.LocalOnly): PlaceEntity =
    PlaceEntity(
        id = id,
        remoteId = remoteId,
        name = name,
        lat = lat,
        lng = lng,
        description = description,
        tags = tags,
        syncStatus = syncStatus,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

internal fun RouteEntity.toDomain(): Route =
    Route(
        id = id,
        remoteId = remoteId,
        name = name,
        description = description,
        defaultSpeedKmh = defaultSpeedKmh,
        mode = mode,
        currentRevisionId = currentRevisionId,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

internal fun Route.toEntity(syncStatus: SyncStatus = SyncStatus.LocalOnly): RouteEntity =
    RouteEntity(
        id = id,
        remoteId = remoteId,
        name = name,
        description = description,
        defaultSpeedKmh = defaultSpeedKmh,
        mode = mode,
        currentRevisionId = currentRevisionId,
        syncStatus = syncStatus,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

internal fun RouteRevisionEntity.toDomain(): RouteRevision =
    RouteRevision(
        id = id,
        remoteId = remoteId,
        routeId = routeId,
        revisionNumber = revisionNumber,
        createdAt = createdAt,
    )

internal fun RouteRevision.toEntity(): RouteRevisionEntity =
    RouteRevisionEntity(
        id = id,
        remoteId = remoteId,
        routeId = routeId,
        revisionNumber = revisionNumber,
        createdAt = createdAt,
    )

internal fun WaypointEntity.toDomain(): Waypoint =
    Waypoint(
        id = id,
        routeRevisionId = routeRevisionId,
        sequence = sequence,
        lat = lat,
        lng = lng,
        speedKmh = speedKmh,
        pauseSeconds = pauseSeconds,
    )

internal fun Waypoint.toEntity(): WaypointEntity =
    WaypointEntity(
        id = id,
        routeRevisionId = routeRevisionId,
        sequence = sequence,
        lat = lat,
        lng = lng,
        speedKmh = speedKmh,
        pauseSeconds = pauseSeconds,
    )
