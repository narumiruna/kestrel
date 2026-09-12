package dev.narumi.kestrel.feature.map

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Route
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.ui.components.KestrelIconBadge

@Composable
internal fun MapPlaybackControls(
    runState: RunState,
    waypointCount: Int,
    draftWaypointCount: Int,
    mockNow: LatLng?,
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
    ready: Boolean,
    operationPending: Boolean,
    onPrimary: () -> Unit,
    onStop: () -> Unit,
) {
    Column(
        modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        StatusRow(runState, waypointCount, mockNow, speedKmh, routeMode)
        PrimaryActionRow(runState, draftWaypointCount, ready, operationPending, onPrimary, onStop)
    }
}

@Composable
private fun StatusRow(
    runState: RunState,
    waypointCount: Int,
    mockNow: LatLng?,
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
) {
    val (statusIcon, title, subtitle) =
        when (runState) {
            RunState.Idle ->
                Triple(
                    if (waypointCount > 1) Icons.Filled.Route else Icons.Filled.MyLocation,
                    when (waypointCount) {
                        0 -> "Choose a location"
                        1 -> "Point preview"
                        else -> "$waypointCount-waypoint route"
                    },
                    when (waypointCount) {
                        0 -> "Tap the map or choose a saved target."
                        1 -> "Start here, or add another waypoint for a route."
                        else -> "Preview only · Start when you’re ready."
                    },
                )
            RunState.Single ->
                Triple(
                    Icons.Filled.MyLocation,
                    "Mocking single point",
                    mockNow?.let { "%.5f, %.5f".format(it.lat, it.lng) } ?: "—",
                )
            RunState.RoutePlaying ->
                Triple(
                    Icons.Filled.PlayArrow,
                    "Route playing",
                    formatRouteStatusDetails(waypointCount, speedKmh, routeMode),
                )
            RunState.RoutePaused ->
                Triple(
                    Icons.Filled.Pause,
                    "Route paused",
                    formatRouteStatusDetails(waypointCount, speedKmh, routeMode),
                )
        }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        val active = runState == RunState.Single || runState == RunState.RoutePlaying
        KestrelIconBadge(
            icon = statusIcon,
            containerColor =
                if (active) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.primaryContainer,
            contentColor =
                if (active) MaterialTheme.colorScheme.onTertiaryContainer else MaterialTheme.colorScheme.onPrimaryContainer,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun PrimaryActionRow(
    runState: RunState,
    waypointCount: Int,
    ready: Boolean,
    operationPending: Boolean,
    onPrimary: () -> Unit,
    onStop: () -> Unit,
) {
    when (runState) {
        RunState.Idle -> {
            val label =
                when {
                    waypointCount == 0 -> "Generate random route"
                    waypointCount == 1 -> "Mock this point"
                    else -> "Play route"
                }
            val enabled = !operationPending && ready
            Button(
                onClick = onPrimary,
                enabled = enabled,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                Text(
                    when {
                        operationPending -> "Applying…"
                        !ready -> "Finish setup above"
                        else -> label
                    },
                )
            }
        }
        RunState.Single ->
            Button(
                onClick = onStop,
                enabled = !operationPending,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) { Text(if (operationPending) "Stopping…" else "Stop mock") }
        RunState.RoutePlaying, RunState.RoutePaused ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = onPrimary,
                    enabled = !operationPending,
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                ) {
                    Text(
                        when {
                            operationPending -> "Applying…"
                            runState == RunState.RoutePlaying -> "Pause"
                            else -> "Resume"
                        },
                    )
                }
                OutlinedButton(
                    onClick = onStop,
                    enabled = !operationPending,
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                ) { Text("Stop") }
            }
    }
}
