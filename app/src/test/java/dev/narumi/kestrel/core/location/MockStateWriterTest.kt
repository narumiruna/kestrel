package dev.narumi.kestrel.core.location

import dev.narumi.kestrel.core.data.MockState
import dev.narumi.kestrel.core.data.RouteState
import dev.narumi.kestrel.core.data.SinglePointState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class MockStateWriterTest {
    @Test
    fun queuedProgressWriteCapturesNewSettingsRatherThanOverwritingThem() =
        runBlocking {
            val original = routeState(10.0, MovementEngine.Mode.Once, 1.0)
            val updated = routeState(20.0, MovementEngine.Mode.PingPong, 8.0)
            var current = original
            val writes = mutableListOf<MockState?>()
            val releaseFirstWrite = CompletableDeferred<Unit>()
            val writer =
                MockStateWriter(snapshot = { current }) { snapshot ->
                    if (writes.isEmpty()) releaseFirstWrite.await()
                    writes += snapshot
                }
            val first = launch(start = CoroutineStart.UNDISPATCHED) { writer.persist() }
            val queued = launch(start = CoroutineStart.UNDISPATCHED) { writer.persist() }
            current = updated
            releaseFirstWrite.complete(Unit)
            first.join()
            queued.join()
            assertEquals(listOf(original, updated), writes)
        }

    @Test
    fun delayedRouteWritersCannotResurrectAStoppedOrReplacedRoute() =
        runBlocking {
            val point = MockState(mode = MockState.Mode.Single, single = SinglePointState(1.0, 2.0))
            listOf(null, point, routeState(15.0, MovementEngine.Mode.Loop, 0.0)).forEach { replacement ->
                var current: MockState? = routeState(10.0, MovementEngine.Mode.Once, 1.0)
                val writes = mutableListOf<MockState?>()
                val releaseFirstWrite = CompletableDeferred<Unit>()
                val writer =
                    MockStateWriter(snapshot = { current }) { snapshot ->
                        if (writes.isEmpty()) releaseFirstWrite.await()
                        writes += snapshot
                    }
                val first = launch(start = CoroutineStart.UNDISPATCHED) { writer.persist() }
                val queued = launch(start = CoroutineStart.UNDISPATCHED) { writer.persist() }
                current = replacement
                releaseFirstWrite.complete(Unit)
                first.join()
                queued.join()
                assertEquals(replacement, writes.last())
            }
        }

    @Test
    fun unavailableSnapshotCancelsWithoutWritingAndReleasesTheLock() =
        runBlocking {
            var available = false
            val writes = mutableListOf<MockState?>()
            val writer =
                MockStateWriter(
                    snapshot = {
                        if (!available) throw CancellationException("Test teardown")
                        null
                    },
                    write = { writes += it },
                )
            assertTrue(runCatching { writer.persist() }.exceptionOrNull() is CancellationException)
            assertTrue(writes.isEmpty())
            available = true
            writer.persist()
            assertEquals(listOf<MockState?>(null), writes)
        }

    @Test
    fun failedWriteReleasesTheLockForTheNextCurrentSnapshot() =
        runBlocking {
            var fail = true
            var current: MockState? = routeState(10.0, MovementEngine.Mode.Once, 1.0)
            val writes = mutableListOf<MockState?>()
            val writer =
                MockStateWriter(snapshot = { current }) { state ->
                    if (fail) throw IOException("Test storage failure")
                    writes += state
                }
            assertTrue(runCatching { writer.persist() }.exceptionOrNull() is IOException)
            fail = false
            current = null
            writer.persist()
            assertEquals(listOf<MockState?>(null), writes)
        }

    private fun routeState(
        speedKmh: Double,
        mode: MovementEngine.Mode,
        progress: Double,
    ) = MockState(
        mode = MockState.Mode.Route,
        route =
            RouteState(
                lats = doubleArrayOf(0.0, 0.0),
                lngs = doubleArrayOf(0.0, 0.001),
                speedKmh = speedKmh,
                mode = mode.name,
                progressMeters = progress,
                forward = false,
            ),
    )
}
