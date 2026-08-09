package dev.narumi.kestrel.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
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
    KestrelCard(
        modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(presentation.title, style = MaterialTheme.typography.titleSmall)
                Text(
                    presentation.details,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            OutlinedButton(onClick = onViewMap) { Text("View map") }
        }
        if (busy) {
            Text(
                text = "Applying playback change…",
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        error?.let {
            Text(
                text = it,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        KestrelActionRow {
            when (presentation.primaryAction) {
                PlaybackBarAction.Pause -> Button(onClick = onPause, enabled = !busy) { Text("Pause") }
                PlaybackBarAction.Resume -> Button(onClick = onResume, enabled = !busy) { Text("Resume") }
                null -> Unit
            }
            OutlinedButton(onClick = onStop, enabled = !busy) { Text("Stop") }
        }
    }
}

private fun Double.toBarSpeed(): String = if (this % 1.0 == 0.0) "${toInt()} km/h" else "$this km/h"

private fun MovementEngine.Mode.toBarLabel(): String =
    when (this) {
        MovementEngine.Mode.Once -> "Once"
        MovementEngine.Mode.Loop -> "Loop"
        MovementEngine.Mode.PingPong -> "Ping-pong"
    }
