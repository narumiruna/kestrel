package dev.narumi.kestrel.core.cloud

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.Instant

class AndroidQrLoginCoordinatorTest {
    @Test
    fun claimsAndPersistsAConfirmationBoundToTheScannedServer() =
        runBlocking {
            val fixture = fixture()

            val progress = fixture.coordinator.prepare(QR_VALUE, "Google Pixel", "0.8.0")

            val confirmation = progress as AndroidQrLoginProgress.Confirmation
            assertEquals("admin", confirmation.details.username)
            assertEquals("123-456", confirmation.details.matchingCode)
            assertEquals("https://cloud.example.test", confirmation.details.publicOrigin)
            assertEquals("https://cloud.example.test/api/backend", fixture.api.claimBaseUrl)
            assertEquals(
                43,
                fixture.api.claimRequest
                    ?.verifierChallenge
                    ?.length,
            )
            assertNotNull(fixture.store.attempt)
            assertFalse(fixture.store.attempt!!.confirmed)
            assertTrue(fixture.events.none { it.startsWith("save-session") })
        }

    @Test
    fun confirmationPollAndCompletionSaveOneSessionBeforeClearingAttempt() =
        runBlocking {
            val fixture = fixture()
            fixture.coordinator.prepare(QR_VALUE, "Google Pixel", "0.8.0")
            fixture.api.exchangeOutcomes.add(AndroidQrExchangeResult.Pending(5))
            fixture.api.exchangeOutcomes.add(AndroidQrExchangeResult.Complete(SESSION))

            val waiting = fixture.coordinator.confirm() as AndroidQrLoginProgress.Waiting
            assertEquals(5, waiting.retryAfterSeconds)
            assertTrue(fixture.store.attempt!!.confirmed)
            assertEquals(
                "https://cloud.example.test/api/backend",
                fixture.configuredApiBaseUrl,
            )

            val completed = fixture.coordinator.poll() as AndroidQrLoginProgress.Completed
            assertEquals(SESSION.sessionId, completed.session.sessionId)
            assertNotNull(completed.session.refreshRequestId)
            assertNull(fixture.store.attempt)
            assertEquals(1, fixture.savedSessions.size)
            assertTrue(
                fixture.events.indexOfFirst { it.startsWith("save-session") } <
                    fixture.events.lastIndexOf("clear-attempt"),
            )
        }

    @Test
    fun ambiguousExchangeFailureSurvivesProcessRestartAndRetriesSameAttempt() =
        runBlocking {
            val fixture = fixture()
            fixture.coordinator.prepare(QR_VALUE, "Google Pixel", "0.8.0")
            fixture.api.exchangeOutcomes.add(IOException("response lost"))
            fixture.api.exchangeOutcomes.add(AndroidQrExchangeResult.Complete(SESSION))

            assertThrows(IOException::class.java) {
                runBlocking { fixture.coordinator.confirm() }
            }
            assertTrue(fixture.store.attempt!!.confirmed)

            val resumed = fixture.coordinator.resume() as AndroidQrLoginProgress.Completed
            assertEquals(SESSION.sessionId, resumed.session.sessionId)
            assertEquals(2, fixture.api.exchangeCalls)
            assertEquals(1, fixture.savedSessions.size)
        }

    @Test
    fun persistenceFailureRevokesCreatedSessionAndKeepsRecoveryAttempt() =
        runBlocking {
            val fixture = fixture(failSessionSave = true)
            fixture.coordinator.prepare(QR_VALUE, "Google Pixel", "0.8.0")
            fixture.api.exchangeOutcomes.add(AndroidQrExchangeResult.Complete(SESSION))

            assertThrows(IllegalStateException::class.java) {
                runBlocking { fixture.coordinator.confirm() }
            }
            assertEquals(listOf(SESSION.accessToken), fixture.api.revokedAccessTokens)
            assertNotNull(fixture.store.attempt)
            assertTrue(fixture.savedSessions.isEmpty())
        }

    @Test
    fun denialAndExpiryAreTerminalAndClearSecrets() =
        runBlocking {
            val deniedFixture = fixture()
            deniedFixture.coordinator.prepare(QR_VALUE, "Google Pixel", "0.8.0")
            deniedFixture.api.exchangeOutcomes.add(
                CloudApiException(statusCode = 403, message = "denied"),
            )
            assertEquals(AndroidQrLoginProgress.Denied, deniedFixture.coordinator.confirm())
            assertNull(deniedFixture.store.attempt)

            val expiredFixture = fixture(now = NOW + 6 * 60 * 1_000L)
            expiredFixture.store.attempt = claimedAttempt(expiresAt = NOW)
            assertEquals(AndroidQrLoginProgress.Expired, expiredFixture.coordinator.resume())
            assertNull(expiredFixture.store.attempt)
        }

    @Test
    fun cancelledClaimKeepsTheAttemptForProcessRecovery() {
        val fixture = fixture()
        fixture.api.claimFailure = CancellationException("cancelled")

        assertThrows(CancellationException::class.java) {
            runBlocking { fixture.coordinator.prepare(QR_VALUE, "Google Pixel", "0.8.0") }
        }
        assertNotNull(fixture.store.attempt)
        assertTrue(fixture.savedSessions.isEmpty())
    }

