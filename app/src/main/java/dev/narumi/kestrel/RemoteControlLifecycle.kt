package dev.narumi.kestrel

/**
 * Keeps foreground and playback leases without creating cloud services while remote control is off.
 * The application supplies the cloud callbacks; the location service only publishes its own state.
 */
internal class RemoteControlLifecycle(
    private val onForegroundChanged: (Boolean) -> Unit,
    private val onServiceChanged: (Boolean) -> Unit,
    private val onRuntimeChanged: () -> Unit,
) {
    private var enabled = false
    private var foregroundActive = false
    private var serviceActive = false

    fun setEnabled(enabled: Boolean) {
        if (this.enabled == enabled) return
        this.enabled = enabled
        onForegroundChanged(enabled && foregroundActive)
        onServiceChanged(enabled && serviceActive)
    }

    fun setForegroundActive(active: Boolean) {
        foregroundActive = active
        if (enabled) onForegroundChanged(active)
    }

    fun setServiceActive(active: Boolean) {
        serviceActive = active
        if (enabled) onServiceChanged(active)
    }

    fun runtimeStateChanged() {
        if (enabled) onRuntimeChanged()
    }
}
