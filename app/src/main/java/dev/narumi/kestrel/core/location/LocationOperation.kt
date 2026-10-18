package dev.narumi.kestrel.core.location

import androidx.annotation.StringRes
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.i18n.UiMessage

enum class LocationOperationAction {
    SetPoint,
    StartRoute,
    UpdateRouteSettings,
    Pause,
    Resume,
    Stop,
}

data class LocationOperationResult(
    val requestId: String,
    val action: LocationOperationAction,
    val succeeded: Boolean,
    val message: UiMessage,
)

internal class LocationRequestException(
    val reason: UiMessage,
) : IllegalArgumentException()

internal fun requireLocation(
    condition: Boolean,
    @StringRes message: Int,
) {
    if (!condition) throw LocationRequestException(UiMessage(message))
}

internal fun <T : Any> requireLocationNotNull(
    value: T?,
    @StringRes message: Int,
): T = value ?: throw LocationRequestException(UiMessage(message))

internal data class RouteSettingsUpdate(
    val speedKmh: Double?,
    val mode: MovementEngine.Mode?,
)

internal fun parseRouteSettingsUpdate(
    speedKmh: Double?,
    modeName: String?,
): RouteSettingsUpdate {
    requireLocation(speedKmh != null || modeName != null, R.string.location_choose_setting)
    requireLocation(speedKmh == null || (speedKmh.isFinite() && speedKmh > 0.0), R.string.location_invalid_speed)
    val mode =
        modeName?.let { name ->
            MovementEngine.Mode.entries.firstOrNull { it.name == name }
                ?: throw LocationRequestException(UiMessage(R.string.location_invalid_mode))
        }
    return RouteSettingsUpdate(speedKmh, mode)
}

internal fun validateRouteRequest(
    waypoints: List<LatLng>,
    speedKmh: Double,
): UiMessage? =
    when {
        waypoints.size < 2 -> {
            UiMessage(R.string.location_two_waypoints)
        }

        waypoints.any { !it.lat.isFinite() || !it.lng.isFinite() || it.lat !in -90.0..90.0 || it.lng !in -180.0..180.0 } -> {
            UiMessage(R.string.location_invalid_waypoint)
        }

        !speedKmh.isFinite() || speedKmh <= 0.0 -> {
            UiMessage(R.string.location_positive_speed)
        }

        else -> {
            null
        }
    }

internal fun mockOperationErrorMessage(
    error: Throwable,
    previousMockActive: Boolean,
): UiMessage =
    when (error) {
        is LocationRequestException -> error.reason
        is SecurityException -> UiMessage(R.string.location_permission_error)
        is IllegalArgumentException -> UiMessage(R.string.location_invalid_request)
        else -> UiMessage(if (previousMockActive) R.string.location_failed_previous_active else R.string.location_failed_no_mock)
    }
