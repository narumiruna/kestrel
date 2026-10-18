package dev.narumi.kestrel.core.i18n

import android.content.Context
import android.content.res.Configuration
import androidx.test.platform.app.InstrumentationRegistry
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.core.location.RuntimeState
import dev.narumi.kestrel.feature.map.currentMockSummary
import dev.narumi.kestrel.feature.map.formatRouteStatusDetails
import dev.narumi.kestrel.feature.map.previewSummary
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Test
import java.util.Locale

/** Resource-only tests. These do not change the saved app locale or start mock playback. */
class LocaleResourcesTest {
    private val targetContext = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun englishRoutePresentationRetainsExistingMeaning() {
        val context = context("en")
        assertEquals("3 waypoints · 20 km/h · Loop", formatRouteStatusDetails(context, 3, 20.0, MovementEngine.Mode.Loop))
        assertEquals("2 waypoints · 12.5 km/h · Ping-pong", formatRouteStatusDetails(context, 2, 12.5, MovementEngine.Mode.PingPong))
        val route = RuntimeState.Route(listOf(LatLng(0.0, 0.0), LatLng(1.0, 1.0)), 12.0, MovementEngine.Mode.Loop, false, "stable-id")
        assertEquals("Route · 2 waypoints · 12 km/h · Loop", currentMockSummary(context, route))
        assertEquals("Route preview · 3 waypoints · 10 km/h · Ping-pong", previewSummary(context, 3, 10.0, MovementEngine.Mode.PingPong))
    }

    @Test
    fun retainedFailureResolvesInNewLanguageWithoutMatchingEnglish() {
        val message = UiMessage(R.string.location_permission_error)
        val english = message.resolve(context("en"))
        val german = message.resolve(context("de"))
        assertNotEquals(english, german)
        assertEquals(R.string.location_permission_error, message.resourceId)
        assertFalse(german.contains("location_permission_error"))
    }

    @Test
    fun selectedLanguageFormatsNumbersButNotCoordinateRoundTrips() {
        assertEquals("12,5", context("de").displayNumber(12.5))
        assertEquals("25.50000, 121.25000", coordinates(25.5, 121.25))
        assertEquals(context("en").getString(R.string.nav_settings), context("unsupported").getString(R.string.nav_settings))
    }

    @Test
    fun polishUsesOneFewAndManyPluralForms() {
        val resources = context("pl").resources
        val one = resources.getQuantityString(R.plurals.waypoint_count, 1, "N")
        val few = resources.getQuantityString(R.plurals.waypoint_count, 2, "N")
        val many = resources.getQuantityString(R.plurals.waypoint_count, 5, "N")
        assertNotEquals(one, few)
        assertNotEquals(few, many)
    }

    @Test
    fun allSupportedLanguagesResolveAppOwnedTextAndServiceLabels() {
        val english = context("en")
        val englishFallbacks = mutableListOf<String>()
        AppLanguage.choices.forEach { choice ->
            val context = context(choice.tag)
            listOf(R.string.nav_map, R.string.nav_favorites, R.string.nav_settings, R.string.location_service_channel_name, R.string.location_service_action_stop).forEach {
                assertFalse(context.getString(it).isBlank())
            }
            if (choice.tag != "en") {
                if (english.getString(R.string.nav_settings) == context.getString(R.string.nav_settings)) {
                    englishFallbacks.add("${choice.tag}: UI")
                }
                if (english.getString(R.string.location_service_channel_name) == context.getString(R.string.location_service_channel_name)) {
                    englishFallbacks.add("${choice.tag}: service")
                }
            }
        }
        assertEquals("Each locale must resolve its own resources, not English fallback", emptyList<String>(), englishFallbacks)
    }

    private fun context(tag: String): Context =
        targetContext.createConfigurationContext(
            Configuration(targetContext.resources.configuration).apply { setLocale(Locale.forLanguageTag(tag)) },
        )
}
