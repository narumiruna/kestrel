package dev.narumi.kestrel.feature.map

import android.content.Context
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.i18n.coordinates
import dev.narumi.kestrel.core.i18n.routeDetails
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.RuntimeState

internal enum class MapWorkspaceMode { BottomSheet, SidePanel }

internal fun mapWorkspaceMode(widthDp: Float): MapWorkspaceMode = if (widthDp >= 600f) MapWorkspaceMode.SidePanel else MapWorkspaceMode.BottomSheet

// Keep collapsed actions visible when text grows; never exceed the available viewport.
internal fun mapSheetPeekHeightDp(
    fontScale: Float,
    availableHeightDp: Float,
): Float = (200f * fontScale.coerceAtLeast(1f)).coerceAtMost(availableHeightDp)

internal enum class MapWorkflowPhase {
    Setup,
    Empty,
    Draft,
    Active,
    ReplacementPreview,
}

internal fun mapWorkflowPhase(
    setupStep: MapSetupStep,
    runtime: RuntimeState,
    draftWaypointCount: Int,
): MapWorkflowPhase =
    when {
        setupStep != MapSetupStep.Ready -> MapWorkflowPhase.Setup
        runtime != RuntimeState.Idle && draftWaypointCount > 0 -> MapWorkflowPhase.ReplacementPreview
        runtime != RuntimeState.Idle -> MapWorkflowPhase.Active
        draftWaypointCount > 0 -> MapWorkflowPhase.Draft
        else -> MapWorkflowPhase.Empty
    }

internal fun currentMockSummary(
    context: Context,
    runtime: RuntimeState,
): String =
    when (runtime) {
        RuntimeState.Idle -> {
            context.getString(R.string.no_mock_is_active)
        }

        is RuntimeState.Single -> {
            context.getString(R.string.point_summary, coordinates(runtime.point.lat, runtime.point.lng))
        }

        is RuntimeState.Route -> {
            context.getString(R.string.route_summary, context.routeDetails(runtime.waypoints.size, runtime.speedKmh, runtime.mode))
        }
    }

internal fun runtimeMatchesDraft(
    runtime: RuntimeState,
    waypoints: List<LatLng>,
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
): Boolean =
    when (runtime) {
        RuntimeState.Idle -> {
            false
        }

        is RuntimeState.Single -> {
            waypoints.singleOrNull() == runtime.point
        }

        is RuntimeState.Route -> {
            runtime.waypoints == waypoints &&
                runtime.speedKmh == speedKmh &&
                runtime.mode == routeMode
        }
    }

internal fun previewSummary(
    context: Context,
    waypointCount: Int,
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
): String =
    when (waypointCount) {
        0 -> context.getString(R.string.no_preview)
        1 -> context.getString(R.string.point_preview)
        else -> context.getString(R.string.route_preview_summary, context.routeDetails(waypointCount, speedKmh, routeMode))
    }
