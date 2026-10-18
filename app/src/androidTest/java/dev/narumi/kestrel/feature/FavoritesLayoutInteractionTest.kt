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
import androidx.compose.ui.test.SemanticsNodeInteraction
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.i18n.appString
import dev.narumi.kestrel.core.i18n.setAppContent
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
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class FavoritesLayoutInteractionTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun toolbarShowsSelectionsAndDisablesSortingWhileSaving() {
        composeRule.setAppContent {
            var filter by remember { mutableStateOf(FavoritesFilter.All) }
            var sort by remember { mutableStateOf(FavoritesSortMode.Mode.Manual) }
            var busy by remember { mutableStateOf(false) }
            MaterialTheme {
                FavoritesToolbar(
                    query = "",
                    selectedFilter = filter,
                    sortMode = sort,
                    resultCount = 1,
                    totalCount = 1,
                    busy = busy,
                    onQueryChange = {},
                    onFilterChange = { filter = it },
                    onSortModeChange = {
                        sort = it
                        busy = true
                    },
                )
            }
        }

        composeRule.onNodeWithText(appString(R.string.filter_all)).assertIsSelected()
        composeRule.onNodeWithText(appString(R.string.filter_points)).performClick().assertIsSelected()
        composeRule.onNodeWithText(appString(R.string.sort_1_s, appString(R.string.sort_manual))).assertTouchHeightIsAtLeast(48.dp).performClick()
        composeRule.onNodeWithText(appString(R.string.sort_alphabetical)).performClick()
        composeRule.onNodeWithText(appString(R.string.sort_1_s, appString(R.string.sort_alphabetical))).assertIsNotEnabled()
    }

    @Test
    fun compactPlaybackKeepsDirectAccessibleActionsAndBusyGuard() {
        var mapViews = 0
        var pauses = 0
        var resumes = 0
        var stops = 0
        composeRule.setAppContent {
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
        composeRule.onNodeWithText(appString(R.string.view_map)).assertTouchHeightIsAtLeast(48.dp).performClick()
        composeRule.onNodeWithContentDescription(appString(R.string.pause)).assertTouchHeightIsAtLeast(48.dp).performClick()
        composeRule.onNodeWithText(appString(R.string.route_paused)).assertIsDisplayed()
        composeRule.onNodeWithContentDescription(appString(R.string.resume)).assertTouchHeightIsAtLeast(48.dp).performClick()
        composeRule.onNodeWithText(appString(R.string.route_playing)).assertIsDisplayed()
        composeRule.onNodeWithContentDescription(appString(R.string.stop)).assertTouchHeightIsAtLeast(48.dp).performClick()
        composeRule.onNodeWithContentDescription(appString(R.string.pause)).assertIsNotEnabled()
        composeRule.onNodeWithContentDescription(appString(R.string.stop)).assertIsNotEnabled()
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
        composeRule.setAppContent {
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
                        query = "",
                        selectedFilter = FavoritesFilter.All,
                        sortMode = FavoritesSortMode.Mode.Manual,
                        operationMessage = null,
                        operationError = null,
                        operationBusy = false,
                        onQueryChange = {},
                        onFilterChange = {},
                        onSortModeChange = {},
                        onClearFilters = {},
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
        composeRule.onNodeWithContentDescription(appString(R.string.pause)).assertIsDisplayed()
        composeRule.onNodeWithContentDescription(appString(R.string.stop)).assertIsDisplayed()
        composeRule.onNode(hasScrollAction()).performScrollToNode(hasText(appString(R.string.search_favorites)))
        composeRule.onNodeWithText(appString(R.string.search_favorites)).assertIsDisplayed()
    }
}

/** Material 3 can draw a 40dp control while retaining its 48dp touch target. */
private fun SemanticsNodeInteraction.assertTouchHeightIsAtLeast(minimum: Dp): SemanticsNodeInteraction =
    apply {
        val node = fetchSemanticsNode()
        val height = with(node.layoutInfo.density) { node.touchBoundsInRoot.height.toDp() }
        assertTrue("Touch height is $height, expected at least $minimum", height >= minimum - 0.5.dp)
    }

private val playingRoute =
    RuntimeState.Route(
        waypoints = listOf(LatLng(25.0, 121.0), LatLng(25.1, 121.1)),
        speedKmh = 12.0,
        mode = MovementEngine.Mode.Loop,
        paused = false,
        playbackId = "playing-route",
    )
