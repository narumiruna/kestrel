package dev.narumi.kestrel.feature.favorites

import dev.narumi.kestrel.core.library.LibraryItemKind
import org.junit.Assert.assertEquals
import org.junit.Test

class FavoriteActionPresentationTest {
    @Test
    fun flatFiltersCoverAllKindsWithoutHidingTheDefaultList() {
        assertEquals(true, FavoritesFilter.All.includes(LibraryItemKind.Place))
        assertEquals(true, FavoritesFilter.All.includes(LibraryItemKind.Route))
        assertEquals(true, FavoritesFilter.Points.includes(LibraryItemKind.Place))
        assertEquals(false, FavoritesFilter.Points.includes(LibraryItemKind.Route))
        assertEquals(false, FavoritesFilter.Routes.includes(LibraryItemKind.Place))
        assertEquals(true, FavoritesFilter.Routes.includes(LibraryItemKind.Route))
    }

    @Test
    fun overflowHasItemSpecificAccessibleName() {
        assertEquals("More actions for Taipei 101", favoriteMoreActionsLabel("Taipei 101"))
    }

    @Test
    fun directActionsKeepApplyAndOneKindSpecificEdit() {
        assertEquals(
            listOf(FavoriteRowAction.Apply, FavoriteRowAction.EditCoordinates),
            favoriteRowActions(LibraryItemKind.Place, false, false, false).direct,
        )
        assertEquals(
            listOf(FavoriteRowAction.Apply, FavoriteRowAction.EditRoute),
            favoriteRowActions(LibraryItemKind.Route, false, false, false).direct,
        )
    }

    @Test
    fun overflowNeverDuplicatesEdit() {
        assertEquals(
            listOf(FavoriteRowAction.Rename, FavoriteRowAction.Delete),
            favoriteRowActions(LibraryItemKind.Place, false, false, false).overflow,
        )
    }

    @Test
    fun manualSortAddsPositionAwareReorderActions() {
        assertEquals(
            listOf(FavoriteRowAction.Rename, FavoriteRowAction.MoveDown, FavoriteRowAction.Delete),
            favoriteRowActions(LibraryItemKind.Route, true, false, true).overflow,
        )
        assertEquals(
            listOf(FavoriteRowAction.Rename, FavoriteRowAction.MoveUp, FavoriteRowAction.Delete),
            favoriteRowActions(LibraryItemKind.Route, true, true, false).overflow,
        )
        assertEquals(
            listOf(
                FavoriteRowAction.Rename,
                FavoriteRowAction.MoveUp,
                FavoriteRowAction.MoveDown,
                FavoriteRowAction.Delete,
            ),
            favoriteRowActions(LibraryItemKind.Route, true, true, true).overflow,
        )
    }
}
