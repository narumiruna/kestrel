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
import java.security.GeneralSecurityException
import java.util.UUID

internal class CloudAuthRepository private constructor(
    context: Context,
) : CloudSyncSessionProvider {
    private val applicationContext = context.applicationContext
    private val prefs = KestrelPrefs(applicationContext)
    private val sessionStore = CloudSessionStore(applicationContext)
    private val apiClient = CloudApiClient(baseUrlProvider = { prefs.cloudSettingsValue().apiBaseUrl })
    private val refreshMutex = Mutex()
    private val _hasSession = MutableStateFlow(sessionStore.hasSession())

    val hasSession: StateFlow<Boolean> = _hasSession.asStateFlow()

    override fun currentSession(): CloudSession? =
        sessionStore.load().also { session ->
            _hasSession.value = session != null
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

    companion object {
        private const val HTTP_UNAUTHORIZED = 401
        private const val REFRESH_ATTEMPTS = 2

        @Volatile private var instance: CloudAuthRepository? = null

        fun getInstance(context: Context): CloudAuthRepository =
            instance ?: synchronized(this) {
                instance ?: CloudAuthRepository(context.applicationContext).also { instance = it }
            }
    }
}
