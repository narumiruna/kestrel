package dev.narumi.kestrel.core.cloud

import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.haversineMeters
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement

internal interface MockCommandApplier {
    suspend fun setPoint(point: LatLng): RemoteCommandExecutionResult

    suspend fun startRoute(
        waypoints: List<LatLng>,
        speedKmh: Double,
        mode: MovementEngine.Mode,
    ): RemoteCommandExecutionResult

    suspend fun stop(): RemoteCommandExecutionResult
}

internal data class RemoteCommandExecutionResult(
    val status: RemoteCommandStatus,
    val errorMessage: String? = null,
) {
    companion object {
        fun applied(): RemoteCommandExecutionResult = RemoteCommandExecutionResult(RemoteCommandStatus.APPLIED)

        fun failed(message: String): RemoteCommandExecutionResult = RemoteCommandExecutionResult(RemoteCommandStatus.FAILED, message)
    }
}

internal class RemoteCommandExecutor(
    private val applier: MockCommandApplier,
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun execute(command: RemoteCommandPayload): RemoteCommandExecutionResult =
        try {
            when (command.type) {
                RemoteCommandType.SET_POINT -> executeSetPoint(command)
                RemoteCommandType.START_ROUTE -> executeStartRoute(command)
                RemoteCommandType.STOP -> applier.stop()
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: SerializationException) {
            RemoteCommandExecutionResult.failed(error.message ?: "Invalid command payload")
        } catch (error: IllegalArgumentException) {
            RemoteCommandExecutionResult.failed(error.message ?: "Invalid command payload")
        } catch (error: IllegalStateException) {
            RemoteCommandExecutionResult.failed(error.message ?: "Command execution failed")
        }

    private suspend fun executeSetPoint(command: RemoteCommandPayload): RemoteCommandExecutionResult {
        val payload = json.decodeFromJsonElement<RemoteSetPointPayload>(command.payload)
        val point = payload.point.toLatLng()
        requireValidPoint(point)
        return applier.setPoint(point)
    }

    private suspend fun executeStartRoute(command: RemoteCommandPayload): RemoteCommandExecutionResult {
        val payload = json.decodeFromJsonElement<RemoteStartRoutePayload>(command.payload)
        require(payload.waypoints.size >= MIN_ROUTE_WAYPOINTS) { "Route must have at least 2 waypoints" }
        require(payload.speedKmh.isFinite() && payload.speedKmh > 0.0) { "Route speed must be positive" }
        val waypoints = payload.waypoints.map { it.toLatLng().also(::requireValidPoint) }
        require(waypoints.hasPositiveDistanceSegment()) { "Route must contain at least one non-identical segment" }
        return applier.startRoute(
            waypoints = waypoints,
            speedKmh = payload.speedKmh,
            mode = payload.mode.toMovementMode(),
        )
    }

    private fun RemotePointPayload.toLatLng(): LatLng = LatLng(latitude, longitude)

    private fun requireValidPoint(point: LatLng) {
        require(point.lat.isFinite() && point.lat in -90.0..90.0) { "Latitude must be between -90 and 90" }
        require(point.lng.isFinite() && point.lng in -180.0..180.0) { "Longitude must be between -180 and 180" }
    }

    private fun List<LatLng>.hasPositiveDistanceSegment(): Boolean = zipWithNext().any { (a, b) -> haversineMeters(a, b) > 0.0 }

    private fun CloudRouteMode.toMovementMode(): MovementEngine.Mode =
        when (this) {
            CloudRouteMode.ONCE -> MovementEngine.Mode.Once
            CloudRouteMode.LOOP -> MovementEngine.Mode.Loop
            CloudRouteMode.PING_PONG -> MovementEngine.Mode.PingPong
        }

    private companion object {
        const val MIN_ROUTE_WAYPOINTS = 2
    }
}
