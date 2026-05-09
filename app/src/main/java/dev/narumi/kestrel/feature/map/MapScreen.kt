package dev.narumi.kestrel.feature.map

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SheetValue
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberBottomSheetScaffoldState
import androidx.compose.material3.rememberStandardBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import dev.narumi.kestrel.core.location.MovementEngine
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
        val mode: MovementEngine.Mode,
    ) : PendingFavorite
}

private val SPEED_PRESETS = listOf(5.0, 10.0, 15.0, 20.0)

private fun MovementEngine.Mode.label(): String =
    when (this) {
        MovementEngine.Mode.Once -> "Once"
        MovementEngine.Mode.Loop -> "Loop"
        MovementEngine.Mode.PingPong -> "Ping-pong"
    }

@OptIn(ExperimentalPermissionsApi::class, ExperimentalMaterial3Api::class)
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
    var routeMode by remember { mutableStateOf(MovementEngine.Mode.Once) }
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
                        routeMode =
                            runCatching { MovementEngine.Mode.valueOf(r.mode) }
                                .getOrDefault(MovementEngine.Mode.Once)
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

    val sheetState =
        rememberStandardBottomSheetState(
            initialValue = SheetValue.PartiallyExpanded,
            skipHiddenState = true,
        )
    val scaffoldState = rememberBottomSheetScaffoldState(bottomSheetState = sheetState)

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
        SaveFavoriteDialog(
            pending = pending,
            name = favoriteName,
            onNameChange = { favoriteName = it },
            onConfirm = {
                val name = favoriteName.trim().ifEmpty { "Favorite ${favorites.size + 1}" }
                scope.launch { prefs.addFavorite(pending.toFavorite(name)) }
                pendingFavorite = null
                favoriteName = ""
            },
            onDismiss = {
                pendingFavorite = null
                favoriteName = ""
            },
        )
    }

    BottomSheetScaffold(
        modifier = modifier.fillMaxSize(),
        scaffoldState = scaffoldState,
        sheetPeekHeight = 156.dp,
        sheetContent = {
            MapSheet(
                runState = runState,
                waypointCount = waypoints.size,
                mockNow = mockNow,
                ready = ready,
                speedKmh = speedKmh,
                routeMode = routeMode,
                onSpeedChange = { speedKmh = it },
                onModeChange = { routeMode = it },
                onPrimary = {
                    handlePrimary(
                        runState = runState,
                        waypoints = waypoints,
                        ready = ready,
                        speedKmh = speedKmh,
                        routeMode = routeMode,
                        context = context,
                        showGenerate = { showGenerateDialog = true },
                        setRunState = { runState = it },
                    )
                },
                onStop = {
                    LocationService.stop(context)
                    runState = RunState.Idle
                },
                onClear = {
                    waypoints = emptyList()
                    if (runState != RunState.Idle) {
                        LocationService.stop(context)
                        runState = RunState.Idle
                    }
                },
                onSaveRoute = {
                    pendingFavorite = PendingFavorite.Route(waypoints, speedKmh, routeMode)
                },
                onGenerate = { showGenerateDialog = true },
            )
        },
    ) { innerPadding ->
        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
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
            if (!permissionState.allPermissionsGranted || !mockAllowed) {
                StatusBanner(
                    modifier =
                        Modifier
                            .align(Alignment.TopCenter)
                            .padding(horizontal = 12.dp, vertical = 12.dp),
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
            Column(
                modifier =
                    Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = 16.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                horizontalAlignment = Alignment.End,
            ) {
                SmallFloatingActionButton(onClick = { showGenerateDialog = true }) {
                    Icon(Icons.Filled.AutoAwesome, contentDescription = "Generate route")
                }
                SmallFloatingActionButton(
                    onClick = {
                        myLocation?.let { cameraTarget = CameraSnapshot(it.lat, it.lng, 15.0) }
                    },
                ) {
                    Icon(Icons.Filled.MyLocation, contentDescription = "Center on me")
                }
            }
        }
    }
}

private fun PendingFavorite.toFavorite(name: String): Favorite =
    when (this) {
        is PendingFavorite.Point ->
            Favorite(name = name, lat = target.lat, lng = target.lng)
        is PendingFavorite.Route -> {
            val first = waypoints.first()
            Favorite(
                name = name,
                lat = first.lat,
                lng = first.lng,
                route =
                    FavoriteRoute(
                        lats = DoubleArray(waypoints.size) { i -> waypoints[i].lat },
                        lngs = DoubleArray(waypoints.size) { i -> waypoints[i].lng },
                        speedKmh = speedKmh,
                        mode = mode.name,
                    ),
            )
        }
    }

