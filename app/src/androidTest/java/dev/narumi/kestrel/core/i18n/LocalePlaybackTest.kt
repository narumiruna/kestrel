package dev.narumi.kestrel.core.i18n

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.res.Configuration
import android.service.notification.StatusBarNotification
import androidx.compose.ui.test.ComposeTimeoutException
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.Lifecycle
import androidx.test.platform.app.InstrumentationRegistry
import dev.narumi.kestrel.MainActivity
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.MockState
import dev.narumi.kestrel.core.data.RouteState
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.LocationOperationAction
import dev.narumi.kestrel.core.location.LocationOperationResult
import dev.narumi.kestrel.core.location.LocationService
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.RuntimeState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import java.util.Locale

/**
 * Changes actual mock playback. Requires an approved disposable emulator and -e localePlayback true.
 * The operator must pin the exact adb serial and grant fine/coarse location, notification permission
 * on API 33+, and the mock_location appop before execution. Never run on a personal device.
 * No app data is cleared. Playback and camera preferences can change. Credentials, cloud settings,
 * and backend state are not changed.
 */
class LocalePlaybackTest {
    val rule = createAndroidComposeRule<MainActivity>()

    @get:Rule
    val guardedRule: TestRule = RuleChain.outerRule(disposableLocaleTarget("localePlayback")).around(rule)

    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val prefs by lazy { KestrelPrefs(context) }
    private lateinit var savedState: StateFlow<MockState?>
    private val notifications by lazy { context.getSystemService(NotificationManager::class.java) }

    @Test
    fun pausedRouteAndNotificationSurviveLanguageChange() = verifyLanguageChange(paused = true)

    @Test
    fun playingRouteAndNotificationSurviveLanguageChange() = verifyLanguageChange(paused = false)

    private fun verifyLanguageChange(paused: Boolean): Unit =
        runBlocking {
            rule.waitForIdle()
            // Fail before issuing any service action; never replace an existing mock.
            assertEquals("The approved target must start idle", RuntimeState.Idle, LocationService.runtimeState.value)
            val initialLocale = AppLanguage.selected(rule.activity)
            val operations = MutableStateFlow<List<LocationOperationResult>>(emptyList())
            val observationJob = Job(coroutineContext[Job])
            val observationScope = CoroutineScope(Dispatchers.Default + observationJob)
            observationScope.launch(start = CoroutineStart.UNDISPATCHED) {
                LocationService.operationResults.drop(LocationService.operationResults.replayCache.size).collect {
                    operations.value = operations.value + it
                }
            }
            var startRequested = false
            var playbackId: String? = null
            var failure: Throwable? = null
            try {
                // Subscribe before issuing service actions. A new DataStore 1.2.1 collector opened
                // during an atomic write can read the old value with the new version and then
                // suppress the committed value at that version. Keep this observer for all waits.
                savedState = bounded("observing the initial saved state") { prefs.mockState.stateIn(observationScope) }
                assertNull("The approved target must have no saved mock", savedState.value)
                select("en")
                assertEquals(RuntimeState.Idle, LocationService.runtimeState.value)
                startRequested = true
                operation(operations, LocationService.startRoute(context, WAYPOINTS, SPEED_KMH, MODE), LocationOperationAction.StartRoute)
                val playing = awaitRoute(paused = false)
                playbackId = playing.playbackId
                assertRoute(playing, paused = false, playbackId = playbackId)
                awaitNotification("en", paused = false)
                awaitMovement(WAYPOINTS.first())
                operation(operations, LocationService.pause(context), LocationOperationAction.Pause)
                assertRoute(awaitRoute(paused = true), paused = true, playbackId = playbackId)
                val pausedPoint = requireNotNull(LocationService.currentMock.value)
                val saved = savedRoute { route -> route.progressMeters > 0.0 && pointAt(route) == pausedPoint }
                verifySelectedLanguage(paused, playbackId, pausedPoint, saved, operations)
            } catch (error: Throwable) {
                failure = error
            } finally {
                failure =
                    captureFailure(failure) {
                        val active = LocationService.runtimeState.value as? RuntimeState.Route
                        // Stop only this test's route, including a start that succeeded before an assertion failed.
                        if (startRequested && active?.waypoints == WAYPOINTS && (playbackId == null || active.playbackId == playbackId)) {
                            operation(operations, LocationService.stop(context), LocationOperationAction.Stop)
                            bounded("stopping the test route") { LocationService.runtimeState.first { it == RuntimeState.Idle } }
                            bounded("clearing the test route state") { savedState.first { it == null } }
                            rule.waitUntil(WAIT_MILLIS) { notifications.activeNotifications.none { it.id == NOTIFICATION_ID } }
                        }
                    }
                failure = captureFailure(failure) { select(initialLocale) }
                observationJob.cancelAndJoin()
            }
            failure?.let { throw it }
        }

