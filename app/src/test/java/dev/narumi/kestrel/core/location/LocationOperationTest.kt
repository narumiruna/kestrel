package dev.narumi.kestrel.core.location

import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.i18n.UiMessage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class LocationOperationTest {
    @Test
    fun routeValidationAcceptsSupportedBoundaryValues() {
        assertNull(validateRouteRequest(listOf(LatLng(-90.0, -180.0), LatLng(90.0, 180.0)), Double.MIN_VALUE))
    }

    @Test
    fun routeValidationRetainsResourceIdentityForLateResolution() {
        assertEquals(UiMessage(R.string.location_two_waypoints), validateRouteRequest(listOf(LatLng(0.0, 0.0)), 10.0))
        assertEquals(UiMessage(R.string.location_invalid_waypoint), validateRouteRequest(listOf(LatLng(0.0, 0.0), LatLng(91.0, 0.0)), 10.0))
        assertEquals(UiMessage(R.string.location_positive_speed), validateRouteRequest(listOf(LatLng(0.0, 0.0), LatLng(1.0, 1.0)), 0.0))
    }

    @Test
    fun routeSettingsUpdateAcceptsSpeedAndModePartialUpdates() {
        assertEquals(RouteSettingsUpdate(12.0, null), parseRouteSettingsUpdate(12.0, null))
        assertEquals(RouteSettingsUpdate(null, MovementEngine.Mode.PingPong), parseRouteSettingsUpdate(null, MovementEngine.Mode.PingPong.name))
    }

    @Test
    fun routeSettingsUpdateRejectsMalformedExtrasWithTypedReasons() {
        listOf(0.0, -1.0, Double.NaN, Double.POSITIVE_INFINITY).forEach { speed ->
            assertEquals(
                UiMessage(R.string.location_invalid_speed),
                assertThrows(LocationRequestException::class.java) { parseRouteSettingsUpdate(speed, null) }.reason,
            )
        }
        assertEquals(
            UiMessage(R.string.location_invalid_mode),
            assertThrows(LocationRequestException::class.java) { parseRouteSettingsUpdate(null, "unsupported") }.reason,
        )
        assertEquals(
            UiMessage(R.string.location_choose_setting),
            assertThrows(LocationRequestException::class.java) { parseRouteSettingsUpdate(null, null) }.reason,
        )
    }

    @Test
    fun failuresNeverExposeExceptionProseAndKeepPreviousMockContext() {
        assertEquals(UiMessage(R.string.location_permission_error), mockOperationErrorMessage(SecurityException("secret detail"), false))
        assertEquals(UiMessage(R.string.location_invalid_request), mockOperationErrorMessage(IllegalArgumentException("secret detail"), false))
        assertEquals(UiMessage(R.string.location_failed_previous_active), mockOperationErrorMessage(IllegalStateException(), true))
        assertEquals(UiMessage(R.string.location_failed_no_mock), mockOperationErrorMessage(IllegalStateException(), false))
        val reason = UiMessage(R.string.location_route_changed)
        assertEquals(reason, mockOperationErrorMessage(LocationRequestException(reason), true))
    }
}
