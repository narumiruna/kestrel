package dev.narumi.kestrel.feature.options

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import dev.narumi.kestrel.R
import dev.narumi.kestrel.ui.components.KestrelActionRow
import dev.narumi.kestrel.ui.components.KestrelIcons

@Composable
internal fun MapLinksOptionsCard(
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
) {
    val context = LocalContext.current
    OptionsDisclosureCard(
        title = stringResource(OptionsSection.MapLinks.title),
        icon = KestrelIcons.Link,
        subtitle = stringResource(R.string.options_map_links_help),
        summary = stringResource(R.string.options_map_links_summary),
        expanded = expanded,
        onExpandedChange = onExpandedChange,
    ) {
        Text(
            text = stringResource(R.string.options_map_links_supported),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = stringResource(R.string.options_map_links_android_notice),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        KestrelActionRow {
            Button(onClick = { context.openMapLinkSettings() }) {
                Text(stringResource(R.string.options_map_links_settings))
            }
            OutlinedButton(onClick = { context.testGeoMapLink() }) {
                Text(stringResource(R.string.options_map_links_test))
            }
        }
    }
}

private fun Context.openMapLinkSettings() {
    val uri = Uri.parse("package:$packageName")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val opened =
            tryStartActivity(
                Intent(Settings.ACTION_APP_OPEN_BY_DEFAULT_SETTINGS, uri)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, packageName),
            )
        if (opened) return
    }
    tryStartActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri))
}

private fun Context.testGeoMapLink() {
    tryStartActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:25.033,121.565")))
}

private fun Context.tryStartActivity(intent: Intent): Boolean =
    runCatching {
        startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }.isSuccess