@Suppress("LongParameterList")
private fun handlePrimary(
    runState: RunState,
    waypoints: List<LatLng>,
    ready: Boolean,
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
    context: android.content.Context,
    showGenerate: () -> Unit,
    setRunState: (RunState) -> Unit,
) {
    when (runState) {
        RunState.Idle -> {
            when {
                waypoints.isEmpty() -> showGenerate()
                waypoints.size == 1 -> {
                    if (ready) {
                        LocationService.setLocation(context, waypoints.first())
                        setRunState(RunState.Single)
                    }
                }
                else -> {
                    if (ready) {
                        LocationService.startRoute(context, waypoints, speedKmh, routeMode)
                        setRunState(RunState.RoutePlaying)
                    }
                }
            }
        }
        RunState.Single -> Unit // handled by Stop
        RunState.RoutePlaying -> {
            LocationService.pause(context)
            setRunState(RunState.RoutePaused)
        }
        RunState.RoutePaused -> {
            LocationService.resume(context)
            setRunState(RunState.RoutePlaying)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Suppress("LongParameterList")
@Composable
private fun MapSheet(
    runState: RunState,
    waypointCount: Int,
    mockNow: LatLng?,
    ready: Boolean,
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
    onSpeedChange: (Double) -> Unit,
    onModeChange: (MovementEngine.Mode) -> Unit,
    onPrimary: () -> Unit,
    onStop: () -> Unit,
    onClear: () -> Unit,
    onSaveRoute: () -> Unit,
    onGenerate: () -> Unit,
) {
    val isRouteRunning = runState == RunState.RoutePlaying || runState == RunState.RoutePaused
    val canShowExtras = !isRouteRunning
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        StatusRow(runState = runState, waypointCount = waypointCount, mockNow = mockNow)
        PrimaryActionRow(
            runState = runState,
            waypointCount = waypointCount,
            ready = ready,
            onPrimary = onPrimary,
            onStop = onStop,
        )
        if (canShowExtras && waypointCount > 0) {
            HorizontalDivider()
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = onClear,
                    modifier = Modifier.weight(1f),
                ) { Text("Clear") }
                OutlinedButton(
                    onClick = onSaveRoute,
                    enabled = waypointCount >= 2,
                    modifier = Modifier.weight(1f),
                ) { Text("Save route") }
                OutlinedButton(
                    onClick = onGenerate,
                    modifier = Modifier.weight(1f),
                ) { Text("Re-generate") }
            }
        }
        HorizontalDivider()
        SectionLabel("Speed")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SPEED_PRESETS.forEach { preset ->
                ChipChoice(
                    label = "${preset.toInt()} km/h",
                    selected = preset == speedKmh,
                    enabled = !isRouteRunning,
                    onClick = { onSpeedChange(preset) },
                )
            }
        }
        SectionLabel("Mode")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MovementEngine.Mode.entries.forEach { entry ->
                ChipChoice(
                    label = entry.label(),
                    selected = entry == routeMode,
                    enabled = !isRouteRunning && waypointCount >= 2,
                    onClick = { onModeChange(entry) },
                )
            }
        }
        Spacer(Modifier.size(4.dp))
    }
}

@Composable
private fun StatusRow(
    runState: RunState,
    waypointCount: Int,
    mockNow: LatLng?,
) {
    val (dotColor, title, subtitle) =
        when (runState) {
            RunState.Idle ->
                Triple(
                    MaterialTheme.colorScheme.outline,
                    if (waypointCount == 0) "Idle" else "$waypointCount waypoints",
                    if (waypointCount == 0) {
                        "Tap the map to drop a point or generate a route."
                    } else if (waypointCount == 1) {
                        "Tap a button below to mock this point."
                    } else {
                        "Ready to play."
                    },
                )
            RunState.Single ->
                Triple(
                    MaterialTheme.colorScheme.error,
                    "Mocking single point",
                    mockNow?.let { "%.5f, %.5f".format(it.lat, it.lng) } ?: "—",
                )
            RunState.RoutePlaying ->
                Triple(
                    MaterialTheme.colorScheme.error,
                    "Route playing",
                    "$waypointCount waypoints",
                )
            RunState.RoutePaused ->
                Triple(
                    MaterialTheme.colorScheme.tertiary,
                    "Route paused",
                    "$waypointCount waypoints",
                )
        }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier =
                Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(dotColor),
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun PrimaryActionRow(
    runState: RunState,
    waypointCount: Int,
    ready: Boolean,
    onPrimary: () -> Unit,
    onStop: () -> Unit,
) {
    when (runState) {
        RunState.Idle -> {
            val label =
                when {
                    waypointCount == 0 -> "Generate random route"
                    waypointCount == 1 -> "Mock this point"
                    else -> "Play route"
                }
            val enabled =
                when {
                    waypointCount == 0 -> true
                    else -> ready
                }
            Button(
                onClick = onPrimary,
                enabled = enabled,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(label) }
        }
        RunState.Single ->
            Button(
                onClick = onStop,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Stop mock") }
        RunState.RoutePlaying ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onPrimary,
                    modifier = Modifier.weight(1f),
                ) { Text("Pause") }
                OutlinedButton(
                    onClick = onStop,
                    modifier = Modifier.weight(1f),
                ) { Text("Stop") }
            }
        RunState.RoutePaused ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onPrimary,
                    modifier = Modifier.weight(1f),
                ) { Text("Resume") }
                OutlinedButton(
                    onClick = onStop,
                    modifier = Modifier.weight(1f),
                ) { Text("Stop") }
            }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun ChipChoice(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    AssistChip(
        onClick = onClick,
        label = { Text(label) },
        enabled = enabled,
        colors =
            if (selected) {
                AssistChipDefaults.assistChipColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    labelColor = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            } else {
                AssistChipDefaults.assistChipColors()
            },
    )
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

@Composable
private fun SaveFavoriteDialog(
    pending: PendingFavorite,
    name: String,
    onNameChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val (title, supporting) =
        when (pending) {
            is PendingFavorite.Point ->
                "Save favorite" to "%.5f, %.5f".format(pending.target.lat, pending.target.lng)
            is PendingFavorite.Route ->
                "Save route" to
                    "${pending.waypoints.size} waypoints · ${pending.speedKmh.toInt()} km/h"
        }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(supporting)
                OutlinedTextField(
                    value = name,
                    onValueChange = onNameChange,
                    label = { Text("Name") },
                )
            }
        },
        confirmButton = { TextButton(onClick = onConfirm) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
