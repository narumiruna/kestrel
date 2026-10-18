package dev.narumi.kestrel.feature.map

import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.RuntimeState
import org.junit.Assert.assertEquals
import org.junit.Test

class MapWorkflowPresentationTest {
    @Test
    fun workspaceUsesSidePanelAtMediumAndExpandedWidths() {
        assertEquals(MapWorkspaceMode.BottomSheet, mapWorkspaceMode(320f))
        assertEquals(MapWorkspaceMode.BottomSheet, mapWorkspaceMode(599.9f))
        assertEquals(MapWorkspaceMode.SidePanel, mapWorkspaceMode(600f))
        assertEquals(MapWorkspaceMode.SidePanel, mapWorkspaceMode(840f))
    }

    @Test
    fun collapsedSheetScalesWithTextAndStaysInsideTheViewport() {
        assertEquals(200f, mapSheetPeekHeightDp(1f, 600f), 0f)
        assertEquals(300f, mapSheetPeekHeightDp(1.5f, 600f), 0f)
        assertEquals(200f, mapSheetPeekHeightDp(0.85f, 600f), 0f)
        assertEquals(240f, mapSheetPeekHeightDp(1.5f, 240f), 0f)
    }

    @Test
    fun phaseKeepsSetupAndActiveReplacementStateExplicit() {
        assertEquals(
            MapWorkflowPhase.Setup,
            mapWorkflowPhase(MapSetupStep.Permissions, RuntimeState.Idle, 0),
        )
        assertEquals(
            MapWorkflowPhase.Empty,
            mapWorkflowPhase(MapSetupStep.Ready, RuntimeState.Idle, 0),
        )
        assertEquals(
            MapWorkflowPhase.Draft,
            mapWorkflowPhase(MapSetupStep.Ready, RuntimeState.Idle, 2),
        )
        assertEquals(
            MapWorkflowPhase.Active,
            mapWorkflowPhase(MapSetupStep.Ready, RuntimeState.Single(LatLng(1.0, 2.0)), 0),
        )
        assertEquals(
            MapWorkflowPhase.ReplacementPreview,
            mapWorkflowPhase(MapSetupStep.Ready, RuntimeState.Single(LatLng(1.0, 2.0)), 1),
        )
    }

    @Test
    fun delayedOutcomeCanBeReconciledAgainstAuthoritativeRuntime() {
        val point = LatLng(1.0, 2.0)
        assertEquals(
            true,
            runtimeMatchesDraft(RuntimeState.Single(point), listOf(point), 20.0, MovementEngine.Mode.Once),
        )
        assertEquals(
            false,
            runtimeMatchesDraft(RuntimeState.Single(point), listOf(LatLng(3.0, 4.0)), 20.0, MovementEngine.Mode.Once),
        )
        val route = listOf(LatLng(0.0, 0.0), LatLng(1.0, 1.0))
        assertEquals(
            true,
            runtimeMatchesDraft(
                RuntimeState.Route(route, 12.0, MovementEngine.Mode.Loop, paused = true, playbackId = "test-playback"),
                route,
                12.0,
                MovementEngine.Mode.Loop,
            ),
        )
    }
}
