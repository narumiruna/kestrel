package dev.narumi.kestrel.feature.favorites

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.ui.components.KestrelEmptyState
import dev.narumi.kestrel.ui.components.KestrelScreenHeader

@Suppress("LongParameterList", "LongMethod")
@Composable
internal fun FavoritesContent(
    items: List<LibraryItemWithContent>,
    visibleItems: List<LibraryItemWithContent>,
    loading: Boolean,
    query: String,
    selectedFilter: FavoritesFilter,
    sortMode: FavoritesSortMode.Mode,
    operationMessage: String?,
    operationError: String?,
    operationBusy: Boolean,
    onQueryChange: (String) -> Unit,
    onFilterChange: (FavoritesFilter) -> Unit,
    onSortModeChange: (FavoritesSortMode.Mode) -> Unit,
    onClearFilters: () -> Unit,
    onChooseOnMap: () -> Unit,
    onApply: (LibraryItemWithContent) -> Unit,
    onRename: (LibraryItemWithContent) -> Unit,
    onEdit: (LibraryItemWithContent) -> Unit,
    onMove: (LibraryItemWithContent, Int) -> Unit,
    onDelete: (LibraryItemWithContent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val indicesById = remember(items) { items.mapIndexed { index, item -> item.item.id to index }.toMap() }
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        LazyColumn(
            modifier = Modifier.widthIn(max = 840.dp).fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "header") {
                KestrelScreenHeader(
                    title = "Favorites",
                    subtitle = "Saved points and routes, ready to use again.",
                )
            }
            if (!loading && items.isNotEmpty()) {
                item(key = "controls") {
                    FavoritesToolbar(
                        query = query,
                        selectedFilter = selectedFilter,
                        sortMode = sortMode,
                        resultCount = visibleItems.size,
                        totalCount = items.size,
                        busy = operationBusy,
                        onQueryChange = onQueryChange,
                        onFilterChange = onFilterChange,
                        onSortModeChange = onSortModeChange,
                    )
                }
            }
            when {
                loading -> item(key = "loading") { FavoritesLoading() }
                items.isEmpty() ->
                    item(key = "empty") {
                        FavoritesEmptyResults(emptyLibrary = true, onAction = onChooseOnMap)
                    }
                visibleItems.isEmpty() ->
                    item(key = "no-matches") {
                        FavoritesEmptyResults(emptyLibrary = false, onAction = onClearFilters)
                    }
                else ->
                    itemsIndexed(visibleItems, key = { _, item -> "favorite:${item.item.id}" }) { index, item ->
                        val previousIndex =
                            visibleItems
                                .getOrNull(index - 1)
                                ?.item
                                ?.id
                                ?.let(indicesById::get)
                        val nextIndex =
                            visibleItems
                                .getOrNull(index + 1)
                                ?.item
                                ?.id
                                ?.let(indicesById::get)
                        FavoriteRow(
                            item = item,
                            enabled = !operationBusy,
                            canReorder = sortMode == FavoritesSortMode.Mode.Manual,
                            canMoveUp = previousIndex != null,
                            canMoveDown = nextIndex != null,
                            onApply = { onApply(item) },
                            onRename = { onRename(item) },
                            onEdit = { onEdit(item) },
                            onMoveUp = { previousIndex?.let { onMove(item, it) } },
                            onMoveDown = { nextIndex?.let { onMove(item, it) } },
                            onDelete = { onDelete(item) },
                        )
                    }
            }
        }
        FavoritesFeedback(
            message = operationError ?: operationMessage,
            isError = operationError != null,
            modifier = Modifier.align(Alignment.BottomCenter).widthIn(max = 840.dp).padding(16.dp),
        )
    }
}

@Composable
private fun FavoritesFeedback(
    message: String?,
    isError: Boolean,
    modifier: Modifier = Modifier,
) {
    val hostState = remember { SnackbarHostState() }
    LaunchedEffect(message, isError) {
        hostState.currentSnackbarData?.dismiss()
        message?.let {
            hostState.showSnackbar(
                message = it,
                withDismissAction = true,
                duration = if (isError) SnackbarDuration.Indefinite else SnackbarDuration.Short,
            )
        }
    }
    SnackbarHost(hostState = hostState, modifier = modifier) { data ->
        Snackbar(
            snackbarData = data,
            modifier =
                Modifier.semantics {
                    liveRegion = if (isError) LiveRegionMode.Assertive else LiveRegionMode.Polite
                },
        )
    }
}

@Composable
private fun FavoritesLoading() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CircularProgressIndicator()
        Text("Loading Favorites…")
    }
}

@Composable
private fun FavoritesEmptyResults(
    emptyLibrary: Boolean,
    onAction: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        KestrelEmptyState(
            icon = if (emptyLibrary) Icons.Outlined.StarBorder else Icons.Filled.Search,
            title = if (emptyLibrary) "No favorites yet" else "No matching Favorites",
            message =
                if (emptyLibrary) {
                    "Choose a point or route on the map, then save its preview."
                } else {
                    "Try another name or clear your search and filters."
                },
        )
        Button(onClick = onAction) {
            Text(if (emptyLibrary) "Choose on map" else "Clear search and filters")
        }
    }
}
