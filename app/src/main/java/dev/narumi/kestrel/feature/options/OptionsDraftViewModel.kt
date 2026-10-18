package dev.narumi.kestrel.feature.options

import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel
import dev.narumi.kestrel.core.data.CloudSettings
import dev.narumi.kestrel.core.data.RandomRoutePreference

internal data class CloudLoginForm(
    val username: String = "",
    val password: String = "",
    val oneTimeCode: String = "",
    val useRecoveryCode: Boolean = false,
)

// Retain drafts only in memory across activity recreation. Do not use SavedStateHandle,
// rememberSaveable, or serialization for credentials, OTPs, or recovery codes.
internal class OptionsDraftViewModel : ViewModel() {
    val loginForm = mutableStateOf(CloudLoginForm())
    val defaultPointCount = mutableStateOf("")
    val defaultSpacingMeters = mutableStateOf("")
    val apiBaseUrl = mutableStateOf("")

    private var randomRouteBaseline: RandomRoutePreference? = null
    private var cloudBaseline: CloudSettings? = null

    fun loadRandomRoute(preference: RandomRoutePreference?) {
        if (preference == null) return
        val previous = randomRouteBaseline
        if (defaultPointCount.value == (previous?.defaultPointCount?.toString() ?: "")) {
            defaultPointCount.value = preference.defaultPointCount.toString()
        }
        if (defaultSpacingMeters.value == (previous?.defaultSpacingMeters?.let(::formatMeters) ?: "")) {
            defaultSpacingMeters.value = formatMeters(preference.defaultSpacingMeters)
        }
        randomRouteBaseline = preference
    }

    fun loadCloudSettings(settings: CloudSettings?) {
        if (settings == null) return
        if (apiBaseUrl.value == (cloudBaseline?.apiBaseUrl ?: "")) {
            apiBaseUrl.value = settings.apiBaseUrl
        }
        cloudBaseline = settings
    }

    override fun onCleared() {
        loginForm.value = CloudLoginForm()
    }
}
