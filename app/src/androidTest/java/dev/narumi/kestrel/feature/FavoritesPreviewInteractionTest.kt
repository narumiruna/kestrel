package dev.narumi.kestrel.feature

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.i18n.appString
import dev.narumi.kestrel.core.i18n.setAppContent
import dev.narumi.kestrel.core.library.LibraryItem
import dev.narumi.kestrel.core.library.LibraryItemKind
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.feature.favorites.FavoritesContent
import dev.narumi.kestrel.feature.favorites.FavoritesFilter
import dev.narumi.kestrel.feature.favorites.FavoritesToolbar
import dev.narumi.kestrel.feature.favorites.visibleFavorites
import dev.narumi.kestrel.feature.map.DraftPreviewActionsCard
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class FavoritesPreviewInteractionTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun searchCanBeClearedAndFiltersExposeSelection() {
        var query = ""
        composeRule.setAppContent {
            var input by remember { mutableStateOf("") }
            var filter by remember { mutableStateOf(FavoritesFilter.All) }
            MaterialTheme {
                FavoritesToolbar(
                    query = input,
                    selectedFilter = filter,
                    sortMode = FavoritesSortMode.Mode.Manual,
                    resultCount = 1,
                    totalCount = 1,
                    busy = false,
                    onQueryChange = {
                        input = it
                        query = it
                    },
                    onFilterChange = { filter = it },
                    onSortModeChange = {},
                )
            }
        }
        composeRule.onNodeWithText(appString(R.string.filter_all)).assertIsSelected()
        composeRule.onNodeWithText(appString(R.string.search_favorites)).performTextInput("Taipei")
        composeRule.runOnIdle { assertEquals("Taipei", query) }
        composeRule.onNodeWithContentDescription(appString(R.string.clear_search)).performClick()
        composeRule.runOnIdle { assertEquals("", query) }
        composeRule.onNodeWithText(appString(R.string.filter_routes)).performClick().assertIsSelected()
    }

    @Test
    fun sortMenuKeepsCurrentChoiceVisibleAndOnlyWritesChanges() {
        val changes = mutableListOf<FavoritesSortMode.Mode>()
        composeRule.setAppContent {
            MaterialTheme {
                FavoritesToolbar(
                    query = "",
                    selectedFilter = FavoritesFilter.All,
                    sortMode = FavoritesSortMode.Mode.Manual,
                    resultCount = 1,
                    totalCount = 1,
                    busy = false,
                    onQueryChange = {},
                    onFilterChange = {},
                    onSortModeChange = { changes.add(it) },
                )
            }
        }
        composeRule.onNodeWithText(appString(R.string.sort_1_s, appString(R.string.sort_manual))).performClick()
        composeRule.onNodeWithText(appString(R.string.sort_manual)).performClick()
        composeRule.runOnIdle { assertEquals(emptyList<FavoritesSortMode.Mode>(), changes) }
        composeRule.onNodeWithText(appString(R.string.sort_1_s, appString(R.string.sort_manual))).performClick()
        composeRule.onNodeWithText(appString(R.string.sort_recent)).performClick()
        composeRule.runOnIdle { assertEquals(listOf(FavoritesSortMode.Mode.Recent), changes) }
    }

    @Test
    fun shortScreenCanScrollPastControlsToPreviewAction() {
        var previews = 0
        composeRule.setAppContent {
            MaterialTheme {
                Box(Modifier.width(320.dp).height(240.dp)) {
                    TestFavoritesContent(onApply = { previews++ })
                }
            }
        }
        composeRule.onNode(hasScrollAction()).performScrollToNode(hasText(appString(R.string.preview_on_map)))
        composeRule.onNodeWithText(appString(R.string.preview_on_map)).assertIsDisplayed().performClick()
        composeRule.runOnIdle { assertEquals(1, previews) }
    }

    @Test
    fun errorFeedbackRemainsVisibleWithoutCoveringTheScrolledAction() {
        composeRule.setAppContent {
            MaterialTheme {
                Box(Modifier.width(320.dp).height(300.dp)) {
                    TestFavoritesContent(error = "Could not save. Try again.")
                }
            }
        }
        composeRule.onNode(hasScrollAction()).performScrollToNode(hasText(appString(R.string.preview_on_map)))
        val action = composeRule.onNodeWithText(appString(R.string.preview_on_map)).assertIsDisplayed()
        val feedback = composeRule.onNodeWithText("Could not save. Try again.").assertIsDisplayed()

        assertTrue(
            "The Snackbar must not overlap the final favorite action",
            action.fetchSemanticsNode().boundsInRoot.bottom <= feedback.fetchSemanticsNode().boundsInRoot.top,
        )
    }

    @Test
    fun noMatchesOffersResetInsteadOfLeavingFavorites() {
        composeRule.setAppContent {
            MaterialTheme { TestFavoritesContent(initialQuery = "missing") }
        }
        composeRule.onNode(hasScrollAction()).performScrollToNode(hasText(appString(R.string.clear_search_and_filters)))
        composeRule.onNodeWithText(appString(R.string.clear_search_and_filters)).performClick()
        composeRule.onNode(hasScrollAction()).performScrollToNode(hasText(appString(R.string.preview_on_map)))
        composeRule.onNodeWithText(appString(R.string.preview_on_map)).assertIsDisplayed()
    }

    @Test
    fun pointCanBeSavedDirectlyAndSecondaryActionsStayInOverflow() {
        var saves = 0
        var clears = 0
        composeRule.setAppContent {
            MaterialTheme {
                DraftPreviewActionsCard(
                    waypointCount = 1,
                    enabled = true,
                    onUndoLast = {},
                    onClear = { clears++ },
                    onSavePreview = { saves++ },
                    onGenerate = {},
                )
            }
        }
        composeRule.onNodeWithText(appString(R.string.save_point)).assertHeightIsAtLeast(48.dp).performClick()
        composeRule.onNodeWithText(appString(R.string.clear_preview)).assertDoesNotExist()
        composeRule.onNodeWithContentDescription(appString(R.string.more_preview_actions)).performClick()
        composeRule.runOnIdle {
            assertEquals(1, saves)
            assertEquals(0, clears)
        }
        composeRule.onNodeWithText(appString(R.string.clear_preview)).performClick()
        composeRule.runOnIdle { assertEquals(1, clears) }
    }

    @Test
    fun applyingDraftDisablesSaveUndoAndOverflow() {
        composeRule.setAppContent {
            MaterialTheme {
                DraftPreviewActionsCard(
                    waypointCount = 2,
                    enabled = false,
                    onUndoLast = {},
                    onClear = {},
                    onSavePreview = {},
                    onGenerate = {},
                )
            }
        }
        composeRule.onNodeWithText(appString(R.string.save_route)).assertIsNotEnabled()
        composeRule.onNodeWithText(appString(R.string.undo_last_waypoint)).assertIsNotEnabled()
        composeRule.onNodeWithContentDescription(appString(R.string.more_preview_actions)).assertIsNotEnabled()
    }
}

