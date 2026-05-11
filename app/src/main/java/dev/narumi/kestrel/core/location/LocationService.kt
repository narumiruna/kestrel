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
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.MockState
import dev.narumi.kestrel.core.data.RouteState
import dev.narumi.kestrel.core.data.SinglePointState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

class LocationService : Service() {
    private lateinit var mockProvider: MockProviderManager
    private lateinit var prefs: KestrelPrefs
    private var providerStarted = false
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var routeJob: Job? = null
    private var singleKeepAliveJob: Job? = null

    @Volatile private var paused = false
    private var currentMode: MockState.Mode = MockState.Mode.Idle

    // Snapshot of the in-flight route so periodic + transition writes can rebuild the matching
    // `RouteState` (with current progress + forward) without re-reading waypoints from DataStore.
    private var activeEngine: MovementEngine? = null
    private var activeRouteWaypoints: List<LatLng> = emptyList()
    private var activeRouteSpeedKmh: Double = 0.0
    private var activeRouteMode: MovementEngine.Mode = MovementEngine.Mode.Once

    override fun onCreate() {
        super.onCreate()
        mockProvider = MockProviderManager(applicationContext)
        prefs = KestrelPrefs(applicationContext)
        ensureChannel()
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int,
    ): Int {
        if (intent == null || intent.action == null) {
            // Restarted by the system after being killed (START_STICKY): try to restore.
            ensureForeground()
            scope.launch { restoreState() }
            return START_STICKY
        }
        when (intent.action) {
            ACTION_STOP -> {
                stopRoute()
                stopSingleKeepAlive()
                stopMock()
                currentMode = MockState.Mode.Idle
                _currentMock.value = null
                _runtimeState.value = RuntimeState.Idle
                scope.launch { prefs.setMockState(null) }
                stopForegroundCompat()
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_SET_LOCATION -> {
                ensureForeground()
                stopRoute()
                val lat = intent.getDoubleExtra(EXTRA_LAT, Double.NaN)
                val lng = intent.getDoubleExtra(EXTRA_LNG, Double.NaN)
                if (lat.isFinite() && lng.isFinite()) {
                    val point = LatLng(lat, lng)
                    ensureMockStarted()
                    startSingleKeepAlive(point)
                    currentMode = MockState.Mode.Single
                    _runtimeState.value = RuntimeState.Single(point)
                    refreshNotification()
                    scope.launch {
                        prefs.setMockState(
                            MockState(
                                mode = MockState.Mode.Single,
                                single = SinglePointState(lat, lng),
                            ),
                        )
                    }
                }
            }
            ACTION_START_ROUTE -> {
                ensureForeground()
                stopSingleKeepAlive()
                val lats = intent.getDoubleArrayExtra(EXTRA_LATS)
                val lngs = intent.getDoubleArrayExtra(EXTRA_LNGS)
                val speedKmh = intent.getDoubleExtra(EXTRA_SPEED_KMH, Double.NaN)
                val modeName = intent.getStringExtra(EXTRA_MODE) ?: MovementEngine.Mode.Once.name
                val mode =
                    runCatching { MovementEngine.Mode.valueOf(modeName) }
                        .getOrDefault(MovementEngine.Mode.Once)
                if (lats != null &&
                    lngs != null &&
                    lats.size == lngs.size &&
                    lats.size >= 2 &&
                    speedKmh.isFinite() &&
                    speedKmh > 0
                ) {
                    val waypoints = lats.indices.map { LatLng(lats[it], lngs[it]) }
                    // Fresh route, fresh progress. Any leftover state from a previous route was
                    // already cleared by stopRoute() inside startRoute().
                    startRoute(waypoints, speedKmh, mode, initialProgressMeters = 0.0, initialForward = true)
                    currentMode = MockState.Mode.Route
                    _runtimeState.value =
                        RuntimeState.Route(
                            waypoints = waypoints,
                            speedKmh = speedKmh,
                            mode = mode,
                            paused = false,
                        )
                    refreshNotification()
                    scope.launch { persistRouteState(progressMeters = 0.0, forward = true) }
                }
            }
            ACTION_PAUSE -> {
                paused = true
                updateRouteRuntimePaused(paused = true)
                refreshNotification()
                // Snapshot progress so a kill during pause doesn't lose accumulated motion.
                scope.launch {
                    val engine = activeEngine ?: return@launch
                    persistRouteState(engine.progressMeters(), engine.isForward())
                }
            }
            ACTION_RESUME -> {
                paused = false
                updateRouteRuntimePaused(paused = false)
                refreshNotification()
                // Match pause: keep the persisted progress fresh across resume too.
                scope.launch {
                    val engine = activeEngine ?: return@launch
                    persistRouteState(engine.progressMeters(), engine.isForward())
                }
            }
            else -> ensureForeground()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        // Best-effort progress flush before the scope is cancelled. onDestroy is not guaranteed to
        // run under sudden kills; the periodic tick writer is what makes overnight kills survivable.
        val engine = activeEngine
        if (engine != null && currentMode == MockState.Mode.Route) {
            runCatching {
                runBlocking { persistRouteState(engine.progressMeters(), engine.isForward()) }
            }
        }
        stopRoute()
        stopSingleKeepAlive()
        stopMock()
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private suspend fun restoreState() {
        val state = prefs.mockState.first() ?: return
        when (state.mode) {
            MockState.Mode.Single ->
                state.single?.let {
                    val point = LatLng(it.lat, it.lng)
                    ensureMockStarted()
                    startSingleKeepAlive(point)
                    currentMode = MockState.Mode.Single
                    _runtimeState.value = RuntimeState.Single(point)
                    refreshNotification()
                }
            MockState.Mode.Route ->
                state.route?.let { r ->
                    if (r.lats.size >= 2 && r.lats.size == r.lngs.size) {
                        val wps = r.lats.indices.map { LatLng(r.lats[it], r.lngs[it]) }
                        val mode =
                            runCatching { MovementEngine.Mode.valueOf(r.mode) }
                                .getOrDefault(MovementEngine.Mode.Once)
                        // Seed the engine with the last persisted progress so Loop / PingPong don't
                        // visibly jump back to the first waypoint after the system restarts us.
                        startRoute(
                            waypoints = wps,
                            speedKmh = r.speedKmh,
                            mode = mode,
                            initialProgressMeters = r.progressMeters,
                            initialForward = r.forward,
                        )
                        currentMode = MockState.Mode.Route
                        // `paused` cannot survive process death (it lives only in service memory),
                        // so a restored route always comes back unpaused. Documented limitation.
                        _runtimeState.value =
                            RuntimeState.Route(
                                waypoints = wps,
                                speedKmh = r.speedKmh,
                                mode = mode,
                                paused = false,
                            )
                        refreshNotification()
                    }
                }
            MockState.Mode.Idle -> Unit
        }
    }

    private fun updateRouteRuntimePaused(paused: Boolean) {
        val current = _runtimeState.value as? RuntimeState.Route ?: return
        _runtimeState.value = current.copy(paused = paused)
    }

    private fun startRoute(
        waypoints: List<LatLng>,
        speedKmh: Double,
        mode: MovementEngine.Mode,
        initialProgressMeters: Double = 0.0,
        initialForward: Boolean = true,
    ) {
        stopRoute()
        ensureMockStarted()
        paused = false
        val engine =
            MovementEngine(
                waypoints = waypoints,
                speedMps = speedKmh / 3.6,
                mode = mode,
                initialProgressMeters = initialProgressMeters,
                initialForward = initialForward,
            )
        activeEngine = engine
        activeRouteWaypoints = waypoints
        activeRouteSpeedKmh = speedKmh
        activeRouteMode = mode
        routeJob =
            scope.launch {
                var tickCounter = 0
                while (isActive && !engine.isFinished()) {
                    delay(TICK_MILLIS)
                    if (paused) continue
                    val sample = engine.advance(TICK_MILLIS / 1000.0)
                    pushSample(sample)
                    tickCounter++
                    if (tickCounter >= PROGRESS_WRITE_INTERVAL_TICKS) {
                        tickCounter = 0
                        // Snapshot progress + direction in the same write so they can't disagree
                        // across a process restart.
                        persistRouteState(engine.progressMeters(), engine.isForward())
                    }
                }
                if (mode == MovementEngine.Mode.Once && engine.isFinished()) {
                    val last = waypoints.last()
                    activeEngine = null
                    activeRouteWaypoints = emptyList()
                    currentMode = MockState.Mode.Single
                    startSingleKeepAlive(last)
                    _runtimeState.value = RuntimeState.Single(last)
                    refreshNotification()
                    prefs.setMockState(
                        MockState(
                            mode = MockState.Mode.Single,
                            single = SinglePointState(last.lat, last.lng),
                        ),
                    )
                }
            }
    }

    private fun stopRoute() {
        routeJob?.cancel()
        routeJob = null
        paused = false
        activeEngine = null
        activeRouteWaypoints = emptyList()
    }

    private suspend fun persistRouteState(
        progressMeters: Double,
        forward: Boolean,
    ) {
        val waypoints = activeRouteWaypoints
        if (waypoints.isEmpty()) return
        val lats = DoubleArray(waypoints.size) { waypoints[it].lat }
        val lngs = DoubleArray(waypoints.size) { waypoints[it].lng }
        prefs.setMockState(
            MockState(
                mode = MockState.Mode.Route,
                route =
                    RouteState(
                        lats = lats,
                        lngs = lngs,
                        speedKmh = activeRouteSpeedKmh,
                        mode = activeRouteMode.name,
                        progressMeters = progressMeters,
                        forward = forward,
                    ),
            ),
        )
    }

    private fun startSingleKeepAlive(point: LatLng) {
        stopSingleKeepAlive()
        singleKeepAliveJob =
            scope.launch {
                while (isActive) {
                    pushLocation(point)
                    delay(TICK_MILLIS)
                }
            }
    }

    private fun stopSingleKeepAlive() {
        singleKeepAliveJob?.cancel()
        singleKeepAliveJob = null
    }

    private fun pushLocation(point: LatLng) {
        runCatching { mockProvider.setLocation(point) }
            .onSuccess { _currentMock.value = point }
            .onFailure { Log.w(TAG, "setLocation failed", it) }
    }

    private fun pushSample(sample: MockSample) {
        runCatching {
            mockProvider.setLocation(
                point = sample.point,
                speed = sample.speedMps.toFloat(),
                bearing = sample.bearingDeg.toFloat(),
            )
        }.onSuccess { _currentMock.value = sample.point }
            .onFailure { Log.w(TAG, "setLocation failed", it) }
    }

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

    private fun refreshNotification() {
        val nm = getSystemService<NotificationManager>() ?: return
        nm.notify(NOTIFICATION_ID, buildNotification())
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
        val contentPI =
            PendingIntent.getActivity(
                this,
                REQ_CONTENT,
                launchIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        val text =
            when {
                currentMode == MockState.Mode.Idle -> getString(R.string.location_service_text)
                currentMode == MockState.Mode.Single -> "Single point mock active"
                paused -> "Route paused"
                else -> "Route playing"
            }
        val builder =
            NotificationCompat
                .Builder(this, CHANNEL_ID)
                .setContentTitle(getString(R.string.location_service_title))
                .setContentText(text)
                .setSmallIcon(R.drawable.ic_home)
                .setContentIntent(contentPI)
                .setOngoing(true)

        if (currentMode == MockState.Mode.Route) {
            if (paused) {
                builder.addAction(0, "Resume", servicePI(REQ_RESUME, ACTION_RESUME))
            } else {
                builder.addAction(0, "Pause", servicePI(REQ_PAUSE, ACTION_PAUSE))
            }
        }
        if (currentMode != MockState.Mode.Idle) {
            builder.addAction(0, "Stop", servicePI(REQ_STOP, ACTION_STOP))
        }
        return builder.build()
    }

    private fun servicePI(
        requestCode: Int,
        action: String,
    ): PendingIntent {
        val intent = Intent(this, LocationService::class.java).apply { this.action = action }
        return PendingIntent.getService(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    companion object {
        const val ACTION_START = "dev.narumi.kestrel.action.START"
        const val ACTION_STOP = "dev.narumi.kestrel.action.STOP"
        const val ACTION_SET_LOCATION = "dev.narumi.kestrel.action.SET_LOCATION"
        const val ACTION_START_ROUTE = "dev.narumi.kestrel.action.START_ROUTE"
        const val ACTION_PAUSE = "dev.narumi.kestrel.action.PAUSE"
        const val ACTION_RESUME = "dev.narumi.kestrel.action.RESUME"
        const val EXTRA_LAT = "lat"
        const val EXTRA_LNG = "lng"
        const val EXTRA_LATS = "lats"
        const val EXTRA_LNGS = "lngs"
        const val EXTRA_SPEED_KMH = "speed_kmh"
        const val EXTRA_MODE = "route_mode"
        private const val CHANNEL_ID = "kestrel_location"
        private const val NOTIFICATION_ID = 1001
        private const val TICK_MILLIS = 1000L

        // Write progress every PROGRESS_WRITE_INTERVAL_TICKS ticks (= 5 s at the current tick rate).
        // Matches the plan's accepted jump-back budget of <= 5 s * speed after a kill.
        private const val PROGRESS_WRITE_INTERVAL_TICKS = 5
        private const val TAG = "LocationService"
        private const val REQ_CONTENT = 0
        private const val REQ_PAUSE = 1
        private const val REQ_RESUME = 2
        private const val REQ_STOP = 3

        private val _currentMock = MutableStateFlow<LatLng?>(null)
        val currentMock: StateFlow<LatLng?> = _currentMock.asStateFlow()

        private val _runtimeState = MutableStateFlow<RuntimeState>(RuntimeState.Idle)

        /**
         * What the service is doing right now (Idle / Single / Route). UI should derive its
         * run-state from this flow instead of from local Compose `remember` values so a
         * MapScreen dispose (tab switch, config change) does not desync from the actual service.
         *
         * Updated only on real transitions, never per-tick.
         */
        val runtimeState: StateFlow<RuntimeState> = _runtimeState.asStateFlow()

        fun start(context: Context) {
            sendIntent(context, ACTION_START, foreground = true)
        }

        fun setLocation(
            context: Context,
            point: LatLng,
        ) {
            val intent =
                Intent(context, LocationService::class.java).apply {
                    action = ACTION_SET_LOCATION
                    putExtra(EXTRA_LAT, point.lat)
                    putExtra(EXTRA_LNG, point.lng)
                }
            startCompat(context, intent, foreground = true)
        }

        fun startRoute(
            context: Context,
            waypoints: List<LatLng>,
            speedKmh: Double,
            mode: MovementEngine.Mode = MovementEngine.Mode.Once,
        ) {
            if (waypoints.size < 2) return
            val lats = DoubleArray(waypoints.size) { waypoints[it].lat }
            val lngs = DoubleArray(waypoints.size) { waypoints[it].lng }
            val intent =
                Intent(context, LocationService::class.java).apply {
                    action = ACTION_START_ROUTE
                    putExtra(EXTRA_LATS, lats)
                    putExtra(EXTRA_LNGS, lngs)
                    putExtra(EXTRA_SPEED_KMH, speedKmh)
                    putExtra(EXTRA_MODE, mode.name)
                }
            startCompat(context, intent, foreground = true)
        }

        fun pause(context: Context) {
            sendIntent(context, ACTION_PAUSE, foreground = true)
        }

        fun resume(context: Context) {
            sendIntent(context, ACTION_RESUME, foreground = true)
        }

        fun stop(context: Context) {
            sendIntent(context, ACTION_STOP, foreground = false)
        }

        private fun sendIntent(
            context: Context,
            action: String,
            foreground: Boolean,
        ) {
            val intent =
                Intent(context, LocationService::class.java).apply {
                    this.action = action
                }
            startCompat(context, intent, foreground)
        }

        private fun startCompat(
            context: Context,
            intent: Intent,
            foreground: Boolean,
        ) {
            if (foreground && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
