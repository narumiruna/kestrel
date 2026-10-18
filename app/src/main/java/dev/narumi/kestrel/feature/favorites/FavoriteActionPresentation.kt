package dev.narumi.kestrel.feature.favorites

import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.i18n.UiMessage
import dev.narumi.kestrel.core.library.LibraryItemKind
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.core.library.sortedFor

internal enum class FavoritesFilter { All, Points, Routes }

internal fun FavoritesFilter.includes(kind: LibraryItemKind): Boolean =
    when (this) {
        FavoritesFilter.All -> true
        FavoritesFilter.Points -> kind == LibraryItemKind.Place
        FavoritesFilter.Routes -> kind == LibraryItemKind.Route
    }

internal fun visibleFavorites(
    items: List<LibraryItemWithContent>,
    query: String,
    filter: FavoritesFilter,
    sortMode: FavoritesSortMode.Mode,
    locale: java.util.Locale = java.util.Locale.getDefault(),
): List<LibraryItemWithContent> {
    val search = query.trim()
    return items
        .filter { filter.includes(it.kind) && it.name.contains(search, ignoreCase = true) }
        .sortedFor(sortMode, locale)
}

internal enum class FavoriteRowAction {
    Apply,
    EditCoordinates,
    EditRoute,
    Rename,
    MoveUp,
    MoveDown,
    Delete,
}

internal data class FavoriteRowActions(
    val direct: List<FavoriteRowAction>,
    val overflow: List<FavoriteRowAction>,
)

internal fun favoriteRowActions(
    kind: LibraryItemKind,
    canReorder: Boolean,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
): FavoriteRowActions =
    FavoriteRowActions(
        direct =
            listOf(
                FavoriteRowAction.Apply,
                if (kind == LibraryItemKind.Place) {
                    FavoriteRowAction.EditCoordinates
                } else {
                    FavoriteRowAction.EditRoute
                },
            ),
        overflow =
            buildList {
                add(FavoriteRowAction.Rename)
                if (canReorder && canMoveUp) add(FavoriteRowAction.MoveUp)
                if (canReorder && canMoveDown) add(FavoriteRowAction.MoveDown)
                add(FavoriteRowAction.Delete)
            },
    )

internal fun favoriteEditLabel(kind: LibraryItemKind): Int = if (kind == LibraryItemKind.Place) R.string.edit_coordinates else R.string.edit_route

internal fun FavoritesFilter.label(): Int =
    when (this) {
        FavoritesFilter.All -> R.string.filter_all
        FavoritesFilter.Points -> R.string.filter_points
        FavoritesFilter.Routes -> R.string.filter_routes
    }

internal fun favoriteMoreActionsLabel(name: String): UiMessage = UiMessage(R.string.more_actions_for, listOf(name))
