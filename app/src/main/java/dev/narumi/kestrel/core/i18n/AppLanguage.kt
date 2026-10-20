package dev.narumi.kestrel.core.i18n

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.app.LocaleManagerCompat
import androidx.core.os.LocaleListCompat
import kotlinx.coroutines.delay
import java.util.Locale

/** Language identity is separate from translated labels and persisted user data. */
object AppLanguage {
    const val CHANGED_ACTION = "dev.narumi.kestrel.LANGUAGE_CHANGED"

    val choices =
        listOf(
            LanguageChoice("zh-TW", "正體中文", "Traditional Chinese"),
            LanguageChoice("en", "English", "English"),
            LanguageChoice("ja", "日本語", "Japanese"),
            LanguageChoice("ko", "한국어", "Korean"),
            LanguageChoice("hi", "हिन्दी", "Hindi"),
            LanguageChoice("es", "Español", "Spanish"),
            LanguageChoice("fr", "Français", "French"),
            LanguageChoice("pt", "Português", "Portuguese"),
            LanguageChoice("id", "Bahasa Indonesia", "Indonesian"),
            LanguageChoice("de", "Deutsch", "German"),
            LanguageChoice("vi", "Tiếng Việt", "Vietnamese"),
            LanguageChoice("tr", "Türkçe", "Turkish"),
            LanguageChoice("fil", "Filipino", "Filipino"),
            LanguageChoice("th", "ไทย", "Thai"),
            LanguageChoice("it", "Italiano", "Italian"),
            LanguageChoice("pl", "Polski", "Polish"),
            LanguageChoice("ms", "Bahasa Melayu", "Malay"),
            LanguageChoice("nl", "Nederlands", "Dutch"),
        )

    fun normalize(tag: String?): String {
        val input = tag.orEmpty().replace('_', '-')
        val valid = runCatching { Locale.Builder().setLanguageTag(input).build() }.isSuccess
        if (!valid) return "en"
        val parts = input.lowercase(Locale.ROOT).split('-')
        val language =
            when (parts.first()) {
                "in" -> "id"
                "tl" -> "fil"
                else -> parts.first()
            }
        return when {
            language == "zh" && (parts.getOrNull(1) == "tw" || parts.getOrNull(1) == "hant") -> "zh-TW"
            language != "zh" && choices.any { it.tag == language } -> language
            else -> "en"
        }
    }

    fun selected(context: Context): String {
        val active =
            if (Build.VERSION.SDK_INT >= 33) {
                LocaleManagerCompat.getApplicationLocales(context)
            } else {
                AppCompatDelegate.getApplicationLocales().takeUnless { it.isEmpty }
                    ?: LocaleManagerCompat.getApplicationLocales(context)
            }
        return normalize(active[0]?.toLanguageTag())
    }

    /** Call after AppCompat has restored its locale store, before rendering content. */
    suspend fun initialize(context: Context) {
        // AppCompat 1.7.1 migrates its API 32 store asynchronously on API 33.
        // Its metadata component is enabled only after that migration completes.
        // Do not overwrite the stored choice with English while migration is pending.
        if (Build.VERSION.SDK_INT >= 33) {
            val holder = ComponentName(context, "androidx.appcompat.app.AppLocalesMetadataHolderService")
            while (context.packageManager.getComponentEnabledSetting(holder) != PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
                delay(16)
            }
        }
        val tag = selected(context)
        if (AppCompatDelegate.getApplicationLocales().toLanguageTags() != tag) {
            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(tag))
        }
        notifyChanged(context)
    }

    fun select(
        context: Context,
        tag: String,
    ) {
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(normalize(tag)))
        notifyChanged(context)
    }

    fun context(context: Context): Context {
        val configuration = Configuration(context.resources.configuration)
        configuration.setLocale(Locale.forLanguageTag(selected(context)))
        return context.createConfigurationContext(configuration)
    }

    private fun notifyChanged(context: Context) {
        context.sendBroadcast(Intent(CHANGED_ACTION).setPackage(context.packageName))
    }
}

data class LanguageChoice(
    val tag: String,
    val nativeName: String,
    val englishName: String,
) {
    val label: String get() = if (nativeName == englishName) nativeName else "$nativeName · $englishName"
}
