package dev.narumi.kestrel.core.data

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class MockPlaybackSettingsSerializationTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun decodesLegacyJsonWithoutProgressWriteInterval() {
        val legacy =
            """
            {
              "unknownFutureField": true
            }
            """.trimIndent()

        val decoded = json.decodeFromString(MockPlaybackSettings.serializer(), legacy)

        assertEquals(
            MockPlaybackSettings.DEFAULT_PROGRESS_WRITE_INTERVAL_SECONDS,
            decoded.progressWriteIntervalSeconds,
        )
    }

    @Test
    fun clampsProgressWriteIntervalIntoSupportedRange() {
        assertEquals(
            MockPlaybackSettings.MIN_PROGRESS_WRITE_INTERVAL_SECONDS,
            MockPlaybackSettings.clampProgressWriteIntervalSeconds(0),
        )
        assertEquals(10, MockPlaybackSettings.clampProgressWriteIntervalSeconds(10))
        assertEquals(
            MockPlaybackSettings.MAX_PROGRESS_WRITE_INTERVAL_SECONDS,
            MockPlaybackSettings.clampProgressWriteIntervalSeconds(61),
        )
    }
}
