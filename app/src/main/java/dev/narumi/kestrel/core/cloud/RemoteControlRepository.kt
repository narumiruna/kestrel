package dev.narumi.kestrel.core.cloud

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.RemoteControlSettings
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

internal class RemoteControlRepository internal constructor(
    private val authRepository: CloudSyncSessionProvider,
    private val apiClient: CloudRemoteControlApi,
    private val executor: RemoteCommandExecutor,
    private val settingsStore: RemoteControlSettingsStore,
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

    suspend fun pollOnce() {
        stateMutex.withLock {
            runCatching { pollOnceOrThrow() }
                .onFailure {
                    _runtimeStatus.value = RemoteControlRuntimeStatus(error = it.toRemoteControlMessage())
                }
        }
    }

    private suspend fun pollOnceOrThrow() {
        val settings = loadSettings()
        if (settings.enabled) {
            val session = authRepository.currentSession()
            if (session == null) {
                _runtimeStatus.value = RemoteControlRuntimeStatus(error = "Sign in to cloud to use web remote control")
            } else {
                pollWithSession(settings, session)
            }
        }
    }

    private suspend fun pollWithSession(
        settings: RemoteControlSettings,
        session: CloudSession,
    ) {
        val registered = ensureRegistered(settings, session)
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
                executeCommands(response.commands, registered, session)
            }
        }
    }

    private suspend fun executeCommands(
        commands: List<RemoteCommandPayload>,
        registered: RemoteControlSettings,
        session: CloudSession,
    ) {
        for (command in commands) {
            if (loadSettings().enabled) {
                val result = executor.execute(command)
                pendingAcks = pendingAcks + command.toPendingAck(registered, result)
                _runtimeStatus.value =
                    RemoteControlRuntimeStatus(
                        message = "Command ${command.type} ${result.status.name.lowercase(Locale.US)}",
                        error = result.errorMessage,
                        lastCommandStatus = result.status,
                    )
            }
        }
        retryPendingAcks(authRepository.currentSession() ?: session)
    }

    private suspend fun disableRemoteControl() {
        val settings = loadSettings()
        settingsStore.save(settings.copy(enabled = false))
        pendingAcks = emptyList()
        _runtimeStatus.value = RemoteControlRuntimeStatus(message = "Remote control disabled")
        val clientDeviceId = settings.clientDeviceId ?: return
        val session = authRepository.currentSession() ?: return
        register(settings.copy(enabled = false, clientDeviceId = clientDeviceId), session)
    }

    private suspend fun ensureRegistered(
        settings: RemoteControlSettings,
        session: CloudSession,
    ): RemoteControlSettings =
        if (settings.serverDeviceId != null && settings.clientDeviceId != null && settings.registeredUserId == session.userId) {
            settings
        } else {
            register(settingsWithClientId(settings.copy(serverDeviceId = null)), session)
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
            settings.copy(
                clientDeviceId = clientDeviceId,
                serverDeviceId = device.id,
                deviceName = device.name,
                registeredUserId = session.userId,
            )
        settingsStore.save(updated)
        return updated
    }

    private suspend fun retryPendingAcks(session: CloudSession) {
        val stillPending = mutableListOf<PendingRemoteAck>()
        for (ack in pendingAcks) {
            val sent =
                runCatching {
                    withAuthorizedSession(session) {
                        apiClient.ackCommand(
                            accessToken = it.accessToken,
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
            if (!sent) stillPending += ack
        }
        pendingAcks = stillPending
    }

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
            val refreshedSession = authRepository.refreshSessionIfCurrent(session) ?: error("Session expired. Please sign in again.")
            block(refreshedSession)
        }

    private fun requireSession(): CloudSession = authRepository.currentSession() ?: error("Sign in to cloud first")

    private fun RemoteCommandPayload.toPendingAck(
        settings: RemoteControlSettings,
        result: RemoteCommandExecutionResult,
    ): PendingRemoteAck =
        PendingRemoteAck(
            deviceId = settings.serverDeviceId ?: deviceId,
            commandId = id,
            clientDeviceId = settings.clientDeviceId ?: error("Missing client device id"),
            status = result.status,
            errorMessage = result.errorMessage,
        )

    private fun Throwable.toRemoteControlMessage(): String =
        when (this) {
            is CloudApiException -> message
            is IOException -> message ?: "Remote control network error"
            is IllegalStateException -> message ?: "Remote control failed"
            else -> "Remote control failed"
        }

    private data class PendingRemoteAck(
        val deviceId: String,
        val commandId: String,
        val clientDeviceId: String,
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
                        deviceInfoProvider = AndroidRemoteDeviceInfoProvider(applicationContext),
                    ).also { instance = it }
            }
        }
    }
}

private class DataStoreRemoteControlSettingsStore(
    private val prefs: KestrelPrefs,
) : RemoteControlSettingsStore {
    override suspend fun load(): RemoteControlSettings = prefs.remoteControlSettings.first()

    override suspend fun save(settings: RemoteControlSettings) {
        prefs.setRemoteControlSettings(settings)
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
