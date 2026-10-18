package dev.narumi.kestrel.feature.options

import androidx.annotation.PluralsRes
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import dev.narumi.kestrel.core.cloud.CloudErrorContext
import dev.narumi.kestrel.core.cloud.CloudMessage
import dev.narumi.kestrel.core.cloud.toCloudMessage
import java.io.Serializable
import java.text.DateFormat
import java.text.NumberFormat
import java.util.Date

internal sealed interface OptionsMessage : Serializable {
    data class Resource(
        @param:StringRes val resourceId: Int,
        val arguments: List<String> = emptyList(),
    ) : OptionsMessage

    data class Plural(
        @param:PluralsRes val resourceId: Int,
        val quantity: Int,
        val arguments: List<Number>,
    ) : OptionsMessage

    data class Cloud(
        val value: CloudMessage,
    ) : OptionsMessage
}

internal fun optionsMessage(
    @StringRes resourceId: Int,
    vararg arguments: String,
): OptionsMessage = OptionsMessage.Resource(resourceId, arguments.toList())

@Composable
internal fun OptionsMessage.text(): String =
    when (this) {
        is OptionsMessage.Resource -> stringResource(resourceId, *arguments.toTypedArray())
        is OptionsMessage.Cloud -> value.text()
        is OptionsMessage.Plural -> pluralStringResource(resourceId, quantity, *arguments.map { optionsNumber(it) }.toTypedArray())
    }

@Composable
internal fun CloudMessage.text(): String {
    // The context can retain its identity when its resources change.
    LocalConfiguration.current
    return resolve(LocalContext.current)
}

internal fun Throwable.toOptionsError(context: CloudErrorContext = CloudErrorContext.General): OptionsMessage = OptionsMessage.Cloud(toCloudMessage(context))

@Composable
internal fun optionsNumber(value: Number): String = NumberFormat.getNumberInstance(LocalConfiguration.current.locales[0]).format(value)

@Composable
internal fun optionsDate(epochMillis: Long): String =
    DateFormat
        .getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, LocalConfiguration.current.locales[0])
        .format(Date(epochMillis))
