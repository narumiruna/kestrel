package dev.narumi.kestrel.feature.map

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.MultiplePermissionsState
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import androidx.compose.ui.res.painterResource
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.LocationService
import dev.narumi.kestrel.core.location.MockProviderManager
import dev.narumi.kestrel.core.location.rememberCurrentLocation
import dev.narumi.kestrel.core.map.KestrelMap

private enum class RunState { Idle, Single, RoutePlaying, RoutePaused }

private val SPEED_PRESETS = listOf(5.0, 20.0, 60.0)

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun MapScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val permissions = remember {
        buildList {
            add(Manifest.permission.ACCESS_FINE_LOCATION)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
    val permissionState = rememberMultiplePermissionsState(permissions)
    val mockProvider = remember { MockProviderManager(context.applicationContext) }
    var mockAllowed by remember { mutableStateOf(false) }
    var waypoints by remember { mutableStateOf<List<LatLng>>(emptyList()) }
    var speedKmh by remember { mutableStateOf(20.0) }
    var runState by remember { mutableStateOf(RunState.Idle) }

    LaunchedEffect(permissionState.allPermissionsGranted) {
        mockAllowed = mockProvider.isMockAllowed()
    }

    val ready = permissionState.allPermissionsGranted && mockAllowed
    val mockTarget: LatLng? = if (runState == RunState.Single) waypoints.lastOrNull() else null
    val myLocation by rememberCurrentLocation(permissionState.allPermissionsGranted)
    var cameraTarget by remember { mutableStateOf<LatLng?>(null) }

    Column(modifier = modifier.fillMaxSize()) {
        StatusBanner(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            permissionState = permissionState,
            mockAllowed = mockAllowed,
            onOpenDeveloperOptions = {
                context.startActivity(
                    Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            },
            onRefreshMockCheck = { mockAllowed = mockProvider.isMockAllowed() },
        )

        Box(modifier = Modifier
            .fillMaxWidth()
            .weight(1f)) {
            KestrelMap(
                modifier = Modifier.fillMaxSize(),
                marker = mockTarget,
                polyline = waypoints,
                myLocation = myLocation,
                cameraTarget = cameraTarget,
                onMapClick = {
                    if (runState == RunState.Idle || runState == RunState.Single) {
                        waypoints = waypoints + it
                    }
                },
            )
            InfoStrip(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(8.dp),
                waypointCount = waypoints.size,
                runState = runState,
            )
            FilledTonalIconButton(
                onClick = {
                    myLocation?.let { cameraTarget = LatLng(it.lat, it.lng) }
                },
                enabled = myLocation != null,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(12.dp),
            ) {
                Icon(
                    painter = painterResource(R.drawable.ic_my_location),
                    contentDescription = "Center on me",
                )
            }
        }

        ControlPanel(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            ready = ready,
            waypoints = waypoints,
            speedKmh = speedKmh,
            runState = runState,
            onSpeedChange = { speedKmh = it },
            onClear = {
                waypoints = emptyList()
                if (runState != RunState.Idle) {
                    LocationService.stop(context)
                    runState = RunState.Idle
                }
            },
            onSetSingle = {
                val last = waypoints.lastOrNull() ?: return@ControlPanel
                LocationService.setLocation(context, last)
                runState = RunState.Single
            },
            onPlay = {
                LocationService.startRoute(context, waypoints, speedKmh)
                runState = RunState.RoutePlaying
            },
            onPause = {
                LocationService.pause(context)
                runState = RunState.RoutePaused
            },
            onResume = {
                LocationService.resume(context)
                runState = RunState.RoutePlaying
            },
            onStop = {
                LocationService.stop(context)
                runState = RunState.Idle
            },
        )
    }
}

@OptIn(ExperimentalPermissionsApi::class)
@Composable
private fun StatusBanner(
    modifier: Modifier,
    permissionState: MultiplePermissionsState,
    mockAllowed: Boolean,
    onOpenDeveloperOptions: () -> Unit,
    onRefreshMockCheck: () -> Unit,
) {
    Card(modifier = modifier) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            val permissionsOk = permissionState.allPermissionsGranted
            Text(
                text = "Permissions: " + if (permissionsOk) "granted" else "missing",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                text = "Mock app: " + if (mockAllowed) "selected" else "not selected",
                style = MaterialTheme.typography.bodyMedium,
            )
            if (!permissionsOk || !mockAllowed) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (!permissionsOk) {
                        Button(onClick = { permissionState.launchMultiplePermissionRequest() }) {
                            Text("Grant")
                        }
                    }
                    if (!mockAllowed) {
                        Button(onClick = onOpenDeveloperOptions) { Text("Dev options") }
                        OutlinedButton(onClick = onRefreshMockCheck) { Text("Recheck") }
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoStrip(
    modifier: Modifier,
    waypointCount: Int,
    runState: RunState,
) {
    val label = when (runState) {
        RunState.Idle -> "$waypointCount waypoints"
        RunState.Single -> "single point mock"
        RunState.RoutePlaying -> "playing • $waypointCount waypoints"
        RunState.RoutePaused -> "paused • $waypointCount waypoints"
    }
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun ControlPanel(
    modifier: Modifier,
    ready: Boolean,
    waypoints: List<LatLng>,
    speedKmh: Double,
    runState: RunState,
    onSpeedChange: (Double) -> Unit,
    onClear: () -> Unit,
    onSetSingle: () -> Unit,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStop: () -> Unit,
) {
    Card(modifier = modifier) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Speed:", style = MaterialTheme.typography.bodyMedium)
                SPEED_PRESETS.forEach { preset ->
                    AssistChip(
                        onClick = { onSpeedChange(preset) },
                        label = { Text("${preset.toInt()} km/h") },
                        enabled = runState == RunState.Idle || runState == RunState.Single,
                        leadingIcon = if (preset == speedKmh) {
                            { Text("•") }
                        } else null,
                    )
                }
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedButton(
                    onClick = onClear,
                    enabled = waypoints.isNotEmpty(),
                    modifier = Modifier.weight(1f),
                ) { Text("Clear") }
                Button(
                    onClick = onSetSingle,
                    enabled = ready && waypoints.isNotEmpty() &&
                        (runState == RunState.Idle || runState == RunState.Single),
                    modifier = Modifier.weight(1f),
                ) { Text("Set last") }
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                when (runState) {
                    RunState.RoutePlaying -> Button(
                        onClick = onPause,
                        modifier = Modifier.weight(1f),
                    ) { Text("Pause") }
                    RunState.RoutePaused -> Button(
                        onClick = onResume,
                        modifier = Modifier.weight(1f),
                    ) { Text("Resume") }
                    else -> Button(
                        onClick = onPlay,
                        enabled = ready && waypoints.size >= 2,
                        modifier = Modifier.weight(1f),
                    ) { Text("Play") }
                }
                OutlinedButton(
                    onClick = onStop,
                    enabled = runState != RunState.Idle,
                    modifier = Modifier.weight(1f),
                ) { Text("Stop") }
            }
        }
    }
}
