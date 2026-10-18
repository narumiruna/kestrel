package dev.narumi.kestrel.feature

import androidx.compose.material3.Surface
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.i18n.appString
import dev.narumi.kestrel.core.i18n.appTestContext
import dev.narumi.kestrel.core.i18n.displayNumber
import dev.narumi.kestrel.core.i18n.setAppContent
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
        composeRule.setAppContent {
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
        composeRule.onNodeWithText(appString(R.string.display_speed, appTestContext.displayNumber(20.0))).performClick()
        composeRule.onNodeWithText(appString(R.string.playback_loop)).performClick()
        composeRule.runOnIdle {
            assertEquals(listOf(20.0), speeds)
            assertEquals(listOf(MovementEngine.Mode.Loop), modes)
        }
        composeRule.onNodeWithText(appString(R.string.display_speed, appTestContext.displayNumber(12.0))).assertIsSelected()
        composeRule.onNodeWithText(appString(R.string.playback_once)).assertIsSelected()
        composeRule.onNodeWithText(appString(R.string.display_speed, appTestContext.displayNumber(20.0))).assertIsNotSelected()
        composeRule.onNodeWithText(appString(R.string.playback_loop)).assertIsNotSelected()
    }

    @Test
    fun pendingOperationDisablesSpeedAndModeChanges() {
        composeRule.setAppContent {
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
        listOf(5.0, 10.0, 15.0, 20.0).forEach { speed ->
            composeRule.onNodeWithText(appString(R.string.display_speed, appTestContext.displayNumber(speed))).assertIsNotEnabled()
        }
        listOf(R.string.playback_once, R.string.playback_loop, R.string.playback_ping_pong).forEach { mode ->
            composeRule.onNodeWithText(appString(mode)).assertIsNotEnabled()
        }
        composeRule.onNodeWithText(appString(R.string.playback_ping_pong)).assertIsSelected()
    }
}
