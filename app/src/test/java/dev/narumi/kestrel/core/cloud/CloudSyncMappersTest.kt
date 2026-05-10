package dev.narumi.kestrel.core.cloud

import dev.narumi.kestrel.core.library.LibraryItemKind
import dev.narumi.kestrel.core.library.db.SyncStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class CloudSyncMappersTest {
    @Test
    fun `place payload maps to synced place entity`() {
        val payload =
            CloudPlacePayload(
                createdAt = "2026-05-09T17:00:00.000Z",
                description = "Capital",
                id = "place-1",
                latitude = 25.03,
                longitude = 121.56,
                name = "Taipei",
                tags = listOf("city"),
                updatedAt = "2026-05-09T17:30:00.000Z",
            )

        val entity = payload.toPlaceEntity(localId = "local-place-1")

        assertEquals("local-place-1", entity.id)
        assertEquals("place-1", entity.remoteId)
        assertEquals("Taipei", entity.name)
        assertEquals(25.03, entity.lat, 0.0)
        assertEquals(121.56, entity.lng, 0.0)
        assertEquals(listOf("city"), entity.tags)
        assertEquals(SyncStatus.Synced, entity.syncStatus)
    }

    @Test
    fun `route payload maps current revision snapshot to local rows`() {
        val payload =
            CloudRoutePayload(
                createdAt = "2026-05-09T17:00:00.000Z",
                currentRevision =
                    CloudRouteRevisionPayload(
                        createdAt = "2026-05-09T18:00:00.000Z",
                        createdBy = "user-1",
                        defaultSpeedKmh = 32.5,
                        id = "revision-3",
                        mode = CloudRouteMode.PING_PONG,
                        revisionNumber = 3,
                        waypoints =
                            listOf(
                                CloudWaypointPayload(
                                    latitude = 25.1,
                                    longitude = 121.6,
                                    sequence = 1,
                                    speedKmh = 20.0,
                                ),
                                CloudWaypointPayload(
                                    latitude = 25.0,
                                    longitude = 121.5,
                                    sequence = 0,
                                    pauseSeconds = 5.0,
                                ),
                            ),
                    ),
                defaultSpeedKmh = 10.0,
                description = "Morning",
                id = "route-1",
                mode = CloudRouteMode.ONCE,
                name = "Commute",
                updatedAt = "2026-05-09T18:30:00.000Z",
            )

        var waypointCounter = 0
        val rows =
            payload.toRouteSyncRows(
                routeId = "local-route-1",
                revisionId = "local-revision-3",
                waypointIdFactory = {
                    waypointCounter += 1
                    "waypoint-$waypointCounter"
                },
            )

        assertEquals("route-1", rows.route.remoteId)
        assertEquals("local-revision-3", rows.route.currentRevisionId)
        assertEquals("PingPong", rows.route.mode)
        assertEquals(32.5, rows.route.defaultSpeedKmh, 0.0)
        assertEquals("revision-3", rows.revision.remoteId)
        assertEquals(3, rows.revision.revisionNumber)
        assertEquals(listOf(0, 1), rows.waypoints.map { it.sequence })
        assertEquals(listOf("waypoint-1", "waypoint-2"), rows.waypoints.map { it.id })
        assertEquals(5.0, rows.waypoints.first().pauseSeconds)
        assertEquals(20.0, rows.waypoints.last().speedKmh)
    }

    @Test
    fun `library item payload maps remote kind and timestamps`() {
        val payload =
            CloudLibraryItemPayload(
                createdAt = "2026-05-09T17:00:00.000Z",
                id = "library-item-1",
                kind = CloudLibraryItemKind.ROUTE,
                lastUsedAt = "2026-05-09T20:00:00.000Z",
                routeId = "route-1",
                sortOrder = 7,
                updatedAt = "2026-05-09T19:00:00.000Z",
            )

        val entity =
            payload.toLibraryItemEntity(
                localId = "local-item-1",
                localPlaceId = null,
                localRouteId = "local-route-1",
            )

        assertEquals("library-item-1", entity.remoteId)
        assertEquals(LibraryItemKind.Route, entity.kind)
        assertEquals("local-route-1", entity.routeId)
        assertEquals(7, entity.sortOrder)
        assertEquals(SyncStatus.Synced, entity.syncStatus)
        assertEquals(1778356800000L, entity.lastUsedAt)
    }
}
