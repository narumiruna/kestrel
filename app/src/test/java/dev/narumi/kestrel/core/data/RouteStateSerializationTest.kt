package dev.narumi.kestrel.core.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RouteStateSerializationTest {
    // Mirrors the Json config in KestrelPrefs so the test exercises the same decoder used at
    // runtime. `ignoreUnknownKeys` must stay on for forward compatibility, and missing optional
    // fields must resolve to "start of route" defaults.
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun decodesLegacyJsonWithoutProgressOrForward() {
        // This is exactly the shape `RouteState` had before the route-progress-persistence change.
        // Devices that upgrade across this commit will read this blob from DataStore once.
        val legacy =
            """
            {
              "lats": [0.0, 0.001],
              "lngs": [0.0, 0.001],
              "speedKmh": 30.0,
              "mode": "Loop"
            }
            """.trimIndent()

        val decoded = json.decodeFromString(RouteState.serializer(), legacy)

        assertEquals(30.0, decoded.speedKmh, 1e-9)
        assertEquals("Loop", decoded.mode)
        assertEquals(
            "legacy payloads must resume from the start, not a random offset",
            0.0,
            decoded.progressMeters,
            1e-9,
        )
        assertTrue(
            "legacy payloads must resume in the natural forward direction",
            decoded.forward,
        )
    }

    @Test
    fun roundTripsNewFields() {
        val state =
            RouteState(
                lats = doubleArrayOf(0.0, 0.001),
                lngs = doubleArrayOf(0.0, 0.001),
                speedKmh = 30.0,
                mode = "PingPong",
                progressMeters = 42.5,
                forward = false,
            )

        val encoded = json.encodeToString(RouteState.serializer(), state)
        val decoded = json.decodeFromString(RouteState.serializer(), encoded)

        assertEquals(42.5, decoded.progressMeters, 1e-9)
        assertEquals(false, decoded.forward)
        assertEquals("PingPong", decoded.mode)
    }
}
