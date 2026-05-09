package dev.narumi.kestrel.core.location

import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.location.provider.ProviderProperties
import android.os.Build
import android.os.SystemClock
import androidx.core.content.getSystemService

class MockProviderManager(context: Context) {

    private val locationManager: LocationManager =
        requireNotNull(context.getSystemService<LocationManager>()) {
            "LocationManager unavailable"
        }
    private var enabled = false

    fun start() {
        if (enabled) return
        try {
            for (provider in MOCK_PROVIDERS) {
                locationManager.addTestProvider(
                    provider,
                    false,
                    false,
                    false,
                    false,
                    true,
                    true,
                    true,
                    ProviderProperties.POWER_USAGE_LOW,
                    ProviderProperties.ACCURACY_FINE,
                )
                locationManager.setTestProviderEnabled(provider, true)
            }
            enabled = true
        } catch (e: SecurityException) {
            throw MockNotAllowedException(
                "Kestrel is not selected as the mock location app in Developer options",
                e,
            )
        }
    }

    fun setLocation(point: LatLng, speed: Float = 0f, bearing: Float = 0f, accuracy: Float = 1f) {
        if (!enabled) return
        for (provider in MOCK_PROVIDERS) {
            val location = Location(provider).apply {
                latitude = point.lat
                longitude = point.lng
                this.accuracy = accuracy
                this.speed = speed
                this.bearing = bearing
                time = System.currentTimeMillis()
                elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    speedAccuracyMetersPerSecond = 0.1f
                    bearingAccuracyDegrees = 0.1f
                    verticalAccuracyMeters = 1f
                }
            }
            runCatching { locationManager.setTestProviderLocation(provider, location) }
        }
    }

    fun stop() {
        if (!enabled) return
        for (provider in MOCK_PROVIDERS) {
            runCatching {
                locationManager.setTestProviderEnabled(provider, false)
                locationManager.removeTestProvider(provider)
            }
        }
        enabled = false
    }

    fun isMockAllowed(): Boolean {
        if (enabled) return true
        return try {
            locationManager.addTestProvider(
                PROBE_PROVIDER,
                false,
                false,
                false,
                false,
                true,
                true,
                true,
                ProviderProperties.POWER_USAGE_LOW,
                ProviderProperties.ACCURACY_FINE,
            )
            locationManager.removeTestProvider(PROBE_PROVIDER)
            true
        } catch (_: SecurityException) {
            false
        } catch (_: IllegalArgumentException) {
            false
        }
    }

    private companion object {
        const val PROBE_PROVIDER = "kestrel_probe"
        val MOCK_PROVIDERS = listOf(
            LocationManager.GPS_PROVIDER,
            LocationManager.NETWORK_PROVIDER,
        )
    }
}

class MockNotAllowedException(message: String, cause: Throwable? = null) :
    RuntimeException(message, cause)
