package dev.narumi.kestrel.core.cloud

import java.net.URI

internal fun normalizeCloudApiBaseUrl(baseUrl: String): String {
    val trimmed = baseUrl.trim().trimEnd('/')
    val uri = runCatching { URI(trimmed) }.getOrNull() ?: return trimmed
    val host = uri.host ?: return trimmed
    val scheme = uri.scheme ?: return trimmed

    return if (scheme == PRODUCTION_SCHEME && host == PRODUCTION_HOST && uri.normalizedPath() in PRODUCTION_WEB_ALIAS_PATHS) {
        uri.origin() + PRODUCTION_BACKEND_PROXY_PATH
    } else {
        trimmed
    }
}

private fun URI.normalizedPath(): String = path?.trimEnd('/')?.ifBlank { "/" } ?: "/"

private fun URI.origin(): String =
    buildString {
        append(scheme)
        append("://")
        append(authority)
    }

private const val PRODUCTION_SCHEME = "https"
private const val PRODUCTION_HOST = "kestrel.narumi.dev"
private const val PRODUCTION_BACKEND_PROXY_PATH = "/api/backend"
private val PRODUCTION_WEB_ALIAS_PATHS = setOf("/", "/api")
