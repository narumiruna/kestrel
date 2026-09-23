package dev.narumi.kestrel.feature.options

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.core.cloud.AndroidQrLoginDetails
import dev.narumi.kestrel.core.cloud.AndroidQrLoginMethod
import dev.narumi.kestrel.ui.components.KestrelActionRow
import java.util.Date

internal sealed interface AndroidQrLoginUiState {
    data object Idle : AndroidQrLoginUiState

    data object OpeningScanner : AndroidQrLoginUiState

    data object Claiming : AndroidQrLoginUiState

    data class Confirmation(
        val details: AndroidQrLoginDetails,
    ) : AndroidQrLoginUiState

    data class Confirming(
        val details: AndroidQrLoginDetails,
    ) : AndroidQrLoginUiState

    data class Waiting(
        val details: AndroidQrLoginDetails,
        val retryAfterSeconds: Int,
    ) : AndroidQrLoginUiState

    data class Error(
        val message: String,
        val retryPendingAttempt: Boolean,
    ) : AndroidQrLoginUiState

    data object ScannerUnavailable : AndroidQrLoginUiState

    data object ScannerDownloadFailed : AndroidQrLoginUiState

    data object Denied : AndroidQrLoginUiState

    data object Expired : AndroidQrLoginUiState
}

internal fun AndroidQrLoginUiState.blocksOtherAuthentication(): Boolean =
    this is AndroidQrLoginUiState.OpeningScanner ||
        this is AndroidQrLoginUiState.Claiming ||
        this is AndroidQrLoginUiState.Confirmation ||
        this is AndroidQrLoginUiState.Confirming ||
        this is AndroidQrLoginUiState.Waiting ||
        (this is AndroidQrLoginUiState.Error && retryPendingAttempt)

internal fun shouldShowAndroidQrLoginDiscoveryNotice(
    method: AndroidQrLoginMethod,
    state: AndroidQrLoginUiState,
): Boolean = !method.enabled && state == AndroidQrLoginUiState.Idle

internal fun AndroidQrLoginUiState.summary(): String =
    when (this) {
        AndroidQrLoginUiState.Idle -> "Ready to scan"
        AndroidQrLoginUiState.OpeningScanner -> "Opening QR scanner"
        AndroidQrLoginUiState.Claiming -> "Checking QR code"
        is AndroidQrLoginUiState.Confirmation -> "Confirm ${details.username} on ${details.publicOrigin}"
        is AndroidQrLoginUiState.Confirming -> "Confirming QR sign-in"
        is AndroidQrLoginUiState.Waiting -> "Waiting for web approval"
        is AndroidQrLoginUiState.Error -> message
        AndroidQrLoginUiState.ScannerUnavailable -> "Google Play services unavailable"
        AndroidQrLoginUiState.ScannerDownloadFailed -> "Scanner download failed"
        AndroidQrLoginUiState.Denied -> "Sign-in denied"
        AndroidQrLoginUiState.Expired -> "QR code expired"
    }

@Composable
internal fun AndroidQrLoginContent(
    method: AndroidQrLoginMethod,
    state: AndroidQrLoginUiState,
    enabled: Boolean,
    onScan: () -> Unit,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
    onRetry: () -> Unit,
) {
    HorizontalDivider()
    Text(
        text = "Sign in from Kestrel Web",
        style = MaterialTheme.typography.titleSmall,
    )
    if (shouldShowAndroidQrLoginDiscoveryNotice(method, state)) {
        Text(
            text = "This server does not advertise QR sign-in. You can still scan a code from another Kestrel server.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    Column(
        modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        when (state) {
            AndroidQrLoginUiState.Idle -> IdleQrLoginContent(enabled, onScan)
            AndroidQrLoginUiState.OpeningScanner ->
                StatusText("Opening the QR scanner. Google Play services may download the scanner module.")
            AndroidQrLoginUiState.Claiming -> StatusText("Checking the server and claiming this one-time code…")
            is AndroidQrLoginUiState.Confirmation ->
                QrLoginConfirmationContent(
                    details = state.details,
                    waiting = false,
                    onConfirm = onConfirm,
                    onCancel = onCancel,
                )
            is AndroidQrLoginUiState.Confirming ->
                QrLoginConfirmationContent(
                    details = state.details,
                    waiting = true,
                    onConfirm = onConfirm,
                    onCancel = onCancel,
                )
            is AndroidQrLoginUiState.Waiting ->
                QrLoginConfirmationContent(
                    details = state.details,
                    waiting = true,
                    onConfirm = onConfirm,
                    onCancel = onCancel,
                )
            is AndroidQrLoginUiState.Error -> {
                ErrorText(state.message)
                KestrelActionRow {
                    Button(onClick = onRetry, enabled = enabled) { Text("Retry") }
                    OutlinedButton(onClick = onCancel) { Text("Cancel") }
                }
            }
            AndroidQrLoginUiState.ScannerUnavailable -> {
                ErrorText("Google Play services is unavailable. Use password or browser sign-in instead.")
                OutlinedButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) { Text("Dismiss") }
            }
            AndroidQrLoginUiState.ScannerDownloadFailed -> {
                ErrorText("The QR scanner could not download. Check Google Play services and your network, then retry.")
                KestrelActionRow {
                    Button(onClick = onScan, enabled = enabled) { Text("Retry scanner") }
                    OutlinedButton(onClick = onCancel) { Text("Dismiss") }
                }
            }
            AndroidQrLoginUiState.Denied ->
                TerminalQrLoginContent("The web sign-in was denied or cancelled.", enabled, onScan)
            AndroidQrLoginUiState.Expired -> TerminalQrLoginContent("This QR code expired.", enabled, onScan)
        }
    }
}

@Composable
private fun IdleQrLoginContent(
    enabled: Boolean,
    onScan: () -> Unit,
) {
    Text(
        text = "On the Web Account page, create an Android login code. Scan it here, then compare the account, server, and matching code on both screens.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    OutlinedButton(onClick = onScan, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
        Text("Scan Web login QR code")
    }
    Text(
        text = "Scanning uses Google Play services and does not grant Kestrel camera permission.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun QrLoginConfirmationContent(
    details: AndroidQrLoginDetails,
    waiting: Boolean,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    Text("Account: ${details.username}", style = MaterialTheme.typography.titleSmall)
    Text("Server: ${details.publicOrigin}", style = MaterialTheme.typography.bodyMedium)
    Text(
        text = details.matchingCode,
        style = MaterialTheme.typography.headlineMedium,
        color = MaterialTheme.colorScheme.primary,
    )
    Text(
        text = "Device shown on Web: ${details.deviceName}${details.appVersion?.let { " · Kestrel $it" } ?: ""}",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Text(
        text = "Code expires ${Date(details.expiresAt)}",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    if (waiting) {
        StatusText("Confirmed on this device. Waiting for approval from the Web session that created the code…")
        OutlinedButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) {
            Text("Cancel on this device")
        }
    } else {
        Text(
            text = "Continue only if the Web page shows the same account, server, device, and matching code.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        KestrelActionRow {
            Button(onClick = onConfirm) { Text("Confirm and wait") }
            OutlinedButton(onClick = onCancel) { Text("Cancel") }
        }
    }
}

@Composable
private fun TerminalQrLoginContent(
    message: String,
    enabled: Boolean,
    onScan: () -> Unit,
) {
    StatusText(message)
    OutlinedButton(onClick = onScan, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
        Text("Scan a new code")
    }
}

@Composable
private fun StatusText(message: String) {
    Text(
        text = message,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun ErrorText(message: String) {
    Text(
        text = message,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.error,
    )
}
