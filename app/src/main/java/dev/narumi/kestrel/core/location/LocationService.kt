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
import dev.narumi.kestrel.core.cloud.RemoteControlPoller
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
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.util.UUID

internal class ActiveRouteSnapshot private constructor(
    val engine: MovementEngine,
    private val latitudes: DoubleArray,
    private val longitudes: DoubleArray,
    private val speedKmh: Double,
    private val mode: MovementEngine.Mode,
) {
    fun toRouteState(
        progressMeters: Double,
        forward: Boolean,
    ): RouteState =
        RouteState(
            lats = latitudes,
            lngs = longitudes,
            speedKmh = speedKmh,
            mode = mode.name,
            progressMeters = progressMeters,
            forward = forward,
        )

    companion object {
        fun create(
            engine: MovementEngine,
            waypoints: List<LatLng>,
            speedKmh: Double,
            mode: MovementEngine.Mode,
        ): ActiveRouteSnapshot =
            ActiveRouteSnapshot(
                engine = engine,
                latitudes = DoubleArray(waypoints.size) { waypoints[it].lat },
                longitudes = DoubleArray(waypoints.size) { waypoints[it].lng },
                speedKmh = speedKmh,
                mode = mode,
            )
    }
}

class LocationService : Service() {
    private lateinit var mockProvider: MockProviderManager
    private lateinit var prefs: KestrelPrefs
    private lateinit var remoteControlPoller: RemoteControlPoller

    @Volatile private var providerStarted = false
    private val providerWriteLock = Any()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var routeJob: Job? = null
    private var singleKeepAliveJob: Job? = null
    private var restoreJob: Job? = null

    @Volatile private var paused = false
    private var currentMode: MockState.Mode = MockState.Mode.Idle

    // Publish the active engine and serialized route fields together so progress writers cannot
    // combine state from two routes during replacement.
    @Volatile private var activeRoute: ActiveRouteSnapshot? = null

    override fun onCreate() {
        super.onCreate()
        mockProvider = MockProviderManager(applicationContext)
        prefs = KestrelPrefs(applicationContext)
        remoteControlPoller = RemoteControlPoller.getInstance(applicationContext)
        ensureChannel()
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int,
    ): Int =
        runCatching {
            if (intent?.action != null) {
                restoreJob?.cancel()
                restoreJob = null
            }
            when (intent?.action) {
                null -> restoreAfterRestart(startId)
                ACTION_STOP -> stopAction(intent, startId)
                ACTION_SET_LOCATION -> setLocationAction(intent)
                ACTION_START_ROUTE -> startRouteAction(intent)
                ACTION_PAUSE -> pauseAction(intent)
                ACTION_RESUME -> resumeAction(intent)
                else -> foregroundOnlyAction()
            }
        }.getOrElse { error ->
            completeOperation(
                intent,
                succeeded = false,
                message = mockOperationErrorMessage(error, previousMockActive = _runtimeState.value != RuntimeState.Idle),
            )
            Log.w(TAG, "location operation failed", error)
            if (_runtimeState.value == RuntimeState.Idle) {
                setRemoteControlServiceLease(false)
                stopForegroundCompat()
                stopSelfResult(startId)
                START_NOT_STICKY
            } else {
                START_STICKY
            }
        }

    private fun restoreAfterRestart(startId: Int): Int {
        // Restarted by the system after being killed (START_STICKY): try to restore.
        if (!tryEnsureForeground()) return START_NOT_STICKY
        restoreJob =
            scope.launch(Dispatchers.Main.immediate) {
                val restored = runCatching { restoreState() }.getOrDefault(false)
                if (!restored && stopSelfResult(startId)) stopForegroundCompat()
                restoreJob = null
            }
        return START_STICKY
    }

