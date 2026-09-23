package dev.narumi.kestrel.core.cloud

import kotlinx.coroutines.CancellationException
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.util.Base64
import java.util.UUID

internal class AndroidQrLoginCoordinator(
    private val api: AndroidQrLoginApi,
    private val attemptStore: AndroidQrLoginAttemptPersistence,
    private val persistSession: (CloudSession) -> Unit,
    private val setApiBaseUrl: suspend (String) -> Unit,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val randomBytes: (Int) -> ByteArray = ::secureRandomBytes,
    private val newRefreshRequestId: () -> String = { UUID.randomUUID().toString() },
) {
    suspend fun prepare(
        rawQrValue: String,
        deviceName: String,
        appVersion: String?,
    ): AndroidQrLoginProgress {
        val payload = parseAndroidQrLoginPayload(rawQrValue)
        val verifier = randomBytes(VERIFIER_BYTES).toBase64Url()
        val attempt =
            AndroidQrLoginAttempt(
                apiBaseUrl = payload.apiBaseUrl,
                appVersion = appVersion,
                attemptId = payload.attemptId,
                deviceName = deviceName.take(MAX_DEVICE_NAME_LENGTH),
                expiresAt = nowMillis() + PROVISIONAL_ATTEMPT_LIFETIME_MILLIS,
                publicOrigin = payload.publicOrigin,
                qrSecret = payload.qrSecret,
                verifier = verifier,
            )
        attemptStore.clear()
        attemptStore.save(attempt)
        return claim(attempt)
    }

    suspend fun resume(): AndroidQrLoginProgress? {
        val attempt = attemptStore.load() ?: return null
        if (attempt.isLocallyExpired(nowMillis())) {
            attemptStore.compareAndClear(attempt)
            return AndroidQrLoginProgress.Expired
        }
        val claimedAttempt =
            if (attempt.username == null || attempt.matchingCode == null) {
                return claim(attempt)
            } else {
                attempt
            }
        return if (claimedAttempt.confirmed) {
            setApiBaseUrl(claimedAttempt.apiBaseUrl)
            exchange(claimedAttempt)
        } else {
            AndroidQrLoginProgress.Confirmation(claimedAttempt.toDetails())
        }
    }

    suspend fun confirm(): AndroidQrLoginProgress {
        val attempt = attemptStore.load() ?: error("No Android QR sign-in is pending")
        if (attempt.isLocallyExpired(nowMillis())) {
            attemptStore.compareAndClear(attempt)
            return AndroidQrLoginProgress.Expired
        }
        check(attempt.username != null && attempt.matchingCode != null) {
            "Android QR sign-in has not been claimed"
        }
        val confirmed = attempt.copy(confirmed = true)
        check(attempt.confirmed || attemptStore.compareAndSet(attempt, confirmed)) {
            "Android QR sign-in is no longer pending"
        }
        setApiBaseUrl(confirmed.apiBaseUrl)
        return exchange(confirmed)
    }

    suspend fun poll(): AndroidQrLoginProgress {
        val attempt = attemptStore.load() ?: error("No Android QR sign-in is pending")
        check(attempt.confirmed) { "Confirm the Android QR sign-in first" }
        if (attempt.isLocallyExpired(nowMillis())) {
            attemptStore.compareAndClear(attempt)
            return AndroidQrLoginProgress.Expired
        }
        setApiBaseUrl(attempt.apiBaseUrl)
        return exchange(attempt)
    }

    fun cancel() {
        attemptStore.clear()
    }

    private suspend fun claim(attempt: AndroidQrLoginAttempt): AndroidQrLoginProgress =
        try {
            val response =
                api.claimAndroidLogin(
                    apiBaseUrl = attempt.apiBaseUrl,
                    attemptId = attempt.attemptId,
                    request =
                        ClaimAndroidLoginRequest(
                            appVersion = attempt.appVersion,
                            deviceName = attempt.deviceName,
                            qrSecret = attempt.qrSecret,
                            verifierChallenge = sha256(attempt.verifier).toBase64Url(),
                        ),
                )
            val payload =
                AndroidQrLoginPayload(
                    apiBaseUrl = attempt.apiBaseUrl,
                    attemptId = attempt.attemptId,
                    publicOrigin = attempt.publicOrigin,
                    qrSecret = attempt.qrSecret,
                )
            validateAndroidQrClaim(payload, response)
            val expiresAt = Instant.parse(response.expiresAt).toEpochMilli()
            require(expiresAt > nowMillis() && expiresAt <= nowMillis() + MAX_ATTEMPT_LIFETIME_MILLIS) {
                "QR login expiry is invalid"
            }
            val claimed =
                attempt.copy(
                    expiresAt = expiresAt,
                    matchingCode = response.matchingCode,
                    pollIntervalSeconds = response.pollIntervalSeconds,
                    username = response.user.username,
                )
            check(attemptStore.compareAndSet(attempt, claimed)) {
                "Android QR sign-in is no longer pending"
            }
            AndroidQrLoginProgress.Confirmation(claimed.toDetails())
        } catch (failure: CloudApiException) {
            handleTerminalFailure(attempt, failure)
        } catch (failure: CancellationException) {
            throw failure
        } catch (failure: IllegalArgumentException) {
            attemptStore.compareAndClear(attempt)
            throw failure
        } catch (failure: IllegalStateException) {
            attemptStore.compareAndClear(attempt)
            throw failure
        }

    private suspend fun exchange(attempt: AndroidQrLoginAttempt): AndroidQrLoginProgress =
        try {
            when (
                val result =
                    api.exchangeAndroidLogin(
                        apiBaseUrl = attempt.apiBaseUrl,
                        attemptId = attempt.attemptId,
                        request =
                            ExchangeAndroidLoginRequest(
                                qrSecret = attempt.qrSecret,
                                verifier = attempt.verifier,
                            ),
                    )
            ) {
                is AndroidQrExchangeResult.Pending ->
                    AndroidQrLoginProgress.Waiting(
                        details = attempt.toDetails(),
                        retryAfterSeconds =
                            maxOf(attempt.pollIntervalSeconds, result.retryAfterSeconds),
                    )
                is AndroidQrExchangeResult.Complete -> complete(attempt, result.session)
            }
        } catch (failure: CloudApiException) {
            handleTerminalFailure(attempt, failure)
        }

    @Suppress("TooGenericExceptionCaught")
    private suspend fun complete(
        attempt: AndroidQrLoginAttempt,
        session: CloudSession,
    ): AndroidQrLoginProgress {
        val persistedSession = session.copy(refreshRequestId = newRefreshRequestId())
        try {
            persistSession(persistedSession)
        } catch (failure: Exception) {
            runCatching {
                api.revokeSession(
                    accessToken = persistedSession.accessToken,
                    apiBaseUrl = attempt.apiBaseUrl,
                )
            }
            throw failure
        }
        runCatching { attemptStore.compareAndClear(attempt) }
        return AndroidQrLoginProgress.Completed(persistedSession)
    }

    private fun handleTerminalFailure(
        attempt: AndroidQrLoginAttempt,
        failure: CloudApiException,
    ): AndroidQrLoginProgress =
        when (failure.statusCode) {
            HTTP_FORBIDDEN -> {
                attemptStore.compareAndClear(attempt)
                AndroidQrLoginProgress.Denied
            }
            HTTP_GONE -> {
                attemptStore.compareAndClear(attempt)
                AndroidQrLoginProgress.Expired
            }
            HTTP_BAD_REQUEST, HTTP_CONFLICT -> {
                attemptStore.compareAndClear(attempt)
                throw failure
            }
            else -> throw failure
        }
}

