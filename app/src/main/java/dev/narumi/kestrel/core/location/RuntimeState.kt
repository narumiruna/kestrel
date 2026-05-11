package dev.narumi.kestrel.core.location

/**
 * Snapshot of what [LocationService] is currently doing, surfaced to the UI as a [kotlinx.coroutines.flow.StateFlow].
 *
 * Emitted only on real state transitions (start / stop / pause / resume / single / route-finish /
 * restoreState), never from the per-tick movement loop, so UI consumers do not recompose every
 * second.
 */
sealed interface RuntimeState {
    data object Idle : RuntimeState

    data class Single(
        val point: LatLng,
    ) : RuntimeState

    data class Route(
        val waypoints: List<LatLng>,
        val speedKmh: Double,
        val mode: MovementEngine.Mode,
        val paused: Boolean,
    ) : RuntimeState
}
