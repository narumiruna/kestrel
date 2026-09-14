package dev.narumi.kestrel.core.cloud

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class CloudModelsTest {
    @Test
    fun startOidcRequestIncludesAndroidClientType() {
        val request =
            Json.encodeToString(
                StartOidcRequest(
                    clientType = "android",
                    clientNonce = "client-nonce",
                ),
            )

        assertEquals(
            """{"clientType":"android","clientNonce":"client-nonce"}""",
            request,
        )
    }
}
