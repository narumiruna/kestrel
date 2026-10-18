package dev.narumi.kestrel.core.i18n

import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import java.io.Serializable

/** Retain message identity, not English prose, in recoverable UI and operation state. */
data class UiMessage(
    @param:StringRes val resourceId: Int,
    val args: List<String> = emptyList(),
) : Serializable {
    fun resolve(context: Context): String = context.getString(resourceId, *args.toTypedArray())

    private companion object {
        private const val serialVersionUID = 1L
    }
}

@Composable
fun UiMessage.localized(): String = resolve(LocalContext.current)
