package dev.narumi.kestrel.core.cloud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class AndroidQrLoginAttemptStoreTest {
    @Test
    fun roundTripsEveryRecoveryField() {
        val attempt = attempt()
        assertEquals(attempt, decodeAndroidQrLoginAttempt(encodeAndroidQrLoginAttempt(attempt)))
    }

    @Test
    fun ignoresFutureFieldsButRejectsMissingCredentials() {
        val encoded = encodeAndroidQrLoginAttempt(attempt())
        val withFutureField = encoded.dropLast(1) + ",\"future\":true}"
        assertEquals(attempt(), decodeAndroidQrLoginAttempt(withFutureField))

        assertThrows(Exception::class.java) {
            decodeAndroidQrLoginAttempt("{\"attemptId\":\"missing-fields\"}")
        }
    }

    private fun attempt() =
        AndroidQrLoginAttempt(
            apiBaseUrl = "https://cloud.example.test/api/backend",
            appVersion = "0.8.0",
            attemptId = "123e4567-e89b-42d3-a456-426614174000",
            confirmed = true,
            deviceName = "Google Pixel",
            expiresAt = 1_800_000L,
            matchingCode = "123-456",
            pollIntervalSeconds = 5,
            publicOrigin = "https://cloud.example.test",
            qrSecret = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789",
            username = "admin",
            verifier = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi123456789",
        )
}
