package dev.narumi.kestrel.feature.map

import androidx.compose.runtime.saveable.SaverScope
import dev.narumi.kestrel.core.data.CameraSnapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MapCameraStateTest {
    private val original = CameraSnapshot(25.5, 121.25, 15.0)
    private val panned = CameraSnapshot(40.25, -3.75, 9.5)

    @Test
    fun emptyStateDoesNotIssueAMove() {
        val restored = restore(MapCameraState())
        assertNull(restored.initialCamera)
        assertNull(restored.target)
    }

    @Test
    fun latestPanAndFractionalZoomReplaceAnOldCompletedTarget() {
        val state = MapCameraState()
        state.moveTo(original)
        state.onMoveEnded(original, original)
        state.onIdle(panned)

        val restored = restore(state)
        assertEquals(panned, restored.viewport)
        assertEquals(panned, restored.initialCamera)
        assertNull(restored.target)
    }

    @Test
    fun idleOnlyObservesTheViewportAndDoesNotIssueAnAnimation() {
        val state = MapCameraState()
        state.onIdle(original)
        state.onIdle(panned)

        assertEquals(panned, state.viewport)
        assertNull(state.target)
    }

    @Test
    fun firstIdleIsSavedEvenWithoutAnExplicitTarget() {
        val state = MapCameraState()
        state.onIdle(panned)
        assertEquals(panned, restore(state).initialCamera)
    }

    @Test
    fun pendingMoveSurvivesRestorationAndAnUnrelatedIdle() {
        val state = MapCameraState(viewport = original)
        state.moveTo(panned)
        state.onIdle(original)

        val restored = restore(state)
        assertEquals(original, restored.viewport)
        assertEquals(panned, restored.target)
        assertEquals(panned, restored.initialCamera)
    }

    @Test
    fun anOldCompletionDoesNotClearANewerMove() {
        val state = MapCameraState(viewport = original)
        state.moveTo(panned)
        state.onMoveEnded(original, original)

        assertEquals(panned, state.target)
        assertEquals(panned, restore(state).initialCamera)
    }

    @Test
    fun cancelledMoveRestoresItsActualViewportNotItsOldTarget() {
        val state = MapCameraState(viewport = original)
        state.moveTo(original)
        state.onMoveEnded(original, panned)

        val restored = restore(state)
        assertNull(restored.target)
        assertEquals(panned, restored.initialCamera)
    }

    @Test
    fun completedTargetCanBeRequestedAgainAfterAPan() {
        val state = MapCameraState()
        state.moveTo(original)
        state.onMoveEnded(original, original)
        state.onIdle(panned)
        state.moveTo(original)

        assertEquals(original, state.target)
        assertEquals(original, restore(state).initialCamera)
    }

    private fun restore(state: MapCameraState): MapCameraState {
        val scope =
            object : SaverScope {
                override fun canBeSaved(value: Any): Boolean = true
            }
        val saved = with(MapCameraState.Saver) { scope.save(state) }
        return requireNotNull(MapCameraState.Saver.restore(requireNotNull(saved)))
    }
}
