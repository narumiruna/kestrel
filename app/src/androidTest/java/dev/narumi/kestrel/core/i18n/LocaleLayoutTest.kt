package dev.narumi.kestrel.core.i18n

import android.graphics.Bitmap
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.test.platform.app.InstrumentationRegistry
import dev.narumi.kestrel.MainActivity
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.location.LocationService
import dev.narumi.kestrel.core.location.RuntimeState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import java.io.File

/**
 * Requires an approved disposable emulator and -e localeLayouts true; never use a personal device.
 * The operator must pin the exact adb serial. No app data is cleared. Language and camera
 * preferences can change. Authentication, playback, and global font settings are not changed.
 * Run separately at each operator-selected font scale. PNGs stay in the target app's cache, not Git.
 */
class LocaleLayoutTest {
    val rule = createAndroidComposeRule<MainActivity>()

    @get:Rule
    val guardedRule: TestRule = RuleChain.outerRule(disposableLocaleTarget("localeLayouts")).around(rule)

    @Test
    fun allLanguagesRetainLocaleAndRenderCoreTabs() {
        rule.waitForIdle()
        assertEquals("The approved target must start idle", RuntimeState.Idle, LocationService.runtimeState.value)
        assertEquals("Capture every supported language", 18, AppLanguage.choices.size)
        val initialLanguage = AppLanguage.selected(rule.activity)
        val fontScale = rule.activity.resources.configuration.fontScale
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val directory = File(context.cacheDir, "i18n-layout-$fontScale")
        assertTrue("Cannot create screenshot directory: $directory", directory.isDirectory || directory.mkdirs())
        var failure: Throwable? = null
        try {
            AppLanguage.choices.forEach { choice ->
                select(choice.tag)
                assertEquals(choice.tag, AppLanguage.selected(rule.activity))
                assertEquals(
                    choice.tag,
                    rule.activity.resources.configuration.locales[0]
                        .toLanguageTag(),
                )
                captureCoreTabs(choice, directory, fontScale)
            }
        } catch (error: Throwable) {
            failure = error
            throw error
        } finally {
            try {
                select(initialLanguage)
            } catch (error: Throwable) {
                if (failure == null) throw error else failure.addSuppressed(error)
            }
        }
    }

    private fun captureCoreTabs(
        choice: LanguageChoice,
        directory: File,
        fontScale: Float,
    ) {
        // Start on Map: Settings and Favorites also use their navigation label as a screen header.
        navigate(R.string.nav_map)
        rule.onNodeWithText(text(R.string.choose_target)).assertIsDisplayed()
        val generateButton = rule.onNode(hasText(text(R.string.generate_random_route)) and hasClickAction()).assertIsDisplayed()
        val navigationTop = rule.onNode(navigationLabel(R.string.nav_map)).getUnclippedBoundsInRoot().top
        assertTrue(
            "The complete primary action must stay above bottom navigation: ${choice.tag}",
            generateButton.getUnclippedBoundsInRoot().bottom <= navigationTop + 0.5.dp,
        )
        rule
            .onNode(
                hasContentDescription(text(R.string.current_location_unavailable)) or
                    hasContentDescription(text(R.string.center_on_current_location)),
            ).assertIsDisplayed()
        screenshot(directory, choice.tag, "map", fontScale)

        navigate(R.string.nav_favorites)
        rule.onNodeWithText(text(R.string.your_places_your_next_route)).assertIsDisplayed()
        screenshot(directory, choice.tag, "favorites", fontScale)

        navigate(R.string.nav_settings)
        rule.onNodeWithText(text(R.string.options_make_kestrel_work_your_way)).assertIsDisplayed()
        rule.onNodeWithText(text(R.string.options_language)).assertIsDisplayed()
        rule.onNodeWithText(choice.label).assertIsDisplayed()
        screenshot(directory, choice.tag, "settings", fontScale)
    }

    private fun navigate(resourceId: Int) {
        assertNavigationLabels()
        val item = rule.onNode(navigationLabel(resourceId)).assertIsDisplayed()
        // Layout capture uses the labeled click action, without changing Android input mode.
        item.performClick()
        rule.waitForIdle()
        rule.onNode(navigationLabel(resourceId)).assertIsDisplayed().assertIsSelected()
        assertNavigationLabels()
        assertEquals("Safe navigation must not start a mock", RuntimeState.Idle, LocationService.runtimeState.value)
    }

    private fun assertNavigationLabels() {
        NAVIGATION_LABELS.forEach { resourceId ->
            assertTrue("Navigation accessibility text must not be empty", text(resourceId).isNotBlank())
            // The merged, clickable item exposes its localized visible text as its accessible name.
            rule.onNode(navigationLabel(resourceId)).assertIsDisplayed()
        }
    }

    private fun navigationLabel(resourceId: Int): SemanticsMatcher = hasText(text(resourceId)) and hasClickAction()

    // Use the actual Activity configuration, not English strings or a forced-locale test context.
    private fun text(resourceId: Int): String = rule.activity.getString(resourceId)

    private fun select(tag: String) {
        val previous = rule.activity
        val changed = AppLanguage.selected(previous) != tag
        rule.runOnUiThread { AppLanguage.select(rule.activity, tag) }
        awaitLanguage(tag, previous.takeIf { changed })
    }

    private fun awaitLanguage(
        tag: String,
        previous: MainActivity?,
    ) {
        rule.waitUntil(WAIT_MILLIS) {
            val activity = rule.activity
            activity !== previous && !activity.isDestroyed &&
                activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) &&
                AppLanguage.selected(activity) == tag &&
                activity.resources.configuration.locales[0]
                    .toLanguageTag() == tag &&
                NAVIGATION_LABELS.all { resourceId ->
                    rule.onAllNodes(navigationLabel(resourceId)).fetchSemanticsNodes().size == 1
                }
        }
        rule.waitForIdle()
        assertNavigationLabels()
    }

    private fun screenshot(
        directory: File,
        tag: String,
        tab: String,
        fontScale: Float,
    ) {
        assertTrue("Screenshot names must use ASCII locale tags", tag.matches(Regex("[A-Za-z0-9-]+")))
        assertEquals("Honor the operator-selected font scale", fontScale, rule.activity.resources.configuration.fontScale, 0f)
        rule.waitForIdle()
        val bitmap = requireNotNull(InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot())
        val file = File(directory, "$tag-$tab.png")
        try {
            file.outputStream().use { stream ->
                assertTrue("Screenshot compression failed: $file", bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream))
            }
            assertTrue("Screenshot is empty: $file", file.length() > 0)
        } finally {
            bitmap.recycle()
        }
    }

    private companion object {
        const val WAIT_MILLIS = 15_000L
        val NAVIGATION_LABELS = listOf(R.string.nav_map, R.string.nav_favorites, R.string.nav_settings)
    }
}
