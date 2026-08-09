package dev.narumi.kestrel.ui.components

import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type

/** Adds an explicit hardware-key equivalent for consequential actions. */
fun Modifier.onKeyboardActivate(action: () -> Unit): Modifier =
    onPreviewKeyEvent { event ->
        val activates =
            event.type == KeyEventType.KeyUp &&
                event.key in setOf(Key.Enter, Key.NumPadEnter, Key.Spacebar, Key.DirectionCenter)
        if (activates) {
            action()
            true
        } else {
            false
        }
    }
