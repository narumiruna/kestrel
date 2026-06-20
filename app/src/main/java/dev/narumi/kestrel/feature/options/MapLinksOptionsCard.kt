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
import dev.narumi.kestrel.ui.components.KestrelActionRow
import dev.narumi.kestrel.ui.components.KestrelCard
import dev.narumi.kestrel.ui.components.KestrelSectionHeader

@Composable
internal fun MapLinksOptionsCard() {
    val context = LocalContext.current
    KestrelCard {
        KestrelSectionHeader(
            title = "Map links",
            subtitle = "Let Android open map coordinates with Kestrel.",
        )
        Text(
            text = "Kestrel supports geo: coordinate links and Google Maps links that include coordinates.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "Android controls defaults; Google web links may still open Google Maps or Chrome.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        KestrelActionRow {
            Button(onClick = { context.openMapLinkSettings() }) {
                Text("Open Android link settings", maxLines = 1)
            }
            OutlinedButton(onClick = { context.testGeoMapLink() }) {
                Text("Test geo link", maxLines = 1)
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
