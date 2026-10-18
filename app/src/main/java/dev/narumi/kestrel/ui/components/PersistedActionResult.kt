package dev.narumi.kestrel.ui.components

import kotlinx.coroutines.CancellationException

internal sealed interface PersistedActionResult<out T> {
    data object Success : PersistedActionResult<Nothing>

    data class Failure<T>(
        val message: T,
    ) : PersistedActionResult<T>
}

/** Runs one confirmed write without turning lifecycle cancellation into a user-visible failure. */
@Suppress("TooGenericExceptionCaught")
internal suspend fun <T> runPersistedAction(
    failureMessage: T,
    block: suspend () -> Unit,
): PersistedActionResult<T> =
    try {
        block()
        PersistedActionResult.Success
    } catch (error: CancellationException) {
        throw error
    } catch (_: Exception) {
        PersistedActionResult.Failure(failureMessage)
    }
