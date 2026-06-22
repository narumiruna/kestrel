package dev.narumi.kestrel.core.cloud

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

internal class RemoteControlPoller private constructor(
    context: Context,
) {
    private val repository = RemoteControlRepository.getInstance(context.applicationContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lock = Any()
    private var foregroundLease = false
    private var serviceLease = false
    private var job: Job? = null

    fun setForegroundActive(active: Boolean) {
        synchronized(lock) {
            foregroundLease = active
            updateJobLocked()
        }
        if (active) pollNow()
    }

    fun setServiceActive(active: Boolean) {
        synchronized(lock) {
            serviceLease = active
            updateJobLocked()
        }
        if (active) pollNow()
    }

    private fun pollNow() {
        Log.i(TAG, "Remote control poll requested")
        scope.launch { repository.pollOnce() }
    }

    private fun updateJobLocked() {
        if (hasLeaseLocked() && job?.isActive != true) {
            startJobLocked()
        }
    }

    private fun startJobLocked() {
        val newJob =
            scope.launch {
                Log.i(TAG, "Remote control polling loop started")
                while (isActive && hasLease()) {
                    repository.pollOnce()
                    if (hasLease()) {
                        delay(pollDelayMillis())
                    }
                }
            }
        job = newJob
        newJob.invokeOnCompletion {
            synchronized(lock) {
                if (job === newJob) {
                    job = null
                    updateJobLocked()
                }
            }
        }
    }

    private fun hasLease(): Boolean = synchronized(lock) { hasLeaseLocked() }

    private fun hasLeaseLocked(): Boolean = foregroundLease || serviceLease

    private fun pollDelayMillis(): Long =
        synchronized(lock) {
            if (foregroundLease) FOREGROUND_POLL_MILLIS else SERVICE_POLL_MILLIS
        }

    companion object {
        @Volatile private var instance: RemoteControlPoller? = null

        fun getInstance(context: Context): RemoteControlPoller {
            val applicationContext = context.applicationContext
            return instance ?: synchronized(this) {
                instance ?: RemoteControlPoller(applicationContext).also { instance = it }
            }
        }

        private const val FOREGROUND_POLL_MILLIS = 5_000L
        private const val SERVICE_POLL_MILLIS = 15_000L
        private const val TAG = "RemoteControlPoller"
    }
}
