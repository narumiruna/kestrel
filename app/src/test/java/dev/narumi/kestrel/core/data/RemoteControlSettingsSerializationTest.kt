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
        assertEquals(emptyList<RemoteControlPendingAck>(), decoded.pendingAcks)
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
                pendingAcks =
                    listOf(
                        RemoteControlPendingAck(
                            deviceId = "device-1",
                            commandId = "command-1",
                            clientDeviceId = "client-1",
                            sessionId = "session-1",
                            status = "APPLIED",
                        ),
                    ),
            )

        val decoded = json.decodeFromString(RemoteControlSettings.serializer(), json.encodeToString(RemoteControlSettings.serializer(), settings))

        assertEquals(settings, decoded)
    }
}
