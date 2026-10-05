package dev.narumi.kestrel.core.library

import dev.narumi.kestrel.core.library.db.LibraryItemEntity
import dev.narumi.kestrel.core.library.db.LibraryItemRecord
import dev.narumi.kestrel.core.library.db.PlaceEntity
import dev.narumi.kestrel.core.library.db.RouteEntity
import dev.narumi.kestrel.core.library.db.RouteRevisionEntity
import dev.narumi.kestrel.core.library.db.RouteWithContent
import dev.narumi.kestrel.core.library.db.SyncStatus
import dev.narumi.kestrel.core.library.db.WaypointEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class LibraryMapperTest {
    @Test
    fun `place row projects identity timestamps and content`() {
        val place =
            PlaceEntity(
                id = "place-1",
                remoteId = "remote-place-1",
                name = "Point A",
                lat = 25.0,
                lng = 121.5,
                description = "desc",
                tags = listOf("home", "test"),
                syncStatus = SyncStatus.Synced,
                createdAt = 1L,
                updatedAt = 2L,
            )
        val item =
            LibraryItemEntity(
                id = "item-1",
                remoteId = "remote-item-1",
                kind = LibraryItemKind.Place,
                placeId = place.id,
                sortOrder = 7,
                lastUsedAt = 9L,
                createdAt = 6L,
                updatedAt = 8L,
            )
        val result = LibraryItemRecord(item = item, place = place).toDomain()

        assertEquals("Point A", result.name)
        assertEquals(LibraryItemKind.Place, result.kind)
        assertEquals(
            Place("place-1", "remote-place-1", "Point A", 25.0, 121.5, "desc", listOf("home", "test"), 1L, 2L),
            result.place,
        )
        assertEquals(LibraryItem("item-1", "remote-item-1", LibraryItemKind.Place, "place-1", null, 7, 9L, 6L, 8L), result.item)
        assertEquals(null, result.route)
    }

    @Test
    fun `route row projects revision and ordered waypoint metadata`() {
        val route =
            RouteEntity("route-1", "remote-route-1", "Route A", "route desc", 12.5, "Loop", "rev-1", SyncStatus.Dirty, 3L, 4L)
        val revision = RouteRevisionEntity("rev-1", "remote-rev-1", "route-1", 2, 5L)
        val first = WaypointEntity("wp-1", "rev-1", 0, 25.1, 121.6, 8.0, 3.0)
        val second = WaypointEntity("wp-2", "rev-1", 4, 25.2, 121.7, null, null)
        val item = LibraryItemEntity("item-2", "remote-item-2", LibraryItemKind.Route, routeId = "route-1", sortOrder = 3, createdAt = 6L, updatedAt = 8L)
        val result = LibraryItemRecord(item = item, route = RouteWithContent(route, revision, listOf(second, first))).toDomain()

        assertEquals("Route A", result.name)
        assertEquals(LibraryItemKind.Route, result.kind)
        assertEquals(Route("route-1", "remote-route-1", "Route A", "route desc", 12.5, "Loop", "rev-1", 3L, 4L), result.route)
        assertEquals(RouteRevision("rev-1", "remote-rev-1", "route-1", 2, 5L), result.currentRevision)
        assertEquals(
            listOf(Waypoint("wp-1", "rev-1", 0, 25.1, 121.6, 8.0, 3.0), Waypoint("wp-2", "rev-1", 4, 25.2, 121.7, null, null)),
            result.waypoints,
        )
        assertEquals("remote-item-2", result.item.remoteId)
        assertEquals(3, result.item.sortOrder)
        assertEquals(null, result.place)
    }
}
