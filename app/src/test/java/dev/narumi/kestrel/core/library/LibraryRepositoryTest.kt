package dev.narumi.kestrel.core.library

import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.library.db.LibraryItemEntity
import dev.narumi.kestrel.core.library.db.LibraryItemRecord
import dev.narumi.kestrel.core.library.db.PlaceEntity
import dev.narumi.kestrel.core.library.db.RouteEntity
import dev.narumi.kestrel.core.library.db.RouteRevisionEntity
import dev.narumi.kestrel.core.library.db.RouteWithContent
import dev.narumi.kestrel.core.library.db.WaypointEntity
import dev.narumi.kestrel.core.location.LatLng
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LibraryRepositoryTest {
    @Test
    fun `normalizedLibraryItemName trims names and rejects blank input`() {
        assertEquals("New name", normalizedLibraryItemName("  New name  "))
        assertNull(normalizedLibraryItemName("   "))
    }

    @Test
    fun `rename startup favorite only follows matching library item id`() {
        val startup =
            StartupPreference(
                mode = StartupPreference.Mode.Favorite,
                libraryItemId = "item-1",
                favoriteName = "Old name",
            )

        assertEquals(true, shouldRenameStartupFavorite(startup, "item-1"))
        assertEquals(false, shouldRenameStartupFavorite(startup, "item-2"))
        assertEquals(false, shouldRenameStartupFavorite(StartupPreference(StartupPreference.Mode.Last), "item-1"))
    }

    @Test
    fun `touchLibraryItemValues uses the same timestamp for last used and updated at`() {
        val touch = touchLibraryItemValues(123L)

        assertEquals(123L, touch.lastUsedAt)
        assertEquals(123L, touch.updatedAt)
    }

    @Test
    fun `buildPlaceLibraryRows creates place and linked library item`() {
        val rows =
            buildPlaceLibraryRows(
                name = "Home",
                lat = 25.0,
                lng = 121.5,
                description = "Base",
                tags = listOf("home"),
                sortOrder = 3,
                now = 99L,
                uuidFactory = sequentialUuidFactory(),
            )

        assertEquals("wp-1", rows.place.id)
        assertEquals("Home", rows.place.name)
        assertEquals(25.0, rows.place.lat, 0.0)
        assertEquals(121.5, rows.place.lng, 0.0)
        assertEquals(listOf("home"), rows.place.tags)
        assertEquals("wp-2", rows.item.id)
        assertEquals(LibraryItemKind.Place, rows.item.kind)
        assertEquals("wp-1", rows.item.placeId)
        assertEquals(3, rows.item.sortOrder)
        assertEquals(99L, rows.item.createdAt)
    }

    @Test
    fun `buildRouteLibraryRows creates revision one and ordered waypoints`() {
        val rows =
            buildRouteLibraryRows(
                name = "Morning route",
                waypoints = listOf(LatLng(25.0, 121.5), LatLng(25.1, 121.6)),
                defaultSpeedKmh = 18.0,
                mode = "Loop",
                description = null,
                sortOrder = 4,
                now = 100L,
                uuidFactory = sequentialUuidFactory(),
            )

        assertEquals("wp-1", rows.route.id)
        assertEquals("wp-2", rows.revision.id)
        assertEquals("wp-2", rows.route.currentRevisionId)
        assertEquals(1, rows.revision.revisionNumber)
        assertEquals("wp-3", rows.item.id)
        assertEquals(LibraryItemKind.Route, rows.item.kind)
        assertEquals("wp-1", rows.item.routeId)
        assertEquals(listOf("wp-4", "wp-5"), rows.waypoints.map { it.id })
        assertEquals(listOf(0, 1), rows.waypoints.map { it.sequence })
        assertEquals(listOf(25.0, 25.1), rows.waypoints.map { it.lat })
    }

    @Test
    fun `buildWaypointEntities preserves waypoint order`() {
        val waypoints =
            listOf(
                LatLng(25.0, 121.5),
                LatLng(25.1, 121.6),
                LatLng(25.2, 121.7),
            )

        val entities =
            buildWaypointEntities(
                routeRevisionId = "rev-1",
                waypoints = waypoints,
                uuidFactory = sequentialUuidFactory(),
            )

        assertEquals(listOf("wp-1", "wp-2", "wp-3"), entities.map { it.id })
        assertEquals(listOf("rev-1", "rev-1", "rev-1"), entities.map { it.routeRevisionId })
        assertEquals(listOf(0, 1, 2), entities.map { it.sequence })
        assertEquals(listOf(25.0, 25.1, 25.2), entities.map { it.lat })
        assertEquals(listOf(121.5, 121.6, 121.7), entities.map { it.lng })
    }

    @Test
    fun `reorderLibraryItems rewrites sort order around moved item`() {
        val items =
            listOf(
                LibraryItemEntity(id = "a", kind = LibraryItemKind.Place, placeId = "place-a", sortOrder = 0, createdAt = 1L, updatedAt = 1L),
                LibraryItemEntity(id = "b", kind = LibraryItemKind.Place, placeId = "place-b", sortOrder = 1, createdAt = 2L, updatedAt = 2L),
                LibraryItemEntity(id = "c", kind = LibraryItemKind.Route, routeId = "route-c", sortOrder = 2, createdAt = 3L, updatedAt = 3L),
            )

        val reordered = reorderLibraryItems(items, itemId = "c", toIndex = 0)

        assertEquals(listOf("c", "a", "b"), reordered.map { it.id })
        assertEquals(listOf(0, 1, 2), reordered.map { it.sortOrder })
    }

    @Test
    fun `reorderLibraryItems clamps destination index`() {
        val items =
            listOf(
                LibraryItemEntity(id = "a", kind = LibraryItemKind.Place, placeId = "place-a", sortOrder = 0, createdAt = 1L, updatedAt = 1L),
                LibraryItemEntity(id = "b", kind = LibraryItemKind.Place, placeId = "place-b", sortOrder = 1, createdAt = 2L, updatedAt = 2L),
                LibraryItemEntity(id = "c", kind = LibraryItemKind.Route, routeId = "route-c", sortOrder = 2, createdAt = 3L, updatedAt = 3L),
            )

        val reordered = reorderLibraryItems(items, itemId = "a", toIndex = 99)

        assertEquals(listOf("b", "c", "a"), reordered.map { it.id })
        assertEquals(listOf(0, 1, 2), reordered.map { it.sortOrder })
    }

    @Test
    fun `toDomain maps route content and sorts waypoints`() {
        val record =
            LibraryItemRecord(
                item =
                    LibraryItemEntity(
                        id = "item-1",
                        kind = LibraryItemKind.Route,
                        routeId = "route-1",
                        sortOrder = 4,
                        lastUsedAt = 99L,
                        createdAt = 10L,
                        updatedAt = 11L,
                    ),
                route =
                    RouteWithContent(
                        route =
                            RouteEntity(
                                id = "route-1",
                                name = "Route A",
                                defaultSpeedKmh = 20.0,
                                mode = "PingPong",
                                currentRevisionId = "rev-1",
                                createdAt = 20L,
                                updatedAt = 21L,
                            ),
                        currentRevision =
                            RouteRevisionEntity(
                                id = "rev-1",
                                routeId = "route-1",
                                revisionNumber = 1,
                                createdAt = 22L,
                            ),
                        waypoints =
                            listOf(
                                WaypointEntity(id = "wp-2", routeRevisionId = "rev-1", sequence = 1, lat = 25.1, lng = 121.6),
                                WaypointEntity(id = "wp-1", routeRevisionId = "rev-1", sequence = 0, lat = 25.0, lng = 121.5),
                            ),
                    ),
            )

        val domain = record.toDomain()

        assertEquals("Route A", domain.name)
        assertEquals(listOf(0, 1), domain.waypoints.map { it.sequence })
        assertEquals(listOf(25.0, 25.1), domain.waypoints.map { it.lat })
        assertEquals(20.0, domain.route?.defaultSpeedKmh)
        assertEquals("PingPong", domain.route?.mode)
    }

    @Test
    fun `toDomain maps point content`() {
        val record =
            LibraryItemRecord(
                item =
                    LibraryItemEntity(
                        id = "item-2",
                        kind = LibraryItemKind.Place,
                        placeId = "place-1",
                        sortOrder = 0,
                        createdAt = 1L,
                        updatedAt = 1L,
                    ),
                place =
                    PlaceEntity(
                        id = "place-1",
                        name = "Point A",
                        lat = 25.0,
                        lng = 121.5,
                        createdAt = 2L,
                        updatedAt = 2L,
                    ),
            )

        val domain = record.toDomain()

        assertEquals("Point A", domain.name)
        assertEquals(LibraryItemKind.Place, domain.kind)
        assertEquals(25.0, domain.place?.lat)
        assertNull(domain.route)
    }

    private fun sequentialUuidFactory(): () -> String {
        var current = 0
        return {
            current += 1
            "wp-$current"
        }
    }
}
