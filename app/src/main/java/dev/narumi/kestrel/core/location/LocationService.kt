package dev.narumi.kestrel.core.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.getSystemService
import dev.narumi.kestrel.MainActivity
import dev.narumi.kestrel.R

class LocationService : Service() {

    private lateinit var mockProvider: MockProviderManager
    private var providerStarted = false

    override fun onCreate() {
        super.onCreate()
        mockProvider = MockProviderManager(applicationContext)
        ensureChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopMock()
                stopForegroundCompat()
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_SET_LOCATION -> {
                ensureForeground()
                val lat = intent.getDoubleExtra(EXTRA_LAT, Double.NaN)
                val lng = intent.getDoubleExtra(EXTRA_LNG, Double.NaN)
                if (lat.isFinite() && lng.isFinite()) {
                    ensureMockStarted()
                    runCatching { mockProvider.setLocation(LatLng(lat, lng)) }
                        .onFailure { Log.w(TAG, "setLocation failed", it) }
                }
            }
            else -> ensureForeground()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        stopMock()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun ensureForeground() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun ensureMockStarted() {
        if (providerStarted) return
        mockProvider.start()
        providerStarted = true
    }

    private fun stopMock() {
        if (!providerStarted) return
        runCatching { mockProvider.stop() }
        providerStarted = false
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService<NotificationManager>() ?: return
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                getString(R.string.location_service_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ),
        )
    }

    private fun buildNotification(): Notification {
        val launchIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.location_service_title))
            .setContentText(getString(R.string.location_service_text))
            .setSmallIcon(R.drawable.ic_home)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val ACTION_START = "dev.narumi.kestrel.action.START"
        const val ACTION_STOP = "dev.narumi.kestrel.action.STOP"
        const val ACTION_SET_LOCATION = "dev.narumi.kestrel.action.SET_LOCATION"
        const val EXTRA_LAT = "lat"
        const val EXTRA_LNG = "lng"
        private const val CHANNEL_ID = "kestrel_location"
        private const val NOTIFICATION_ID = 1001
        private const val TAG = "LocationService"

        fun start(context: Context) {
            sendIntent(context, ACTION_START, foreground = true)
        }

        fun setLocation(context: Context, point: LatLng) {
            val intent = Intent(context, LocationService::class.java).apply {
                action = ACTION_SET_LOCATION
                putExtra(EXTRA_LAT, point.lat)
                putExtra(EXTRA_LNG, point.lng)
            }
            startCompat(context, intent, foreground = true)
        }

        fun stop(context: Context) {
            sendIntent(context, ACTION_STOP, foreground = false)
        }

        private fun sendIntent(context: Context, action: String, foreground: Boolean) {
            val intent = Intent(context, LocationService::class.java).apply {
                this.action = action
            }
            startCompat(context, intent, foreground)
        }

        private fun startCompat(context: Context, intent: Intent, foreground: Boolean) {
            if (foreground && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
