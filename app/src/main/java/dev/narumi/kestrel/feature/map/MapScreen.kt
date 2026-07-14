package dev.narumi.kestrel.feature.map

import android.Manifest
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.SheetState
import androidx.compose.material3.SheetValue
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberBottomSheetScaffoldState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberStandardBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
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
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.RandomRoutePreference
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.library.LibraryItemKind
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.core.library.LibraryRepository
import dev.narumi.kestrel.core.library.description
import dev.narumi.kestrel.core.library.label
import dev.narumi.kestrel.core.library.primaryPoint
import dev.narumi.kestrel.core.library.routeWaypoints
import dev.narumi.kestrel.core.library.sortedFor
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.LocationService
import dev.narumi.kestrel.core.location.MockProviderManager
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.RouteGenerator
import dev.narumi.kestrel.core.location.RuntimeState
import dev.narumi.kestrel.core.location.parseCoordInput
import dev.narumi.kestrel.core.location.rememberCurrentLocation
import dev.narumi.kestrel.core.map.KestrelMap
import dev.narumi.kestrel.ui.components.KestrelActionRow
import dev.narumi.kestrel.ui.components.KestrelCard
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.Locale

internal enum class RunState { Idle, Single, RoutePlaying, RoutePaused }

internal enum class MapSetupStep { Permissions, MockLocationApp, Ready }

internal fun mapSetupStep(
    permissionsGranted: Boolean,
    mockAllowed: Boolean,
): MapSetupStep =
    when {
        !permissionsGranted -> MapSetupStep.Permissions
        !mockAllowed -> MapSetupStep.MockLocationApp
        else -> MapSetupStep.Ready
    }

internal fun shouldShowRouteSettings(
    runState: RunState,
    waypointCount: Int,
): Boolean =
    waypointCount >= 2 &&
        runState != RunState.RoutePlaying &&
        runState != RunState.RoutePaused

/**
 * Computed snapshot the map UI should render this frame. Lives separately from the user's drafts
 * so the runtime state from [LocationService] always wins while a Single / Route is active.
 */
internal data class MapRender(
    val runState: RunState,
    val waypoints: List<LatLng>,
    val speedKmh: Double,
    val routeMode: MovementEngine.Mode,
)

/**
 * Reconcile the service's [RuntimeState] with the user's draft state into what to render.
 *
 * - Idle / Single: use drafts. Single keeps the same "drafts editable while a single point is
 *   mocked" behavior the UI had before, with the actual mock dot coming from `currentMock`.
 * - Route: service is authoritative for waypoints / speed / mode; drafts are ignored.
 */
internal fun reconcileMapRender(
    runtime: RuntimeState,
    draftWaypoints: List<LatLng>,
    draftSpeedKmh: Double,
    draftRouteMode: MovementEngine.Mode,
): MapRender =
    when (runtime) {
        RuntimeState.Idle -> MapRender(RunState.Idle, draftWaypoints, draftSpeedKmh, draftRouteMode)
        is RuntimeState.Single ->
            MapRender(RunState.Single, draftWaypoints, draftSpeedKmh, draftRouteMode)
        is RuntimeState.Route ->
            MapRender(
                runState = if (runtime.paused) RunState.RoutePaused else RunState.RoutePlaying,
                waypoints = runtime.waypoints,
                speedKmh = runtime.speedKmh,
                routeMode = runtime.mode,
            )
    }

/**
 * `rememberSaveable` saver for the user's drafted waypoint list. Flattens to alternating lat/lng
 * doubles so it fits the autoSaver list type without needing LatLng to be Parcelable.
 */
private val DraftWaypointsSaver: Saver<List<LatLng>, List<Double>> =
    Saver(
        save = { list ->
            buildList(list.size * 2) {
                list.forEach {
                    add(it.lat)
                    add(it.lng)
                }
            }
        },
        restore = { flat ->
            (flat.indices step 2).map { LatLng(flat[it], flat[it + 1]) }
        },
    )

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

internal val SPEED_PRESETS = listOf(5.0, 10.0, 15.0, 20.0)

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

