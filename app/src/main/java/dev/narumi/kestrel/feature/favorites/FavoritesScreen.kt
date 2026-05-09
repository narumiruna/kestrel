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
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.compose.runtime.LaunchedEffect
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
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.library.LibraryItemKind
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.core.library.LibraryRepository
import dev.narumi.kestrel.core.library.description
import dev.narumi.kestrel.core.library.globalIndexIn
import dev.narumi.kestrel.core.library.label
import dev.narumi.kestrel.core.library.sortedFor
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.parseCoordInput
import kotlinx.coroutines.launch

@Suppress("LongMethod")
@Composable
fun FavoritesScreen(
    modifier: Modifier = Modifier,
    onApplyToMap: (LibraryItemWithContent) -> Unit = {},
) {
    val context = LocalContext.current
    val prefs = remember { KestrelPrefs(context) }
    val libraryRepository = remember { LibraryRepository.getInstance(context) }
    val scope = rememberCoroutineScope()

    val items by libraryRepository.items.collectAsStateWithLifecycle(emptyList())
    val sortMode by libraryRepository.sortMode.collectAsStateWithLifecycle(FavoritesSortMode())
    val startup by prefs.startupPreference.collectAsStateWithLifecycle(StartupPreference())
    var selectedTab by remember { mutableStateOf(0) }
    var editingName by remember { mutableStateOf<LibraryItemWithContent?>(null) }
    var editingPoint by remember { mutableStateOf<LibraryItemWithContent?>(null) }
    var editingRoute by remember { mutableStateOf<LibraryItemWithContent?>(null) }
    var renameText by remember { mutableStateOf("") }
    var pointText by remember { mutableStateOf("") }
    var routeSpeedText by remember { mutableStateOf("") }
    var routeMode by remember { mutableStateOf(MovementEngine.Mode.Once) }

    LaunchedEffect(Unit) {
        libraryRepository.ensureMigrated()
    }

    val visibleItems =
        items
            .filter { if (selectedTab == 0) it.kind == LibraryItemKind.Place else it.kind == LibraryItemKind.Route }
            .sortedFor(sortMode.mode)

    FavoriteEditDialogs(
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
        onRenameConfirm = { item ->
            scope.launch { libraryRepository.renameItem(item.item.id, renameText.trim()) }
            editingName = null
            renameText = ""
        },
        onPointConfirm = { item, point ->
            item.item.placeId?.let { placeId ->
                scope.launch { libraryRepository.updatePlace(placeId, point.lat, point.lng) }
            }
            editingPoint = null
            pointText = ""
        },
        onRouteConfirm = { item, speed, mode ->
            item.item.routeId?.let { routeId ->
                scope.launch { libraryRepository.updateRouteParams(routeId, speed, mode.name) }
            }
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
        items = items,
        visibleItems = visibleItems,
        selectedTab = selectedTab,
        sortMode = sortMode.mode,
        onTabChange = { selectedTab = it },
        onSortModeChange = { mode -> scope.launch { libraryRepository.setSortMode(mode) } },
        onApply = onApplyToMap,
        onRename = { item ->
            editingName = item
            renameText = item.name
        },
        onEdit = { item ->
            if (item.kind == LibraryItemKind.Place) {
                item.place?.let { place ->
                    editingPoint = item
                    pointText = "%.5f, %.5f".format(place.lat, place.lng)
                }
            } else {
                item.route?.let { route ->
                    editingRoute = item
                    routeSpeedText = route.defaultSpeedKmh.toString()
                    routeMode =
                        runCatching { MovementEngine.Mode.valueOf(route.mode) }
                            .getOrDefault(MovementEngine.Mode.Once)
                }
            }
        },
        onMove = { item, toIndex -> scope.launch { libraryRepository.reorderItem(item.item.id, toIndex) } },
        onDelete = { item ->
            scope.launch {
                libraryRepository.removeItem(item.item.id)
                if (
                    startup.mode == StartupPreference.Mode.Favorite &&
                    (startup.libraryItemId == item.item.id ||
                        (startup.libraryItemId == null && startup.favoriteName == item.name))
                ) {
                    prefs.setStartupPreference(StartupPreference(StartupPreference.Mode.Last))
                }
            }
        },
    )
}

@Suppress("LongParameterList")
@Composable
private fun FavoriteEditDialogs(
    editingName: LibraryItemWithContent?,
    renameText: String,
    editingPoint: LibraryItemWithContent?,
    pointText: String,
    editingRoute: LibraryItemWithContent?,
    routeSpeedText: String,
    routeMode: MovementEngine.Mode,
    onRenameTextChange: (String) -> Unit,
    onPointTextChange: (String) -> Unit,
    onRouteSpeedTextChange: (String) -> Unit,
    onRouteModeChange: (MovementEngine.Mode) -> Unit,
    onRenameConfirm: (LibraryItemWithContent) -> Unit,
    onPointConfirm: (LibraryItemWithContent, LatLng) -> Unit,
    onRouteConfirm: (LibraryItemWithContent, Double, MovementEngine.Mode) -> Unit,
    onRenameDismiss: () -> Unit,
    onPointDismiss: () -> Unit,
    onRouteDismiss: () -> Unit,
) {
    editingName?.let { item ->
        RenameFavoriteDialog(
            name = renameText,
            onNameChange = onRenameTextChange,
            onConfirm = { onRenameConfirm(item) },
            onDismiss = onRenameDismiss,
        )
    }
    editingPoint?.let { item ->
        EditPointDialog(
            input = pointText,
            onInputChange = onPointTextChange,
            onConfirm = { onPointConfirm(item, it) },
            onDismiss = onPointDismiss,
        )
    }
    editingRoute?.let { item ->
        EditRouteDialog(
            speedText = routeSpeedText,
            routeMode = routeMode,
            onSpeedTextChange = onRouteSpeedTextChange,
            onRouteModeChange = onRouteModeChange,
            onConfirm = { speed, mode -> onRouteConfirm(item, speed, mode) },
            onDismiss = onRouteDismiss,
        )
    }
}

@Suppress("LongParameterList")
@Composable
private fun FavoritesContent(
    modifier: Modifier,
    items: List<LibraryItemWithContent>,
    visibleItems: List<LibraryItemWithContent>,
    selectedTab: Int,
    sortMode: FavoritesSortMode.Mode,
    onTabChange: (Int) -> Unit,
    onSortModeChange: (FavoritesSortMode.Mode) -> Unit,
    onApply: (LibraryItemWithContent) -> Unit,
    onRename: (LibraryItemWithContent) -> Unit,
    onEdit: (LibraryItemWithContent) -> Unit,
    onMove: (LibraryItemWithContent, Int) -> Unit,
    onDelete: (LibraryItemWithContent) -> Unit,
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
            items.isEmpty() ->
                EmptyFavorites(
                    title = "No favorites yet",
                    message = "Long-press a spot on the map, or save a route from the map controls.",
                )
            else ->
                FavoritesListContent(
                    items = items,
                    visibleItems = visibleItems,
                    selectedTab = selectedTab,
                    sortMode = sortMode,
                    onTabChange = onTabChange,
                    onSortModeChange = onSortModeChange,
                    onApply = onApply,
                    onRename = onRename,
                    onEdit = onEdit,
                    onMove = onMove,
                    onDelete = onDelete,
                )
        }
    }
}

