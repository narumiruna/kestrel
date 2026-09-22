package dev.narumi.kestrel.core.cloud

import java.net.URI
import java.util.UUID

internal data class AndroidQrLoginPayload(
    val apiBaseUrl: String,
    val attemptId: String,
    val publicOrigin: String,
    val qrSecret: String,
)

internal fun parseAndroidQrLoginPayload(rawValue: String): AndroidQrLoginPayload {
    require(rawValue.length <= MAX_QR_PAYLOAD_LENGTH) { "QR login code is too large" }
    val uri = requireNotNull(runCatching { URI(rawValue) }.getOrNull()) { "Invalid QR login code" }
    require(uri.isAbsolute && uri.host != null) { "Invalid QR login server" }
    require(uri.userInfo == null && uri.rawQuery == null) { "Invalid QR login server" }
    require(uri.rawPath == ANDROID_LOGIN_PATH) { "Invalid QR login path" }
    require(uri.scheme == "https" || (uri.scheme == "http" && uri.isLoopback())) {
        "QR login server must use HTTPS"
    }

    val parameters = parseStrictFragment(uri.rawFragment)
    require(parameters["v"] == SUPPORTED_VERSION) { "Unsupported QR login version" }
    val attemptId = requireNotNull(parameters["attempt"]) { "QR login attempt is missing" }
    require(runCatching { UUID.fromString(attemptId).toString() == attemptId.lowercase() }.getOrDefault(false)) {
        "Invalid QR login attempt"
    }
    val qrSecret = requireNotNull(parameters["secret"]) { "QR login secret is missing" }
    require(qrSecret.matches(BASE64URL_SECRET_PATTERN)) { "Invalid QR login secret" }

    val publicOrigin = uri.origin()
    return AndroidQrLoginPayload(
        apiBaseUrl = "$publicOrigin$BACKEND_PROXY_PATH",
        attemptId = attemptId,
        publicOrigin = publicOrigin,
        qrSecret = qrSecret,
    )
}

internal fun validateAndroidQrClaim(
    payload: AndroidQrLoginPayload,
    response: ClaimAndroidLoginResponse,
) {
    require(response.attemptId == payload.attemptId) { "QR login response does not match this code" }
    require(response.serverOrigin == payload.publicOrigin) { "QR login server response does not match the scanned server" }
    require(response.matchingCode.matches(MATCHING_CODE_PATTERN)) { "QR login matching code is invalid" }
    require(response.pollIntervalSeconds in MIN_POLL_SECONDS..MAX_POLL_SECONDS) { "QR login polling interval is invalid" }
}

private fun parseStrictFragment(rawFragment: String?): Map<String, String> {
    require(!rawFragment.isNullOrBlank() && rawFragment.length <= MAX_FRAGMENT_LENGTH) {
        "QR login parameters are missing"
    }
    val values = mutableMapOf<String, String>()
    rawFragment.split('&').forEach { component ->
        val separator = component.indexOf('=')
        require(separator > 0 && separator == component.lastIndexOf('=')) { "Invalid QR login parameters" }
        val name = component.substring(0, separator)
        val value = component.substring(separator + 1)
        require(name in ALLOWED_PARAMETERS && value.isNotEmpty() && values.put(name, value) == null) {
            "Invalid QR login parameters"
        }
    }
    require(values.keys == ALLOWED_PARAMETERS) { "Invalid QR login parameters" }
    return values
}

private fun URI.isLoopback(): Boolean = host.removeSurrounding("[", "]").lowercase() in LOOPBACK_HOSTS

private fun URI.origin(): String {
    val normalizedHost = host.removeSurrounding("[", "]").lowercase()
    val displayedHost = if (':' in normalizedHost) "[$normalizedHost]" else normalizedHost
    val displayedPort = if (port == -1) "" else ":$port"
    return "${scheme.lowercase()}://$displayedHost$displayedPort"
}

private const val ANDROID_LOGIN_PATH = "/login/android"
private const val BACKEND_PROXY_PATH = "/api/backend"
private const val MAX_FRAGMENT_LENGTH = 256
private const val MAX_QR_PAYLOAD_LENGTH = 2_048
private const val MAX_POLL_SECONDS = 30
private const val MIN_POLL_SECONDS = 1
private const val SUPPORTED_VERSION = "1"
private val ALLOWED_PARAMETERS = setOf("attempt", "secret", "v")
private val BASE64URL_SECRET_PATTERN = Regex("^[A-Za-z0-9_-]{43}$")
private val MATCHING_CODE_PATTERN = Regex("^[0-9]{3}-[0-9]{3}$")
private val LOOPBACK_HOSTS = setOf("localhost", "127.0.0.1", "::1")
