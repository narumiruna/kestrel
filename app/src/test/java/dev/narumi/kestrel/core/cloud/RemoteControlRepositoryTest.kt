package dev.narumi.kestrel.core.cloud

import dev.narumi.kestrel.core.data.RemoteControlPendingAck
import dev.narumi.kestrel.core.data.RemoteControlSettings
import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.encodeToJsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteControlRepositoryTest {
    private val session =
        CloudSession(
            accessToken = "access-1",
            accessTokenExpiresAt = Long.MAX_VALUE,
            refreshToken = "refresh-1",
            sessionId = "session-1",
            userId = "user-1",
            username = "narumi",
        )

    @Test
    fun disabledSettingsDoNotPoll() =
        runBlocking {
            val api = FakeRemoteApi()
            val repository = repository(api = api)

            repository.pollOnce()

            assertEquals(0, api.pollCount)
        }

    @Test
    fun missingSessionDoesNotPoll() =
        runBlocking {
            val api = FakeRemoteApi()
            val repository =
                repository(
                    auth = FakeAuth(session = null),
                    api = api,
                    store = MemorySettingsStore(registeredSettings(enabled = true)),
                )

            repository.pollOnce()

            assertEquals(0, api.pollCount)
            assertEquals("Sign in to cloud to use web remote control", repository.runtimeStatus.value.error)
        }

    @Test
    fun enablingRegistersDeviceAndPersistsServerId() =
        runBlocking {
            val api = FakeRemoteApi()
            val store = MemorySettingsStore(RemoteControlSettings())
            val repository = repository(api = api, store = store)

            repository.setEnabled(true)

            assertTrue(store.settings.enabled)
            assertNotNull(store.settings.clientDeviceId)
            assertEquals("device-1", store.settings.serverDeviceId)
            assertEquals("Test phone", store.settings.deviceName)
            assertEquals(true, api.registerRequests.single().remoteControlEnabled)
        }

    @Test
    fun registerFailureKeepsClientDeviceIdForRetry() =
        runBlocking {
            val api = FakeRemoteApi(failRegister = true)
            val store = MemorySettingsStore(RemoteControlSettings())
            val repository = repository(api = api, store = store)

            val failed = runCatching { repository.setEnabled(true) }

            assertTrue(failed.isFailure)
            val clientDeviceId = store.settings.clientDeviceId
            assertNotNull(clientDeviceId)
            assertFalse(store.settings.enabled)

            api.failRegister = false
            repository.setEnabled(true)

            assertEquals(clientDeviceId, api.registerRequests.last().clientDeviceId)
        }

    @Test
    fun disablingRegistersOptOutWhenDeviceIsKnown() =
        runBlocking {
            val api = FakeRemoteApi()
            val store = MemorySettingsStore(registeredSettings(enabled = true))
            val repository = repository(api = api, store = store)

            repository.setEnabled(false)

            assertFalse(store.settings.enabled)
            assertEquals(false, api.registerRequests.single().remoteControlEnabled)
        }

    @Test
    fun disablingWhileSignedOutShowsServerOptOutWarning() =
        runBlocking {
            val api = FakeRemoteApi()
            val store = MemorySettingsStore(registeredSettings(enabled = true))
            val repository = repository(auth = FakeAuth(session = null), api = api, store = store)

            repository.setEnabled(false)

            assertTrue(store.settings.enabled)
            assertEquals(0, api.registerRequests.size)
            assertEquals(
                "Sign in to cloud to disable remote control on the server",
                repository.runtimeStatus.value.error,
            )
        }

    @Test
    fun optOutFailureKeepsRemoteControlEnabledForRetry() =
        runBlocking {
            val api = FakeRemoteApi(failRegister = true)
            val store = MemorySettingsStore(registeredSettings(enabled = true))
            val repository = repository(api = api, store = store)

            val failed = runCatching { repository.setEnabled(false) }

            assertTrue(failed.isFailure)
            assertTrue(store.settings.enabled)
            assertEquals(false, api.registerRequests.single().remoteControlEnabled)
        }

    @Test
    fun disablingRetriesPendingAcksBeforeOptOut() =
        runBlocking {
            val api = FakeRemoteApi(commands = mutableListOf(setPointCommand("command-1")), failAck = true)
            val store = MemorySettingsStore(registeredSettings(enabled = true))
            val repository = repository(api = api, store = store)

            repository.pollOnce()
            api.failAck = false
            repository.setEnabled(false)

            assertEquals(listOf("command-1", "command-1"), api.ackCalls.map { it.commandId })
            assertEquals(false, api.registerRequests.single().remoteControlEnabled)
            assertEquals(emptyList<RemoteControlPendingAck>(), store.settings.pendingAcks)
        }

    @Test
    fun disablingRetriesPersistedPendingAcksBeforeOptOut() =
        runBlocking {
            val api = FakeRemoteApi()
            val store =
                MemorySettingsStore(
                    registeredSettings(enabled = true).copy(
                        pendingAcks =
                            listOf(
                                RemoteControlPendingAck(
                                    deviceId = "device-1",
                                    commandId = "command-1",
                                    clientDeviceId = "client-1",
                                    sessionId = "session-1",
                                    userId = "user-1",
                                    status = RemoteCommandStatus.APPLIED.name,
                                ),
                            ),
                    ),
                )
            val repository = repository(api = api, store = store)

            repository.setEnabled(false)

            assertEquals(listOf("command-1"), api.ackCalls.map { it.commandId })
            assertEquals(false, api.registerRequests.single().remoteControlEnabled)
            assertEquals(emptyList<RemoteControlPendingAck>(), store.settings.pendingAcks)
        }

    @Test
    fun accountSwitchRegistersBeforePolling() =
        runBlocking {
            val switchedSession = session.copy(userId = "user-2")
            val api = FakeRemoteApi(commands = mutableListOf(setPointCommand("command-1")))
            val repository =
                repository(
                    auth = FakeAuth(switchedSession),
                    api = api,
                    store = MemorySettingsStore(registeredSettings(enabled = true)),
                )

            repository.pollOnce()

            assertEquals(1, api.registerRequests.size)
            assertEquals(1, api.pollCount)
        }

    @Test
    fun accountSwitchDropsPendingAcksBeforePolling() =
        runBlocking {
            val auth = FakeAuth(session)
            val api = FakeRemoteApi(commands = mutableListOf(setPointCommand("command-1")), failAck = true)
            val repository = repository(auth = auth, api = api, store = MemorySettingsStore(registeredSettings(enabled = true)))

            repository.pollOnce()
            auth.session = session.copy(userId = "user-2")
            api.failAck = false
            api.commands += setPointCommand("command-2")
            repository.pollOnce()

            assertEquals(2, api.pollCount)
            assertEquals(listOf("command-1", "command-2"), api.ackCalls.map { it.commandId })
        }

    @Test
    fun pollExecutesAndAcksCommand() =
        runBlocking {
            val api = FakeRemoteApi(commands = mutableListOf(setPointCommand("command-1")))
            val applier = FakeApplier()
            val repository = repository(api = api, applier = applier, store = MemorySettingsStore(registeredSettings(enabled = true)))

            repository.pollOnce()

            assertEquals(listOf("setPoint"), applier.calls)
            assertEquals(listOf("command-1"), api.ackCalls.map { it.commandId })
            assertEquals(
                RemoteCommandStatus.APPLIED,
                api.ackCalls
                    .single()
                    .request.status,
            )
        }

    @Test
    fun failedCommandResultAcksFailed() =
        runBlocking {
            val api = FakeRemoteApi(commands = mutableListOf(setPointCommand("command-1")))
            val applier = FakeApplier(result = RemoteCommandExecutionResult.failed("mock permission missing"))
            val repository = repository(api = api, applier = applier, store = MemorySettingsStore(registeredSettings(enabled = true)))

            repository.pollOnce()

            assertEquals(
                RemoteCommandStatus.FAILED,
                api.ackCalls
                    .single()
                    .request.status,
            )
            assertEquals(
                "mock permission missing",
                api.ackCalls
                    .single()
                    .request.errorMessage,
            )
        }

    @Test
    fun ackFailureRetriesBeforePollingNewCommands() =
        runBlocking {
            val api = FakeRemoteApi(commands = mutableListOf(setPointCommand("command-1")), failAck = true)
            val applier = FakeApplier()
            val repository = repository(api = api, applier = applier, store = MemorySettingsStore(registeredSettings(enabled = true)))

            repository.pollOnce()
            api.commands += setPointCommand("command-2")
            repository.pollOnce()

            assertEquals(1, api.pollCount)
            assertEquals(listOf("setPoint"), applier.calls)

            api.failAck = false
            repository.pollOnce()

            assertEquals(2, api.pollCount)
            assertEquals(listOf("setPoint", "setPoint"), applier.calls)
            assertEquals("command-2", api.ackCalls.last().commandId)
        }

    @Test
    fun pendingAckSurvivesRepositoryRecreation() =
        runBlocking {
            val api = FakeRemoteApi(commands = mutableListOf(setPointCommand("command-1")), failAck = true)
            val store = MemorySettingsStore(registeredSettings(enabled = true))
            repository(api = api, store = store).pollOnce()

            assertEquals(1, store.settings.pendingAcks.size)

            api.failAck = false
            repository(api = api, store = store).pollOnce()

            assertEquals(listOf("command-1", "command-1"), api.ackCalls.map { it.commandId })
            assertEquals(emptyList<RemoteControlPendingAck>(), store.settings.pendingAcks)
        }

    @Test
    fun pendingAckRetryUsesRefreshedSessionForRemainingAcks() =
        runBlocking {
            val refreshedSession = session.copy(accessToken = "access-2", refreshToken = "refresh-2")
            val auth = FakeAuth(session = session, refreshedSession = refreshedSession)
            val api =
                FakeRemoteApi(
                    commands = mutableListOf(setPointCommand("command-1"), setPointCommand("command-2")),
                    expiredAccessTokens = mutableSetOf("access-1"),
                )
            val repository = repository(auth = auth, api = api, store = MemorySettingsStore(registeredSettings(enabled = true)))

            repository.pollOnce()

            assertEquals(refreshedSession, auth.session)
            assertEquals(listOf("access-1", "access-2", "access-2"), api.ackAccessTokens)
            assertEquals(listOf("command-1", "command-2"), api.ackCalls.map { it.commandId })
        }

    @Test
    fun pendingAckRetrySurvivesSameUserRelogin() =
        runBlocking {
            val auth = FakeAuth(session = session)
            val api = FakeRemoteApi(commands = mutableListOf(setPointCommand("command-1")), failAck = true)
            val repository = repository(auth = auth, api = api, store = MemorySettingsStore(registeredSettings(enabled = true)))

            repository.pollOnce()
            auth.session = session.copy(accessToken = "access-2", sessionId = "session-2")
            api.failAck = false
            repository.pollOnce()

            assertEquals(listOf("access-1", "access-2"), api.ackAccessTokens)
            assertEquals(listOf("command-1", "command-1"), api.ackCalls.map { it.commandId })
        }

    @Test
    fun pendingAckRetryDoesNotSwitchToDifferentUser() =
        runBlocking {
            val auth = FakeAuth(session = session)
            val api = FakeRemoteApi(commands = mutableListOf(setPointCommand("command-1")), failAck = true)
            val repository = repository(auth = auth, api = api, store = MemorySettingsStore(registeredSettings(enabled = true)))

            repository.pollOnce()
            auth.session = session.copy(accessToken = "other-access", sessionId = "other-session", userId = "user-2")
            api.failAck = false
            repository.setEnabled(false)

            assertEquals(listOf("access-1"), api.ackAccessTokens.takeLast(1))
        }

    private fun repository(
        auth: FakeAuth = FakeAuth(session),
        api: FakeRemoteApi = FakeRemoteApi(),
        applier: FakeApplier = FakeApplier(),
        store: MemorySettingsStore = MemorySettingsStore(RemoteControlSettings()),
    ): RemoteControlRepository =
        RemoteControlRepository(
            authRepository = auth,
            apiClient = api,
            executor = RemoteCommandExecutor(applier),
            settingsStore = store,
            deviceInfoProvider = StaticDeviceInfoProvider,
        )

    private fun registeredSettings(enabled: Boolean): RemoteControlSettings =
        RemoteControlSettings(
            enabled = enabled,
            clientDeviceId = "client-1",
            serverDeviceId = "device-1",
            deviceName = "Test phone",
            registeredUserId = "user-1",
        )

    private class FakeAuth(
        var session: CloudSession?,
        private val refreshedSession: CloudSession? = session,
    ) : CloudSyncSessionProvider {
        override fun currentSession(): CloudSession? = session

        override suspend fun refreshSessionIfCurrent(expectedSession: CloudSession): CloudSession? =
            if (session == expectedSession) {
                refreshedSession.also { session = it }
            } else {
                null
            }
    }

    private class MemorySettingsStore(
        var settings: RemoteControlSettings,
    ) : RemoteControlSettingsStore {
        override suspend fun load(): RemoteControlSettings = settings

        override suspend fun save(settings: RemoteControlSettings) {
            this.settings = settings
        }
    }

    private object StaticDeviceInfoProvider : RemoteDeviceInfoProvider {
        override fun current(): RemoteDeviceInfo = RemoteDeviceInfo(name = "Test phone", appVersion = "1.0")
    }

    private class FakeRemoteApi(
        val commands: MutableList<RemoteCommandPayload> = mutableListOf(),
        var failAck: Boolean = false,
        var failRegister: Boolean = false,
        val expiredAccessTokens: MutableSet<String> = mutableSetOf(),
    ) : CloudRemoteControlApi {
        val registerRequests = mutableListOf<RegisterRemoteDeviceRequest>()
        val ackCalls = mutableListOf<AckCall>()
        val ackAccessTokens = mutableListOf<String>()
        var pollCount = 0

        override suspend fun registerDevice(
            accessToken: String,
            request: RegisterRemoteDeviceRequest,
        ): RemoteDevicePayload {
            registerRequests += request
            if (failRegister) error("register failed")
            return RemoteDevicePayload(
                createdAt = NOW,
                id = "device-1",
                lastSeenAt = NOW,
                name = request.name,
                platform = "ANDROID",
                remoteControlEnabled = request.remoteControlEnabled,
            )
        }

        override suspend fun pollCommands(
            accessToken: String,
            deviceId: String,
            request: PollRemoteCommandsRequest,
        ): RemoteCommandsPollResponse {
            pollCount++
            val delivered = commands.toList()
            commands.clear()
            return RemoteCommandsPollResponse(commands = delivered, serverTime = NOW)
        }

        override suspend fun ackCommand(
            accessToken: String,
            deviceId: String,
            commandId: String,
            request: AckRemoteCommandRequest,
        ): RemoteCommandPayload {
            ackAccessTokens += accessToken
            if (accessToken in expiredAccessTokens) {
                throw CloudApiException(statusCode = 401, code = "UNAUTHORIZED", message = "expired")
            }
            ackCalls += AckCall(commandId, request)
            if (failAck) error("ack failed")
            return setPointCommand(commandId).copy(status = request.status, errorMessage = request.errorMessage)
        }
    }

    private data class AckCall(
        val commandId: String,
        val request: AckRemoteCommandRequest,
    )

    private class FakeApplier(
        private val result: RemoteCommandExecutionResult = RemoteCommandExecutionResult.applied(),
    ) : MockCommandApplier {
        val calls = mutableListOf<String>()

        override suspend fun setPoint(point: LatLng): RemoteCommandExecutionResult {
            calls += "setPoint"
            return result
        }

        override suspend fun startRoute(
            waypoints: List<LatLng>,
            speedKmh: Double,
            mode: MovementEngine.Mode,
        ): RemoteCommandExecutionResult {
            calls += "startRoute"
            return result
        }

        override suspend fun stop(): RemoteCommandExecutionResult {
            calls += "stop"
            return result
        }
    }
}

private val remoteTestJson = Json { ignoreUnknownKeys = true }

private const val NOW = "2026-06-20T08:00:00Z"

private fun setPointCommand(id: String): RemoteCommandPayload =
    RemoteCommandPayload(
        createdAt = NOW,
        deliveredAt = NOW,
        deviceId = "device-1",
        expiresAt = "2026-06-20T08:01:00Z",
        id = id,
        payload =
            remoteTestJson.encodeToJsonElement(
                RemoteSetPointPayload(RemotePointPayload(latitude = 25.033, longitude = 121.5654)),
            ),
        status = RemoteCommandStatus.DELIVERED,
        type = RemoteCommandType.SET_POINT,
    )
