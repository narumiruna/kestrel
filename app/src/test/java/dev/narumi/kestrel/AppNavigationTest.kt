package dev.narumi.kestrel

import org.junit.Assert.assertEquals
import org.junit.Test

class AppNavigationTest {
    @Test
    fun navigationRemainsShallowAndUsesFinalTerminology() {
        assertEquals(
            listOf("Map", "Favorites", "Settings"),
            AppDestinations.entries.map(AppDestinations::label),
        )
    }
}
