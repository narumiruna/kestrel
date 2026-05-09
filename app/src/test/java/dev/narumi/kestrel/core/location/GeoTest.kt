package dev.narumi.kestrel.core.location

import kotlin.math.abs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GeoTest {
    @Test
    fun haversineIsSymmetric() {
        val a = LatLng(25.033, 121.5654)
        val b = LatLng(35.6764, 139.65)

        val ab = haversineMeters(a, b)
        val ba = haversineMeters(b, a)

        assertEquals(ab, ba, 1e-6)
    }

    @Test
    fun bearingMatchesCardinalDirectionsOnEquator() {
        val origin = LatLng(0.0, 0.0)

        assertEquals(90.0, bearingDegrees(origin, LatLng(0.0, 1.0)), 1e-6)
        assertEquals(270.0, bearingDegrees(origin, LatLng(0.0, -1.0)), 1e-6)
        assertEquals(0.0, bearingDegrees(origin, LatLng(1.0, 0.0)), 1e-6)
    }

    @Test
    fun destinationPointNormalizesLongitudeAroundDateline() {
        val start = LatLng(0.0, 179.999)
        val result = destinationPoint(start, bearingDeg = 90.0, distanceMeters = 500.0)

        assertTrue(result.lng in -180.0..180.0)
        assertTrue(result.lng < 0.0)
    }

    @Test
    fun destinationPointDistanceMatchesInputMeters() {
        val start = LatLng(25.033, 121.5654)
        val distance = 1_234.0
        val result = destinationPoint(start, bearingDeg = 45.0, distanceMeters = distance)

        val measured = haversineMeters(start, result)
        assertTrue(abs(measured - distance) < 0.1)
    }
}
