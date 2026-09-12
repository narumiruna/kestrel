package dev.narumi.kestrel.feature.options

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import dev.narumi.kestrel.ui.components.KestrelCard
import dev.narumi.kestrel.ui.components.KestrelIconBadge

@Composable
internal fun OptionsDisclosureCard(
    title: String,
    subtitle: String,
    summary: String,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    icon: ImageVector = Icons.Outlined.Settings,
    content: @Composable () -> Unit,
) {
    val changeFocusRequester = remember { FocusRequester() }
    val largeText = LocalDensity.current.fontScale > 1.3f
    var wasExpanded by remember { mutableStateOf(expanded) }
    LaunchedEffect(expanded) {
        if (wasExpanded && !expanded) changeFocusRequester.requestFocus()
        wasExpanded = expanded
    }
    BackHandler(enabled = expanded) { onExpandedChange(false) }
    val changeAction: @Composable () -> Unit = {
        TextButton(
            onClick = { onExpandedChange(!expanded) },
            modifier =
                Modifier
                    .focusRequester(changeFocusRequester)
                    .semantics { stateDescription = optionsDisclosureStateDescription(expanded) },
        ) {
            Text(if (expanded) "Cancel" else "Change")
        }
    }
    KestrelCard(
        modifier = Modifier.semantics { stateDescription = optionsDisclosureStateDescription(expanded) },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            KestrelIconBadge(
                icon = icon,
                containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                contentColor = MaterialTheme.colorScheme.primary,
            )
            Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            if (!largeText) changeAction()
        }
        Text(
            text = summary,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (largeText) changeAction()
        if (expanded) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            content()
        }
    }
}
