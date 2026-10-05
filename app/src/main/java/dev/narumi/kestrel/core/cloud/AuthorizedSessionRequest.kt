package dev.narumi.kestrel.core.cloud

// Retry only an unauthorized request, against the same session identity. A concurrent
// refresh may have already persisted the successor while our refresh returns null.
internal suspend fun <T> withAuthorizedSession(
    authRepository: CloudSyncSessionProvider,
    session: CloudSession,
    block: suspend (CloudSession) -> T,
): T =
    try {
        block(session)
    } catch (error: CloudApiException) {
        if (error.statusCode != 401) throw error
        val authorizedSession =
            authRepository.refreshSessionIfCurrent(session)
                ?: authRepository.currentSession()?.takeIf { it.sessionId == session.sessionId }
                ?: error("Session expired. Please sign in again.")
        block(authorizedSession)
    }
