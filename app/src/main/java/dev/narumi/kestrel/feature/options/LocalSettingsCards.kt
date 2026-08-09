package dev.narumi.kestrel.feature.options

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import dev.narumi.kestrel.core.data.MockPlaybackSettings
import dev.narumi.kestrel.core.data.RandomRoutePreference
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.ui.components.KestrelActionRow

@Composable
internal fun StartupPreferenceCard(
    items: List<LibraryItemWithContent>,
    itemsLoading: Boolean,
    startup: StartupPreference,
    saving: Boolean,
    error: String?,
    onSave: (StartupPreference, onSuccess: () -> Unit) -> Unit,
) {
    var editing by rememberSaveable { mutableStateOf(false) }
    var draftMode by rememberSaveable { mutableStateOf(startup.mode) }
    var draftItemId by rememberSaveable { mutableStateOf(startup.libraryItemId) }
    val selectedItem = items.firstOrNull { it.item.id == startup.libraryItemId }

    OptionsDisclosureCard(
        title = OptionsSection.Startup.title,
        subtitle = "Choose the map view or Favorite used after launch.",
        summary =
            if (itemsLoading && startup.mode == StartupPreference.Mode.Favorite) {
                "Loading Favorite…"
            } else {
                startupSummary(startup.mode, selectedItem?.name)
            },
        expanded = editing,
        onExpandedChange = { expanded ->
            if (!saving) {
                if (expanded) {
                    draftMode = startup.mode
                    draftItemId = startup.libraryItemId
                }
                editing = expanded
            }
        },
    ) {
        StartupPreferenceEditor(
            items = items,
            itemsLoading = itemsLoading,
            mode = draftMode,
            itemId = draftItemId,
            saving = saving,
            error = error,
            onModeChange = { mode ->
                draftMode = mode
                if (mode != StartupPreference.Mode.Favorite) draftItemId = null
            },
            onItemChange = { draftItemId = it },
            onCancel = { editing = false },
            onSave = {
                onSave(
                    StartupPreference(
                        mode = draftMode,
                        libraryItemId = draftItemId.takeIf { draftMode == StartupPreference.Mode.Favorite },
                    ),
                ) { editing = false }
            },
        )
    }
}

@Suppress("LongParameterList")
@Composable
private fun StartupPreferenceEditor(
    items: List<LibraryItemWithContent>,
    itemsLoading: Boolean,
    mode: StartupPreference.Mode,
    itemId: String?,
    saving: Boolean,
    error: String?,
    onModeChange: (StartupPreference.Mode) -> Unit,
    onItemChange: (String) -> Unit,
    onCancel: () -> Unit,
    onSave: () -> Unit,
) {
    StartupRadioRow(
        label = "Last map view",
        supporting = "Returns to the map area you last viewed.",
        selected = mode == StartupPreference.Mode.Last,
        enabled = !saving,
        onSelect = { onModeChange(StartupPreference.Mode.Last) },
    )
    HorizontalDivider()
    StartupRadioRow(
        label = "Current device location",
        supporting = "Centers the map after a location fix is available.",
        selected = mode == StartupPreference.Mode.Current,
        enabled = !saving,
        onSelect = { onModeChange(StartupPreference.Mode.Current) },
    )
    HorizontalDivider()
    StartupRadioRow(
        label = "A Favorite",
        supporting = if (items.isEmpty()) "Create a Favorite on the map first." else "Choose one below before saving.",
        selected = mode == StartupPreference.Mode.Favorite,
        enabled = !itemsLoading && items.isNotEmpty() && !saving,
        onSelect = { onModeChange(StartupPreference.Mode.Favorite) },
    )
    if (mode == StartupPreference.Mode.Favorite) {
        FavoriteStartupChoices(items, itemId, saving, onItemChange)
    }
    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    KestrelActionRow {
        OutlinedButton(onClick = onCancel, enabled = !saving) { Text("Cancel") }
        Button(
            enabled =
                !saving &&
                    (mode != StartupPreference.Mode.Favorite || items.any { it.item.id == itemId }),
            onClick = onSave,
        ) { Text(if (saving) "Saving…" else "Save changes") }
    }
}

@Composable
private fun FavoriteStartupChoices(
    items: List<LibraryItemWithContent>,
    itemId: String?,
    saving: Boolean,
    onItemChange: (String) -> Unit,
) {
    items.forEachIndexed { index, item ->
        if (index > 0) HorizontalDivider()
        StartupRadioRow(
            label = item.name,
            supporting = startupFavoriteEffect(item.kind),
            selected = itemId == item.item.id,
            enabled = !saving,
            onSelect = { onItemChange(item.item.id) },
        )
    }
}

