package dev.narumi.kestrel.feature.favorites

import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.library.LibraryItem
import dev.narumi.kestrel.core.library.LibraryItemKind
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.core.library.globalIndexIn
import org.junit.Assert.assertEquals
import org.junit.Test

class FavoritesSearchTest {
    private val items =
        listOf(
            favorite("point-1", "Taipei 101", LibraryItemKind.Place, 0, 20),
            favorite("route-1", "Taipei walk", LibraryItemKind.Route, 1, 30),
            favorite("point-2", "台北車站", LibraryItemKind.Place, 2, 10),
            favorite("point-3", "Taipei 101", LibraryItemKind.Place, 3, null),
        )

    @Test
    fun searchTrimsWhitespaceAndIgnoresCase() {
        assertEquals(listOf("point-1", "route-1", "point-3"), search("  TAIPEI  "))
    }

    @Test
    fun queryAndTypeFilterApplyTogether() {
        assertEquals(listOf("route-1"), search("taipei", FavoritesFilter.Routes))
        assertEquals(listOf("point-1", "point-3"), search("taipei", FavoritesFilter.Points))
    }

    @Test
    fun blankQueryKeepsTheWholeLibraryInTheSelectedOrder() {
        assertEquals(items.map { it.item.id }, search("  "))
        assertEquals(
            listOf("route-1", "point-1", "point-2", "point-3"),
            search("", sortMode = FavoritesSortMode.Mode.Recent),
        )
    }

    @Test
    fun searchSupportsNonLatinNamesAndNoMatches() {
        assertEquals(listOf("point-2"), search("台北"))
        assertEquals(emptyList<String>(), search("missing"))
        assertEquals(emptyList<String>(), search("台北", FavoritesFilter.Routes))
    }

    @Test
    fun duplicateNamesKeepTheirStableIdentitiesAndSortOrder() {
        assertEquals(
            listOf("point-1", "point-3", "route-1"),
            search("taipei", sortMode = FavoritesSortMode.Mode.Alphabetical),
        )
    }

    @Test
    fun filteredNeighborsResolveToOriginalIndicesForManualReordering() {
        val visible = visibleFavorites(items, "101", FavoritesFilter.All, FavoritesSortMode.Mode.Manual)
        assertEquals(0, visible.first().globalIndexIn(items))
        assertEquals(3, visible.last().globalIndexIn(items))
        assertEquals(listOf("point-1", "route-1", "point-2", "point-3"), items.map { it.item.id })
    }

    @Test
    fun clearingQueryAndFilterRestoresAllItems() {
        assertEquals(emptyList<String>(), search("missing", FavoritesFilter.Routes))
        assertEquals(items.map { it.item.id }, search("", FavoritesFilter.All))
        assertEquals(
            emptyList<LibraryItemWithContent>(),
            visibleFavorites(emptyList(), "", FavoritesFilter.All, FavoritesSortMode.Mode.Manual),
        )
    }

    private fun search(
        query: String,
        filter: FavoritesFilter = FavoritesFilter.All,
        sortMode: FavoritesSortMode.Mode = FavoritesSortMode.Mode.Manual,
    ): List<String> = visibleFavorites(items, query, filter, sortMode).map { it.item.id }

    private fun favorite(
        id: String,
        name: String,
        kind: LibraryItemKind,
        order: Int,
        lastUsedAt: Long?,
    ) = LibraryItemWithContent(
        item =
            LibraryItem(
                id = id,
                kind = kind,
                sortOrder = order,
                lastUsedAt = lastUsedAt,
                createdAt = 0,
                updatedAt = 0,
            ),
        name = name,
        kind = kind,
    )
}
