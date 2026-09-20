package dev.narumi.kestrel.feature.map

import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.RuntimeState
import dev.narumi.kestrel.ui.components.label
import dev.narumi.kestrel.ui.components.toDisplaySpeed

internal enum class MapWorkspaceMode { BottomSheet, SidePanel }

internal fun mapWorkspaceMode(widthDp: Float): MapWorkspaceMode = if (widthDp >= 600f) MapWorkspaceMode.SidePanel else MapWorkspaceMode.BottomSheet

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

internal fun currentMockSummary(runtime: RuntimeState): String =
    when (runtime) {
        RuntimeState.Idle -> "No mock is active"
        is RuntimeState.Single -> "Point · %.5f, %.5f".format(runtime.point.lat, runtime.point.lng)
        is RuntimeState.Route ->
            "Route · ${runtime.waypoints.size} waypoints · ${runtime.speedKmh.toDisplaySpeed()} · " +
                runtime.mode.label()
    }

internal fun runtimeMatchesDraft(
    runtime: RuntimeState,
    waypoints: List<LatLng>,
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
): Boolean =
    when (runtime) {
        RuntimeState.Idle -> false
        is RuntimeState.Single -> waypoints.singleOrNull() == runtime.point
        is RuntimeState.Route ->
            runtime.waypoints == waypoints &&
                runtime.speedKmh == speedKmh &&
                runtime.mode == routeMode
    }

internal fun previewSummary(
    waypointCount: Int,
    speedKmh: Double,
    routeMode: MovementEngine.Mode,
): String =
    when (waypointCount) {
        0 -> "No preview"
        1 -> "Point preview"
        else -> "Route preview · $waypointCount waypoints · ${speedKmh.toDisplaySpeed()} · ${routeMode.label()}"
    }
