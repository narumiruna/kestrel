package dev.narumi.kestrel.core.cloud

internal interface CloudSyncSessionProvider {
    fun currentSession(): CloudSession?

    suspend fun refreshSessionIfCurrent(expectedSession: CloudSession): CloudSession?
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

internal interface CloudRemoteControlApi {
    suspend fun registerDevice(
        accessToken: String,
        request: RegisterRemoteDeviceRequest,
    ): RemoteDevicePayload

    suspend fun pollCommands(
        accessToken: String,
        deviceId: String,
        request: PollRemoteCommandsRequest,
    ): RemoteCommandsPollResponse

    suspend fun ackCommand(
        accessToken: String,
        deviceId: String,
        commandId: String,
        request: AckRemoteCommandRequest,
    ): RemoteCommandPayload
}
