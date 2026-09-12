package dev.narumi.kestrel.feature.favorites

import dev.narumi.kestrel.core.data.FavoritesSortMode
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
): List<LibraryItemWithContent> {
    val search = query.trim()
    return items
        .filter { filter.includes(it.kind) && it.name.contains(search, ignoreCase = true) }
        .sortedFor(sortMode)
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

internal fun favoriteEditLabel(kind: LibraryItemKind): String = if (kind == LibraryItemKind.Place) "Edit coordinates" else "Edit route"

internal fun FavoritesFilter.label(): String =
    when (this) {
        FavoritesFilter.All -> "All"
        FavoritesFilter.Points -> "Points"
        FavoritesFilter.Routes -> "Routes"
    }

internal fun favoriteMoreActionsLabel(name: String): String = "More actions for $name"
