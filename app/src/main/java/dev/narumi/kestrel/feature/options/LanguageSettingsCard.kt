package dev.narumi.kestrel.feature.options

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.i18n.AppLanguage

@Composable
internal fun LanguageSettingsCard() {
    val context = LocalContext.current
    LocalConfiguration.current
    val selected = AppLanguage.selected(context)
    var expanded by rememberSaveable { mutableStateOf(false) }
    OptionsDisclosureCard(
        title = stringResource(R.string.options_language),
        subtitle = stringResource(R.string.options_language_help),
        summary = AppLanguage.choices.first { it.tag == selected }.label,
        expanded = expanded,
        onExpandedChange = { expanded = it },
    ) {
        AppLanguage.choices.forEachIndexed { index, choice ->
            if (index > 0) HorizontalDivider()
            ListItem(
                headlineContent = { Text(choice.label) },
                leadingContent = { RadioButton(selected = selected == choice.tag, onClick = null) },
                modifier =
                    Modifier.fillMaxWidth().selectable(
                        selected = selected == choice.tag,
                        role = Role.RadioButton,
                        onClick = {
                            expanded = false
                            AppLanguage.select(context, choice.tag)
                        },
                    ),
            )
        }
    }
}
