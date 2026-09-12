package dev.narumi.kestrel.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.android.tools.screenshot.PreviewTest
import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.library.LibraryItem
import dev.narumi.kestrel.core.library.LibraryItemKind
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.core.library.Place
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.RuntimeState
import dev.narumi.kestrel.feature.favorites.FavoritesContent
import dev.narumi.kestrel.feature.favorites.FavoritesFilter
import dev.narumi.kestrel.ui.components.PlaybackStatusBar
import dev.narumi.kestrel.ui.theme.KestrelTheme

@PreviewTest
@Preview(name = "Favorites playing", widthDp = 360, heightDp = 560, showBackground = true)
@Preview(name = "Favorites playing narrow large text", widthDp = 320, heightDp = 480, fontScale = 1.5f)
@Preview(name = "Favorites playing short landscape", widthDp = 600, heightDp = 240)
@Composable
fun FavoritesPlayingScreenshot() {
    KestrelTheme {
        Surface {
            Column(Modifier.fillMaxSize()) {
                PlaybackStatusBar(
                    runtime =
                        RuntimeState.Route(
                            waypoints = listOf(LatLng(25.0, 121.0), LatLng(25.1, 121.1)),
                            speedKmh = 12.0,
                            mode = MovementEngine.Mode.Loop,
                            paused = false,
                        ),
                    busy = false,
                    error = null,
                    onViewMap = {},
                    onPause = {},
                    onResume = {},
                    onStop = {},
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
                FavoritesContent(
                    modifier = Modifier.weight(1f),
                    items = layoutPreviewItems,
                    visibleItems = layoutPreviewItems,
                    loading = false,
                    selectedFilter = FavoritesFilter.All,
                    sortMode = FavoritesSortMode.Mode.Manual,
                    operationMessage = null,
                    operationError = null,
                    operationBusy = false,
                    onFilterChange = {},
                    onSortModeChange = {},
                    onChooseOnMap = {},
                    onApply = {},
                    onRename = {},
                    onEdit = {},
                    onMove = { _, _ -> },
                    onDelete = {},
                )
            }
        }
    }
}

private val layoutPreviewItems =
    List(10) { index ->
        LibraryItemWithContent(
            item =
                LibraryItem(
                    id = "item-$index",
                    kind = LibraryItemKind.Place,
                    placeId = "place-$index",
                    sortOrder = index,
                    createdAt = 0,
                    updatedAt = 0,
                ),
            name = "Saved point ${index + 1}",
            kind = LibraryItemKind.Place,
            place =
                Place(
                    id = "place-$index",
                    name = "Saved point ${index + 1}",
                    lat = 25.03398,
                    lng = 121.56454,
                    createdAt = 0,
                    updatedAt = 0,
                ),
        )
    }
