package dev.narumi.kestrel.feature.options

import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.cloud.AndroidQrLoginDetails
import dev.narumi.kestrel.core.cloud.AndroidQrLoginMethod
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.library.LibraryItemKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OptionsPresentationTest {
    @Test
    fun disclosureStateDescriptionDoesNotRelyOnVisualState() {
        assertEquals(R.string.options_collapsed, optionsDisclosureStateDescription(false))
        assertEquals(R.string.options_expanded, optionsDisclosureStateDescription(true))
    }

    @Test
    fun sectionInventory_hasDistinctTitlesAndStartsAsOneFlatSummaryList() {
        assertEquals(
            listOf(
                R.string.options_startup_title,
                R.string.options_map_links_title,
                R.string.options_random_route_title,
                R.string.options_playback_title,
                R.string.options_cloud_title,
                R.string.options_remote_title,
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
            R.string.options_startup_place_effect,
            startupFavoriteEffect(LibraryItemKind.Place),
        )
        assertEquals(
            R.string.options_startup_route_effect,
            startupFavoriteEffect(LibraryItemKind.Route),
        )
    }

    @Test
    fun summariesExposeActualSettings() {
        assertEquals(optionsMessage(R.string.options_last_map_position), startupSummary(StartupPreference.Mode.Last, null))
        assertEquals(optionsMessage(R.string.options_current_location), startupSummary(StartupPreference.Mode.Current, null))
        assertEquals(optionsMessage(R.string.options_favorite_named, "Taipei 101"), startupSummary(StartupPreference.Mode.Favorite, "Taipei 101"))
        assertEquals(OptionsMessage.Plural(R.plurals.options_recovery_balanced, 5, listOf(5)), playbackSummary(5))
        assertEquals(OptionsMessage.Plural(R.plurals.options_random_last_used, 50, listOf(50, 100.0)), randomRouteSummary(50, 100.0, true))
    }

    @Test
    fun summaryMessagesRetainValuesUntilPresentation() {
        assertEquals(
            OptionsMessage.Plural(R.plurals.options_recovery_accurate, 1, listOf(1)),
            playbackSummary(1),
        )
        assertEquals(
            OptionsMessage.Plural(R.plurals.options_recovery_custom, 12, listOf(12)),
            playbackSummary(12),
        )
        assertEquals(
            OptionsMessage.Plural(R.plurals.options_random_default, 3, listOf(3, 12.5)),
            randomRouteSummary(3, 12.5, false),
        )
        assertEquals(
            optionsMessage(R.string.options_choose_favorite),
            startupSummary(StartupPreference.Mode.Favorite, null),
        )
        assertEquals(
            optionsMessage(R.string.options_favorite_named, "使用者名稱 %s"),
            startupSummary(StartupPreference.Mode.Favorite, "使用者名稱 %s"),
        )
    }

    @Test
    fun errorStateKeepsLateMessageAndDoesNotExposeExceptionProse() {
        val first = java.io.IOException("secret server response").toOptionsError()
        val second = java.io.IOException("different response language").toOptionsError()
        assertEquals(first, second)
        assertTrue(first is OptionsMessage.Cloud)
        val state = AndroidQrLoginUiState.Error(first, retryPendingAttempt = true)
        assertEquals(first, state.summary())
        assertTrue(state.blocksOtherAuthentication())
    }

    @Test
    fun recoverableMessagesKeepResourceIdentityAcrossActivityRecreation() {
        val messages =
            listOf(
                optionsMessage(R.string.options_signed_in_as, "使用者"),
                playbackSummary(12),
                java.io.IOException("private response").toOptionsError(),
            )
        val saved = java.io.ByteArrayOutputStream()
        java.io.ObjectOutputStream(saved).use { it.writeObject(messages) }
        val restored =
            java.io.ObjectInputStream(java.io.ByteArrayInputStream(saved.toByteArray())).use {
                it.readObject()
            }
        assertEquals(messages, restored)
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
    fun androidQrLoginStatesBlockCompetingAuthAndExposeConfirmationDetails() {
        val details =
            AndroidQrLoginDetails(
                appVersion = "0.8.0",
                deviceName = "Google Pixel",
                expiresAt = 1_800_000_000_000L,
                matchingCode = "123-456",
                pollIntervalSeconds = 5,
                publicOrigin = "https://cloud.example.test",
                username = "admin",
            )
        assertTrue(AndroidQrLoginUiState.Restoring.blocksOtherAuthentication())
        assertEquals(optionsMessage(R.string.options_qr_restoring), AndroidQrLoginUiState.Restoring.summary())
        val confirmation = AndroidQrLoginUiState.Confirmation(details)
        assertTrue(confirmation.blocksOtherAuthentication())
        assertEquals(
            optionsMessage(R.string.options_qr_confirm_summary, "admin", "https://cloud.example.test"),
            confirmation.summary(),
        )
        assertTrue(AndroidQrLoginUiState.Confirming(details).blocksOtherAuthentication())
        val waiting = AndroidQrLoginUiState.Waiting(details, 5)
        assertTrue(waiting.blocksOtherAuthentication())
        assertTrue(
            AndroidQrLoginUiState
                .Error(optionsMessage(R.string.options_unexpected_cloud_error), retryPendingAttempt = true)
                .blocksOtherAuthentication(),
        )
        assertFalse(
            AndroidQrLoginUiState
                .Error(optionsMessage(R.string.options_scanner_failed), retryPendingAttempt = false)
                .blocksOtherAuthentication(),
        )
        assertFalse(AndroidQrLoginUiState.Expired.blocksOtherAuthentication())
        assertEquals(optionsMessage(R.string.options_qr_expired), AndroidQrLoginUiState.Expired.summary())

        val disabledMethod = AndroidQrLoginMethod(enabled = false)
        assertTrue(
            shouldShowAndroidQrLoginDiscoveryNotice(
                disabledMethod,
                AndroidQrLoginUiState.Idle,
            ),
        )
        assertFalse(shouldShowAndroidQrLoginDiscoveryNotice(disabledMethod, AndroidQrLoginUiState.Restoring))
        assertFalse(shouldShowAndroidQrLoginDiscoveryNotice(disabledMethod, confirmation))
        assertFalse(shouldShowAndroidQrLoginDiscoveryNotice(disabledMethod, waiting))
        assertFalse(
            shouldShowAndroidQrLoginDiscoveryNotice(
                disabledMethod,
                AndroidQrLoginUiState.Error(optionsMessage(R.string.options_unexpected_cloud_error), retryPendingAttempt = true),
            ),
        )
    }

    @Test
    fun cloudAndRemoteSummariesKeepSafetyStateVisible() {
        assertEquals(optionsMessage(R.string.options_checking_sign_in), cloudSummary(false, null, null))
        assertEquals(optionsMessage(R.string.options_action_needed, "Session expired"), cloudSummary(true, "admin", "Session expired"))
        assertEquals(optionsMessage(R.string.options_signed_in_as, "admin"), cloudSummary(true, "admin", null))
        assertEquals(optionsMessage(R.string.options_signed_out), cloudSummary(true, null, null))
        assertEquals(optionsMessage(R.string.options_remote_unavailable), remoteControlSummary(false, false, null, null))
        assertEquals(optionsMessage(R.string.options_remote_on, "Pixel"), remoteControlSummary(true, true, "Pixel", null))
        assertEquals(optionsMessage(R.string.options_remote_registering), remoteControlSummary(true, true, null, null))
        assertEquals(optionsMessage(R.string.options_off), remoteControlSummary(false, true, "Pixel", null))
        assertEquals(optionsMessage(R.string.options_action_needed, "Poll failed"), remoteControlSummary(true, true, "Pixel", "Poll failed"))
    }
}
