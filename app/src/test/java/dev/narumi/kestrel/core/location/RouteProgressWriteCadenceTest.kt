package dev.narumi.kestrel.core.location

import org.junit.Assert.assertEquals
import org.junit.Test

class RouteProgressWriteCadenceTest {
    @Test
    fun convertsSecondsToTicksUsingLocationServiceTickMillis() {
        assertEquals(
            10,
            progressWriteIntervalTicksFor(
                seconds = 10,
                tickMillis = LOCATION_SERVICE_TICK_MILLIS,
            ),
        )
    }

    @Test
    fun clampsSubTickCadenceToAtLeastOneTick() {
        assertEquals(
            1,
            progressWriteIntervalTicksFor(
                seconds = 1,
                tickMillis = 1500L,
            ),
        )
    }
}
