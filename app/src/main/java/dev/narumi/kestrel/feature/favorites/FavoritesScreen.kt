package dev.narumi.kestrel.feature.favorites

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.i18n.UiMessage
import dev.narumi.kestrel.core.i18n.labelResource
import dev.narumi.kestrel.core.library.LibraryItemKind
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.core.library.LibraryRepository
import dev.narumi.kestrel.core.library.description
import dev.narumi.kestrel.core.library.label
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.parseCoordInput
import dev.narumi.kestrel.ui.components.KestrelActionRow
import dev.narumi.kestrel.ui.components.KestrelCard
import dev.narumi.kestrel.ui.components.KestrelIcon
import dev.narumi.kestrel.ui.components.KestrelIconBadge
import dev.narumi.kestrel.ui.components.KestrelIcons
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
    var selectedFilter by rememberSaveable { mutableStateOf(FavoritesFilter.All) }
    var query by rememberSaveable { mutableStateOf("") }
    var editingName by rememberSaveable { mutableStateOf<LibraryItemWithContent?>(null) }
    var editingPoint by rememberSaveable { mutableStateOf<LibraryItemWithContent?>(null) }
    var editingRoute by rememberSaveable { mutableStateOf<LibraryItemWithContent?>(null) }
    var deletingItem by rememberSaveable { mutableStateOf<LibraryItemWithContent?>(null) }
    var renameText by rememberSaveable { mutableStateOf("") }
    var pointText by rememberSaveable { mutableStateOf("") }
    var routeSpeedText by rememberSaveable { mutableStateOf("") }
    var routeMode by rememberSaveable { mutableStateOf(MovementEngine.Mode.Once) }
    var operationBusy by remember { mutableStateOf(false) }
    var operationMessage by rememberSaveable { mutableStateOf<UiMessage?>(null) }
    var operationError by rememberSaveable { mutableStateOf<UiMessage?>(null) }

    val locale = androidx.compose.ui.platform.LocalConfiguration.current.locales[0]
    val visibleItems =
        remember(items, query, selectedFilter, sortMode.mode, locale) {
            visibleFavorites(items, query, selectedFilter, sortMode.mode, locale)
        }

    fun runFavoriteAction(
        successMessage: UiMessage,
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
                                UiMessage(R.string.could_not_update_favorites_your_previous_saved_value_is_unchanged_try_ag),
                            block = block,
                        )
                ) {
                    PersistedActionResult.Success -> {
                        operationMessage = successMessage
                        onSuccess()
                    }

                    is PersistedActionResult.Failure -> {
                        operationError = result.message
                    }
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
            error = operationError?.resolve(context),
            onConfirm = {
                runFavoriteAction(
                    successMessage = UiMessage(R.string.deleted_1_s, listOf((item.name).toString())),
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
        error = operationError?.resolve(context),
        onRenameConfirm = { item, newName ->
            runFavoriteAction(
                successMessage = UiMessage(R.string.renamed_favorite_to_1_s, listOf((newName.trim()).toString())),
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
                successMessage = UiMessage(R.string.saved_coordinates_for_1_s, listOf((item.name).toString())),
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
                successMessage = UiMessage(R.string.saved_route_settings_for_1_s, listOf((item.name).toString())),
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
        query = query,
        selectedFilter = selectedFilter,
        sortMode = sortMode.mode,
        operationMessage = operationMessage?.resolve(context),
        operationError = operationError?.resolve(context),
        operationBusy = operationBusy,
        onQueryChange = { query = it },
        onFilterChange = { selectedFilter = it },
        onClearFilters = {
            query = ""
            selectedFilter = FavoritesFilter.All
        },
        onSortModeChange = { mode ->
            runFavoriteAction(UiMessage(R.string.sorted_favorites)) {
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
                    pointText = "%.5f, %.5f".format(java.util.Locale.US, place.lat, place.lng)
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
            runFavoriteAction(UiMessage(R.string.moved_1_s, listOf((item.name).toString()))) {
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
    val context = LocalContext.current
    var menuExpanded by remember { mutableStateOf(false) }
    val actions = favoriteRowActions(item.kind, canReorder, canMoveUp, canMoveDown)
    KestrelCard {
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            val isRoute = item.kind == LibraryItemKind.Route
            KestrelIconBadge(
                icon = if (isRoute) KestrelIcons.RouteFilled else KestrelIcons.Place,
                containerColor =
                    if (isRoute) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.primaryContainer,
                contentColor =
                    if (isRoute) MaterialTheme.colorScheme.onTertiaryContainer else MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = item.name,
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    text = item.description(context),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Box {
                IconButton(onClick = { menuExpanded = true }, enabled = enabled) {
                    KestrelIcon(
                        KestrelIcons.More,
                        contentDescription = favoriteMoreActionsLabel(item.name).resolve(context),
                    )
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
            FilledTonalButton(onClick = onApply, enabled = enabled) { Text(stringResource(R.string.preview_on_map)) }
            TextButton(onClick = onEdit, enabled = enabled) {
                Text(stringResource(favoriteEditLabel(item.kind)))
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
    val context = LocalContext.current
    DropdownMenu(
        expanded = expanded,
        onDismissRequest = onDismiss,
    ) {
        DropdownMenuItem(
            text = { Text(stringResource(R.string.rename)) },
            onClick = {
                onDismiss()
                onRename()
            },
        )
        if (FavoriteRowAction.MoveUp in actions) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.move_up)) },
                onClick = {
                    onDismiss()
                    onMoveUp()
                },
            )
        }
        if (FavoriteRowAction.MoveDown in actions) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.move_down)) },
                onClick = {
                    onDismiss()
                    onMoveDown()
                },
            )
        }
        DropdownMenuItem(
            text = { Text(stringResource(R.string.delete)) },
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
    val resources = LocalResources.current
    val context = LocalContext.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.delete_favorite)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = item.name,
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    text =
                        if (synced && item.kind == LibraryItemKind.Place) {
                            resources.getString(R.string.this_removes_the_saved_point_here_and_from_cloud_sync)
                        } else {
                            if (item.kind == LibraryItemKind.Place) resources.getString(R.string.this_removes_the_saved_point_from_this_device) else resources.getString(R.string.this_removes_the_saved_route_from_this_device)
                        },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (resetsStartup) {
                    Text(
                        text = resources.getString(R.string.app_opening_will_return_to_the_last_map_view),
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
                Text(if (saving) resources.getString(R.string.deleting) else resources.getString(R.string.delete))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text(stringResource(R.string.cancel)) } },
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
    val resources = LocalResources.current
    val context = LocalContext.current
    val trimmedNameIsEmpty = name.trim().isEmpty()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.rename_favorite)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = onNameChange,
                    label = { Text(stringResource(R.string.name)) },
                    supportingText = { Text(stringResource(R.string.names_do_not_have_to_be_unique)) },
                    singleLine = true,
                    enabled = !saving,
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(enabled = !trimmedNameIsEmpty && !saving, onClick = onConfirm) {
                Text(if (saving) resources.getString(R.string.renaming) else resources.getString(R.string.rename))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text(stringResource(R.string.cancel)) } },
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
    val resources = LocalResources.current
    val context = LocalContext.current
    val parsed = parseCoordInput(input)
    val showInvalid = input.isNotBlank() && parsed == null
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.edit_coordinates)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = input,
                    onValueChange = onInputChange,
                    label = { Text(stringResource(R.string.coordinates)) },
                    supportingText = {
                        if (showInvalid) Text(stringResource(R.string.enter_valid_latitude_and_longitude_values))
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
                Text(if (saving) resources.getString(R.string.saving) else resources.getString(R.string.save))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text(stringResource(R.string.cancel)) } },
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
    val resources = LocalResources.current
    val context = LocalContext.current
    val speed = speedText.toDoubleOrNull()
    val valid = speed != null && speed > 0
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.edit_route)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = speedText,
                    onValueChange = { v -> onSpeedTextChange(v.filter { it.isDigit() || it == '.' }) },
                    label = { Text(stringResource(R.string.speed_km_h)) },
                    isError = speedText.isNotBlank() && !valid,
                    singleLine = true,
                    enabled = !saving,
                )
                MovementEngine.Mode.entries.forEach { mode ->
                    TextButton(onClick = { onRouteModeChange(mode) }, enabled = !saving) {
                        Text(if (mode == routeMode) resources.getString(R.string.message_1_s, (mode.label()).toString()) else mode.label())
                    }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(enabled = valid && !saving, onClick = { speed?.let { onConfirm(it, routeMode) } }) {
                Text(if (saving) resources.getString(R.string.saving) else resources.getString(R.string.save))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text(stringResource(R.string.cancel)) } },
    )
}

@Composable
private fun MovementEngine.Mode.label(): String = stringResource(labelResource())
