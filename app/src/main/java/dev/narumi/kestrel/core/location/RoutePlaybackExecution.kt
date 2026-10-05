package dev.narumi.kestrel.core.location

// Accessed under LocationService's providerWriteLock. Each route owns one execution so a
// cancelled, replaced coroutine cannot release the new route's CPU lease.
internal class RoutePlaybackExecution(
    private val elapsedRealtimeMillis: () -> Long,
    private val acquire: () -> Unit,
    private val release: () -> Unit,
) {
    private var previousMillis = elapsedRealtimeMillis()
    private var paused = false
    private var stopped = false

    init {
        acquire()
    }

    fun nextDeltaSeconds(): Double {
        if (paused || stopped) return 0.0
        val now = elapsedRealtimeMillis()
        val deltaMillis = (now - previousMillis).coerceAtLeast(0L)
        previousMillis = now
        return deltaMillis / 1000.0
    }

    fun pause() {
        if (paused || stopped) return
        paused = true
        release()
    }

    fun resume() {
        if (!paused || stopped) return
        acquire()
        previousMillis = elapsedRealtimeMillis()
        paused = false
    }

    fun stop() {
        if (stopped) return
        stopped = true
        if (!paused) release()
    }
}
