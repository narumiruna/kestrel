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
        primary = KestrelBlue40,
        onPrimary = Color.White,
        primaryContainer = KestrelBlue90,
        onPrimaryContainer = KestrelBlue10,
        secondary = Slate40,
        onSecondary = Color.White,
        secondaryContainer = Slate90,
        onSecondaryContainer = Slate10,
        tertiary = SeaGlass40,
        onTertiary = Color.White,
        tertiaryContainer = SeaGlass90,
        onTertiaryContainer = SeaGlass10,
        error = SignalRed40,
        onError = Color.White,
        errorContainer = SignalRed90,
        onErrorContainer = SignalRed10,
        background = MistBackground,
        onBackground = Color(0xFF17202A),
        surface = MistSurface,
        onSurface = Color(0xFF17202A),
        surfaceVariant = MistSurfaceVariant,
        onSurfaceVariant = Color(0xFF44505D),
        outline = Color(0xFF6F7B88),
        outlineVariant = Color(0xFFC2CEDA),
        inverseSurface = Color(0xFF2B3138),
        inverseOnSurface = Color(0xFFEFF3F8),
    )

private val DarkColorScheme =
    darkColorScheme(
        primary = KestrelBlue80,
        onPrimary = KestrelBlue20,
        primaryContainer = KestrelBlue30,
        onPrimaryContainer = KestrelBlue90,
        secondary = Slate80,
        onSecondary = Slate20,
        secondaryContainer = Slate30,
        onSecondaryContainer = Slate90,
        tertiary = SeaGlass80,
        onTertiary = SeaGlass20,
        tertiaryContainer = SeaGlass30,
        onTertiaryContainer = SeaGlass90,
        error = SignalRed80,
        onError = SignalRed20,
        errorContainer = Color(0xFF93000A),
        onErrorContainer = SignalRed90,
        background = NightBackground,
        onBackground = Color(0xFFE3EAF1),
        surface = NightSurface,
        onSurface = Color(0xFFE3EAF1),
        surfaceVariant = NightSurfaceVariant,
        onSurfaceVariant = Color(0xFFC4CED9),
        outline = Color(0xFF8D98A5),
        outlineVariant = Color(0xFF3F4852),
        inverseSurface = Color(0xFFE3EAF1),
        inverseOnSurface = Color(0xFF27313B),
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
