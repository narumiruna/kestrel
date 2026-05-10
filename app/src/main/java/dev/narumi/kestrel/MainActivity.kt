package dev.narumi.kestrel

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
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.feature.favorites.FavoritesScreen
import dev.narumi.kestrel.feature.map.MapScreen
import dev.narumi.kestrel.feature.options.OptionsScreen
import dev.narumi.kestrel.ui.theme.KestrelTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            KestrelTheme {
                KestrelApp()
            }
        }
    }
}

@PreviewScreenSizes
@Composable
fun KestrelApp() {
    var currentDestination by rememberSaveable { mutableStateOf(AppDestinations.HOME) }
    var pendingFavoriteApply by remember { mutableStateOf<LibraryItemWithContent?>(null) }
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val syncRepository = remember { CloudSyncRepository.getInstance(context) }

    DisposableEffect(lifecycleOwner, syncRepository) {
        val observer =
            object : DefaultLifecycleObserver {
                override fun onStart(owner: LifecycleOwner) {
                    scope.launch {
                        syncRepository.syncOnForeground()
                    }
                }
            }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    NavigationSuiteScaffold(
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
        Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
            val contentModifier = Modifier.padding(innerPadding)
            when (currentDestination) {
                AppDestinations.HOME ->
                    MapScreen(
                        modifier = contentModifier,
                        pendingFavoriteApply = pendingFavoriteApply,
                        onFavoriteApplyConsumed = { pendingFavoriteApply = null },
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
