package dev.narumi.kestrel.feature.map

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.i18n.speed
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
    val resources = LocalResources.current
    val context = LocalContext.current
    KestrelCard {
        SectionLabel(resources.getString(R.string.playback_settings))
        Text(
            resources.getString(R.string.changes_apply_now_without_restarting_the_route),
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
    val resources = LocalResources.current
    val context = LocalContext.current
    SectionLabel(resources.getString(R.string.speed))
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        routeSpeedChoices(speedKmh).forEach { speed ->
            ChipChoice(
                label = context.speed(speed),
                selected = speed == speedKmh,
                enabled = enabled,
                onClick = { onSpeedChange(speed) },
            )
        }
    }
    SectionLabel(resources.getString(R.string.mode))
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
