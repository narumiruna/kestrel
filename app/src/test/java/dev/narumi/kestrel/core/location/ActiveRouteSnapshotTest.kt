package dev.narumi.kestrel.core.location

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class ActiveRouteSnapshotTest {
    @Test
    fun buildsConsistentRouteStateFromCapturedRoute() {
        val originalStart = LatLng(25.0, 121.0)
        val originalEnd = LatLng(25.1, 121.1)
        val waypoints = mutableListOf(originalStart, originalEnd)
        val engine =
            MovementEngine(
                waypoints = waypoints,
                speedMps = 5.0,
                mode = MovementEngine.Mode.Loop,
            )
        val snapshot =
            ActiveRouteSnapshot.create(
                engine = engine,
                waypoints = waypoints,
                speedKmh = 18.0,
                mode = MovementEngine.Mode.Loop,
            )

        waypoints[0] = LatLng(0.0, 0.0)
        val first = snapshot.toRouteState(progressMeters = 12.5, forward = false)
        val second = snapshot.toRouteState(progressMeters = 25.0, forward = true)

        assertSame(engine, snapshot.engine)
        assertArrayEquals(doubleArrayOf(originalStart.lat, originalEnd.lat), first.lats, 0.0)
        assertArrayEquals(doubleArrayOf(originalStart.lng, originalEnd.lng), first.lngs, 0.0)
        assertEquals(18.0, first.speedKmh, 0.0)
        assertEquals(MovementEngine.Mode.Loop.name, first.mode)
        assertEquals(12.5, first.progressMeters, 0.0)
        assertEquals(false, first.forward)
        assertSame(first.lats, second.lats)
        assertSame(first.lngs, second.lngs)
    }
}
