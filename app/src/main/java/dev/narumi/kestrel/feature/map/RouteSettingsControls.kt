package dev.narumi.kestrel.feature.map

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.ui.components.KestrelCard

internal fun routeSpeedChoices(currentSpeedKmh: Double): List<Double> = (listOf(5.0, 10.0, 15.0, 20.0) + currentSpeedKmh).distinct().sorted()

@Composable
internal fun LiveRouteSettingsCard(
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
    enabled: Boolean,
    onSpeedChange: (Double) -> Unit,
    onModeChange: (MovementEngine.Mode) -> Unit,
) {
    KestrelCard {
        SectionLabel("Playback settings")
        Text(
            "Changes apply now without restarting the route.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        RouteSettingsChoices(speedKmh, routeMode, enabled, onSpeedChange, onModeChange)
    }
}

@Composable
internal fun RouteSettingsChoices(
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
    enabled: Boolean,
    onSpeedChange: (Double) -> Unit,
    onModeChange: (MovementEngine.Mode) -> Unit,
) {
    SectionLabel("Speed")
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        routeSpeedChoices(speedKmh).forEach { speed ->
            ChipChoice(
                label = speed.toDisplaySpeed(),
                selected = speed == speedKmh,
                enabled = enabled,
                onClick = { onSpeedChange(speed) },
            )
        }
    }
    SectionLabel("Mode")
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        MovementEngine.Mode.entries.forEach { mode ->
            ChipChoice(
                label = mode.label(),
                selected = mode == routeMode,
                enabled = enabled,
                onClick = { onModeChange(mode) },
            )
        }
    }
}

internal fun Double.toDisplaySpeed(): String = if (this % 1.0 == 0.0) "${toInt()} km/h" else "$this km/h"