private fun formatWaypointCount(count: Int): String = if (count == 1) "1 waypoint" else "$count waypoints"

private fun formatSpeedKmh(value: Double): String =
    if (value % 1.0 == 0.0) {
        "${value.toInt()} km/h"
    } else {
        "%.1f km/h".format(Locale.US, value)
    }

internal fun formatRouteStatusDetails(
    waypointCount: Int,
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
): String = "${formatWaypointCount(waypointCount)} · ${formatSpeedKmh(speedKmh)} · ${routeMode.label()}"

internal fun MovementEngine.Mode.label(): String =
    when (this) {
        MovementEngine.Mode.Once -> "Once"
        MovementEngine.Mode.Loop -> "Loop"
        MovementEngine.Mode.PingPong -> "Ping-pong"
    }

@OptIn(ExperimentalPermissionsApi::class, ExperimentalMaterial3Api::class)
@Suppress("CyclomaticComplexMethod", "LongMethod")
@Composable
fun MapScreen(
    modifier: Modifier = Modifier,
    pendingFavoriteApply: LibraryItemWithContent? = null,
    onFavoriteApplyConsumed: () -> Unit = {},
    pendingMapLinkPoint: LatLng? = null,
    onMapLinkPointConsumed: () -> Unit = {},
) {
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
    val libraryRepository = remember { LibraryRepository.getInstance(context) }
    val scope = rememberCoroutineScope()

    val libraryItems by libraryRepository.items.collectAsStateWithLifecycle(emptyList())
    val sortMode by libraryRepository.sortMode.collectAsStateWithLifecycle(FavoritesSortMode())
    val randomRoutePref by
        prefs.randomRoutePreference.collectAsStateWithLifecycle(RandomRoutePreference())

    var mockAllowed by remember { mutableStateOf(false) }
    // Draft state: the route the user is composing before pressing Play. While a Route is
    // actually running, the service is the source of truth and these drafts are not displayed.
    var waypoints by rememberSaveable(stateSaver = DraftWaypointsSaver) {
        mutableStateOf<List<LatLng>>(emptyList())
    }
    var speedKmh by rememberSaveable { mutableStateOf(20.0) }
    var routeMode by rememberSaveable { mutableStateOf(MovementEngine.Mode.Once) }
    var pendingFavorite by remember { mutableStateOf<PendingFavorite?>(null) }
    var pendingLongPressPoint by remember { mutableStateOf<LatLng?>(null) }
    var favoriteName by remember { mutableStateOf("") }
    var cameraTarget by remember { mutableStateOf<CameraSnapshot?>(null) }
    var awaitCurrentForStartup by remember { mutableStateOf(false) }
    var lastCameraCenter by remember { mutableStateOf<LatLng?>(null) }
    var showGenerateDialog by remember { mutableStateOf(false) }
    var showGoToSheet by remember { mutableStateOf(false) }
    var startupResolved by remember { mutableStateOf(false) }
    var firstCameraIdleSeen by remember { mutableStateOf(false) }

    val myLocation by rememberCurrentLocation(permissionState.allPermissionsGranted)

    LaunchedEffect(permissionState.allPermissionsGranted) {
        mockAllowed = mockProvider.isMockAllowed()
    }

    LaunchedEffect(Unit) {
        if (startupResolved) return@LaunchedEffect
        if (pendingFavoriteApply != null || pendingMapLinkPoint != null) {
            startupResolved = true
            return@LaunchedEffect
        }
        val pref = prefs.startupPreference.first()
        when (pref.mode) {
            StartupPreference.Mode.Last -> {
                prefs.lastCamera.first()?.let { cameraTarget = it }
            }
            StartupPreference.Mode.Current -> awaitCurrentForStartup = true
            StartupPreference.Mode.Favorite -> {
                val currentItems = libraryRepository.items.first()
                val startupItem =
                    pref.libraryItemId?.let { itemId -> currentItems.firstOrNull { it.item.id == itemId } }
                startupItem?.let { item ->
                    applyStartupItem(
                        item = item,
                        context = context,
                        setWaypoints = { waypoints = it },
                        setCameraTarget = { cameraTarget = it },
                        setSpeedKmh = { speedKmh = it },
                        setRouteMode = { routeMode = it },
                    )
                    libraryRepository.touchItem(item.item.id)
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

    val setupStep = mapSetupStep(permissionState.allPermissionsGranted, mockAllowed)
    val ready = setupStep == MapSetupStep.Ready
    val mockNow by LocationService.currentMock.collectAsStateWithLifecycle()
    val runtimeState by LocationService.runtimeState.collectAsStateWithLifecycle()
    val render = reconcileMapRender(runtimeState, waypoints, speedKmh, routeMode)
    val runState = render.runState
    val renderedWaypoints = render.waypoints
    val renderedSpeedKmh = render.speedKmh
    val renderedRouteMode = render.routeMode

    val sheetState =
        rememberStandardBottomSheetState(
            initialValue = SheetValue.PartiallyExpanded,
            skipHiddenState = true,
        )
    val scaffoldState = rememberBottomSheetScaffoldState(bottomSheetState = sheetState)
    val goToSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    fun applyPoint(
        point: LatLng,
        stopRunningMock: Boolean = true,
    ) {
        // The service emits RuntimeState.Idle from ACTION_STOP, so the derived runState catches
        // up automatically; no manual reset needed here.
        if (stopRunningMock && runState != RunState.Idle) {
            LocationService.stop(context)
        }
        waypoints = listOf(point)
        cameraTarget = CameraSnapshot(point.lat, point.lng, 15.0)
        showGoToSheet = false
    }

    fun applyItem(item: LibraryItemWithContent) {
        if (runState != RunState.Idle) {
            LocationService.stop(context)
        }
        if (item.kind == LibraryItemKind.Place) {
            val point = item.primaryPoint() ?: return
            waypoints = listOf(point)
            cameraTarget = CameraSnapshot(point.lat, point.lng, 15.0)
        } else {
            val route = item.route ?: return
            val routeWaypoints = item.routeWaypoints()
            waypoints = routeWaypoints
            speedKmh = route.defaultSpeedKmh
            routeMode =
                runCatching { MovementEngine.Mode.valueOf(route.mode) }
                    .getOrDefault(MovementEngine.Mode.Once)
            routeWaypoints.firstOrNull()?.let { cameraTarget = CameraSnapshot(it.lat, it.lng, 15.0) }
        }
        showGoToSheet = false
        scope.launch { libraryRepository.touchItem(item.item.id) }
    }

    LaunchedEffect(pendingFavoriteApply) {
        pendingFavoriteApply?.let {
            applyItem(it)
            onFavoriteApplyConsumed()
        }
    }

    LaunchedEffect(pendingMapLinkPoint) {
        pendingMapLinkPoint?.let {
            applyPoint(it)
            onMapLinkPointConsumed()
        }
    }

    if (showGenerateDialog) {
        GenerateRouteDialog(
            initialPointCount = randomRoutePref.effectivePointCount,
            initialSpacingMeters = randomRoutePref.effectiveSpacingMeters,
            usingLastSettings = randomRoutePref.usesLastSettings,
            onConfirm = { count, meters ->
                val origin =
                    lastCameraCenter
                        ?: myLocation
                        ?: cameraTarget?.let { LatLng(it.lat, it.lng) }
                        ?: LatLng(25.0330, 121.5654)
                waypoints = RouteGenerator.generate(origin, count, meters)
                scope.launch { prefs.setLastRandomRouteSettings(count, meters) }
                if (runState == RunState.Single) {
                    LocationService.stop(context)
                }
                showGenerateDialog = false
            },
            onDismiss = { showGenerateDialog = false },
        )
    }

    if (showGoToSheet) {
        GoToSheet(
            sheetState = goToSheetState,
            items = libraryItems,
            sortMode = sortMode.mode,
            onSortModeChange = { mode -> scope.launch { libraryRepository.setSortMode(mode) } },
            onApplyPoint = ::applyPoint,
            onApplyItem = ::applyItem,
            onDismiss = { showGoToSheet = false },
        )
    }

    pendingFavorite?.let { pending ->
        SaveFavoriteDialog(
            pending = pending,
            name = favoriteName,
            onNameChange = { favoriteName = it },
            onConfirm = {
                val name = favoriteName.trim().ifEmpty { "Favorite ${libraryItems.size + 1}" }
                scope.launch {
                    when (pending) {
                        is PendingFavorite.Point ->
                            libraryRepository.addPlace(
                                name = name,
                                lat = pending.target.lat,
                                lng = pending.target.lng,
                            )
                        is PendingFavorite.Route ->
                            libraryRepository.addRoute(
                                name = name,
                                waypoints = pending.waypoints,
                                defaultSpeedKmh = pending.speedKmh,
                                mode = pending.mode.name,
                            )
                    }
                }
                pendingFavorite = null
                favoriteName = ""
            },
            onDismiss = {
                pendingFavorite = null
                favoriteName = ""
            },
        )
    }

    pendingLongPressPoint?.let { point ->
        LongPressActionDialog(
            point = point,
            ready = ready,
            onSaveFavorite = {
                pendingFavorite = PendingFavorite.Point(point)
                pendingLongPressPoint = null
            },
            onMockPoint = {
                // SET_LOCATION already replaces an active route/single mock atomically. Sending
                // STOP immediately before it can race the foreground service start timeout.
                applyPoint(point, stopRunningMock = false)
                LocationService.setLocation(context, point)
                pendingLongPressPoint = null
            },
            onDismiss = { pendingLongPressPoint = null },
        )
    }

    BottomSheetScaffold(
        modifier = modifier.fillMaxSize(),
        scaffoldState = scaffoldState,
        sheetPeekHeight = 168.dp,
        sheetContainerColor = MaterialTheme.colorScheme.surface,
        containerColor = MaterialTheme.colorScheme.background,
        sheetContent = {
            MapSheet(
                runState = runState,
                waypointCount = renderedWaypoints.size,
                mockNow = mockNow,
                ready = ready,
                speedKmh = renderedSpeedKmh,
                routeMode = renderedRouteMode,
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
                    )
                },
                onStop = { LocationService.stop(context) },
                onClear = {
                    waypoints = emptyList()
                    if (runState != RunState.Idle) {
                        LocationService.stop(context)
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
                polyline = renderedWaypoints,
                myLocation = myLocation,
                cameraTarget = cameraTarget,
                onMapClick = { point ->
                    // Preserve previous behavior: drafts editable while Idle or Single, locked
                    // while a Route is running so the user cannot accidentally mutate the
                    // service-owned route through map taps.
                    if (runState == RunState.Idle || runState == RunState.Single) {
                        waypoints = waypoints + point
                    }
                },
                onMapLongClick = { pendingLongPressPoint = it },
                onCameraIdle = { snap ->
                    lastCameraCenter = LatLng(snap.lat, snap.lng)
                    if (!firstCameraIdleSeen) {
                        firstCameraIdleSeen = true
                        return@KestrelMap
                    }
                    scope.launch { prefs.setLastCamera(snap) }
                },
            )
            if (setupStep != MapSetupStep.Ready) {
                StatusBanner(
                    modifier =
                        Modifier
                            .align(Alignment.TopCenter)
                            .padding(horizontal = 12.dp, vertical = 12.dp),
                    setupStep = setupStep,
                    permissionState = permissionState,
                    onOpenDeveloperOptions = {
                        context.startActivity(
                            Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                        )
                    },
                    onRefreshMockCheck = { mockAllowed = mockProvider.isMockAllowed() },
                )
            } else {
                MapHintPill(
                    modifier =
                        Modifier
                            .align(Alignment.TopStart)
                            .padding(horizontal = 12.dp, vertical = 12.dp),
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
                ExtendedFloatingActionButton(
                    onClick = { showGoToSheet = true },
                    icon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    text = { Text("Go to") },
                )
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GoToSheet(
    sheetState: SheetState,
    items: List<LibraryItemWithContent>,
    sortMode: FavoritesSortMode.Mode,
    onSortModeChange: (FavoritesSortMode.Mode) -> Unit,
    onApplyPoint: (LatLng) -> Unit,
    onApplyItem: (LibraryItemWithContent) -> Unit,
    onDismiss: () -> Unit,
) {
    var input by remember { mutableStateOf("") }
    var selectedTab by remember { mutableStateOf(0) }
    val parsed = parseCoordInput(input)
    val showInvalid = input.isNotBlank() && parsed == null
    val filteredItems =
        items
            .filter { if (selectedTab == 0) it.kind == LibraryItemKind.Place else it.kind == LibraryItemKind.Route }
            .sortedFor(sortMode)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Go to", style = MaterialTheme.typography.titleLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    label = { Text("Paste coordinates or Maps URL") },
                    supportingText = {
                        if (showInvalid) Text("Enter a valid lat/lng in range.")
                    },
                    isError = showInvalid,
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                Button(
                    onClick = { parsed?.let(onApplyPoint) },
                    enabled = parsed != null,
                    modifier = Modifier.align(Alignment.CenterVertically),
                ) { Text("Go") }
            }
            PrimaryTabRow(selectedTabIndex = selectedTab) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Points") },
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("Routes") },
                )
            }
            SortModeMenu(
                sortMode = sortMode,
                onSortModeChange = onSortModeChange,
            )
            if (filteredItems.isEmpty()) {
                Text(
                    text = if (selectedTab == 0) "No point favorites yet." else "No route favorites yet.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
            } else {
                LazyColumn(modifier = Modifier.heightIn(max = 420.dp)) {
                    items(filteredItems, key = { it.item.id }) { item ->
                        GoToFavoriteRow(
                            item = item,
                            onClick = { onApplyItem(item) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SortModeMenu(
    sortMode: FavoritesSortMode.Mode,
    onSortModeChange: (FavoritesSortMode.Mode) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        TextButton(onClick = { expanded = true }) {
            Text("Sort: ${sortMode.label()}")
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            FavoritesSortMode.Mode.entries.forEach { mode ->
                DropdownMenuItem(
                    text = { Text(mode.label()) },
                    onClick = {
                        onSortModeChange(mode)
                        expanded = false
                    },
                )
            }
        }
    }
}

@Composable
private fun GoToFavoriteRow(
    item: LibraryItemWithContent,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Filled.Star,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(item.name, style = MaterialTheme.typography.titleMedium)
            Text(
                text = item.description(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Suppress("LongParameterList")
private fun applyStartupItem(
    item: LibraryItemWithContent,
    context: Context,
    setWaypoints: (List<LatLng>) -> Unit,
    setCameraTarget: (CameraSnapshot?) -> Unit,
    setSpeedKmh: (Double) -> Unit,
    setRouteMode: (MovementEngine.Mode) -> Unit,
) {
    val point = item.primaryPoint() ?: return
    setCameraTarget(CameraSnapshot(point.lat, point.lng, 13.0))
    if (item.kind == LibraryItemKind.Place) {
        setWaypoints(listOf(point))
        // LocationService will emit RuntimeState.Single, which the derived runState picks up.
        LocationService.setLocation(context, point)
        return
    }
    val route = item.route ?: return
    setWaypoints(item.routeWaypoints())
    setSpeedKmh(route.defaultSpeedKmh)
    setRouteMode(
        runCatching { MovementEngine.Mode.valueOf(route.mode) }
            .getOrDefault(MovementEngine.Mode.Once),
    )
}

@Suppress("LongParameterList")
private fun handlePrimary(
    runState: RunState,
    waypoints: List<LatLng>,
    ready: Boolean,
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
    context: Context,
    showGenerate: () -> Unit,
) {
    // Every transition below ends in a LocationService action; the resulting RuntimeState emit is
    // what flips the derived runState, so we no longer push runState locally.
    when (runState) {
        RunState.Idle -> {
            when {
                waypoints.isEmpty() -> showGenerate()
                waypoints.size == 1 -> {
                    if (ready) LocationService.setLocation(context, waypoints.first())
                }
                else -> {
                    if (ready) LocationService.startRoute(context, waypoints, speedKmh, routeMode)
                }
            }
        }
        RunState.Single -> Unit // handled by Stop
        RunState.RoutePlaying -> LocationService.pause(context)
        RunState.RoutePaused -> LocationService.resume(context)
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
    var routeSettingsExpanded by rememberSaveable { mutableStateOf(false) }
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        KestrelCard {
            StatusRow(
                runState = runState,
                waypointCount = waypointCount,
                mockNow = mockNow,
                speedKmh = speedKmh,
                routeMode = routeMode,
            )
            PrimaryActionRow(
                runState = runState,
                waypointCount = waypointCount,
                ready = ready,
                onPrimary = onPrimary,
                onStop = onStop,
            )
        }
        if (canShowExtras && waypointCount > 0) {
            DraftRouteActionsCard(
                waypointCount = waypointCount,
                onClear = onClear,
                onSaveRoute = onSaveRoute,
                onGenerate = onGenerate,
            )
        }
        if (shouldShowRouteSettings(runState, waypointCount)) {
            RouteSettingsCard(
                speedKmh = speedKmh,
                routeMode = routeMode,
                expanded = routeSettingsExpanded,
                onExpandedChange = { routeSettingsExpanded = it },
                onSpeedChange = onSpeedChange,
                onModeChange = onModeChange,
            )
        }
        Spacer(Modifier.size(4.dp))
    }
}

@Composable
private fun StatusRow(
    runState: RunState,
    waypointCount: Int,
    mockNow: LatLng?,
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
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
                        "Ready to mock."
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
                    formatRouteStatusDetails(waypointCount, speedKmh, routeMode),
                )
            RunState.RoutePaused ->
                Triple(
                    MaterialTheme.colorScheme.tertiary,
                    "Route paused",
                    formatRouteStatusDetails(waypointCount, speedKmh, routeMode),
                )
        }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier =
                Modifier
                    .size(12.dp)
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
            ) { Text(label, maxLines = 1) }
        }
        RunState.Single ->
            Button(
                onClick = onStop,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Stop mock", maxLines = 1) }
        RunState.RoutePlaying ->
            KestrelActionRow {
                Button(onClick = onPrimary) { Text("Pause", maxLines = 1) }
                OutlinedButton(onClick = onStop) { Text("Stop", maxLines = 1) }
            }
        RunState.RoutePaused ->
            KestrelActionRow {
                Button(onClick = onPrimary) { Text("Resume", maxLines = 1) }
                OutlinedButton(onClick = onStop) { Text("Stop", maxLines = 1) }
            }
    }
}

@Composable
internal fun SectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
internal fun ChipChoice(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val colors =
        if (selected) {
            val containerColor = MaterialTheme.colorScheme.primaryContainer
            val labelColor = MaterialTheme.colorScheme.onPrimaryContainer
            AssistChipDefaults.assistChipColors(
                containerColor = containerColor,
                labelColor = labelColor,
                disabledContainerColor = containerColor.copy(alpha = 0.72f),
                disabledLabelColor = labelColor.copy(alpha = 0.88f),
            )
        } else {
            AssistChipDefaults.assistChipColors()
        }
    AssistChip(
        onClick = onClick,
        label = { Text(label) },
        enabled = enabled,
        colors = colors,
    )
}

@OptIn(ExperimentalPermissionsApi::class)
@Composable
private fun StatusBanner(
    modifier: Modifier,
    setupStep: MapSetupStep,
    permissionState: MultiplePermissionsState,
    onOpenDeveloperOptions: () -> Unit,
    onRefreshMockCheck: () -> Unit,
) {
    val title =
        when (setupStep) {
            MapSetupStep.Permissions -> "Permission needed"
            MapSetupStep.MockLocationApp -> "Select Kestrel for mock location"
            MapSetupStep.Ready -> return
        }
    val message =
        when (setupStep) {
            MapSetupStep.Permissions ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    "Allow location and notifications so mock GPS can run."
                } else {
                    "Allow location so mock GPS can run."
                }
            MapSetupStep.MockLocationApp -> "Open developer options and choose Kestrel as the mock location app."
            MapSetupStep.Ready -> return
        }
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
            Text(text = title, style = MaterialTheme.typography.titleSmall)
            Text(text = message, style = MaterialTheme.typography.bodySmall)
            KestrelActionRow {
                when (setupStep) {
                    MapSetupStep.Permissions -> {
                        Button(onClick = { permissionState.launchMultiplePermissionRequest() }) {
                            Text("Allow permissions", maxLines = 1)
                        }
                    }
                    MapSetupStep.MockLocationApp -> {
                        Button(onClick = onOpenDeveloperOptions) {
                            Text("Open developer options", maxLines = 1)
                        }
                        OutlinedButton(onClick = onRefreshMockCheck) {
                            Text("Recheck", maxLines = 1)
                        }
                    }
                    MapSetupStep.Ready -> Unit
                }
            }
        }
    }
}

@Composable
private fun GenerateRouteDialog(
    initialPointCount: Int,
    initialSpacingMeters: Double,
    usingLastSettings: Boolean,
    onConfirm: (count: Int, meters: Double) -> Unit,
    onDismiss: () -> Unit,
) {
    var count by remember { mutableStateOf(initialPointCount.toString()) }
    var meters by remember { mutableStateOf(formatMeters(initialSpacingMeters)) }
    val parsedCount = count.toIntOrNull()
    val parsedMeters = meters.toDoubleOrNull()
    val valid = isValidRandomRoute(parsedCount, parsedMeters)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Generate random route") },
        text = {
            GenerateRouteDialogContent(
                count = count,
                meters = meters,
                parsedCount = parsedCount,
                parsedMeters = parsedMeters,
                usingLastSettings = usingLastSettings,
                onCountChange = { count = it },
                onMetersChange = { meters = it },
            )
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
private fun GenerateRouteDialogContent(
    count: String,
    meters: String,
    parsedCount: Int?,
    parsedMeters: Double?,
    usingLastSettings: Boolean,
    onCountChange: (String) -> Unit,
    onMetersChange: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "Smooth random walk from the current map center.",
            style = MaterialTheme.typography.bodySmall,
        )
        Text(
            text = if (usingLastSettings) "Using last used settings" else "Using default settings",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        SectionLabel("Point count")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(20, 50, 100, 200).forEach { preset ->
                ChipChoice(
                    label = preset.toString(),
                    selected = parsedCount == preset,
                    enabled = true,
                    onClick = { onCountChange(preset.toString()) },
                )
            }
        }
        OutlinedTextField(
            value = count,
            onValueChange = { onCountChange(it.filter(Char::isDigit).take(4)) },
            label = { Text("Point count (2–1000)") },
            isError = count.isNotBlank() && !isValidPointCount(parsedCount),
            singleLine = true,
        )
        SectionLabel("Spacing")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(50.0, 100.0, 500.0, 1000.0).forEach { preset ->
                ChipChoice(
                    label = formatDistance(preset),
                    selected = parsedMeters == preset,
                    enabled = true,
                    onClick = { onMetersChange(formatMeters(preset)) },
                )
            }
        }
        OutlinedTextField(
            value = meters,
            onValueChange = { onMetersChange(it.filter { ch -> ch.isDigit() || ch == '.' }.take(7)) },
            label = { Text("Spacing meters (1–10000)") },
            isError = meters.isNotBlank() && !isValidSpacing(parsedMeters),
            singleLine = true,
        )
        Text(
            text = "Estimated distance: ${estimatedRouteDistance(parsedCount, parsedMeters)}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun estimatedRouteDistance(
    pointCount: Int?,
    spacingMeters: Double?,
): String =
    if (pointCount != null && spacingMeters != null) {
        formatDistance((pointCount - 1).coerceAtLeast(0) * spacingMeters)
    } else {
        "—"
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

@Composable
private fun LongPressActionDialog(
    point: LatLng,
    ready: Boolean,
    onSaveFavorite: () -> Unit,
    onMockPoint: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Choose action") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Latitude: %.5f".format(Locale.US, point.lat))
                Text("Longitude: %.5f".format(Locale.US, point.lng))
                OutlinedButton(
                    onClick = onSaveFavorite,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Save favorite") }
                OutlinedButton(
                    onClick = onMockPoint,
                    enabled = ready,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Mock this point") }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
