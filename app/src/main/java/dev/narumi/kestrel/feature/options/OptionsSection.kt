package dev.narumi.kestrel.feature.options

import androidx.annotation.StringRes
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.data.MockPlaybackSettings
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.library.LibraryItemKind

internal enum class OptionsSection(
    @param:StringRes val title: Int,
    val defaultExpanded: Boolean = false,
) {
    Startup(R.string.options_startup_title),
    MapLinks(R.string.options_map_links_title),
    RandomRoute(R.string.options_random_route_title),
    Playback(R.string.options_playback_title),
    Cloud(R.string.options_cloud_title),
    RemoteControl(R.string.options_remote_title),
}

internal fun startupSummary(
    mode: StartupPreference.Mode,
    favoriteName: String?,
): OptionsMessage =
    when (mode) {
        StartupPreference.Mode.Last -> {
            optionsMessage(R.string.options_last_map_position)
        }

        StartupPreference.Mode.Current -> {
            optionsMessage(R.string.options_current_location)
        }

        StartupPreference.Mode.Favorite -> {
            favoriteName?.let { optionsMessage(R.string.options_favorite_named, it) }
                ?: optionsMessage(R.string.options_choose_favorite)
        }
    }

@StringRes
internal fun startupFavoriteEffect(kind: LibraryItemKind): Int =
    when (kind) {
        LibraryItemKind.Place -> R.string.options_startup_place_effect
        LibraryItemKind.Route -> R.string.options_startup_route_effect
    }

@StringRes
internal fun optionsDisclosureStateDescription(expanded: Boolean): Int = if (expanded) R.string.options_expanded else R.string.options_collapsed

internal fun playbackSummary(seconds: Int): OptionsMessage =
    OptionsMessage.Plural(
        when (seconds) {
            1 -> R.plurals.options_recovery_accurate
            MockPlaybackSettings.DEFAULT_PROGRESS_WRITE_INTERVAL_SECONDS -> R.plurals.options_recovery_balanced
            15 -> R.plurals.options_recovery_fewer_writes
            else -> R.plurals.options_recovery_custom
        },
        seconds,
        listOf(seconds),
    )

internal fun randomRouteSummary(
    pointCount: Int,
    spacingMeters: Double,
    usesLastSettings: Boolean,
): OptionsMessage =
    OptionsMessage.Plural(
        if (usesLastSettings) R.plurals.options_random_last_used else R.plurals.options_random_default,
        pointCount,
        listOf(pointCount, spacingMeters),
    )

internal fun cloudSummary(
    sessionLoaded: Boolean,
    username: String?,
    error: String?,
): OptionsMessage =
    when {
        error != null -> optionsMessage(R.string.options_action_needed, error)
        !sessionLoaded -> optionsMessage(R.string.options_checking_sign_in)
        username != null -> optionsMessage(R.string.options_signed_in_as, username)
        else -> optionsMessage(R.string.options_signed_out)
    }

internal fun remoteControlSummary(
    enabled: Boolean,
    signedIn: Boolean,
    deviceName: String?,
    error: String?,
): OptionsMessage =
    when {
        error != null -> optionsMessage(R.string.options_action_needed, error)
        !signedIn -> optionsMessage(R.string.options_remote_unavailable)
        enabled && deviceName != null -> optionsMessage(R.string.options_remote_on, deviceName)
        enabled -> optionsMessage(R.string.options_remote_registering)
        else -> optionsMessage(R.string.options_off)
    }
