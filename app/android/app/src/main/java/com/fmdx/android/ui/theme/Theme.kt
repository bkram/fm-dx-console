package com.fmdx.android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = PrimaryGreen,
    onPrimary = OnSurface,
    secondary = AccentTeal,
    background = BackgroundDark,
    surface = SurfaceDark,
    onSurface = OnSurface,
    error = ErrorRed
)

@Composable
fun FmDxTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = Typography,
        content = content
    )
}