    private fun stopAction(
        intent: Intent,
        startId: Int,
    ): Int {
        stopRoute()
        stopSingleKeepAlive()
        stopMock()
        currentMode = MockState.Mode.Idle
        _currentMock.value = null
        _runtimeState.value = RuntimeState.Idle
        setRemoteControlServiceLease(false)
        scope.launch { prefs.setMockState(null) }
        stopForegroundCompat()
        completeOperation(intent, succeeded = true, message = "Mock location stopped.")
        // A new SET_LOCATION / START_ROUTE may already be queued by a UI "replace mock"
        // action. Do not let this older STOP tear down the service before the newer
        // foreground-start command gets its chance to call startForeground().
        stopSelfResult(startId)
        return START_NOT_STICKY
    }

    private fun setLocationAction(intent: Intent): Int {
        if (!tryEnsureForeground()) {
            completeOperation(
                intent,
                succeeded = false,
                message = "Kestrel could not start its location service. Check notification permission and try again.",
            )
            return if (_runtimeState.value == RuntimeState.Idle) START_NOT_STICKY else START_STICKY
        }
        val lat = intent.getDoubleExtra(EXTRA_LAT, Double.NaN)
        val lng = intent.getDoubleExtra(EXTRA_LNG, Double.NaN)
        val point = LatLng(lat, lng)
        require(lat.isFinite() && lng.isFinite() && lat in -90.0..90.0 && lng in -180.0..180.0) {
            "Enter valid latitude and longitude values."
        }

        // Prove that the provider accepts the replacement before cancelling the old route.
        synchronized(providerWriteLock) {
            ensureMockStarted()
            mockProvider.setLocation(point)
            _currentMock.value = point
            stopRoute()
            stopSingleKeepAlive()
            startSingleKeepAlive(point)
            currentMode = MockState.Mode.Single
            _runtimeState.value = RuntimeState.Single(point)
        }
        setRemoteControlServiceLease(true)
        refreshNotification()
        scope.launch {
            prefs.setMockState(
                MockState(
                    mode = MockState.Mode.Single,
                    single = SinglePointState(lat, lng),
                ),
            )
        }
        completeOperation(intent, succeeded = true, message = "Point mock started.")
        return START_STICKY
    }

    private fun startRouteAction(intent: Intent): Int {
        if (!tryEnsureForeground()) {
            completeOperation(
                intent,
                succeeded = false,
                message = "Kestrel could not start its location service. Check notification permission and try again.",
            )
            return if (_runtimeState.value == RuntimeState.Idle) START_NOT_STICKY else START_STICKY
        }
        val lats = intent.getDoubleArrayExtra(EXTRA_LATS)
        val lngs = intent.getDoubleArrayExtra(EXTRA_LNGS)
        require(lats != null && lngs != null && lats.size == lngs.size) {
            "The route waypoint payload is incomplete."
        }
        val waypoints = lats.indices.map { LatLng(lats[it], lngs[it]) }
        val speedKmh = intent.getDoubleExtra(EXTRA_SPEED_KMH, Double.NaN)
        validateRouteRequest(waypoints, speedKmh)?.let { throw IllegalArgumentException(it) }
        val modeName = intent.getStringExtra(EXTRA_MODE) ?: MovementEngine.Mode.Once.name
        val mode =
            runCatching { MovementEngine.Mode.valueOf(modeName) }
                .getOrDefault(MovementEngine.Mode.Once)
        val engine = MovementEngine(waypoints, speedKmh / 3.6, mode)

        // Validate the provider and first sample before replacing a running mock. Provider writes
        // share a lock so a cancelled old route cannot publish a stale sample after this one.
        synchronized(providerWriteLock) {
            ensureMockStarted()
            mockProvider.setLocation(waypoints.first())
            _currentMock.value = waypoints.first()
            activateRoute(engine, waypoints, speedKmh, mode)
            currentMode = MockState.Mode.Route
            _runtimeState.value =
                RuntimeState.Route(
                    waypoints = waypoints,
                    speedKmh = speedKmh,
                    mode = mode,
                    paused = false,
                )
        }
        setRemoteControlServiceLease(true)
        refreshNotification()
        scope.launch { persistRouteState(engine) }
        completeOperation(intent, succeeded = true, message = "Route playback started.")
        return START_STICKY
    }