@Composable
internal fun MockPlaybackSettingsCard(
    settings: MockPlaybackSettings,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    saving: Boolean,
    error: String?,
    onSave: (Int, onSuccess: () -> Unit) -> Unit,
) {
    val seconds = settings.progressWriteIntervalSeconds
    var draftSeconds by rememberSaveable { mutableStateOf(seconds) }
    OptionsDisclosureCard(
        title = OptionsSection.Playback.title,
        subtitle = "Choose how much route progress may rewind after Android stops the service.",
        summary = playbackSummary(seconds),
        expanded = expanded,
        onExpandedChange = { next ->
            if (!saving) {
                if (next) draftSeconds = seconds
                onExpandedChange(next)
            }
        },
    ) {
        RecoveryEditor(
            seconds = draftSeconds,
            saving = saving,
            error = error,
            onSecondsChange = { draftSeconds = it },
            onCancel = { onExpandedChange(false) },
            onSave = { onSave(draftSeconds) { onExpandedChange(false) } },
        )
    }
}

@Suppress("LongParameterList")
@Composable
private fun RecoveryEditor(
    seconds: Int,
    saving: Boolean,
    error: String?,
    onSecondsChange: (Int) -> Unit,
    onCancel: () -> Unit,
    onSave: () -> Unit,
) {
    Text(text = playbackSummary(seconds), style = MaterialTheme.typography.titleSmall)
    Text(
        text = "This applies to the next route start or restore. Smaller values save progress more often.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    KestrelActionRow {
        listOf(1 to "More accurate", 5 to "Balanced", 15 to "Fewer writes").forEach { (value, label) ->
            OutlinedButton(onClick = { onSecondsChange(value) }, enabled = !saving) {
                Text(if (seconds == value) "✓ $label" else label)
            }
        }
    }
    Text("Custom: $seconds seconds", style = MaterialTheme.typography.labelLarge)
    KestrelActionRow {
        OutlinedButton(
            onClick = { onSecondsChange(seconds - 1) },
            enabled = !saving && seconds > MockPlaybackSettings.MIN_PROGRESS_WRITE_INTERVAL_SECONDS,
        ) { Text("− 1 second") }
        OutlinedButton(
            onClick = { onSecondsChange(seconds + 1) },
            enabled = !saving && seconds < MockPlaybackSettings.MAX_PROGRESS_WRITE_INTERVAL_SECONDS,
        ) { Text("+ 1 second") }
    }
    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    KestrelActionRow {
        OutlinedButton(onClick = onCancel, enabled = !saving) { Text("Cancel") }
        Button(onClick = onSave, enabled = !saving) { Text(if (saving) "Saving…" else "Save changes") }
    }
}

@Suppress("LongParameterList")
@Composable
internal fun RandomRouteDefaultsCard(
    pointCount: String,
    spacingMeters: String,
    preference: RandomRoutePreference,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onPointCountChange: (String) -> Unit,
    onSpacingMetersChange: (String) -> Unit,
    saving: Boolean,
    error: String?,
    onSave: (resetToRecommended: Boolean, onSuccess: () -> Unit) -> Unit,
) {
    var resetToRecommended by rememberSaveable { mutableStateOf(false) }
    OptionsDisclosureCard(
        title = OptionsSection.RandomRoute.title,
        subtitle = "Choose the fallback shape used by the route generator.",
        summary = randomRouteSummary(preference.effectivePointCount, preference.effectiveSpacingMeters, preference.usesLastSettings),
        expanded = expanded,
        onExpandedChange = { next ->
            if (!saving) {
                if (next) {
                    onPointCountChange(preference.defaultPointCount.toString())
                    onSpacingMetersChange(formatMeters(preference.defaultSpacingMeters))
                    resetToRecommended = false
                }
                onExpandedChange(next)
            }
        },
    ) {
        RandomRouteEditor(
            pointCount = pointCount,
            spacingMeters = spacingMeters,
            preference = preference,
            resetToRecommended = resetToRecommended,
            saving = saving,
            error = error,
            onPointCountChange = {
                resetToRecommended = false
                onPointCountChange(it)
            },
            onSpacingMetersChange = {
                resetToRecommended = false
                onSpacingMetersChange(it)
            },
            onUseRecommended = {
                resetToRecommended = true
                onPointCountChange(RandomRoutePreference.RECOMMENDED_POINT_COUNT.toString())
                onSpacingMetersChange(formatMeters(RandomRoutePreference.RECOMMENDED_SPACING_METERS))
            },
            onCancel = { onExpandedChange(false) },
            onSave = { onSave(resetToRecommended) { onExpandedChange(false) } },
        )
    }
}

