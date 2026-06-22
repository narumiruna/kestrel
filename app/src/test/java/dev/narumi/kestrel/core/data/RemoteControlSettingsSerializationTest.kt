package dev.narumi.kestrel.core.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class RemoteControlSettingsSerializationTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun decodesLegacyJsonWithDefaults() {
        val decoded = json.decodeFromString(RemoteControlSettings.serializer(), "{}")

        assertFalse(decoded.enabled)
        assertNull(decoded.clientDeviceId)
        assertNull(decoded.serverDeviceId)
        assertNull(decoded.deviceName)
        assertNull(decoded.registeredUserId)
    }

    @Test
    fun roundTripsDeviceRegistration() {
        val settings =
            RemoteControlSettings(
                enabled = true,
                clientDeviceId = "client-1",
                serverDeviceId = "device-1",
                deviceName = "Pixel",
                registeredUserId = "user-1",
            )

        val decoded = json.decodeFromString(RemoteControlSettings.serializer(), json.encodeToString(RemoteControlSettings.serializer(), settings))

        assertEquals(settings, decoded)
    }
}
