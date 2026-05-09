package dev.narumi.kestrel.feature.map

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.LocationService

private val TAIPEI = LatLng(25.0330, 121.5654)

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun MockDemoScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val permissions = buildList {
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    val permissionState = rememberMultiplePermissionsState(permissions)
    var status by remember { mutableStateOf("idle") }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("Kestrel — P1 mock demo")
        Text(
            "Enable in: Settings → Developer options → Select mock location app → Kestrel",
        )
        OutlinedButton(onClick = {
            context.startActivity(
                Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }) { Text("Open developer options") }

        HorizontalDivider()

        if (!permissionState.allPermissionsGranted) {
            Text("Permissions required: location" + if (permissions.size > 1) " + notifications" else "")
            Button(onClick = { permissionState.launchMultiplePermissionRequest() }) {
                Text("Grant permissions")
            }
        } else {
            Text("Permissions granted.")
        }

        HorizontalDivider()

        Button(onClick = {
            LocationService.start(context)
            status = "service started"
        }) { Text("Start service") }

        Button(
            enabled = permissionState.allPermissionsGranted,
            onClick = {
                LocationService.setLocation(context, TAIPEI)
                status = "set Taipei (${TAIPEI.lat}, ${TAIPEI.lng})"
            },
        ) { Text("Set Taipei") }

        OutlinedButton(onClick = {
            LocationService.stop(context)
            status = "service stopped"
        }) { Text("Stop service") }

        HorizontalDivider()
        Text("Status: $status")
    }
}
