package dev.narumi.kestrel.feature.options

import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.library.LibraryItemKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OptionsPresentationTest {
    @Test
    fun disclosureStateDescriptionDoesNotRelyOnVisualState() {
        assertEquals("Collapsed", optionsDisclosureStateDescription(false))
        assertEquals("Expanded", optionsDisclosureStateDescription(true))
    }

    @Test
    fun sectionInventory_hasDistinctTitlesAndStartsAsOneFlatSummaryList() {
        assertEquals(
            listOf(
                "When app opens",
                "Map links",
                "Random routes",
                "Route recovery",
                "Cloud sync",
                "Web remote control",
            ),
            OptionsSection.entries.map(OptionsSection::title),
        )
        assertEquals(
            OptionsSection.entries.size,
            OptionsSection.entries
                .map { it.title }
                .toSet()
                .size,
        )
        OptionsSection.entries.forEach {
            assertFalse(it.defaultExpanded)
        }
    }

    @Test
    fun startupFavoriteEffectsExposeTheTypeSpecificCompatibilityBehavior() {
        assertEquals(
            "Starts mocking this saved point after launch.",
            startupFavoriteEffect(LibraryItemKind.Place),
        )
        assertEquals(
            "Opens this saved route as a preview; playback does not start.",
            startupFavoriteEffect(LibraryItemKind.Route),
        )
    }

    @Test
    fun summariesExposeActualSettings() {
        assertEquals("Last map position", startupSummary(StartupPreference.Mode.Last, null))
        assertEquals("Current device location", startupSummary(StartupPreference.Mode.Current, null))
        assertEquals("Favorite: Taipei 101", startupSummary(StartupPreference.Mode.Favorite, "Taipei 101"))
        assertEquals("Balanced · can rewind up to 5 s", playbackSummary(5))
        assertEquals("Last used: 50 points · 100 m spacing", randomRouteSummary(50, 100.0, true))
    }

    @Test
    fun cloudServerValidationRejectsAmbiguousOrUnsupportedAddresses() {
        assertTrue(isValidCloudServerAddress("https://kestrel.narumi.dev"))
        assertTrue(isValidCloudServerAddress("http://10.0.2.2:3300"))
        assertFalse(isValidCloudServerAddress("kestrel.narumi.dev"))
        assertFalse(isValidCloudServerAddress("file:///tmp/server"))
        assertFalse(isValidCloudServerAddress("https://"))
    }

    @Test
    fun cloudAndRemoteSummariesKeepSafetyStateVisible() {
        assertEquals("Checking sign-in…", cloudSummary(false, null, null))
        assertEquals("Action needed: Session expired", cloudSummary(true, "admin", "Session expired"))
        assertEquals("Signed in as admin", cloudSummary(true, "admin", null))
        assertEquals("Signed out", cloudSummary(true, null, null))
        assertEquals("Unavailable until cloud sign-in", remoteControlSummary(false, false, null, null))
        assertEquals("On · Pixel", remoteControlSummary(true, true, "Pixel", null))
        assertEquals("Action needed: Poll failed", remoteControlSummary(true, true, "Pixel", "Poll failed"))
    }
}
