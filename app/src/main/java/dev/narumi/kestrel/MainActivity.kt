package dev.narumi.kestrel

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
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
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.compose.LocalLifecycleOwner
import dev.narumi.kestrel.core.cloud.CloudSyncRepository
import dev.narumi.kestrel.core.cloud.RemoteControlPoller
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.parseCoordInput
import dev.narumi.kestrel.feature.favorites.FavoritesScreen
import dev.narumi.kestrel.feature.map.MapScreen
import dev.narumi.kestrel.feature.options.OptionsScreen
import dev.narumi.kestrel.ui.theme.KestrelTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private var pendingMapLinkPoint by mutableStateOf<LatLng?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        consumeMapLinkIntent(intent)
        enableEdgeToEdge()
        setContent {
            KestrelTheme {
                KestrelApp(
                    pendingMapLinkPoint = pendingMapLinkPoint,
                    onMapLinkPointConsumed = { pendingMapLinkPoint = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        consumeMapLinkIntent(intent)
    }

    private fun consumeMapLinkIntent(intent: Intent?) {
        if (intent?.action != Intent.ACTION_VIEW) return
        pendingMapLinkPoint = intent.dataString?.let(::parseCoordInput)
    }

    companion object {
        const val EXTRA_SKIP_CLOUD_SYNC_ON_FOREGROUND = "dev.narumi.kestrel.SKIP_CLOUD_SYNC_ON_FOREGROUND"
    }
}

@PreviewScreenSizes
@Composable
fun KestrelApp(
    pendingMapLinkPoint: LatLng? = null,
    onMapLinkPointConsumed: () -> Unit = {},
) {
    var currentDestination by rememberSaveable { mutableStateOf(AppDestinations.HOME) }
    var pendingFavoriteApply by remember { mutableStateOf<LibraryItemWithContent?>(null) }
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val syncRepository = remember { CloudSyncRepository.getInstance(context) }
    val remoteControlPoller = remember { RemoteControlPoller.getInstance(context) }
    val syncOnForeground =
        (context as? MainActivity)?.intent?.getBooleanExtra(MainActivity.EXTRA_SKIP_CLOUD_SYNC_ON_FOREGROUND, false) != true

    DisposableEffect(lifecycleOwner, syncRepository) {
        val observer =
            object : DefaultLifecycleObserver {
                override fun onStart(owner: LifecycleOwner) {
                    remoteControlPoller.setForegroundActive(true)
                    if (syncOnForeground) {
                        scope.launch {
                            syncRepository.syncOnForeground()
                        }
                    }
                }

                override fun onStop(owner: LifecycleOwner) {
                    remoteControlPoller.setForegroundActive(false)
                }
            }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
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
            val contentModifier = Modifier.padding(innerPadding)
            when (currentDestination) {
                AppDestinations.HOME ->
                    MapScreen(
                        modifier = contentModifier,
                        pendingFavoriteApply = pendingFavoriteApply,
                        onFavoriteApplyConsumed = { pendingFavoriteApply = null },
                        pendingMapLinkPoint = pendingMapLinkPoint,
                        onMapLinkPointConsumed = onMapLinkPointConsumed,
                    )
                AppDestinations.FAVORITES ->
                    FavoritesScreen(
                        modifier = contentModifier,
                        onApplyToMap = { favorite ->
                            pendingFavoriteApply = favorite
                            currentDestination = AppDestinations.HOME
                        },
                    )
                AppDestinations.OPTIONS -> OptionsScreen(modifier = contentModifier)
            }
        }
    }
}

enum class AppDestinations(
    val label: String,
    val icon: ImageVector,
) {
    HOME("Map", Icons.Filled.Map),
    FAVORITES("Favorites", Icons.Filled.Star),
    OPTIONS("Options", Icons.Filled.Settings),
}
