package dev.narumi.kestrel.core.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RandomRouteValidationTest {
    @Test
    fun `point counts include both boundaries`() {
        listOf(2, 1000).forEach { assertTrue(isValidPointCount(it)) }
        listOf(null, 1, 1001).forEach { assertFalse(isValidPointCount(it)) }
    }

    @Test
    fun `spacing includes both boundaries and rejects non finite inputs`() {
        listOf(1.0, 1.25, 10000.0).forEach { assertTrue(isValidSpacing(it)) }
        listOf(null, 0.99, 10000.01, Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY)
            .forEach { assertFalse(isValidSpacing(it)) }
    }

    @Test
    fun `route requires valid count and spacing`() {
        assertTrue(isValidRandomRoute(2, 1.0))
        assertTrue(isValidRandomRoute(1000, 10000.0))
        assertFalse(isValidRandomRoute(null, 1.0))
        assertFalse(isValidRandomRoute(2, null))
        assertFalse(isValidRandomRoute(1, 100.0))
    }
}
