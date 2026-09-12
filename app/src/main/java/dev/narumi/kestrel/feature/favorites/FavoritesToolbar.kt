package dev.narumi.kestrel.feature.favorites

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.library.label

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun FavoritesToolbar(
    selectedFilter: FavoritesFilter,
    sortMode: FavoritesSortMode.Mode,
    operationBusy: Boolean,
    onFilterChange: (FavoritesFilter) -> Unit,
    onSortModeChange: (FavoritesSortMode.Mode) -> Unit,
) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FavoritesMenu(
            label = "Show: ${selectedFilter.label()}",
            options = FavoritesFilter.entries,
            selected = selectedFilter,
            optionLabel = { it.label() },
            onSelect = onFilterChange,
        )
        FavoritesMenu(
            label = "Sort by: ${sortMode.label()}",
            options = FavoritesSortMode.Mode.entries,
            selected = sortMode,
            optionLabel = { it.label() },
            enabled = !operationBusy,
            onSelect = onSortModeChange,
        )
    }
}

@Composable
private fun <T> FavoritesMenu(
    label: String,
    options: List<T>,
    selected: T,
    optionLabel: (T) -> String,
    enabled: Boolean = true,
    onSelect: (T) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        TextButton(
            onClick = { expanded = true },
            enabled = enabled,
            modifier = Modifier.heightIn(min = 48.dp),
        ) {
            Text(label)
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(optionLabel(option)) },
                    modifier = Modifier.semantics { this.selected = option == selected },
                    enabled = enabled,
                    trailingIcon = {
                        if (option == selected) Icon(Icons.Filled.Check, contentDescription = null)
                    },
                    onClick = {
                        expanded = false
                        if (option != selected) onSelect(option)
                    },
                )
            }
        }
    }
}
