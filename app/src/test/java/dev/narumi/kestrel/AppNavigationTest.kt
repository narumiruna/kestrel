package dev.narumi.kestrel

import org.junit.Assert.assertEquals
import org.junit.Test

class AppNavigationTest {
    @Test
    fun navigationRemainsShallowAndUsesFinalTerminology() {
        assertEquals(
            listOf(R.string.nav_map, R.string.nav_favorites, R.string.nav_settings),
            AppDestinations.entries.map(AppDestinations::label),
        )
    }
}
