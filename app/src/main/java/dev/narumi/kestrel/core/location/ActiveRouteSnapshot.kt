package dev.narumi.kestrel.core.location

import dev.narumi.kestrel.core.data.RouteState
import java.util.UUID

internal class ActiveRouteSnapshot private constructor(
    val engine: MovementEngine,
    val playbackId: String,
    private val latitudes: DoubleArray,
    private val longitudes: DoubleArray,
    val speedKmh: Double,
    val mode: MovementEngine.Mode,
) {
    // The service holds its tick/provider lock across this update and runtime publication.
    fun withSettings(
        expectedPlaybackId: String,
        speedKmh: Double?,
        mode: MovementEngine.Mode?,
    ): ActiveRouteSnapshot {
        require(expectedPlaybackId == playbackId) { "The route has changed. Adjust the current route instead." }
        require(speedKmh != null || mode != null) { "Choose a speed or playback mode to change." }
        val nextSpeedKmh = speedKmh ?: this.speedKmh
        val nextMode = mode ?: this.mode
        engine.updateSettings(nextSpeedKmh / 3.6, nextMode)
        return ActiveRouteSnapshot(engine, playbackId, latitudes, longitudes, nextSpeedKmh, nextMode)
    }

    fun toRuntimeState(paused: Boolean): RuntimeState.Route =
        RuntimeState.Route(
            waypoints = latitudes.indices.map { LatLng(latitudes[it], longitudes[it]) },
            speedKmh = speedKmh,
            mode = mode,
            paused = paused,
            playbackId = playbackId,
        )

    fun toRouteState(
        progressMeters: Double = engine.progressMeters(),
        forward: Boolean = engine.isForward(),
    ): RouteState =
        RouteState(
            lats = latitudes,
            lngs = longitudes,
            speedKmh = speedKmh,
            mode = mode.name,
            progressMeters = progressMeters,
            forward = forward,
        )

    companion object {
        fun create(
            engine: MovementEngine,
            waypoints: List<LatLng>,
            speedKmh: Double,
            mode: MovementEngine.Mode,
        ): ActiveRouteSnapshot =
            ActiveRouteSnapshot(
                engine = engine,
                playbackId = UUID.randomUUID().toString(),
                latitudes = DoubleArray(waypoints.size) { waypoints[it].lat },
                longitudes = DoubleArray(waypoints.size) { waypoints[it].lng },
                speedKmh = speedKmh,
                mode = mode,
            )
    }
}
