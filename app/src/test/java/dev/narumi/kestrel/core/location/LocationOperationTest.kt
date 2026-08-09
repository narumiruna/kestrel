package dev.narumi.kestrel.core.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LocationOperationTest {
    @Test
    fun routeValidationAcceptsSupportedBoundaryValues() {
        assertNull(
            validateRouteRequest(
                waypoints = listOf(LatLng(-90.0, -180.0), LatLng(90.0, 180.0)),
                speedKmh = Double.MIN_VALUE,
            ),
        )
    }

    @Test
    fun routeValidationRejectsIncompleteAndInvalidRequests() {
        assertEquals(
            "A route needs at least two waypoints.",
            validateRouteRequest(listOf(LatLng(0.0, 0.0)), 10.0),
        )
        assertEquals(
            "Every waypoint must contain valid latitude and longitude values.",
            validateRouteRequest(listOf(LatLng(0.0, 0.0), LatLng(91.0, 0.0)), 10.0),
        )
        assertEquals(
            "Route speed must be greater than zero.",
            validateRouteRequest(listOf(LatLng(0.0, 0.0), LatLng(1.0, 1.0)), 0.0),
        )
    }

    @Test
    fun securityFailuresProduceActionableNonTechnicalMessage() {
        val message =
            mockOperationErrorMessage(
                SecurityException("provider denied secret detail"),
                previousMockActive = false,
            )

        assertTrue(message.contains("mock location"))
        assertTrue(message.contains("permissions"))
        assertTrue(!message.contains("secret detail"))
    }

    @Test
    fun unexpectedFailuresDescribeWhetherPreviousMockWasPreserved() {
        assertTrue(
            mockOperationErrorMessage(IllegalStateException(), previousMockActive = true)
                .contains("previous mock is still active"),
        )
        assertTrue(
            mockOperationErrorMessage(IllegalStateException(), previousMockActive = false)
                .contains("No mock was started"),
        )
    }
}
