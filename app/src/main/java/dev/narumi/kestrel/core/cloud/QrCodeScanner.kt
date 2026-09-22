package dev.narumi.kestrel.core.cloud

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

internal sealed interface QrCodeScanResult {
    data class Success(
        val rawValue: String,
    ) : QrCodeScanResult

    data object Cancelled : QrCodeScanResult

    data object ScannerDownloadFailed : QrCodeScanResult

    data object Unavailable : QrCodeScanResult

    data class Failure(
        val message: String,
    ) : QrCodeScanResult
}

internal fun interface QrCodeScanner {
    suspend fun scan(): QrCodeScanResult
}

internal class GoogleQrCodeScanner(
    private val activity: Activity,
) : QrCodeScanner {
    override suspend fun scan(): QrCodeScanResult {
        val playServicesStatus =
            GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(activity)
        if (playServicesStatus != ConnectionResult.SUCCESS) {
            return QrCodeScanResult.Unavailable
        }

        val options =
            GmsBarcodeScannerOptions
                .Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .enableAutoZoom()
                .build()
        val scanner = GmsBarcodeScanning.getClient(activity, options)
        return suspendCancellableCoroutine { continuation ->
            scanner
                .startScan()
                .addOnSuccessListener { barcode ->
                    if (!continuation.isActive) return@addOnSuccessListener
                    val rawValue = barcode.rawValue
                    continuation.resume(
                        if (rawValue.isNullOrBlank()) {
                            QrCodeScanResult.Failure("The scanned QR code has no text")
                        } else {
                            QrCodeScanResult.Success(rawValue)
                        },
                    )
                }.addOnCanceledListener {
                    if (continuation.isActive) {
                        continuation.resume(QrCodeScanResult.Cancelled)
                    }
                }.addOnFailureListener { failure ->
                    if (continuation.isActive) {
                        continuation.resume(classifyGoogleCodeScannerFailure(failure))
                    }
                }
        }
    }
}

internal fun classifyGoogleCodeScannerFailure(failure: Exception): QrCodeScanResult =
    classifyGoogleCodeScannerFailure(
        mlKitErrorCode = (failure as? MlKitException)?.errorCode,
        message = failure.message,
    )

internal fun classifyGoogleCodeScannerFailure(
    mlKitErrorCode: Int?,
    message: String?,
): QrCodeScanResult =
    if (mlKitErrorCode == ML_KIT_UNAVAILABLE) {
        QrCodeScanResult.ScannerDownloadFailed
    } else {
        QrCodeScanResult.Failure(message ?: "QR scanner failed")
    }

internal tailrec fun Context.findActivity(): Activity? =
    when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }

private const val ML_KIT_UNAVAILABLE = 14
