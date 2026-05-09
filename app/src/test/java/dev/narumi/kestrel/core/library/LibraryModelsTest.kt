package dev.narumi.kestrel.core.library

import dev.narumi.kestrel.core.data.FavoritesSortMode
import org.junit.Assert.assertEquals
import org.junit.Test

class LibraryModelsTest {
    @Test
    fun `sortedFor recent uses last used timestamp`() {
        val old = item(id = "old", name = "Old", sortOrder = 0, lastUsedAt = 10L)
        val neverUsed = item(id = "never", name = "Never", sortOrder = 1, lastUsedAt = null)
        val recent = item(id = "recent", name = "Recent", sortOrder = 2, lastUsedAt = 30L)

        val sorted = listOf(old, neverUsed, recent).sortedFor(FavoritesSortMode.Mode.Recent)

        assertEquals(listOf("recent", "old", "never"), sorted.map { it.item.id })
    }

    @Test
    fun `sortedFor manual uses library item sort order`() {
        val first = item(id = "first", name = "First", sortOrder = 0)
        val second = item(id = "second", name = "Second", sortOrder = 1)
        val third = item(id = "third", name = "Third", sortOrder = 2)

        val sorted = listOf(third, first, second).sortedFor(FavoritesSortMode.Mode.Manual)

        assertEquals(listOf("first", "second", "third"), sorted.map { it.item.id })
    }

    private fun item(
        id: String,
        name: String,
        sortOrder: Int,
        lastUsedAt: Long? = null,
    ): LibraryItemWithContent =
        LibraryItemWithContent(
            item =
                LibraryItem(
                    id = id,
                    kind = LibraryItemKind.Place,
                    placeId = "place-$id",
                    sortOrder = sortOrder,
                    lastUsedAt = lastUsedAt,
                    createdAt = sortOrder.toLong(),
                    updatedAt = sortOrder.toLong(),
                ),
            name = name,
            kind = LibraryItemKind.Place,
            place =
                Place(
                    id = "place-$id",
                    name = name,
                    lat = 25.0,
                    lng = 121.5,
                    createdAt = sortOrder.toLong(),
                    updatedAt = sortOrder.toLong(),
                ),
        )
}
