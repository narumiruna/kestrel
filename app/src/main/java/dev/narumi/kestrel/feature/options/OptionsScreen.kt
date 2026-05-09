package dev.narumi.kestrel.feature.options

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.RandomRoutePreference
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.core.library.LibraryRepository
import dev.narumi.kestrel.core.library.description
import kotlinx.coroutines.launch

@Composable
fun OptionsScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val prefs = remember { KestrelPrefs(context) }
    val libraryRepository = remember { LibraryRepository.getInstance(context) }
    val scope = rememberCoroutineScope()

    val items by libraryRepository.items.collectAsStateWithLifecycle(emptyList())
    val startup by prefs.startupPreference.collectAsStateWithLifecycle(StartupPreference())
    val randomRoute by prefs.randomRoutePreference.collectAsStateWithLifecycle(RandomRoutePreference())
    var defaultPointCount by remember { mutableStateOf("") }
    var defaultSpacingMeters by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        libraryRepository.ensureMigrated()
    }

    LaunchedEffect(randomRoute.defaultPointCount, randomRoute.defaultSpacingMeters) {
        defaultPointCount = randomRoute.defaultPointCount.toString()
        defaultSpacingMeters = formatMeters(randomRoute.defaultSpacingMeters)
    }

    fun update(pref: StartupPreference) {
        scope.launch { prefs.setStartupPreference(pref) }
    }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        StartupPreferenceCard(
            items = items,
            startup = startup,
            onUpdate = ::update,
        )

        RandomRouteDefaultsCard(
            pointCount = defaultPointCount,
            spacingMeters = defaultSpacingMeters,
            hasLastUsed = randomRoute.usesLastSettings,
            onPointCountChange = { defaultPointCount = it.filter(Char::isDigit).take(4) },
            onSpacingMetersChange = {
                defaultSpacingMeters = it.filter { ch -> ch.isDigit() || ch == '.' }.take(7)
            },
            onSave = {
                scope.launch {
                    prefs.setRandomRouteDefaults(
                        defaultPointCount.toIntOrNull() ?: return@launch,
                        defaultSpacingMeters.toDoubleOrNull() ?: return@launch,
                    )
                }
            },
            onReset = { scope.launch { prefs.resetRandomRoutePreference() } },
        )

        FavoriteStartupPicker(
            items = items,
            startup = startup,
            onSelect = { item ->
                update(
                    StartupPreference(
                        mode = StartupPreference.Mode.Favorite,
                        libraryItemId = item.item.id,
                        favoriteName = item.name,
                    ),
                )
            },
        )
    }
}

@Composable
private fun StartupPreferenceCard(
    items: List<LibraryItemWithContent>,
    startup: StartupPreference,
    onUpdate: (StartupPreference) -> Unit,
) {
    Text(
        text = "When opening the app",
        style = MaterialTheme.typography.titleMedium,
    )
    Card(modifier = Modifier.fillMaxWidth()) {
        StartupRadioRow(
            label = "Last position",
            selected = startup.mode == StartupPreference.Mode.Last,
            onSelect = { onUpdate(StartupPreference(StartupPreference.Mode.Last)) },
        )
        HorizontalDivider()
        StartupRadioRow(
            label = "Current location",
            selected = startup.mode == StartupPreference.Mode.Current,
            onSelect = { onUpdate(StartupPreference(StartupPreference.Mode.Current)) },
        )
        HorizontalDivider()
        StartupRadioRow(
            label =
                if (items.isEmpty()) {
                    "A favorite (none yet — long-press the map)"
                } else {
                    "A favorite"
                },
            selected = startup.mode == StartupPreference.Mode.Favorite,
            enabled = items.isNotEmpty(),
            onSelect = {
                val target =
                    items.firstOrNull { it.item.id == startup.libraryItemId }
                        ?: items.firstOrNull { startup.libraryItemId == null && it.name == startup.favoriteName }
                        ?: items.firstOrNull()
                        ?: return@StartupRadioRow
                onUpdate(
                    StartupPreference(
                        mode = StartupPreference.Mode.Favorite,
                        libraryItemId = target.item.id,
                        favoriteName = target.name,
                    ),
                )
            },
        )
    }
}

