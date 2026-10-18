package dev.narumi.kestrel.ui.components

import dev.narumi.kestrel.R
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
        assertEquals(R.string.mocking_point, point.title)
        assertNull(point.primaryAction)

        val route =
            requireNotNull(
                playbackBarPresentation(
                    RuntimeState.Route(
                        waypoints = listOf(LatLng(0.0, 0.0), LatLng(1.0, 1.0)),
                        speedKmh = 10.0,
                        mode = MovementEngine.Mode.PingPong,
                        paused = true,
                        playbackId = "test-playback",
                    ),
                ),
            )
        assertEquals(R.string.route_paused, route.title)
        assertEquals(MovementEngine.Mode.PingPong, (route.runtime as RuntimeState.Route).mode)
        assertEquals(PlaybackBarAction.Resume, route.primaryAction)
    }
}
