package dev.narumi.kestrel

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.view.ContextThemeWrapper
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteDefaults
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewScreenSizes
import androidx.compose.ui.unit.dp
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import dev.narumi.kestrel.core.cloud.CloudSyncRepository
import dev.narumi.kestrel.core.cloud.isOidcCallbackUri
import dev.narumi.kestrel.core.i18n.AppLanguage
import dev.narumi.kestrel.core.i18n.UiMessage
import dev.narumi.kestrel.core.i18n.displayNumber
import dev.narumi.kestrel.core.i18n.distance
import dev.narumi.kestrel.core.i18n.labelResource
import dev.narumi.kestrel.core.i18n.routeDetails
import dev.narumi.kestrel.core.i18n.speed
import dev.narumi.kestrel.core.i18n.waypointCount
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.LocationService
import dev.narumi.kestrel.core.location.RuntimeState
import dev.narumi.kestrel.core.location.parseCoordInput
import dev.narumi.kestrel.feature.favorites.FavoritesScreen
import dev.narumi.kestrel.feature.map.MapScreen
import dev.narumi.kestrel.feature.options.OptionsScreen
import dev.narumi.kestrel.ui.components.KestrelIcon
import dev.narumi.kestrel.ui.components.KestrelIcons
import dev.narumi.kestrel.ui.components.PlaybackStatusBar
import dev.narumi.kestrel.ui.theme.KestrelTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val OPERATION_TIMEOUT_MILLIS = 10_000L

