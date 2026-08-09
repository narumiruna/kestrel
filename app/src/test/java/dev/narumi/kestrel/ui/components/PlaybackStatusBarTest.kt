package dev.narumi.kestrel.ui.components

import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.RuntimeState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlaybackStatusBarTest {
    @Test
    fun idleHasNoGlobalBar() {
        assertNull(playbackBarPresentation(RuntimeState.Idle))
    }

    @Test
    fun pointAndRouteExposeActualStateAndAction() {
        val point = requireNotNull(playbackBarPresentation(RuntimeState.Single(LatLng(25.0, 121.0))))
        assertEquals("Mocking point", point.title)
        assertNull(point.primaryAction)

        val route =
            requireNotNull(
                playbackBarPresentation(
                    RuntimeState.Route(
                        waypoints = listOf(LatLng(0.0, 0.0), LatLng(1.0, 1.0)),
                        speedKmh = 10.0,
                        mode = MovementEngine.Mode.PingPong,
                        paused = true,
                    ),
                ),
            )
        assertEquals("Route paused", route.title)
        assertEquals("2 waypoints · 10 km/h · Ping-pong", route.details)
        assertEquals(PlaybackBarAction.Resume, route.primaryAction)
    }
}
