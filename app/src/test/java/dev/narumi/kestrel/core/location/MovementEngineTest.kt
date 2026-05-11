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

    @Test
    fun onceModeResumesFromSeededProgress() {
        val engine =
            MovementEngine(
                waypoints = listOf(a, b),
                speedMps = segmentMeters,
                mode = MovementEngine.Mode.Once,
                initialProgressMeters = segmentMeters * 0.5,
            )

        // Without seeding, the first sample would be at `a`; with a half-segment seed it should be
        // a tick past the midpoint instead of back at the origin.
        val sample = engine.advance(deltaSeconds = 0.1)

        assertFalse(engine.isFinished())
        assertTrue(engine.progressMeters() > segmentMeters * 0.5)
        assertTrue(
            "resumed sample should be past the midpoint latitude, was " + sample.point.lat,
            sample.point.lng > b.lng * 0.4,
        )
    }

    @Test
    fun loopModeResumesFromSeededProgressWithoutWrappingPrematurely() {
        val engine =
            MovementEngine(
                waypoints = listOf(a, b),
                speedMps = segmentMeters,
                mode = MovementEngine.Mode.Loop,
                initialProgressMeters = segmentMeters * 0.25,
            )

        val sample = engine.advance(deltaSeconds = 0.1)

        assertFalse(engine.isFinished())
        // 0.25 + 0.1 of a tick = somewhere between 0.25 and 0.5 of the segment, definitely not at 0.
        assertTrue(engine.progressMeters() > segmentMeters * 0.25)
        assertTrue(engine.progressMeters() < segmentMeters)
        assertTrue(sample.speedMps > 0.0)
    }

    @Test
    fun pingPongResumesFromSeededProgressAndReverseDirection() {
        val engine =
            MovementEngine(
                waypoints = listOf(a, b),
                speedMps = segmentMeters,
                mode = MovementEngine.Mode.PingPong,
                initialProgressMeters = segmentMeters * 0.6,
                initialForward = false,
            )

        // forward = false means we should be moving backwards toward `a`, so progress decreases.
        val sample = engine.advance(deltaSeconds = 0.1)

        assertFalse(engine.isFinished())
        assertFalse("engine should still be heading backwards", engine.isForward())
        assertTrue(engine.progressMeters() < segmentMeters * 0.6)
        assertTrue(engine.progressMeters() > 0.0)
        assertTrue(sample.speedMps > 0.0)
    }

    @Test
    fun initialProgressIsClampedIntoRange() {
        val tooLarge =
            MovementEngine(
                waypoints = listOf(a, b),
                speedMps = segmentMeters,
                mode = MovementEngine.Mode.Loop,
                // Stale or corrupt persisted value beyond the route should not produce out-of-range
                // progress; clamping keeps `advance` consistent on the very first tick after
                // restore.
                initialProgressMeters = segmentMeters * 10,
            )
        assertEquals(segmentMeters, tooLarge.progressMeters(), 1e-6)

        val negative =
            MovementEngine(
                waypoints = listOf(a, b),
                speedMps = segmentMeters,
                mode = MovementEngine.Mode.Loop,
                initialProgressMeters = -123.4,
            )
        assertEquals(0.0, negative.progressMeters(), 1e-6)
    }
}
