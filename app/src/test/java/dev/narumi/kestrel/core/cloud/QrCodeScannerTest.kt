package dev.narumi.kestrel.core.cloud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class QrCodeScannerTest {
    @Test
    fun distinguishesScannerModuleDownloadFailures() {
        assertEquals(
            QrCodeScanResult.ScannerDownloadFailed,
            classifyGoogleCodeScannerFailure(mlKitErrorCode = 14, message = "unavailable"),
        )
    }

    @Test
    fun preservesGenericScannerFailuresWithoutExposingAnEmptyMessage() {
        val result = classifyGoogleCodeScannerFailure(IllegalStateException())
        assertTrue(result is QrCodeScanResult.Failure)
        assertEquals("QR scanner failed", (result as QrCodeScanResult.Failure).message)
    }
}