class MainActivity : AppCompatActivity() {
    private var pendingMapLinkPoint by mutableStateOf<LatLng?>(null)
    private var pendingOidcCallback by mutableStateOf<String?>(null)
    private var skipCloudSyncOnForeground by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) {
            consumeMainIntent(intent)
        } else {
            pendingMapLinkPoint = savedInstanceState.getDoubleArray("pendingMapPoint")?.let { LatLng(it[0], it[1]) }
            pendingOidcCallback = savedInstanceState.getString("pendingOidcCallback")
            skipCloudSyncOnForeground = savedInstanceState.getBoolean("skipCloudSync")
        }
        enableEdgeToEdge()
        lifecycleScope.launch {
            AppLanguage.initialize(this@MainActivity)
            val localeContext =
                ContextThemeWrapper(this@MainActivity, R.style.Theme_Kestrel).apply {
                    applyOverrideConfiguration(AppLanguage.context(this@MainActivity).resources.configuration)
                }
            setContent {
                CompositionLocalProvider(
                    LocalContext provides localeContext,
                    LocalConfiguration provides localeContext.resources.configuration,
                ) {
                    KestrelTheme {
                        KestrelApp(
                            pendingMapLinkPoint = pendingMapLinkPoint,
                            pendingOidcCallback = pendingOidcCallback,
                            skipCloudSyncOnForeground = skipCloudSyncOnForeground,
                            onMapLinkPointConsumed = { pendingMapLinkPoint = null },
                            onOidcCallbackConsumed = ::consumeOidcCallbackIntent,
                        )
                    }
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        (application as KestrelApplication).remoteControlLifecycle.setForegroundActive(true)
    }

    override fun onStop() {
        (application as KestrelApplication).remoteControlLifecycle.setForegroundActive(false)
        super.onStop()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        pendingMapLinkPoint?.let { outState.putDoubleArray("pendingMapPoint", doubleArrayOf(it.lat, it.lng)) }
        outState.putString("pendingOidcCallback", pendingOidcCallback)
        outState.putBoolean("skipCloudSync", skipCloudSyncOnForeground)
        super.onSaveInstanceState(outState)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        consumeMainIntent(intent)
    }

    private fun consumeMainIntent(intent: Intent?) {
        skipCloudSyncOnForeground = intent?.getBooleanExtra(EXTRA_SKIP_CLOUD_SYNC_ON_FOREGROUND, false) == true
        val viewedUri = intent?.dataString.takeIf { intent?.action == Intent.ACTION_VIEW }
        if (isOidcCallbackUri(viewedUri)) {
            pendingMapLinkPoint = null
            pendingOidcCallback = viewedUri
        } else {
            consumeMapLinkIntent(intent)
        }
    }

    private fun consumeOidcCallbackIntent(consumedUri: String) {
        if (pendingOidcCallback != consumedUri) return
        pendingOidcCallback = null
        if (intent?.action != Intent.ACTION_VIEW || intent?.dataString != consumedUri) return
        setIntent(
            Intent(intent).apply {
                action = null
                data = null
            },
        )
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
    pendingOidcCallback: String? = null,
    skipCloudSyncOnForeground: Boolean = false,
    onMapLinkPointConsumed: () -> Unit = {},
    onOidcCallbackConsumed: (String) -> Unit = {},
) {
    var currentDestination by rememberSaveable { mutableStateOf(AppDestinations.HOME) }
    val destinationState = rememberSaveableStateHolder()
    var pendingFavoriteApply by rememberSaveable { mutableStateOf<LibraryItemWithContent?>(null) }
    var pendingShellOperationId by rememberSaveable { mutableStateOf<String?>(null) }
    var shellOperationError by rememberSaveable { mutableStateOf<UiMessage?>(null) }
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
            shellOperationError = UiMessage(R.string.kestrel_did_not_confirm_the_playback_change_check_map_and_try_again)
            pendingShellOperationId = null
        }
    }

    LaunchedEffect(pendingMapLinkPoint) {
        if (pendingMapLinkPoint != null) {
            currentDestination = AppDestinations.HOME
        }
    }

    LaunchedEffect(pendingOidcCallback) {
        if (pendingOidcCallback != null) {
            currentDestination = AppDestinations.SETTINGS
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
                        KestrelIcon(
                            imageVector = if (destination == currentDestination) destination.icon else destination.unselectedIcon,
                            contentDescription = null,
                        )
                    },
                    label = { Text(stringResource(destination.label), style = MaterialTheme.typography.labelMedium) },
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
                        error = shellOperationError?.resolve(context),
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
                destinationState.SaveableStateProvider(currentDestination.name) {
                    AppDestinationContent(
                        currentDestination = currentDestination,
                        pendingFavoriteApply = pendingFavoriteApply,
                        pendingMapLinkPoint = pendingMapLinkPoint,
                        pendingOidcCallback = pendingOidcCallback,
                        onFavoriteApplyConsumed = { pendingFavoriteApply = null },
                        onMapLinkPointConsumed = onMapLinkPointConsumed,
                        onOidcCallbackConsumed = onOidcCallbackConsumed,
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
}

@Composable
private fun KestrelForegroundEffects(skipCloudSyncOnForeground: Boolean) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val syncRepository = remember { CloudSyncRepository.getInstance(context) }
    val syncOnForeground = !skipCloudSyncOnForeground
    DisposableEffect(lifecycleOwner, syncRepository, syncOnForeground) {
        val observer =
            object : DefaultLifecycleObserver {
                override fun onStart(owner: LifecycleOwner) {
                    if (syncOnForeground) scope.launch { syncRepository.syncOnForeground() }
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
    pendingOidcCallback: String?,
    onFavoriteApplyConsumed: () -> Unit,
    onMapLinkPointConsumed: () -> Unit,
    onOidcCallbackConsumed: (String) -> Unit,
    onApplyFavorite: (LibraryItemWithContent) -> Unit,
    onShowMap: () -> Unit,
    onShowFavorites: () -> Unit,
    modifier: Modifier,
) {
    when (currentDestination) {
        AppDestinations.HOME -> {
            MapScreen(
                modifier = modifier,
                pendingFavoriteApply = pendingFavoriteApply,
                onFavoriteApplyConsumed = onFavoriteApplyConsumed,
                pendingMapLinkPoint = pendingMapLinkPoint,
                onMapLinkPointConsumed = onMapLinkPointConsumed,
                onViewAllFavorites = onShowFavorites,
            )
        }

        AppDestinations.FAVORITES -> {
            FavoritesScreen(
                modifier = modifier,
                onApplyToMap = onApplyFavorite,
                onChooseOnMap = onShowMap,
            )
        }

        AppDestinations.SETTINGS -> {
            OptionsScreen(
                pendingOidcCallback = pendingOidcCallback,
                onOidcCallbackConsumed = onOidcCallbackConsumed,
                modifier = modifier,
            )
        }
    }
}

enum class AppDestinations(
    val label: Int,
    val icon: ImageVector,
    val unselectedIcon: ImageVector,
) {
    HOME(R.string.nav_map, KestrelIcons.MapFilled, KestrelIcons.MapOutlined),
    FAVORITES(R.string.nav_favorites, KestrelIcons.FavoriteFilled, KestrelIcons.FavoriteOutlined),
    SETTINGS(R.string.nav_settings, KestrelIcons.SettingsFilled, KestrelIcons.SettingsOutlined),
}
