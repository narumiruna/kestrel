package dev.narumi.kestrel.core.cloud

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class SyncCursorRecoveryTest {
    @Test
    fun uncodedBadCursorResponseRecoversWithoutMatchingEnglish() =
        runBlocking {
            var bootstraps = 0
            recoverSyncCursor(CloudApiException(400, message = "different server prose")) { bootstraps++ }
            assertEquals(1, bootstraps)
        }

    @Test
    fun codedExpiredCursorRecovers() =
        runBlocking {
            var bootstraps = 0
            recoverSyncCursor(CloudApiException(410, "SYNC_CURSOR_EXPIRED", "anything")) { bootstraps++ }
            assertEquals(1, bootstraps)
        }

    @Test
    fun bootstrapBadRequestPropagatesAfterOneAttempt() =
        runBlocking {
            var bootstraps = 0
            val failure = CloudApiException(400, message = "bootstrap rejected")
            val result =
                runCatching {
                    recoverSyncCursor(CloudApiException(400, message = "changes rejected")) {
                        bootstraps++
                        throw failure
                    }
                }
            assertSame(failure, result.exceptionOrNull())
            assertEquals(1, bootstraps)
        }

    @Test
    fun unrelatedFailuresDoNotBootstrapOrChangeTheirIdentity() =
        runBlocking {
            listOf(
                CloudApiException(410, message = "uncoded gone"),
                CloudApiException(401, message = "unauthorized"),
                CloudApiException(403, message = "forbidden"),
                CloudApiException(429, message = "rate limited"),
                CloudApiException(503, message = "unavailable"),
            ).forEach { failure ->
                var bootstraps = 0
                val result = runCatching { recoverSyncCursor(failure) { bootstraps++ } }
                assertSame(failure, result.exceptionOrNull())
                assertEquals(0, bootstraps)
            }
        }
}
