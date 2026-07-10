package dev.narumi.kestrel.core.cloud

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.RemoteControlPendingAck
import dev.narumi.kestrel.core.data.RemoteControlSettings
import dev.narumi.kestrel.core.location.LocationService
import dev.narumi.kestrel.core.location.RuntimeState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.IOException
import java.util.Locale
import java.util.UUID

internal data class RemoteControlRuntimeStatus(
    val message: String? = null,
    val error: String? = null,
    val lastCommandStatus: RemoteCommandStatus? = null,
)

internal interface RemoteControlSettingsStore {
    suspend fun load(): RemoteControlSettings

    suspend fun save(settings: RemoteControlSettings)
}

internal data class RemoteDeviceInfo(
    val name: String,
    val appVersion: String?,
)

internal interface RemoteDeviceInfoProvider {
    fun current(): RemoteDeviceInfo
}

internal interface RemotePlaybackStateProvider {
    fun current(): RemotePlaybackState
}

internal class RemoteControlRepository internal constructor(
    private val authRepository: CloudSyncSessionProvider,
    private val apiClient: CloudRemoteControlApi,
    private val executor: RemoteCommandExecutor,
    private val settingsStore: RemoteControlSettingsStore,
    private val playbackStateProvider: RemotePlaybackStateProvider,
    private val deviceInfoProvider: RemoteDeviceInfoProvider,
) {
    private val _runtimeStatus = MutableStateFlow(RemoteControlRuntimeStatus())
    private val stateMutex = Mutex()
    private var pendingAcks: List<PendingRemoteAck> = emptyList()

    val runtimeStatus: StateFlow<RemoteControlRuntimeStatus> = _runtimeStatus.asStateFlow()

    suspend fun setEnabled(enabled: Boolean) =
        stateMutex.withLock {
            if (!enabled) {
                disableRemoteControl()
                return@withLock
            }

            val session = requireSession()
            val registered = register(settingsWithClientId(loadSettings()).copy(enabled = true), session)
            _runtimeStatus.value =
                RemoteControlRuntimeStatus(message = "Remote control enabled for ${registered.deviceName}")
        }

    suspend fun pollOnce(canExecuteCommands: () -> Boolean = { true }) {
        stateMutex.withLock {
            val failure = runCatching { pollOnceOrThrow(canExecuteCommands) }.exceptionOrNull()
            if (failure is CancellationException) throw failure
            if (failure != null) {
                _runtimeStatus.value = RemoteControlRuntimeStatus(error = failure.toRemoteControlMessage())
            }
        }
    }

    private suspend fun pollOnceOrThrow(canExecuteCommands: () -> Boolean) {
        val settings = loadSettings()
        pendingAcks = settings.pendingAcks.toPendingRemoteAcks()
        if (settings.enabled) {
            val session = authRepository.currentSession()
            if (session == null) {
                _runtimeStatus.value = RemoteControlRuntimeStatus(error = "Sign in to cloud to use web remote control")
            } else {
                pollWithSession(settings, session, canExecuteCommands)
            }
        }
    }

    private suspend fun pollWithSession(
        settings: RemoteControlSettings,
        session: CloudSession,
        canExecuteCommands: () -> Boolean,
    ) {
        val registered = ensureRegistered(settings, session)
        reportPlaybackState(registered, session)
        retryPendingAcks(session)
        if (pendingAcks.isEmpty()) {
            val response =
                withAuthorizedSession(session) {
                    apiClient.pollCommands(
                        accessToken = it.accessToken,
                        deviceId = registered.serverDeviceId ?: error("Device is not registered"),
                        request = PollRemoteCommandsRequest(registered.clientDeviceId ?: error("Missing client device id")),
                    )
                }
            if (response.commands.isEmpty()) {
                _runtimeStatus.value = RemoteControlRuntimeStatus(message = "Waiting for web commands")
            } else {
                executeCommands(response.commands, registered, session, canExecuteCommands)
            }
        }
    }

    private suspend fun executeCommands(
        commands: List<RemoteCommandPayload>,
        registered: RemoteControlSettings,
        session: CloudSession,
        canExecuteCommands: () -> Boolean,
    ) {
        for (command in commands) {
            val result =
                if (loadSettings().enabled && canExecuteCommands()) {
                    executor.execute(command)
                } else {
                    RemoteCommandExecutionResult.failed("Remote control is no longer active")
                }
            command.addPendingAck(registered, session, result)
            _runtimeStatus.value =
                RemoteControlRuntimeStatus(
                    message = "Command ${command.type} ${result.status.name.lowercase(Locale.US)}",
                    error = result.errorMessage,
                    lastCommandStatus = result.status,
                )
        }
        retryPendingAcks(session)
    }

    private suspend fun disableRemoteControl() {
        val settings = loadSettings()
        pendingAcks = settings.pendingAcks.toPendingRemoteAcks()
        val clientDeviceId = settings.clientDeviceId
        if (clientDeviceId == null) {
            setPendingAcks(emptyList())
            settingsStore.save(loadSettings().copy(enabled = false))
            _runtimeStatus.value = RemoteControlRuntimeStatus(message = "Remote control disabled")
            return
        }
        val session = authRepository.currentSession()
        if (session == null) {
            _runtimeStatus.value =
                RemoteControlRuntimeStatus(
                    message = "Remote control is still enabled on the server",
                    error = "Sign in to cloud to disable remote control on the server",
                )
            return
        }
        retryPendingAcks(session)
        register(settings.copy(enabled = false, clientDeviceId = clientDeviceId), session)
        _runtimeStatus.value = RemoteControlRuntimeStatus(message = "Remote control disabled")
    }

    private suspend fun ensureRegistered(
        settings: RemoteControlSettings,
        session: CloudSession,
    ): RemoteControlSettings {
        if (
            settings.serverDeviceId != null &&
            settings.clientDeviceId != null &&
            settings.registeredUserId == session.userId &&
            settings.registeredSessionId == session.sessionId
        ) {
            return settings
        }
        if (settings.registeredUserId != null && settings.registeredUserId != session.userId) {
            setPendingAcks(emptyList())
        }
        return register(settingsWithClientId(settings.copy(serverDeviceId = null)), session)
    }

    private suspend fun register(
        settings: RemoteControlSettings,
        session: CloudSession,
    ): RemoteControlSettings {
        val clientDeviceId = settings.clientDeviceId ?: UUID.randomUUID().toString()
        val deviceInfo = deviceInfoProvider.current()
        val device =
            withAuthorizedSession(session) {
                apiClient.registerDevice(
                    accessToken = it.accessToken,
                    request =
                        RegisterRemoteDeviceRequest(
                            clientDeviceId = clientDeviceId,
                            name = settings.deviceName ?: deviceInfo.name,
                            appVersion = deviceInfo.appVersion,
                            remoteControlEnabled = settings.enabled,
                        ),
                )
            }
        val updated =
            loadSettings().copy(
                enabled = settings.enabled,
                clientDeviceId = clientDeviceId,
                serverDeviceId = device.id,
                deviceName = device.name,
                registeredUserId = session.userId,
                registeredSessionId = session.sessionId,
            )
        settingsStore.save(updated)
        return updated
    }

    private suspend fun reportPlaybackState(
        settings: RemoteControlSettings,
        session: CloudSession,
    ) {
        runCatching {
            withAuthorizedSession(session) {
                apiClient.reportDeviceState(
                    accessToken = it.accessToken,
                    deviceId = settings.serverDeviceId ?: error("Device is not registered"),
                    request =
                        ReportDeviceStateRequest(
                            clientDeviceId = settings.clientDeviceId ?: error("Missing client device id"),
                            playbackState = playbackStateProvider.current(),
                        ),
                )
            }
        }
    }

    private suspend fun retryPendingAcks(session: CloudSession) {
        val stillPending = mutableListOf<PendingRemoteAck>()
        var latestSession = currentStoredSessionWithSameId(session)
        for (ack in pendingAcks) {
            if (ack.userId != null && ack.userId != session.userId) continue
            latestSession = currentStoredSessionWithSameId(latestSession)
            val sent =
                runCatching {
                    withAuthorizedSession(latestSession) { authorizedSession ->
                        latestSession = authorizedSession
                        apiClient.ackCommand(
                            accessToken = authorizedSession.accessToken,
                            deviceId = ack.deviceId,
                            commandId = ack.commandId,
                            request =
                                AckRemoteCommandRequest(
                                    clientDeviceId = ack.clientDeviceId,
                                    status = ack.status,
                                    errorMessage = ack.errorMessage,
                                ),
                        )
                    }
                }.isSuccess
            latestSession = currentStoredSessionWithSameId(latestSession)
            if (!sent) stillPending += ack
        }
        setPendingAcks(stillPending)
    }

    private suspend fun setPendingAcks(acks: List<PendingRemoteAck>) {
        pendingAcks = acks
        settingsStore.save(loadSettings().copy(pendingAcks = acks.map { it.toStoredAck() }))
    }

    private fun currentStoredSessionWithSameId(session: CloudSession): CloudSession = authRepository.currentSession()?.takeIf { it.sessionId == session.sessionId } ?: session

    private suspend fun settingsWithClientId(settings: RemoteControlSettings): RemoteControlSettings =
        if (settings.clientDeviceId == null) {
            settings.copy(clientDeviceId = UUID.randomUUID().toString()).also { settingsStore.save(it) }
        } else {
            settings
        }

    private suspend fun loadSettings(): RemoteControlSettings = settingsStore.load()

    private suspend fun <T> withAuthorizedSession(
        session: CloudSession,
        block: suspend (CloudSession) -> T,
    ): T =
        try {
            block(session)
        } catch (error: CloudApiException) {
            if (error.statusCode != 401) throw error
            val authorizedSession =
                authRepository.refreshSessionIfCurrent(session)
                    ?: authRepository.currentSession()?.takeIf { it.sessionId == session.sessionId }
                    ?: error("Session expired. Please sign in again.")
            block(authorizedSession)
        }

    private fun requireSession(): CloudSession = authRepository.currentSession() ?: error("Sign in to cloud first")

    private suspend fun RemoteCommandPayload.addPendingAck(
        settings: RemoteControlSettings,
        session: CloudSession,
        result: RemoteCommandExecutionResult,
    ) {
        setPendingAcks(
            pendingAcks +
                PendingRemoteAck(
                    deviceId = settings.serverDeviceId ?: deviceId,
                    commandId = id,
                    clientDeviceId = settings.clientDeviceId ?: error("Missing client device id"),
                    sessionId = session.sessionId,
                    userId = session.userId,
                    status = result.status,
                    errorMessage = result.errorMessage,
                ),
        )
    }

    private fun PendingRemoteAck.toStoredAck(): RemoteControlPendingAck =
        RemoteControlPendingAck(
            deviceId = deviceId,
            commandId = commandId,
            clientDeviceId = clientDeviceId,
            sessionId = sessionId,
            status = status.name,
            userId = userId,
            errorMessage = errorMessage,
        )

    private fun List<RemoteControlPendingAck>.toPendingRemoteAcks(): List<PendingRemoteAck> =
        mapNotNull { ack ->
            runCatching {
                PendingRemoteAck(
                    deviceId = ack.deviceId,
                    commandId = ack.commandId,
                    clientDeviceId = ack.clientDeviceId,
                    sessionId = ack.sessionId,
                    userId = ack.userId,
                    status = RemoteCommandStatus.valueOf(ack.status),
                    errorMessage = ack.errorMessage,
                )
            }.getOrNull()
        }

    private data class PendingRemoteAck(
        val deviceId: String,
        val commandId: String,
        val clientDeviceId: String,
        val sessionId: String,
        val userId: String?,
        val status: RemoteCommandStatus,
        val errorMessage: String?,
    )

    companion object {
        @Volatile private var instance: RemoteControlRepository? = null

        fun getInstance(context: Context): RemoteControlRepository {
            val applicationContext = context.applicationContext
            val prefs = KestrelPrefs(applicationContext)
            return instance ?: synchronized(this) {
                instance
                    ?: RemoteControlRepository(
                        authRepository = CloudAuthRepository.getInstance(applicationContext),
                        apiClient =
                            CloudApiClient(
                                baseUrlProvider = {
                                    prefs.cloudSettingsValue().apiBaseUrl
                                },
                            ),
                        executor = RemoteCommandExecutor(LocationServiceMockCommandApplier(applicationContext)),
                        settingsStore = DataStoreRemoteControlSettingsStore(prefs),
                        playbackStateProvider = LocationServicePlaybackStateProvider,
                        deviceInfoProvider = AndroidRemoteDeviceInfoProvider(applicationContext),
                    ).also { instance = it }
            }
        }
    }
}

