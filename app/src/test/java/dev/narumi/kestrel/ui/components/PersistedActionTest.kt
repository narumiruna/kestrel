package dev.narumi.kestrel.ui.components

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.fail
import org.junit.Test

class PersistedActionTest {
    @Test
    fun successRunsConfirmedWriteExactlyOnce() =
        runBlocking {
            var writes = 0

            val result = runPersistedAction("failed") { writes++ }

            assertSame(PersistedActionResult.Success, result)
            assertEquals(1, writes)
        }

    @Test
    fun failureReturnsActionableMessageAndLeavesPreviousValue() =
        runBlocking {
            var storedValue = "previous"

            val result =
                runPersistedAction("Previous value is unchanged; try again.") {
                    throw IllegalStateException("disk failure")
                    @Suppress("UNREACHABLE_CODE")
                    run { storedValue = "new" }
                }

            assertEquals("previous", storedValue)
            assertEquals(
                PersistedActionResult.Failure("Previous value is unchanged; try again."),
                result,
            )
        }

    @Test
    fun cancellationIsNotMisreportedAsFailure() =
        runBlocking {
            val cancellation = CancellationException("screen closed")

            try {
                runPersistedAction("failed") { throw cancellation }
                fail("CancellationException expected")
            } catch (actual: CancellationException) {
                assertSame(cancellation, actual)
            }
        }
}
