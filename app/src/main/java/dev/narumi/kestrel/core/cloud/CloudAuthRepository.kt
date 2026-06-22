package dev.narumi.kestrel.core.cloud

import android.content.Context
import dev.narumi.kestrel.core.data.KestrelPrefs
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

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
                .also(::saveSession)
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
                ).also(::saveSession)
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
            runCatching {
                apiClient.refresh(currentSession.refreshToken)
            }.getOrNull()?.also(::saveSession)
                ?: run {
                    clearSession()
                    null
                }
        }

    suspend fun logout() {
        refreshMutex.withLock {
            val currentSession = sessionStore.load()
            runCatching {
                if (currentSession != null) {
                    apiClient.revokeSession(currentSession.accessToken)
                }
            }
            clearSession()
        }
    }

    internal fun refreshSessionPresence() {
        _hasSession.value = sessionStore.hasSession()
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
        @Volatile private var instance: CloudAuthRepository? = null

        fun getInstance(context: Context): CloudAuthRepository =
            instance ?: synchronized(this) {
                instance ?: CloudAuthRepository(context.applicationContext).also { instance = it }
            }
    }
}