    private fun pauseAction(intent: Intent): Int {
        check(_runtimeState.value is RuntimeState.Route) { "No route is playing." }
        paused = true
        updateRouteRuntimePaused(paused = true)
        refreshNotification()
        scope.launch {
            val engine = activeRoute?.engine ?: return@launch
            persistRouteState(engine)
        }
        completeOperation(intent, succeeded = true, message = "Route paused.")
        return START_STICKY
    }

    private fun resumeAction(intent: Intent): Int {
        check(_runtimeState.value is RuntimeState.Route) { "No paused route is available." }
        paused = false
        updateRouteRuntimePaused(paused = false)
        refreshNotification()
        scope.launch {
            val engine = activeRoute?.engine ?: return@launch
            persistRouteState(engine)
        }
        completeOperation(intent, succeeded = true, message = "Route resumed.")
        return START_STICKY
    }

    private fun foregroundOnlyAction(): Int = if (tryEnsureForeground()) START_STICKY else START_NOT_STICKY

    override fun onDestroy() {
        // Best-effort progress flush before the scope is cancelled. onDestroy is not guaranteed to
        // run under sudden kills; the periodic tick writer is what makes overnight kills survivable.
        val engine = activeRoute?.engine
        if (engine != null && currentMode == MockState.Mode.Route) {
            runCatching {
                runBlocking { persistRouteState(engine) }
            }
        }
        stopRoute()
        stopSingleKeepAlive()
        stopMock()
        setRemoteControlServiceLease(false)
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private suspend fun restoreState(): Boolean {
        val state = prefs.mockState.first() ?: return false
        return when (state.mode) {
            MockState.Mode.Single ->
                state.single?.let {
                    val point = LatLng(it.lat, it.lng)
                    if (!point.lat.isFinite() || !point.lng.isFinite() || point.lat !in -90.0..90.0 || point.lng !in -180.0..180.0) {
                        return@let false
                    }
                    ensureMockStarted()
                    startSingleKeepAlive(point)
                    currentMode = MockState.Mode.Single
                    _runtimeState.value = RuntimeState.Single(point)
                    setRemoteControlServiceLease(true)
                    refreshNotification()
                    true
                } ?: false
            MockState.Mode.Route ->
                state.route?.let { r ->
                    if (r.lats.size < 2 || r.lats.size != r.lngs.size) return@let false
                    val wps = r.lats.indices.map { LatLng(r.lats[it], r.lngs[it]) }
                    if (validateRouteRequest(wps, r.speedKmh) != null) return@let false
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
                    setRemoteControlServiceLease(true)
                    refreshNotification()
                    true
                } ?: false
            MockState.Mode.Idle -> false
        }
    }

    private fun setRemoteControlServiceLease(active: Boolean) {
        if (::remoteControlPoller.isInitialized) {
            remoteControlPoller.setServiceActive(active)
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
        ensureMockStarted()
        val engine =
            MovementEngine(
                waypoints = waypoints,
                speedMps = speedKmh / 3.6,
                mode = mode,
                initialProgressMeters = initialProgressMeters,
                initialForward = initialForward,
            )
        activateRoute(engine, waypoints, speedKmh, mode)
    }

    private fun activateRoute(
        engine: MovementEngine,
        waypoints: List<LatLng>,
        speedKmh: Double,
        mode: MovementEngine.Mode,
    ) {
        stopRoute()
        stopSingleKeepAlive()
        paused = false
        activeRoute = ActiveRouteSnapshot.create(engine, waypoints, speedKmh, mode)
        routeJob =
            scope.launch {
                // Read once per route job so Settings changes apply to the next route start or
                // restore, not mid-flight.
                val progressWriteIntervalTicks =
                    progressWriteIntervalTicksFor(
                        prefs.mockPlaybackSettings.first().progressWriteIntervalSeconds,
                    )
                var tickCounter = 0
                while (isActive && !engine.isFinished()) {
                    delay(LOCATION_SERVICE_TICK_MILLIS)
                    if (paused) continue
                    val sample = engine.advance(LOCATION_SERVICE_TICK_MILLIS / 1000.0)
                    pushSample(sample, engine)
                    tickCounter++
                    if (tickCounter >= progressWriteIntervalTicks) {
                        tickCounter = 0
                        // Snapshot progress + direction in the same write so they can't disagree
                        // across a process restart.
                        persistRouteState(engine)
                    }
                }
                if (
                    mode == MovementEngine.Mode.Once &&
                    engine.isFinished() &&
                    activeRoute?.engine === engine
                ) {
                    val last = waypoints.last()
                    activeRoute = null
                    currentMode = MockState.Mode.Single
                    startSingleKeepAlive(last)
                    _runtimeState.value = RuntimeState.Single(last)
                    setRemoteControlServiceLease(true)
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
        activeRoute = null
    }

    private suspend fun persistRouteState(engine: MovementEngine) {
        val route = activeRoute?.takeIf { it.engine === engine } ?: return
        prefs.setMockState(
            MockState(
                mode = MockState.Mode.Route,
                route = route.toRouteState(engine.progressMeters(), engine.isForward()),
            ),
        )
    }

    private fun startSingleKeepAlive(point: LatLng) {
        stopSingleKeepAlive()
        singleKeepAliveJob =
            scope.launch {
                while (isActive) {
                    pushLocation(point)
                    delay(LOCATION_SERVICE_TICK_MILLIS)
                }
            }
    }

    private fun stopSingleKeepAlive() {
        singleKeepAliveJob?.cancel()
        singleKeepAliveJob = null
    }

    private fun pushLocation(point: LatLng) {
        synchronized(providerWriteLock) {
            val activePoint = (_runtimeState.value as? RuntimeState.Single)?.point
            if (activePoint != point || !providerStarted) return
            runCatching { mockProvider.setLocation(point) }
                .onSuccess { _currentMock.value = point }
                .onFailure { Log.w(TAG, "setLocation failed", it) }
        }
    }

    private fun pushSample(
        sample: MockSample,
        engine: MovementEngine,
    ) {
        synchronized(providerWriteLock) {
            if (activeRoute?.engine !== engine || !providerStarted) return
            runCatching {
                mockProvider.setLocation(
                    point = sample.point,
                    speed = sample.speedMps.toFloat(),
                    bearing = sample.bearingDeg.toFloat(),
                )
            }.onSuccess { _currentMock.value = sample.point }
                .onFailure { Log.w(TAG, "setLocation failed", it) }
        }
    }

    private fun tryEnsureForeground(): Boolean =
        runCatching {
            ensureForeground()
            true
        }.onFailure {
            Log.w(TAG, "startForeground failed", it)
            if (_runtimeState.value == RuntimeState.Idle) {
                stopSelf()
            }
        }.getOrDefault(false)

    private fun completeOperation(
        intent: Intent?,
        succeeded: Boolean,
        message: String,
    ) {
        val requestId = intent?.getStringExtra(EXTRA_REQUEST_ID) ?: return
        val action = intent.action.toLocationOperationAction() ?: return
        _operationResults.tryEmit(
            LocationOperationResult(
                requestId = requestId,
                action = action,
                succeeded = succeeded,
                message = message,
            ),
        )
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
        synchronized(providerWriteLock) {
            if (!providerStarted) return
            runCatching { mockProvider.stop() }
            providerStarted = false
        }
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
            ).apply {
                description = getString(R.string.location_service_channel_description)
            },
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
                currentMode == MockState.Mode.Idle -> getString(R.string.location_service_text_ready)
                currentMode == MockState.Mode.Single -> getString(R.string.location_service_text_single)
                paused -> getString(R.string.location_service_text_route_paused)
                else -> getString(R.string.location_service_text_route_playing)
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
                builder.addAction(
                    0,
                    getString(R.string.location_service_action_resume),
                    servicePI(REQ_RESUME, ACTION_RESUME),
                )
            } else {
                builder.addAction(
                    0,
                    getString(R.string.location_service_action_pause),
                    servicePI(REQ_PAUSE, ACTION_PAUSE),
                )
            }
        }
        if (currentMode != MockState.Mode.Idle) {
            builder.addAction(
                0,
                getString(R.string.location_service_action_stop),
                servicePI(REQ_STOP, ACTION_STOP),
            )
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
        const val EXTRA_REQUEST_ID = "request_id"
        private const val CHANNEL_ID = "kestrel_location"
        private const val NOTIFICATION_ID = 1001
        private const val TAG = "LocationService"
        private const val REQ_CONTENT = 0
        private const val REQ_PAUSE = 1
        private const val REQ_RESUME = 2
        private const val REQ_STOP = 3

        private val _currentMock = MutableStateFlow<LatLng?>(null)
        val currentMock: StateFlow<LatLng?> = _currentMock.asStateFlow()

        private val _runtimeState = MutableStateFlow<RuntimeState>(RuntimeState.Idle)
        private val _operationResults =
            MutableSharedFlow<LocationOperationResult>(replay = 1, extraBufferCapacity = 31)
        val operationResults: SharedFlow<LocationOperationResult> = _operationResults.asSharedFlow()

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
        ): String =
            dispatchOperation(
                context = context,
                action = ACTION_SET_LOCATION,
                foreground = true,
            ) {
                putExtra(EXTRA_LAT, point.lat)
                putExtra(EXTRA_LNG, point.lng)
            }

        fun startRoute(
            context: Context,
            waypoints: List<LatLng>,
            speedKmh: Double,
            mode: MovementEngine.Mode = MovementEngine.Mode.Once,
        ): String {
            val requestError = validateRouteRequest(waypoints, speedKmh)
            val requestId = UUID.randomUUID().toString()
            if (requestError != null) {
                _operationResults.tryEmit(
                    LocationOperationResult(
                        requestId = requestId,
                        action = LocationOperationAction.StartRoute,
                        succeeded = false,
                        message = requestError,
                    ),
                )
                return requestId
            }
            val lats = DoubleArray(waypoints.size) { waypoints[it].lat }
            val lngs = DoubleArray(waypoints.size) { waypoints[it].lng }
            return dispatchOperation(
                context = context,
                action = ACTION_START_ROUTE,
                foreground = true,
                requestId = requestId,
            ) {
                putExtra(EXTRA_LATS, lats)
                putExtra(EXTRA_LNGS, lngs)
                putExtra(EXTRA_SPEED_KMH, speedKmh)
                putExtra(EXTRA_MODE, mode.name)
            }
        }

        fun pause(context: Context): String = dispatchOperation(context, ACTION_PAUSE, foreground = false)

        fun resume(context: Context): String = dispatchOperation(context, ACTION_RESUME, foreground = false)

        fun stop(context: Context): String = dispatchOperation(context, ACTION_STOP, foreground = false)

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

        private fun dispatchOperation(
            context: Context,
            action: String,
            foreground: Boolean,
            requestId: String = UUID.randomUUID().toString(),
            configure: Intent.() -> Unit = {},
        ): String {
            val intent =
                Intent(context, LocationService::class.java).apply {
                    this.action = action
                    putExtra(EXTRA_REQUEST_ID, requestId)
                    configure()
                }
            runCatching { startCompat(context, intent, foreground) }
                .onFailure { error ->
                    val operationAction = action.toLocationOperationAction() ?: return@onFailure
                    _operationResults.tryEmit(
                        LocationOperationResult(
                            requestId = requestId,
                            action = operationAction,
                            succeeded = false,
                            message =
                                mockOperationErrorMessage(
                                    error,
                                    previousMockActive = _runtimeState.value != RuntimeState.Idle,
                                ),
                        ),
                    )
                }
            return requestId
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

private fun String?.toLocationOperationAction(): LocationOperationAction? =
    when (this) {
        LocationService.ACTION_SET_LOCATION -> LocationOperationAction.SetPoint
        LocationService.ACTION_START_ROUTE -> LocationOperationAction.StartRoute
        LocationService.ACTION_PAUSE -> LocationOperationAction.Pause
        LocationService.ACTION_RESUME -> LocationOperationAction.Resume
        LocationService.ACTION_STOP -> LocationOperationAction.Stop
        else -> null
    }
