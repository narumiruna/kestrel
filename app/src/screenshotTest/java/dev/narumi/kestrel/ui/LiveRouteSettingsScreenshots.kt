package dev.narumi.kestrel.ui

import android.content.res.Configuration
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.feature.map.LiveRouteSettingsCard
import dev.narumi.kestrel.ui.theme.KestrelTheme

@PreviewTest
@Preview(name = "Live route settings", widthDp = 360)
@Preview(name = "Live route settings dark", widthDp = 360, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Preview(name = "Live route settings narrow large text", widthDp = 320, fontScale = 2f)
@Composable
fun LiveRouteSettingsScreenshot() {
    KestrelTheme {
        Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.padding(16.dp)) {
            LiveRouteSettingsCard(
                speedKmh = 12.0,
                routeMode = MovementEngine.Mode.PingPong,
                enabled = true,
                onSpeedChange = {},
                onModeChange = {},
            )
        }
    }
}

@PreviewTest
@Preview(name = "Live route settings pending", widthDp = 320)
@Composable
fun LiveRouteSettingsPendingScreenshot() {
    KestrelTheme {
        LiveRouteSettingsCard(
            speedKmh = 20.0,
            routeMode = MovementEngine.Mode.Loop,
            enabled = false,
            onSpeedChange = {},
            onModeChange = {},
        )
    }
}
