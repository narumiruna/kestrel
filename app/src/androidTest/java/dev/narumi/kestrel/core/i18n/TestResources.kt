package dev.narumi.kestrel.core.i18n

import android.content.Context
import androidx.annotation.StringRes
import androidx.appcompat.view.ContextThemeWrapper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.test.platform.app.InstrumentationRegistry
import dev.narumi.kestrel.R

/** Resolve test expectations in the selected app language, not the host language. */
internal val appTestContext: Context
    get() = AppLanguage.context(InstrumentationRegistry.getInstrumentation().targetContext)

internal fun appString(
    @StringRes resource: Int,
    vararg arguments: Any,
): String = appTestContext.getString(resource, *arguments)

/** Give the generic test activity the same locale resources as MainActivity. */
internal fun ComposeContentTestRule.setAppContent(content: @Composable () -> Unit) {
    setContent {
        val host = LocalContext.current
        val configuration = LocalConfiguration.current
        val localeContext =
            remember(host, configuration) {
                ContextThemeWrapper(host, R.style.Theme_Kestrel).apply {
                    applyOverrideConfiguration(AppLanguage.context(host).resources.configuration)
                }
            }
        CompositionLocalProvider(
            LocalContext provides localeContext,
            LocalConfiguration provides localeContext.resources.configuration,
        ) {
            content()
        }
    }
}
