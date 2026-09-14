package dev.narumi.kestrel.core.cloud

import android.content.Context
import dev.narumi.kestrel.core.data.KestrelPrefs
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerializationException
import java.io.IOException
import java.net.URI
import java.security.GeneralSecurityException
import java.util.UUID

internal class CloudAuthRepository private constructor(
    context: Context,
) : CloudSyncSessionProvider {
    private val applicationContext = context.applicationContext
    private val prefs = KestrelPrefs(applicationContext)
    private val sessionStore = CloudSessionStore(applicationContext)
    private val pocketIdAttemptStore = PocketIdAuthAttemptStore(applicationContext)
    private val apiClient = CloudApiClient(baseUrlProvider = { prefs.cloudSettingsValue().apiBaseUrl })
    private val refreshMutex = Mutex()
    private val _hasSession = MutableStateFlow(sessionStore.hasSession())

    val hasSession: StateFlow<Boolean> = _hasSession.asStateFlow()

    override fun currentSession(): CloudSession? =
        sessionStore.load().also { session ->
            _hasSession.value = session != null
        }

    suspend fun isPocketIdEnabled(): Boolean = apiClient.getAuthMethods().pocketId.enabled

    suspend fun beginPocketIdLogin(): String {
        val apiBaseUrl = normalizeCloudApiBaseUrl(prefs.cloudSettingsValue().apiBaseUrl)
        val clientNonce = UUID.randomUUID().toString()
        pocketIdAttemptStore.save(
            PocketIdAuthAttempt(apiBaseUrl = apiBaseUrl, clientNonce = clientNonce),
        )
        return try {
            apiClient.startPocketId(clientNonce).authorizationUrl.also(::validateAuthorizationUrl)
        } catch (failure: CancellationException) {
            clearPocketIdAttemptAfterFailure(failure)
        } catch (failure: CloudApiException) {
            clearPocketIdAttemptAfterFailure(failure)
        } catch (failure: IOException) {
            clearPocketIdAttemptAfterFailure(failure)
        } catch (failure: SerializationException) {
            clearPocketIdAttemptAfterFailure(failure)
        } catch (failure: IllegalArgumentException) {
            clearPocketIdAttemptAfterFailure(failure)
        } catch (failure: IllegalStateException) {
            clearPocketIdAttemptAfterFailure(failure)
        }
    }

    suspend fun completePocketIdLogin(rawCallbackUri: String): CloudSession {
        val callback = parsePocketIdCallback(rawCallbackUri)
        val attempt = pocketIdAttemptStore.load() ?: error("No Pocket ID sign-in is pending")
        require(callback.matchesClientNonce(attempt.clientNonce)) {
            "Pocket ID callback does not match the pending sign-in"
        }
        validatePocketIdAttemptServer(attempt, prefs, pocketIdAttemptStore)

        return when (callback) {
            is PocketIdCallback.Error -> {
                pocketIdAttemptStore.clear()
                if (callback.errorCode == "access_denied") {
                    error("Pocket ID sign-in was cancelled")
                }
                error("Pocket ID sign-in failed")
            }
            is PocketIdCallback.Success -> {
                val resumableAttempt = attempt.copy(exchangeTicket = callback.exchangeTicket)
                pocketIdAttemptStore.save(resumableAttempt)
                completePocketIdExchange(resumableAttempt)
            }
        }
    }

    suspend fun resumePocketIdLogin(): CloudSession? {
        val attempt = pocketIdAttemptStore.load() ?: return null
        if (attempt.exchangeTicket == null) return null
        validatePocketIdAttemptServer(attempt, prefs, pocketIdAttemptStore)
        return completePocketIdExchange(attempt)
    }

    suspend fun loginWithTotp(
        username: String,
        password: String,
        totpCode: String,
    ): CloudSession =
        refreshMutex.withLock {
            apiClient
                .loginWithTotp(username = username, password = password, totpCode = totpCode)
                .let {
                    saveNewSessionOrRevoke(
                        it.copy(refreshRequestId = UUID.randomUUID().toString()),
                    )
                }
        }

    suspend fun loginWithRecoveryCode(
        username: String,
        password: String,
        recoveryCode: String,
    ): CloudSession =
        refreshMutex.withLock {
            apiClient
                .loginWithRecoveryCode(
                    username = username,
                    password = password,
                    recoveryCode = recoveryCode,
                ).let {
                    saveNewSessionOrRevoke(
                        it.copy(refreshRequestId = UUID.randomUUID().toString()),
                    )
                }
        }

    suspend fun refreshSession(): CloudSession? {
        val currentSession = sessionStore.load() ?: return null
        return refreshSessionIfCurrent(currentSession)
    }

    override suspend fun refreshSessionIfCurrent(expectedSession: CloudSession): CloudSession? =
        refreshMutex.withLock {
            val currentSession = sessionStore.load() ?: return@withLock null
            if (currentSession.sessionId != expectedSession.sessionId) {
                return@withLock null
            }
            if (currentSession.refreshToken != expectedSession.refreshToken) {
                _hasSession.value = true
                return@withLock currentSession
            }
            val refreshRequestId =
                currentSession.refreshRequestId ?: UUID.randomUUID().toString()
            saveNewSessionOrRevoke(
                currentSession.copy(refreshRequestId = refreshRequestId),
            )
            var lastFailure: Exception? = null
            repeat(REFRESH_ATTEMPTS) {
                try {
                    return@withLock apiClient
                        .refresh(
                            refreshToken = currentSession.refreshToken,
                            refreshRequestId = refreshRequestId,
                        ).copy(refreshRequestId = UUID.randomUUID().toString())
                        .let { saveNewSessionOrRevoke(it) }
                } catch (failure: CancellationException) {
                    throw failure
                } catch (failure: CloudApiException) {
                    if (failure.statusCode == HTTP_UNAUTHORIZED) {
                        clearSession()
                        return@withLock null
                    }
                    lastFailure = failure
                } catch (failure: IOException) {
                    lastFailure = failure
                } catch (failure: SerializationException) {
                    lastFailure = failure
                }
            }
            _hasSession.value = true
            throw checkNotNull(lastFailure)
        }

    suspend fun logout() {
        refreshMutex.withLock {
            val currentSession = sessionStore.load()
            runCatching {
                if (currentSession != null) {
                    try {
                        apiClient.revokeSession(currentSession.accessToken)
                    } catch (failure: CloudApiException) {
                        if (failure.statusCode != HTTP_UNAUTHORIZED) throw failure
                        val refreshed =
                            apiClient.refresh(
                                refreshToken = currentSession.refreshToken,
                                refreshRequestId = UUID.randomUUID().toString(),
                            )
                        apiClient.revokeSession(refreshed.accessToken)
                    }
                }
            }
            clearSession()
        }
    }

    internal fun refreshSessionPresence() {
        _hasSession.value = sessionStore.hasSession()
    }

    private suspend fun saveNewSessionOrRevoke(session: CloudSession): CloudSession =
        try {
            saveSession(session)
            session
        } catch (failure: IllegalStateException) {
            revokeAfterSaveFailure(session, failure)
        } catch (failure: GeneralSecurityException) {
            revokeAfterSaveFailure(session, failure)
        } catch (failure: IOException) {
            revokeAfterSaveFailure(session, failure)
        } catch (failure: SerializationException) {
            revokeAfterSaveFailure(session, failure)
        }

    private suspend fun revokeAfterSaveFailure(
        session: CloudSession,
        failure: Exception,
    ): Nothing {
        _hasSession.value = false
        runCatching { apiClient.revokeSession(session.accessToken) }
        throw failure
    }

    private fun saveSession(session: CloudSession) {
        sessionStore.save(session)
        _hasSession.value = true
    }

    private fun clearSession() {
        sessionStore.clear()
        _hasSession.value = false
    }

    private suspend fun completePocketIdExchange(attempt: PocketIdAuthAttempt): CloudSession =
        try {
            refreshMutex
                .withLock {
                    exchangePocketIdWithRetry(
                        exchangeTicket = checkNotNull(attempt.exchangeTicket),
                        clientNonce = attempt.clientNonce,
                    ).let {
                        saveNewSessionOrRevoke(
                            it.copy(refreshRequestId = UUID.randomUUID().toString()),
                        )
                    }
                }.also { pocketIdAttemptStore.clear() }
        } catch (failure: CloudApiException) {
            if (failure.statusCode in HTTP_CLIENT_ERROR_RANGE) {
                pocketIdAttemptStore.clear()
            }
            throw failure
        }

    private suspend fun exchangePocketIdWithRetry(
        exchangeTicket: String,
        clientNonce: String,
    ): CloudSession {
        var lastFailure: Exception? = null
        repeat(POCKET_ID_EXCHANGE_ATTEMPTS) {
            try {
                return apiClient.exchangePocketId(
                    exchangeTicket = exchangeTicket,
                    clientNonce = clientNonce,
                )
            } catch (failure: CancellationException) {
                throw failure
            } catch (failure: CloudApiException) {
                if (failure.statusCode in HTTP_CLIENT_ERROR_RANGE) failPocketIdExchange(failure)
                lastFailure = failure
            } catch (failure: IOException) {
                lastFailure = failure
            } catch (failure: SerializationException) {
                lastFailure = failure
            }
        }
        throw checkNotNull(lastFailure)
    }

    private fun failPocketIdExchange(failure: CloudApiException): Nothing = throw failure

    private fun clearPocketIdAttemptAfterFailure(failure: Exception): Nothing {
        runCatching { pocketIdAttemptStore.clear() }
        throw failure
    }

    private fun validateAuthorizationUrl(rawUrl: String) {
        val uri = URI.create(rawUrl)
        check(uri.scheme == "https" || uri.scheme == "http") {
            "Cloud returned an invalid Pocket ID authorization URL"
        }
        check(!uri.host.isNullOrBlank()) { "Cloud returned an invalid Pocket ID authorization URL" }
    }

    companion object {
        private val HTTP_CLIENT_ERROR_RANGE = 400..499
        private const val HTTP_UNAUTHORIZED = 401
        private const val POCKET_ID_EXCHANGE_ATTEMPTS = 2
        private const val REFRESH_ATTEMPTS = 2

        @Volatile private var instance: CloudAuthRepository? = null

        fun getInstance(context: Context): CloudAuthRepository =
            instance ?: synchronized(this) {
                instance ?: CloudAuthRepository(context.applicationContext).also { instance = it }
            }
    }
}

private suspend fun validatePocketIdAttemptServer(
    attempt: PocketIdAuthAttempt,
    prefs: KestrelPrefs,
    attemptStore: PocketIdAuthAttemptStore,
) {
    val currentBaseUrl = normalizeCloudApiBaseUrl(prefs.cloudSettingsValue().apiBaseUrl)
    if (currentBaseUrl != attempt.apiBaseUrl) {
        attemptStore.clear()
        error("Cloud server changed during Pocket ID sign-in")
    }
}
