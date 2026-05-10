package dev.narumi.kestrel.core.cloud

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CloudSession(
    val accessToken: String,
    val accessTokenExpiresAt: Long,
    val refreshToken: String,
    val sessionId: String,
    val userId: String,
    val username: String,
)

@Serializable
internal data class LoginWithTotpRequest(
    val username: String,
    val password: String,
    val totpCode: String,
)

@Serializable
internal data class LoginWithRecoveryCodeRequest(
    val username: String,
    val password: String,
    val recoveryCode: String,
)

@Serializable
internal data class RefreshSessionRequest(
    val refreshToken: String,
)

@Serializable
internal data class AuthSessionResponse(
    val accessToken: String,
    val accessTokenExpiresAt: String,
    val refreshToken: String,
    val session: SessionPayload,
    val user: UserPayload,
)

@Serializable
internal data class SessionPayload(
    val id: String,
)

@Serializable
internal data class UserPayload(
    val id: String,
    val username: String,
)

@Serializable
internal data class ErrorResponse(
    val code: String? = null,
    val message: ErrorMessage? = null,
)

@Serializable
internal data class RevokeSessionResponse(
    val session: RevokedSessionPayload,
)

@Serializable
internal data class RevokedSessionPayload(
    val id: String,
    val revokedAt: String,
)

@Serializable
internal sealed interface ErrorMessage {
    @Serializable
    @SerialName("string")
    data class Single(
        val value: String,
    ) : ErrorMessage

    @Serializable
    @SerialName("array")
    data class Many(
        val value: List<String>,
    ) : ErrorMessage
}
