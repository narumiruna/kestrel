package dev.narumi.kestrel.core.cloud

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

internal sealed interface OidcCallback {
    val attemptHash: String

    data class Success(
        val exchangeTicket: String,
        override val attemptHash: String,
    ) : OidcCallback

    data class Error(
        val errorCode: String,
        override val attemptHash: String,
    ) : OidcCallback
}

internal fun isOidcCallbackUri(rawUri: String?): Boolean =
    runCatching {
        val uri = URI(rawUri ?: return false)
        uri.scheme == OIDC_CALLBACK_SCHEME &&
            uri.host == OIDC_CALLBACK_HOST &&
            uri.path == OIDC_CALLBACK_PATH &&
            uri.port == -1 &&
            uri.rawQuery == null &&
            uri.userInfo == null
    }.getOrDefault(false)

internal fun OidcCallback.matchesClientNonce(clientNonce: String): Boolean =
    MessageDigest.isEqual(
        attemptHash.toByteArray(StandardCharsets.US_ASCII),
        sha256Hex(clientNonce).toByteArray(StandardCharsets.US_ASCII),
    )

internal fun parseOidcCallback(rawUri: String): OidcCallback {
    require(isOidcCallbackUri(rawUri)) { "Invalid OIDC callback" }
    val parameters = parseFragment(URI(rawUri).rawFragment)
    val attemptHash = parameters.singleValue("attempt")
    require(attemptHash.matches(ATTEMPT_HASH_PATTERN)) { "Invalid OIDC callback attempt" }

    parameters["error"]?.let { errors ->
        require(parameters.keys == setOf("attempt", "error")) {
            "Invalid OIDC callback parameters"
        }
        require(errors.size == 1 && errors.single().isNotBlank()) {
            "Invalid OIDC callback error"
        }
        return OidcCallback.Error(
            errorCode = errors.single(),
            attemptHash = attemptHash,
        )
    }

    require(parameters.keys == setOf("attempt", "ticket")) {
        "Invalid OIDC callback parameters"
    }
    val exchangeTicket = parameters.singleValue("ticket")
    require(exchangeTicket.matches(EXCHANGE_TICKET_PATTERN)) {
        "Invalid OIDC exchange ticket"
    }
    return OidcCallback.Success(
        exchangeTicket = exchangeTicket,
        attemptHash = attemptHash,
    )
}

private fun parseFragment(rawFragment: String?): Map<String, List<String>> {
    require(!rawFragment.isNullOrBlank()) { "OIDC callback fragment is missing" }
    return rawFragment
        .split('&')
        .map { part ->
            val separator = part.indexOf('=')
            require(separator > 0) { "Invalid OIDC callback fragment" }
            decode(part.substring(0, separator)) to decode(part.substring(separator + 1))
        }.groupBy({ it.first }, { it.second })
}

private fun Map<String, List<String>>.singleValue(name: String): String {
    val values = get(name)
    require(values?.size == 1 && values.single().isNotBlank()) {
        "Invalid OIDC callback $name"
    }
    return values.single()
}

private fun decode(value: String): String = URLDecoder.decode(value, StandardCharsets.UTF_8)

private fun sha256Hex(value: String): String =
    MessageDigest
        .getInstance("SHA-256")
        .digest(value.toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }

private val ATTEMPT_HASH_PATTERN = Regex("^[a-f0-9]{64}$")
private val EXCHANGE_TICKET_PATTERN = Regex("^[A-Za-z0-9_-]{32,128}$")
private const val OIDC_CALLBACK_SCHEME = "https"
private const val OIDC_CALLBACK_HOST = "kestrel.narumi.dev"
private const val OIDC_CALLBACK_PATH = "/login/oidc/android"
