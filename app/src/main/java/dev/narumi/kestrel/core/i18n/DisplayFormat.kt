package dev.narumi.kestrel.core.i18n

import android.content.Context
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.location.MovementEngine
import java.text.NumberFormat
import java.util.Locale

fun displayNumber(
    value: Number,
    locale: Locale,
    maximumFractionDigits: Int = 1,
): String =
    NumberFormat
        .getNumberInstance(locale)
        .apply {
            isGroupingUsed = false
            this.maximumFractionDigits = maximumFractionDigits
        }.format(value)

fun Context.displayNumber(
    value: Number,
    maximumFractionDigits: Int = 1,
): String = displayNumber(value, resources.configuration.locales[0], maximumFractionDigits)

/** Coordinate editing, copying, and round trips always use the decimal point. */
fun coordinates(
    latitude: Double,
    longitude: Double,
): String = String.format(Locale.US, "%.5f, %.5f", latitude, longitude)

fun Context.speed(value: Double): String = getString(R.string.display_speed, displayNumber(value))

fun Context.distance(meters: Double): String =
    if (meters >= 1000.0) {
        getString(R.string.display_kilometers, displayNumber(meters / 1000.0))
    } else {
        getString(R.string.display_meters, displayNumber(meters))
    }

fun Context.waypointCount(count: Int): String = resources.getQuantityString(R.plurals.waypoint_count, count, displayNumber(count, 0))

fun MovementEngine.Mode.labelResource(): Int =
    when (this) {
        MovementEngine.Mode.Once -> R.string.playback_once
        MovementEngine.Mode.Loop -> R.string.playback_loop
        MovementEngine.Mode.PingPong -> R.string.playback_ping_pong
    }

fun Context.routeDetails(
    count: Int,
    speedKmh: Double,
    mode: MovementEngine.Mode,
): String = getString(R.string.route_details, waypointCount(count), speed(speedKmh), getString(mode.labelResource()))
