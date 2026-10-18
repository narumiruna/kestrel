package dev.narumi.kestrel.core.cloud

import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.IOException

class CloudMessageTest {
    @Test
    fun knownCodesDoNotDependOnServerProse() {
        listOf("", "untrusted response", "since cursor is ahead of server state").forEach { prose ->
            assertEquals(
                CloudMessage(CloudMessageId.SyncCursorExpired),
                CloudApiException(410, "SYNC_CURSOR_EXPIRED", prose).toCloudMessage(CloudErrorContext.Sync),
            )
            assertEquals(
                CloudMessage(CloudMessageId.SyncMutationConflict),
                CloudApiException(409, "CLIENT_MUTATION_ID_REUSED", prose).toCloudMessage(CloudErrorContext.Sync),
            )
        }
    }

    @Test
    fun missingAndUnknownCodesUseSafeStatusMappings() {
        val statuses =
            mapOf(
                400 to CloudMessageId.InvalidInput,
                401 to CloudMessageId.SessionExpired,
                403 to CloudMessageId.PermissionDenied,
                404 to CloudMessageId.NotFound,
                409 to CloudMessageId.Conflict,
                410 to CloudMessageId.ExpiredRequest,
                422 to CloudMessageId.InvalidInput,
                429 to CloudMessageId.RateLimited,
                500 to CloudMessageId.ServerUnavailable,
                503 to CloudMessageId.ServerUnavailable,
                200 to CloudMessageId.InvalidResponse,
            )
        statuses.forEach { (status, id) ->
            listOf(null, "FUTURE_CODE").forEach { code ->
                assertEquals(CloudMessage(id), CloudApiException(status, code, "secret response body").toCloudMessage())
            }
        }
        assertEquals(
            CloudMessage(CloudMessageId.RequestRejected, listOf("418")),
            CloudApiException(418, message = "secret response body").toCloudMessage(),
        )
    }

    @Test
    fun signInAndQrErrorsKeepActionableContext() {
        assertEquals(
            CloudMessage(CloudMessageId.InvalidCredentials),
            CloudApiException(401, message = "anything").toCloudMessage(CloudErrorContext.SignIn),
        )
        assertEquals(
            CloudMessage(CloudMessageId.QrInvalid),
            IllegalArgumentException("secret QR payload").toCloudMessage(CloudErrorContext.QrLogin),
        )
        assertEquals(
            CloudMessage(CloudMessageId.ServerSettingsFailed),
            IllegalArgumentException("bad URL").toCloudMessage(CloudErrorContext.ServerSettings),
        )
    }

    @Test
    fun networkParseAndLocalErrorsDoNotExposeExceptionMessages() {
        assertEquals(CloudMessage(CloudMessageId.NetworkError), IOException("secret host").toCloudMessage())
        assertEquals(CloudMessage(CloudMessageId.InvalidResponse), SerializationException("secret body").toCloudMessage())
        assertEquals(
            CloudMessage(CloudMessageId.SyncFailed),
            IllegalStateException("Session expired. Please sign in again.").toCloudMessage(CloudErrorContext.Sync),
        )
        assertEquals(
            CloudMessage(CloudMessageId.NetworkError),
            AndroidQrLoginRetryableException(IOException("secret host")).toCloudMessage(CloudErrorContext.QrLogin),
        )
    }

    @Test
    fun typedLocalErrorsRetainTheirIdentity() {
        val message = CloudMessage(CloudMessageId.OidcCancelled)
        assertEquals(message, CloudMessageException(message).toCloudMessage())
    }

    @Test
    fun savedSyncErrorUsesStableIdentifiersAndOldProseFallsBackSafely() {
        val message = CloudMessage(CloudMessageId.SessionExpired)
        assertEquals("i18n:SessionExpired", message.toStoredSyncError())
        assertEquals(message, storedSyncError(message.toStoredSyncError()))
        assertNull(storedSyncError(null))
        assertNull(storedSyncError(""))
        listOf("old secret response body", "i18n:UnknownFutureError", "i18n:RemoteEnabled", "i18n:RequestRejected").forEach {
            assertEquals(CloudMessage(CloudMessageId.SyncFailed), storedSyncError(it))
        }
    }

    @Test
    fun parameterizedErrorsCannotRestoreWithoutTheirArguments() {
        val saved = CloudMessage(CloudMessageId.RequestRejected, listOf("418")).toStoredSyncError()
        assertEquals(CloudMessage(CloudMessageId.SyncFailed), storedSyncError(saved))
        assertFalse(saved.contains("418"))
    }

    @Test
    fun scannerDiagnosticsRemainSeparateFromUiText() {
        val result = classifyGoogleCodeScannerFailure(mlKitErrorCode = null, message = "secret scanner details") as QrCodeScanResult.Failure
        assertEquals("secret scanner details", result.message)
        assertEquals(CloudMessage(CloudMessageId.ScannerFailed), result.uiMessage)
    }
}
