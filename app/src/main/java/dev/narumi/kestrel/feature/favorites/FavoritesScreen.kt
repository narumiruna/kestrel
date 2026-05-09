package dev.narumi.kestrel.feature.favorites

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.narumi.kestrel.core.data.Favorite
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.StartupPreference
import kotlinx.coroutines.launch

@Composable
fun FavoritesScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val prefs = remember { KestrelPrefs(context) }
    val scope = rememberCoroutineScope()

    val favorites by prefs.favorites.collectAsStateWithLifecycle(emptyList())
    val sortMode by prefs.favoritesSortMode.collectAsStateWithLifecycle(FavoritesSortMode())
    val startup by prefs.startupPreference.collectAsStateWithLifecycle(StartupPreference())
    var selectedTab by remember { mutableStateOf(0) }
    var editingFavorite by remember { mutableStateOf<Favorite?>(null) }
    var renameText by remember { mutableStateOf("") }
    val visibleFavorites =
        favorites
            .filter { if (selectedTab == 0) !it.isRoute else it.isRoute }
            .sortedFor(sortMode.mode)

    editingFavorite?.let { favorite ->
        RenameFavoriteDialog(
            name = renameText,
            nameExists = favorites.any { it.name == renameText.trim() && it.name != favorite.name },
            onNameChange = { renameText = it },
            onConfirm = {
                val newName = renameText.trim()
                scope.launch { prefs.renameFavorite(favorite.name, newName) }
                editingFavorite = null
                renameText = ""
            },
            onDismiss = {
                editingFavorite = null
                renameText = ""
            },
        )
    }

    FavoritesContent(
        modifier = modifier,
        favorites = favorites,
        visibleFavorites = visibleFavorites,
        selectedTab = selectedTab,
        sortMode = sortMode.mode,
        onTabChange = { selectedTab = it },
        onSortModeChange = { mode -> scope.launch { prefs.setFavoritesSortMode(mode) } },
        onRename = { fav ->
            editingFavorite = fav
            renameText = fav.name
        },
        onDelete = { fav ->
            scope.launch {
                prefs.removeFavorite(fav.name)
                if (startup.mode == StartupPreference.Mode.Favorite && startup.favoriteName == fav.name) {
                    prefs.setStartupPreference(StartupPreference(StartupPreference.Mode.Last))
                }
            }
        },
    )
}

@Suppress("LongParameterList")
@Composable
private fun FavoritesContent(
    modifier: Modifier,
    favorites: List<Favorite>,
    visibleFavorites: List<Favorite>,
    selectedTab: Int,
    sortMode: FavoritesSortMode.Mode,
    onTabChange: (Int) -> Unit,
    onSortModeChange: (FavoritesSortMode.Mode) -> Unit,
    onRename: (Favorite) -> Unit,
    onDelete: (Favorite) -> Unit,
) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Favorites", style = MaterialTheme.typography.titleMedium)
        when {
            favorites.isEmpty() ->
                EmptyFavorites(
                    title = "No favorites yet",
                    message = "Long-press a spot on the map, or save a route from the map controls.",
                )
            else ->
                FavoritesListContent(
                    visibleFavorites = visibleFavorites,
                    selectedTab = selectedTab,
                    sortMode = sortMode,
                    onTabChange = onTabChange,
                    onSortModeChange = onSortModeChange,
                    onRename = onRename,
                    onDelete = onDelete,
                )
        }
    }
}

