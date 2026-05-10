package dev.narumi.kestrel.core.cloud

import android.content.Context
import dev.narumi.kestrel.core.data.KestrelPrefs

class CloudAuthRepository private constructor(
    context: Context,
) {
    private val applicationContext = context.applicationContext
    private val prefs = KestrelPrefs(applicationContext)
    private val sessionStore = CloudSessionStore(applicationContext)
    private val apiClient = CloudApiClient(baseUrlProvider = { prefs.cloudSettingsValue().apiBaseUrl })

    fun currentSession(): CloudSession? = sessionStore.load()

    suspend fun loginWithTotp(
        username: String,
        password: String,
        totpCode: String,
    ): CloudSession {
        val session = apiClient.loginWithTotp(username = username, password = password, totpCode = totpCode)
        sessionStore.save(session)
        return session
    }

    suspend fun loginWithRecoveryCode(
        username: String,
        password: String,
        recoveryCode: String,
    ): CloudSession {
        val session =
            apiClient.loginWithRecoveryCode(
                username = username,
                password = password,
                recoveryCode = recoveryCode,
            )
        sessionStore.save(session)
        return session
    }

    suspend fun refreshSession(): CloudSession? {
        val currentSession = sessionStore.load() ?: return null
        return runCatching {
            apiClient.refresh(currentSession.refreshToken)
        }.getOrNull()?.also(sessionStore::save)
            ?: run {
                sessionStore.clear()
                null
            }
    }

    suspend fun logout() {
        val currentSession = sessionStore.load()
        runCatching {
            if (currentSession != null) {
                apiClient.revokeSession(currentSession.accessToken)
            }
        }
        sessionStore.clear()
    }

    companion object {
        @Volatile private var instance: CloudAuthRepository? = null

        fun getInstance(context: Context): CloudAuthRepository =
            instance ?: synchronized(this) {
                instance ?: CloudAuthRepository(context.applicationContext).also { instance = it }
            }
    }
}
