package dev.narumi.kestrel.core.cloud

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

internal sealed interface PocketIdCallback {
    data class Success(
        val exchangeTicket: String,
    ) : PocketIdCallback

    data class Error(
        val errorCode: String,
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

internal fun parsePocketIdCallback(rawUri: String): PocketIdCallback {
    require(isPocketIdCallbackUri(rawUri)) { "Invalid Pocket ID callback" }
    val uri = URI(rawUri)
    val parameters = parseFragment(uri.rawFragment)

    parameters["error"]?.let { errors ->
        require(parameters.keys == setOf("error")) { "Invalid Pocket ID callback parameters" }
        require(errors.size == 1 && errors.single().isNotBlank()) { "Invalid Pocket ID callback error" }
        return PocketIdCallback.Error(errors.single())
    }

    require(parameters.keys == setOf("ticket")) { "Invalid Pocket ID callback parameters" }
    val exchangeTicket = parameters.singleValue("ticket")
    require(exchangeTicket.length in 32..128) { "Invalid Pocket ID exchange ticket" }
    return PocketIdCallback.Success(exchangeTicket)
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
    require(values?.size == 1 && values.single().isNotBlank()) { "Invalid Pocket ID callback $name" }
    return values.single()
}

private fun decode(value: String): String = URLDecoder.decode(value, StandardCharsets.UTF_8)

private const val POCKET_ID_CALLBACK_SCHEME = "dev.narumi.kestrel"
private const val POCKET_ID_CALLBACK_HOST = "auth"
private const val POCKET_ID_CALLBACK_PATH = "/pocket-id"
