package dev.narumi.kestrel.feature.favorites

import dev.narumi.kestrel.core.library.LibraryItemKind

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

internal fun favoriteMoreActionsLabel(name: String): String = "More actions for $name"
