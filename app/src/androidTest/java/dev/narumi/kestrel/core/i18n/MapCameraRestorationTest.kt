package dev.narumi.kestrel.core.i18n

import android.view.View
import android.view.ViewGroup
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.lifecycle.Lifecycle
import dev.narumi.kestrel.MainActivity
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.data.CameraSnapshot
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.location.LocationService
import dev.narumi.kestrel.core.location.RuntimeState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.abs

/** Approved disposable emulator only: -e mapCameraRestore true. Changes locale and camera, never mock GPS. */
class MapCameraRestorationTest {
    val rule = createAndroidComposeRule<MainActivity>()

    @get:Rule
    val guardedRule: TestRule = RuleChain.outerRule(disposableLocaleTarget("mapCameraRestore")).around(rule)

    @Test
    fun nativeCameraSurvivesNavigationAndLanguageRecreation() {
        rule.waitForIdle()
        assertTrue("The approved target must start idle", LocationService.runtimeState.value == RuntimeState.Idle)
        assertTrue("The approved target must have no current mock", LocationService.currentMock.value == null)
        val savedMock = runBlocking { withTimeout(WAIT_MILLIS) { KestrelPrefs(rule.activity).mockState.first() } }
        assertTrue("The approved target must have no saved mock", savedMock == null)
        val initialLocale = AppLanguage.selected(rule.activity)
        val observationScope = CoroutineScope(Dispatchers.Default)
        val idleOnly = AtomicBoolean(true)
        val operations = AtomicInteger()
        observationScope.launch(start = CoroutineStart.UNDISPATCHED) {
            LocationService.runtimeState.collect { if (it != RuntimeState.Idle) idleOnly.set(false) }
        }
        observationScope.launch(start = CoroutineStart.UNDISPATCHED) {
            LocationService.operationResults.drop(LocationService.operationResults.replayCache.size).collect { operations.incrementAndGet() }
        }

        fun assertNoMock() {
            assertTrue("Camera actions must keep the runtime idle", idleOnly.get() && LocationService.runtimeState.value == RuntimeState.Idle)
            assertTrue("Camera actions must not issue service operations", operations.get() == 0)
        }
        var failure: Throwable? = null
        try {
            select("en")
            var native = awaitMap()
            click(R.string.choose_target)
            rule.onNodeWithText(text(R.string.coordinates_or_maps_url)).performTextInput("25.5, 121.25")
            click(R.string.preview_on_map)
            assertPreview()
            awaitCamera(native, CameraSnapshot(25.5, 121.25, 15.0))
            assertNoMock()

            // A native camera move simulates pan/zoom without issuing a mock-location action.
            val pan = CameraSnapshot(40.25, -3.75, 9.5)
            rule.runOnUiThread {
                native.idle.set(false)
                native.map.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(pan.lat, pan.lng), pan.zoom))
            }
            val observedPan = awaitCamera(native, pan)
            assertNoMock()
            for (destination in listOf(R.string.nav_settings, R.string.nav_favorites)) {
                click(destination)
                click(R.string.nav_map)
                native = awaitMap(native.view)
                awaitCamera(native, observedPan)
                assertPreview()
                assertNoMock()
            }
            val previousView = native.view
            select("de")
            native = awaitMap(previousView)
            awaitCamera(native, observedPan)
            assertPreview()
            assertNoMock()
        } catch (error: Throwable) {
            failure = error
            throw error
        } finally {
            try {
                select(initialLocale)
                assertNoMock()
            } catch (error: Throwable) {
                if (failure == null) throw error else failure.addSuppressed(error)
            } finally {
                observationScope.cancel()
            }
        }
    }

    private fun text(resourceId: Int): String = AppLanguage.context(rule.activity).getString(resourceId)

    private fun click(resourceId: Int) = rule.onNodeWithText(text(resourceId)).performClick()

    private fun assertPreview() = rule.onNodeWithText(text(R.string.point_preview)).assertExists()

    private fun select(tag: String) {
        val previous = rule.activity
        val changed = AppLanguage.selected(previous) != tag
        rule.runOnUiThread { AppLanguage.select(rule.activity, tag) }
        rule.waitUntil(WAIT_MILLIS) {
            val ready = AtomicBoolean(false)
            rule.runOnUiThread {
                val activity = rule.activity
                ready.set(
                    (!changed || activity !== previous) && !activity.isDestroyed &&
                        activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) &&
                        AppLanguage.selected(activity) == tag && activity.resources.configuration.locales[0]
                            .toLanguageTag() == tag,
                )
            }
            ready.get()
        }
        rule.waitForIdle()
    }

    private fun awaitMap(previous: MapView? = null): NativeMap {
        val cached = AtomicReference<NativeMap?>()
        var requested: MapView? = null // Accessed only on the UI thread.
        rule.waitUntil(WAIT_MILLIS) {
            rule.runOnUiThread {
                val activity = rule.activity
                if (!activity.isDestroyed && activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
                    val view = findMap(activity.window.decorView)
                    if (view != null && view !== previous && view !== requested && view.isShown && view.isAttachedToWindow) {
                        requested = view
                        view.getMapAsync { map ->
                            val native = NativeMap(view, map)
                            map.addOnCameraMoveStartedListener { native.idle.set(false) }
                            map.addOnCameraIdleListener { native.idle.set(true) }
                            cached.set(native)
                        }
                    }
                }
            }
            cached.get() != null
        }
        return requireNotNull(cached.get())
    }

    private fun findMap(view: View): MapView? {
        if (view is MapView) return view
        if (view is ViewGroup) {
            for (index in 0 until view.childCount) {
                findMap(view.getChildAt(index))?.let { return it }
            }
        }
        return null
    }

    private fun awaitCamera(
        native: NativeMap,
        expected: CameraSnapshot,
    ): CameraSnapshot {
        val snapshot = AtomicReference<CameraSnapshot?>()
        rule.waitUntil(WAIT_MILLIS) {
            rule.runOnUiThread {
                val position = native.map.cameraPosition
                snapshot.set(position.target?.let { CameraSnapshot(it.latitude, it.longitude, position.zoom) })
            }
            native.idle.get() && matches(snapshot.get(), expected)
        }
        rule.waitForIdle()
        rule.runOnUiThread {
            val position = native.map.cameraPosition
            snapshot.set(position.target?.let { CameraSnapshot(it.latitude, it.longitude, position.zoom) })
        }
        assertTrue("Native camera must retain latitude, longitude and zoom", native.idle.get() && matches(snapshot.get(), expected))
        return requireNotNull(snapshot.get())
    }

    private fun matches(
        actual: CameraSnapshot?,
        expected: CameraSnapshot,
    ): Boolean =
        actual != null && abs(actual.lat - expected.lat) < 0.00001 &&
            abs(actual.lng - expected.lng) < 0.00001 && abs(actual.zoom - expected.zoom) < 0.001

    private class NativeMap(
        val view: MapView,
        val map: MapLibreMap,
    ) {
        val idle = AtomicBoolean(true)
    }

    private companion object {
        const val WAIT_MILLIS = 15_000L
    }
}
