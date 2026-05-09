package dev.narumi.kestrel.core.library

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
