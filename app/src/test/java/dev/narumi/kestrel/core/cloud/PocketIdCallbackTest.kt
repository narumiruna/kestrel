package dev.narumi.kestrel.core.cloud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class PocketIdCallbackTest {
    @Test
    fun parsesSuccessfulCallback() {
        val callback =
            parsePocketIdCallback(
                "dev.narumi.kestrel://auth/pocket-id" +
                    "#ticket=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN1234",
            )

        assertEquals(
            PocketIdCallback.Success(
                exchangeTicket = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN1234",
            ),
            callback,
        )
    }

    @Test
    fun parsesCancelledCallback() {
        val callback =
            parsePocketIdCallback(
                "dev.narumi.kestrel://auth/pocket-id#error=access_denied",
            )

        assertEquals(
            PocketIdCallback.Error(
                errorCode = "access_denied",
            ),
            callback,
        )
    }

    @Test
    fun rejectsWrongOriginDuplicateValuesAndMissingTicket() {
        assertFalse(isPocketIdCallbackUri("https://auth/pocket-id"))
        assertFalse(isPocketIdCallbackUri("dev.narumi.kestrel://auth/pocket-id?ticket=leaked"))
        assertTrue(
            isPocketIdCallbackUri(
                "dev.narumi.kestrel://auth/pocket-id#ticket=anything",
            ),
        )
        assertThrows(IllegalArgumentException::class.java) {
            parsePocketIdCallback(
                "dev.narumi.kestrel://auth/pocket-id" +
                    "#ticket=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN1234" +
                    "&ticket=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN5678",
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            parsePocketIdCallback(
                "dev.narumi.kestrel://auth/pocket-id#other=value",
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            parsePocketIdCallback(
                "dev.narumi.kestrel://auth/pocket-id" +
                    "#error=access_denied&ticket=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN1234",
            )
        }
    }
}