    @Test
    fun competingClaimIsTerminalButDoesNotCreateOrPersistASession() =
        runBlocking {
            val fixture = fixture()
            fixture.api.claimFailure = CloudApiException(statusCode = 409, message = "claimed")

            assertThrows(CloudApiException::class.java) {
                runBlocking { fixture.coordinator.prepare(QR_VALUE, "Google Pixel", "0.8.0") }
            }
            assertNull(fixture.store.attempt)
            assertTrue(fixture.savedSessions.isEmpty())
        }

    private fun fixture(
        failSessionSave: Boolean = false,
        now: Long = NOW,
    ): Fixture {
        val events = mutableListOf<String>()
        val store = FakeAttemptStore(events)
        val api = FakeAndroidQrLoginApi(now)
        val savedSessions = mutableListOf<CloudSession>()
        var configuredApiBaseUrl: String? = null
        val coordinator =
            AndroidQrLoginCoordinator(
                api = api,
                attemptStore = store,
                persistSession = { session ->
                    events += "save-session:${session.sessionId}"
                    if (failSessionSave) error("storage failed")
                    savedSessions += session
                },
                setApiBaseUrl = { configuredApiBaseUrl = it },
                nowMillis = { now },
                randomBytes = { size -> ByteArray(size) { index -> index.toByte() } },
                newRefreshRequestId = { "refresh-request" },
            )
        return Fixture(
            api = api,
            coordinator = coordinator,
            events = events,
            savedSessions = savedSessions,
            store = store,
            configuredApiBaseUrlProvider = { configuredApiBaseUrl },
        )
    }

    private data class Fixture(
        val api: FakeAndroidQrLoginApi,
        val coordinator: AndroidQrLoginCoordinator,
        val events: MutableList<String>,
        val savedSessions: MutableList<CloudSession>,
        val store: FakeAttemptStore,
        val configuredApiBaseUrlProvider: () -> String?,
    ) {
        val configuredApiBaseUrl: String? get() = configuredApiBaseUrlProvider()
    }

    private class FakeAttemptStore(
        private val events: MutableList<String>,
    ) : AndroidQrLoginAttemptPersistence {
        var attempt: AndroidQrLoginAttempt? = null

        override fun load(): AndroidQrLoginAttempt? = attempt

        override fun save(attempt: AndroidQrLoginAttempt) {
            this.attempt = attempt
            events += "save-attempt"
        }

        override fun compareAndSet(
            expected: AndroidQrLoginAttempt,
            updated: AndroidQrLoginAttempt,
        ): Boolean {
            if (attempt != expected) return false
            attempt = updated
            events += "update-attempt"
            return true
        }

        override fun compareAndClear(expected: AndroidQrLoginAttempt): Boolean {
            if (attempt != expected) return false
            attempt = null
            events += "clear-attempt"
            return true
        }

        override fun clear() {
            attempt = null
            events += "clear-attempt"
        }
    }

    private class FakeAndroidQrLoginApi(
        private val now: Long,
    ) : AndroidQrLoginApi {
        val exchangeOutcomes = ArrayDeque<Any>()
        val revokedAccessTokens = mutableListOf<String>()
        var claimBaseUrl: String? = null
        var claimFailure: Exception? = null
        var claimRequest: ClaimAndroidLoginRequest? = null
        var exchangeCalls = 0

        override suspend fun claimAndroidLogin(
            apiBaseUrl: String,
            attemptId: String,
            request: ClaimAndroidLoginRequest,
        ): ClaimAndroidLoginResponse {
            claimFailure?.let { throw it }
            claimBaseUrl = apiBaseUrl
            claimRequest = request
            return ClaimAndroidLoginResponse(
                attemptId = attemptId,
                expiresAt = Instant.ofEpochMilli(now + 5 * 60 * 1_000L).toString(),
                matchingCode = "123-456",
                pollIntervalSeconds = 5,
                serverOrigin = "https://cloud.example.test",
                user = AndroidLoginUser("admin"),
            )
        }

        override suspend fun exchangeAndroidLogin(
            apiBaseUrl: String,
            attemptId: String,
            request: ExchangeAndroidLoginRequest,
        ): AndroidQrExchangeResult {
            exchangeCalls += 1
            return when (val outcome = exchangeOutcomes.removeFirst()) {
                is Exception -> throw outcome
                else -> outcome as AndroidQrExchangeResult
            }
        }

        override suspend fun revokeSession(
            accessToken: String,
            apiBaseUrl: String,
        ) {
            revokedAccessTokens += accessToken
        }
    }

    companion object {
        private const val ATTEMPT_ID = "123e4567-e89b-42d3-a456-426614174000"
        private const val SECRET = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789"
        private const val NOW = 1_800_000_000_000L
        private const val QR_VALUE =
            "https://cloud.example.test/login/android#attempt=$ATTEMPT_ID&secret=$SECRET&v=1"
        private val SESSION =
            CloudSession(
                accessToken = "access-token",
                accessTokenExpiresAt = NOW + 15 * 60 * 1_000L,
                refreshToken = "refresh-token",
                sessionId = "session-1",
                userId = "user-1",
                username = "admin",
            )

        private fun claimedAttempt(expiresAt: Long) =
            AndroidQrLoginAttempt(
                apiBaseUrl = "https://cloud.example.test/api/backend",
                appVersion = "0.8.0",
                attemptId = ATTEMPT_ID,
                confirmed = true,
                deviceName = "Google Pixel",
                expiresAt = expiresAt,
                matchingCode = "123-456",
                pollIntervalSeconds = 5,
                publicOrigin = "https://cloud.example.test",
                qrSecret = SECRET,
                username = "admin",
                verifier = SECRET,
            )
    }
}
