package dev.narumi.kestrel.feature.options

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.StartupPreference
import kotlinx.coroutines.launch

@Composable
fun OptionsScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val prefs = remember { KestrelPrefs(context) }
    val scope = rememberCoroutineScope()

    val favorites by prefs.favorites.collectAsStateWithLifecycle(emptyList())
    val startup by prefs.startupPreference.collectAsStateWithLifecycle(StartupPreference())

    fun update(pref: StartupPreference) {
        scope.launch { prefs.setStartupPreference(pref) }
    }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "When opening the app",
            style = MaterialTheme.typography.titleMedium,
        )
        Card(modifier = Modifier.fillMaxWidth()) {
            StartupRadioRow(
                label = "Last position",
                selected = startup.mode == StartupPreference.Mode.Last,
                onSelect = { update(StartupPreference(StartupPreference.Mode.Last)) },
            )
            HorizontalDivider()
            StartupRadioRow(
                label = "Current location",
                selected = startup.mode == StartupPreference.Mode.Current,
                onSelect = { update(StartupPreference(StartupPreference.Mode.Current)) },
            )
            HorizontalDivider()
            StartupRadioRow(
                label =
                    if (favorites.isEmpty()) {
                        "A favorite (none yet — long-press the map)"
                    } else {
                        "A favorite"
                    },
                selected = startup.mode == StartupPreference.Mode.Favorite,
                enabled = favorites.isNotEmpty(),
                onSelect = {
                    val target =
                        favorites.firstOrNull { it.name == startup.favoriteName }
                            ?: favorites.firstOrNull()
                            ?: return@StartupRadioRow
                    update(StartupPreference(StartupPreference.Mode.Favorite, target.name))
                },
            )
        }

        if (startup.mode == StartupPreference.Mode.Favorite && favorites.isNotEmpty()) {
            Text(
                text = "Pick a favorite",
                style = MaterialTheme.typography.titleSmall,
            )
            Card(modifier = Modifier.fillMaxWidth()) {
                favorites.forEachIndexed { index, fav ->
                    if (index > 0) HorizontalDivider()
                    val supporting =
                        fav.route?.let {
                            "Route · ${it.lats.size} waypoints · ${it.speedKmh.toInt()} km/h"
                        } ?: "%.5f, %.5f".format(fav.lat, fav.lng)
                    StartupRadioRow(
                        label = fav.name,
                        supporting = supporting,
                        selected = startup.favoriteName == fav.name,
                        onSelect = {
                            update(
                                StartupPreference(
                                    mode = StartupPreference.Mode.Favorite,
                                    favoriteName = fav.name,
                                ),
                            )
                        },
                    )
                }
            }
        }
    }
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
