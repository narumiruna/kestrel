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
import androidx.compose.material.icons.filled.MoreVert
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
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.parseCoordInput
import kotlinx.coroutines.launch

@Suppress("LongMethod")
@Composable
fun FavoritesScreen(
    modifier: Modifier = Modifier,
    onApplyToMap: (Favorite) -> Unit = {},
) {
    val context = LocalContext.current
    val prefs = remember { KestrelPrefs(context) }
    val scope = rememberCoroutineScope()

    val favorites by prefs.favorites.collectAsStateWithLifecycle(emptyList())
    val sortMode by prefs.favoritesSortMode.collectAsStateWithLifecycle(FavoritesSortMode())
    val startup by prefs.startupPreference.collectAsStateWithLifecycle(StartupPreference())
    var selectedTab by remember { mutableStateOf(0) }
    var editingName by remember { mutableStateOf<Favorite?>(null) }
    var editingPoint by remember { mutableStateOf<Favorite?>(null) }
    var editingRoute by remember { mutableStateOf<Favorite?>(null) }
    var renameText by remember { mutableStateOf("") }
    var pointText by remember { mutableStateOf("") }
    var routeSpeedText by remember { mutableStateOf("") }
    var routeMode by remember { mutableStateOf(MovementEngine.Mode.Once) }
    val visibleFavorites =
        favorites
            .filter { if (selectedTab == 0) !it.isRoute else it.isRoute }
            .sortedFor(sortMode.mode)

    FavoriteEditDialogs(
        favorites = favorites,
        editingName = editingName,
        renameText = renameText,
        editingPoint = editingPoint,
        pointText = pointText,
        editingRoute = editingRoute,
        routeSpeedText = routeSpeedText,
        routeMode = routeMode,
        onRenameTextChange = { renameText = it },
        onPointTextChange = { pointText = it },
        onRouteSpeedTextChange = { routeSpeedText = it },
        onRouteModeChange = { routeMode = it },
        onRenameConfirm = { favorite ->
            scope.launch { prefs.renameFavorite(favorite.name, renameText.trim()) }
            editingName = null
            renameText = ""
        },
        onPointConfirm = { favorite, point ->
            scope.launch { prefs.updateFavoritePoint(favorite.name, point.lat, point.lng) }
            editingPoint = null
            pointText = ""
        },
        onRouteConfirm = { favorite, speed, mode ->
            scope.launch { prefs.updateFavoriteRouteParams(favorite.name, speed, mode.name) }
            editingRoute = null
            routeSpeedText = ""
        },
        onRenameDismiss = {
            editingName = null
            renameText = ""
        },
        onPointDismiss = {
            editingPoint = null
            pointText = ""
        },
        onRouteDismiss = {
            editingRoute = null
            routeSpeedText = ""
        },
    )

    FavoritesContent(
        modifier = modifier,
        favorites = favorites,
        visibleFavorites = visibleFavorites,
        selectedTab = selectedTab,
        sortMode = sortMode.mode,
        onTabChange = { selectedTab = it },
        onSortModeChange = { mode -> scope.launch { prefs.setFavoritesSortMode(mode) } },
        onApply = onApplyToMap,
        onRename = { fav ->
            editingName = fav
            renameText = fav.name
        },
        onEdit = { fav ->
            if (fav.route == null) {
                editingPoint = fav
                pointText = "%.5f, %.5f".format(fav.lat, fav.lng)
            } else {
                editingRoute = fav
                routeSpeedText = fav.route.speedKmh.toString()
                routeMode =
                    runCatching { MovementEngine.Mode.valueOf(fav.route.mode) }
                        .getOrDefault(MovementEngine.Mode.Once)
            }
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
private fun FavoriteEditDialogs(
    favorites: List<Favorite>,
    editingName: Favorite?,
    renameText: String,
    editingPoint: Favorite?,
    pointText: String,
    editingRoute: Favorite?,
    routeSpeedText: String,
    routeMode: MovementEngine.Mode,
    onRenameTextChange: (String) -> Unit,
    onPointTextChange: (String) -> Unit,
    onRouteSpeedTextChange: (String) -> Unit,
    onRouteModeChange: (MovementEngine.Mode) -> Unit,
    onRenameConfirm: (Favorite) -> Unit,
    onPointConfirm: (Favorite, LatLng) -> Unit,
    onRouteConfirm: (Favorite, Double, MovementEngine.Mode) -> Unit,
    onRenameDismiss: () -> Unit,
    onPointDismiss: () -> Unit,
    onRouteDismiss: () -> Unit,
) {
    editingName?.let { favorite ->
        RenameFavoriteDialog(
            name = renameText,
            nameExists = favorites.any { it.name == renameText.trim() && it.name != favorite.name },
            onNameChange = onRenameTextChange,
            onConfirm = { onRenameConfirm(favorite) },
            onDismiss = onRenameDismiss,
        )
    }
    editingPoint?.let { favorite ->
        EditPointDialog(
            input = pointText,
            onInputChange = onPointTextChange,
            onConfirm = { onPointConfirm(favorite, it) },
            onDismiss = onPointDismiss,
        )
    }
    editingRoute?.let { favorite ->
        EditRouteDialog(
            speedText = routeSpeedText,
            routeMode = routeMode,
            onSpeedTextChange = onRouteSpeedTextChange,
            onRouteModeChange = onRouteModeChange,
            onConfirm = { speed, mode -> onRouteConfirm(favorite, speed, mode) },
            onDismiss = onRouteDismiss,
        )
    }
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
    onApply: (Favorite) -> Unit,
    onRename: (Favorite) -> Unit,
    onEdit: (Favorite) -> Unit,
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
                    onApply = onApply,
                    onRename = onRename,
                    onEdit = onEdit,
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
    onApply: (Favorite) -> Unit,
    onRename: (Favorite) -> Unit,
    onEdit: (Favorite) -> Unit,
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
                        onApply = { onApply(fav) },
                        onRename = { onRename(fav) },
                        onEdit = { onEdit(fav) },
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
            Text(text = title, style = MaterialTheme.typography.titleMedium)
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
    onApply: () -> Unit,
    onRename: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    var menuExpanded by remember { mutableStateOf(false) }
    ListItem(
        headlineContent = { Text(favorite.name) },
        supportingContent = { Text(favorite.description()) },
        trailingContent = {
            Row {
                TextButton(onClick = onApply) { Text("Apply") }
                Box {
                    IconButton(onClick = { menuExpanded = true }) {
                        Icon(Icons.Filled.MoreVert, contentDescription = "More actions for ${favorite.name}")
                    }
                    DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false },
                    ) {
                        DropdownMenuItem(
                            text = { Text("Rename") },
                            onClick = {
                                menuExpanded = false
                                onRename()
                            },
                        )
                        DropdownMenuItem(
                            text = { Text(if (favorite.route == null) "Edit coordinates" else "Edit route") },
                            onClick = {
                                menuExpanded = false
                                onEdit()
                            },
                        )
                        DropdownMenuItem(
                            text = { Text("Delete") },
                            onClick = {
                                menuExpanded = false
                                onDelete()
                            },
                        )
                    }
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
            TextButton(enabled = !invalid, onClick = onConfirm) { Text("Rename") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun EditPointDialog(
    input: String,
    onInputChange: (String) -> Unit,
    onConfirm: (LatLng) -> Unit,
    onDismiss: () -> Unit,
) {
    val parsed = parseCoordInput(input)
    val showInvalid = input.isNotBlank() && parsed == null
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit coordinates") },
        text = {
            OutlinedTextField(
                value = input,
                onValueChange = onInputChange,
                label = { Text("Coordinates") },
                supportingText = {
                    if (showInvalid) Text("Enter a valid lat/lng in range.")
                },
                isError = showInvalid,
                singleLine = true,
            )
        },
        confirmButton = {
            TextButton(enabled = parsed != null, onClick = { parsed?.let(onConfirm) }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun EditRouteDialog(
    speedText: String,
    routeMode: MovementEngine.Mode,
    onSpeedTextChange: (String) -> Unit,
    onRouteModeChange: (MovementEngine.Mode) -> Unit,
    onConfirm: (Double, MovementEngine.Mode) -> Unit,
    onDismiss: () -> Unit,
) {
    val speed = speedText.toDoubleOrNull()
    val valid = speed != null && speed > 0
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit route") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = speedText,
                    onValueChange = { v -> onSpeedTextChange(v.filter { it.isDigit() || it == '.' }) },
                    label = { Text("Speed (km/h)") },
                    isError = speedText.isNotBlank() && !valid,
                    singleLine = true,
                )
                MovementEngine.Mode.entries.forEach { mode ->
                    TextButton(onClick = { onRouteModeChange(mode) }) {
                        Text(if (mode == routeMode) "✓ ${mode.label()}" else mode.label())
                    }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = valid, onClick = { speed?.let { onConfirm(it, routeMode) } }) { Text("Save") }
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

private fun MovementEngine.Mode.label(): String =
    when (this) {
        MovementEngine.Mode.Once -> "Once"
        MovementEngine.Mode.Loop -> "Loop"
        MovementEngine.Mode.PingPong -> "Ping-pong"
    }
