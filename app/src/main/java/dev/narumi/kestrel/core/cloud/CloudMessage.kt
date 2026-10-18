package dev.narumi.kestrel.core.cloud

import androidx.annotation.StringRes
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.i18n.UiMessage
import kotlinx.serialization.SerializationException
import java.io.IOException
import java.security.GeneralSecurityException

typealias CloudMessage = UiMessage

@Suppress("FunctionName", "FunctionNaming")
fun CloudMessage(
    id: CloudMessageId,
    args: List<String> = emptyList(),
): UiMessage = UiMessage(id.resourceId, args)

private val UiMessage.id: CloudMessageId
    get() = CloudMessageId.entries.firstOrNull { it.resourceId == resourceId } ?: CloudMessageId.SyncFailed

/** Names are also persisted as sync-error identifiers. Do not rename existing entries. */
enum class CloudMessageId(
    @param:StringRes val resourceId: Int,
) {
    RequestFailed(R.string.cloud_request_failed),
    SignInFailed(R.string.cloud_sign_in_failed),
    SyncFailed(R.string.cloud_sync_failed),
    RemoteFailed(R.string.cloud_remote_failed),
    QrFailed(R.string.cloud_qr_failed),
    ServerSettingsFailed(R.string.cloud_server_settings_failed),
    NetworkError(R.string.cloud_network_error),
    InvalidResponse(R.string.cloud_invalid_response),
    InvalidInput(R.string.cloud_invalid_input),
    InvalidCredentials(R.string.cloud_invalid_credentials),
    SessionExpired(R.string.cloud_session_expired),
    PermissionDenied(R.string.cloud_permission_denied),
    NotFound(R.string.cloud_not_found),
    Conflict(R.string.cloud_conflict),
    ExpiredRequest(R.string.cloud_expired_request),
    RateLimited(R.string.cloud_rate_limited),
    ServerUnavailable(R.string.cloud_server_unavailable),
    RequestRejected(R.string.cloud_request_rejected),
    SyncCursorExpired(R.string.cloud_sync_cursor_expired),
    SyncMutationConflict(R.string.cloud_sync_mutation_conflict),
    SyncUploadFailed(R.string.cloud_sync_upload_failed),
    RemoteEnabled(R.string.cloud_remote_enabled),
    RemoteDisabled(R.string.cloud_remote_disabled),
    RemoteStillEnabled(R.string.cloud_remote_still_enabled),
    RemoteSignInRequired(R.string.cloud_remote_sign_in_required),
    RemoteSignInToDisable(R.string.cloud_remote_sign_in_to_disable),
    RemoteWaiting(R.string.cloud_remote_waiting),
    RemoteCommandApplied(R.string.cloud_remote_command_applied),
    RemoteCommandFailed(R.string.cloud_remote_command_failed),
    RemoteCommandInvalid(R.string.cloud_remote_command_invalid),
    RemoteCommandTimeout(R.string.cloud_remote_command_timeout),
    MockPermissionRequired(R.string.cloud_mock_permission_required),
    SignInRequired(R.string.cloud_sign_in_required),
    SignOutRequired(R.string.cloud_sign_out_required),
    OidcCancelled(R.string.cloud_oidc_cancelled),
    OidcRestart(R.string.cloud_oidc_restart),
    ServerChanged(R.string.cloud_server_changed),
    QrRestart(R.string.cloud_qr_restart),
    QrInvalid(R.string.cloud_qr_invalid),
    ScannerFailed(R.string.cloud_scanner_failed),
    ScannerEmpty(R.string.cloud_scanner_empty),
    StorageFailed(R.string.cloud_storage_failed),
}

internal enum class CloudErrorContext(
    val fallback: CloudMessageId,
) {
    General(CloudMessageId.RequestFailed),
    SignIn(CloudMessageId.SignInFailed),
    Sync(CloudMessageId.SyncFailed),
    RemoteControl(CloudMessageId.RemoteFailed),
    QrLogin(CloudMessageId.QrFailed),
    ServerSettings(CloudMessageId.ServerSettingsFailed),
}

internal class CloudMessageException(
    val uiMessage: CloudMessage,
) : IllegalStateException(uiMessage.id.name)

internal fun checkCloudState(
    condition: Boolean,
    id: CloudMessageId,
) {
    if (!condition) throw CloudMessageException(CloudMessage(id))
}

/** Never use exception prose or response bodies to choose or build user-visible text. */
internal fun Throwable.toCloudMessage(context: CloudErrorContext = CloudErrorContext.General): CloudMessage =
    when (this) {
        is CloudMessageException -> {
            uiMessage
        }

        is AndroidQrLoginRetryableException -> {
            cause?.toCloudMessage(context) ?: CloudMessage(context.fallback)
        }

        is CloudApiException -> {
            toApiMessage(context)
        }

        is IOException -> {
            CloudMessage(CloudMessageId.NetworkError)
        }

        is SerializationException -> {
            CloudMessage(CloudMessageId.InvalidResponse)
        }

        is GeneralSecurityException -> {
            CloudMessage(CloudMessageId.StorageFailed)
        }

        is IllegalArgumentException -> {
            CloudMessage(
                when (context) {
                    CloudErrorContext.QrLogin -> CloudMessageId.QrInvalid
                    CloudErrorContext.ServerSettings -> CloudMessageId.ServerSettingsFailed
                    else -> CloudMessageId.InvalidInput
                },
            )
        }

        else -> {
            CloudMessage(context.fallback)
        }
    }

private fun CloudApiException.toApiMessage(context: CloudErrorContext): CloudMessage {
    val knownCode =
        when (code) {
            "SYNC_CURSOR_EXPIRED" -> CloudMessageId.SyncCursorExpired
            "CLIENT_MUTATION_ID_REUSED" -> CloudMessageId.SyncMutationConflict
            else -> null
        }
    if (knownCode != null) return CloudMessage(knownCode)
    val id =
        when (statusCode) {
            400, 422 -> if (context == CloudErrorContext.QrLogin) CloudMessageId.QrInvalid else CloudMessageId.InvalidInput
            401 -> if (context == CloudErrorContext.SignIn) CloudMessageId.InvalidCredentials else CloudMessageId.SessionExpired
            403 -> CloudMessageId.PermissionDenied
            404 -> CloudMessageId.NotFound
            409 -> CloudMessageId.Conflict
            410 -> CloudMessageId.ExpiredRequest
            429 -> CloudMessageId.RateLimited
            in 500..599 -> CloudMessageId.ServerUnavailable
            in 200..299 -> CloudMessageId.InvalidResponse
            else -> CloudMessageId.RequestRejected
        }
    return CloudMessage(id, if (id == CloudMessageId.RequestRejected) listOf(statusCode.toString()) else emptyList())
}

internal fun CloudMessage.toStoredSyncError(): String = "i18n:${if (args.isEmpty()) id.name else CloudMessageId.SyncFailed.name}"

internal fun storedSyncError(value: String?): CloudMessage? {
    if (value.isNullOrBlank()) return null
    val id =
        if (value.startsWith("i18n:")) {
            CloudMessageId.entries.firstOrNull { it.name == value.removePrefix("i18n:") }
        } else {
            null
        }
    // Old installs may have saved server prose. It must not become UI text again.
    val safeId = id?.takeUnless { it == CloudMessageId.RemoteEnabled || it == CloudMessageId.RequestRejected }
    return CloudMessage(safeId ?: CloudMessageId.SyncFailed)
}
