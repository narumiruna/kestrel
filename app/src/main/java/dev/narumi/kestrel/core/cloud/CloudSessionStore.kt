package dev.narumi.kestrel.core.cloud

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.serialization.json.Json
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class CloudSessionStore(
    context: Context,
) {
    private val applicationContext = context.applicationContext
    private val json = Json { ignoreUnknownKeys = true }
    private val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun hasSession(): Boolean = load() != null

    fun load(): CloudSession? {
        val encodedValue = prefs.getString(KEY_SESSION, null) ?: return null
        return runCatching {
            json.decodeFromString(CloudSession.serializer(), decrypt(encodedValue))
        }.getOrElse {
            clear()
            null
        }
    }

    fun save(session: CloudSession) {
        val encodedValue = encrypt(json.encodeToString(CloudSession.serializer(), session))
        if (!prefs.edit().putString(KEY_SESSION, encodedValue).commit()) {
            prefs.edit().remove(KEY_SESSION).commit()
            error("Failed to persist cloud session")
        }
    }

    fun clear() {
        check(prefs.edit().remove(KEY_SESSION).commit()) {
            "Failed to clear cloud session"
        }
    }

    private fun encrypt(plainText: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        val encryptedBytes = cipher.doFinal(plainText.toByteArray(StandardCharsets.UTF_8))
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        val ciphertext = Base64.encodeToString(encryptedBytes, Base64.NO_WRAP)
        return "$iv:$ciphertext"
    }

    private fun decrypt(encodedValue: String): String {
        val parts = encodedValue.split(':', limit = 2)
        require(parts.size == 2) { "Malformed cloud session payload" }
        val iv = Base64.decode(parts[0], Base64.NO_WRAP)
        val cipherBytes = Base64.decode(parts[1], Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateSecretKey(),
            GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv),
        )
        return cipher.doFinal(cipherBytes).toString(StandardCharsets.UTF_8)
    }

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
        val existingKey = (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey

        if (existingKey != null) {
            return existingKey
        }

        val keyGenerator =
            KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                ANDROID_KEY_STORE,
            )
        val parameterSpec =
            KeyGenParameterSpec
                .Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_DECRYPT or KeyProperties.PURPOSE_ENCRYPT,
                ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        keyGenerator.init(parameterSpec)
        return keyGenerator.generateKey()
    }

    companion object {
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
        private const val GCM_TAG_LENGTH_BITS = 128
        private const val KEY_ALIAS = "kestrel-cloud-session"
        private const val KEY_SESSION = "cloud_session"
        private const val PREFS_NAME = "kestrel_cloud_auth"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
