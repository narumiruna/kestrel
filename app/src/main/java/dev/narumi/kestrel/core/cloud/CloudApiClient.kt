package dev.narumi.kestrel.core.cloud

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.time.Instant

@Suppress("TooManyFunctions")
internal class CloudApiClient(
    private val baseUrlProvider: suspend () -> String,
) : CloudSyncApi,
    CloudRemoteControlApi,
    AndroidQrLoginApi {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun getAuthMethods(): AuthMethodsResponse = getJson(path = "/auth/methods")

    override suspend fun claimAndroidLogin(
        apiBaseUrl: String,
        attemptId: String,
        request: ClaimAndroidLoginRequest,
    ): ClaimAndroidLoginResponse =
        postJson(
            path = "/auth/android-login-attempts/$attemptId/claim",
            body = request,
            apiBaseUrl = apiBaseUrl,
        )

    override suspend fun exchangeAndroidLogin(
        apiBaseUrl: String,
        attemptId: String,
        request: ExchangeAndroidLoginRequest,
    ): AndroidQrExchangeResult {
        val response =
            rawRequest(
                method = "POST",
                path = "/auth/android-login-attempts/$attemptId/exchange",
                body = json.encodeToString(request),
                apiBaseUrl = apiBaseUrl,
            )
        return when (response.statusCode) {
            HTTP_CREATED ->
                AndroidQrExchangeResult.Complete(
                    decodeResponse<AuthSessionResponse>(response).toSession(),
                )
            HTTP_ACCEPTED, HTTP_TOO_MANY_REQUESTS -> {
                val pending = decodeResponse<PendingAndroidLoginResponse>(response)
                check(pending.status == "pending" || pending.status == "slow_down") {
                    "Cloud returned an invalid Android QR login status"
                }
                check(pending.retryAfterSeconds in MIN_RETRY_AFTER_SECONDS..MAX_RETRY_AFTER_SECONDS) {
                    "Cloud returned an invalid Android QR login retry interval"
                }
                AndroidQrExchangeResult.Pending(pending.retryAfterSeconds)
            }
            else -> throw response.toApiException(json)
        }
    }

    suspend fun startOidc(
        clientNonce: String,
        apiBaseUrl: String,
    ): StartOidcResponse =
        postJson<StartOidcRequest, StartOidcResponse>(
            path = "/auth/oidc/start",
            body = StartOidcRequest(clientType = "android", clientNonce = clientNonce),
            apiBaseUrl = apiBaseUrl,
        )

    suspend fun exchangeOidc(
        apiBaseUrl: String,
        exchangeTicket: String,
        clientNonce: String,
    ): CloudSession =
        postJson<ExchangeOidcRequest, AuthSessionResponse>(
            path = "/auth/oidc/exchange",
            body = ExchangeOidcRequest(exchangeTicket = exchangeTicket, clientNonce = clientNonce),
            apiBaseUrl = apiBaseUrl,
        ).toSession()

    suspend fun loginWithTotp(
        username: String,
        password: String,
        totpCode: String,
    ): CloudSession =
        postJson<LoginWithTotpRequest, AuthSessionResponse>(
            path = "/auth/login",
            body = LoginWithTotpRequest(username = username, password = password, totpCode = totpCode),
        ).toSession()

    suspend fun loginWithRecoveryCode(
        username: String,
        password: String,
        recoveryCode: String,
    ): CloudSession =
        postJson<LoginWithRecoveryCodeRequest, AuthSessionResponse>(
            path = "/auth/login",
            body =
                LoginWithRecoveryCodeRequest(
                    username = username,
                    password = password,
                    recoveryCode = recoveryCode,
                ),
        ).toSession()

    suspend fun refresh(
        refreshToken: String,
        refreshRequestId: String,
    ): CloudSession =
        postJson<RefreshSessionRequest, AuthSessionResponse>(
            path = "/auth/refresh",
            body =
                RefreshSessionRequest(
                    refreshToken = refreshToken,
                    refreshRequestId = refreshRequestId,
                ),
        ).toSession()

    suspend fun revokeSession(accessToken: String) {
        revokeSession(accessToken, normalizedBaseUrl())
    }

    override suspend fun revokeSession(
        accessToken: String,
        apiBaseUrl: String,
    ) {
        postWithoutBody<RevokeSessionResponse>(
            path = "/auth/session/revoke",
            accessToken = accessToken,
            apiBaseUrl = apiBaseUrl,
        )
    }

    override suspend fun bootstrap(accessToken: String): CloudBootstrapResponse =
        getJson(
            path = "/sync/bootstrap",
            accessToken = accessToken,
        )

    override suspend fun getChanges(
        accessToken: String,
        since: String,
    ): CloudChangesResponse =
        getJson(
            path = "/sync/changes?since=$since",
            accessToken = accessToken,
        )

    override suspend fun upload(
        accessToken: String,
        request: CloudSyncUploadRequest,
    ): CloudSyncUploadResponse =
        postJson<CloudSyncUploadRequest, CloudSyncUploadResponse>(
            path = "/sync/upload",
            body = request,
            accessToken = accessToken,
        )

    override suspend fun registerDevice(
        accessToken: String,
        request: RegisterRemoteDeviceRequest,
    ): RemoteDevicePayload =
        postJson<RegisterRemoteDeviceRequest, RemoteDevicePayload>(
            path = "/devices/register",
            body = request,
            accessToken = accessToken,
        )

    override suspend fun pollCommands(
        accessToken: String,
        deviceId: String,
        request: PollRemoteCommandsRequest,
    ): RemoteCommandsPollResponse =
        postJson<PollRemoteCommandsRequest, RemoteCommandsPollResponse>(
            path = "/devices/$deviceId/commands/poll",
            body = request,
            accessToken = accessToken,
        )

    override suspend fun reportDeviceState(
        accessToken: String,
        deviceId: String,
        request: ReportDeviceStateRequest,
    ): ReportDeviceStateResponse =
        postJson<ReportDeviceStateRequest, ReportDeviceStateResponse>(
            path = "/devices/$deviceId/state",
            body = request,
            accessToken = accessToken,
        )

    override suspend fun ackCommand(
        accessToken: String,
        deviceId: String,
        commandId: String,
        request: AckRemoteCommandRequest,
    ): RemoteCommandPayload =
        postJson<AckRemoteCommandRequest, RemoteCommandPayload>(
            path = "/devices/$deviceId/commands/$commandId/ack",
            body = request,
            accessToken = accessToken,
        )

    private suspend inline fun <reified Request : Any, reified Response : Any> postJson(
        path: String,
        body: Request,
        accessToken: String? = null,
        apiBaseUrl: String? = null,
    ): Response {
        val requestBody = json.encodeToString(body)
        return request(
            method = "POST",
            path = path,
            body = requestBody,
            accessToken = accessToken,
            apiBaseUrl = apiBaseUrl,
        )
    }

    private suspend inline fun <reified Response : Any> postWithoutBody(
        path: String,
        accessToken: String? = null,
        apiBaseUrl: String? = null,
    ): Response =
        request(
            method = "POST",
            path = path,
            body = "{}",
            accessToken = accessToken,
            apiBaseUrl = apiBaseUrl,
        )

    private suspend inline fun <reified Response : Any> getJson(
        path: String,
        accessToken: String? = null,
    ): Response =
        request(
            method = "GET",
            path = path,
            accessToken = accessToken,
        )

    private suspend inline fun <reified Response : Any> request(
        method: String,
        path: String,
        body: String? = null,
        accessToken: String? = null,
        apiBaseUrl: String? = null,
    ): Response {
        val response =
            rawRequest(
                method = method,
                path = path,
                body = body,
                accessToken = accessToken,
                apiBaseUrl = apiBaseUrl,
            )
        if (response.statusCode !in SUCCESS_STATUS_CODE_RANGE) {
            throw response.toApiException(json)
        }
        return decodeResponse(response)
    }

    private suspend fun rawRequest(
        method: String,
        path: String,
        body: String? = null,
        accessToken: String? = null,
        apiBaseUrl: String? = null,
    ): CloudHttpResponse =
        withContext(Dispatchers.IO) {
            val url = URL((apiBaseUrl ?: normalizedBaseUrl()) + path)
            val connection =
                (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = method
                    connectTimeout = CONNECT_TIMEOUT_MILLIS
                    readTimeout = READ_TIMEOUT_MILLIS
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    if (accessToken != null) {
                        setRequestProperty("Authorization", "Bearer $accessToken")
                    }
                    doInput = true
                }

            try {
                if (body != null) {
                    connection.doOutput = true
                    connection.outputStream.use { output ->
                        output.write(body.toByteArray(StandardCharsets.UTF_8))
                    }
                }
                val statusCode = connection.responseCode
                CloudHttpResponse(
                    body =
                        readStream(
                            if (statusCode in SUCCESS_STATUS_CODE_RANGE) {
                                connection.inputStream
                            } else {
                                connection.errorStream
                            },
                        ),
                    statusCode = statusCode,
                )
            } finally {
                connection.disconnect()
            }
        }

    private inline fun <reified Response : Any> decodeResponse(response: CloudHttpResponse): Response =
        try {
            json.decodeFromString<Response>(response.body)
        } catch (error: SerializationException) {
            throw CloudApiException(
                statusCode = response.statusCode,
                message = error.message ?: "Failed to parse cloud response",
                cause = error,
            )
        }

    private suspend fun normalizedBaseUrl(): String = normalizeCloudApiBaseUrl(baseUrlProvider())

    private fun AuthSessionResponse.toSession(): CloudSession =
        CloudSession(
            accessToken = accessToken,
            accessTokenExpiresAt = Instant.parse(accessTokenExpiresAt).toEpochMilli(),
            refreshToken = refreshToken,
            sessionId = session.id,
            userId = user.id,
            username = user.username,
        )

    companion object {
        private const val CONNECT_TIMEOUT_MILLIS = 15_000
        private const val HTTP_ACCEPTED = 202
        private const val HTTP_CREATED = 201
        private const val HTTP_TOO_MANY_REQUESTS = 429
        private const val MAX_RETRY_AFTER_SECONDS = 30
        private const val MIN_RETRY_AFTER_SECONDS = 1
        private const val READ_TIMEOUT_MILLIS = 15_000
        private val SUCCESS_STATUS_CODE_RANGE = 200..299
    }
}

private data class CloudHttpResponse(
    val body: String,
    val statusCode: Int,
)

class CloudApiException(
    val statusCode: Int,
    val code: String? = null,
    override val message: String,
    cause: Throwable? = null,
) : IllegalStateException(message, cause)

private fun readStream(inputStream: InputStream?): String {
    if (inputStream == null) {
        return ""
    }

    return BufferedReader(InputStreamReader(inputStream, StandardCharsets.UTF_8)).use { reader ->
        reader.readText()
    }
}

private fun CloudHttpResponse.toApiException(json: Json): CloudApiException {
    val errorResponse = body.toErrorResponse(json)
    return CloudApiException(
        statusCode = statusCode,
        code = errorResponse?.code,
        message = errorResponse?.message ?: body.ifBlank { "Cloud request failed" },
    )
}

private fun String.toErrorResponse(json: Json): ErrorResponse? {
    if (isBlank()) {
        return null
    }

    return runCatching {
        json.decodeFromString<ErrorResponse>(this)
    }.getOrNull()
}
