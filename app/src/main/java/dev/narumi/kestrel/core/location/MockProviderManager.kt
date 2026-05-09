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
            locationManager.addTestProvider(
                LocationManager.GPS_PROVIDER,
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
            locationManager.setTestProviderEnabled(LocationManager.GPS_PROVIDER, true)
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
        val location = Location(LocationManager.GPS_PROVIDER).apply {
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
        locationManager.setTestProviderLocation(LocationManager.GPS_PROVIDER, location)
    }

    fun stop() {
        if (!enabled) return
        runCatching {
            locationManager.setTestProviderEnabled(LocationManager.GPS_PROVIDER, false)
            locationManager.removeTestProvider(LocationManager.GPS_PROVIDER)
        }
        enabled = false
    }
}

class MockNotAllowedException(message: String, cause: Throwable? = null) :
    RuntimeException(message, cause)
