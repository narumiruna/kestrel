package dev.narumi.kestrel.feature.favorites

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.data.Favorite
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.StartupPreference
import kotlinx.coroutines.launch

@Composable
fun FavoritesScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val prefs = remember { KestrelPrefs(context) }
    val scope = rememberCoroutineScope()

    val favorites by prefs.favorites.collectAsStateWithLifecycle(emptyList())
    val startup by prefs.startupPreference.collectAsStateWithLifecycle(StartupPreference())

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "Favorites",
            style = MaterialTheme.typography.titleMedium,
        )
        if (favorites.isEmpty()) {
            Text(
                text = "Long-press a spot on the map to save it here.",
                style = MaterialTheme.typography.bodyMedium,
            )
        } else {
            Card(modifier = Modifier.fillMaxWidth()) {
                LazyColumn {
                    items(favorites, key = { it.name }) { fav ->
                        FavoriteRow(
                            favorite = fav,
                            onDelete = {
                                scope.launch {
                                    prefs.removeFavorite(fav.name)
                                    if (startup.mode == StartupPreference.Mode.Favorite &&
                                        startup.favoriteName == fav.name) {
                                        prefs.setStartupPreference(
                                            StartupPreference(StartupPreference.Mode.Last),
                                        )
                                    }
                                }
                            },
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun FavoriteRow(
    favorite: Favorite,
    onDelete: () -> Unit,
) {
    val supporting = favorite.route?.let {
        "Route · ${it.lats.size} waypoints · ${it.speedKmh.toInt()} km/h"
    } ?: "%.5f, %.5f".format(favorite.lat, favorite.lng)
    ListItem(
        headlineContent = { Text(favorite.name) },
        supportingContent = { Text(supporting) },
        trailingContent = {
            IconButton(onClick = onDelete) {
                androidx.compose.material3.Icon(
                    painter = painterResource(R.drawable.ic_delete),
                    contentDescription = "Delete ${favorite.name}",
                )
            }
        },
    )
}
