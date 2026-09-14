package dev.narumi.kestrel.core.cloud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class OidcCallbackTest {
    @Test
    fun parsesSuccessfulCallback() {
        val callback =
            parseOidcCallback(
                "$CALLBACK_URL#attempt=$ATTEMPT_HASH&ticket=$EXCHANGE_TICKET",
            )

        assertEquals(
            OidcCallback.Success(
                exchangeTicket = EXCHANGE_TICKET,
                attemptHash = ATTEMPT_HASH,
            ),
            callback,
        )
        assertTrue(callback.matchesClientNonce(CLIENT_NONCE))
        assertFalse(callback.matchesClientNonce("newer-client-nonce"))
    }

    @Test
    fun parsesCancelledCallback() {
        val callback =
            parseOidcCallback(
                "$CALLBACK_URL#attempt=$ATTEMPT_HASH&error=access_denied",
            )

        assertEquals(
            OidcCallback.Error(
                errorCode = "access_denied",
                attemptHash = ATTEMPT_HASH,
            ),
            callback,
        )
    }

    @Test
    fun rejectsUnclaimedOriginDuplicateValuesAndMissingBinding() {
        assertFalse(isOidcCallbackUri("dev.narumi.kestrel://auth/oidc"))
        assertFalse(isOidcCallbackUri("https://example.com/login/oidc/android"))
        assertFalse(isOidcCallbackUri("$CALLBACK_URL?ticket=leaked"))
        assertTrue(isOidcCallbackUri("$CALLBACK_URL#ticket=anything"))
        assertThrows(IllegalArgumentException::class.java) {
            parseOidcCallback(
                "$CALLBACK_URL#attempt=$ATTEMPT_HASH" +
                    "&ticket=$EXCHANGE_TICKET&ticket=$EXCHANGE_TICKET",
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            parseOidcCallback(
                "$CALLBACK_URL#ticket=$EXCHANGE_TICKET",
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            parseOidcCallback(
                "$CALLBACK_URL#attempt=${"0".repeat(63)}" +
                    "&ticket=$EXCHANGE_TICKET",
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            parseOidcCallback(
                "$CALLBACK_URL#attempt=$ATTEMPT_HASH" +
                    "&error=access_denied&ticket=$EXCHANGE_TICKET",
            )
        }
    }

    companion object {
        private const val CALLBACK_URL = "https://kestrel.narumi.dev/login/oidc/android"
        private const val CLIENT_NONCE = "browser-attempt:1234567890abcdef"
        private const val ATTEMPT_HASH =
            "95c0ae8f928b442ccd78415a8427eaa0b70538f155bbb73f5ad887ade1bd3337"
        private const val EXCHANGE_TICKET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN1234"
    }
}