private fun Throwable.toRemoteControlMessage(): String =
    when (this) {
        is CloudApiException -> message
        is IOException -> message ?: "Remote control network error"
        is IllegalStateException -> message ?: "Remote control failed"
        else -> "Remote control failed"
    }

private class DataStoreRemoteControlSettingsStore(
    private val prefs: KestrelPrefs,
) : RemoteControlSettingsStore {
    override suspend fun load(): RemoteControlSettings = prefs.remoteControlSettings.first()

    override suspend fun save(settings: RemoteControlSettings) {
        prefs.setRemoteControlSettings(settings)
    }
}

private object LocationServicePlaybackStateProvider : RemotePlaybackStateProvider {
    override fun current(): RemotePlaybackState = LocationService.runtimeState.value.toRemotePlaybackState()
}

internal fun RuntimeState.toRemotePlaybackState(): RemotePlaybackState =
    when (this) {
        RuntimeState.Idle -> RemotePlaybackState.IDLE
        is RuntimeState.Single -> RemotePlaybackState.SINGLE
        is RuntimeState.Route ->
            if (paused) {
                RemotePlaybackState.PAUSED
            } else {
                RemotePlaybackState.ROUTE
            }
    }

private class AndroidRemoteDeviceInfoProvider(
    context: Context,
) : RemoteDeviceInfoProvider {
    private val applicationContext = context.applicationContext

    override fun current(): RemoteDeviceInfo =
        RemoteDeviceInfo(
            name = defaultDeviceName(),
            appVersion = appVersionName(),
        )

    private fun defaultDeviceName(): String =
        listOf(Build.MANUFACTURER, Build.MODEL)
            .filter(String::isNotBlank)
            .joinToString(" ")
            .ifBlank { "Android device" }

    private fun appVersionName(): String? =
        runCatching {
            val packageManager = applicationContext.packageManager
            val packageName = applicationContext.packageName
            val packageInfo =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    packageManager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
                } else {
                    @Suppress("DEPRECATION")
                    packageManager.getPackageInfo(packageName, 0)
                }
            packageInfo.versionName
        }.getOrNull()
}
