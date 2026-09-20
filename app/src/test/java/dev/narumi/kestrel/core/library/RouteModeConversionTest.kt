package dev.narumi.kestrel.core.library

import dev.narumi.kestrel.core.cloud.CloudRouteMode
import dev.narumi.kestrel.core.cloud.toMovementMode
import dev.narumi.kestrel.core.library.db.LibraryConverters
import dev.narumi.kestrel.core.location.MovementEngine
import org.junit.Assert.assertEquals
import org.junit.Test

class RouteModeConversionTest {
    @Test
    fun `Room retains the original text names for every mode`() {
        val converters = LibraryConverters()
        val names = listOf("Once", "Loop", "PingPong")
        assertEquals(names, MovementEngine.Mode.entries.map(converters::fromRouteMode))
        assertEquals(MovementEngine.Mode.entries, names.map(converters::toRouteMode))
    }

    @Test
    fun `unknown legacy mode falls back to Once`() {
        val converters = LibraryConverters()
        listOf("", "unknown", "PING_PONG", "once").forEach {
            assertEquals(MovementEngine.Mode.Once, converters.toRouteMode(it))
        }
    }

    @Test
    fun `cloud sync and remote control use the same conversion for every mode`() {
        assertEquals(
            listOf(MovementEngine.Mode.Once, MovementEngine.Mode.Loop, MovementEngine.Mode.PingPong),
            CloudRouteMode.entries.map { it.toMovementMode() },
        )
    }
}
