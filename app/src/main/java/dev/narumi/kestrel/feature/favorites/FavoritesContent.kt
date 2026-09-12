package dev.narumi.kestrel.feature.favorites

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.core.library.globalIndexIn
import dev.narumi.kestrel.core.library.label
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
                        val previousIndex = visibleItems.getOrNull(index - 1)?.globalIndexIn(items)
                        val nextIndex = visibleItems.getOrNull(index + 1)?.globalIndexIn(items)
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
internal fun FavoritesToolbar(
    query: String,
    selectedFilter: FavoritesFilter,
    sortMode: FavoritesSortMode.Mode,
    resultCount: Int,
    totalCount: Int,
    busy: Boolean,
    onQueryChange: (String) -> Unit,
    onFilterChange: (FavoritesFilter) -> Unit,
    onSortModeChange: (FavoritesSortMode.Mode) -> Unit,
) {
    val keyboard = LocalSoftwareKeyboardController.current
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Search Favorites") },
            placeholder = { Text("Point or route name") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = {
                if (query.isNotEmpty()) {
                    IconButton(onClick = { onQueryChange("") }) {
                        Icon(Icons.Filled.Close, contentDescription = "Clear search")
                    }
                }
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { keyboard?.hide() }),
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FavoritesFilter.entries.forEach { filter ->
                FilterChip(
                    selected = filter == selectedFilter,
                    onClick = { onFilterChange(filter) },
                    label = { Text(filter.label()) },
                )
            }
        }
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            itemVerticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = "$resultCount of $totalCount Favorites",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            FavoritesSortMenu(sortMode = sortMode, enabled = !busy, onSortModeChange = onSortModeChange)
        }
    }
}

@Composable
private fun FavoritesSortMenu(
    sortMode: FavoritesSortMode.Mode,
    enabled: Boolean,
    onSortModeChange: (FavoritesSortMode.Mode) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        TextButton(onClick = { expanded = true }, enabled = enabled) {
            Text("Sort: ${sortMode.label()}")
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            FavoritesSortMode.Mode.entries.forEach { mode ->
                DropdownMenuItem(
                    text = { Text(mode.label()) },
                    enabled = enabled,
                    modifier =
                        Modifier.semantics {
                            stateDescription = if (mode == sortMode) "Selected" else "Not selected"
                        },
                    trailingIcon = {
                        if (mode == sortMode) Icon(Icons.Filled.Check, contentDescription = null)
                    },
                    onClick = {
                        expanded = false
                        if (mode != sortMode) onSortModeChange(mode)
                    },
                )
            }
        }
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