@Composable
private fun TestFavoritesContent(
    initialQuery: String = "",
    error: String? = null,
    onApply: () -> Unit = {},
) {
    var query by remember { mutableStateOf(initialQuery) }
    var filter by remember { mutableStateOf(FavoritesFilter.All) }
    val items =
        listOf(
            LibraryItemWithContent(
                item =
                    LibraryItem(
                        id = "point-1",
                        kind = LibraryItemKind.Place,
                        sortOrder = 0,
                        createdAt = 0,
                        updatedAt = 0,
                    ),
                name = "Taipei 101",
                kind = LibraryItemKind.Place,
            ),
        )
    FavoritesContent(
        items = items,
        visibleItems = visibleFavorites(items, query, filter, FavoritesSortMode.Mode.Manual),
        loading = false,
        query = query,
        selectedFilter = filter,
        sortMode = FavoritesSortMode.Mode.Manual,
        operationMessage = null,
        operationError = error,
        operationBusy = false,
        onQueryChange = { query = it },
        onFilterChange = { filter = it },
        onSortModeChange = {},
        onClearFilters = {
            query = ""
            filter = FavoritesFilter.All
        },
        onChooseOnMap = {},
        onApply = { onApply() },
        onRename = {},
        onEdit = {},
        onMove = { _, _ -> },
        onDelete = {},
    )
}
