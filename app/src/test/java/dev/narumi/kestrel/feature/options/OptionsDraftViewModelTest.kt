package dev.narumi.kestrel.feature.options

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import dev.narumi.kestrel.core.data.CloudSettings
import dev.narumi.kestrel.core.data.RandomRoutePreference
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class OptionsDraftViewModelTest {
    @Test
    fun defaultsLoadOnlyFromActualPreferences() {
        val drafts = OptionsDraftViewModel()
        drafts.loadRandomRoute(null)
        drafts.loadCloudSettings(null)
        assertEquals("", drafts.defaultPointCount.value)
        assertEquals("", drafts.defaultSpacingMeters.value)
        assertEquals("", drafts.apiBaseUrl.value)

        drafts.loadRandomRoute(RandomRoutePreference(defaultPointCount = 23, defaultSpacingMeters = 42.5))
        drafts.loadCloudSettings(CloudSettings("https://saved.example.test"))
        assertEquals("23", drafts.defaultPointCount.value)
        assertEquals("42.5", drafts.defaultSpacingMeters.value)
        assertEquals("https://saved.example.test", drafts.apiBaseUrl.value)
    }

    @Test
    fun recreatedOwnerRetainsInputsWhenPreferencesReload() {
        val store = ViewModelStore()
        try {
            val original = draftsFor(store)
            val randomRoute = RandomRoutePreference(defaultPointCount = 23, defaultSpacingMeters = 42.5)
            val cloud = CloudSettings("https://saved.example.test")
            original.loadRandomRoute(randomRoute)
            original.loadCloudSettings(cloud)
            original.defaultPointCount.value = ""
            original.defaultSpacingMeters.value = "12."
            original.apiBaseUrl.value = "https://draft.example.test/path"
            val form = CloudLoginForm("user", "password-draft", "recovery-code-draft", useRecoveryCode = true)
            original.loginForm.value = form

            // A recreated Activity retains its ViewModelStore but restarts preference collection.
            val recreated = draftsFor(store)
            recreated.loadRandomRoute(null)
            recreated.loadCloudSettings(null)
            recreated.loadRandomRoute(randomRoute)
            recreated.loadCloudSettings(cloud)

            assertSame(original, recreated)
            assertEquals("", recreated.defaultPointCount.value)
            assertEquals("12.", recreated.defaultSpacingMeters.value)
            assertEquals("https://draft.example.test/path", recreated.apiBaseUrl.value)
            assertEquals(form, recreated.loginForm.value)
        } finally {
            store.clear()
        }
    }

    @Test
    fun preferenceChangesRefreshCleanFieldsWithoutReplacingEdits() {
        val drafts = OptionsDraftViewModel()
        drafts.loadRandomRoute(RandomRoutePreference(defaultPointCount = 23, defaultSpacingMeters = 42.5))
        drafts.loadCloudSettings(CloudSettings("https://first.example.test"))
        drafts.defaultPointCount.value = "37"

        drafts.loadRandomRoute(RandomRoutePreference(defaultPointCount = 24, defaultSpacingMeters = 50.0))
        drafts.loadCloudSettings(CloudSettings("https://second.example.test"))
        assertEquals("37", drafts.defaultPointCount.value)
        assertEquals("50", drafts.defaultSpacingMeters.value)
        assertEquals("https://second.example.test", drafts.apiBaseUrl.value)

        drafts.apiBaseUrl.value = "https://unsaved.example.test"
        drafts.loadCloudSettings(CloudSettings("https://third.example.test"))
        assertEquals("https://unsaved.example.test", drafts.apiBaseUrl.value)

        // Once the saved values match the draft, later preference changes can update it.
        drafts.loadRandomRoute(RandomRoutePreference(defaultPointCount = 37, defaultSpacingMeters = 50.0))
        drafts.loadRandomRoute(RandomRoutePreference(defaultPointCount = 38, defaultSpacingMeters = 60.0))
        assertEquals("38", drafts.defaultPointCount.value)
        assertEquals("60", drafts.defaultSpacingMeters.value)
    }

    @Test
    fun editsBeforeFirstPreferenceEmissionAreNotReplaced() {
        val drafts = OptionsDraftViewModel()
        drafts.defaultPointCount.value = "31"
        drafts.defaultSpacingMeters.value = "80.5"
        drafts.apiBaseUrl.value = "https://draft.example.test"
        drafts.loadRandomRoute(RandomRoutePreference())
        drafts.loadCloudSettings(CloudSettings())
        assertEquals("31", drafts.defaultPointCount.value)
        assertEquals("80.5", drafts.defaultSpacingMeters.value)
        assertEquals("https://draft.example.test", drafts.apiBaseUrl.value)
    }

    @Test
    fun credentialsAreDiscardedWhenTheRetainedStoreIsCleared() {
        val store = ViewModelStore()
        val drafts = draftsFor(store)
        drafts.loginForm.value = CloudLoginForm("user", "password-draft", "123456")
        store.clear()
        assertEquals(CloudLoginForm(), drafts.loginForm.value)

        // A new store has no saved credentials to restore after process loss.
        val newStore = ViewModelStore()
        try {
            assertEquals(CloudLoginForm(), draftsFor(newStore).loginForm.value)
        } finally {
            newStore.clear()
        }
    }

    @Test
    fun cancelledCloudActionClearsBusyWithoutReplayingOrReportingFailure() =
        runBlocking {
            var busy = false
            var error: OptionsMessage? = null
            var executions = 0
            val action =
                launch(start = CoroutineStart.UNDISPATCHED) {
                    runCloudAction(
                        setLoading = { busy = it },
                        setError = { error = it },
                        setMessage = {},
                    ) {
                        executions++
                        awaitCancellation()
                    }
                }
            assertTrue(busy)
            action.cancelAndJoin()
            assertTrue(action.isCancelled)
            assertFalse(busy)
            assertNull(error)
            assertEquals(1, executions)
        }

    private fun draftsFor(store: ViewModelStore): OptionsDraftViewModel = ViewModelProvider(store, ViewModelProvider.NewInstanceFactory())[OptionsDraftViewModel::class.java]
}
