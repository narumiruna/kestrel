package dev.narumi.kestrel.core.cloud

import kotlinx.serialization.Serializable

@Serializable
internal data class AndroidQrLoginMethod(
    val enabled: Boolean = false,
)

@Serializable
internal data class ClaimAndroidLoginRequest(
    val appVersion: String? = null,
    val deviceName: String,
    val qrSecret: String,
    val verifierChallenge: String,
)

@Serializable
internal data class ClaimAndroidLoginResponse(
    val attemptId: String,
    val expiresAt: String,
    val matchingCode: String,
    val pollIntervalSeconds: Int,
    val serverOrigin: String,
    val user: AndroidLoginUser,
)

@Serializable
internal data class AndroidLoginUser(
    val username: String,
)

@Serializable
internal data class ExchangeAndroidLoginRequest(
    val qrSecret: String,
    val verifier: String,
)

@Serializable
internal data class PendingAndroidLoginResponse(
    val retryAfterSeconds: Int,
    val status: String,
)

@Serializable
internal data class AndroidQrLoginAttempt(
    val apiBaseUrl: String,
    val appVersion: String? = null,
    val attemptId: String,
    val confirmed: Boolean = false,
    val deviceName: String,
    val expiresAt: Long,
    val matchingCode: String? = null,
    val pollIntervalSeconds: Int = DEFAULT_POLL_INTERVAL_SECONDS,
    val publicOrigin: String,
    val qrSecret: String,
    val username: String? = null,
    val verifier: String,
) {
    companion object {
        const val DEFAULT_POLL_INTERVAL_SECONDS = 5
    }
}

internal data class AndroidQrLoginDetails(
    val appVersion: String?,
    val deviceName: String,
    val expiresAt: Long,
    val matchingCode: String,
    val pollIntervalSeconds: Int,
    val publicOrigin: String,
    val username: String,
)

internal class AndroidQrLoginRetryableException(
    cause: Exception,
) : Exception(cause.message, cause)

internal sealed interface AndroidQrLoginProgress {
    data class Confirmation(
        val details: AndroidQrLoginDetails,
    ) : AndroidQrLoginProgress

    data class Waiting(
        val details: AndroidQrLoginDetails,
        val retryAfterSeconds: Int,
    ) : AndroidQrLoginProgress

    data class Completed(
        val session: CloudSession,
    ) : AndroidQrLoginProgress

    data object Denied : AndroidQrLoginProgress

    data object Expired : AndroidQrLoginProgress
}

internal sealed interface AndroidQrExchangeResult {
    data class Complete(
        val session: CloudSession,
    ) : AndroidQrExchangeResult

    data class Pending(
        val retryAfterSeconds: Int,
    ) : AndroidQrExchangeResult
}

internal interface AndroidQrLoginApi {
    suspend fun claimAndroidLogin(
        apiBaseUrl: String,
        attemptId: String,
        request: ClaimAndroidLoginRequest,
    ): ClaimAndroidLoginResponse

    suspend fun exchangeAndroidLogin(
        apiBaseUrl: String,
        attemptId: String,
        request: ExchangeAndroidLoginRequest,
    ): AndroidQrExchangeResult

    suspend fun revokeSession(
        accessToken: String,
        apiBaseUrl: String,
    )
}
