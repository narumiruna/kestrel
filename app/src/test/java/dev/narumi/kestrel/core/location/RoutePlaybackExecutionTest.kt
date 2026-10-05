package dev.narumi.kestrel.core.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RoutePlaybackExecutionTest {
    private var nowMillis = 1000L
    private var acquisitions = 0
    private var releases = 0

    private fun execution() =
        RoutePlaybackExecution(
            elapsedRealtimeMillis = { nowMillis },
            acquire = { acquisitions++ },
            release = { releases++ },
        )

    @Test
    fun delayedTicksIncludeAllElapsedTime() {
        val execution = execution()
        nowMillis += 1000L
        assertEquals(1.0, execution.nextDeltaSeconds(), 0.0)
        nowMillis += 300_000L
        assertEquals(300.0, execution.nextDeltaSeconds(), 0.0)
        nowMillis += 1250L
        assertEquals(1.25, execution.nextDeltaSeconds(), 0.0)
    }

    @Test
    fun pauseReleasesAndResumeExcludesPausedTime() {
        val execution = execution()
        nowMillis += 1000L
        execution.nextDeltaSeconds()
        execution.pause()
        nowMillis += 300_000L
        assertEquals(0.0, execution.nextDeltaSeconds(), 0.0)
        assertEquals(1, releases)
        execution.resume()
        assertEquals(2, acquisitions)
        nowMillis += 1000L
        assertEquals(1.0, execution.nextDeltaSeconds(), 0.0)
    }

    @Test
    fun duplicateActionsDoNotChangeLeaseOrResetRunningClock() {
        val execution = execution()
        nowMillis += 500L
        execution.resume()
        nowMillis += 500L
        assertEquals(1.0, execution.nextDeltaSeconds(), 0.0)
        execution.pause()
        execution.pause()
        execution.resume()
        execution.resume()
        execution.stop()
        execution.stop()
        execution.resume()
        execution.pause()
        assertEquals(2, acquisitions)
        assertEquals(2, releases)
        assertEquals(0.0, execution.nextDeltaSeconds(), 0.0)
    }

    @Test
    fun stoppedPausedExecutionDoesNotReleaseTwice() {
        val execution = execution()
        execution.pause()
        execution.stop()
        assertEquals(1, acquisitions)
        assertEquals(1, releases)
    }

    @Test
    fun replacedExecutionCannotReleaseNewLeaseOnCoroutineExit() {
        val oldExecution = execution()
        oldExecution.stop()
        val newExecution = execution()
        oldExecution.stop()
        assertEquals(2, acquisitions)
        assertEquals(1, releases)
        newExecution.stop()
        assertEquals(2, releases)
    }

    @Test
    fun restoredExecutionStartsWithFreshTimeBaseline() {
        execution().stop()
        nowMillis += 300_000L
        val restored = execution()
        nowMillis += 1000L
        assertEquals(1.0, restored.nextDeltaSeconds(), 0.0)
    }

    @Test
    fun delayedTickAdvancesEngineByElapsedDistance() {
        val execution = execution()
        val engine = MovementEngine(listOf(LatLng(0.0, 0.0), LatLng(0.0, 0.01)), speedMps = 1.0)
        nowMillis += 300_000L
        engine.advance(execution.nextDeltaSeconds())
        assertEquals(300.0, engine.progressMeters(), 1e-6)
        nowMillis += 1_000_000L
        engine.advance(execution.nextDeltaSeconds())
        assertTrue(engine.isFinished())
        execution.stop()
        assertEquals(1, releases)
    }
}
