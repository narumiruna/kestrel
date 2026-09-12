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
import dev.narumi.kestrel.core.data.FavoritesSortMode
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
        composeRule.setContent {
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
        composeRule.onNodeWithText("All").assertIsSelected()
        composeRule.onNodeWithText("Search Favorites").performTextInput("Taipei")
        composeRule.runOnIdle { assertEquals("Taipei", query) }
        composeRule.onNodeWithContentDescription("Clear search").performClick()
        composeRule.runOnIdle { assertEquals("", query) }
        composeRule.onNodeWithText("Routes").performClick().assertIsSelected()
    }

    @Test
    fun sortMenuKeepsCurrentChoiceVisibleAndOnlyWritesChanges() {
        val changes = mutableListOf<FavoritesSortMode.Mode>()
        composeRule.setContent {
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
        composeRule.onNodeWithText("Sort: Manual").performClick()
        composeRule.onNodeWithText("Manual").performClick()
        composeRule.runOnIdle { assertEquals(emptyList<FavoritesSortMode.Mode>(), changes) }
        composeRule.onNodeWithText("Sort: Manual").performClick()
        composeRule.onNodeWithText("Recent").performClick()
        composeRule.runOnIdle { assertEquals(listOf(FavoritesSortMode.Mode.Recent), changes) }
    }

    @Test
    fun shortScreenCanScrollPastControlsToPreviewAction() {
        var previews = 0
        composeRule.setContent {
            MaterialTheme {
                Box(Modifier.width(320.dp).height(240.dp)) {
                    TestFavoritesContent(onApply = { previews++ })
                }
            }
        }
        composeRule.onNode(hasScrollAction()).performScrollToNode(hasText("Preview on map"))
        composeRule.onNodeWithText("Preview on map").assertIsDisplayed().performClick()
        composeRule.runOnIdle { assertEquals(1, previews) }
    }

    @Test
    fun errorFeedbackRemainsVisibleWithoutCoveringTheScrolledAction() {
        composeRule.setContent {
            MaterialTheme {
                Box(Modifier.width(320.dp).height(300.dp)) {
                    TestFavoritesContent(error = "Could not save. Try again.")
                }
            }
        }
        composeRule.onNode(hasScrollAction()).performScrollToNode(hasText("Preview on map"))
        val action = composeRule.onNodeWithText("Preview on map").assertIsDisplayed()
        val feedback = composeRule.onNodeWithText("Could not save. Try again.").assertIsDisplayed()

        assertTrue(
            "The Snackbar must not overlap the final favorite action",
            action.fetchSemanticsNode().boundsInRoot.bottom <= feedback.fetchSemanticsNode().boundsInRoot.top,
        )
    }

    @Test
    fun noMatchesOffersResetInsteadOfLeavingFavorites() {
        composeRule.setContent {
            MaterialTheme { TestFavoritesContent(initialQuery = "missing") }
        }
        composeRule.onNode(hasScrollAction()).performScrollToNode(hasText("Clear search and filters"))
        composeRule.onNodeWithText("Clear search and filters").performClick()
        composeRule.onNode(hasScrollAction()).performScrollToNode(hasText("Preview on map"))
        composeRule.onNodeWithText("Preview on map").assertIsDisplayed()
    }

    @Test
    fun pointCanBeSavedDirectlyAndSecondaryActionsStayInOverflow() {
        var saves = 0
        var clears = 0
        composeRule.setContent {
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
        composeRule.onNodeWithText("Save point").assertHeightIsAtLeast(48.dp).performClick()
        composeRule.onNodeWithText("Clear preview").assertDoesNotExist()
        composeRule.onNodeWithContentDescription("More preview actions").performClick()
        composeRule.runOnIdle {
            assertEquals(1, saves)
            assertEquals(0, clears)
        }
        composeRule.onNodeWithText("Clear preview").performClick()
        composeRule.runOnIdle { assertEquals(1, clears) }
    }

    @Test
    fun applyingDraftDisablesSaveUndoAndOverflow() {
        composeRule.setContent {
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
        composeRule.onNodeWithText("Save route").assertIsNotEnabled()
        composeRule.onNodeWithText("Undo last waypoint").assertIsNotEnabled()
        composeRule.onNodeWithContentDescription("More preview actions").assertIsNotEnabled()
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
