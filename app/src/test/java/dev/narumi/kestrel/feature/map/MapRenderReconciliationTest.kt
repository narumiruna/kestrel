package dev.narumi.kestrel.feature.map

import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.RuntimeState
import org.junit.Assert.assertEquals
import org.junit.Test

class MapRenderReconciliationTest {
    private val draftSpeed = 12.5
    private val draftMode = MovementEngine.Mode.PingPong
    private val draftWaypoints = listOf(LatLng(1.0, 1.0), LatLng(2.0, 2.0))

    @Test
    fun idle_usesDrafts() {
        val render =
            reconcileMapRender(
                runtime = RuntimeState.Idle,
                draftWaypoints = draftWaypoints,
                draftSpeedKmh = draftSpeed,
                draftRouteMode = draftMode,
            )

        assertEquals(RunState.Idle, render.runState)
        assertEquals(draftWaypoints, render.waypoints)
        assertEquals(draftSpeed, render.speedKmh, 0.0)
        assertEquals(draftMode, render.routeMode)
    }

    @Test
    fun single_keepsDraftsForEditingPolyline() {
        // The Single mock dot itself comes from currentMock; the rendered polyline stays on the
        // user's drafts so they can keep building a route while Single is active.
        val render =
            reconcileMapRender(
                runtime = RuntimeState.Single(LatLng(0.0, 0.0)),
                draftWaypoints = draftWaypoints,
                draftSpeedKmh = draftSpeed,
                draftRouteMode = draftMode,
            )

        assertEquals(RunState.Single, render.runState)
        assertEquals(draftWaypoints, render.waypoints)
        assertEquals(draftSpeed, render.speedKmh, 0.0)
        assertEquals(draftMode, render.routeMode)
    }

    @Test
    fun routePlaying_overridesDraftsWithServiceState() {
        val routeWaypoints = listOf(LatLng(10.0, 10.0), LatLng(20.0, 20.0), LatLng(30.0, 30.0))
        val render =
            reconcileMapRender(
                runtime =
                    RuntimeState.Route(
                        waypoints = routeWaypoints,
                        speedKmh = 25.0,
                        mode = MovementEngine.Mode.Loop,
                        paused = false,
                    ),
                draftWaypoints = draftWaypoints,
                draftSpeedKmh = draftSpeed,
                draftRouteMode = draftMode,
            )

        assertEquals(RunState.RoutePlaying, render.runState)
        assertEquals(routeWaypoints, render.waypoints)
        assertEquals(25.0, render.speedKmh, 0.0)
        assertEquals(MovementEngine.Mode.Loop, render.routeMode)
    }

    @Test
    fun routePaused_runStateReflectsPauseFlag() {
        val routeWaypoints = listOf(LatLng(0.0, 0.0), LatLng(1.0, 1.0))
        val render =
            reconcileMapRender(
                runtime =
                    RuntimeState.Route(
                        waypoints = routeWaypoints,
                        speedKmh = 5.0,
                        mode = MovementEngine.Mode.Once,
                        paused = true,
                    ),
                draftWaypoints = emptyList(),
                draftSpeedKmh = draftSpeed,
                draftRouteMode = draftMode,
            )

        assertEquals(RunState.RoutePaused, render.runState)
        assertEquals(routeWaypoints, render.waypoints)
        assertEquals(5.0, render.speedKmh, 0.0)
        assertEquals(MovementEngine.Mode.Once, render.routeMode)
    }
}
