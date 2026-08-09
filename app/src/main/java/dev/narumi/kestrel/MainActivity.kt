package dev.narumi.kestrel

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteDefaults
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.PreviewScreenSizes
import androidx.compose.ui.unit.dp
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.narumi.kestrel.core.cloud.CloudSyncRepository
import dev.narumi.kestrel.core.cloud.RemoteControlPoller
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.LocationService
import dev.narumi.kestrel.core.location.RuntimeState
import dev.narumi.kestrel.core.location.parseCoordInput
import dev.narumi.kestrel.feature.favorites.FavoritesScreen
import dev.narumi.kestrel.feature.map.MapScreen
import dev.narumi.kestrel.feature.options.OptionsScreen
import dev.narumi.kestrel.ui.components.PlaybackStatusBar
import dev.narumi.kestrel.ui.theme.KestrelTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val OPERATION_TIMEOUT_MILLIS = 10_000L

class MainActivity : ComponentActivity() {
    private var pendingMapLinkPoint by mutableStateOf<LatLng?>(null)
    private var skipCloudSyncOnForeground by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        consumeMainIntent(intent)
        enableEdgeToEdge()
        setContent {
            KestrelTheme {
                KestrelApp(
                    pendingMapLinkPoint = pendingMapLinkPoint,
                    skipCloudSyncOnForeground = skipCloudSyncOnForeground,
                    onMapLinkPointConsumed = { pendingMapLinkPoint = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        consumeMainIntent(intent)
    }

    private fun consumeMainIntent(intent: Intent?) {
        skipCloudSyncOnForeground = intent?.getBooleanExtra(EXTRA_SKIP_CLOUD_SYNC_ON_FOREGROUND, false) == true
        consumeMapLinkIntent(intent)
    }

    private fun consumeMapLinkIntent(intent: Intent?) {
        val raw =
            when (intent?.action) {
                Intent.ACTION_VIEW -> intent.dataString
                Intent.ACTION_SEND -> intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
                else -> null
            }
        pendingMapLinkPoint = raw?.let(::parseCoordInput)
    }

    companion object {
        const val EXTRA_SKIP_CLOUD_SYNC_ON_FOREGROUND = "dev.narumi.kestrel.SKIP_CLOUD_SYNC_ON_FOREGROUND"
    }
}

@PreviewScreenSizes
@Suppress("LongMethod")
@Composable
fun KestrelApp(
    pendingMapLinkPoint: LatLng? = null,
    skipCloudSyncOnForeground: Boolean = false,
    onMapLinkPointConsumed: () -> Unit = {},
) {
    var currentDestination by rememberSaveable { mutableStateOf(AppDestinations.HOME) }
    var pendingFavoriteApply by remember { mutableStateOf<LibraryItemWithContent?>(null) }
    var pendingShellOperationId by remember { mutableStateOf<String?>(null) }
    var shellOperationError by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    KestrelForegroundEffects(skipCloudSyncOnForeground)
    val runtimeState by LocationService.runtimeState.collectAsStateWithLifecycle()
    val latestOperationResult by
        LocationService.operationResults.collectAsStateWithLifecycle(initialValue = null)

    BackHandler(enabled = currentDestination != AppDestinations.HOME) {
        currentDestination = AppDestinations.HOME
    }

    LaunchedEffect(latestOperationResult, pendingShellOperationId) {
        val requestId = pendingShellOperationId ?: return@LaunchedEffect
        val result = latestOperationResult ?: return@LaunchedEffect
        if (result.requestId != requestId) return@LaunchedEffect
        shellOperationError = result.message.takeUnless { result.succeeded }
        pendingShellOperationId = null
    }

    LaunchedEffect(pendingShellOperationId) {
        val requestId = pendingShellOperationId ?: return@LaunchedEffect
        delay(OPERATION_TIMEOUT_MILLIS)
        if (pendingShellOperationId == requestId) {
            shellOperationError = "Kestrel did not confirm the playback change. Check Map and try again."
            pendingShellOperationId = null
        }
    }

    LaunchedEffect(pendingMapLinkPoint) {
        if (pendingMapLinkPoint != null) {
            currentDestination = AppDestinations.HOME
        }
    }

    NavigationSuiteScaffold(
        containerColor = MaterialTheme.colorScheme.background,
        navigationSuiteColors =
            NavigationSuiteDefaults.colors(
                navigationBarContainerColor = MaterialTheme.colorScheme.surface,
                navigationRailContainerColor = MaterialTheme.colorScheme.surface,
                navigationDrawerContainerColor = MaterialTheme.colorScheme.surface,
            ),
        navigationSuiteItems = {
            AppDestinations.entries.forEach { destination ->
                item(
                    icon = {
                        Icon(destination.icon, contentDescription = destination.label)
                    },
                    label = { Text(destination.label) },
                    selected = destination == currentDestination,
                    onClick = { currentDestination = destination },
                )
            }
        },
    ) {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            containerColor = MaterialTheme.colorScheme.background,
        ) { innerPadding ->
            Column(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
            ) {
                if (currentDestination != AppDestinations.HOME && runtimeState != RuntimeState.Idle) {
                    PlaybackStatusBar(
                        runtime = runtimeState,
                        busy = pendingShellOperationId != null,
                        error = shellOperationError,
                        onViewMap = { currentDestination = AppDestinations.HOME },
                        onPause = {
                            shellOperationError = null
                            pendingShellOperationId = LocationService.pause(context)
                        },
                        onResume = {
                            shellOperationError = null
                            pendingShellOperationId = LocationService.resume(context)
                        },
                        onStop = {
                            shellOperationError = null
                            pendingShellOperationId = LocationService.stop(context)
                        },
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
                AppDestinationContent(
                    currentDestination = currentDestination,
                    pendingFavoriteApply = pendingFavoriteApply,
                    pendingMapLinkPoint = pendingMapLinkPoint,
                    onFavoriteApplyConsumed = { pendingFavoriteApply = null },
                    onMapLinkPointConsumed = onMapLinkPointConsumed,
                    onApplyFavorite = { favorite ->
                        pendingFavoriteApply = favorite
                        currentDestination = AppDestinations.HOME
                    },
                    onShowMap = { currentDestination = AppDestinations.HOME },
                    onShowFavorites = { currentDestination = AppDestinations.FAVORITES },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun KestrelForegroundEffects(skipCloudSyncOnForeground: Boolean) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val syncRepository = remember { CloudSyncRepository.getInstance(context) }
    val remoteControlPoller = remember { RemoteControlPoller.getInstance(context) }
    val syncOnForeground = !skipCloudSyncOnForeground
    DisposableEffect(lifecycleOwner, syncRepository, remoteControlPoller, syncOnForeground) {
        val observer =
            object : DefaultLifecycleObserver {
                override fun onStart(owner: LifecycleOwner) {
                    remoteControlPoller.setForegroundActive(true)
                    if (syncOnForeground) scope.launch { syncRepository.syncOnForeground() }
                }

                override fun onStop(owner: LifecycleOwner) {
                    remoteControlPoller.setForegroundActive(false)
                }
            }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
}

@Suppress("LongParameterList")
@Composable
private fun AppDestinationContent(
    currentDestination: AppDestinations,
    pendingFavoriteApply: LibraryItemWithContent?,
    pendingMapLinkPoint: LatLng?,
    onFavoriteApplyConsumed: () -> Unit,
    onMapLinkPointConsumed: () -> Unit,
    onApplyFavorite: (LibraryItemWithContent) -> Unit,
    onShowMap: () -> Unit,
    onShowFavorites: () -> Unit,
    modifier: Modifier,
) {
    when (currentDestination) {
        AppDestinations.HOME ->
            MapScreen(
                modifier = modifier,
                pendingFavoriteApply = pendingFavoriteApply,
                onFavoriteApplyConsumed = onFavoriteApplyConsumed,
                pendingMapLinkPoint = pendingMapLinkPoint,
                onMapLinkPointConsumed = onMapLinkPointConsumed,
                onViewAllFavorites = onShowFavorites,
            )
        AppDestinations.FAVORITES ->
            FavoritesScreen(
                modifier = modifier,
                onApplyToMap = onApplyFavorite,
                onChooseOnMap = onShowMap,
            )
        AppDestinations.SETTINGS -> OptionsScreen(modifier = modifier)
    }
}

enum class AppDestinations(
    val label: String,
    val icon: ImageVector,
) {
    HOME("Map", Icons.Filled.Map),
    FAVORITES("Favorites", Icons.Filled.Star),
    SETTINGS("Settings", Icons.Filled.Settings),
}
