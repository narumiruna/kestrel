package dev.narumi.kestrel.feature

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.pressKey
import androidx.compose.ui.test.requestFocus
import androidx.compose.ui.unit.dp
import androidx.test.espresso.Espresso
import dev.narumi.kestrel.feature.map.MapFeedbackCard
import dev.narumi.kestrel.feature.map.ReplacementPreviewCard
import dev.narumi.kestrel.feature.options.OptionsDisclosureCard
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class WorkflowInteractionTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun replacementPreviewSeparatesConfirmAndCancelWithAccessibleTargets() {
        var replacements = 0
        var cancellations = 0
        composeRule.setContent {
            MaterialTheme {
                ReplacementPreviewCard(
                    currentSummary = "Route · 3 waypoints",
                    previewSummary = "Point preview",
                    applying = false,
                    onReplace = { replacements++ },
                    onUndoLast = {},
                    onCancelPreview = { cancellations++ },
                )
            }
        }

        composeRule
            .onNodeWithText("Replace current mock")
            .assertHeightIsAtLeast(48.dp)
            .requestFocus()
            .assertIsFocused()
            .performKeyInput { pressKey(Key.Enter) }
        composeRule.onNodeWithText("Cancel preview").assertHeightIsAtLeast(48.dp).performClick()

        composeRule.runOnIdle {
            assertEquals(1, replacements)
            assertEquals(1, cancellations)
        }
    }

    @Test
    fun applyingReplacementExplainsWhyThePrimaryActionIsDisabled() {
        composeRule.setContent {
            MaterialTheme {
                ReplacementPreviewCard(
                    currentSummary = "Route · 3 waypoints",
                    previewSummary = "Point preview",
                    applying = true,
                    onReplace = {},
                    onUndoLast = {},
                    onCancelPreview = {},
                )
            }
        }

        composeRule.onNodeWithText("Replacing…").assertIsNotEnabled()
    }

    @Test
    fun backClosesASettingsDraftBeforeLeavingTheScreen() {
        composeRule.setContent {
            var expanded by remember { mutableStateOf(false) }
            MaterialTheme {
                OptionsDisclosureCard(
                    title = "Route recovery",
                    subtitle = "Choose recovery accuracy.",
                    summary = "Balanced",
                    expanded = expanded,
                    onExpandedChange = { expanded = it },
                ) {
                    Text("Draft controls")
                }
            }
        }

        composeRule.onNodeWithText("Change").performClick()
        composeRule.onAllNodesWithText("Draft controls").assertCountEquals(1)
        Espresso.pressBack()
        composeRule.onAllNodesWithText("Draft controls").assertCountEquals(0)
        composeRule.onNodeWithText("Change").assertIsFocused()
    }

    @Test
    fun feedbackUsesUrgencyAppropriateLiveRegions() {
        composeRule.setContent {
            MaterialTheme {
                MapFeedbackCard(message = "Route playback started.", isError = false)
            }
        }

        composeRule
            .onNodeWithText("Route playback started.")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
    }

    @Test
    fun errorFeedbackIsAnnouncedAsAnAssertiveLiveRegion() {
        composeRule.setContent {
            MaterialTheme {
                MapFeedbackCard(message = "Mock replacement failed.", isError = true)
            }
        }

        composeRule
            .onNodeWithText("Mock replacement failed.")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Assertive))
    }
}
