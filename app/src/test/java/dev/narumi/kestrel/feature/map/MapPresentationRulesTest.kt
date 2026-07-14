package dev.narumi.kestrel.feature.map

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MapPresentationRulesTest {
    @Test
    fun setupStep_requestsPermissionsBeforeMockAppSelection() {
        assertEquals(
            MapSetupStep.Permissions,
            mapSetupStep(permissionsGranted = false, mockAllowed = false),
        )
        assertEquals(
            MapSetupStep.Permissions,
            mapSetupStep(permissionsGranted = false, mockAllowed = true),
        )
    }

    @Test
    fun setupStep_requestsMockAppAfterPermissions() {
        assertEquals(
            MapSetupStep.MockLocationApp,
            mapSetupStep(permissionsGranted = true, mockAllowed = false),
        )
    }

    @Test
    fun setupStep_isReadyAfterBothRequirements() {
        assertEquals(
            MapSetupStep.Ready,
            mapSetupStep(permissionsGranted = true, mockAllowed = true),
        )
    }

    @Test
    fun routeSettings_areVisibleOnlyForEditableMultiPointDraft() {
        assertFalse(shouldShowRouteSettings(RunState.Idle, waypointCount = 0))
        assertFalse(shouldShowRouteSettings(RunState.Idle, waypointCount = 1))
        assertTrue(shouldShowRouteSettings(RunState.Idle, waypointCount = 2))
        assertTrue(shouldShowRouteSettings(RunState.Single, waypointCount = 2))
        assertFalse(shouldShowRouteSettings(RunState.RoutePlaying, waypointCount = 2))
        assertFalse(shouldShowRouteSettings(RunState.RoutePaused, waypointCount = 2))
    }
}
