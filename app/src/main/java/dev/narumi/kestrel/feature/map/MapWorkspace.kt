package dev.narumi.kestrel.feature.map

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.MultiplePermissionsState
import dev.narumi.kestrel.core.data.CameraSnapshot
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.map.KestrelMap

@OptIn(ExperimentalPermissionsApi::class)
@Suppress("LongParameterList")
@Composable
internal fun MapCanvas(
    mockLocation: LatLng?,
    currentRoute: List<LatLng>,
    previewRoute: List<LatLng>,
    previewPoint: LatLng?,
    myLocation: LatLng?,
    cameraTarget: CameraSnapshot?,
    setupStep: MapSetupStep,
    permissionState: MultiplePermissionsState,
    onMapClick: (LatLng) -> Unit,
    onMapLongClick: (LatLng) -> Unit,
    onCameraIdle: (CameraSnapshot) -> Unit,
    onOpenDeveloperOptions: () -> Unit,
    onRefreshMockCheck: () -> Unit,
    onChooseTarget: () -> Unit,
    onCenterOnMe: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxSize()) {
        KestrelMap(
            modifier = Modifier.fillMaxSize(),
            mockLocation = mockLocation,
            currentRoute = currentRoute,
            previewRoute = previewRoute,
            previewPoint = previewPoint,
            myLocation = myLocation,
            cameraTarget = cameraTarget,
            onMapClick = onMapClick,
            onMapLongClick = onMapLongClick,
            onCameraIdle = onCameraIdle,
        )
        if (setupStep != MapSetupStep.Ready) {
            StatusBanner(
                modifier =
                    Modifier
                        .align(Alignment.TopCenter)
                        .padding(horizontal = 12.dp, vertical = 12.dp),
                setupStep = setupStep,
                permissionState = permissionState,
                onOpenDeveloperOptions = onOpenDeveloperOptions,
                onRefreshMockCheck = onRefreshMockCheck,
            )
        } else {
            MapHintPill(
                modifier =
                    Modifier
                        .align(Alignment.TopStart)
                        .padding(horizontal = 12.dp, vertical = 12.dp),
            )
        }
        Column(
            modifier =
                Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 16.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalAlignment = Alignment.End,
        ) {
            ExtendedFloatingActionButton(
                onClick = onChooseTarget,
                icon = { Icon(Icons.Filled.Search, contentDescription = null) },
                text = { Text("Choose target") },
            )
            SmallFloatingActionButton(
                onClick = onCenterOnMe,
                containerColor =
                    if (myLocation == null) {
                        androidx.compose.material3.MaterialTheme.colorScheme.surfaceVariant
                    } else {
                        androidx.compose.material3.MaterialTheme.colorScheme.primaryContainer
                    },
            ) {
                Icon(
                    Icons.Filled.MyLocation,
                    contentDescription =
                        if (myLocation == null) {
                            "Current location unavailable"
                        } else {
                            "Center on current location"
                        },
                )
            }
        }
    }
}
