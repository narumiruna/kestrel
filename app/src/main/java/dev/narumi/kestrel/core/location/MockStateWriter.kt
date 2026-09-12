package dev.narumi.kestrel.core.location

import dev.narumi.kestrel.core.data.MockState
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Serializes writes and captures current state only when each write can actually start. */
internal class MockStateWriter(
    private val snapshot: () -> MockState?,
    private val write: suspend (MockState?) -> Unit,
) {
    private val mutex = Mutex()

    suspend fun persist() {
        mutex.withLock { write(snapshot()) }
    }
}
