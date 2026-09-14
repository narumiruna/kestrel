package dev.narumi.kestrel.core.cloud

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

internal sealed interface PocketIdCallback {
    val attemptHash: String

    data class Success(
        val exchangeTicket: String,
        override val attemptHash: String,
    ) : PocketIdCallback

    data class Error(
        val errorCode: String,
        override val attemptHash: String,
    ) : PocketIdCallback
}

internal fun isPocketIdCallbackUri(rawUri: String?): Boolean =
    runCatching {
        val uri = URI(rawUri ?: return false)
        uri.scheme == POCKET_ID_CALLBACK_SCHEME &&
            uri.host == POCKET_ID_CALLBACK_HOST &&
            uri.path == POCKET_ID_CALLBACK_PATH &&
            uri.port == -1 &&
            uri.rawQuery == null &&
            uri.userInfo == null
    }.getOrDefault(false)

internal fun PocketIdCallback.matchesClientNonce(clientNonce: String): Boolean =
    MessageDigest.isEqual(
        attemptHash.toByteArray(StandardCharsets.US_ASCII),
        sha256Hex(clientNonce).toByteArray(StandardCharsets.US_ASCII),
    )

internal fun parsePocketIdCallback(rawUri: String): PocketIdCallback {
    require(isPocketIdCallbackUri(rawUri)) { "Invalid Pocket ID callback" }
    val parameters = parseFragment(URI(rawUri).rawFragment)
    val attemptHash = parameters.singleValue("attempt")
    require(attemptHash.matches(ATTEMPT_HASH_PATTERN)) { "Invalid Pocket ID callback attempt" }

    parameters["error"]?.let { errors ->
        require(parameters.keys == setOf("attempt", "error")) {
            "Invalid Pocket ID callback parameters"
        }
        require(errors.size == 1 && errors.single().isNotBlank()) {
            "Invalid Pocket ID callback error"
        }
        return PocketIdCallback.Error(
            errorCode = errors.single(),
            attemptHash = attemptHash,
        )
    }

    require(parameters.keys == setOf("attempt", "ticket")) {
        "Invalid Pocket ID callback parameters"
    }
    val exchangeTicket = parameters.singleValue("ticket")
    require(exchangeTicket.matches(EXCHANGE_TICKET_PATTERN)) {
        "Invalid Pocket ID exchange ticket"
    }
    return PocketIdCallback.Success(
        exchangeTicket = exchangeTicket,
        attemptHash = attemptHash,
    )
}

private fun parseFragment(rawFragment: String?): Map<String, List<String>> {
    require(!rawFragment.isNullOrBlank()) { "Pocket ID callback fragment is missing" }
    return rawFragment
        .split('&')
        .map { part ->
            val separator = part.indexOf('=')
            require(separator > 0) { "Invalid Pocket ID callback fragment" }
            decode(part.substring(0, separator)) to decode(part.substring(separator + 1))
        }.groupBy({ it.first }, { it.second })
}

private fun Map<String, List<String>>.singleValue(name: String): String {
    val values = get(name)
    require(values?.size == 1 && values.single().isNotBlank()) {
        "Invalid Pocket ID callback $name"
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
private const val POCKET_ID_CALLBACK_SCHEME = "https"
private const val POCKET_ID_CALLBACK_HOST = "kestrel.narumi.dev"
private const val POCKET_ID_CALLBACK_PATH = "/login/pocket-id/android"
