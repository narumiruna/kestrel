package dev.narumi.kestrel.feature

import androidx.compose.material3.Surface
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import dev.narumi.kestrel.core.location.MovementEngine
import dev.narumi.kestrel.feature.map.LiveRouteSettingsCard
import dev.narumi.kestrel.ui.theme.KestrelTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class LiveRouteSettingsInteractionTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun choicesDispatchChangesButStayOnConfirmedRuntimeValues() {
        val speeds = mutableListOf<Double>()
        val modes = mutableListOf<MovementEngine.Mode>()
        composeRule.setContent {
            KestrelTheme {
                Surface {
                    LiveRouteSettingsCard(
                        speedKmh = 12.0,
                        routeMode = MovementEngine.Mode.Once,
                        enabled = true,
                        onSpeedChange = { speeds += it },
                        onModeChange = { modes += it },
                    )
                }
            }
        }
        composeRule.onNodeWithText("20 km/h").performClick()
        composeRule.onNodeWithText("Loop").performClick()
        composeRule.runOnIdle {
            assertEquals(listOf(20.0), speeds)
            assertEquals(listOf(MovementEngine.Mode.Loop), modes)
        }
        composeRule.onNodeWithText("12 km/h").assertIsSelected()
        composeRule.onNodeWithText("Once").assertIsSelected()
        composeRule.onNodeWithText("20 km/h").assertIsNotSelected()
        composeRule.onNodeWithText("Loop").assertIsNotSelected()
    }

    @Test
    fun pendingOperationDisablesSpeedAndModeChanges() {
        composeRule.setContent {
            KestrelTheme {
                Surface {
                    LiveRouteSettingsCard(
                        speedKmh = 10.0,
                        routeMode = MovementEngine.Mode.PingPong,
                        enabled = false,
                        onSpeedChange = { error("Pending speed control must be disabled") },
                        onModeChange = { error("Pending mode control must be disabled") },
                    )
                }
            }
        }
        listOf("5 km/h", "10 km/h", "15 km/h", "20 km/h", "Once", "Loop", "Ping-pong").forEach { label ->
            composeRule.onNodeWithText(label).assertIsNotEnabled()
        }
        composeRule.onNodeWithText("Ping-pong").assertIsSelected()
    }
}
