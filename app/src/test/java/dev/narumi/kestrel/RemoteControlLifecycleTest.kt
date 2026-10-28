package dev.narumi.kestrel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteControlLifecycleTest {
    @Test
    fun disabledRemoteControlDoesNotInitializeCloudCallbacks() {
        val fixture = Fixture()
        fixture.lifecycle.setEnabled(false)
        fixture.lifecycle.setForegroundActive(true)
        fixture.lifecycle.setServiceActive(true)
        fixture.lifecycle.runtimeStateChanged()
        fixture.lifecycle.setForegroundActive(false)
        fixture.lifecycle.setServiceActive(false)
        assertTrue(fixture.events.isEmpty())
    }

    @Test
    fun enablingUsesTheCurrentForegroundAndRestoredPlaybackLeases() {
        val fixture = Fixture()
        fixture.lifecycle.setForegroundActive(true)
        fixture.lifecycle.setServiceActive(true)
        fixture.lifecycle.setEnabled(true)
        assertEquals(listOf("foreground:true", "service:true"), fixture.events)
    }

    @Test
    fun restoredBackgroundPlaybackDoesNotAcquireAForegroundLease() {
        val fixture = Fixture()
        fixture.lifecycle.setServiceActive(true)
        fixture.lifecycle.setEnabled(true)
        assertEquals(listOf("foreground:false", "service:true"), fixture.events)
    }

    @Test
    fun stoppingPlaybackReleasesOnlyTheServiceLease() {
        val fixture = Fixture()
        fixture.lifecycle.setForegroundActive(true)
        fixture.lifecycle.setServiceActive(true)
        fixture.lifecycle.setEnabled(true)
        fixture.events.clear()
        fixture.lifecycle.setServiceActive(false)
        assertEquals(listOf("service:false"), fixture.events)
    }

    @Test
    fun leavingTheForegroundKeepsThePlaybackLease() {
        val fixture = Fixture()
        fixture.lifecycle.setForegroundActive(true)
        fixture.lifecycle.setServiceActive(true)
        fixture.lifecycle.setEnabled(true)
        fixture.events.clear()
        fixture.lifecycle.setForegroundActive(false)
        assertEquals(listOf("foreground:false"), fixture.events)
    }

    @Test
    fun disablingReleasesBothLeasesAndReenablingUsesChangesWhileDisabled() {
        val fixture = Fixture()
        fixture.lifecycle.setForegroundActive(true)
        fixture.lifecycle.setServiceActive(true)
        fixture.lifecycle.setEnabled(true)
        fixture.events.clear()
        fixture.lifecycle.setEnabled(false)
        fixture.lifecycle.setForegroundActive(false)
        fixture.lifecycle.runtimeStateChanged()
        fixture.lifecycle.setEnabled(true)
        assertEquals(
            listOf("foreground:false", "service:false", "foreground:false", "service:true"),
            fixture.events,
        )
    }

    @Test
    fun repeatedSettingsDoNotResetLeasesOrInitializeCloud() {
        val fixture = Fixture()
        fixture.lifecycle.setEnabled(false)
        fixture.lifecycle.setEnabled(false)
        assertTrue(fixture.events.isEmpty())
        fixture.lifecycle.setEnabled(true)
        fixture.events.clear()
        fixture.lifecycle.setEnabled(true)
        assertTrue(fixture.events.isEmpty())
    }

    @Test
    fun enabledRuntimeTransitionsRequestAnImmediatePoll() {
        val fixture = Fixture()
        fixture.lifecycle.setEnabled(true)
        fixture.events.clear()
        fixture.lifecycle.runtimeStateChanged()
        fixture.lifecycle.runtimeStateChanged()
        assertEquals(listOf("runtime", "runtime"), fixture.events)
        fixture.lifecycle.setEnabled(false)
        fixture.events.clear()
        fixture.lifecycle.runtimeStateChanged()
        assertTrue(fixture.events.isEmpty())
    }

    private class Fixture {
        val events = mutableListOf<String>()
        val lifecycle =
            RemoteControlLifecycle(
                onForegroundChanged = { events += "foreground:$it" },
                onServiceChanged = { events += "service:$it" },
                onRuntimeChanged = { events += "runtime" },
            )
    }
}
