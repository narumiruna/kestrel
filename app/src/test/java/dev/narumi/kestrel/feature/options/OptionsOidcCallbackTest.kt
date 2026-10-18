package dev.narumi.kestrel.feature.options

import dev.narumi.kestrel.core.cloud.CloudSession
import dev.narumi.kestrel.core.cloud.OidcAuthAttempt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class OptionsOidcCallbackTest {
    @Test
    fun callbackIsConsumedBeforeSyncSuspendsAndCannotReplayAfterRecreation() =
        runBlocking {
            val events = mutableListOf<String>()
            var pendingCallback: String? = "callback"
            var consumeCount = 0
            val auth = FakeOidcAuth()
            auth.exchangeReady.complete(Unit)

            val action =
                launch(start = CoroutineStart.UNDISPATCHED) {
                    handleOptionsOidcCallback(
                        completeLogin = {
                            auth.completeLogin().also { events += "login-complete" }
                        },
                        consumeCallback = {
                            events += "consume"
                            pendingCallback = null
                            consumeCount++
                        },
                    ) { session ->
                        assertSame(auth.savedSession, session)
                        assertNull(pendingCallback)
                        events += "sync"
                        awaitCancellation()
                    }
                }

            assertEquals(listOf("login-complete", "consume", "sync"), events)
            // Activity state saved while sync is suspended must not contain the completed callback.
            val recreatedPendingCallback = pendingCallback
            assertNull(recreatedPendingCallback)
            action.cancelAndJoin()
            assertTrue(action.isCancelled)
            assertEquals(1, consumeCount)
            assertSame(SESSION, auth.savedSession)
            assertNull(auth.durableAttempt)
        }

    @Test
    fun cancellationDuringExchangeConsumesUriButPreservesDurableRecovery() =
        runBlocking {
            val auth = FakeOidcAuth()
            var pendingCallback: String? = "callback"
            var consumeCount = 0
            var syncStarted = false
            var propagatedCancellation = false
            val action =
                launch(start = CoroutineStart.UNDISPATCHED) {
                    try {
                        handleOptionsOidcCallback(
                            completeLogin = auth::completeLogin,
                            consumeCallback = {
                                pendingCallback = null
                                consumeCount++
                            },
                        ) { syncStarted = true }
                    } catch (error: CancellationException) {
                        propagatedCancellation = true
                        throw error
                    }
                }
            val resumableAttempt = checkNotNull(auth.durableAttempt)
            assertEquals("ticket", resumableAttempt.exchangeTicket)
            assertEquals("callback", pendingCallback)
            assertNull(auth.savedSession)

            action.cancelAndJoin()

            assertTrue(propagatedCancellation)
            assertNull(pendingCallback)
            assertEquals(1, consumeCount)
            assertFalse(syncStarted)
            assertEquals(resumableAttempt, auth.durableAttempt)
            assertNull(auth.savedSession)

            // A recreated screen resumes through auth, not through the consumed callback URI.
            auth.exchangeReady.complete(Unit)
            assertSame(SESSION, auth.resumeLogin())
            assertEquals(listOf(resumableAttempt, resumableAttempt), auth.exchangeAttempts)
            assertNull(auth.durableAttempt)
        }

    @Test
    fun invalidCallbackIsConsumedAndFailurePropagatesWithoutSync() =
        runBlocking {
            val failure = IllegalArgumentException()
            var consumed = false
            var syncStarted = false
            var caught: Exception? = null

            try {
                handleOptionsOidcCallback(
                    completeLogin = { throw failure },
                    consumeCallback = { consumed = true },
                ) { syncStarted = true }
            } catch (error: IllegalArgumentException) {
                caught = error
            }

            assertSame(failure, caught)
            assertTrue(consumed)
            assertFalse(syncStarted)
        }

    // Model the auth boundary: persist the exchange ticket before transport, retain it on
    // cancellation, and clear it only after the session is saved. The UI owns only the URI.
    private class FakeOidcAuth {
        var durableAttempt: OidcAuthAttempt? = OidcAuthAttempt("https://example.test", "nonce")
        var savedSession: CloudSession? = null
        val exchangeReady = CompletableDeferred<Unit>()
        val exchangeAttempts = mutableListOf<OidcAuthAttempt>()

        suspend fun completeLogin(): CloudSession {
            durableAttempt = checkNotNull(durableAttempt).copy(exchangeTicket = "ticket")
            return resumeLogin()
        }

        suspend fun resumeLogin(): CloudSession {
            exchangeAttempts += checkNotNull(durableAttempt)
            exchangeReady.await()
            savedSession = SESSION
            durableAttempt = null
            return SESSION
        }
    }

    private companion object {
        val SESSION =
            CloudSession(
                accessToken = "access",
                accessTokenExpiresAt = Long.MAX_VALUE,
                refreshToken = "refresh",
                sessionId = "session",
                userId = "user",
                username = "tester",
            )
    }
}
