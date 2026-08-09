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
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SheetState
import androidx.compose.material3.SheetValue
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
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
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
import dev.narumi.kestrel.ui.components.KestrelActionRow
import dev.narumi.kestrel.ui.components.KestrelCard
import dev.narumi.kestrel.ui.components.PersistedActionResult
import dev.narumi.kestrel.ui.components.runPersistedAction
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.Locale

private const val OPERATION_TIMEOUT_MILLIS = 10_000L

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
    hasReplacementPreview: Boolean = false,
): Boolean =
    waypointCount >= 2 &&
        (runState == RunState.Idle || runState == RunState.Single || hasReplacementPreview)

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

private data class PendingLocationOperation(
    val requestId: String,
    val clearDraftOnSuccess: Boolean,
)

private enum class GoToFavoriteFilter { All, Points, Routes }

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
    onViewAllFavorites: () -> Unit = {},
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

    val loadedLibraryItems by libraryRepository.items.collectAsStateWithLifecycle(initialValue = null)
    val libraryItems = loadedLibraryItems.orEmpty()
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
    var pendingLocationOperation by remember { mutableStateOf<PendingLocationOperation?>(null) }
    var operationMessage by remember { mutableStateOf<String?>(null) }
    var operationError by remember { mutableStateOf<String?>(null) }
    var showReplaceConfirmation by remember { mutableStateOf(false) }
    var favoriteSaving by remember { mutableStateOf(false) }
    var favoriteError by remember { mutableStateOf<String?>(null) }

    val myLocation by rememberCurrentLocation(permissionState.allPermissionsGranted)

    LaunchedEffect(permissionState.allPermissionsGranted) {
        mockAllowed = mockProvider.isMockAllowed()
    }

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
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
                if (startupItem == null) {
                    prefs.setStartupPreference(StartupPreference(StartupPreference.Mode.Last))
                    prefs.lastCamera.first()?.let { cameraTarget = it }
                } else {
                    val requestId =
                        applyStartupItem(
                            item = startupItem,
                            context = context,
                            setWaypoints = { waypoints = it },
                            setCameraTarget = { cameraTarget = it },
                            setSpeedKmh = { speedKmh = it },
                            setRouteMode = { routeMode = it },
                        )
                    if (requestId != null) {
                        pendingLocationOperation = PendingLocationOperation(requestId, clearDraftOnSuccess = false)
                    }
                    libraryRepository.touchItem(startupItem.item.id)
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
    val latestOperationResult by
        LocationService.operationResults.collectAsStateWithLifecycle(initialValue = null)
    val workflowPhase = mapWorkflowPhase(setupStep, runtimeState, waypoints.size)
    val render = reconcileMapRender(runtimeState, waypoints, speedKmh, routeMode)
    val runState = render.runState
    val renderedWaypoints = render.waypoints
    val renderedSpeedKmh = render.speedKmh
    val renderedRouteMode = render.routeMode
    val activeRoute = (runtimeState as? RuntimeState.Route)?.waypoints.orEmpty()
    val showPreview = workflowPhase == MapWorkflowPhase.Draft || workflowPhase == MapWorkflowPhase.ReplacementPreview
    val previewRoute = waypoints.takeIf { showPreview && it.size >= 2 }.orEmpty()
    val previewPoint = waypoints.singleOrNull().takeIf { showPreview }

    LaunchedEffect(latestOperationResult, pendingLocationOperation) {
        val pending = pendingLocationOperation ?: return@LaunchedEffect
        val result = latestOperationResult ?: return@LaunchedEffect
        if (result.requestId != pending.requestId) return@LaunchedEffect
        if (result.succeeded) {
            operationMessage = result.message
            operationError = null
            if (pending.clearDraftOnSuccess) waypoints = emptyList()
        } else {
            operationMessage = null
            operationError = result.message
        }
        pendingLocationOperation = null
    }

    LaunchedEffect(pendingLocationOperation?.requestId) {
        val requestId = pendingLocationOperation?.requestId ?: return@LaunchedEffect
        delay(OPERATION_TIMEOUT_MILLIS)
        if (pendingLocationOperation?.requestId == requestId) {
            if (runtimeMatchesDraft(runtimeState, waypoints, speedKmh, routeMode)) {
                operationMessage = "Mock changed, but its confirmation was delayed."
                operationError = null
                waypoints = emptyList()
            } else {
                operationMessage = null
                operationError = "Kestrel did not confirm the mock change. The preview is still available; try again."
            }
            pendingLocationOperation = null
        }
    }

    fun beginOperation(
        requestId: String,
        clearDraftOnSuccess: Boolean,
    ) {
        operationMessage = null
        operationError = null
        pendingLocationOperation = PendingLocationOperation(requestId, clearDraftOnSuccess)
    }

    val sheetState =
        rememberStandardBottomSheetState(
            initialValue = SheetValue.PartiallyExpanded,
            skipHiddenState = true,
        )
    val scaffoldState = rememberBottomSheetScaffoldState(bottomSheetState = sheetState)
    val goToSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    fun applyPoint(point: LatLng) {
        // Choosing a target is a side-effect-free preview. Active playback keeps running until
        // replacement is explicitly confirmed.
        waypoints = listOf(point)
        cameraTarget = CameraSnapshot(point.lat, point.lng, 15.0)
        showGoToSheet = false
    }

    fun applyItem(item: LibraryItemWithContent) {
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

    fun startDraftOperation() {
        if (!ready || waypoints.isEmpty()) return
        val requestId =
            if (waypoints.size == 1) {
                LocationService.setLocation(context, waypoints.first())
            } else {
                LocationService.startRoute(context, waypoints, speedKmh, routeMode)
            }
        beginOperation(requestId = requestId, clearDraftOnSuccess = true)
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
            existingDraftCount = waypoints.size,
            onConfirm = { count, meters ->
                val origin =
                    lastCameraCenter
                        ?: myLocation
                        ?: cameraTarget?.let { LatLng(it.lat, it.lng) }
                        ?: LatLng(25.0330, 121.5654)
                waypoints = RouteGenerator.generate(origin, count, meters)
                scope.launch {
                    val result =
                        runPersistedAction("Preview ready, but Kestrel could not save these as the last-used generator values.") {
                            prefs.setLastRandomRouteSettings(count, meters)
                        }
                    if (result is PersistedActionResult.Failure) operationError = result.message
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
            itemsLoading = loadedLibraryItems == null,
            onApplyPoint = ::applyPoint,
            onApplyItem = ::applyItem,
            onViewAllFavorites = {
                showGoToSheet = false
                onViewAllFavorites()
            },
            onDismiss = { showGoToSheet = false },
        )
    }

    pendingFavorite?.let { pending ->
        SaveFavoriteDialog(
            pending = pending,
            name = favoriteName,
            saving = favoriteSaving,
            error = favoriteError,
            onNameChange = {
                favoriteName = it
                favoriteError = null
            },
            onConfirm = {
                if (favoriteSaving) return@SaveFavoriteDialog
                val name = favoriteName.trim().ifEmpty { "Favorite ${libraryItems.size + 1}" }
                favoriteSaving = true
                favoriteError = null
                scope.launch {
                    try {
                        when (
                            val result =
                                runPersistedAction(
                                    failureMessage = "Could not save the Favorite. Check storage and try again.",
                                ) {
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
                        ) {
                            PersistedActionResult.Success -> {
                                operationMessage = "Saved $name to Favorites."
                                pendingFavorite = null
                                favoriteName = ""
                            }
                            is PersistedActionResult.Failure -> favoriteError = result.message
                        }
                    } finally {
                        favoriteSaving = false
                    }
                }
            },
            onDismiss = {
                if (!favoriteSaving) {
                    pendingFavorite = null
                    favoriteName = ""
                    favoriteError = null
                }
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
                applyPoint(point)
                pendingLongPressPoint = null
                if (runState == RunState.Idle) {
                    startDraftOperation()
                } else {
                    showReplaceConfirmation = true
                }
            },
            onDismiss = { pendingLongPressPoint = null },
        )
    }

    if (showReplaceConfirmation) {
        ConfirmReplaceMockDialog(
            currentSummary = currentMockSummary(runtimeState),
            newSummary = previewSummary(waypoints.size, speedKmh, routeMode),
            onConfirm = {
                showReplaceConfirmation = false
                startDraftOperation()
            },
            onDismiss = { showReplaceConfirmation = false },
        )
    }

    val mapSheetContent: @Composable ColumnScope.() -> Unit = {
        MapSheet(
            runState = runState,
            waypointCount = renderedWaypoints.size,
            draftWaypointCount = waypoints.size,
            mockNow = mockNow,
            ready = ready,
            speedKmh = renderedSpeedKmh,
            routeMode = renderedRouteMode,
            draftSpeedKmh = speedKmh,
            draftRouteMode = routeMode,
            currentSummary = currentMockSummary(runtimeState),
            operationPending = pendingLocationOperation != null,
            feedbackMessage = operationError ?: operationMessage,
            feedbackIsError = operationError != null,
            onSpeedChange = { speedKmh = it },
            onModeChange = { routeMode = it },
            onPrimary = {
                when (runState) {
                    RunState.Idle -> if (waypoints.isEmpty()) showGenerateDialog = true else startDraftOperation()
                    RunState.Single -> Unit
                    RunState.RoutePlaying ->
                        beginOperation(LocationService.pause(context), clearDraftOnSuccess = false)
                    RunState.RoutePaused ->
                        beginOperation(LocationService.resume(context), clearDraftOnSuccess = false)
                }
            },
            onStop = { beginOperation(LocationService.stop(context), clearDraftOnSuccess = false) },
            onUndoLast = { waypoints = waypoints.dropLast(1) },
            onClear = { waypoints = emptyList() },
            onSaveRoute = { pendingFavorite = PendingFavorite.Route(waypoints, speedKmh, routeMode) },
            onGenerate = { showGenerateDialog = true },
            onReplace = { showReplaceConfirmation = true },
            onCancelPreview = { waypoints = emptyList() },
        )
    }
    val mapCanvas: @Composable (Modifier) -> Unit = { canvasModifier ->
        MapCanvas(
            modifier = canvasModifier,
            mockLocation = mockNow,
            currentRoute = activeRoute,
            previewRoute = previewRoute,
            previewPoint = previewPoint,
            myLocation = myLocation,
            cameraTarget = cameraTarget,
            setupStep = setupStep,
            permissionState = permissionState,
            onMapClick = { point -> waypoints = waypoints + point },
            onMapLongClick = { pendingLongPressPoint = it },
            onCameraIdle = { snap ->
                lastCameraCenter = LatLng(snap.lat, snap.lng)
                if (!firstCameraIdleSeen) {
                    firstCameraIdleSeen = true
                } else {
                    scope.launch { prefs.setLastCamera(snap) }
                }
            },
            onOpenDeveloperOptions = {
                context.startActivity(
                    Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            },
            onRefreshMockCheck = { mockAllowed = mockProvider.isMockAllowed() },
            onChooseTarget = { showGoToSheet = true },
            onCenterOnMe = {
                myLocation?.let { cameraTarget = CameraSnapshot(it.lat, it.lng, 15.0) }
            },
        )
    }

    androidx.compose.foundation.layout.BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        if (mapWorkspaceMode(maxWidth.value) == MapWorkspaceMode.SidePanel) {
            Row(modifier = Modifier.fillMaxSize()) {
                mapCanvas(Modifier.weight(1f))
                Column(
                    modifier =
                        Modifier
                            .widthIn(min = 320.dp, max = 420.dp)
                            .fillMaxSize()
                            .padding(top = 16.dp),
                ) {
                    mapSheetContent()
                }
            }
        } else {
            BottomSheetScaffold(
                modifier = Modifier.fillMaxSize(),
                scaffoldState = scaffoldState,
                sheetPeekHeight = 168.dp,
                sheetContainerColor = MaterialTheme.colorScheme.surface,
                containerColor = MaterialTheme.colorScheme.background,
                sheetContent = mapSheetContent,
            ) { innerPadding ->
                mapCanvas(Modifier.padding(innerPadding))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GoToSheet(
    sheetState: SheetState,
    items: List<LibraryItemWithContent>,
    itemsLoading: Boolean,
    onApplyPoint: (LatLng) -> Unit,
    onApplyItem: (LibraryItemWithContent) -> Unit,
    onViewAllFavorites: () -> Unit,
    onDismiss: () -> Unit,
) {
    var input by remember { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf(GoToFavoriteFilter.All) }
    val parsed = parseCoordInput(input)
    val showInvalid = input.isNotBlank() && parsed == null

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 24.dp)
                    .imePadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Choose location or route", style = MaterialTheme.typography.titleLarge)
            Text(
                text = "Preview a coordinate, Maps link, saved point, or saved route before starting it.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                label = { Text("Coordinates or Maps URL") },
                supportingText = {
                    if (showInvalid) Text("Enter valid latitude and longitude values.")
                },
                isError = showInvalid,
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = { parsed?.let(onApplyPoint) },
                enabled = parsed != null,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Preview on map") }
            GoToFavoritesSection(
                items = items,
                itemsLoading = itemsLoading,
                filter = filter,
                onFilterChange = { filter = it },
                onApplyItem = onApplyItem,
                onViewAllFavorites = onViewAllFavorites,
            )
        }
    }
}

@Composable
private fun GoToFavoritesSection(
    items: List<LibraryItemWithContent>,
    itemsLoading: Boolean,
    filter: GoToFavoriteFilter,
    onFilterChange: (GoToFavoriteFilter) -> Unit,
    onApplyItem: (LibraryItemWithContent) -> Unit,
    onViewAllFavorites: () -> Unit,
) {
    val filteredItems =
        items
            .sortedFor(FavoritesSortMode.Mode.Recent)
            .filter {
                filter == GoToFavoriteFilter.All ||
                    (filter == GoToFavoriteFilter.Points && it.kind == LibraryItemKind.Place) ||
                    (filter == GoToFavoriteFilter.Routes && it.kind == LibraryItemKind.Route)
            }
    SectionLabel("Recent Favorites")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        GoToFavoriteFilter.entries.forEach { option ->
            ChipChoice(
                label = option.name,
                selected = filter == option,
                enabled = true,
                onClick = { onFilterChange(option) },
            )
        }
    }
    when {
        itemsLoading -> Text("Loading Favorites…", color = MaterialTheme.colorScheme.onSurfaceVariant)
        filteredItems.isEmpty() ->
            Text(
                "No Favorites match this filter. Choose a point on the map to create one.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        else ->
            LazyColumn(modifier = Modifier.heightIn(max = 420.dp)) {
                items(filteredItems, key = { it.item.id }) { item ->
                    GoToFavoriteRow(item = item, onClick = { onApplyItem(item) })
                }
            }
    }
    OutlinedButton(
        onClick = onViewAllFavorites,
        modifier = Modifier.fillMaxWidth(),
    ) { Text("View all Favorites") }
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
): String? {
    val point = item.primaryPoint() ?: return null
    setCameraTarget(CameraSnapshot(point.lat, point.lng, 13.0))
    if (item.kind == LibraryItemKind.Place) {
        setWaypoints(emptyList())
        // Startup points retain their existing automatic-start behavior without leaving a second
        // preview marker after the service becomes authoritative.
        return LocationService.setLocation(context, point)
    }
    val route = item.route ?: return null
    setWaypoints(item.routeWaypoints())
    setSpeedKmh(route.defaultSpeedKmh)
    setRouteMode(
        runCatching { MovementEngine.Mode.valueOf(route.mode) }
            .getOrDefault(MovementEngine.Mode.Once),
    )
    return null
}

@OptIn(ExperimentalLayoutApi::class)
@Suppress("LongParameterList")
@Composable
internal fun MapSheet(
    runState: RunState,
    waypointCount: Int,
    draftWaypointCount: Int,
    mockNow: LatLng?,
    ready: Boolean,
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
    draftSpeedKmh: Double,
    draftRouteMode: MovementEngine.Mode,
    currentSummary: String,
    operationPending: Boolean,
    feedbackMessage: String?,
    feedbackIsError: Boolean,
    onSpeedChange: (Double) -> Unit,
    onModeChange: (MovementEngine.Mode) -> Unit,
    onPrimary: () -> Unit,
    onStop: () -> Unit,
    onUndoLast: () -> Unit,
    onClear: () -> Unit,
    onSaveRoute: () -> Unit,
    onGenerate: () -> Unit,
    onReplace: () -> Unit,
    onCancelPreview: () -> Unit,
) {
    val runtimeActive = runState != RunState.Idle
    val statusWaypointCount = if (runtimeActive) waypointCount else draftWaypointCount
    var routeSettingsExpanded by rememberSaveable { mutableStateOf(false) }
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        KestrelCard {
            StatusRow(
                runState = runState,
                waypointCount = statusWaypointCount,
                mockNow = mockNow,
                speedKmh = speedKmh,
                routeMode = routeMode,
            )
            PrimaryActionRow(
                runState = runState,
                waypointCount = draftWaypointCount,
                ready = ready,
                operationPending = operationPending,
                onPrimary = onPrimary,
                onStop = onStop,
            )
        }
        feedbackMessage?.let { MapFeedbackCard(message = it, isError = feedbackIsError) }
        if (!runtimeActive && draftWaypointCount > 0) {
            DraftRouteActionsCard(
                waypointCount = draftWaypointCount,
                onUndoLast = onUndoLast,
                onClear = onClear,
                onSaveRoute = onSaveRoute,
                onGenerate = onGenerate,
            )
        }
        if (runtimeActive && draftWaypointCount > 0) {
            ReplacementPreviewCard(
                currentSummary = currentSummary,
                previewSummary = previewSummary(draftWaypointCount, draftSpeedKmh, draftRouteMode),
                applying = operationPending,
                onReplace = onReplace,
                onUndoLast = onUndoLast,
                onCancelPreview = onCancelPreview,
            )
        }
        if (
            shouldShowRouteSettings(
                runState = runState,
                waypointCount = draftWaypointCount,
                hasReplacementPreview = runtimeActive && draftWaypointCount > 0,
            )
        ) {
            RouteSettingsCard(
                speedKmh = draftSpeedKmh,
                routeMode = draftRouteMode,
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
    operationPending: Boolean,
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
            val enabled = !operationPending && ready
            Button(
                onClick = onPrimary,
                enabled = enabled,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    when {
                        operationPending -> "Applying…"
                        !ready -> "Finish setup above"
                        else -> label
                    },
                )
            }
        }
        RunState.Single ->
            Button(
                onClick = onStop,
                enabled = !operationPending,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (operationPending) "Stopping…" else "Stop mock") }
        RunState.RoutePlaying ->
            KestrelActionRow {
                Button(onClick = onPrimary, enabled = !operationPending) {
                    Text(if (operationPending) "Applying…" else "Pause")
                }
                OutlinedButton(onClick = onStop, enabled = !operationPending) { Text("Stop") }
            }
        RunState.RoutePaused ->
            KestrelActionRow {
                Button(onClick = onPrimary, enabled = !operationPending) {
                    Text(if (operationPending) "Applying…" else "Resume")
                }
                OutlinedButton(onClick = onStop, enabled = !operationPending) { Text("Stop") }
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
        modifier = Modifier.semantics { this.selected = selected },
    )
}

@OptIn(ExperimentalPermissionsApi::class)
@Composable
internal fun StatusBanner(
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
    SetupPromptCard(
        setupStep = setupStep,
        title = title,
        message = message,
        modifier = modifier,
        onAllowPermissions = { permissionState.launchMultiplePermissionRequest() },
        onOpenDeveloperOptions = onOpenDeveloperOptions,
        onRefreshMockCheck = onRefreshMockCheck,
    )
}

@Composable
internal fun SetupPromptCard(
    setupStep: MapSetupStep,
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    onAllowPermissions: () -> Unit = {},
    onOpenDeveloperOptions: () -> Unit = {},
    onRefreshMockCheck: () -> Unit = {},
) {
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
                        Button(onClick = onAllowPermissions) {
                            Text("Allow permissions")
                        }
                    }
                    MapSetupStep.MockLocationApp -> {
                        Button(onClick = onOpenDeveloperOptions) {
                            Text("Open developer options")
                        }
                        OutlinedButton(onClick = onRefreshMockCheck) {
                            Text("Recheck")
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
    existingDraftCount: Int,
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
                existingDraftCount = existingDraftCount,
                onCountChange = { count = it },
                onMetersChange = { meters = it },
            )
        },
        confirmButton = {
            TextButton(
                enabled = valid,
                onClick = { onConfirm(parsedCount!!, parsedMeters!!) },
            ) { Text("Preview route") }
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
    existingDraftCount: Int,
    onCountChange: (String) -> Unit,
    onMetersChange: (String) -> Unit,
) {
    Column(
        modifier = Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()).imePadding(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = "Smooth random walk from the current map center.",
            style = MaterialTheme.typography.bodySmall,
        )
        Text(
            text = if (usingLastSettings) "Using last used settings" else "Using default settings",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (existingDraftCount > 0) {
            Text(
                text =
                    "Previewing a generated route replaces your current " +
                        "${formatWaypointCount(existingDraftCount)} draft. Active playback is unchanged.",
                color = MaterialTheme.colorScheme.tertiary,
                style = MaterialTheme.typography.bodySmall,
            )
        }
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
    saving: Boolean,
    error: String?,
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
                    enabled = !saving,
                )
                error?.let {
                    Text(
                        text = it,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = !saving) {
                Text(if (saving) "Saving…" else "Save")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancel") } },
    )
}

@Composable
private fun ConfirmReplaceMockDialog(
    currentSummary: String,
    newSummary: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Replace current mock?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Current: $currentSummary")
                Text("New: $newSummary", style = MaterialTheme.typography.titleSmall)
                Text(
                    text = "The current mock keeps running unless you confirm.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        },
        confirmButton = { Button(onClick = onConfirm) { Text("Replace current mock") } },
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