    private suspend fun captureFailure(
        primary: Throwable?,
        block: suspend () -> Unit,
    ): Throwable? =
        try {
            block()
            primary
        } catch (error: Throwable) {
            if (primary == null) error else primary.apply { addSuppressed(error) }
        }

    private suspend fun verifySelectedLanguage(
        paused: Boolean,
        playbackId: String,
        pausedPoint: LatLng,
        saved: RouteState,
        operations: MutableStateFlow<List<LocationOperationResult>>,
    ) {
        if (!paused) {
            operation(operations, LocationService.resume(context), LocationOperationAction.Resume)
            assertRoute(awaitRoute(paused = false), paused = false, playbackId = playbackId)
        }
        val originalNotification = awaitNotification("en", paused)
        val beforeOperations = operations.value
        select("ja")
        val translatedNotification = awaitNotification("ja", paused)
        assertRoute(awaitRoute(paused), paused, playbackId)
        assertEquals(originalNotification.id, translatedNotification.id)
        assertEquals(originalNotification.key, translatedNotification.key)
        assertEquals(originalNotification.notification.channelId, translatedNotification.notification.channelId)
        val after = savedRoute { it.progressMeters >= saved.progressMeters }
        assertSavedRoute(saved, after, paused)
        if (paused) {
            assertEquals(pausedPoint, LocationService.currentMock.value)
            // Exercise the real resume API after recreation, not a UI-local playback flag.
            assertEquals("Language change must not replay a service operation", beforeOperations, operations.value)
            operation(operations, LocationService.resume(context), LocationOperationAction.Resume)
            assertRoute(awaitRoute(paused = false), paused = false, playbackId = playbackId)
            awaitMovement(pausedPoint)
            awaitNotification("ja", paused = false)
        } else {
            awaitMovement(requireNotNull(LocationService.currentMock.value))
            assertEquals("Language change must not replay a service operation", beforeOperations, operations.value)
        }
        assertEquals(
            listOf(LocationOperationAction.StartRoute, LocationOperationAction.Pause, LocationOperationAction.Resume),
            operations.value.map { it.action },
        )
    }

    private suspend fun operation(
        operations: MutableStateFlow<List<LocationOperationResult>>,
        requestId: String,
        action: LocationOperationAction,
    ) {
        val results =
            bounded("receiving the $action result") {
                operations.first { results -> results.any { it.requestId == requestId } }
            }
        val result = results.last { it.requestId == requestId }
        assertEquals(action, result.action)
        assertTrue("Service operation $action failed: ${result.message.resourceId}", result.succeeded)
    }

    private suspend fun awaitRoute(paused: Boolean): RuntimeState.Route =
        bounded("receiving route state (paused=$paused)") {
            LocationService.runtimeState.first { it is RuntimeState.Route && it.paused == paused } as RuntimeState.Route
        }

    private suspend fun awaitMovement(previous: LatLng) {
        bounded("advancing the test route") { LocationService.currentMock.first { it != null && it != previous } }
    }

    private suspend fun savedRoute(predicate: (RouteState) -> Boolean): RouteState =
        bounded("persisting the route progress snapshot") {
            requireNotNull(
                savedState
                    .first { state ->
                        state?.mode == MockState.Mode.Route && state.route?.let { route ->
                            route.lats.contentEquals(WAYPOINTS.map { it.lat }.toDoubleArray()) &&
                                route.lngs.contentEquals(WAYPOINTS.map { it.lng }.toDoubleArray()) && predicate(route)
                        } == true
                    }?.route,
            )
        }

    private suspend fun <T> bounded(
        stage: String,
        block: suspend () -> T,
    ): T =
        try {
            withTimeout(WAIT_MILLIS) { block() }
        } catch (error: TimeoutCancellationException) {
            throw AssertionError("Timed out while $stage", error)
        }

    private fun pointAt(route: RouteState): LatLng = MovementEngine(WAYPOINTS, route.speedKmh / 3.6, MODE, route.progressMeters, route.forward).advance(0.0).point

