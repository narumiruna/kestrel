package dev.narumi.kestrel.core.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

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
    fun interpolationCrossesDatelineInBothDirectionsWithExactEndpoints() {
        val west = LatLng(10.0, 179.9)
        val east = LatLng(20.0, -179.9)
        for ((a, b) in listOf(west to east, east to west)) {
            assertEquals(a, lerpLatLng(a, b, 0.0))
            assertEquals(b, lerpLatLng(a, b, 1.0))
            val midpoint = lerpLatLng(a, b, 0.5)
            assertEquals(15.0, midpoint.lat, 0.0)
            assertEquals(180.0, abs(midpoint.lng), 0.0)
            assertTrue(abs(lerpLatLng(a, b, 0.75).lng) > 179.0)
        }
    }

    @Test
    fun interpolationPreservesNonCrossingArithmeticIncludingHalfWorld() {
        val a = LatLng(25.033, -90.0)
        val b = LatLng(35.6764, 90.0)
        for (t in listOf(0.25, 0.5, 0.75)) {
            assertEquals(
                LatLng(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t),
                lerpLatLng(a, b, t),
            )
        }
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
