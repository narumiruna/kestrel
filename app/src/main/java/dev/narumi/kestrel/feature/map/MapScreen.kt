package dev.narumi.kestrel.feature.map

import android.Manifest
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.MultiplePermissionsState
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.data.CameraSnapshot
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.RandomRoutePreference
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.i18n.UiMessage
import dev.narumi.kestrel.core.i18n.displayNumber
import dev.narumi.kestrel.core.i18n.distance
import dev.narumi.kestrel.core.i18n.labelResource
import dev.narumi.kestrel.core.i18n.routeDetails
import dev.narumi.kestrel.core.i18n.speed
import dev.narumi.kestrel.core.i18n.waypointCount
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
import dev.narumi.kestrel.ui.components.KestrelIcon
import dev.narumi.kestrel.ui.components.KestrelIcons
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

internal fun shouldShowLiveRouteSettings(runState: RunState): Boolean = runState == RunState.RoutePlaying || runState == RunState.RoutePaused

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
        RuntimeState.Idle -> {
            MapRender(RunState.Idle, draftWaypoints, draftSpeedKmh, draftRouteMode)
        }

        is RuntimeState.Single -> {
            MapRender(RunState.Single, draftWaypoints, draftSpeedKmh, draftRouteMode)
        }

        is RuntimeState.Route -> {
            MapRender(
                runState = if (runtime.paused) RunState.RoutePaused else RunState.RoutePlaying,
                waypoints = runtime.waypoints,
                speedKmh = runtime.speedKmh,
                routeMode = runtime.mode,
            )
        }
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
) : java.io.Serializable

private enum class GoToFavoriteFilter { All, Points, Routes }

private sealed interface PendingFavorite : java.io.Serializable {
    data class Point(
        val target: LatLng,
    ) : PendingFavorite

    data class Route(
        val waypoints: List<LatLng>,
        val speedKmh: Double,
        val mode: MovementEngine.Mode,
    ) : PendingFavorite
}

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

internal fun formatRouteStatusDetails(
    context: Context,
    waypointCount: Int,
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
): String = context.routeDetails(waypointCount, speedKmh, routeMode)

