package dev.narumi.kestrel.ui.components

import dev.narumi.kestrel.core.location.MovementEngine
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

class RoutePresentationTest {
    @Test
    fun `mode labels preserve Ping-pong punctuation`() {
        assertEquals(listOf("Once", "Loop", "Ping-pong"), MovementEngine.Mode.entries.map { it.label() })
    }

    @Test
    fun `speed formats retain their distinct fractional precision`() {
        assertEquals("12 km/h", 12.0.toDisplaySpeed())
        assertEquals("12.56 km/h", 12.56.toDisplaySpeed())
        assertEquals("12 km/h", formatRouteStatusSpeedKmh(12.0))
        assertEquals("12.6 km/h", formatRouteStatusSpeedKmh(12.56))
    }

    @Test
    fun `random route text preserves empty and fractional values`() {
        assertEquals("—", estimatedRouteDistance(null, 100.0))
        assertEquals("—", estimatedRouteDistance(2, null))
        assertEquals("0 m", estimatedRouteDistance(0, 100.0))
        assertEquals("100.5 m", estimatedRouteDistance(2, 100.5))
        assertEquals("100", formatMeters(100.0))
        assertEquals("100.5", formatMeters(100.5))
    }

    @Test
    fun `distance follows device locale but compact speed remains US formatted`() {
        val previous = Locale.getDefault()
        try {
            Locale.setDefault(Locale.US)
            assertEquals("999 m", formatDistance(999.0))
            assertEquals("1.0 km", formatDistance(1000.0))
            Locale.setDefault(Locale.GERMANY)
            assertEquals("1,5 km", formatDistance(1500.0))
            assertEquals("12.6 km/h", formatRouteStatusSpeedKmh(12.56))
        } finally {
            Locale.setDefault(previous)
        }
    }
}
