package dev.narumi.kestrel.feature.favorites

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.i18n.displayNumber
import dev.narumi.kestrel.core.library.label
import dev.narumi.kestrel.ui.components.KestrelIcon
import dev.narumi.kestrel.ui.components.KestrelIcons

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
    val resources = LocalResources.current
    val context = LocalContext.current
    val keyboard = LocalSoftwareKeyboardController.current
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = resources.getString(R.string.search_favorites) },
            placeholder = { Text(stringResource(R.string.search_favorites)) },
            shape = MaterialTheme.shapes.large,
            colors =
                OutlinedTextFieldDefaults.colors(
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                ),
            leadingIcon = { KestrelIcon(KestrelIcons.Search, contentDescription = null) },
            trailingIcon = {
                if (query.isNotEmpty()) {
                    IconButton(onClick = { onQueryChange("") }) {
                        KestrelIcon(KestrelIcons.Dismiss, contentDescription = resources.getString(R.string.clear_search))
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
                    label = { Text(stringResource(filter.label())) },
                    leadingIcon = {
                        if (filter == selectedFilter) {
                            KestrelIcon(KestrelIcons.Confirm, contentDescription = null)
                        }
                    },
                    shape = MaterialTheme.shapes.medium,
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
                text = resources.getQuantityString(R.plurals.favorite_result_count, totalCount, context.displayNumber(resultCount, 0), context.displayNumber(totalCount, 0)),
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
    val resources = LocalResources.current
    val context = LocalContext.current
    var expanded by remember { mutableStateOf(false) }
    Box {
        TextButton(onClick = { expanded = true }, enabled = enabled) {
            Text(resources.getString(R.string.sort_1_s, resources.getString(sortMode.label())))
            KestrelIcon(KestrelIcons.Sort, contentDescription = null)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            FavoritesSortMode.Mode.entries.forEach { mode ->
                DropdownMenuItem(
                    text = { Text(resources.getString(mode.label())) },
                    enabled = enabled,
                    modifier =
                        Modifier.semantics {
                            stateDescription = if (mode == sortMode) resources.getString(R.string.selected) else resources.getString(R.string.not_selected)
                        },
                    trailingIcon = {
                        if (mode == sortMode) {
                            KestrelIcon(KestrelIcons.Confirm, contentDescription = null)
                        }
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
