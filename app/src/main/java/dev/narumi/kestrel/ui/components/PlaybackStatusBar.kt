package dev.narumi.kestrel.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.i18n.coordinates
import dev.narumi.kestrel.core.i18n.routeDetails
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.RuntimeState

internal data class PlaybackBarPresentation(
    val title: Int,
    val runtime: RuntimeState,
    val primaryAction: PlaybackBarAction?,
)

internal enum class PlaybackBarAction { Pause, Resume }

internal fun playbackBarPresentation(runtime: RuntimeState): PlaybackBarPresentation? =
    when (runtime) {
        RuntimeState.Idle -> {
            null
        }

        is RuntimeState.Single -> {
            PlaybackBarPresentation(
                title = R.string.mocking_point,
                runtime = runtime,
                primaryAction = null,
            )
        }

        is RuntimeState.Route -> {
            PlaybackBarPresentation(
                title = if (runtime.paused) R.string.route_paused else R.string.route_playing,
                runtime = runtime,
                primaryAction = if (runtime.paused) PlaybackBarAction.Resume else PlaybackBarAction.Pause,
            )
        }
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
    val resources = LocalResources.current
    val presentation = playbackBarPresentation(runtime) ?: return
    val context = LocalContext.current
    val details =
        when (runtime) {
            is RuntimeState.Single -> coordinates(runtime.point.lat, runtime.point.lng)
            is RuntimeState.Route -> context.routeDetails(runtime.waypoints.size, runtime.speedKmh, runtime.mode)
            RuntimeState.Idle -> return
        }
    Surface(
        modifier = modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
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
                            .clickable(role = Role.Button, onClickLabel = resources.getString(R.string.view_map), onClick = onViewMap)
                            .heightIn(min = 48.dp)
                            .padding(horizontal = 8.dp)
                            .semantics { stateDescription = details },
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        resources.getString(presentation.title),
                        style = MaterialTheme.typography.titleSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        if (busy) resources.getString(R.string.applying_playback_change) else resources.getString(R.string.view_map),
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
    val resources = LocalResources.current
    val context = LocalContext.current
    if (primaryAction != null) {
        val paused = primaryAction == PlaybackBarAction.Resume
        IconButton(onClick = if (paused) onResume else onPause, enabled = !busy) {
            KestrelIcon(
                imageVector = if (paused) KestrelIcons.Play else KestrelIcons.Pause,
                contentDescription = if (paused) resources.getString(R.string.resume) else resources.getString(R.string.pause),
            )
        }
    }
    IconButton(onClick = onStop, enabled = !busy) {
        KestrelIcon(KestrelIcons.Stop, contentDescription = resources.getString(R.string.stop))
    }
}
