package dev.narumi.kestrel.ui

import android.content.res.Configuration
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
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
import dev.narumi.kestrel.feature.map.ReplacementPreviewCard
import dev.narumi.kestrel.feature.map.RunState
import dev.narumi.kestrel.feature.map.SetupPromptCard
import dev.narumi.kestrel.feature.options.OptionsDisclosureCard
import dev.narumi.kestrel.ui.components.KestrelEmptyState
import dev.narumi.kestrel.ui.components.PlaybackStatusBar
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
            draftWaypointCount = 2,
            mockNow = null,
            ready = true,
            speedKmh = 20.0,
            routeMode = MovementEngine.Mode.Once,
            draftSpeedKmh = 20.0,
            draftRouteMode = MovementEngine.Mode.Once,
            currentSummary = "No mock is active",
            operationPending = false,
            feedbackMessage = null,
            feedbackIsError = false,
            onSpeedChange = {},
            onModeChange = {},
            onPrimary = {},
            onStop = {},
            onUndoLast = {},
            onClear = {},
            onSaveRoute = {},
            onGenerate = {},
            onReplace = {},
            onCancelPreview = {},
        )
    }
}

@PreviewTest
@Preview(
    name = "Map playing dark",
    widthDp = 412,
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
            draftWaypointCount = 0,
            mockNow = null,
            ready = true,
            speedKmh = 12.0,
            routeMode = MovementEngine.Mode.Loop,
            draftSpeedKmh = 12.0,
            draftRouteMode = MovementEngine.Mode.Loop,
            currentSummary = "Route · 7 waypoints · 12 km/h · Loop",
            operationPending = false,
            feedbackMessage = null,
            feedbackIsError = false,
            onSpeedChange = {},
            onModeChange = {},
            onPrimary = {},
            onStop = {},
            onUndoLast = {},
            onClear = {},
            onSaveRoute = {},
            onGenerate = {},
            onReplace = {},
            onCancelPreview = {},
        )
    }
}

@PreviewTest
@Preview(name = "Replacement preview narrow", widthDp = 320, fontScale = 1.3f, showBackground = true)
@Composable
fun ReplacementPreviewScreenshot() {
    KestrelTheme {
        ReplacementPreviewCard(
            currentSummary = "Route · 7 waypoints · 12 km/h · Loop",
            previewSummary = "Point preview",
            applying = false,
            onReplace = {},
            onUndoLast = {},
            onCancelPreview = {},
        )
    }
}

@PreviewTest
@Preview(name = "Map panel expanded", widthDp = 840, heightDp = 480, showBackground = true)
@Composable
fun MapPanelExpandedScreenshot() {
    KestrelTheme {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.width(420.dp).align(Alignment.TopEnd)) {
                MapSheet(
                    runState = RunState.RoutePaused,
                    waypointCount = 7,
                    draftWaypointCount = 3,
                    mockNow = null,
                    ready = true,
                    speedKmh = 12.0,
                    routeMode = MovementEngine.Mode.Loop,
                    draftSpeedKmh = 20.0,
                    draftRouteMode = MovementEngine.Mode.Once,
                    currentSummary = "Route · 7 waypoints · 12 km/h · Loop",
                    operationPending = false,
                    feedbackMessage = "The current route stays paused while you review this draft.",
                    feedbackIsError = false,
                    onSpeedChange = {},
                    onModeChange = {},
                    onPrimary = {},
                    onStop = {},
                    onUndoLast = {},
                    onClear = {},
                    onSaveRoute = {},
                    onGenerate = {},
                    onReplace = {},
                    onCancelPreview = {},
                )
            }
        }
    }
}

@PreviewTest
@Preview(name = "Map panel short landscape", widthDp = 600, heightDp = 320, showBackground = true)
@Composable
fun MapPanelLandscapeScreenshot() {
    KestrelTheme {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.width(320.dp).align(Alignment.TopEnd)) {
                MapSheet(
                    runState = RunState.Idle,
                    waypointCount = 2,
                    draftWaypointCount = 2,
                    mockNow = null,
                    ready = true,
                    speedKmh = 20.0,
                    routeMode = MovementEngine.Mode.Once,
                    draftSpeedKmh = 20.0,
                    draftRouteMode = MovementEngine.Mode.Once,
                    currentSummary = "No mock is active",
                    operationPending = false,
                    feedbackMessage = null,
                    feedbackIsError = false,
                    onSpeedChange = {},
                    onModeChange = {},
                    onPrimary = {},
                    onStop = {},
                    onUndoLast = {},
                    onClear = {},
                    onSaveRoute = {},
                    onGenerate = {},
                    onReplace = {},
                    onCancelPreview = {},
                )
            }
        }
    }
}

@PreviewTest
@Preview(name = "Playback bar medium", widthDp = 600, showBackground = true)
@Composable
fun PlaybackBarScreenshot() {
    KestrelTheme {
        PlaybackStatusBar(
            runtime =
                dev.narumi.kestrel.core.location.RuntimeState.Route(
                    waypoints =
                        listOf(
                            dev.narumi.kestrel.core.location
                                .LatLng(0.0, 0.0),
                            dev.narumi.kestrel.core.location
                                .LatLng(1.0, 1.0),
                        ),
                    speedKmh = 12.0,
                    mode = MovementEngine.Mode.Loop,
                    paused = false,
                ),
            busy = false,
            error = null,
            onViewMap = {},
            onPause = {},
            onResume = {},
            onStop = {},
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
@Preview(name = "Favorite row 2x text", widthDp = 360, fontScale = 2.0f, showBackground = true)
@Composable
fun FavoriteRowLargeTextScreenshot() {
    KestrelTheme {
        FavoriteRow(
            item = previewPlace,
            canReorder = false,
            canMoveUp = false,
            canMoveDown = false,
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
            title = "Route recovery",
            subtitle = "Choose how much progress may rewind after Android stops the service.",
            summary = "Balanced · can rewind up to 5 s",
            expanded = true,
            onExpandedChange = {},
        ) {
            Column {
                androidx.compose.material3.Text("More accurate · Balanced · Fewer writes")
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
