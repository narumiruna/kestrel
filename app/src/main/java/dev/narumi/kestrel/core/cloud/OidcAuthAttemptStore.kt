package dev.narumi.kestrel.core.cloud

import android.content.Context

internal data class OidcAuthAttempt(
    val apiBaseUrl: String,
    val clientNonce: String,
    val exchangeTicket: String? = null,
)

internal class OidcAuthAttemptStore(
    context: Context,
) {
    private val preferences =
        context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun load(): OidcAuthAttempt? = synchronized(LOCK) { loadLocked() }

    fun save(attempt: OidcAuthAttempt) = synchronized(LOCK) { saveLocked(attempt) }

    fun compareAndSet(
        expected: OidcAuthAttempt,
        updated: OidcAuthAttempt,
    ): Boolean =
        synchronized(LOCK) {
            if (loadLocked() != expected) return@synchronized false
            saveLocked(updated)
            true
        }

    fun compareAndClear(expected: OidcAuthAttempt): Boolean =
        synchronized(LOCK) {
            if (loadLocked() != expected) return@synchronized false
            clearLocked()
            true
        }

    fun clear() = synchronized(LOCK) { clearLocked() }

    private fun loadLocked(): OidcAuthAttempt? {
        val apiBaseUrl = preferences.getString(KEY_API_BASE_URL, null) ?: return null
        val clientNonce = preferences.getString(KEY_CLIENT_NONCE, null) ?: return null
        return OidcAuthAttempt(
            apiBaseUrl = apiBaseUrl,
            clientNonce = clientNonce,
            exchangeTicket = preferences.getString(KEY_EXCHANGE_TICKET, null),
        )
    }

    private fun clearLocked() {
        check(preferences.edit().clear().commit()) { "Failed to clear OIDC sign-in attempt" }
    }

    private fun saveLocked(attempt: OidcAuthAttempt) {
        val editor =
            preferences
                .edit()
                .putString(KEY_API_BASE_URL, attempt.apiBaseUrl)
                .putString(KEY_CLIENT_NONCE, attempt.clientNonce)
        if (attempt.exchangeTicket == null) {
            editor.remove(KEY_EXCHANGE_TICKET)
        } else {
            editor.putString(KEY_EXCHANGE_TICKET, attempt.exchangeTicket)
        }
        check(editor.commit()) { "Failed to persist OIDC sign-in attempt" }
    }

    companion object {
        private const val KEY_API_BASE_URL = "api_base_url"
        private const val KEY_CLIENT_NONCE = "client_nonce"
        private const val KEY_EXCHANGE_TICKET = "exchange_ticket"
        private const val PREFERENCES_NAME = "kestrel_oidc_auth"
        private val LOCK = Any()
    }
}
