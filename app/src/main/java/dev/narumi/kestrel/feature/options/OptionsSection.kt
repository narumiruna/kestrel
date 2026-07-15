package dev.narumi.kestrel.feature.options

import dev.narumi.kestrel.core.data.StartupPreference

internal enum class OptionsSection(
    val title: String,
    val defaultExpanded: Boolean = false,
) {
    Startup("When opening the app", true),
    MapLinks("Map links"),
    Playback("Mock playback"),
    RandomRoute("Random route defaults"),
    Cloud("Cloud sync"),
    RemoteControl("Web remote control"),
}

internal fun startupSummary(
    mode: StartupPreference.Mode,
    favoriteName: String?,
): String =
    when (mode) {
        StartupPreference.Mode.Last -> "Last map position"
        StartupPreference.Mode.Current -> "Current device location"
        StartupPreference.Mode.Favorite -> favoriteName?.let { "Favorite: $it" } ?: "Choose a favorite"
    }

internal fun optionsDisclosureStateDescription(expanded: Boolean): String = if (expanded) "Expanded" else "Collapsed"

internal fun playbackSummary(seconds: Int): String = "Every $seconds s"

internal fun randomRouteSummary(
    pointCount: Int,
    spacingMeters: Double,
    usesLastSettings: Boolean,
): String =
    "${if (usesLastSettings) "Last used" else "Default"}: $pointCount points · " +
        "${spacingMeters.toOptionMeters()} spacing"

internal fun cloudSummary(
    sessionLoaded: Boolean,
    username: String?,
    error: String?,
): String =
    when {
        error != null -> "Action needed: $error"
        !sessionLoaded -> "Checking sign-in…"
        username != null -> "Signed in as $username"
        else -> "Signed out"
    }

internal fun remoteControlSummary(
    enabled: Boolean,
    signedIn: Boolean,
    deviceName: String?,
    error: String?,
): String =
    when {
        error != null -> "Action needed: $error"
        !signedIn -> "Unavailable until cloud sign-in"
        enabled -> "On · ${deviceName ?: "Registering device"}"
        else -> "Off"
    }

private fun Double.toOptionMeters(): String = if (this % 1.0 == 0.0) "${toInt()} m" else "$this m"
