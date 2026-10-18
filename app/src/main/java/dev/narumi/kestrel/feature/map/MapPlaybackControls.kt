package dev.narumi.kestrel.feature.map

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.i18n.displayNumber
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.ui.components.KestrelIconBadge
import dev.narumi.kestrel.ui.components.KestrelIcons

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
    val resources = LocalResources.current
    val context = LocalContext.current
    val (statusIcon, title, subtitle) =
        when (runState) {
            RunState.Idle -> {
                Triple(
                    if (waypointCount > 1) KestrelIcons.RouteFilled else KestrelIcons.MyLocation,
                    when (waypointCount) {
                        0 -> resources.getString(R.string.choose_a_location)
                        1 -> resources.getString(R.string.point_preview)
                        else -> resources.getQuantityString(R.plurals.route_waypoint_title, waypointCount, context.displayNumber(waypointCount, 0))
                    },
                    when (waypointCount) {
                        0 -> resources.getString(R.string.tap_the_map_or_choose_a_saved_target)
                        1 -> resources.getString(R.string.start_here_or_add_another_waypoint_for_a_route)
                        else -> resources.getString(R.string.preview_only_start_when_you_re_ready)
                    },
                )
            }

            RunState.Single -> {
                Triple(
                    KestrelIcons.MyLocation,
                    resources.getString(R.string.mocking_single_point),
                    mockNow?.let { "%.5f, %.5f".format(java.util.Locale.US, it.lat, it.lng) } ?: "—",
                )
            }

            RunState.RoutePlaying -> {
                Triple(
                    KestrelIcons.Play,
                    resources.getString(R.string.route_playing),
                    formatRouteStatusDetails(context, waypointCount, speedKmh, routeMode),
                )
            }

            RunState.RoutePaused -> {
                Triple(
                    KestrelIcons.Pause,
                    resources.getString(R.string.route_paused),
                    formatRouteStatusDetails(context, waypointCount, speedKmh, routeMode),
                )
            }
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
    val resources = LocalResources.current
    val context = LocalContext.current
    when (runState) {
        RunState.Idle -> {
            val label =
                when {
                    waypointCount == 0 -> resources.getString(R.string.generate_random_route)
                    waypointCount == 1 -> resources.getString(R.string.mock_this_point)
                    else -> resources.getString(R.string.play_route)
                }
            val enabled = !operationPending && ready
            Button(
                onClick = onPrimary,
                enabled = enabled,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                Text(
                    when {
                        operationPending -> resources.getString(R.string.applying)
                        !ready -> resources.getString(R.string.finish_setup_above)
                        else -> label
                    },
                )
            }
        }

        RunState.Single -> {
            Button(
                onClick = onStop,
                enabled = !operationPending,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) { Text(if (operationPending) resources.getString(R.string.stopping) else resources.getString(R.string.stop_mock)) }
        }

        RunState.RoutePlaying, RunState.RoutePaused -> {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = onPrimary,
                    enabled = !operationPending,
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                ) {
                    Text(
                        when {
                            operationPending -> resources.getString(R.string.applying)
                            runState == RunState.RoutePlaying -> resources.getString(R.string.pause)
                            else -> resources.getString(R.string.resume)
                        },
                    )
                }
                OutlinedButton(
                    onClick = onStop,
                    enabled = !operationPending,
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                ) { Text(stringResource(R.string.stop)) }
            }
        }
    }
}
