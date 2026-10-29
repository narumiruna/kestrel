package dev.narumi.kestrel.core.map

import dev.narumi.kestrel.core.cloud.CloudRoutePayload
import dev.narumi.kestrel.core.location.LatLng
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class KestrelMapGeometryTest {
    @Test
    fun routeSourcesDoNotSimplifyTheStoredGeometry() {
        assertEquals(0f, routeGeometryOptions()["tolerance"])
    }

    @Test
    fun lineUsesNearestWorldInBothDirectionsWithoutChangingWaypoints() {
        val payload =
            Json { ignoreUnknownKeys = true }.decodeFromString<CloudRoutePayload>(
                checkNotNull(checkNotNull(javaClass.classLoader).getResource("route-assistant-path.json")).readText(),
            )
        val points = checkNotNull(payload.currentRevision).waypoints.map { LatLng(it.latitude, it.longitude) }
        val original = points.toList()
        val line = routeLinePoints(points)
        listOf(179.999, 180.0026, 180.0026).forEachIndexed { index, longitude ->
            assertEquals(longitude, line[index].longitude(), 1e-12)
        }
        assertEquals(points.map { it.lat }, line.map { it.latitude() })
        assertEquals(original, points)
        val reversed = routeLinePoints(points.reversed())
        listOf(-179.9974, -179.9974, -180.001).forEachIndexed { index, longitude ->
            assertEquals(longitude, reversed[index].longitude(), 1e-12)
        }
    }

    @Test
    fun ordinaryAndHalfWorldPathsKeepExactCoordinates() {
        val points = listOf(LatLng(1.0, -90.0), LatLng(2.0, 90.0), LatLng(3.0, 121.5654))
        assertEquals(points.map { it.lng }, routeLinePoints(points).map { it.longitude() })
        assertEquals(emptyList<Double>(), routeLinePoints(emptyList()).map { it.longitude() })
    }

    @Test
    fun repeatedCrossingsStayInTheNearestWorld() {
        val points = listOf(179.9, -179.9, 179.8, -179.8).map { LatLng(0.0, it) }
        val expected = listOf(179.9, 180.1, 179.8, 180.2)
        routeLinePoints(points).forEachIndexed { index, point ->
            assertEquals(expected[index], point.longitude(), 1e-12)
        }
    }
}
