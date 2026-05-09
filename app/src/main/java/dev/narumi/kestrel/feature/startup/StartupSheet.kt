package dev.narumi.kestrel.feature.startup

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.core.data.CameraSnapshot
import dev.narumi.kestrel.core.data.Favorite
import dev.narumi.kestrel.core.location.LatLng

sealed interface StartupChoice {
    data class Last(val snap: CameraSnapshot) : StartupChoice
    data object Current : StartupChoice
    data class Favorite(val target: LatLng) : StartupChoice
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StartupSheet(
    lastCamera: CameraSnapshot?,
    favorites: List<Favorite>,
    myLocationAvailable: Boolean,
    onPick: (StartupChoice) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = "Where should we start?",
                style = MaterialTheme.typography.titleMedium,
            )

            Card(modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text("Last position") },
                    supportingContent = {
                        Text(
                            if (lastCamera != null) {
                                "%.5f, %.5f · zoom %.1f".format(
                                    lastCamera.lat, lastCamera.lng, lastCamera.zoom,
                                )
                            } else {
                                "No previous position saved"
                            },
                        )
                    },
                    modifier = if (lastCamera != null) {
                        Modifier.clickable { onPick(StartupChoice.Last(lastCamera)) }
                    } else Modifier,
                )
                HorizontalDivider()
                ListItem(
                    headlineContent = { Text("Current location") },
                    supportingContent = {
                        Text(
                            if (myLocationAvailable) "Use device GPS" else "Waiting for fix…",
                        )
                    },
                    modifier = Modifier.clickable { onPick(StartupChoice.Current) },
                )
            }

            Text(
                text = "Favorites",
                style = MaterialTheme.typography.titleSmall,
            )
            if (favorites.isEmpty()) {
                Text(
                    text = "Long-press the map to save a favorite.",
                    style = MaterialTheme.typography.bodySmall,
                )
            } else {
                Card(modifier = Modifier.fillMaxWidth()) {
                    LazyColumn {
                        items(favorites, key = { it.name }) { fav ->
                            ListItem(
                                headlineContent = { Text(fav.name) },
                                supportingContent = {
                                    Text("%.5f, %.5f".format(fav.lat, fav.lng))
                                },
                                modifier = Modifier.clickable {
                                    onPick(StartupChoice.Favorite(LatLng(fav.lat, fav.lng)))
                                },
                            )
                        }
                    }
                }
            }

            TextButton(onClick = onDismiss) { Text("Skip") }
        }
    }
}
