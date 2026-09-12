package dev.narumi.kestrel.feature.favorites

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.library.label

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
                text = "$resultCount of $totalCount ${if (totalCount == 1) "Favorite" else "Favorites"}",
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
