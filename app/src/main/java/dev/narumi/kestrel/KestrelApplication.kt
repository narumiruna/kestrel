package dev.narumi.kestrel

import android.app.Application
import dev.narumi.kestrel.core.cloud.RemoteControlPoller
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.location.LocationService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch

class KestrelApplication : Application() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val remoteControlPoller by lazy { RemoteControlPoller.getInstance(this) }

    internal val remoteControlLifecycle =
        RemoteControlLifecycle(
            onForegroundChanged = { remoteControlPoller.setForegroundActive(it) },
            onServiceChanged = { remoteControlPoller.setServiceActive(it) },
            onRuntimeChanged = { remoteControlPoller.runtimeStateChanged() },
        )

    override fun onCreate() {
        super.onCreate()
        val prefs = KestrelPrefs(this)
        scope.launch {
            prefs.remoteControlSettings.collect { remoteControlLifecycle.setEnabled(it.enabled) }
        }
        scope.launch {
            LocationService.serviceActive.collect(remoteControlLifecycle::setServiceActive)
        }
        scope.launch {
            LocationService.runtimeState.drop(1).collect { remoteControlLifecycle.runtimeStateChanged() }
        }
    }
}
