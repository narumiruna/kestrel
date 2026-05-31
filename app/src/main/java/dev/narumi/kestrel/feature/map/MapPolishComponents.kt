package dev.narumi.kestrel.feature.map

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.ui.components.KestrelActionRow
import dev.narumi.kestrel.ui.components.KestrelCard

@Composable
internal fun MapHintPill(modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors =
            CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
                contentColor = MaterialTheme.colorScheme.onSurface,
            ),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
    ) {
        Text(
            text = "Tap map to add · Long-press for actions",
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            style = MaterialTheme.typography.labelMedium,
        )
    }
}

@Composable
internal fun DraftRouteActionsCard(
    waypointCount: Int,
    onClear: () -> Unit,
    onSaveRoute: () -> Unit,
    onGenerate: () -> Unit,
) {
    KestrelCard {
        SectionLabel("Draft route")
        Text(
            text =
                if (waypointCount == 1) {
                    "Add one more waypoint before saving as a route."
                } else {
                    "$waypointCount waypoints ready to save or replace."
                },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        KestrelActionRow {
            OutlinedButton(onClick = onClear) { Text("Clear", maxLines = 1) }
            OutlinedButton(onClick = onSaveRoute, enabled = waypointCount >= 2) {
                Text("Save route", maxLines = 1)
            }
            OutlinedButton(onClick = onGenerate) { Text("Re-generate", maxLines = 1) }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun RouteSettingsCard(
    waypointCount: Int,
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
    isRouteRunning: Boolean,
    onSpeedChange: (Double) -> Unit,
    onModeChange: (MovementEngine.Mode) -> Unit,
) {
    KestrelCard {
        SectionLabel("Route settings")
        Text(
            text = "Preset speed and playback mode apply to the next route start.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        SectionLabel("Speed")
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SPEED_PRESETS.forEach { preset ->
                ChipChoice(
                    label = "${preset.toInt()} km/h",
                    selected = preset == speedKmh,
                    enabled = !isRouteRunning,
                    onClick = { onSpeedChange(preset) },
                )
            }
        }
        SectionLabel("Mode")
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            MovementEngine.Mode.entries.forEach { entry ->
                ChipChoice(
                    label = entry.label(),
                    selected = entry == routeMode,
                    enabled = !isRouteRunning && waypointCount >= 2,
                    onClick = { onModeChange(entry) },
                )
            }
        }
    }
}
