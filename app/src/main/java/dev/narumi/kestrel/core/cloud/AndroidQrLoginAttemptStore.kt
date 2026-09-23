package dev.narumi.kestrel.core.cloud

import android.content.Context
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

internal interface AndroidQrLoginAttemptPersistence {
    fun load(): AndroidQrLoginAttempt?

    fun save(attempt: AndroidQrLoginAttempt)

    fun compareAndSet(
        expected: AndroidQrLoginAttempt,
        updated: AndroidQrLoginAttempt,
    ): Boolean

    fun compareAndClear(expected: AndroidQrLoginAttempt): Boolean

    fun clear()
}

internal class AndroidQrLoginAttemptStore(
    context: Context,
) : AndroidQrLoginAttemptPersistence {
    private val preferences =
        context.applicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    override fun load(): AndroidQrLoginAttempt? = synchronized(LOCK) { loadLocked() }

    override fun save(attempt: AndroidQrLoginAttempt) = synchronized(LOCK) { saveLocked(attempt) }

    override fun compareAndSet(
        expected: AndroidQrLoginAttempt,
        updated: AndroidQrLoginAttempt,
    ): Boolean =
        synchronized(LOCK) {
            if (loadLocked() != expected) return@synchronized false
            saveLocked(updated)
            true
        }

    override fun compareAndClear(expected: AndroidQrLoginAttempt): Boolean =
        synchronized(LOCK) {
            if (loadLocked() != expected) return@synchronized false
            clearLocked()
            true
        }

    override fun clear() = synchronized(LOCK) { clearLocked() }

    private fun loadLocked(): AndroidQrLoginAttempt? {
        val encoded = preferences.getString(KEY_ATTEMPT, null) ?: return null
        return try {
            decodeAndroidQrLoginAttempt(encoded)
        } catch (_: IllegalArgumentException) {
            clearLocked()
            null
        } catch (_: SerializationException) {
            clearLocked()
            null
        }
    }

    private fun saveLocked(attempt: AndroidQrLoginAttempt) {
        check(
            preferences
                .edit()
                .putString(KEY_ATTEMPT, encodeAndroidQrLoginAttempt(attempt))
                .commit(),
        ) { "Failed to persist Android QR sign-in attempt" }
    }

    private fun clearLocked() {
        check(preferences.edit().remove(KEY_ATTEMPT).commit()) {
            "Failed to clear Android QR sign-in attempt"
        }
    }

    companion object {
        private const val KEY_ATTEMPT = "attempt"
        internal const val PREFERENCES_NAME = "kestrel_android_qr_auth"
        private val LOCK = Any()
    }
}

private val androidQrLoginJson = Json { ignoreUnknownKeys = true }

internal fun encodeAndroidQrLoginAttempt(attempt: AndroidQrLoginAttempt): String = androidQrLoginJson.encodeToString(AndroidQrLoginAttempt.serializer(), attempt)

internal fun decodeAndroidQrLoginAttempt(encoded: String): AndroidQrLoginAttempt = androidQrLoginJson.decodeFromString(AndroidQrLoginAttempt.serializer(), encoded)
