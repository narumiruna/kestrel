package dev.narumi.kestrel.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val LightColorScheme =
    lightColorScheme(
        primary = Blue40,
        onPrimary = Color.White,
        primaryContainer = Blue90,
        onPrimaryContainer = Blue10,
        secondary = BlueGrey40,
        onSecondary = Color.White,
        secondaryContainer = BlueGrey90,
        onSecondaryContainer = BlueGrey10,
        tertiary = Teal40,
        onTertiary = Color.White,
        tertiaryContainer = Teal90,
        onTertiaryContainer = Teal10,
        error = Red40,
        onError = Color.White,
        errorContainer = Red90,
        onErrorContainer = Red10,
        background = Color(0xFFF5F6FF),
        onBackground = Color(0xFF1A1C23),
        surface = Color(0xFFF5F6FF),
        onSurface = Color(0xFF1A1C23),
        surfaceVariant = Color(0xFFDDE3EE),
        onSurfaceVariant = Color(0xFF424752),
        outline = Color(0xFF727785),
        outlineVariant = Color(0xFFC2C7D3),
    )

private val DarkColorScheme =
    darkColorScheme(
        primary = Blue80,
        onPrimary = Blue20,
        primaryContainer = Blue30,
        onPrimaryContainer = Blue90,
        secondary = BlueGrey80,
        onSecondary = BlueGrey20,
        secondaryContainer = BlueGrey30,
        onSecondaryContainer = BlueGrey90,
        tertiary = Teal80,
        onTertiary = Teal20,
        tertiaryContainer = Teal30,
        onTertiaryContainer = Teal90,
        error = Red80,
        onError = Red20,
        errorContainer = Color(0xFF93000A),
        onErrorContainer = Red90,
        background = Color(0xFF12131B),
        onBackground = Color(0xFFE2E2EC),
        surface = Color(0xFF12131B),
        onSurface = Color(0xFFE2E2EC),
        surfaceVariant = Color(0xFF424752),
        onSurfaceVariant = Color(0xFFC2C7D3),
        outline = Color(0xFF8C919D),
        outlineVariant = Color(0xFF424752),
    )

@Composable
fun KestrelTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    // Dynamic color is available on Android 12+; disabled by default for a consistent palette.
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colorScheme =
        when {
            dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
                val context = LocalContext.current
                if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
            }

            darkTheme -> DarkColorScheme
            else -> LightColorScheme
        }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content,
    )
}
