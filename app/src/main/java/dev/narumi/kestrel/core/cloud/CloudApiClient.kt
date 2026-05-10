package dev.narumi.kestrel.core.cloud

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.time.Instant

class CloudApiClient(
    private val baseUrlProvider: suspend () -> String,
) {
    private val json = Json { ignoreUnknownKeys = true }

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

    suspend fun refresh(refreshToken: String): CloudSession =
        postJson<RefreshSessionRequest, AuthSessionResponse>(
            path = "/auth/refresh",
            body = RefreshSessionRequest(refreshToken = refreshToken),
        ).toSession()

    suspend fun revokeSession(accessToken: String) {
        postWithoutBody<RevokeSessionResponse>(
            path = "/auth/session/revoke",
            accessToken = accessToken,
        )
    }

    private suspend inline fun <reified Request : Any, reified Response : Any> postJson(
        path: String,
        body: Request,
        accessToken: String? = null,
    ): Response {
        val requestBody = json.encodeToString<Request>(body)
        return request(
            method = "POST",
            path = path,
            body = requestBody,
            accessToken = accessToken,
        )
    }

    private suspend inline fun <reified Response : Any> postWithoutBody(
        path: String,
        accessToken: String? = null,
    ): Response =
        request(
            method = "POST",
            path = path,
            body = "{}",
            accessToken = accessToken,
        )

    private suspend inline fun <reified Response : Any> request(
        method: String,
        path: String,
        body: String? = null,
        accessToken: String? = null,
    ): Response {
        val url = URL(normalizedBaseUrl() + path)
        val connection = (url.openConnection() as HttpURLConnection).apply {
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
            val responseBody =
                readStream(
                    if (statusCode in SUCCESS_STATUS_CODE_RANGE) {
                        connection.inputStream
                    } else {
                        connection.errorStream
                    },
                )

            if (statusCode !in SUCCESS_STATUS_CODE_RANGE) {
                throw CloudApiException(
                    statusCode = statusCode,
                    message = responseBody.toBackendMessage(),
                )
            }

            return json.decodeFromString<Response>(responseBody)
        } catch (error: SerializationException) {
            throw CloudApiException(
                statusCode = connection.responseCode.takeIf { it > 0 } ?: 0,
                message = error.message ?: "Failed to parse cloud response",
            )
        } finally {
            connection.disconnect()
        }
    }

    private suspend fun normalizedBaseUrl(): String = baseUrlProvider().trim().trimEnd('/')

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
        private const val READ_TIMEOUT_MILLIS = 15_000
        private val SUCCESS_STATUS_CODE_RANGE = 200..299
    }
}

class CloudApiException(
    val statusCode: Int,
    override val message: String,
) : IllegalStateException(message)

private fun readStream(inputStream: InputStream?): String {
    if (inputStream == null) {
        return ""
    }

    return BufferedReader(InputStreamReader(inputStream, StandardCharsets.UTF_8)).use { reader ->
        reader.readText()
    }
}

private fun String.toBackendMessage(): String {
    if (isBlank()) {
        return "Cloud request failed"
    }

    return runCatching {
        val root = Json.parseToJsonElement(this)
        val message = (root as? JsonObject)?.get("message")

        when (message) {
            is JsonPrimitive -> message.content
            is JsonArray -> message.joinToString("\n") { element -> (element as? JsonPrimitive)?.content ?: element.toString() }
            else -> this
        }
    }.getOrDefault(this)
}
