package dev.narumi.kestrel.feature.map

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.MultiplePermissionsState
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import dev.narumi.kestrel.core.data.CameraSnapshot
import dev.narumi.kestrel.core.data.Favorite
import dev.narumi.kestrel.core.data.FavoriteRoute
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.LocationService
import dev.narumi.kestrel.core.location.MockProviderManager
import dev.narumi.kestrel.core.location.RouteGenerator
import dev.narumi.kestrel.core.location.rememberCurrentLocation
import dev.narumi.kestrel.core.map.KestrelMap
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

private enum class RunState { Idle, Single, RoutePlaying, RoutePaused }

private sealed interface PendingFavorite {
    data class Point(
        val target: LatLng,
    ) : PendingFavorite

    data class Route(
        val waypoints: List<LatLng>,
        val speedKmh: Double,
    ) : PendingFavorite
}

private val SPEED_PRESETS = listOf(5.0, 10.0, 15.0, 20.0)

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun MapScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val permissions =
        remember {
            buildList {
                add(Manifest.permission.ACCESS_FINE_LOCATION)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    add(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
        }
    val permissionState = rememberMultiplePermissionsState(permissions)
    val mockProvider = remember { MockProviderManager(context.applicationContext) }
    val prefs = remember { KestrelPrefs(context) }
    val scope = rememberCoroutineScope()

    val favorites by prefs.favorites.collectAsStateWithLifecycle(emptyList())

    var mockAllowed by remember { mutableStateOf(false) }
    var waypoints by remember { mutableStateOf<List<LatLng>>(emptyList()) }
    var speedKmh by remember { mutableStateOf(20.0) }
    var runState by remember { mutableStateOf(RunState.Idle) }
    var pendingFavorite by remember { mutableStateOf<PendingFavorite?>(null) }
    var favoriteName by remember { mutableStateOf("") }
    var cameraTarget by remember { mutableStateOf<CameraSnapshot?>(null) }
    var awaitCurrentForStartup by remember { mutableStateOf(false) }
    var lastCameraCenter by remember { mutableStateOf<LatLng?>(null) }
    var showGenerateDialog by remember { mutableStateOf(false) }
    var startupResolved by remember { mutableStateOf(false) }
    var firstCameraIdleSeen by remember { mutableStateOf(false) }

    val myLocation by rememberCurrentLocation(permissionState.allPermissionsGranted)

    LaunchedEffect(permissionState.allPermissionsGranted) {
        mockAllowed = mockProvider.isMockAllowed()
    }

    LaunchedEffect(Unit) {
        if (startupResolved) return@LaunchedEffect
        val pref = prefs.startupPreference.first()
        when (pref.mode) {
            StartupPreference.Mode.Last -> {
                prefs.lastCamera.first()?.let { cameraTarget = it }
            }
            StartupPreference.Mode.Current -> awaitCurrentForStartup = true
            StartupPreference.Mode.Favorite -> {
                prefs.favorites.first().find { it.name == pref.favoriteName }?.let { fav ->
                    cameraTarget = CameraSnapshot(fav.lat, fav.lng, 13.0)
                    val r = fav.route
                    if (r != null) {
                        waypoints = r.lats.indices.map { LatLng(r.lats[it], r.lngs[it]) }
                        speedKmh = r.speedKmh
                    } else {
                        LocationService.setLocation(context, LatLng(fav.lat, fav.lng))
                        runState = RunState.Single
                    }
                }
            }
        }
        startupResolved = true
    }

    LaunchedEffect(myLocation, awaitCurrentForStartup) {
        if (!awaitCurrentForStartup) return@LaunchedEffect
        val ml = myLocation ?: return@LaunchedEffect
        cameraTarget = CameraSnapshot(ml.lat, ml.lng, 15.0)
        awaitCurrentForStartup = false
    }

    val ready = permissionState.allPermissionsGranted && mockAllowed
    val mockNow by LocationService.currentMock.collectAsStateWithLifecycle()

    if (showGenerateDialog) {
        GenerateRouteDialog(
            onConfirm = { count, meters ->
                val origin =
                    lastCameraCenter
                        ?: myLocation
                        ?: cameraTarget?.let { LatLng(it.lat, it.lng) }
                        ?: LatLng(25.0330, 121.5654)
                waypoints = RouteGenerator.generate(origin, count, meters)
                if (runState == RunState.Single) {
                    LocationService.stop(context)
                    runState = RunState.Idle
                }
                showGenerateDialog = false
            },
            onDismiss = { showGenerateDialog = false },
        )
    }

    pendingFavorite?.let { pending ->
        val (title, supporting) =
            when (pending) {
                is PendingFavorite.Point ->
                    "Save favorite" to "%.5f, %.5f".format(pending.target.lat, pending.target.lng)
                is PendingFavorite.Route ->
                    "Save route" to "${pending.waypoints.size} waypoints · ${pending.speedKmh.toInt()} km/h"
            }
        AlertDialog(
            onDismissRequest = {
                pendingFavorite = null
                favoriteName = ""
            },
            title = { Text(title) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(supporting)
                    OutlinedTextField(
                        value = favoriteName,
                        onValueChange = { favoriteName = it },
                        label = { Text("Name") },
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val name = favoriteName.trim().ifEmpty { "Favorite ${favorites.size + 1}" }
                        val fav =
                            when (pending) {
                                is PendingFavorite.Point ->
                                    Favorite(
                                        name = name,
                                        lat = pending.target.lat,
                                        lng = pending.target.lng,
                                    )
                                is PendingFavorite.Route -> {
                                    val first = pending.waypoints.first()
                                    Favorite(
                                        name = name,
                                        lat = first.lat,
                                        lng = first.lng,
                                        route =
                                            FavoriteRoute(
                                                lats =
                                                    DoubleArray(pending.waypoints.size) { i ->
                                                        pending.waypoints[i].lat
                                                    },
                                                lngs =
                                                    DoubleArray(pending.waypoints.size) { i ->
                                                        pending.waypoints[i].lng
                                                    },
                                                speedKmh = pending.speedKmh,
                                            ),
                                    )
                                }
                            }
                        scope.launch { prefs.addFavorite(fav) }
                        pendingFavorite = null
                        favoriteName = ""
                    },
                ) { Text("Save") }
            },
            dismissButton = {
                TextButton(onClick = {
                    pendingFavorite = null
                    favoriteName = ""
                }) { Text("Cancel") }
            },
        )
    }

    Column(modifier = modifier.fillMaxSize()) {
        if (!permissionState.allPermissionsGranted || !mockAllowed) {
            StatusBanner(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
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
        }

        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .weight(1f),
        ) {
            KestrelMap(
                modifier = Modifier.fillMaxSize(),
                mockLocation = mockNow,
                polyline = waypoints,
                myLocation = myLocation,
                cameraTarget = cameraTarget,
                onMapClick = { point ->
                    if (runState == RunState.Idle || runState == RunState.Single) {
                        waypoints = waypoints + point
                        if (ready) {
                            LocationService.setLocation(context, point)
                            runState = RunState.Single
                        }
                    }
                },
                onMapLongClick = { pendingFavorite = PendingFavorite.Point(it) },
                onCameraIdle = { snap ->
                    lastCameraCenter = LatLng(snap.lat, snap.lng)
                    if (!firstCameraIdleSeen) {
                        firstCameraIdleSeen = true
                        return@KestrelMap
                    }
                    scope.launch { prefs.setLastCamera(snap) }
                },
            )
            InfoStrip(
                modifier =
                    Modifier
                        .align(Alignment.TopCenter)
                        .padding(8.dp),
                waypointCount = waypoints.size,
                runState = runState,
            )
            FilledTonalIconButton(
                onClick = {
                    myLocation?.let {
                        cameraTarget = CameraSnapshot(it.lat, it.lng, 15.0)
                    }
                },
                enabled = myLocation != null,
                modifier =
                    Modifier
                        .align(Alignment.BottomEnd)
                        .padding(12.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.MyLocation,
                    contentDescription = "Center on me",
                )
            }
        }

        ControlPanel(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
            ready = ready,
            waypoints = waypoints,
            speedKmh = speedKmh,
            runState = runState,
            onSpeedChange = { speedKmh = it },
            onGenerateRoute = { showGenerateDialog = true },
            onSaveRoute = {
                pendingFavorite = PendingFavorite.Route(waypoints, speedKmh)
            },
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
    val permissionsOk = permissionState.allPermissionsGranted
    Card(
        modifier = modifier,
        colors =
            CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.errorContainer,
                contentColor = MaterialTheme.colorScheme.onErrorContainer,
            ),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text =
                    if (!permissionsOk) {
                        "Location / notification permission needed"
                    } else {
                        "Kestrel isn't selected as the mock location app"
                    },
                style = MaterialTheme.typography.titleSmall,
            )
            Text(
                text =
                    if (!permissionsOk) {
                        "Grant the permissions below to use mock GPS."
                    } else {
                        "Open developer options and pick Kestrel as the mock location app."
                    },
                style = MaterialTheme.typography.bodySmall,
            )
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

@Composable
private fun InfoStrip(
    modifier: Modifier,
    waypointCount: Int,
    runState: RunState,
) {
    val label =
        when (runState) {
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
private fun GenerateRouteDialog(
    initialPointCount: Int = 10,
    initialSpacingMeters: Int = 50,
    onConfirm: (count: Int, meters: Double) -> Unit,
    onDismiss: () -> Unit,
) {
    var count by remember { mutableStateOf(initialPointCount.toString()) }
    var meters by remember { mutableStateOf(initialSpacingMeters.toString()) }
    val parsedCount = count.toIntOrNull()
    val parsedMeters = meters.toDoubleOrNull()
    val valid = parsedCount != null && parsedCount >= 2 && parsedMeters != null && parsedMeters > 0
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Generate random route") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "Smooth random walk from the current map center.",
                    style = MaterialTheme.typography.bodySmall,
                )
                OutlinedTextField(
                    value = count,
                    onValueChange = { v -> count = v.filter(Char::isDigit).take(4) },
                    label = { Text("Point count (≥ 2)") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = meters,
                    onValueChange = { v -> meters = v.filter { it.isDigit() || it == '.' }.take(7) },
                    label = { Text("Spacing (meters)") },
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = valid,
                onClick = { onConfirm(parsedCount!!, parsedMeters!!) },
            ) { Text("Generate") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ControlPanel(
    modifier: Modifier,
    ready: Boolean,
    waypoints: List<LatLng>,
    speedKmh: Double,
    runState: RunState,
    onSpeedChange: (Double) -> Unit,
    onGenerateRoute: () -> Unit,
    onSaveRoute: () -> Unit,
    onClear: () -> Unit,
    onSetSingle: () -> Unit,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStop: () -> Unit,
) {
    val isRouteRunning = runState == RunState.RoutePlaying || runState == RunState.RoutePaused
    Card(modifier = modifier) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "Speed",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                SPEED_PRESETS.forEach { preset ->
                    val selected = preset == speedKmh
                    AssistChip(
                        onClick = { onSpeedChange(preset) },
                        label = { Text("${preset.toInt()} km/h") },
                        enabled = !isRouteRunning,
                        leadingIcon =
                            if (selected) {
                                { Text("•") }
                            } else {
                                null
                            },
                    )
                }
            }
            if (!isRouteRunning) {
                Button(
                    onClick = onGenerateRoute,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Generate random route") }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedButton(
                        onClick = onClear,
                        enabled = waypoints.isNotEmpty(),
                        modifier = Modifier.weight(1f),
                    ) { Text("Clear") }
                    OutlinedButton(
                        onClick = onSaveRoute,
                        enabled = waypoints.size >= 2,
                        modifier = Modifier.weight(1f),
                    ) { Text("Save route") }
                    Button(
                        onClick = onSetSingle,
                        enabled = ready && waypoints.isNotEmpty(),
                        modifier = Modifier.weight(1f),
                    ) { Text("Set last") }
                }
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                when (runState) {
                    RunState.RoutePlaying ->
                        Button(
                            onClick = onPause,
                            modifier = Modifier.weight(1f),
                        ) { Text("Pause") }
                    RunState.RoutePaused ->
                        Button(
                            onClick = onResume,
                            modifier = Modifier.weight(1f),
                        ) { Text("Resume") }
                    else ->
                        Button(
                            onClick = onPlay,
                            enabled = ready && waypoints.size >= 2,
                            modifier = Modifier.weight(1f),
                        ) { Text("Play route") }
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
