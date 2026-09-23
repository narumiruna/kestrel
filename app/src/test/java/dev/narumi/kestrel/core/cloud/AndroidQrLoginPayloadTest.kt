package dev.narumi.kestrel.core.cloud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class AndroidQrLoginPayloadTest {
    @Test
    fun parsesProductionAndSelfHostedHttpsPayloads() {
        val production = parseAndroidQrLoginPayload(qrValue("https://kestrel.narumi.dev"))
        assertEquals("https://kestrel.narumi.dev", production.publicOrigin)
        assertEquals("https://kestrel.narumi.dev/api/backend", production.apiBaseUrl)

        val selfHosted = parseAndroidQrLoginPayload(qrValue("https://cloud.example.test:8443"))
        assertEquals("https://cloud.example.test:8443", selfHosted.publicOrigin)
        assertEquals("https://cloud.example.test:8443/api/backend", selfHosted.apiBaseUrl)
    }

    @Test
    fun acceptsOnlyLoopbackHttpDevelopmentOrigins() {
        assertEquals(
            "http://localhost:3301/api/backend",
            parseAndroidQrLoginPayload(qrValue("http://localhost:3301")).apiBaseUrl,
        )
        assertEquals(
            "http://[::1]:3301/api/backend",
            parseAndroidQrLoginPayload(qrValue("http://[::1]:3301")).apiBaseUrl,
        )
        assertInvalid(qrValue("http://10.0.2.2:3301"))
        assertInvalid(qrValue("http://cloud.example.test"))
    }

    @Test
    fun rejectsMalformedSchemesPathsQueriesAndCredentials() {
        assertInvalid("not a uri")
        assertInvalid(qrValue("ftp://cloud.example.test"))
        assertInvalid(qrValue("https://cloud.example.test", path = "/wrong"))
        assertInvalid(qrValue("https://user@cloud.example.test"))
        assertInvalid(qrValue("https://cloud.example.test") + "?leak=yes")
    }

    @Test
    fun rejectsMissingDuplicateExtraAndOversizedFragmentValues() {
        assertInvalid("https://cloud.example.test/login/android#v=1&attempt=$ATTEMPT_ID")
        assertInvalid(
            "https://cloud.example.test/login/android#v=1&attempt=$ATTEMPT_ID&secret=$SECRET&secret=$SECRET",
        )
        assertInvalid(
            "https://cloud.example.test/login/android#v=1&attempt=$ATTEMPT_ID&secret=$SECRET&next=https://evil.test",
        )
        assertInvalid(
            "https://cloud.example.test/login/android#v=1&attempt=$ATTEMPT_ID&secret=${"a".repeat(44)}",
        )
        assertInvalid("x".repeat(2_049))
    }

    @Test
    fun rejectsUnsupportedVersionsAndInvalidAttemptIdentifiers() {
        assertInvalid(qrValue("https://cloud.example.test").replace("v=1", "v=2"))
        assertInvalid(qrValue("https://cloud.example.test").replace(ATTEMPT_ID, "not-a-uuid"))
    }

    @Test
    fun validatesClaimServerAttemptCodeAndPollingBounds() {
        val payload = parseAndroidQrLoginPayload(qrValue("https://cloud.example.test"))
        val valid = claimResponse()
        validateAndroidQrClaim(payload, valid)

        assertThrows(IllegalArgumentException::class.java) {
            validateAndroidQrClaim(payload, valid.copy(serverOrigin = "https://evil.example"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            validateAndroidQrClaim(payload, valid.copy(attemptId = "00000000-0000-4000-8000-000000000000"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            validateAndroidQrClaim(payload, valid.copy(matchingCode = "123456"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            validateAndroidQrClaim(payload, valid.copy(pollIntervalSeconds = 60))
        }
    }

    private fun assertInvalid(rawValue: String) {
        assertThrows(IllegalArgumentException::class.java) {
            parseAndroidQrLoginPayload(rawValue)
        }
    }

    private fun claimResponse() =
        ClaimAndroidLoginResponse(
            attemptId = ATTEMPT_ID,
            expiresAt = "2026-09-23T12:05:00Z",
            matchingCode = "123-456",
            pollIntervalSeconds = 5,
            serverOrigin = "https://cloud.example.test",
            user = AndroidLoginUser(username = "admin"),
        )

    private fun qrValue(
        origin: String,
        path: String = "/login/android",
    ): String = "$origin$path#attempt=$ATTEMPT_ID&secret=$SECRET&v=1"

    companion object {
        private const val ATTEMPT_ID = "123e4567-e89b-42d3-a456-426614174000"
        private const val SECRET = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789"
    }
}
