package dev.narumi.kestrel.core.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ForwardCompatibleJsonTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun preservesUnknownFieldsForEverySettingsBlob() {
        assertPreservesTopLevelUnknown(
            serializer = FavoritesSortMode.serializer(),
            value = FavoritesSortMode(FavoritesSortMode.Mode.Alphabetical),
            previous = """{"mode":"Manual","futureFlag":true}""",
        )
        assertPreservesTopLevelUnknown(
            serializer = StartupPreference.serializer(),
            value = StartupPreference(StartupPreference.Mode.Current),
            previous = """{"mode":"Last","futureFlag":true}""",
        )
        assertPreservesTopLevelUnknown(
            serializer = RandomRoutePreference.serializer(),
            value = RandomRoutePreference(defaultPointCount = 20, defaultSpacingMeters = 100.0),
            previous = """{"defaultPointCount":100,"futureFlag":true}""",
        )
        assertPreservesTopLevelUnknown(
            serializer = MockPlaybackSettings.serializer(),
            value = MockPlaybackSettings(progressWriteIntervalSeconds = 10),
            previous = """{"progressWriteIntervalSeconds":5,"futureFlag":true}""",
        )
        assertPreservesTopLevelUnknown(
            serializer = CloudSettings.serializer(),
            value = CloudSettings(apiBaseUrl = "https://example.test"),
            previous = """{"apiBaseUrl":"https://old.test","futureFlag":true}""",
        )
    }

    @Test
    fun preservesNestedUnknownRouteStateFields() {
        val previous =
            """
            {
              "mode":"Route",
              "futureMock":"keep",
              "route":{
                "lats":[0.0,0.001],
                "lngs":[0.0,0.001],
                "speedKmh":20.0,
                "mode":"Once",
                "futureRoute":42
              }
            }
            """.trimIndent()
        val value =
            MockState(
                mode = MockState.Mode.Route,
                route =
                    RouteState(
                        lats = doubleArrayOf(0.0, 0.001),
                        lngs = doubleArrayOf(0.0, 0.001),
                        speedKmh = 12.0,
                        mode = "Loop",
                    ),
            )

        val encoded = json.encodePreservingUnknown(MockState.serializer(), value, previous)
        val root = json.parseToJsonElement(encoded).jsonObject

        assertEquals("keep", root.getValue("futureMock").jsonPrimitive.content)
        assertEquals(
            42,
            root
                .getValue("route")
                .jsonObject
                .getValue("futureRoute")
                .jsonPrimitive.int,
        )
        assertEquals(
            12.0,
            root
                .getValue("route")
                .jsonObject
                .getValue("speedKmh")
                .jsonPrimitive.content
                .toDouble(),
            0.0,
        )
        assertEquals(
            "Loop",
            root
                .getValue("route")
                .jsonObject
                .getValue("mode")
                .jsonPrimitive.content,
        )
    }

    @Test
    fun preservesUnknownFieldsInsideRetainedPendingAcks() {
        val previous =
            """
            {
              "enabled":true,
              "futureRemote":"keep",
              "pendingAcks":[{
                "deviceId":"device-1",
                "commandId":"command-1",
                "clientDeviceId":"client-1",
                "sessionId":"session-1",
                "status":"APPLIED",
                "futureAck":"keep"
              }]
            }
            """.trimIndent()
        val value =
            RemoteControlSettings(
                enabled = false,
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

        val encoded = json.encodePreservingUnknown(RemoteControlSettings.serializer(), value, previous)
        val root = json.parseToJsonElement(encoded).jsonObject
        val ack =
            root
                .getValue("pendingAcks")
                .jsonArray
                .single()
                .jsonObject

        assertEquals("keep", root.getValue("futureRemote").jsonPrimitive.content)
        assertEquals("keep", ack.getValue("futureAck").jsonPrimitive.content)
        assertEquals(
            false,
            json.decodeFromString(RemoteControlSettings.serializer(), encoded).enabled,
        )
    }

    @Test
    fun doesNotAttachUnknownListFieldsToADifferentIdentity() {
        val previous =
            """
            {
              "enabled":true,
              "pendingAcks":[{
                "deviceId":"device-1",
                "commandId":"old-command",
                "clientDeviceId":"client-1",
                "sessionId":"session-1",
                "status":"APPLIED",
                "futureAck":"belongs-to-old-command"
              }]
            }
            """.trimIndent()
        val replacement =
            RemoteControlSettings(
                enabled = true,
                pendingAcks =
                    listOf(
                        RemoteControlPendingAck(
                            deviceId = "device-1",
                            commandId = "new-command",
                            clientDeviceId = "client-1",
                            sessionId = "session-1",
                            status = "FAILED",
                        ),
                    ),
            )

        val encoded = json.encodePreservingUnknown(RemoteControlSettings.serializer(), replacement, previous)
        val ack =
            json
                .parseToJsonElement(encoded)
                .jsonObject
                .getValue("pendingAcks")
                .jsonArray
                .single()
                .jsonObject

        assertEquals(false, "futureAck" in ack)
        assertEquals("new-command", ack.getValue("commandId").jsonPrimitive.content)
    }

    @Test
    fun invalidPreviousJsonFallsBackToKnownEncoding() {
        val encoded =
            json.encodePreservingUnknown(
                MockPlaybackSettings.serializer(),
                MockPlaybackSettings(progressWriteIntervalSeconds = 7),
                "not-json",
            )
        val root = json.parseToJsonElement(encoded).jsonObject

        assertEquals(7, root.getValue("progressWriteIntervalSeconds").jsonPrimitive.int)
    }

    private fun <T> assertPreservesTopLevelUnknown(
        serializer: kotlinx.serialization.KSerializer<T>,
        value: T,
        previous: String,
    ) {
        val encoded = json.encodePreservingUnknown(serializer, value, previous)
        val root = json.parseToJsonElement(encoded).jsonObject
        assertTrue(root.getValue("futureFlag").jsonPrimitive.boolean)
    }
}
