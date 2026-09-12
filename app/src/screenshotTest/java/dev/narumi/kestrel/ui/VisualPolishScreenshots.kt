package dev.narumi.kestrel.ui

import android.content.res.Configuration
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudQueue
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import dev.narumi.kestrel.feature.map.MapHintPill
import dev.narumi.kestrel.feature.map.MapTargetSearchBar
import dev.narumi.kestrel.feature.options.OptionsDisclosureCard
import dev.narumi.kestrel.ui.components.KestrelScreenHeader
import dev.narumi.kestrel.ui.components.KestrelSectionHeader
import dev.narumi.kestrel.ui.theme.KestrelTheme

@PreviewTest
@Preview(name = "Settings light", widthDp = 360, heightDp = 760)
@Preview(name = "Settings dark", widthDp = 360, heightDp = 760, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(name = "Settings narrow large text", widthDp = 320, heightDp = 760, fontScale = 2f)
@Composable
fun SettingsVisualPolishScreenshot() {
    KestrelTheme {
        Surface(color = MaterialTheme.colorScheme.background) {
            Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                KestrelScreenHeader("Settings", "Make Kestrel work your way.", icon = Icons.Outlined.Settings)
                KestrelSectionHeader("On this device")
                OptionsDisclosureCard(
                    title = "When app opens",
                    subtitle = "Choose the map view or Favorite used after launch.",
                    summary = "Last map position",
                    expanded = false,
                    onExpandedChange = {},
                    icon = Icons.Outlined.Explore,
                ) {}
                OptionsDisclosureCard(
                    title = "Route recovery",
                    subtitle = "Choose how much progress may rewind after Android stops the service.",
                    summary = "Balanced · can rewind up to 5 s",
                    expanded = false,
                    onExpandedChange = {},
                    icon = Icons.Outlined.Restore,
                ) {}
                KestrelSectionHeader("Connected services")
                OptionsDisclosureCard(
                    title = "Cloud sync",
                    subtitle = "Connect to Kestrel cloud and keep favorites synced.",
                    summary = "Signed out",
                    expanded = false,
                    onExpandedChange = {},
                    icon = Icons.Outlined.CloudQueue,
                ) {}
            }
        }
    }
}

@PreviewTest
@Preview(name = "Map chrome light", widthDp = 360)
@Preview(name = "Map chrome dark", widthDp = 360, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(name = "Map chrome large text", widthDp = 320, fontScale = 2f)
@Composable
fun MapChromeVisualPolishScreenshot() {
    KestrelTheme {
        Surface(color = MaterialTheme.colorScheme.surfaceContainer) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                MapTargetSearchBar(onClick = {})
                MapHintPill()
            }
        }
    }
}
