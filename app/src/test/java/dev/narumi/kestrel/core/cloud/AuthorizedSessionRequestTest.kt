package dev.narumi.kestrel.core.cloud

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthorizedSessionRequestTest {
    private val original = CloudSession("old", Long.MAX_VALUE, "refresh", "session-1", "user-1", "alice")
    private val refreshed = original.copy(accessToken = "new")

    @Test
    fun successDoesNotRefresh() =
        runBlocking {
            val auth = FakeSessionProvider(original)
            assertEquals("old", withAuthorizedSession(auth, original) { it.accessToken })
            assertEquals(0, auth.refreshes)
        }

    @Test
    fun nonUnauthorizedFailureIsPropagatedWithoutRefresh() =
        runBlocking {
            val auth = FakeSessionProvider(original)
            val failure = CloudApiException(403, message = "forbidden")
            val result = runCatching { withAuthorizedSession(auth, original) { throw failure } }
            assertSame(failure, result.exceptionOrNull())
            assertEquals(0, auth.refreshes)
        }

    @Test
    fun unauthorizedRefreshesOnceAndRetriesWithNewCredential() =
        runBlocking {
            val auth = FakeSessionProvider(original, refreshed)
            val credentials = mutableListOf<String>()
            val result =
                withAuthorizedSession(auth, original) {
                    credentials += it.accessToken
                    if (credentials.size == 1) throw CloudApiException(401, message = "expired")
                    it.accessToken
                }
            assertEquals("new", result)
            assertEquals(listOf("old", "new"), credentials)
            assertEquals(1, auth.refreshes)
            assertEquals(original, auth.expectedSession)
        }

    @Test
    fun concurrentRefreshUsesOnlyTheSameSessionSuccessor() =
        runBlocking {
            val auth = FakeSessionProvider(refreshed)
            val credentials = mutableListOf<String>()
            withAuthorizedSession(auth, original) {
                credentials += it.accessToken
                if (credentials.size == 1) throw CloudApiException(401, message = "expired")
            }
            assertEquals(listOf("old", "new"), credentials)
            assertEquals(1, auth.refreshes)
        }

    @Test
    fun missingOrReplacedSessionFailsClosed() =
        runBlocking {
            for (replacement in listOf(null, refreshed.copy(sessionId = "session-2", userId = "user-2"))) {
                val auth = FakeSessionProvider(replacement)
                var requests = 0
                val result =
                    runCatching {
                        withAuthorizedSession(auth, original) {
                            requests++
                            throw CloudApiException(401, message = "expired")
                        }
                    }
                assertEquals(CloudMessage(CloudMessageId.SessionExpired), result.exceptionOrNull()?.toCloudMessage())
                assertEquals(1, requests)
                assertEquals(1, auth.refreshes)
            }
        }

    @Test
    fun refreshFailurePropagatesWithoutRetry() =
        runBlocking {
            val failure = CloudApiException(503, message = "refresh unavailable")
            val auth =
                object : CloudSyncSessionProvider {
                    override fun currentSession(): CloudSession = original

                    override suspend fun refreshSessionIfCurrent(expectedSession: CloudSession): CloudSession? = throw failure
                }
            var requests = 0
            val result =
                runCatching {
                    withAuthorizedSession(auth, original) {
                        requests++
                        throw CloudApiException(401, message = "expired")
                    }
                }
            assertSame(failure, result.exceptionOrNull())
            assertEquals(1, requests)
        }

    @Test
    fun secondFailureIsPropagatedWithoutAnotherRefresh() =
        runBlocking {
            val auth = FakeSessionProvider(original, refreshed)
            val failure = CloudApiException(401, message = "still expired")
            var requests = 0
            val result =
                runCatching {
                    withAuthorizedSession(auth, original) {
                        if (requests++ == 0) throw CloudApiException(401, message = "expired")
                        throw failure
                    }
                }
            assertSame(failure, result.exceptionOrNull())
            assertEquals(2, requests)
            assertEquals(1, auth.refreshes)
        }

    @Test
    fun cancellationDuringRefreshPropagatesWithoutRetryOrFallback() =
        runBlocking {
            val cancellation = CancellationException("refresh cancelled")
            val auth = FakeSessionProvider(refreshed, refreshCancellation = cancellation)
            val credentials = mutableListOf<String>()
            val result =
                runCatching {
                    withAuthorizedSession(auth, original) {
                        credentials += it.accessToken
                        throw CloudApiException(401, message = "expired")
                    }
                }
            assertSame(cancellation, result.exceptionOrNull())
            assertEquals(1, credentials.size)
            assertEquals(listOf("old"), credentials)
            assertEquals(1, auth.refreshes)
            assertEquals(original, auth.expectedSession)
            assertEquals(0, auth.currentSessionReads)
        }

    @Test
    fun cancellationDuringSecondRequestPropagatesWithoutAnotherRefreshOrFallback() =
        runBlocking {
            val cancellation = CancellationException("retry cancelled")
            val auth = FakeSessionProvider(original, refreshed)
            val credentials = mutableListOf<String>()
            val result =
                runCatching {
                    withAuthorizedSession(auth, original) {
                        credentials += it.accessToken
                        if (credentials.size == 1) throw CloudApiException(401, message = "expired")
                        throw cancellation
                    }
                }
            assertSame(cancellation, result.exceptionOrNull())
            assertEquals(2, credentials.size)
            assertEquals(listOf("old", "new"), credentials)
            assertEquals(1, auth.refreshes)
            assertEquals(original, auth.expectedSession)
            assertEquals(0, auth.currentSessionReads)
        }

    @Test
    fun cancellationPropagatesWithoutRefresh() =
        runBlocking {
            val auth = FakeSessionProvider(original)
            val result = runCatching { withAuthorizedSession(auth, original) { throw CancellationException("cancelled") } }
            assertTrue(result.exceptionOrNull() is CancellationException)
            assertEquals(0, auth.refreshes)
        }

    private class FakeSessionProvider(
        var stored: CloudSession?,
        private val next: CloudSession? = null,
        private val refreshCancellation: CancellationException? = null,
    ) : CloudSyncSessionProvider {
        var refreshes = 0
        var expectedSession: CloudSession? = null
        var currentSessionReads = 0

        override fun currentSession(): CloudSession? {
            currentSessionReads++
            return stored
        }

        override suspend fun refreshSessionIfCurrent(expectedSession: CloudSession): CloudSession? {
            refreshes++
            this.expectedSession = expectedSession
            refreshCancellation?.let { throw it }
            return next?.also { stored = it }
        }
    }
}
