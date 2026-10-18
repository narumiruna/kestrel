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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.cloud.AndroidQrLoginDetails
import dev.narumi.kestrel.core.cloud.AndroidQrLoginMethod
import dev.narumi.kestrel.ui.components.KestrelActionRow

internal sealed interface AndroidQrLoginUiState {
    data object Restoring : AndroidQrLoginUiState

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
        val message: OptionsMessage,
        val retryPendingAttempt: Boolean,
    ) : AndroidQrLoginUiState

    data object ScannerUnavailable : AndroidQrLoginUiState

    data object ScannerDownloadFailed : AndroidQrLoginUiState

    data object Denied : AndroidQrLoginUiState

    data object Expired : AndroidQrLoginUiState
}

internal fun AndroidQrLoginUiState.blocksOtherAuthentication(): Boolean =
    this is AndroidQrLoginUiState.Restoring ||
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

internal fun AndroidQrLoginUiState.summary(): OptionsMessage =
    when (this) {
        AndroidQrLoginUiState.Restoring -> optionsMessage(R.string.options_qr_restoring)
        AndroidQrLoginUiState.Idle -> optionsMessage(R.string.options_qr_ready)
        AndroidQrLoginUiState.OpeningScanner -> optionsMessage(R.string.options_qr_opening)
        AndroidQrLoginUiState.Claiming -> optionsMessage(R.string.options_qr_checking)
        is AndroidQrLoginUiState.Confirmation -> optionsMessage(R.string.options_qr_confirm_summary, details.username, details.publicOrigin)
        is AndroidQrLoginUiState.Confirming -> optionsMessage(R.string.options_qr_confirming)
        is AndroidQrLoginUiState.Waiting -> optionsMessage(R.string.options_qr_waiting)
        is AndroidQrLoginUiState.Error -> message
        AndroidQrLoginUiState.ScannerUnavailable -> optionsMessage(R.string.options_qr_unavailable)
        AndroidQrLoginUiState.ScannerDownloadFailed -> optionsMessage(R.string.options_qr_download_failed)
        AndroidQrLoginUiState.Denied -> optionsMessage(R.string.options_qr_denied)
        AndroidQrLoginUiState.Expired -> optionsMessage(R.string.options_qr_expired)
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
        text = stringResource(R.string.options_qr_title),
        style = MaterialTheme.typography.titleSmall,
    )
    if (shouldShowAndroidQrLoginDiscoveryNotice(method, state)) {
        Text(
            text = stringResource(R.string.options_qr_discovery),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    Column(
        modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        when (state) {
            AndroidQrLoginUiState.Restoring -> {
                StatusText(stringResource(R.string.options_qr_restoring_detail))
            }

            AndroidQrLoginUiState.Idle -> {
                IdleQrLoginContent(enabled, onScan)
            }

            AndroidQrLoginUiState.OpeningScanner -> {
                StatusText(stringResource(R.string.options_qr_scanner_opening_detail))
            }

            AndroidQrLoginUiState.Claiming -> {
                StatusText(stringResource(R.string.options_qr_claiming_detail))
            }

            is AndroidQrLoginUiState.Confirmation -> {
                QrLoginConfirmationContent(
                    details = state.details,
                    waiting = false,
                    onConfirm = onConfirm,
                    onCancel = onCancel,
                )
            }

            is AndroidQrLoginUiState.Confirming -> {
                QrLoginConfirmationContent(
                    details = state.details,
                    waiting = true,
                    onConfirm = onConfirm,
                    onCancel = onCancel,
                )
            }

            is AndroidQrLoginUiState.Waiting -> {
                QrLoginConfirmationContent(
                    details = state.details,
                    waiting = true,
                    onConfirm = onConfirm,
                    onCancel = onCancel,
                )
            }

            is AndroidQrLoginUiState.Error -> {
                RetryQrLoginContent(state.message.text(), enabled, onRetry, onCancel)
            }

            AndroidQrLoginUiState.ScannerUnavailable -> {
                ErrorText(stringResource(R.string.options_qr_unavailable_detail))
                OutlinedButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.options_dismiss)) }
            }

            AndroidQrLoginUiState.ScannerDownloadFailed -> {
                ErrorText(stringResource(R.string.options_qr_download_failed_detail))
                KestrelActionRow {
                    Button(onClick = onScan, enabled = enabled) { Text(stringResource(R.string.options_qr_retry_scanner)) }
                    OutlinedButton(onClick = onCancel) { Text(stringResource(R.string.options_dismiss)) }
                }
            }

            AndroidQrLoginUiState.Denied -> {
                TerminalQrLoginContent(stringResource(R.string.options_qr_denied_detail), enabled, onScan)
            }

            AndroidQrLoginUiState.Expired -> {
                TerminalQrLoginContent(stringResource(R.string.options_qr_expired_detail), enabled, onScan)
            }
        }
    }
}

@Composable
private fun RetryQrLoginContent(
    message: String,
    enabled: Boolean,
    onRetry: () -> Unit,
    onCancel: () -> Unit,
) {
    ErrorText(message)
    KestrelActionRow {
        Button(onClick = onRetry, enabled = enabled) { Text(stringResource(R.string.options_retry)) }
        OutlinedButton(onClick = onCancel) { Text(stringResource(R.string.options_cancel)) }
    }
}

@Composable
private fun IdleQrLoginContent(
    enabled: Boolean,
    onScan: () -> Unit,
) {
    Text(
        text = stringResource(R.string.options_qr_instructions),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    OutlinedButton(onClick = onScan, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
        Text(stringResource(R.string.options_qr_scan))
    }
    Text(
        text = stringResource(R.string.options_qr_permission_notice),
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
    Text(stringResource(R.string.options_qr_account, details.username), style = MaterialTheme.typography.titleSmall)
    Text(stringResource(R.string.options_qr_server, details.publicOrigin), style = MaterialTheme.typography.bodyMedium)
    Text(
        text = details.matchingCode,
        style = MaterialTheme.typography.headlineMedium,
        color = MaterialTheme.colorScheme.primary,
    )
    Text(
        text =
            if (details.appVersion != null) {
                stringResource(R.string.options_qr_device_version, details.deviceName, details.appVersion)
            } else {
                stringResource(R.string.options_qr_device, details.deviceName)
            },
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Text(
        text = stringResource(R.string.options_qr_expires, optionsDate(details.expiresAt)),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    if (waiting) {
        StatusText(stringResource(R.string.options_qr_waiting_detail))
        OutlinedButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.options_qr_cancel_device))
        }
    } else {
        Text(
            text = stringResource(R.string.options_qr_confirmation_notice),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        KestrelActionRow {
            Button(onClick = onConfirm) { Text(stringResource(R.string.options_qr_confirm_wait)) }
            OutlinedButton(onClick = onCancel) { Text(stringResource(R.string.options_cancel)) }
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
        Text(stringResource(R.string.options_qr_scan_new))
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
