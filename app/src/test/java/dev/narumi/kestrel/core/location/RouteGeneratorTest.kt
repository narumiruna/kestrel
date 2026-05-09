package dev.narumi.kestrel.core.location

import kotlin.math.abs
import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RouteGeneratorTest {
    @Test
    fun generateIsReproducibleWithSameSeed() {
        val start = LatLng(25.033, 121.5654)

        val first =
            RouteGenerator.generate(
                start = start,
                pointCount = 16,
                spacingMeters = 500.0,
                random = Random(42),
            )
        val second =
            RouteGenerator.generate(
                start = start,
                pointCount = 16,
                spacingMeters = 500.0,
                random = Random(42),
            )

        assertEquals(first, second)
    }

    @Test
    fun generateKeepsStepDistanceCloseToRequestedSpacing() {
        val route =
            RouteGenerator.generate(
                start = LatLng(0.0, 0.0),
                pointCount = 25,
                spacingMeters = 300.0,
                random = Random(7),
            )

        route.zipWithNext().forEach { (a, b) ->
            val d = haversineMeters(a, b)
            assertTrue(abs(d - 300.0) < 0.1)
        }
    }
}
