package dev.narumi.kestrel.core.cloud

import android.content.Context

internal data class PocketIdAuthAttempt(
    val apiBaseUrl: String,
    val clientNonce: String,
)

internal class PocketIdAuthAttemptStore(
    context: Context,
) {
    private val preferences =
        context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun load(): PocketIdAuthAttempt? {
        val apiBaseUrl = preferences.getString(KEY_API_BASE_URL, null) ?: return null
        val clientNonce = preferences.getString(KEY_CLIENT_NONCE, null) ?: return null
        return PocketIdAuthAttempt(apiBaseUrl = apiBaseUrl, clientNonce = clientNonce)
    }

    fun save(attempt: PocketIdAuthAttempt) {
        check(
            preferences
                .edit()
                .putString(KEY_API_BASE_URL, attempt.apiBaseUrl)
                .putString(KEY_CLIENT_NONCE, attempt.clientNonce)
                .commit(),
        ) { "Failed to persist Pocket ID sign-in attempt" }
    }

    fun clear() {
        check(preferences.edit().clear().commit()) { "Failed to clear Pocket ID sign-in attempt" }
    }

    companion object {
        private const val KEY_API_BASE_URL = "api_base_url"
        private const val KEY_CLIENT_NONCE = "client_nonce"
        private const val PREFERENCES_NAME = "kestrel_pocket_id_auth"
    }
}