@Composable
private fun FavoriteStartupPicker(
    items: List<LibraryItemWithContent>,
    startup: StartupPreference,
    onSelect: (LibraryItemWithContent) -> Unit,
) {
    if (startup.mode != StartupPreference.Mode.Favorite || items.isEmpty()) return
    Text(
        text = "Pick a favorite",
        style = MaterialTheme.typography.titleSmall,
    )
    Card(modifier = Modifier.fillMaxWidth()) {
        items.forEachIndexed { index, item ->
            if (index > 0) HorizontalDivider()
            StartupRadioRow(
                label = item.name,
                supporting = item.description(),
                selected =
                    startup.libraryItemId == item.item.id ||
                        (startup.libraryItemId == null && startup.favoriteName == item.name),
                onSelect = { onSelect(item) },
            )
        }
    }
}

@Composable
private fun RandomRouteDefaultsCard(
    pointCount: String,
    spacingMeters: String,
    hasLastUsed: Boolean,
    onPointCountChange: (String) -> Unit,
    onSpacingMetersChange: (String) -> Unit,
    onSave: () -> Unit,
    onReset: () -> Unit,
) {
    val parsedPointCount = pointCount.toIntOrNull()
    val parsedSpacing = spacingMeters.toDoubleOrNull()
    val valid = isValidRandomRoute(parsedPointCount, parsedSpacing)
    Text(
        text = "Random route defaults",
        style = MaterialTheme.typography.titleMedium,
    )
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Used when no previous random route settings exist.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (hasLastUsed) {
                Text(
                    text = "Generate random route is currently using last used settings.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            OutlinedTextField(
                value = pointCount,
                onValueChange = onPointCountChange,
                label = { Text("Point count (2–1000)") },
                isError = pointCount.isNotBlank() && !isValidPointCount(parsedPointCount),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = spacingMeters,
                onValueChange = onSpacingMetersChange,
                label = { Text("Spacing meters (1–10000)") },
                isError = spacingMeters.isNotBlank() && !isValidSpacing(parsedSpacing),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text =
                    "Estimated distance: " +
                        if (parsedPointCount != null && parsedSpacing != null) {
                            formatDistance((parsedPointCount - 1).coerceAtLeast(0) * parsedSpacing)
                        } else {
                            "—"
                        },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onSave,
                    enabled = valid,
                ) { Text("Save") }
                OutlinedButton(onClick = onReset) { Text("Reset to recommended") }
            }
        }
    }
}

private fun isValidPointCount(value: Int?): Boolean =
    value != null &&
        value in RandomRoutePreference.MIN_POINT_COUNT..RandomRoutePreference.MAX_POINT_COUNT

private fun isValidSpacing(value: Double?): Boolean =
    value != null &&
        value >= RandomRoutePreference.MIN_SPACING_METERS &&
        value <= RandomRoutePreference.MAX_SPACING_METERS

private fun isValidRandomRoute(
    pointCount: Int?,
    spacingMeters: Double?,
): Boolean = isValidPointCount(pointCount) && isValidSpacing(spacingMeters)

private fun formatMeters(value: Double): String = if (value % 1.0 == 0.0) value.toInt().toString() else value.toString()

private fun formatDistance(meters: Double): String =
    if (meters >= 1000.0) {
        "%.1f km".format(meters / 1000.0)
    } else {
        "${formatMeters(meters)} m"
    }

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
        leadingContent = {
            RadioButton(selected = selected, onClick = onSelect, enabled = enabled)
        },
        modifier =
            Modifier
                .fillMaxWidth()
                .selectable(selected = selected, enabled = enabled, onClick = onSelect),
    )
}
