package dev.narumi.kestrel.feature.map

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.setValue
import dev.narumi.kestrel.core.data.CameraSnapshot

/** Keep the observed viewport separate from a camera move that has not completed. */
internal class MapCameraState(
    viewport: CameraSnapshot? = null,
    target: CameraSnapshot? = null,
) {
    var viewport by mutableStateOf(viewport)
        private set
    var target by mutableStateOf(target)
        private set

    val initialCamera: CameraSnapshot?
        get() = target ?: viewport

    fun moveTo(target: CameraSnapshot?) {
        this.target = target
    }

    fun onIdle(viewport: CameraSnapshot) {
        this.viewport = viewport
    }

    fun onMoveEnded(
        target: CameraSnapshot,
        viewport: CameraSnapshot,
    ) {
        if (this.target != target) return
        this.viewport = viewport
        this.target = null
    }

    companion object {
        val Saver =
            listSaver<MapCameraState, CameraSnapshot?>(
                save = { listOf(it.viewport, it.target) },
                restore = { MapCameraState(viewport = it[0], target = it[1]) },
            )
    }
}
