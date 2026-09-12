package dev.narumi.kestrel.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

class ThemeContrastTest {
    @Test
    fun lightThemeTextMeetsNormalTextContrast() = assertTextContrast(LightColorScheme)

    @Test
    fun darkThemeTextMeetsNormalTextContrast() = assertTextContrast(DarkColorScheme)

    private fun assertTextContrast(scheme: ColorScheme) {
        with(scheme) {
            listOf(
                background,
                surface,
                surfaceContainerLowest,
                surfaceContainerLow,
                surfaceContainer,
                surfaceContainerHigh,
                surfaceContainerHighest,
            ).forEach { container ->
                assertContrast("Surface text", onSurface, container)
                assertContrast("Secondary text", onSurfaceVariant, container)
                assertContrast("Action text", primary, container)
                assertContrast("Error text", error, container)
            }
            listOf(
                "Primary" to (onPrimary to primary),
                "Primary container" to (onPrimaryContainer to primaryContainer),
                "Secondary" to (onSecondary to secondary),
                "Secondary container" to (onSecondaryContainer to secondaryContainer),
                "Tertiary" to (onTertiary to tertiary),
                "Tertiary container" to (onTertiaryContainer to tertiaryContainer),
                "Error" to (onError to error),
                "Error container" to (onErrorContainer to errorContainer),
                "Inverse surface" to (inverseOnSurface to inverseSurface),
            ).forEach { (name, colors) -> assertContrast(name, colors.first, colors.second) }
        }
    }

    private fun assertContrast(
        name: String,
        foreground: Color,
        background: Color,
    ) {
        val first = foreground.relativeLuminance()
        val second = background.relativeLuminance()
        val ratio = (max(first, second) + 0.05) / (min(first, second) + 0.05)
        assertTrue("$name contrast is $ratio; expected at least 4.5:1", ratio >= 4.5)
    }

    private fun Color.relativeLuminance(): Double = 0.2126 * red.linearized() + 0.7152 * green.linearized() + 0.0722 * blue.linearized()

    private fun Float.linearized(): Double = if (this <= 0.04045f) toDouble() / 12.92 else ((toDouble() + 0.055) / 1.055).pow(2.4)
}
