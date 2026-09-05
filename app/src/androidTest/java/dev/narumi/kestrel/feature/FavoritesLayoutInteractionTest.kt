package dev.narumi.kestrel.feature

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.library.LibraryItem
import dev.narumi.kestrel.core.library.LibraryItemKind
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.RuntimeState
import dev.narumi.kestrel.feature.favorites.FavoritesContent
import dev.narumi.kestrel.feature.favorites.FavoritesFilter
import dev.narumi.kestrel.feature.favorites.FavoritesToolbar
import dev.narumi.kestrel.ui.components.PlaybackStatusBar
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class FavoritesLayoutInteractionTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun menusShowCurrentSelectionsAndDisableSortingWhileSaving() {
        composeRule.setContent {
            var filter by remember { mutableStateOf(FavoritesFilter.All) }
            var sort by remember { mutableStateOf(FavoritesSortMode.Mode.Manual) }
            var busy by remember { mutableStateOf(false) }
            MaterialTheme {
                FavoritesToolbar(
                    selectedFilter = filter,
                    sortMode = sort,
                    operationBusy = busy,
                    onFilterChange = { filter = it },
                    onSortModeChange = {
                        sort = it
                        busy = true
                    },
                )
            }
        }

        composeRule.onNodeWithText("Show: All").assertHeightIsAtLeast(48.dp).performClick()
        composeRule.onNodeWithText("All").assertIsSelected()
        composeRule.onNodeWithText("Points").performClick()
        composeRule.onNodeWithText("Show: Points").assertIsDisplayed()
        composeRule.onNodeWithText("Sort by: Manual").assertHeightIsAtLeast(48.dp).performClick()
        composeRule.onNodeWithText("Manual").assertIsSelected()
        composeRule.onNodeWithText("Alphabetical").performClick()
        composeRule.onNodeWithText("Sort by: Alphabetical").assertIsNotEnabled()
    }

    @Test
    fun compactPlaybackKeepsDirectAccessibleActionsAndBusyGuard() {
        var mapViews = 0
        var pauses = 0
        var resumes = 0
        var stops = 0
        composeRule.setContent {
            var runtime by remember { mutableStateOf(playingRoute) }
            var busy by remember { mutableStateOf(false) }
            MaterialTheme {
                PlaybackStatusBar(
                    runtime = runtime,
                    busy = busy,
                    error = null,
                    onViewMap = { mapViews++ },
                    onPause = {
                        pauses++
                        runtime = runtime.copy(paused = true)
                    },
                    onResume = {
                        resumes++
                        runtime = runtime.copy(paused = false)
                    },
                    onStop = {
                        stops++
                        busy = true
                    },
                    modifier = Modifier.width(320.dp).testTag("playback"),
                )
            }
        }

        composeRule.onNodeWithTag("playback").assertHeightIsEqualTo(56.dp)
        composeRule.onNodeWithText("View map").assertHeightIsAtLeast(48.dp).performClick()
        composeRule.onNodeWithContentDescription("Pause").assertHeightIsAtLeast(48.dp).performClick()
        composeRule.onNodeWithText("Route paused").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Resume").assertHeightIsAtLeast(48.dp).performClick()
        composeRule.onNodeWithText("Route playing").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Stop").assertHeightIsAtLeast(48.dp).performClick()
        composeRule.onNodeWithContentDescription("Pause").assertIsNotEnabled()
        composeRule.onNodeWithContentDescription("Stop").assertIsNotEnabled()
        composeRule.runOnIdle {
            assertEquals(listOf(1, 1, 1, 1), listOf(mapViews, pauses, resumes, stops))
        }
    }

    @Test
    fun shortViewportScrollsFromControlsToLastFavoriteWithoutLosingPlayback() {
        val items =
            List(20) { index ->
                LibraryItemWithContent(
                    item =
                        LibraryItem(
                            id = "item-$index",
                            kind = LibraryItemKind.Place,
                            sortOrder = index,
                            createdAt = 0,
                            updatedAt = 0,
                        ),
                    name = "Favorite $index",
                    kind = LibraryItemKind.Place,
                )
            }
        composeRule.setContent {
            MaterialTheme {
                Column(Modifier.size(width = 320.dp, height = 360.dp)) {
                    PlaybackStatusBar(
                        runtime = playingRoute,
                        busy = false,
                        error = null,
                        onViewMap = {},
                        onPause = {},
                        onResume = {},
                        onStop = {},
                    )
                    FavoritesContent(
                        modifier = Modifier.weight(1f),
                        items = items,
                        visibleItems = items,
                        loading = false,
                        selectedFilter = FavoritesFilter.All,
                        sortMode = FavoritesSortMode.Mode.Manual,
                        operationMessage = null,
                        operationError = null,
                        operationBusy = false,
                        onFilterChange = {},
                        onSortModeChange = {},
                        onChooseOnMap = {},
                        onApply = {},
                        onRename = {},
                        onEdit = {},
                        onMove = { _, _ -> },
                        onDelete = {},
                    )
                }
            }
        }

        composeRule.onNodeWithText("Favorite 0").assertIsDisplayed()
        composeRule.onNode(hasScrollAction()).performScrollToNode(hasText("Favorite 19"))
        composeRule.onNodeWithText("Favorite 19").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Pause").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Stop").assertIsDisplayed()
        composeRule.onNode(hasScrollAction()).performScrollToNode(hasText("Show: All", substring = true))
        composeRule.onNodeWithText("Show: All").assertIsDisplayed()
    }
}

private val playingRoute =
    RuntimeState.Route(
        waypoints = listOf(LatLng(25.0, 121.0), LatLng(25.1, 121.1)),
        speedKmh = 12.0,
        mode = MovementEngine.Mode.Loop,
        paused = false,
    )
