package dev.narumi.kestrel.core.location

import kotlin.math.max

internal const val LOCATION_SERVICE_TICK_MILLIS = 1000L

internal fun progressWriteIntervalTicksFor(
    seconds: Int,
    tickMillis: Long = LOCATION_SERVICE_TICK_MILLIS,
): Int {
    require(tickMillis > 0L) { "tickMillis must be positive" }
    return max(1L, seconds.toLong() * 1000L / tickMillis).toInt()
}
