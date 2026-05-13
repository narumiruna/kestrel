package dev.narumi.kestrel.core.cloud

internal interface CloudSyncSessionProvider {
    fun currentSession(): CloudSession?

    suspend fun refreshSession(): CloudSession?
}

internal interface CloudSyncApi {
    suspend fun bootstrap(accessToken: String): CloudBootstrapResponse

    suspend fun getChanges(
        accessToken: String,
        since: String,
    ): CloudChangesResponse

    suspend fun upload(
        accessToken: String,
        request: CloudSyncUploadRequest,
    ): CloudSyncUploadResponse
}
