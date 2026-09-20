package dev.narumi.kestrel.ui.components

import dev.narumi.kestrel.core.location.MovementEngine
import java.util.Locale

internal fun MovementEngine.Mode.label(): String =
    when (this) {
        MovementEngine.Mode.Once -> "Once"
        MovementEngine.Mode.Loop -> "Loop"
        MovementEngine.Mode.PingPong -> "Ping-pong"
    }

internal fun Double.toDisplaySpeed(): String = if (this % 1.0 == 0.0) "${toInt()} km/h" else "$this km/h"

// The compact map status rounds fractional speeds; other route summaries retain full precision.
internal fun formatRouteStatusSpeedKmh(value: Double): String = if (value % 1.0 == 0.0) value.toDisplaySpeed() else "%.1f km/h".format(Locale.US, value)

internal fun formatMeters(value: Double): String = if (value % 1.0 == 0.0) value.toInt().toString() else value.toString()

internal fun formatDistance(meters: Double): String = if (meters >= 1000.0) "%.1f km".format(meters / 1000.0) else "${formatMeters(meters)} m"

internal fun estimatedRouteDistance(
    pointCount: Int?,
    spacingMeters: Double?,
): String =
    if (pointCount != null && spacingMeters != null) {
        formatDistance((pointCount - 1).coerceAtLeast(0) * spacingMeters)
    } else {
        "—"
    }