    private fun assertRoute(
        actual: RuntimeState.Route,
        paused: Boolean,
        playbackId: String,
    ) {
        assertEquals(WAYPOINTS, actual.waypoints)
        assertEquals(SPEED_KMH, actual.speedKmh, 0.0)
        assertEquals(MODE, actual.mode)
        assertEquals(paused, actual.paused)
        assertFalse(actual.playbackId.isBlank())
        assertEquals("Locale recreation must not replace or restart playback", playbackId, actual.playbackId)
    }

    private fun assertSavedRoute(
        before: RouteState,
        after: RouteState,
        paused: Boolean,
    ) {
        assertArrayEquals(before.lats, after.lats, 0.0)
        assertArrayEquals(before.lngs, after.lngs, 0.0)
        assertEquals(SPEED_KMH, after.speedKmh, 0.0)
        assertEquals(MODE.name, after.mode)
        assertEquals(before.forward, after.forward)
        if (paused) {
            assertEquals(before.progressMeters, after.progressMeters, 0.0)
        } else {
            assertTrue("Playing progress must not reset", after.progressMeters >= before.progressMeters)
        }
    }

    private fun select(tag: String) {
        val previous = rule.activity
        val changed = AppLanguage.selected(previous) != tag
        rule.runOnUiThread { AppLanguage.select(rule.activity, tag) }
        rule.waitUntil(WAIT_MILLIS) {
            val activity = rule.activity
            (!changed || activity !== previous) && !activity.isDestroyed &&
                activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) &&
                AppLanguage.selected(activity) == tag &&
                activity.resources.configuration.locales[0]
                    .toLanguageTag() == tag
        }
        rule.waitForIdle()
    }

    private fun awaitNotification(
        tag: String,
        paused: Boolean,
    ): StatusBarNotification {
        // Expected labels come from an independent target-resource context, not the service's locale helper.
        val resources = localizedContext(tag)
        val title = resources.getString(R.string.location_service_title)
        val text = resources.getString(if (paused) R.string.location_service_text_route_paused else R.string.location_service_text_route_playing)
        val action = resources.getString(if (paused) R.string.location_service_action_resume else R.string.location_service_action_pause)
        val stop = resources.getString(R.string.location_service_action_stop)
        var status = "not checked"
        try {
            rule.waitUntil(WAIT_MILLIS) {
                val notification = notifications.activeNotifications.singleOrNull { it.id == NOTIFICATION_ID }?.notification
                val channel = notifications.getNotificationChannel(CHANNEL_ID)
                val checks =
                    mapOf(
                        "notification" to (notification != null),
                        "channel" to (channel != null),
                        "title" to (notification?.extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString() == title),
                        "text" to (notification?.extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString() == text),
                        "actions" to (notification?.actions?.map { it.title.toString() } == listOf(action, stop)),
                        "channelName" to (channel?.name?.toString() == resources.getString(R.string.location_service_channel_name)),
                        "channelDescription" to (channel?.description == resources.getString(R.string.location_service_channel_description)),
                    )
                status = checks.toString()
                checks.values.all { it }
            }
        } catch (error: ComposeTimeoutException) {
            throw AssertionError("Notification did not match (tag=$tag, paused=$paused): $status", error)
        }
        val active = notifications.activeNotifications.single { it.id == NOTIFICATION_ID }
        assertEquals(context.packageName, active.packageName)
        assertEquals(CHANNEL_ID, active.notification.channelId)
        assertEquals(
            title,
            active.notification.extras
                .getCharSequence(Notification.EXTRA_TITLE)
                ?.toString(),
        )
        assertEquals(
            text,
            active.notification.extras
                .getCharSequence(Notification.EXTRA_TEXT)
                ?.toString(),
        )
        assertTrue(active.notification.flags and Notification.FLAG_ONGOING_EVENT != 0)
        return active
    }

    private fun localizedContext(tag: String): Context =
        context.createConfigurationContext(
            Configuration(context.resources.configuration).apply { setLocale(Locale.forLanguageTag(tag)) },
        )

    private companion object {
        const val WAIT_MILLIS = 15_000L
        const val CHANNEL_ID = "kestrel_location"
        const val NOTIFICATION_ID = 1001
        const val SPEED_KMH = 18.0
        val MODE = MovementEngine.Mode.Once

        // Fixed, multi-kilometre route: it cannot finish during the bounded locale checks.
        val WAYPOINTS = listOf(LatLng(25.031, 121.521), LatLng(25.131, 121.621), LatLng(25.231, 121.721))
    }
}
