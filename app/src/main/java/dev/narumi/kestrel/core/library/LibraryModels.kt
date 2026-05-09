package dev.narumi.kestrel.core.library

import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.location.LatLng

@Suppress("MagicNumber")
data class Place(
    val id: String,
    val remoteId: String? = null,
    val name: String,
    val lat: Double,
    val lng: Double,
    val description: String? = null,
    val tags: List<String> = emptyList(),
    val createdAt: Long,
    val updatedAt: Long,
)

data class Route(
    val id: String,
    val remoteId: String? = null,
    val name: String,
    val description: String? = null,
    val defaultSpeedKmh: Double,
    val mode: String,
    val currentRevisionId: String,
    val createdAt: Long,
    val updatedAt: Long,
)

data class RouteRevision(
    val id: String,
    val remoteId: String? = null,
    val routeId: String,
    val revisionNumber: Int,
    val createdAt: Long,
)

data class Waypoint(
    val id: String,
    val routeRevisionId: String,
    val sequence: Int,
    val lat: Double,
    val lng: Double,
    val speedKmh: Double? = null,
    val pauseSeconds: Double? = null,
)

enum class LibraryItemKind { Place, Route }

data class LibraryItem(
    val id: String,
    val remoteId: String? = null,
    val kind: LibraryItemKind,
    val placeId: String? = null,
    val routeId: String? = null,
    val sortOrder: Int,
    val lastUsedAt: Long? = null,
    val createdAt: Long,
    val updatedAt: Long,
)

data class LibraryItemWithContent(
    val item: LibraryItem,
    val name: String,
    val kind: LibraryItemKind,
    val place: Place? = null,
    val route: Route? = null,
    val currentRevision: RouteRevision? = null,
    val waypoints: List<Waypoint> = emptyList(),
)

fun LibraryItemWithContent.primaryPoint(): LatLng? =
    when (kind) {
        LibraryItemKind.Place -> place?.let { LatLng(it.lat, it.lng) }
        LibraryItemKind.Route -> waypoints.firstOrNull()?.let { LatLng(it.lat, it.lng) }
    }

fun LibraryItemWithContent.routeWaypoints(): List<LatLng> =
    waypoints
        .sortedBy(Waypoint::sequence)
        .map { LatLng(it.lat, it.lng) }

fun LibraryItemWithContent.description(): String {
    return when (kind) {
        LibraryItemKind.Place -> {
            val target = place ?: return "—"
            "%.5f, %.5f".format(target.lat, target.lng)
        }
        LibraryItemKind.Route -> {
            val targetRoute = route ?: return "Route"
            "Route · ${waypoints.size} waypoints · ${targetRoute.defaultSpeedKmh.toInt()} km/h · ${targetRoute.mode}"
        }
    }
}

fun List<LibraryItemWithContent>.sortedFor(sortMode: FavoritesSortMode.Mode): List<LibraryItemWithContent> =
    when (sortMode) {
        FavoritesSortMode.Mode.Manual -> sortedBy(LibraryItemWithContent::manualOrder)
        FavoritesSortMode.Mode.Recent -> sortedWith(compareByDescending<LibraryItemWithContent> { it.item.lastUsedAt ?: Long.MIN_VALUE }.thenBy { it.name.lowercase() })
        FavoritesSortMode.Mode.Alphabetical -> sortedWith(compareBy<LibraryItemWithContent> { it.name.lowercase() }.thenBy(LibraryItemWithContent::manualOrder))
    }

fun FavoritesSortMode.Mode.label(): String =
    when (this) {
        FavoritesSortMode.Mode.Manual -> "Manual"
        FavoritesSortMode.Mode.Recent -> "Recent"
        FavoritesSortMode.Mode.Alphabetical -> "Alphabetical"
    }

fun LibraryItemWithContent.globalIndexIn(items: List<LibraryItemWithContent>): Int? =
    items.indexOfFirst { it.item.id == item.id }.takeIf { it >= 0 }

private fun LibraryItemWithContent.manualOrder(): Pair<Int, Long> = item.sortOrder to item.createdAt
