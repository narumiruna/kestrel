package dev.narumi.kestrel.core.cloud

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class CloudSyncErrorRetentionTest {
    @Test
    fun partialUploadFailureSurvivesSuccessfulDeltaFetch() =
        runBlocking {
            val uploadError = CloudMessage(CloudMessageId.SyncUploadFailed)
            var savedError: CloudMessage? = CloudMessage(CloudMessageId.NetworkError)
            val events = mutableListOf<String>()

            finishSyncAfterUpload(
                uploadError = uploadError,
                fetchChanges = {
                    events += "fetch"
                    savedError = null
                },
                storeError = {
                    events += "error"
                    savedError = it
                },
            )

            assertEquals(listOf("fetch", "error"), events)
            assertEquals(uploadError, savedError)
        }

    @Test
    fun successfulUploadAndFetchClearPreviousError() =
        runBlocking {
            var savedError: CloudMessage? = CloudMessage(CloudMessageId.NetworkError)
            finishSyncAfterUpload(
                uploadError = null,
                fetchChanges = { savedError = null },
                storeError = { savedError = it },
            )
            assertNull(savedError)
        }

    @Test
    fun failedDeltaFetchPropagatesForNormalFailureHandling() =
        runBlocking {
            val failure = CloudApiException(503, message = "server failure")
            var savedError: CloudMessage? = null
            val result =
                runCatching {
                    finishSyncAfterUpload(
                        uploadError = CloudMessage(CloudMessageId.SyncUploadFailed),
                        fetchChanges = { throw failure },
                        storeError = { savedError = it },
                    )
                }
            assertSame(failure, result.exceptionOrNull())
            assertNull(savedError)
        }
}
