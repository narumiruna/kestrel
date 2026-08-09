package dev.narumi.kestrel.core.location

enum class LocationOperationAction {
    SetPoint,
    StartRoute,
    Pause,
    Resume,
    Stop,
}

data class LocationOperationResult(
    val requestId: String,
    val action: LocationOperationAction,
    val succeeded: Boolean,
    val message: String,
)

internal fun validateRouteRequest(
    waypoints: List<LatLng>,
    speedKmh: Double,
): String? =
    when {
        waypoints.size < 2 -> "A route needs at least two waypoints."
        waypoints.any { !it.lat.isFinite() || !it.lng.isFinite() || it.lat !in -90.0..90.0 || it.lng !in -180.0..180.0 } ->
            "Every waypoint must contain valid latitude and longitude values."
        !speedKmh.isFinite() || speedKmh <= 0.0 -> "Route speed must be greater than zero."
        else -> null
    }

internal fun mockOperationErrorMessage(
    error: Throwable,
    previousMockActive: Boolean,
): String =
    when (error) {
        is SecurityException -> "Kestrel could not use mock location. Recheck permissions and the selected mock-location app."
        is IllegalArgumentException -> error.message ?: "The mock-location request is invalid."
        else ->
            if (previousMockActive) {
                "Kestrel could not apply the mock location. The previous mock is still active; try again."
            } else {
                "Kestrel could not apply the mock location. No mock was started; try again."
            }
    }
