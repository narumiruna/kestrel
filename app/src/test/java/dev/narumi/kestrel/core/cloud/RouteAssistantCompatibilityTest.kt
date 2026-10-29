package dev.narumi.kestrel.core.cloud

import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.haversineMeters
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class RouteAssistantCompatibilityTest {
    private val payload =
        Json { ignoreUnknownKeys = true }.decodeFromString<CloudRoutePayload>(
            checkNotNull(checkNotNull(javaClass.classLoader).getResource("route-assistant-path.json")).readText(),
        )

    @Test
    fun syncPreservesOrderedGeometryEventsAndAllPlaybackModes() {
        val expected = checkNotNull(payload.currentRevision).waypoints
        assertEquals(3, expected.size)
        for ((cloudMode, localMode) in modeMappings) {
            val rows =
                payload
                    .copy(
                        mode = cloudMode,
                        currentRevision =
                            checkNotNull(payload.currentRevision).copy(
                                mode = cloudMode,
                                waypoints = expected.reversed(),
                            ),
                    ).toRouteSyncRows("local-route", "local-revision") { "waypoint" }
            assertEquals(localMode.name, rows.route.mode)
            assertEquals(payload.defaultSpeedKmh, rows.route.defaultSpeedKmh, 0.0)
            assertEquals(listOf(0, 1, 2), rows.waypoints.map { it.sequence })
            assertEquals(expected.map { it.latitude }, rows.waypoints.map { it.lat })
            assertEquals(expected.map { it.longitude }, rows.waypoints.map { it.lng })
            assertEquals(listOf(5.0, null, null), rows.waypoints.map { it.speedKmh })
            assertEquals(listOf(2.0, null, null), rows.waypoints.map { it.pauseSeconds })
            val points = rows.waypoints.map { LatLng(it.lat, it.lng) }
            assertPlayback(points, localMode)
        }
    }

    @Test
    fun distanceUsesTheExisting6371000MeterRadius() {
        assertEquals(6_371_000.0 * Math.PI / 180.0, haversineMeters(LatLng(0.0, 0.0), LatLng(0.0, 1.0)), 1e-9)
        val points = checkNotNull(payload.currentRevision).waypoints.map { LatLng(it.latitude, it.longitude) }
        val distance = points.zipWithNext().sumOf { (a, b) -> haversineMeters(a, b) }
        assertTrue(distance in 725.0..726.0)
    }

    private fun assertPlayback(
        points: List<LatLng>,
        mode: MovementEngine.Mode,
    ) {
        val firstLength = haversineMeters(points[0], points[1])
        val total = firstLength + haversineMeters(points[1], points[2])
        val engine = MovementEngine(points, speedMps = 1.0, mode = mode)
        assertEquals(points.first(), engine.advance(0.0).point)
        val midpoint = engine.advance(firstLength / 2).point
        assertEquals((points[0].lat + points[1].lat) / 2, midpoint.lat, 1e-12)
        assertTrue(abs(midpoint.lng) > 179.99)
        assertEquals(-179.9992, midpoint.lng, 1e-10)
        assertPoint(points[1], engine.advance(firstLength / 2).point)
        assertPoint(
            if (mode == MovementEngine.Mode.Loop) points.first() else points.last(),
            MovementEngine(points, 1.0, mode, total).advance(0.0).point,
        )
        val afterEnd = MovementEngine(points, 1.0, mode).advance(total + firstLength / 2).point
        when (mode) {
            MovementEngine.Mode.Once -> {
                assertPoint(points.last(), afterEnd)
            }

            MovementEngine.Mode.Loop -> {
                assertPoint(midpoint, afterEnd)
            }

            MovementEngine.Mode.PingPong -> {
                assertEquals(points.last().lng, afterEnd.lng, 1e-10)
                assertTrue(afterEnd.lat > points.last().lat && afterEnd.lat < points[1].lat)
            }
        }
    }

    private fun assertPoint(
        expected: LatLng,
        actual: LatLng,
    ) {
        assertEquals(expected.lat, actual.lat, 1e-10)
        assertEquals(expected.lng, actual.lng, 1e-10)
    }

    private val modeMappings =
        listOf(
            CloudRouteMode.ONCE to MovementEngine.Mode.Once,
            CloudRouteMode.LOOP to MovementEngine.Mode.Loop,
            CloudRouteMode.PING_PONG to MovementEngine.Mode.PingPong,
        )
}
