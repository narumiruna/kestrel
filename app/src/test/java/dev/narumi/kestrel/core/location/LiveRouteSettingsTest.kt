package dev.narumi.kestrel.core.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveRouteSettingsTest {
    private val waypoints = listOf(LatLng(0.0, 0.0), LatLng(0.0, 0.001))
    private val distance = haversineMeters(waypoints.first(), waypoints.last())

    @Test
    fun speedChangeKeepsEngineProgressAndReverseDirection() {
        val route = route(MovementEngine.Mode.PingPong, forward = false)
        val before = route.toRouteState()
        val updated = route.withSettings(route.playbackId, speedKmh = 36.0, mode = null)

        assertSame(route.engine, updated.engine)
        assertEquals(route.playbackId, updated.playbackId)
        assertSame(before.lats, updated.toRouteState().lats)
        assertSame(before.lngs, updated.toRouteState().lngs)
        assertEquals(before.progressMeters, updated.engine.progressMeters(), 0.0)
        assertFalse(updated.engine.isForward())
        assertEquals(36.0, updated.toRouteState().speedKmh, 0.0)
        assertEquals(MovementEngine.Mode.PingPong.name, updated.toRouteState().mode)
        val sample = updated.engine.advance(0.5)
        assertEquals(before.progressMeters - 5.0, updated.engine.progressMeters(), 1e-6)
        assertEquals(10.0, sample.speedMps, 0.0)
        assertEquals(270.0, sample.bearingDeg, 1e-6)
    }

    @Test
    fun everyModeTransitionKeepsPositionAndUsesTheNewMode() {
        MovementEngine.Mode.entries.forEach { from ->
            MovementEngine.Mode.entries.forEach { to ->
                val route = route(from, forward = false)
                val before = route.engine.progressMeters()
                val updated = route.withSettings(route.playbackId, speedKmh = null, mode = to)
                assertSame(route.engine, updated.engine)
                assertEquals(before, updated.engine.progressMeters(), 0.0)
                assertEquals(18.0, updated.speedKmh, 0.0)
                assertEquals(to.name, updated.toRouteState().mode)
                updated.engine.advance(0.2)
                val keepsReverse = from == MovementEngine.Mode.PingPong && to == from
                assertEquals(before + if (keepsReverse) -1.0 else 1.0, updated.engine.progressMeters(), 1e-6)
            }
        }
    }

    @Test
    fun switchingToOnceFinishesAtTheEndpoint() {
        val route = route(MovementEngine.Mode.Loop)
        val updated = route.withSettings(route.playbackId, speedKmh = distance * 3.6, mode = MovementEngine.Mode.Once)
        val sample = updated.engine.advance(1.0)
        assertTrue(updated.engine.isFinished())
        assertEquals(distance, updated.engine.progressMeters(), 1e-6)
        assertEquals(waypoints.last(), sample.point)
        assertEquals(0.0, sample.speedMps, 0.0)
    }

    @Test
    fun switchingAwayFromOnceDoesNotFinishTheRoute() {
        listOf(MovementEngine.Mode.Loop, MovementEngine.Mode.PingPong).forEach { mode ->
            val route = route(MovementEngine.Mode.Once)
            val updated = route.withSettings(route.playbackId, speedKmh = distance * 3.6, mode = mode)
            updated.engine.advance(1.0)
            assertFalse(updated.engine.isFinished())
            assertEquals(distance * 0.5, updated.engine.progressMeters(), 1e-6)
            assertEquals(mode != MovementEngine.Mode.PingPong, updated.engine.isForward())
        }
    }

    @Test
    fun fastPingPongCanReflectSeveralTimesInOneTick() {
        val route = route(MovementEngine.Mode.PingPong)
        val updated = route.withSettings(route.playbackId, speedKmh = distance * 5.0 * 3.6, mode = null)
        updated.engine.advance(1.0)
        assertEquals(distance * 0.5, updated.engine.progressMeters(), 1e-6)
        assertFalse(updated.engine.isForward())
        assertFalse(updated.engine.isFinished())
    }

    @Test
    fun zeroLengthRouteKeepsItsLocationWhenChangingMode() {
        val point = LatLng(25.0, 121.0)
        val engine = MovementEngine(listOf(point, point), 5.0, MovementEngine.Mode.Once)
        MovementEngine.Mode.entries.forEach { mode ->
            engine.updateSettings(10.0, mode)
            val sample = engine.advance(1.0)
            assertEquals(point, sample.point)
            assertEquals(0.0, sample.speedMps, 0.0)
            assertEquals(0.0, engine.progressMeters(), 0.0)
        }
    }

    @Test
    fun invalidSpeedDoesNotPartiallyApplySettings() {
        listOf(0.0, -1.0, Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, Double.MIN_VALUE).forEach { speed ->
            val route = route(MovementEngine.Mode.PingPong, forward = false)
            val before = route.engine.progressMeters()
            assertThrows(IllegalArgumentException::class.java) {
                route.withSettings(route.playbackId, speedKmh = speed, mode = MovementEngine.Mode.Once)
            }
            assertEquals(before, route.engine.progressMeters(), 0.0)
            assertFalse(route.engine.isForward())
            assertEquals(5.0, route.engine.advance(0.2).speedMps, 0.0)
            assertEquals(before - 1.0, route.engine.progressMeters(), 1e-6)
        }
    }

    @Test
    fun oldPlaybackIdCannotModifyEvenAnIdenticalReplacementRoute() {
        val old = route(MovementEngine.Mode.Once)
        val replacement = route(MovementEngine.Mode.Once)
        assertNotEquals(old.playbackId, replacement.playbackId)
        assertThrows(IllegalArgumentException::class.java) {
            replacement.withSettings(old.playbackId, speedKmh = 36.0, mode = MovementEngine.Mode.Loop)
        }
        assertEquals(5.0, replacement.engine.advance(0.0).speedMps, 0.0)
        assertEquals(MovementEngine.Mode.Once.name, replacement.toRouteState().mode)
    }

    @Test
    fun partialUpdatesPreserveTheOtherSettingAndRejectAnEmptyRequest() {
        val initial = route(MovementEngine.Mode.Once)
        val loop = initial.withSettings(initial.playbackId, speedKmh = null, mode = MovementEngine.Mode.Loop)
        val faster = loop.withSettings(loop.playbackId, speedKmh = 36.0, mode = null)
        assertEquals(MovementEngine.Mode.Loop, faster.mode)
        assertEquals(36.0, faster.speedKmh, 0.0)
        assertThrows(IllegalArgumentException::class.java) {
            faster.withSettings(faster.playbackId, speedKmh = null, mode = null)
        }
    }

    @Test
    fun runtimePublicationPreservesPauseAndPlaybackIdentity() {
        listOf(false, true).forEach { paused ->
            val initial = route(MovementEngine.Mode.Once)
            val runtime = initial.toRuntimeState(paused)
            val updated = initial.withSettings(runtime.playbackId, speedKmh = 36.0, mode = MovementEngine.Mode.Loop)
            assertEquals(
                runtime.copy(speedKmh = 36.0, mode = MovementEngine.Mode.Loop),
                updated.toRuntimeState(paused = runtime.paused),
            )
            assertEquals(distance * 0.5, updated.engine.progressMeters(), 0.0)
        }
    }

    @Test
    fun updatedSnapshotRestoresSpeedModeProgressAndDirectionTogether() {
        val initial = route(MovementEngine.Mode.PingPong, forward = false)
        val updated = initial.withSettings(initial.playbackId, speedKmh = 36.0, mode = null)
        val saved = updated.toRouteState()
        val restored =
            MovementEngine(
                waypoints,
                speedMps = saved.speedKmh / 3.6,
                mode = MovementEngine.Mode.valueOf(saved.mode),
                initialProgressMeters = saved.progressMeters,
                initialForward = saved.forward,
            )
        assertEquals(updated.engine.advance(0.5), restored.advance(0.5))
    }

    private fun route(
        mode: MovementEngine.Mode,
        forward: Boolean = true,
    ): ActiveRouteSnapshot =
        ActiveRouteSnapshot.create(
            engine = MovementEngine(waypoints, 5.0, mode, initialProgressMeters = distance * 0.5, initialForward = forward),
            waypoints = waypoints,
            speedKmh = 18.0,
            mode = mode,
        )
}