@Suppress("LongParameterList")
@Composable
private fun FavoritesListContent(
    visibleFavorites: List<Favorite>,
    selectedTab: Int,
    sortMode: FavoritesSortMode.Mode,
    onTabChange: (Int) -> Unit,
    onSortModeChange: (FavoritesSortMode.Mode) -> Unit,
    onRename: (Favorite) -> Unit,
    onDelete: (Favorite) -> Unit,
) {
    PrimaryTabRow(selectedTabIndex = selectedTab) {
        Tab(selected = selectedTab == 0, onClick = { onTabChange(0) }, text = { Text("Points") })
        Tab(selected = selectedTab == 1, onClick = { onTabChange(1) }, text = { Text("Routes") })
    }
    SortModeMenu(sortMode = sortMode, onSortModeChange = onSortModeChange)
    if (visibleFavorites.isEmpty()) {
        EmptyFavorites(
            title = if (selectedTab == 0) "No point favorites" else "No route favorites",
            message =
                if (selectedTab == 0) {
                    "Long-press a map spot to save a point."
                } else {
                    "Generate or draw a route, then save it from the map controls."
                },
        )
    } else {
        Card(modifier = Modifier.fillMaxWidth()) {
            LazyColumn {
                items(visibleFavorites, key = { it.name }) { fav ->
                    FavoriteRow(
                        favorite = fav,
                        onRename = { onRename(fav) },
                        onDelete = { onDelete(fav) },
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun EmptyFavorites(
    title: String,
    message: String,
) {
    Box(modifier = Modifier.fillMaxWidth().padding(top = 32.dp)) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Outlined.StarBorder,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.outline,
                modifier = Modifier.size(48.dp),
            )
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun SortModeMenu(
    sortMode: FavoritesSortMode.Mode,
    onSortModeChange: (FavoritesSortMode.Mode) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        TextButton(onClick = { expanded = true }) {
            Text("Sort: ${sortMode.label()}")
            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            FavoritesSortMode.Mode.entries.forEach { mode ->
                DropdownMenuItem(
                    text = { Text(mode.label()) },
                    onClick = {
                        onSortModeChange(mode)
                        expanded = false
                    },
                )
            }
        }
    }
}

@Composable
private fun FavoriteRow(
    favorite: Favorite,
    onRename: () -> Unit,
    onDelete: () -> Unit,
) {
    ListItem(
        headlineContent = { Text(favorite.name) },
        supportingContent = { Text(favorite.description()) },
        trailingContent = {
            Row {
                IconButton(onClick = onRename) {
                    Icon(
                        imageVector = Icons.Filled.Edit,
                        contentDescription = "Rename ${favorite.name}",
                    )
                }
                IconButton(onClick = onDelete) {
                    Icon(
                        imageVector = Icons.Filled.Delete,
                        contentDescription = "Delete ${favorite.name}",
                    )
                }
            }
        },
    )
}

@Composable
private fun RenameFavoriteDialog(
    name: String,
    nameExists: Boolean,
    onNameChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val trimmed = name.trim()
    val invalid = trimmed.isEmpty() || nameExists
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Rename favorite") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = onNameChange,
                label = { Text("Name") },
                supportingText = {
                    if (nameExists) Text("A favorite with this name already exists.")
                },
                isError = nameExists,
                singleLine = true,
            )
        },
        confirmButton = {
            TextButton(
                enabled = !invalid,
                onClick = onConfirm,
            ) { Text("Rename") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

private fun Favorite.description(): String {
    val route = route
    return if (route == null) {
        "%.5f, %.5f".format(lat, lng)
    } else {
        "Route · ${route.lats.size} waypoints · ${route.speedKmh.toInt()} km/h · ${route.mode}"
    }
}

private fun List<Favorite>.sortedFor(sortMode: FavoritesSortMode.Mode): List<Favorite> =
    when (sortMode) {
        FavoritesSortMode.Mode.Manual -> this
        FavoritesSortMode.Mode.Recent -> sortedByDescending { it.lastUsedAt ?: Long.MIN_VALUE }
        FavoritesSortMode.Mode.Alphabetical -> sortedBy { it.name.lowercase() }
    }

private fun FavoritesSortMode.Mode.label(): String =
    when (this) {
        FavoritesSortMode.Mode.Manual -> "Manual"
        FavoritesSortMode.Mode.Recent -> "Recent"
        FavoritesSortMode.Mode.Alphabetical -> "Alphabetical"
    }
