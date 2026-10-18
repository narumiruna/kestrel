package dev.narumi.kestrel.core.library

import android.content.Context
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.i18n.coordinates
import dev.narumi.kestrel.core.i18n.routeDetails
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import java.text.Collator
import java.util.Locale

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
) : java.io.Serializable

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
) : java.io.Serializable

data class RouteRevision(
    val id: String,
    val remoteId: String? = null,
    val routeId: String,
    val revisionNumber: Int,
    val createdAt: Long,
) : java.io.Serializable

data class Waypoint(
    val id: String,
    val routeRevisionId: String,
    val sequence: Int,
    val lat: Double,
    val lng: Double,
    val speedKmh: Double? = null,
    val pauseSeconds: Double? = null,
) : java.io.Serializable

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
) : java.io.Serializable

data class LibraryItemWithContent(
    val item: LibraryItem,
    val name: String,
    val kind: LibraryItemKind,
    val place: Place? = null,
    val route: Route? = null,
    val currentRevision: RouteRevision? = null,
    val waypoints: List<Waypoint> = emptyList(),
) : java.io.Serializable

fun LibraryItemWithContent.primaryPoint(): LatLng? =
    when (kind) {
        LibraryItemKind.Place -> place?.let { LatLng(it.lat, it.lng) }
        LibraryItemKind.Route -> waypoints.firstOrNull()?.let { LatLng(it.lat, it.lng) }
    }

fun LibraryItemWithContent.routeWaypoints(): List<LatLng> =
    waypoints
        .sortedBy(Waypoint::sequence)
        .map { LatLng(it.lat, it.lng) }

fun LibraryItemWithContent.description(context: Context): String {
    return when (kind) {
        LibraryItemKind.Place -> {
            val target = place ?: return "—"
            coordinates(target.lat, target.lng)
        }

        LibraryItemKind.Route -> {
            val targetRoute = route ?: return context.getString(R.string.route)
            val mode = MovementEngine.Mode.entries.firstOrNull { it.name == targetRoute.mode } ?: MovementEngine.Mode.Once
            context.getString(R.string.route_summary, context.routeDetails(waypoints.size, targetRoute.defaultSpeedKmh, mode))
        }
    }
}

fun List<LibraryItemWithContent>.sortedFor(
    sortMode: FavoritesSortMode.Mode,
    locale: Locale = Locale.getDefault(),
): List<LibraryItemWithContent> =
    when (sortMode) {
        FavoritesSortMode.Mode.Manual -> {
            sortedWith(compareByManualOrder())
        }

        FavoritesSortMode.Mode.Recent -> {
            sortedWith(
                compareByDescending<LibraryItemWithContent> { it.item.lastUsedAt ?: Long.MIN_VALUE }
                    .thenComparator { a, b -> Collator.getInstance(locale).compare(a.name, b.name) }
                    .thenBy { it.item.id },
            )
        }

        FavoritesSortMode.Mode.Alphabetical -> {
            sortedWith(
                compareBy<LibraryItemWithContent, String>(Collator.getInstance(locale)) { it.name }
                    .thenBy { it.item.id },
            )
        }
    }

fun FavoritesSortMode.Mode.label(): Int =
    when (this) {
        FavoritesSortMode.Mode.Manual -> R.string.sort_manual
        FavoritesSortMode.Mode.Recent -> R.string.sort_recent
        FavoritesSortMode.Mode.Alphabetical -> R.string.sort_alphabetical
    }

fun LibraryItemWithContent.globalIndexIn(items: List<LibraryItemWithContent>): Int? = items.indexOfFirst { it.item.id == item.id }.takeIf { it >= 0 }

private fun compareByManualOrder(): Comparator<LibraryItemWithContent> =
    compareBy<LibraryItemWithContent> { it.item.sortOrder }
        .thenBy { it.item.createdAt }
