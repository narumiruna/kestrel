package dev.narumi.kestrel.core.library.db

import androidx.room.Embedded
import androidx.room.Relation

data class LibraryItemRecord(
    @Embedded val item: LibraryItemEntity,
    @Relation(parentColumn = "place_id", entityColumn = "id")
    val place: PlaceEntity? = null,
    @Relation(parentColumn = "route_id", entityColumn = "id")
    val route: RouteWithContent? = null,
)

data class RouteWithContent(
    @Embedded val route: RouteEntity,
    @Relation(parentColumn = "current_revision_id", entityColumn = "id")
    val currentRevision: RouteRevisionEntity? = null,
    @Relation(parentColumn = "current_revision_id", entityColumn = "route_revision_id")
    val waypoints: List<WaypointEntity> = emptyList(),
)
