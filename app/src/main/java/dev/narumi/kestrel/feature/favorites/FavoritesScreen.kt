package dev.narumi.kestrel.feature.favorites

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
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
import dev.narumi.kestrel.ui.components.KestrelActionRow
import dev.narumi.kestrel.ui.components.KestrelCard
import dev.narumi.kestrel.ui.components.KestrelEmptyState
import dev.narumi.kestrel.ui.components.KestrelScreenHeader
import dev.narumi.kestrel.ui.components.PersistedActionResult
import dev.narumi.kestrel.ui.components.runPersistedAction
import kotlinx.coroutines.launch

@Suppress("LongMethod")
@Composable
fun FavoritesScreen(
    modifier: Modifier = Modifier,
    onApplyToMap: (LibraryItemWithContent) -> Unit = {},
    onChooseOnMap: () -> Unit = {},
) {
    val context = LocalContext.current
    val prefs = remember { KestrelPrefs(context) }
    val libraryRepository = remember { LibraryRepository.getInstance(context) }
    val scope = rememberCoroutineScope()

    val loadedItems by
        libraryRepository.items.collectAsStateWithLifecycle(initialValue = null)
    val items = loadedItems.orEmpty()
    val sortMode by libraryRepository.sortMode.collectAsStateWithLifecycle(FavoritesSortMode())
    val startup by prefs.startupPreference.collectAsStateWithLifecycle(StartupPreference())
    var selectedFilter by remember { mutableStateOf(FavoritesFilter.All) }
    var editingName by remember { mutableStateOf<LibraryItemWithContent?>(null) }
    var editingPoint by remember { mutableStateOf<LibraryItemWithContent?>(null) }
    var editingRoute by remember { mutableStateOf<LibraryItemWithContent?>(null) }
    var deletingItem by remember { mutableStateOf<LibraryItemWithContent?>(null) }
    var renameText by remember { mutableStateOf("") }
    var pointText by remember { mutableStateOf("") }
    var routeSpeedText by remember { mutableStateOf("") }
    var routeMode by remember { mutableStateOf(MovementEngine.Mode.Once) }
    var operationBusy by remember { mutableStateOf(false) }
    var operationMessage by remember { mutableStateOf<String?>(null) }
    var operationError by remember { mutableStateOf<String?>(null) }

    val visibleItems =
        items
            .filter { selectedFilter.includes(it.kind) }
            .sortedFor(sortMode.mode)

    fun runFavoriteAction(
        successMessage: String,
        onSuccess: () -> Unit = {},
        block: suspend () -> Unit,
    ) {
        if (operationBusy) return
        operationBusy = true
        operationMessage = null
        operationError = null
        scope.launch {
            try {
                when (
                    val result =
                        runPersistedAction(
                            failureMessage =
                                "Could not update Favorites. Your previous saved value is unchanged; try again.",
                            block = block,
                        )
                ) {
                    PersistedActionResult.Success -> {
                        operationMessage = successMessage
                        onSuccess()
                    }
                    is PersistedActionResult.Failure -> operationError = result.message
                }
            } finally {
                operationBusy = false
            }
        }
    }

    deletingItem?.let { item ->
        ConfirmDeleteFavoriteDialog(
            item = item,
            resetsStartup =
                startup.mode == StartupPreference.Mode.Favorite &&
                    startup.libraryItemId == item.item.id,
            synced = item.item.remoteId != null,
            saving = operationBusy,
            error = operationError,
            onConfirm = {
                runFavoriteAction(
                    successMessage = "Deleted ${item.name}.",
                    onSuccess = { deletingItem = null },
                ) {
                    libraryRepository.removeItem(item.item.id)
                }
            },
            onDismiss = { if (!operationBusy) deletingItem = null },
        )
    }

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
        saving = operationBusy,
        error = operationError,
        onRenameConfirm = { item, newName ->
            runFavoriteAction(
                successMessage = "Renamed favorite to ${newName.trim()}.",
                onSuccess = {
                    editingName = null
                    renameText = ""
                },
            ) {
                libraryRepository.renameItem(item.item.id, newName.trim())
            }
        },
        onPointConfirm = { item, point ->
            val placeId = item.item.placeId ?: return@FavoriteEditDialogs
            runFavoriteAction(
                successMessage = "Saved coordinates for ${item.name}.",
                onSuccess = {
                    editingPoint = null
                    pointText = ""
                },
            ) {
                libraryRepository.updatePlace(placeId, point.lat, point.lng)
            }
        },
        onRouteConfirm = { item, speed, mode ->
            val routeId = item.item.routeId ?: return@FavoriteEditDialogs
            runFavoriteAction(
                successMessage = "Saved route settings for ${item.name}.",
                onSuccess = {
                    editingRoute = null
                    routeSpeedText = ""
                },
            ) {
                libraryRepository.updateRouteParams(routeId, speed, mode.name)
            }
        },
        onRenameDismiss = {
            if (!operationBusy) {
                editingName = null
                renameText = ""
                operationError = null
            }
        },
        onPointDismiss = {
            if (!operationBusy) {
                editingPoint = null
                pointText = ""
                operationError = null
            }
        },
        onRouteDismiss = {
            if (!operationBusy) {
                editingRoute = null
                routeSpeedText = ""
                operationError = null
            }
        },
    )

    FavoritesContent(
        modifier = modifier,
        items = items,
        visibleItems = visibleItems,
        loading = loadedItems == null,
        selectedFilter = selectedFilter,
        sortMode = sortMode.mode,
        operationMessage = operationMessage,
        operationError = operationError,
        operationBusy = operationBusy,
        onFilterChange = { selectedFilter = it },
        onSortModeChange = { mode ->
            runFavoriteAction("Sorted Favorites by ${mode.label()}.") {
                libraryRepository.setSortMode(mode)
            }
        },
        onChooseOnMap = onChooseOnMap,
        onApply = onApplyToMap,
        onRename = { item ->
            operationError = null
            editingName = item
            renameText = item.name
        },
        onEdit = { item ->
            operationError = null
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
        onMove = { item, toIndex ->
            runFavoriteAction("Moved ${item.name}.") {
                libraryRepository.reorderItem(item.item.id, toIndex)
            }
        },
        onDelete = { item ->
            operationError = null
            deletingItem = item
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
    saving: Boolean,
    error: String?,
    onRenameTextChange: (String) -> Unit,
    onPointTextChange: (String) -> Unit,
    onRouteSpeedTextChange: (String) -> Unit,
    onRouteModeChange: (MovementEngine.Mode) -> Unit,
    onRenameConfirm: (LibraryItemWithContent, String) -> Unit,
    onPointConfirm: (LibraryItemWithContent, LatLng) -> Unit,
    onRouteConfirm: (LibraryItemWithContent, Double, MovementEngine.Mode) -> Unit,
    onRenameDismiss: () -> Unit,
    onPointDismiss: () -> Unit,
    onRouteDismiss: () -> Unit,
) {
    editingName?.let { item ->
        RenameFavoriteDialog(
            name = renameText,
            saving = saving,
            error = error,
            onNameChange = onRenameTextChange,
            onConfirm = { onRenameConfirm(item, renameText) },
            onDismiss = onRenameDismiss,
        )
    }
    editingPoint?.let { item ->
        EditPointDialog(
            input = pointText,
            saving = saving,
            error = error,
            onInputChange = onPointTextChange,
            onConfirm = { onPointConfirm(item, it) },
            onDismiss = onPointDismiss,
        )
    }
    editingRoute?.let { item ->
        EditRouteDialog(
            speedText = routeSpeedText,
            routeMode = routeMode,
            saving = saving,
            error = error,
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
    loading: Boolean,
    selectedFilter: FavoritesFilter,
    sortMode: FavoritesSortMode.Mode,
    operationMessage: String?,
    operationError: String?,
    operationBusy: Boolean,
    onFilterChange: (FavoritesFilter) -> Unit,
    onSortModeChange: (FavoritesSortMode.Mode) -> Unit,
    onChooseOnMap: () -> Unit,
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
        KestrelScreenHeader(
            title = "Favorites",
            subtitle = "Saved points and routes ready to preview on the map.",
        )
        (operationError ?: operationMessage)?.let {
            KestrelCard(
                modifier =
                    Modifier.semantics {
                        liveRegion =
                            if (operationError != null) LiveRegionMode.Assertive else LiveRegionMode.Polite
                    },
            ) {
                Text(
                    text = it,
                    color = if (operationError != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                )
            }
        }
        if (loading) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                CircularProgressIndicator()
                Text("Loading Favorites…")
            }
        } else if (items.isEmpty()) {
            EmptyFavorites(
                title = "No favorites yet",
                message = "Choose a point or route on the map, then save its preview.",
            )
            Button(onClick = onChooseOnMap, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                Text("Choose on map")
            }
        } else {
            FavoritesListContent(
                items = items,
                visibleItems = visibleItems,
                selectedFilter = selectedFilter,
                sortMode = sortMode,
                operationBusy = operationBusy,
                onFilterChange = onFilterChange,
                onSortModeChange = onSortModeChange,
                onChooseOnMap = onChooseOnMap,
                onApply = onApply,
                onRename = onRename,
                onEdit = onEdit,
                onMove = onMove,
                onDelete = onDelete,
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Suppress("LongParameterList")
@Composable
private fun FavoritesListContent(
    items: List<LibraryItemWithContent>,
    visibleItems: List<LibraryItemWithContent>,
    selectedFilter: FavoritesFilter,
    sortMode: FavoritesSortMode.Mode,
    operationBusy: Boolean,
    onFilterChange: (FavoritesFilter) -> Unit,
    onSortModeChange: (FavoritesSortMode.Mode) -> Unit,
    onChooseOnMap: () -> Unit,
    onApply: (LibraryItemWithContent) -> Unit,
    onRename: (LibraryItemWithContent) -> Unit,
    onEdit: (LibraryItemWithContent) -> Unit,
    onMove: (LibraryItemWithContent, Int) -> Unit,
    onDelete: (LibraryItemWithContent) -> Unit,
) {
    KestrelCard {
        Text("Show", style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FavoritesFilter.entries.forEach { filter ->
                AssistChip(
                    onClick = { onFilterChange(filter) },
                    label = { Text(if (filter == selectedFilter) "✓ ${filter.label()}" else filter.label()) },
                )
            }
        }
        Text("Sort by", style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FavoritesSortMode.Mode.entries.forEach { mode ->
                AssistChip(
                    onClick = { onSortModeChange(mode) },
                    enabled = !operationBusy,
                    label = { Text(if (mode == sortMode) "✓ ${mode.label()}" else mode.label()) },
                )
            }
        }
    }
    if (visibleItems.isEmpty()) {
        EmptyFavorites(
            title = "No ${selectedFilter.label().lowercase()} favorites",
            message = "Choose another filter or create a preview on the map.",
        )
        Button(onClick = onChooseOnMap) { Text("Choose on map") }
    } else {
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            itemsIndexed(visibleItems, key = { _, item -> item.item.id }) { index, item ->
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
}

@Composable
private fun EmptyFavorites(
    title: String,
    message: String,
) {
    KestrelEmptyState(
        icon = Icons.Outlined.StarBorder,
        title = title,
        message = message,
    )
}

@Composable
internal fun FavoriteRow(
    item: LibraryItemWithContent,
    enabled: Boolean = true,
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
    val actions = favoriteRowActions(item.kind, canReorder, canMoveUp, canMoveDown)
    KestrelCard {
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                imageVector = Icons.Filled.Star,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.name,
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text = item.description(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Box {
                IconButton(onClick = { menuExpanded = true }, enabled = enabled) {
                    Icon(Icons.Filled.MoreVert, contentDescription = favoriteMoreActionsLabel(item.name))
                }
                FavoriteRowMenu(
                    expanded = menuExpanded,
                    actions = actions.overflow,
                    onDismiss = { menuExpanded = false },
                    onRename = onRename,
                    onMoveUp = onMoveUp,
                    onMoveDown = onMoveDown,
                    onDelete = onDelete,
                )
            }
        }
        KestrelActionRow {
            Button(onClick = onApply, enabled = enabled) { Text("Preview on map") }
            TextButton(onClick = onEdit, enabled = enabled) {
                Text(favoriteEditLabel(item.kind))
            }
        }
    }
}

@Composable
private fun FavoriteRowMenu(
    expanded: Boolean,
    actions: List<FavoriteRowAction>,
    onDismiss: () -> Unit,
    onRename: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onDelete: () -> Unit,
) {
    DropdownMenu(
        expanded = expanded,
        onDismissRequest = onDismiss,
    ) {
        DropdownMenuItem(
            text = { Text("Rename") },
            onClick = {
                onDismiss()
                onRename()
            },
        )
        if (FavoriteRowAction.MoveUp in actions) {
            DropdownMenuItem(
                text = { Text("Move up") },
                onClick = {
                    onDismiss()
                    onMoveUp()
                },
            )
        }
        if (FavoriteRowAction.MoveDown in actions) {
            DropdownMenuItem(
                text = { Text("Move down") },
                onClick = {
                    onDismiss()
                    onMoveDown()
                },
            )
        }
        DropdownMenuItem(
            text = { Text("Delete") },
            onClick = {
                onDismiss()
                onDelete()
            },
        )
    }
}

@Composable
private fun ConfirmDeleteFavoriteDialog(
    item: LibraryItemWithContent,
    resetsStartup: Boolean,
    synced: Boolean,
    saving: Boolean,
    error: String?,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Delete favorite?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = item.name,
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    text =
                        if (synced && item.kind == LibraryItemKind.Place) {
                            "This removes the saved point here and from cloud sync."
                        } else {
                            "This removes the saved ${if (item.kind == LibraryItemKind.Place) "point" else "route"} from this device."
                        },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (resetsStartup) {
                    Text(
                        text = "App opening will return to the last map view.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Button(onClick = onConfirm, enabled = !saving) {
                Text(if (saving) "Deleting…" else "Delete")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancel") } },
    )
}

@Composable
private fun RenameFavoriteDialog(
    name: String,
    saving: Boolean,
    error: String?,
    onNameChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val trimmedNameIsEmpty = name.trim().isEmpty()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Rename favorite") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = onNameChange,
                    label = { Text("Name") },
                    supportingText = { Text("Names do not have to be unique.") },
                    singleLine = true,
                    enabled = !saving,
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(enabled = !trimmedNameIsEmpty && !saving, onClick = onConfirm) {
                Text(if (saving) "Renaming…" else "Rename")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancel") } },
    )
}

@Composable
private fun EditPointDialog(
    input: String,
    saving: Boolean,
    error: String?,
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
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = input,
                    onValueChange = onInputChange,
                    label = { Text("Coordinates") },
                    supportingText = {
                        if (showInvalid) Text("Enter valid latitude and longitude values.")
                    },
                    isError = showInvalid,
                    singleLine = true,
                    enabled = !saving,
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(enabled = parsed != null && !saving, onClick = { parsed?.let(onConfirm) }) {
                Text(if (saving) "Saving…" else "Save")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancel") } },
    )
}

@Composable
private fun EditRouteDialog(
    speedText: String,
    routeMode: MovementEngine.Mode,
    saving: Boolean,
    error: String?,
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
                    enabled = !saving,
                )
                MovementEngine.Mode.entries.forEach { mode ->
                    TextButton(onClick = { onRouteModeChange(mode) }, enabled = !saving) {
                        Text(if (mode == routeMode) "✓ ${mode.label()}" else mode.label())
                    }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(enabled = valid && !saving, onClick = { speed?.let { onConfirm(it, routeMode) } }) {
                Text(if (saving) "Saving…" else "Save")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancel") } },
    )
}

private fun MovementEngine.Mode.label(): String =
    when (this) {
        MovementEngine.Mode.Once -> "Once"
        MovementEngine.Mode.Loop -> "Loop"
        MovementEngine.Mode.PingPong -> "Ping-pong"
    }
