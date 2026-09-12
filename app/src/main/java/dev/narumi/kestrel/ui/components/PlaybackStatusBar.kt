package dev.narumi.kestrel.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.RuntimeState

internal data class PlaybackBarPresentation(
    val title: String,
    val details: String,
    val primaryAction: PlaybackBarAction?,
)

internal enum class PlaybackBarAction { Pause, Resume }

internal fun playbackBarPresentation(runtime: RuntimeState): PlaybackBarPresentation? =
    when (runtime) {
        RuntimeState.Idle -> null
        is RuntimeState.Single ->
            PlaybackBarPresentation(
                title = "Mocking point",
                details = "%.5f, %.5f".format(runtime.point.lat, runtime.point.lng),
                primaryAction = null,
            )
        is RuntimeState.Route ->
            PlaybackBarPresentation(
                title = if (runtime.paused) "Route paused" else "Route playing",
                details =
                    "${runtime.waypoints.size} waypoints · ${runtime.speedKmh.toBarSpeed()} · " +
                        runtime.mode.toBarLabel(),
                primaryAction = if (runtime.paused) PlaybackBarAction.Resume else PlaybackBarAction.Pause,
            )
    }

@Composable
fun PlaybackStatusBar(
    runtime: RuntimeState,
    busy: Boolean,
    error: String?,
    onViewMap: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStop: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val presentation = playbackBarPresentation(runtime) ?: return
    Surface(
        modifier = modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Column(modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Column(
                    modifier =
                        Modifier
                            .weight(1f)
                            .clickable(role = Role.Button, onClickLabel = "View map", onClick = onViewMap)
                            .heightIn(min = 48.dp)
                            .padding(horizontal = 8.dp)
                            .semantics { stateDescription = presentation.details },
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        presentation.title,
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        if (busy) "Applying playback change…" else "View map",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                PlaybackActions(presentation.primaryAction, busy, onPause, onResume, onStop)
            }
            error?.let {
                Text(
                    text = it,
                    modifier = Modifier.padding(8.dp).semantics { liveRegion = LiveRegionMode.Assertive },
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun PlaybackActions(
    primaryAction: PlaybackBarAction?,
    busy: Boolean,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStop: () -> Unit,
) {
    if (primaryAction != null) {
        val paused = primaryAction == PlaybackBarAction.Resume
        IconButton(onClick = if (paused) onResume else onPause, enabled = !busy) {
            Icon(
                imageVector = if (paused) Icons.Filled.PlayArrow else Icons.Filled.Pause,
                contentDescription = if (paused) "Resume" else "Pause",
            )
        }
    }
    IconButton(onClick = onStop, enabled = !busy) {
        Icon(Icons.Filled.Stop, contentDescription = "Stop")
    }
}

private fun Double.toBarSpeed(): String = if (this % 1.0 == 0.0) "${toInt()} km/h" else "$this km/h"

private fun MovementEngine.Mode.toBarLabel(): String =
    when (this) {
        MovementEngine.Mode.Once -> "Once"
        MovementEngine.Mode.Loop -> "Loop"
        MovementEngine.Mode.PingPong -> "Ping-pong"
    }
