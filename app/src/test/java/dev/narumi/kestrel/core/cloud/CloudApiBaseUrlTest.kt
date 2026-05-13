package dev.narumi.kestrel.core.cloud

import dev.narumi.kestrel.core.data.CloudSettings
import org.junit.Assert.assertEquals
import org.junit.Test

class CloudApiBaseUrlTest {
    @Test
    fun defaultCloudApiBaseUrlIsProductionWebOrigin() {
        assertEquals("https://kestrel.narumi.dev", CloudSettings.DEFAULT_API_BASE_URL)
    }

    @Test
    fun productionWebOriginResolvesToBackendProxy() {
        assertEquals(
            "https://kestrel.narumi.dev/api/backend",
            normalizeCloudApiBaseUrl("https://kestrel.narumi.dev"),
        )
    }

    @Test
    fun productionApiPathResolvesToBackendProxy() {
        assertEquals(
            "https://kestrel.narumi.dev/api/backend",
            normalizeCloudApiBaseUrl(" https://kestrel.narumi.dev/api/ "),
        )
    }

    @Test
    fun productionBackendProxyPathIsPreserved() {
        assertEquals(
            "https://kestrel.narumi.dev/api/backend",
            normalizeCloudApiBaseUrl("https://kestrel.narumi.dev/api/backend/"),
        )
    }

    @Test
    fun directBackendUrlsArePreserved() {
        assertEquals(
            "http://10.0.2.2:3000",
            normalizeCloudApiBaseUrl("http://10.0.2.2:3000/"),
        )
        assertEquals(
            "http://localhost:3300",
            normalizeCloudApiBaseUrl("http://localhost:3300"),
        )
    }
}
