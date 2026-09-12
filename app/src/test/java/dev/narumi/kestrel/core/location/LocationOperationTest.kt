package dev.narumi.kestrel.core.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
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
    fun routeSettingsUpdateAcceptsSpeedAndModePartialUpdates() {
        assertEquals(
            RouteSettingsUpdate(speedKmh = 12.0, mode = null),
            parseRouteSettingsUpdate(speedKmh = 12.0, modeName = null),
        )
        assertEquals(
            RouteSettingsUpdate(speedKmh = null, mode = MovementEngine.Mode.PingPong),
            parseRouteSettingsUpdate(speedKmh = null, modeName = MovementEngine.Mode.PingPong.name),
        )
    }

    @Test
    fun routeSettingsUpdateRejectsMalformedExtrasWithDomainMessages() {
        listOf(0.0, -1.0, Double.NaN, Double.POSITIVE_INFINITY).forEach { speed ->
            assertEquals(
                "Route speed must be a finite number greater than zero km/h.",
                assertThrows(IllegalArgumentException::class.java) {
                    parseRouteSettingsUpdate(speedKmh = speed, modeName = null)
                }.message,
            )
        }
        assertEquals(
            "Choose a valid playback mode.",
            assertThrows(IllegalArgumentException::class.java) {
                parseRouteSettingsUpdate(speedKmh = null, modeName = "unsupported")
            }.message,
        )
        assertEquals(
            "Choose a speed or playback mode to change.",
            assertThrows(IllegalArgumentException::class.java) {
                parseRouteSettingsUpdate(speedKmh = null, modeName = null)
            }.message,
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