@Suppress("LongParameterList")
@Composable
private fun FavoritesListContent(
    items: List<LibraryItemWithContent>,
    visibleItems: List<LibraryItemWithContent>,
    selectedTab: Int,
    sortMode: FavoritesSortMode.Mode,
    onTabChange: (Int) -> Unit,
    onSortModeChange: (FavoritesSortMode.Mode) -> Unit,
    onApply: (LibraryItemWithContent) -> Unit,
    onRename: (LibraryItemWithContent) -> Unit,
    onEdit: (LibraryItemWithContent) -> Unit,
    onMove: (LibraryItemWithContent, Int) -> Unit,
    onDelete: (LibraryItemWithContent) -> Unit,
) {
    PrimaryTabRow(selectedTabIndex = selectedTab) {
        Tab(selected = selectedTab == 0, onClick = { onTabChange(0) }, text = { Text("Points") })
        Tab(selected = selectedTab == 1, onClick = { onTabChange(1) }, text = { Text("Routes") })
    }
    SortModeMenu(sortMode = sortMode, onSortModeChange = onSortModeChange)
    if (visibleItems.isEmpty()) {
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
                itemsIndexed(visibleItems, key = { _, item -> item.item.id }) { index, item ->
                    val previousIndex = visibleItems.getOrNull(index - 1)?.globalIndexIn(items)
                    val nextIndex = visibleItems.getOrNull(index + 1)?.globalIndexIn(items)
                    FavoriteRow(
                        item = item,
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
    item: LibraryItemWithContent,
    canReorder: Boolean,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onApply: () -> Unit,
    onRename: () -> Unit,
    onEdit: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onDelete: () -> Unit,
) {
    var menuExpanded by remember { mutableStateOf(false) }
    ListItem(
        headlineContent = { Text(item.name) },
        supportingContent = { Text(item.description()) },
        trailingContent = {
            Row {
                TextButton(onClick = onApply) { Text("Apply") }
                Box {
                    IconButton(onClick = { menuExpanded = true }) {
                        Icon(Icons.Filled.MoreVert, contentDescription = "More actions for ${item.name}")
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
                            text = { Text(if (item.kind == LibraryItemKind.Place) "Edit coordinates" else "Edit route") },
                            onClick = {
                                menuExpanded = false
                                onEdit()
                            },
                        )
                        if (canReorder) {
                            DropdownMenuItem(
                                text = { Text("Move up") },
                                enabled = canMoveUp,
                                onClick = {
                                    menuExpanded = false
                                    onMoveUp()
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Move down") },
                                enabled = canMoveDown,
                                onClick = {
                                    menuExpanded = false
                                    onMoveDown()
                                },
                            )
                        }
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
    onNameChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val invalid = name.trim().isEmpty()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Rename favorite") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = onNameChange,
                label = { Text("Name") },
                supportingText = { Text("Duplicate names are allowed; identity stays stable.") },
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

private fun MovementEngine.Mode.label(): String =
    when (this) {
        MovementEngine.Mode.Once -> "Once"
        MovementEngine.Mode.Loop -> "Loop"
        MovementEngine.Mode.PingPong -> "Ping-pong"
    }
