package dev.narumi.kestrel.ui.components

import kotlinx.coroutines.CancellationException

internal sealed interface PersistedActionResult {
    data object Success : PersistedActionResult

    data class Failure(
        val message: String,
    ) : PersistedActionResult
}

/** Runs one confirmed write without turning lifecycle cancellation into a user-visible failure. */
@Suppress("TooGenericExceptionCaught")
internal suspend fun runPersistedAction(
    failureMessage: String,
    block: suspend () -> Unit,
): PersistedActionResult =
    try {
        block()
        PersistedActionResult.Success
    } catch (error: CancellationException) {
        throw error
    } catch (_: Exception) {
        PersistedActionResult.Failure(failureMessage)
    }
