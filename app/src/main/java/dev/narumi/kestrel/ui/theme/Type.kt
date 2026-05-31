package dev.narumi.kestrel.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private val KestrelFontFamily = FontFamily.Default

val Typography =
    Typography(
        titleLarge =
            TextStyle(
                fontFamily = KestrelFontFamily,
                fontWeight = FontWeight.SemiBold,
                fontSize = 24.sp,
                lineHeight = 30.sp,
                letterSpacing = (-0.2f).sp,
            ),
        titleMedium =
            TextStyle(
                fontFamily = KestrelFontFamily,
                fontWeight = FontWeight.SemiBold,
                fontSize = 18.sp,
                lineHeight = 24.sp,
                letterSpacing = 0.sp,
            ),
        titleSmall =
            TextStyle(
                fontFamily = KestrelFontFamily,
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
                lineHeight = 20.sp,
                letterSpacing = 0.1.sp,
            ),
        bodyLarge =
            TextStyle(
                fontFamily = KestrelFontFamily,
                fontWeight = FontWeight.Normal,
                fontSize = 16.sp,
                lineHeight = 24.sp,
                letterSpacing = 0.15.sp,
            ),
        bodyMedium =
            TextStyle(
                fontFamily = KestrelFontFamily,
                fontWeight = FontWeight.Normal,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                letterSpacing = 0.2.sp,
            ),
        bodySmall =
            TextStyle(
                fontFamily = KestrelFontFamily,
                fontWeight = FontWeight.Normal,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                letterSpacing = 0.25.sp,
            ),
        labelLarge =
            TextStyle(
                fontFamily = KestrelFontFamily,
                fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                letterSpacing = 0.1.sp,
            ),
        labelMedium =
            TextStyle(
                fontFamily = KestrelFontFamily,
                fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp,
                lineHeight = 16.sp,
                letterSpacing = 0.4.sp,
            ),
        labelSmall =
            TextStyle(
                fontFamily = KestrelFontFamily,
                fontWeight = FontWeight.Medium,
                fontSize = 11.sp,
                lineHeight = 16.sp,
                letterSpacing = 0.5.sp,
            ),
    )
