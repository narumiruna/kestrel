package dev.narumi.kestrel.core.library

import dev.narumi.kestrel.core.data.Favorite
import dev.narumi.kestrel.core.data.FavoriteRoute
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.library.migration.FavoriteToLibraryMigrator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FavoriteToLibraryMigratorTest {
    @Test
    fun `migrate point favorite keeps order and startup mapping`() {
        val favorite = Favorite(name = "Home", lat = 25.0, lng = 121.5, lastUsedAt = 123L)

        val result =
            FavoriteToLibraryMigrator.migrate(
                favorites = listOf(favorite),
                startupPreference =
                    StartupPreference(
                        mode = StartupPreference.Mode.Favorite,
                        favoriteName = "Home",
                    ),
                uuidFactory = sequentialUuidFactory(),
                nowProvider = { 999L },
            )

        val migrated = result.rows.single()
        assertEquals(LibraryItemKind.Place, migrated.libraryItem.kind)
        assertEquals(0, migrated.libraryItem.sortOrder)
        assertEquals(123L, migrated.libraryItem.lastUsedAt)
        assertEquals("uuid-2", migrated.place?.id)
        assertEquals("Home", migrated.place?.name)
        assertEquals("uuid-1", result.startupLibraryItemId)
        assertNull(migrated.route)
    }

    @Test
    fun `migrate route favorite creates revision and ordered waypoints`() {
        val favorite =
            Favorite(
                name = "Morning route",
                lat = 25.0,
                lng = 121.5,
                route =
                    FavoriteRoute(
                        lats = doubleArrayOf(25.0, 25.1, 25.2),
                        lngs = doubleArrayOf(121.5, 121.6, 121.7),
                        speedKmh = 18.0,
                        mode = "Loop",
                    ),
            )

        val result =
            FavoriteToLibraryMigrator.migrate(
                favorites = listOf(favorite),
                startupPreference = StartupPreference(),
                uuidFactory = sequentialUuidFactory(),
                nowProvider = { 555L },
            )

        val migrated = result.rows.single()
        assertEquals(LibraryItemKind.Route, migrated.libraryItem.kind)
        assertEquals("uuid-2", migrated.route?.id)
        assertEquals("uuid-3", migrated.routeRevision?.id)
        assertEquals("uuid-3", migrated.route?.currentRevisionId)
        assertEquals(3, migrated.waypoints.size)
        assertEquals(listOf(0, 1, 2), migrated.waypoints.map { it.sequence })
        assertEquals(listOf(25.0, 25.1, 25.2), migrated.waypoints.map { it.lat })
        assertEquals(18.0, migrated.route?.defaultSpeedKmh)
        assertEquals("Loop", migrated.route?.mode)
    }

    private fun sequentialUuidFactory(): () -> String {
        var current = 0
        return { current += 1; "uuid-$current" }
    }
}
