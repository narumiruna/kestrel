package dev.narumi.kestrel.core.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.getSystemService

@SuppressLint("MissingPermission")
@Composable
fun rememberCurrentLocation(enabled: Boolean): State<LatLng?> {
    val context = LocalContext.current
    val state = remember { mutableStateOf<LatLng?>(null) }

    DisposableEffect(enabled) {
        if (!enabled) return@DisposableEffect onDispose {}
        val lm = context.getSystemService<LocationManager>()
            ?: return@DisposableEffect onDispose {}
        val listener = LocationListener { loc -> state.value = loc.toLatLng() }
        val providers = listOf(
            LocationManager.GPS_PROVIDER,
            LocationManager.NETWORK_PROVIDER,
        )
        providers.forEach { provider ->
            runCatching {
                lm.getLastKnownLocation(provider)?.let { state.value = it.toLatLng() }
                lm.requestLocationUpdates(provider, 1000L, 0f, listener)
            }
        }
        onDispose { runCatching { lm.removeUpdates(listener) } }
    }

    return state
}

private fun Location.toLatLng(): LatLng = LatLng(latitude, longitude)
