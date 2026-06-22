package dev.narumi.kestrel.core.cloud

import android.content.Context
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.LocationService
import dev.narumi.kestrel.core.location.MockProviderManager
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.RuntimeState
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

internal class LocationServiceMockCommandApplier(
    context: Context,
) : MockCommandApplier {
    private val applicationContext = context.applicationContext

    override suspend fun setPoint(point: LatLng): RemoteCommandExecutionResult {
        if (!hasMockPermission()) {
            return RemoteCommandExecutionResult.failed(MOCK_PERMISSION_ERROR)
        }
        return applyAndWait(
            action = { LocationService.setLocation(applicationContext, point) },
            matches = { it is RuntimeState.Single && it.point == point },
            timeoutMessage = "Timed out waiting for single point mock",
        )
    }

    override suspend fun startRoute(
        waypoints: List<LatLng>,
        speedKmh: Double,
        mode: MovementEngine.Mode,
    ): RemoteCommandExecutionResult {
        if (!hasMockPermission()) {
            return RemoteCommandExecutionResult.failed(MOCK_PERMISSION_ERROR)
        }
        return applyAndWait(
            action = { LocationService.startRoute(applicationContext, waypoints, speedKmh, mode) },
            matches = {
                it is RuntimeState.Route &&
                    it.waypoints == waypoints &&
                    it.speedKmh == speedKmh &&
                    it.mode == mode &&
                    !it.paused
            },
            timeoutMessage = "Timed out waiting for route mock",
        )
    }

    override suspend fun stop(): RemoteCommandExecutionResult =
        applyAndWait(
            action = { LocationService.stop(applicationContext) },
            matches = { it is RuntimeState.Idle },
            timeoutMessage = "Timed out waiting for mock stop",
        )

    private fun hasMockPermission(): Boolean = MockProviderManager(applicationContext).isMockAllowed()

    private suspend fun applyAndWait(
        action: () -> Unit,
        matches: (RuntimeState) -> Boolean,
        timeoutMessage: String,
    ): RemoteCommandExecutionResult {
        val started = runCatching(action)
        if (started.isFailure) {
            return RemoteCommandExecutionResult.failed(started.exceptionOrNull()?.message ?: "Failed to start mock service")
        }
        val reached =
            withTimeoutOrNull(APPLY_TIMEOUT_MILLIS) {
                LocationService.runtimeState.filter(matches).first()
            }
        return if (reached == null) {
            RemoteCommandExecutionResult.failed(timeoutMessage)
        } else {
            RemoteCommandExecutionResult.applied()
        }
    }

    private companion object {
        const val APPLY_TIMEOUT_MILLIS = 5_000L
        const val MOCK_PERMISSION_ERROR =
            "Kestrel is not selected as the mock location app in Developer options"
    }
}