@Suppress("LongParameterList")
@Composable
private fun RandomRouteEditor(
    pointCount: String,
    spacingMeters: String,
    preference: RandomRoutePreference,
    resetToRecommended: Boolean,
    saving: Boolean,
    error: String?,
    onPointCountChange: (String) -> Unit,
    onSpacingMetersChange: (String) -> Unit,
    onUseRecommended: () -> Unit,
    onCancel: () -> Unit,
    onSave: () -> Unit,
) {
    val parsedPointCount = pointCount.toIntOrNull()
    val parsedSpacing = spacingMeters.toDoubleOrNull()
    Text(
        text =
            if (preference.usesLastSettings) {
                "The generator currently starts with your last-used values; these defaults remain the fallback."
            } else {
                "These values appear when no previous generator choices exist."
            },
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    OutlinedTextField(
        value = pointCount,
        onValueChange = onPointCountChange,
        label = { Text("Point count (2–1000)") },
        isError = pointCount.isNotBlank() && !isValidPointCount(parsedPointCount),
        singleLine = true,
        enabled = !saving,
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = spacingMeters,
        onValueChange = onSpacingMetersChange,
        label = { Text("Spacing meters (1–10000)") },
        isError = spacingMeters.isNotBlank() && !isValidSpacing(parsedSpacing),
        singleLine = true,
        enabled = !saving,
        modifier = Modifier.fillMaxWidth(),
    )
    Text(
        text = "Estimated distance: ${estimatedDistance(parsedPointCount, parsedSpacing)}",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    if (resetToRecommended) {
        Text("Recommended values are previewed. Save changes to apply them.", color = MaterialTheme.colorScheme.primary)
    }
    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    KestrelActionRow {
        OutlinedButton(onClick = onUseRecommended, enabled = !saving) { Text("Use recommended") }
        OutlinedButton(onClick = onCancel, enabled = !saving) { Text("Cancel") }
        Button(
            onClick = onSave,
            enabled = isValidRandomRoute(parsedPointCount, parsedSpacing) && !saving,
        ) { Text(if (saving) "Saving…" else "Save changes") }
    }
}

private fun estimatedDistance(
    pointCount: Int?,
    spacingMeters: Double?,
): String =
    if (pointCount != null && spacingMeters != null) {
        formatDistance((pointCount - 1).coerceAtLeast(0) * spacingMeters)
    } else {
        "—"
    }

internal fun isValidPointCount(value: Int?): Boolean = value != null && value in RandomRoutePreference.MIN_POINT_COUNT..RandomRoutePreference.MAX_POINT_COUNT

internal fun isValidSpacing(value: Double?): Boolean =
    value != null &&
        value >= RandomRoutePreference.MIN_SPACING_METERS &&
        value <= RandomRoutePreference.MAX_SPACING_METERS

internal fun isValidRandomRoute(
    pointCount: Int?,
    spacingMeters: Double?,
): Boolean = isValidPointCount(pointCount) && isValidSpacing(spacingMeters)

internal fun formatMeters(value: Double): String = if (value % 1.0 == 0.0) value.toInt().toString() else value.toString()

private fun formatDistance(meters: Double): String = if (meters >= 1000.0) "%.1f km".format(meters / 1000.0) else "${formatMeters(meters)} m"

@Composable
private fun StartupRadioRow(
    label: String,
    selected: Boolean,
    onSelect: () -> Unit,
    enabled: Boolean = true,
    supporting: String? = null,
) {
    ListItem(
        headlineContent = { Text(label) },
        supportingContent = supporting?.let { { Text(it) } },
        leadingContent = { RadioButton(selected = selected, onClick = null, enabled = enabled) },
        modifier = Modifier.fillMaxWidth().selectable(selected = selected, enabled = enabled, onClick = onSelect),
    )
}

@Suppress("UnusedPrivateFunction")
@Preview(showBackground = true)
@Composable
private fun MockPlaybackSettingsCardPreview() {
    MaterialTheme {
        MockPlaybackSettingsCard(
            settings = MockPlaybackSettings(progressWriteIntervalSeconds = 10),
            expanded = true,
            onExpandedChange = {},
            saving = false,
            error = null,
            onSave = { _, _ -> },
        )
    }
}
