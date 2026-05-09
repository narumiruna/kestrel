package dev.narumi.kestrel.core.library

import dev.narumi.kestrel.core.library.db.SyncStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class LibraryMapperTest {
    @Test
    fun `domain models map back to entities`() {
        val place =
            Place(
                id = "place-1",
                remoteId = "remote-place-1",
                name = "Point A",
                lat = 25.0,
                lng = 121.5,
                description = "desc",
                tags = listOf("home", "test"),
                createdAt = 1L,
                updatedAt = 2L,
            )
        val route =
            Route(
                id = "route-1",
                remoteId = "remote-route-1",
                name = "Route A",
                description = "route desc",
                defaultSpeedKmh = 12.5,
                mode = "Loop",
                currentRevisionId = "rev-1",
                createdAt = 3L,
                updatedAt = 4L,
            )
        val revision =
            RouteRevision(
                id = "rev-1",
                remoteId = "remote-rev-1",
                routeId = "route-1",
                revisionNumber = 2,
                createdAt = 5L,
            )
        val waypoint =
            Waypoint(
                id = "wp-1",
                routeRevisionId = "rev-1",
                sequence = 0,
                lat = 25.1,
                lng = 121.6,
                speedKmh = 8.0,
                pauseSeconds = 3.0,
            )
        val item =
            LibraryItem(
                id = "item-1",
                remoteId = "remote-item-1",
                kind = LibraryItemKind.Route,
                routeId = "route-1",
                sortOrder = 7,
                lastUsedAt = 9L,
                createdAt = 6L,
                updatedAt = 8L,
            )

        val placeEntity = place.toEntity(SyncStatus.Synced)
        val routeEntity = route.toEntity(SyncStatus.Dirty)
        val revisionEntity = revision.toEntity()
        val waypointEntity = waypoint.toEntity()
        val itemEntity = item.toEntity(SyncStatus.LocalOnly)

        assertEquals(place, placeEntity.toDomain())
        assertEquals(SyncStatus.Synced, placeEntity.syncStatus)
        assertEquals(route, routeEntity.toDomain())
        assertEquals(SyncStatus.Dirty, routeEntity.syncStatus)
        assertEquals(revision, revisionEntity.toDomain())
        assertEquals(waypoint, waypointEntity.toDomain())
        assertEquals(item, itemEntity.toDomain())
        assertEquals(SyncStatus.LocalOnly, itemEntity.syncStatus)
    }
}