@Composable
internal fun MovementEngine.Mode.label(): String = stringResource(labelResource())

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
    val resources = LocalResources.current
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
    var speedKmh by rememberSaveable { mutableStateOf(15.0) }
    var routeMode by rememberSaveable { mutableStateOf(MovementEngine.Mode.PingPong) }
    var pendingFavorite by rememberSaveable { mutableStateOf<PendingFavorite?>(null) }
    var pendingLongPressPoint by rememberSaveable { mutableStateOf<LatLng?>(null) }
    var favoriteName by rememberSaveable { mutableStateOf("") }
    val cameraState = rememberSaveable(saver = MapCameraState.Saver) { MapCameraState() }
    var awaitCurrentForStartup by rememberSaveable { mutableStateOf(false) }
    var showGenerateDialog by rememberSaveable { mutableStateOf(false) }
    var showGoToSheet by rememberSaveable { mutableStateOf(false) }
    var startupResolved by rememberSaveable { mutableStateOf(false) }
    var firstCameraIdleSeen by rememberSaveable { mutableStateOf(false) }
    var pendingLocationOperation by rememberSaveable { mutableStateOf<PendingLocationOperation?>(null) }
    var operationMessage by rememberSaveable { mutableStateOf<UiMessage?>(null) }
    var operationError by rememberSaveable { mutableStateOf<UiMessage?>(null) }
    var showReplaceConfirmation by rememberSaveable { mutableStateOf(false) }
    var favoriteSaving by remember { mutableStateOf(false) }
    var favoriteError by rememberSaveable { mutableStateOf<UiMessage?>(null) }

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
                prefs.lastCamera.first()?.let(cameraState::moveTo)
            }

            StartupPreference.Mode.Current -> {
                awaitCurrentForStartup = true
            }

            StartupPreference.Mode.Favorite -> {
                val currentItems = libraryRepository.items.first()
                val startupItem =
                    pref.libraryItemId?.let { itemId -> currentItems.firstOrNull { it.item.id == itemId } }
                if (startupItem == null) {
                    prefs.setStartupPreference(StartupPreference(StartupPreference.Mode.Last))
                    prefs.lastCamera.first()?.let(cameraState::moveTo)
                } else {
                    val requestId =
                        applyStartupItem(
                            item = startupItem,
                            context = context,
                            setWaypoints = { waypoints = it },
                            setCameraTarget = cameraState::moveTo,
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
        cameraState.moveTo(CameraSnapshot(ml.lat, ml.lng, 15.0))
        awaitCurrentForStartup = false
    }

    val setupStep = mapSetupStep(permissionState.allPermissionsGranted, mockAllowed)
    val ready = setupStep == MapSetupStep.Ready
    // Defer the per-tick value read to the map and sheet lambdas so route playback does not
    // recompose this entire screen every second.
    val currentMockState = LocationService.currentMock.collectAsStateWithLifecycle()
    val runtimeState by LocationService.runtimeState.collectAsStateWithLifecycle()
    val latestOperationResult by
        LocationService.operationResults.collectAsStateWithLifecycle(initialValue = null)
    val workflowPhase = mapWorkflowPhase(setupStep, runtimeState, waypoints.size)
    val render = reconcileMapRender(runtimeState, waypoints, speedKmh, routeMode)
    val runState = render.runState
    val renderedWaypoints = render.waypoints
    val renderedSpeedKmh = render.speedKmh
    val renderedRouteMode = render.routeMode
    // Settings callbacks target this rendered route, not a replacement received before the next frame.
    val activeRuntimeRoute = runtimeState as? RuntimeState.Route
    val activeRoute = activeRuntimeRoute?.waypoints.orEmpty()
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
            if (
                pendingLocationOperation?.clearDraftOnSuccess == true &&
                runtimeMatchesDraft(runtimeState, waypoints, speedKmh, routeMode)
            ) {
                operationMessage = UiMessage(R.string.mock_changed_but_its_confirmation_was_delayed)
                operationError = null
                waypoints = emptyList()
            } else {
                operationMessage = null
                operationError = UiMessage(R.string.kestrel_did_not_confirm_the_change_check_the_current_playback_state_and)
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

    fun updateActiveRouteSettings(
        speedKmh: Double? = null,
        mode: MovementEngine.Mode? = null,
    ) {
        if (pendingLocationOperation != null) return
        val playbackId = activeRuntimeRoute?.playbackId ?: return
        beginOperation(
            LocationService.updateRouteSettings(context, playbackId, speedKmh, mode),
            clearDraftOnSuccess = false,
        )
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
        cameraState.moveTo(CameraSnapshot(point.lat, point.lng, 15.0))
        showGoToSheet = false
    }

    fun applyItem(item: LibraryItemWithContent) {
        if (item.kind == LibraryItemKind.Place) {
            val point = item.primaryPoint() ?: return
            waypoints = listOf(point)
            cameraState.moveTo(CameraSnapshot(point.lat, point.lng, 15.0))
        } else {
            val route = item.route ?: return
            val routeWaypoints = item.routeWaypoints()
            waypoints = routeWaypoints
            speedKmh = route.defaultSpeedKmh
            routeMode =
                runCatching { MovementEngine.Mode.valueOf(route.mode) }
                    .getOrDefault(MovementEngine.Mode.Once)
            routeWaypoints.firstOrNull()?.let { cameraState.moveTo(CameraSnapshot(it.lat, it.lng, 15.0)) }
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
                    cameraState.viewport?.let { LatLng(it.lat, it.lng) }
                        ?: myLocation
                        ?: cameraState.target?.let { LatLng(it.lat, it.lng) }
                        ?: LatLng(25.0330, 121.5654)
                waypoints = RouteGenerator.generate(origin, count, meters)
                scope.launch {
                    val result =
                        runPersistedAction(UiMessage(R.string.preview_ready_but_kestrel_could_not_save_these_as_the_last_used_generato)) {
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
            error = favoriteError?.resolve(context),
            onNameChange = {
                favoriteName = it
                favoriteError = null
            },
            onConfirm = {
                if (favoriteSaving) return@SaveFavoriteDialog
                val name = favoriteName.trim().ifEmpty { resources.getString(R.string.favorite_1_s, context.displayNumber(libraryItems.size + 1, 0)) }
                favoriteSaving = true
                favoriteError = null
                scope.launch {
                    try {
                        when (
                            val result =
                                runPersistedAction(
                                    failureMessage = UiMessage(R.string.could_not_save_the_favorite_check_storage_and_try_again),
                                ) {
                                    when (pending) {
                                        is PendingFavorite.Point -> {
                                            libraryRepository.addPlace(
                                                name = name,
                                                lat = pending.target.lat,
                                                lng = pending.target.lng,
                                            )
                                        }

                                        is PendingFavorite.Route -> {
                                            libraryRepository.addRoute(
                                                name = name,
                                                waypoints = pending.waypoints,
                                                defaultSpeedKmh = pending.speedKmh,
                                                mode = pending.mode.name,
                                            )
                                        }
                                    }
                                }
                        ) {
                            PersistedActionResult.Success -> {
                                operationMessage = UiMessage(R.string.saved_1_s_to_favorites, listOf((name).toString()))
                                pendingFavorite = null
                                favoriteName = ""
                            }

                            is PersistedActionResult.Failure -> {
                                favoriteError = result.message
                            }
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
            currentSummary = currentMockSummary(context, runtimeState),
            newSummary = previewSummary(context, waypoints.size, speedKmh, routeMode),
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
            mockNow = currentMockState.value,
            ready = ready,
            speedKmh = renderedSpeedKmh,
            routeMode = renderedRouteMode,
            draftSpeedKmh = speedKmh,
            draftRouteMode = routeMode,
            currentSummary = currentMockSummary(context, runtimeState),
            operationPending = pendingLocationOperation != null,
            feedbackMessage = (operationError ?: operationMessage)?.resolve(context),
            feedbackIsError = operationError != null,
            onSpeedChange = { speedKmh = it },
            onModeChange = { routeMode = it },
            onPlayingSpeedChange = { updateActiveRouteSettings(speedKmh = it) },
            onPlayingModeChange = { updateActiveRouteSettings(mode = it) },
            onPrimary = {
                when (runState) {
                    RunState.Idle -> {
                        if (waypoints.isEmpty()) showGenerateDialog = true else startDraftOperation()
                    }

                    RunState.Single -> {
                        Unit
                    }

                    RunState.RoutePlaying -> {
                        beginOperation(LocationService.pause(context), clearDraftOnSuccess = false)
                    }

                    RunState.RoutePaused -> {
                        beginOperation(LocationService.resume(context), clearDraftOnSuccess = false)
                    }
                }
            },
            onStop = { beginOperation(LocationService.stop(context), clearDraftOnSuccess = false) },
            onUndoLast = { waypoints = waypoints.dropLast(1) },
            onClear = { waypoints = emptyList() },
            onSavePreview = {
                pendingFavorite =
                    waypoints.singleOrNull()?.let { PendingFavorite.Point(it) }
                        ?: PendingFavorite.Route(waypoints, speedKmh, routeMode)
            },
            onGenerate = { showGenerateDialog = true },
            onReplace = { showReplaceConfirmation = true },
            onCancelPreview = { waypoints = emptyList() },
        )
    }
    val mapCanvas: @Composable (Modifier) -> Unit = { canvasModifier ->
        MapCanvas(
            modifier = canvasModifier,
            mockLocation = currentMockState.value,
            currentRoute = activeRoute,
            previewRoute = previewRoute,
            previewPoint = previewPoint,
            myLocation = myLocation,
            initialCamera = cameraState.initialCamera,
            cameraTarget = cameraState.target,
            onCameraMoveEnded = cameraState::onMoveEnded,
            setupStep = setupStep,
            permissionState = permissionState,
            onMapClick = { point -> waypoints = waypoints + point },
            onMapLongClick = { pendingLongPressPoint = it },
            onCameraIdle = { snap ->
                cameraState.onIdle(snap)
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
                myLocation?.let { cameraState.moveTo(CameraSnapshot(it.lat, it.lng, 15.0)) }
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
                sheetPeekHeight = mapSheetPeekHeightDp(LocalDensity.current.fontScale, maxHeight.value).dp,
                sheetContainerColor = MaterialTheme.colorScheme.background,
                sheetShadowElevation = 8.dp,
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
    val resources = LocalResources.current
    val context = LocalContext.current
    var input by rememberSaveable { mutableStateOf("") }
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
            Text(resources.getString(R.string.choose_location_or_route), style = MaterialTheme.typography.titleLarge)
            Text(
                text = resources.getString(R.string.preview_a_coordinate_maps_link_saved_point_or_saved_route_before_startin),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
            OutlinedTextField(
                value = input,
                onValueChange = { input = it },
                label = { Text(stringResource(R.string.coordinates_or_maps_url)) },
                supportingText = {
                    Text(stringResource(if (showInvalid) R.string.enter_valid_latitude_and_longitude_values else R.string.coordinate_decimal_hint))
                },
                isError = showInvalid,
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = { parsed?.let(onApplyPoint) },
                enabled = parsed != null,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(stringResource(R.string.preview_on_map)) }
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
    val resources = LocalResources.current
    val context = LocalContext.current
    val filteredItems =
        items
            .sortedFor(FavoritesSortMode.Mode.Recent)
            .filter {
                filter == GoToFavoriteFilter.All ||
                    (filter == GoToFavoriteFilter.Points && it.kind == LibraryItemKind.Place) ||
                    (filter == GoToFavoriteFilter.Routes && it.kind == LibraryItemKind.Route)
            }
    SectionLabel(resources.getString(R.string.recent_favorites))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        GoToFavoriteFilter.entries.forEach { option ->
            ChipChoice(
                label =
                    resources.getString(
                        when (option) {
                            GoToFavoriteFilter.All -> R.string.filter_all
                            GoToFavoriteFilter.Points -> R.string.filter_points
                            GoToFavoriteFilter.Routes -> R.string.filter_routes
                        },
                    ),
                selected = filter == option,
                enabled = true,
                onClick = { onFilterChange(option) },
            )
        }
    }
    when {
        itemsLoading -> {
            Text(resources.getString(R.string.loading_favorites), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        filteredItems.isEmpty() -> {
            Text(
                resources.getString(R.string.no_favorites_match_this_filter_choose_a_point_on_the_map_to_create_one),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        else -> {
            LazyColumn(modifier = Modifier.heightIn(max = 420.dp)) {
                items(filteredItems, key = { it.item.id }) { item ->
                    GoToFavoriteRow(item = item, onClick = { onApplyItem(item) })
                }
            }
        }
    }
    OutlinedButton(
        onClick = onViewAllFavorites,
        modifier = Modifier.fillMaxWidth(),
    ) { Text(stringResource(R.string.view_all_favorites)) }
}

@Composable
private fun GoToFavoriteRow(
    item: LibraryItemWithContent,
    onClick: () -> Unit,
) {
    val context = LocalContext.current
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        KestrelIcon(
            KestrelIcons.FavoriteFilled,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(item.name, style = MaterialTheme.typography.titleMedium)
            Text(
                text = item.description(context),
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
    onSavePreview: () -> Unit,
    onGenerate: () -> Unit,
    onReplace: () -> Unit,
    onCancelPreview: () -> Unit,
    onPlayingSpeedChange: (Double) -> Unit = {},
    onPlayingModeChange: (MovementEngine.Mode) -> Unit = {},
) {
    val resources = LocalResources.current
    val context = LocalContext.current
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
        MapPlaybackControls(
            runState = runState,
            waypointCount = statusWaypointCount,
            draftWaypointCount = draftWaypointCount,
            mockNow = mockNow,
            speedKmh = speedKmh,
            routeMode = routeMode,
            ready = ready,
            operationPending = operationPending,
            onPrimary = onPrimary,
            onStop = onStop,
        )
        if (shouldShowLiveRouteSettings(runState)) {
            LiveRouteSettingsCard(
                speedKmh = speedKmh,
                routeMode = routeMode,
                enabled = !operationPending,
                onSpeedChange = onPlayingSpeedChange,
                onModeChange = onPlayingModeChange,
            )
        }
        feedbackMessage?.let { MapFeedbackCard(message = it, isError = feedbackIsError) }
        if (!runtimeActive && draftWaypointCount > 0) {
            DraftPreviewActionsCard(
                waypointCount = draftWaypointCount,
                enabled = !operationPending,
                onUndoLast = onUndoLast,
                onClear = onClear,
                onSavePreview = onSavePreview,
                onGenerate = onGenerate,
            )
        }
        if (runtimeActive && draftWaypointCount > 0) {
            ReplacementPreviewCard(
                currentSummary = currentSummary,
                previewSummary = previewSummary(context, draftWaypointCount, draftSpeedKmh, draftRouteMode),
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
                enabled = !operationPending,
                title = if (runtimeActive) resources.getString(R.string.preview_route_settings) else resources.getString(R.string.route_settings),
            )
        }
        Spacer(Modifier.size(4.dp))
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
    val resources = LocalResources.current
    val context = LocalContext.current
    val title =
        when (setupStep) {
            MapSetupStep.Permissions -> resources.getString(R.string.permission_needed)
            MapSetupStep.MockLocationApp -> resources.getString(R.string.select_kestrel_for_mock_location)
            MapSetupStep.Ready -> return
        }
    val message =
        when (setupStep) {
            MapSetupStep.Permissions -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    resources.getString(R.string.allow_location_and_notifications_so_mock_gps_can_run)
                } else {
                    resources.getString(R.string.allow_location_so_mock_gps_can_run)
                }
            }

            MapSetupStep.MockLocationApp -> {
                resources.getString(R.string.open_developer_options_and_choose_kestrel_as_the_mock_location_app)
            }

            MapSetupStep.Ready -> {
                return
            }
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
    val context = LocalContext.current
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
                            Text(stringResource(R.string.allow_permissions))
                        }
                    }

                    MapSetupStep.MockLocationApp -> {
                        Button(onClick = onOpenDeveloperOptions) {
                            Text(stringResource(R.string.open_developer_options))
                        }
                        OutlinedButton(onClick = onRefreshMockCheck) {
                            Text(stringResource(R.string.recheck))
                        }
                    }

                    MapSetupStep.Ready -> {
                        Unit
                    }
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
    val context = LocalContext.current
    var count by rememberSaveable { mutableStateOf(initialPointCount.toString()) }
    var meters by rememberSaveable { mutableStateOf(formatMeters(initialSpacingMeters)) }
    val parsedCount = count.toIntOrNull()
    val parsedMeters = meters.toDoubleOrNull()
    val valid = isValidRandomRoute(parsedCount, parsedMeters)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.generate_random_route)) },
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
            ) { Text(stringResource(R.string.preview_route)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
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
    val resources = LocalResources.current
    val context = LocalContext.current
    Column(
        modifier = Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()).imePadding(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = resources.getString(R.string.smooth_random_walk_from_the_current_map_center),
            style = MaterialTheme.typography.bodySmall,
        )
        Text(
            text = if (usingLastSettings) resources.getString(R.string.using_last_used_settings) else resources.getString(R.string.using_default_settings),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (existingDraftCount > 0) {
            Text(
                text =
                    resources.getString(R.string.previewing_a_generated_route_replaces_your_current_1_s_draft_active_play, (context.waypointCount(existingDraftCount)).toString()),
                color = MaterialTheme.colorScheme.tertiary,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        SectionLabel(resources.getString(R.string.point_count))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(20, 50, 100, 200).forEach { preset ->
                ChipChoice(
                    label = context.displayNumber(preset, 0),
                    selected = parsedCount == preset,
                    enabled = true,
                    onClick = { onCountChange(preset.toString()) },
                )
            }
        }
        OutlinedTextField(
            value = count,
            onValueChange = { onCountChange(it.filter(Char::isDigit).take(4)) },
            label = { Text(stringResource(R.string.point_count_2_1000)) },
            isError = count.isNotBlank() && !isValidPointCount(parsedCount),
            singleLine = true,
        )
        SectionLabel(resources.getString(R.string.spacing))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(50.0, 100.0, 500.0, 1000.0).forEach { preset ->
                ChipChoice(
                    label = context.distance(preset),
                    selected = parsedMeters == preset,
                    enabled = true,
                    onClick = { onMetersChange(formatMeters(preset)) },
                )
            }
        }
        OutlinedTextField(
            value = meters,
            onValueChange = { onMetersChange(it.filter { ch -> ch.isDigit() || ch == '.' }.take(7)) },
            label = { Text(stringResource(R.string.spacing_meters_1_10000)) },
            isError = meters.isNotBlank() && !isValidSpacing(parsedMeters),
            singleLine = true,
        )
        Text(
            text = resources.getString(R.string.estimated_distance_1_s, (estimatedRouteDistance(context, parsedCount, parsedMeters)).toString()),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun estimatedRouteDistance(
    context: Context,
    pointCount: Int?,
    spacingMeters: Double?,
): String =
    if (pointCount != null && spacingMeters != null) {
        context.distance((pointCount - 1).coerceAtLeast(0) * spacingMeters)
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
    val resources = LocalResources.current
    val context = LocalContext.current
    val (title, supporting) =
        when (pending) {
            is PendingFavorite.Point -> {
                resources.getString(R.string.save_favorite) to "%.5f, %.5f".format(java.util.Locale.US, pending.target.lat, pending.target.lng)
            }

            is PendingFavorite.Route -> {
                resources.getString(R.string.save_route) to
                    resources.getString(R.string.speed_and_mode, context.waypointCount(pending.waypoints.size), context.speed(pending.speedKmh))
            }
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
                    label = { Text(stringResource(R.string.name)) },
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
                Text(if (saving) resources.getString(R.string.saving) else resources.getString(R.string.save))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text(stringResource(R.string.cancel)) } },
    )
}

@Composable
private fun ConfirmReplaceMockDialog(
    currentSummary: String,
    newSummary: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val resources = LocalResources.current
    val context = LocalContext.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.replace_current_mock_2)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(resources.getString(R.string.current_1_s, (currentSummary).toString()))
                Text(resources.getString(R.string.new_1_s, (newSummary).toString()), style = MaterialTheme.typography.titleSmall)
                Text(
                    text = resources.getString(R.string.the_current_mock_keeps_running_unless_you_confirm),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        },
        confirmButton = { Button(onClick = onConfirm) { Text(stringResource(R.string.replace_current_mock)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
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
    val resources = LocalResources.current
    val context = LocalContext.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.choose_action)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(resources.getString(R.string.coordinate_latitude, "%.5f".format(Locale.US, point.lat)))
                Text(resources.getString(R.string.coordinate_longitude, "%.5f".format(Locale.US, point.lng)))
                OutlinedButton(
                    onClick = onSaveFavorite,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(stringResource(R.string.save_favorite)) }
                OutlinedButton(
                    onClick = onMockPoint,
                    enabled = ready,
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(stringResource(R.string.mock_this_point)) }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
    )
}
