package dev.narumi.kestrel.feature.map

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
            MapTargetSearchBar(
                onClick = onChooseTarget,
                // Leave the native MapLibre compass reachable at the top right.
                modifier = Modifier.align(Alignment.TopStart).padding(start = 16.dp, top = 16.dp, end = 72.dp),
            )
            MapHintPill(
                modifier =
                    Modifier
                        .align(Alignment.BottomStart)
                        // Keep the native logo and attribution visible below the overlay.
                        .padding(start = 16.dp, end = 84.dp, bottom = 40.dp),
            )
        }
        if (setupStep != MapSetupStep.Ready) {
            MapTargetSearchBar(
                onClick = onChooseTarget,
                modifier = Modifier.align(Alignment.BottomStart).padding(start = 16.dp, end = 84.dp, bottom = 40.dp),
            )
        }
        Surface(
            modifier = Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = 40.dp),
            shape = MaterialTheme.shapes.medium,
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            shadowElevation = 2.dp,
        ) {
            FilledIconButton(
                onClick = onCenterOnMe,
                modifier = Modifier.size(48.dp),
                colors =
                    IconButtonDefaults.filledIconButtonColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        contentColor =
                            if (myLocation == null) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary,
                    ),
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
