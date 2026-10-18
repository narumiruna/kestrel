package dev.narumi.kestrel.feature.map

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.i18n.displayNumber
import dev.narumi.kestrel.core.i18n.speed
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.ui.components.KestrelActionRow
import dev.narumi.kestrel.ui.components.KestrelCard
import dev.narumi.kestrel.ui.components.KestrelIcon
import dev.narumi.kestrel.ui.components.KestrelIcons
import dev.narumi.kestrel.ui.components.onKeyboardActivate

@Composable
internal fun MapTargetSearchBar(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val resources = LocalResources.current
    val context = LocalContext.current
    Surface(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 3.dp,
    ) {
        Row(
            modifier = Modifier.heightIn(min = 56.dp).padding(horizontal = 20.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            KestrelIcon(
                imageVector = KestrelIcons.Search,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Text(resources.getString(R.string.choose_target), style = MaterialTheme.typography.titleSmall)
        }
    }
}

@Composable
internal fun MapHintPill(modifier: Modifier = Modifier) {
    val resources = LocalResources.current
    val context = LocalContext.current
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
        contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        shadowElevation = 1.dp,
    ) {
        Text(
            text = resources.getString(R.string.tap_to_preview_hold_for_actions),
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            style = MaterialTheme.typography.labelMedium,
        )
    }
}

@Composable
internal fun ReplacementPreviewCard(
    currentSummary: String,
    previewSummary: String,
    applying: Boolean,
    onReplace: () -> Unit,
    onUndoLast: () -> Unit,
    onCancelPreview: () -> Unit,
) {
    val resources = LocalResources.current
    val context = LocalContext.current
    KestrelCard {
        SectionLabel(resources.getString(R.string.preview))
        Text(
            text = resources.getString(R.string.current_1_s, (currentSummary).toString()),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = resources.getString(R.string.new_1_s, (previewSummary).toString()),
            style = MaterialTheme.typography.titleSmall,
        )
        Text(
            text = resources.getString(R.string.the_current_mock_continues_until_you_confirm_replacement),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        KestrelActionRow {
            OutlinedButton(
                onClick = onUndoLast,
                enabled = !applying,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.undo_last_waypoint))
            }
            OutlinedButton(
                onClick = onCancelPreview,
                enabled = !applying,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.cancel_preview))
            }
            androidx.compose.material3.Button(
                onClick = onReplace,
                enabled = !applying,
                modifier =
                    Modifier
                        .heightIn(min = 48.dp)
                        .onKeyboardActivate(onReplace)
                        .focusable(),
            ) {
                Text(if (applying) resources.getString(R.string.replacing) else resources.getString(R.string.replace_current_mock))
            }
        }
    }
}

@Composable
internal fun MapFeedbackCard(
    message: String,
    isError: Boolean,
) {
    val liveRegionMode = if (isError) LiveRegionMode.Assertive else LiveRegionMode.Polite
    KestrelCard(
        modifier = Modifier.semantics { liveRegion = liveRegionMode },
    ) {
        Text(
            text = message,
            modifier = Modifier.semantics { liveRegion = liveRegionMode },
            style = MaterialTheme.typography.bodyMedium,
            color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
        )
    }
}

@Composable
internal fun DraftPreviewActionsCard(
    waypointCount: Int,
    enabled: Boolean,
    onUndoLast: () -> Unit,
    onClear: () -> Unit,
    onSavePreview: () -> Unit,
    onGenerate: () -> Unit,
) {
    val resources = LocalResources.current
    val context = LocalContext.current
    var menuExpanded by remember { mutableStateOf(false) }
    KestrelCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SectionLabel(resources.getString(R.string.save_for_later))
                Text(
                    text =
                        if (waypointCount == 1) {
                            resources.getString(R.string.save_this_point_or_tap_the_map_to_extend_it_into_a_route)
                        } else {
                            resources.getQuantityString(R.plurals.save_route_waypoints, waypointCount, context.displayNumber(waypointCount, 0))
                        },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Box {
                IconButton(onClick = { menuExpanded = true }, enabled = enabled) {
                    KestrelIcon(KestrelIcons.More, contentDescription = resources.getString(R.string.more_preview_actions))
                }
                DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                    DropdownMenuItem(
                        text = { Text(resources.getString(R.string.clear_preview)) },
                        enabled = enabled,
                        onClick = {
                            menuExpanded = false
                            onClear()
                        },
                    )
                    DropdownMenuItem(
                        text = { Text(resources.getString(R.string.replace_with_random_route)) },
                        enabled = enabled,
                        onClick = {
                            menuExpanded = false
                            onGenerate()
                        },
                    )
                }
            }
        }
        KestrelActionRow {
            OutlinedButton(
                onClick = onSavePreview,
                enabled = enabled && waypointCount > 0,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(if (waypointCount == 1) resources.getString(R.string.save_point) else resources.getString(R.string.save_route))
            }
            TextButton(onClick = onUndoLast, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.undo_last_waypoint))
            }
        }
    }
}

@Composable
internal fun RouteSettingsCard(
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onSpeedChange: (Double) -> Unit,
    onModeChange: (MovementEngine.Mode) -> Unit,
    enabled: Boolean = true,
    title: String? = null,
) {
    val resources = LocalResources.current
    val context = LocalContext.current
    KestrelCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                SectionLabel(title ?: resources.getString(R.string.route_settings))
                Text(
                    text = resources.getString(R.string.speed_and_mode, context.speed(speedKmh), routeMode.label()),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(onClick = { onExpandedChange(!expanded) }) {
                Text(if (expanded) resources.getString(R.string.hide) else resources.getString(R.string.change))
            }
        }
        if (expanded) {
            Text(
                text = resources.getString(R.string.speed_and_playback_mode_apply_when_the_route_starts),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            RouteSettingsChoices(speedKmh, routeMode, enabled, onSpeedChange, onModeChange)
        }
    }
}
