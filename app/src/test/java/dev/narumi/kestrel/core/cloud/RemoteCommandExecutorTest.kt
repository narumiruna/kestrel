package dev.narumi.kestrel.core.cloud

import dev.narumi.kestrel.core.location.LatLng
import dev.narumi.kestrel.core.location.MovementEngine
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.encodeToJsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteCommandExecutorTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun setPointAppliesWithoutStoppingFirst() =
        runBlocking {
            val applier = FakeApplier()
            val command =
                command(
                    type = RemoteCommandType.SET_POINT,
                    payload =
                        RemoteSetPointPayload(
                            point = RemotePointPayload(latitude = 25.033, longitude = 121.5654),
                        ),
                )

            val result = RemoteCommandExecutor(applier).execute(command)

            assertEquals(RemoteCommandStatus.APPLIED, result.status)
            assertEquals(listOf("setPoint"), applier.calls)
            assertEquals(LatLng(25.033, 121.5654), applier.lastPoint)
        }

    @Test
    fun startRouteMapsApiModeWithoutStoppingFirst() =
        runBlocking {
            val applier = FakeApplier()
            val command =
                command(
                    type = RemoteCommandType.START_ROUTE,
                    payload =
                        RemoteStartRoutePayload(
                            waypoints =
                                listOf(
                                    RemotePointPayload(latitude = 25.033, longitude = 121.5654),
                                    RemotePointPayload(latitude = 25.034, longitude = 121.5664),
                                ),
                            speedKmh = 20.0,
                            mode = CloudRouteMode.PING_PONG,
                        ),
                )

            val result = RemoteCommandExecutor(applier).execute(command)

            assertEquals(RemoteCommandStatus.APPLIED, result.status)
            assertEquals(listOf("startRoute"), applier.calls)
            assertEquals(MovementEngine.Mode.PingPong, applier.lastMode)
        }

    @Test
    fun invalidRouteFailsBeforeCallingApplier() =
        runBlocking {
            val applier = FakeApplier()
            val command =
                command(
                    type = RemoteCommandType.START_ROUTE,
                    payload =
                        RemoteStartRoutePayload(
                            waypoints = listOf(RemotePointPayload(latitude = 25.033, longitude = 121.5654)),
                            speedKmh = 20.0,
                            mode = CloudRouteMode.ONCE,
                        ),
                )

            val result = RemoteCommandExecutor(applier).execute(command)

            assertEquals(RemoteCommandStatus.FAILED, result.status)
            assertTrue(result.errorMessage!!.contains("at least 2"))
            assertTrue(applier.calls.isEmpty())
        }

    @Test
    fun identicalWaypointRouteFailsBeforeCallingApplier() =
        runBlocking {
            val applier = FakeApplier()
            val command =
                command(
                    type = RemoteCommandType.START_ROUTE,
                    payload =
                        RemoteStartRoutePayload(
                            waypoints =
                                listOf(
                                    RemotePointPayload(latitude = 25.033, longitude = 121.5654),
                                    RemotePointPayload(latitude = 25.033, longitude = 121.5654),
                                ),
                            speedKmh = 20.0,
                            mode = CloudRouteMode.LOOP,
                        ),
                )

            val result = RemoteCommandExecutor(applier).execute(command)

            assertEquals(RemoteCommandStatus.FAILED, result.status)
            assertTrue(result.errorMessage!!.contains("non-identical"))
            assertTrue(applier.calls.isEmpty())
        }

    @Test
    fun stopCallsOnlyStop() =
        runBlocking {
            val applier = FakeApplier()
            val command = command(type = RemoteCommandType.STOP, payload = emptyMap<String, String>())

            val result = RemoteCommandExecutor(applier).execute(command)

            assertEquals(RemoteCommandStatus.APPLIED, result.status)
            assertEquals(listOf("stop"), applier.calls)
        }

    private inline fun <reified T> command(
        type: RemoteCommandType,
        payload: T,
    ): RemoteCommandPayload =
        RemoteCommandPayload(
            createdAt = "2026-06-20T08:00:00Z",
            deviceId = "device-1",
            expiresAt = "2026-06-20T08:01:00Z",
            id = "command-1",
            payload = json.encodeToJsonElement(payload),
            status = RemoteCommandStatus.DELIVERED,
            type = type,
        )

    private class FakeApplier : MockCommandApplier {
        val calls = mutableListOf<String>()
        var lastPoint: LatLng? = null
        var lastMode: MovementEngine.Mode? = null

        override suspend fun setPoint(point: LatLng): RemoteCommandExecutionResult {
            calls += "setPoint"
            lastPoint = point
            return RemoteCommandExecutionResult.applied()
        }

        override suspend fun startRoute(
            waypoints: List<LatLng>,
            speedKmh: Double,
            mode: MovementEngine.Mode,
        ): RemoteCommandExecutionResult {
            calls += "startRoute"
            lastMode = mode
            return RemoteCommandExecutionResult.applied()
        }

        override suspend fun stop(): RemoteCommandExecutionResult {
            calls += "stop"
            return RemoteCommandExecutionResult.applied()
        }
    }
}
