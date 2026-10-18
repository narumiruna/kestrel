package dev.narumi.kestrel.core.i18n

import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import dev.narumi.kestrel.MainActivity
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.location.LocationService
import dev.narumi.kestrel.core.location.RuntimeState
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule

/** Changes the test app locale. Requires an approved disposable emulator and -e localeLifecycle true. */
class LocaleLifecycleTest {
    val rule = createAndroidComposeRule<MainActivity>()

    @get:Rule
    val guardedRule: TestRule = RuleChain.outerRule(disposableLocaleTarget("localeLifecycle")).around(rule)

    @Test
    fun languageRecreationPreservesCoordinateInputAndNavigationRetainsPreview() {
        val initialLocale = AppLanguage.selected(rule.activity)
        val initialRuntime = LocationService.runtimeState.value
        try {
            select("en")
            rule.onNodeWithText(text(R.string.choose_target)).performClick()
            rule.onNodeWithText(text(R.string.coordinates_or_maps_url)).performTextInput("25.5, 121.25")

            select("de")
            rule.onNodeWithText(text(R.string.coordinates_or_maps_url)).assertTextContains("25.5, 121.25")
            rule.onNodeWithText(text(R.string.preview_on_map)).performClick()
            rule.onNodeWithText(text(R.string.point_preview)).assertExists()

            rule.onNodeWithText(text(R.string.nav_settings)).performClick()
            select("ja")
            rule.onNodeWithText(text(R.string.nav_map)).performClick()
            rule.onNodeWithText(text(R.string.point_preview)).assertExists()
            assertEquals(initialRuntime, LocationService.runtimeState.value)
            assertEquals(RuntimeState.Idle, initialRuntime)
        } finally {
            rule.runOnUiThread { AppLanguage.select(rule.activity, initialLocale) }
        }
    }

    private fun text(resourceId: Int): String = AppLanguage.context(rule.activity).getString(resourceId)

    private fun select(tag: String) {
        rule.runOnUiThread { AppLanguage.select(rule.activity, tag) }
        rule.waitUntil(15_000) {
            AppLanguage.selected(rule.activity) == tag &&
                rule.onAllNodesWithText(text(R.string.nav_map)).fetchSemanticsNodes().isNotEmpty()
        }
        rule.waitForIdle()
    }
}
