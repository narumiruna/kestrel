package dev.narumi.kestrel.core.cloud

import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.narumi.kestrel.MainActivity
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.RemoteControlSettings
import dev.narumi.kestrel.core.location.LocationService
import dev.narumi.kestrel.core.location.RuntimeState
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.junit.After
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.util.Locale
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.random.Random

@RunWith(AndroidJUnit4::class)
class RemoteControlDeviceSmokeTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val prefs = KestrelPrefs(context)
    private val json = Json { ignoreUnknownKeys = true }
    private var smokeStarted = false

    @After
    fun stopService() {
        if (smokeStarted) {
            LocationService.stop(context)
        }
    }

    @Test
    fun webCommandsArePolledAppliedAndAcked() =
        runBlocking {
            val args = InstrumentationRegistry.getArguments()
            assumeTrue(args.getString("remoteSmoke") == "true")
            smokeStarted = true
            val baseUrl = normalizeCloudApiBaseUrl(args.getString("baseUrl") ?: DEFAULT_BASE_URL)
            val store = CloudSessionStore(context)
            val previousSession = store.load()
            val previousApiBaseUrl = prefs.cloudSettingsValue().apiBaseUrl
            val previousRemoteSettings = prefs.remoteControlSettings.first()
            val repository = RemoteControlRepository.getInstance(context)
            val poller = RemoteControlPoller.getInstance(context)

            try {
                val username = "android-smoke-${System.currentTimeMillis()}-${Random.nextInt(1000, 9999)}"
                val password = "KestrelSmoke-${System.currentTimeMillis()}!"
                val session = createSmokeSession(baseUrl, username, password)
                store.save(session)
                prefs.setCloudApiBaseUrl(baseUrl)
                prefs.setRemoteControlSettings(RemoteControlSettings(enabled = false, deviceName = "Android smoke"))

                repository.setEnabled(true)
                context.startActivity(
                    Intent(context, MainActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        .putExtra(MainActivity.EXTRA_SKIP_CLOUD_SYNC_ON_FOREGROUND, true),
                )
                delay(1_000)
                val settings = prefs.remoteControlSettings.first()
                val deviceId = requireNotNull(settings.serverDeviceId) { "missing smoke device id" }

                try {
                    val setPoint = createSetPointCommand(baseUrl, session.accessToken, deviceId)
                    poller.setForegroundActive(true)
                    waitForCommandStatus(baseUrl, session.accessToken, deviceId, setPoint.id, RemoteCommandStatus.APPLIED)
                    check(LocationService.runtimeState.value is RuntimeState.Single) { "SET_POINT did not reach single state" }

                    val startRoute = createStartRouteCommand(baseUrl, session.accessToken, deviceId)
                    poller.setForegroundActive(true)
                    waitForCommandStatus(baseUrl, session.accessToken, deviceId, startRoute.id, RemoteCommandStatus.APPLIED)
                    check(LocationService.runtimeState.value is RuntimeState.Route) { "START_ROUTE did not reach route state" }

                    poller.setForegroundActive(false)
                    val stop = createStopCommand(baseUrl, session.accessToken, deviceId)
                    waitForCommandStatus(baseUrl, session.accessToken, deviceId, stop.id, RemoteCommandStatus.APPLIED)
                    check(LocationService.runtimeState.value is RuntimeState.Idle) { "STOP did not reach idle state" }
                } finally {
                    poller.setForegroundActive(false)
                    runCatching { repository.setEnabled(false) }
                }
            } finally {
                if (previousSession == null) {
                    store.clear()
                } else {
                    store.save(previousSession)
                }
                prefs.setCloudApiBaseUrl(previousApiBaseUrl)
                prefs.setRemoteControlSettings(previousRemoteSettings)
            }
        }

    private fun createSmokeSession(
        baseUrl: String,
        username: String,
        password: String,
    ): CloudSession {
        post<UnitResponse>(
            baseUrl,
            "/auth/register",
            buildJsonObject {
                put("username", username)
                put("password", password)
            },
        )
        val setup =
            post<TotpSetupResponse>(
                baseUrl,
                "/auth/totp/setup",
                buildJsonObject {
                    put("username", username)
                    put("password", password)
                },
            )
        post<UnitResponse>(
            baseUrl,
            "/auth/totp/verify",
            buildJsonObject {
                put("username", username)
                put("password", password)
                put("code", totpCode(setup.secret))
            },
        )
        val login =
            post<LoginResponse>(
                baseUrl,
                "/auth/login",
                buildJsonObject {
                    put("username", username)
                    put("password", password)
                    put("totpCode", totpCode(setup.secret))
                },
            )
        return CloudSession(
            accessToken = login.accessToken,
            accessTokenExpiresAt =
                java.time.Instant
                    .parse(login.accessTokenExpiresAt)
                    .toEpochMilli(),
            refreshToken = login.refreshToken,
            sessionId = login.session.id,
            userId = login.user.id,
            username = login.user.username,
        )
    }

    private fun createSetPointCommand(
        baseUrl: String,
        accessToken: String,
        deviceId: String,
    ): SmokeCommand =
        post(
            baseUrl,
            "/devices/$deviceId/commands",
            buildJsonObject {
                put("type", "SET_POINT")
                putJsonObject("payload") {
                    putJsonObject("point") {
                        put("latitude", 25.033)
                        put("longitude", 121.5654)
                    }
                }
            },
            accessToken,
        )

    private fun createStartRouteCommand(
        baseUrl: String,
        accessToken: String,
        deviceId: String,
    ): SmokeCommand =
        post(
            baseUrl,
            "/devices/$deviceId/commands",
            buildJsonObject {
                put("type", "START_ROUTE")
                putJsonObject("payload") {
                    put("speedKmh", 5.0)
                    put("mode", "LOOP")
                    putJsonArray("waypoints") {
                        add(
                            buildJsonObject {
                                put("latitude", 25.033)
                                put("longitude", 121.5654)
                            },
                        )
                        add(
                            buildJsonObject {
                                put("latitude", 25.0333)
                                put("longitude", 121.5657)
                            },
                        )
                    }
                }
            },
            accessToken,
        )

    private fun createStopCommand(
        baseUrl: String,
        accessToken: String,
        deviceId: String,
    ): SmokeCommand =
        post(
            baseUrl,
            "/devices/$deviceId/commands",
            buildJsonObject {
                put("type", "STOP")
                putJsonObject("payload") {}
            },
            accessToken,
        )

    private suspend fun waitForCommandStatus(
        baseUrl: String,
        accessToken: String,
        deviceId: String,
        commandId: String,
        status: RemoteCommandStatus,
    ) {
        var lastCommand: SmokeCommand? = null
        repeat(80) {
            val observed = getLastCommand(baseUrl, accessToken, deviceId)
            lastCommand = observed
            if (observed?.id == commandId && observed.status == status) return
            delay(500)
        }
        error("command $commandId did not reach $status; last=$lastCommand; runtime=${LocationService.runtimeState.value}; repo=${RemoteControlRepository.getInstance(context).runtimeStatus.value}")
    }

    private fun getLastCommand(
        baseUrl: String,
        accessToken: String,
        deviceId: String,
    ): SmokeCommand? =
        get<DevicesResponse>(baseUrl, "/devices", accessToken)
            .devices
            .first { it.id == deviceId }
            .lastCommand

    private inline fun <reified T> get(
        baseUrl: String,
        path: String,
        accessToken: String,
    ): T = request("GET", baseUrl, path, null, accessToken)

    private inline fun <reified T> post(
        baseUrl: String,
        path: String,
        body: kotlinx.serialization.json.JsonElement,
        accessToken: String? = null,
    ): T = request("POST", baseUrl, path, body, accessToken)

    private inline fun <reified T> request(
        method: String,
        baseUrl: String,
        path: String,
        body: kotlinx.serialization.json.JsonElement?,
        accessToken: String?,
    ): T {
        val connection =
            (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 15_000
                readTimeout = 15_000
                setRequestProperty("Accept", "application/json")
                if (accessToken != null) setRequestProperty("Authorization", "Bearer $accessToken")
                if (body != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                }
            }
        if (body != null) {
            OutputStreamWriter(connection.outputStream).use { it.write(json.encodeToString(body)) }
        }
        val status = connection.responseCode
        val response =
            (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()
                ?.use { it.readText() }
                .orEmpty()
        connection.disconnect()
        check(status in 200..299) { "$method $path failed with $status: $response" }
        if (T::class == UnitResponse::class) return UnitResponse as T
        return json.decodeFromString(response)
    }

    private fun totpCode(secret: String): String {
        val key = base32Decode(secret)
        val counter = System.currentTimeMillis() / 30_000L
        val mac =
            Mac.getInstance("HmacSHA1").apply {
                init(SecretKeySpec(key, "HmacSHA1"))
            }
        val hash = mac.doFinal(ByteBuffer.allocate(Long.SIZE_BYTES).putLong(counter).array())
        val offset = hash.last().toInt() and 0x0f
        val binary =
            ((hash[offset].toInt() and 0x7f) shl 24) or
                ((hash[offset + 1].toInt() and 0xff) shl 16) or
                ((hash[offset + 2].toInt() and 0xff) shl 8) or
                (hash[offset + 3].toInt() and 0xff)
        return (binary % 1_000_000).toString().padStart(6, '0')
    }

    private fun base32Decode(value: String): ByteArray {
        var buffer = 0
        var bitsLeft = 0
        val output = mutableListOf<Byte>()
        for (char in value.uppercase(Locale.US).filter { it in 'A'..'Z' || it in '2'..'7' }) {
            buffer = (buffer shl 5) or BASE32_ALPHABET.indexOf(char)
            bitsLeft += 5
            if (bitsLeft >= 8) {
                output += ((buffer shr (bitsLeft - 8)) and 0xff).toByte()
                bitsLeft -= 8
            }
        }
        return output.toByteArray()
    }

    @Serializable
    private object UnitResponse

    @Serializable
    private data class TotpSetupResponse(
        val secret: String,
    )

    @Serializable
    private data class LoginResponse(
        val accessToken: String,
        val accessTokenExpiresAt: String,
        val refreshToken: String,
        val session: SessionPayload,
        val user: UserPayload,
    )

    @Serializable
    private data class DevicesResponse(
        val devices: List<SmokeDevice>,
    )

    @Serializable
    private data class SmokeDevice(
        val id: String,
        val lastCommand: SmokeCommand? = null,
    )

    @Serializable
    private data class SmokeCommand(
        val id: String,
        val status: RemoteCommandStatus,
        val errorMessage: String? = null,
    )

    private companion object {
        const val DEFAULT_BASE_URL = "https://kestrel.narumi.dev/api/backend"
        const val BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    }
}
