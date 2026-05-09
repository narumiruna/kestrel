package dev.narumi.kestrel.core.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MovementEngineTest {
    private val a = LatLng(0.0, 0.0)
    private val b = LatLng(0.0, 0.001)
    private val segmentMeters = haversineMeters(a, b)

    @Test
    fun onceModeClampsToEndAndFinishes() {
        val engine =
            MovementEngine(
                waypoints = listOf(a, b),
                speedMps = segmentMeters,
                mode = MovementEngine.Mode.Once,
            )

        val sample = engine.advance(deltaSeconds = 1.5)

        assertTrue(engine.isFinished())
        assertEquals(segmentMeters, engine.progressMeters(), 1e-6)
        assertEquals(b.lat, sample.point.lat, 1e-9)
        assertEquals(b.lng, sample.point.lng, 1e-9)
        assertEquals(0.0, sample.speedMps, 1e-9)
    }

    @Test
    fun loopModeWrapsProgressToStart() {
        val engine =
            MovementEngine(
                waypoints = listOf(a, b),
                speedMps = segmentMeters,
                mode = MovementEngine.Mode.Loop,
            )

        val sample = engine.advance(deltaSeconds = 1.0)

        assertFalse(engine.isFinished())
        assertEquals(0.0, engine.progressMeters(), 1e-6)
        assertEquals(a.lat, sample.point.lat, 1e-9)
        assertEquals(a.lng, sample.point.lng, 1e-9)
    }

    @Test
    fun pingPongModeReflectsAfterPassingEnd() {
        val engine =
            MovementEngine(
                waypoints = listOf(a, b),
                speedMps = segmentMeters,
                mode = MovementEngine.Mode.PingPong,
            )

        engine.advance(deltaSeconds = 1.0)
        val afterBounce = engine.advance(deltaSeconds = 0.1)

        assertFalse(engine.isFinished())
        assertTrue(engine.progressMeters() < segmentMeters)
        assertEquals(segmentMeters * 0.9, engine.progressMeters(), 1e-6)
        assertTrue(afterBounce.speedMps > 0.0)
    }
}
