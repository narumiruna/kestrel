package dev.narumi.kestrel.core.i18n

import android.os.Build
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assume.assumeTrue
import org.junit.rules.TestRule
import org.junit.runners.model.Statement

/** Check authorization before the Compose rule can launch an Activity or restore mock state. */
internal fun disposableLocaleTarget(optInArgument: String): TestRule =
    TestRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                assumeTrue("Explicit disposable-target opt-in is required", InstrumentationRegistry.getArguments().getString(optInArgument) == "true")
                assumeTrue("An Android emulator is required", Build.HARDWARE == "ranchu" || Build.HARDWARE == "goldfish")
                base.evaluate()
            }
        }
    }
