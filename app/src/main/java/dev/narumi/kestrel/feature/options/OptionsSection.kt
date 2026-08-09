package dev.narumi.kestrel.feature.options

import dev.narumi.kestrel.core.data.MockPlaybackSettings
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.library.LibraryItemKind

internal enum class OptionsSection(
    val title: String,
    val defaultExpanded: Boolean = false,
) {
    Startup("When app opens"),
    MapLinks("Map links"),
    RandomRoute("Random routes"),
    Playback("Route recovery"),
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

internal fun startupFavoriteEffect(kind: LibraryItemKind): String =
    when (kind) {
        LibraryItemKind.Place -> "Starts mocking this saved point after launch."
        LibraryItemKind.Route -> "Opens this saved route as a preview; playback does not start."
    }

internal fun optionsDisclosureStateDescription(expanded: Boolean): String = if (expanded) "Expanded" else "Collapsed"

internal fun playbackSummary(seconds: Int): String =
    when (seconds) {
        1 -> "More accurate · can rewind up to 1 s"
        MockPlaybackSettings.DEFAULT_PROGRESS_WRITE_INTERVAL_SECONDS -> "Balanced · can rewind up to 5 s"
        15 -> "Fewer writes · can rewind up to 15 s"
        else -> "Custom · can rewind up to $seconds s"
    }

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
