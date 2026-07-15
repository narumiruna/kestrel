package dev.narumi.kestrel.ui

import android.content.res.Configuration
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import dev.narumi.kestrel.core.library.LibraryItem
import dev.narumi.kestrel.core.library.LibraryItemKind
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.core.library.Place
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.feature.favorites.FavoriteRow
import dev.narumi.kestrel.feature.map.MapSetupStep
import dev.narumi.kestrel.feature.map.MapSheet
import dev.narumi.kestrel.feature.map.RunState
import dev.narumi.kestrel.feature.map.SetupPromptCard
import dev.narumi.kestrel.feature.options.OptionsDisclosureCard
import dev.narumi.kestrel.ui.components.KestrelEmptyState
import dev.narumi.kestrel.ui.theme.KestrelTheme

@PreviewTest
@Preview(name = "Setup narrow large text", widthDp = 320, fontScale = 1.4f, showBackground = true)
@Composable
fun SetupPromptScreenshot() {
    KestrelTheme {
        SetupPromptCard(
            setupStep = MapSetupStep.Permissions,
            title = "Permission needed",
            message = "Allow location and notifications so mock GPS can run.",
            modifier = Modifier.padding(12.dp),
        )
    }
}

@PreviewTest
@Preview(name = "Map idle", widthDp = 360, heightDp = 640, showBackground = true)
@Composable
fun MapSheetScreenshot() {
    KestrelTheme {
        MapSheet(
            runState = RunState.Idle,
            waypointCount = 2,
            mockNow = null,
            ready = true,
            speedKmh = 20.0,
            routeMode = MovementEngine.Mode.Once,
            onSpeedChange = {},
            onModeChange = {},
            onPrimary = {},
            onStop = {},
            onClear = {},
            onSaveRoute = {},
            onGenerate = {},
        )
    }
}

@PreviewTest
@Preview(
    name = "Map playing dark",
    widthDp = 360,
    heightDp = 640,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
    showBackground = true,
)
@Composable
fun MapPlayingScreenshot() {
    KestrelTheme {
        MapSheet(
            runState = RunState.RoutePlaying,
            waypointCount = 7,
            mockNow = null,
            ready = true,
            speedKmh = 12.0,
            routeMode = MovementEngine.Mode.Loop,
            onSpeedChange = {},
            onModeChange = {},
            onPrimary = {},
            onStop = {},
            onClear = {},
            onSaveRoute = {},
            onGenerate = {},
        )
    }
}

@PreviewTest
@Preview(name = "Favorites empty narrow", widthDp = 320, fontScale = 1.3f, showBackground = true)
@Composable
fun FavoritesEmptyScreenshot() {
    KestrelTheme {
        KestrelEmptyState(
            icon = Icons.Outlined.StarBorder,
            title = "No favorites yet",
            message = "Long-press a spot on the map, or save a route from the map controls.",
        )
    }
}

@PreviewTest
@Preview(name = "Favorite row", widthDp = 320, fontScale = 1.2f, showBackground = true)
@Composable
fun FavoriteRowScreenshot() {
    KestrelTheme {
        FavoriteRow(
            item = previewPlace,
            canReorder = true,
            canMoveUp = true,
            canMoveDown = true,
            onApply = {},
            onRename = {},
            onEdit = {},
            onMoveUp = {},
            onMoveDown = {},
            onDelete = {},
        )
    }
}

@PreviewTest
@Preview(name = "Options collapsed", widthDp = 320, fontScale = 1.3f, showBackground = true)
@Composable
fun OptionsCollapsedScreenshot() {
    KestrelTheme {
        OptionsDisclosureCard(
            title = "Cloud sync",
            subtitle = "Connect to Kestrel cloud and keep favorites synced.",
            summary = "Signed out",
            expanded = false,
            onExpandedChange = {},
        ) {}
    }
}

@PreviewTest
@Preview(
    name = "Options expanded dark",
    widthDp = 360,
    uiMode = Configuration.UI_MODE_NIGHT_YES,
    showBackground = true,
)
@Composable
fun OptionsExpandedScreenshot() {
    KestrelTheme {
        OptionsDisclosureCard(
            title = "Mock playback",
            subtitle = "Balance restore accuracy with write frequency.",
            summary = "Every 5 s",
            expanded = true,
            onExpandedChange = {},
        ) {
            Column {
                androidx.compose.material3.Text("Route progress write interval: 5 s")
                androidx.compose.material3.Text("Changes apply to the next route start or restore.")
            }
        }
    }
}

private val previewPlace =
    LibraryItemWithContent(
        item =
            LibraryItem(
                id = "item-1",
                kind = LibraryItemKind.Place,
                placeId = "place-1",
                sortOrder = 0,
                createdAt = 0,
                updatedAt = 0,
            ),
        name = "Taipei 101 with a deliberately long favorite name",
        kind = LibraryItemKind.Place,
        place =
            Place(
                id = "place-1",
                name = "Taipei 101",
                lat = 25.03398,
                lng = 121.56454,
                createdAt = 0,
                updatedAt = 0,
            ),
    )