private fun AndroidQrLoginAttempt.isLocallyExpired(now: Long): Boolean {
    val recoveryExtension = if (confirmed) EXCHANGE_RECOVERY_LIFETIME_MILLIS else 0L
    return expiresAt <= now - recoveryExtension
}

private fun AndroidQrLoginAttempt.toDetails(): AndroidQrLoginDetails =
    AndroidQrLoginDetails(
        appVersion = appVersion,
        deviceName = deviceName,
        expiresAt = expiresAt,
        matchingCode = checkNotNull(matchingCode),
        pollIntervalSeconds = pollIntervalSeconds,
        publicOrigin = publicOrigin,
        username = checkNotNull(username),
    )

private fun secureRandomBytes(size: Int): ByteArray = ByteArray(size).also(SecureRandom()::nextBytes)

private fun sha256(value: String): ByteArray = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))

private fun ByteArray.toBase64Url(): String = Base64.getUrlEncoder().withoutPadding().encodeToString(this)

private const val EXCHANGE_RECOVERY_LIFETIME_MILLIS = 20 * 60 * 1_000L
private const val HTTP_BAD_REQUEST = 400
private const val HTTP_FORBIDDEN = 403
private const val HTTP_CONFLICT = 409
private const val HTTP_GONE = 410
private const val MAX_ATTEMPT_LIFETIME_MILLIS = 10 * 60 * 1_000L
private const val MAX_DEVICE_NAME_LENGTH = 128
private const val PROVISIONAL_ATTEMPT_LIFETIME_MILLIS = 5 * 60 * 1_000L
private const val VERIFIER_BYTES = 32
