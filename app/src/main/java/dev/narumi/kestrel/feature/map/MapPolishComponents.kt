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
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
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
            Text("Choose target", style = MaterialTheme.typography.titleSmall)
        }
    }
}

@Composable
internal fun MapHintPill(modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
        contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        shadowElevation = 1.dp,
    ) {
        Text(
            text = "Tap to preview · Hold for actions",
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
    KestrelCard {
        SectionLabel("Preview")
        Text(
            text = "Current: $currentSummary",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "New: $previewSummary",
            style = MaterialTheme.typography.titleSmall,
        )
        Text(
            text = "The current mock continues until you confirm replacement.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        KestrelActionRow {
            OutlinedButton(
                onClick = onUndoLast,
                enabled = !applying,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text("Undo last waypoint")
            }
            OutlinedButton(
                onClick = onCancelPreview,
                enabled = !applying,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text("Cancel preview")
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
                Text(if (applying) "Replacing…" else "Replace current mock")
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
    var menuExpanded by remember { mutableStateOf(false) }
    KestrelCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SectionLabel("Save for later")
                Text(
                    text =
                        if (waypointCount == 1) {
                            "Save this point, or tap the map to extend it into a route."
                        } else {
                            "$waypointCount waypoints · Save this route to Favorites."
                        },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Box {
                IconButton(onClick = { menuExpanded = true }, enabled = enabled) {
                    KestrelIcon(KestrelIcons.More, contentDescription = "More preview actions")
                }
                DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                    DropdownMenuItem(
                        text = { Text("Clear preview") },
                        enabled = enabled,
                        onClick = {
                            menuExpanded = false
                            onClear()
                        },
                    )
                    DropdownMenuItem(
                        text = { Text("Replace with random route") },
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
                Text(if (waypointCount == 1) "Save point" else "Save route")
            }
            TextButton(onClick = onUndoLast, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp)) {
                Text("Undo last waypoint")
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
    title: String = "Route settings",
) {
    KestrelCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                SectionLabel(title)
                Text(
                    text = "${speedKmh.toDisplaySpeed()} · ${routeMode.label()}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(onClick = { onExpandedChange(!expanded) }) {
                Text(if (expanded) "Hide" else "Change")
            }
        }
        if (expanded) {
            Text(
                text = "Speed and playback mode apply when the route starts.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            RouteSettingsChoices(speedKmh, routeMode, enabled, onSpeedChange, onModeChange)
        }
    }
}
