package dev.narumi.kestrel.core.i18n

import dev.narumi.kestrel.core.data.FavoritesSortMode
import dev.narumi.kestrel.core.library.LibraryItem
import dev.narumi.kestrel.core.library.LibraryItemKind
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.core.library.sortedFor
import dev.narumi.kestrel.core.location.parseCoordInput
import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

class AppLanguageTest {
    @Test
    fun canonicalChoicesAreCompleteAndStable() {
        assertEquals(
            listOf("zh-TW", "en", "ja", "ko", "hi", "es", "fr", "pt", "id", "de", "vi", "tr", "fil", "th", "it", "pl", "ms", "nl"),
            AppLanguage.choices.map { it.tag },
        )
        AppLanguage.choices.forEach { assertEquals(it.tag, AppLanguage.normalize(it.tag)) }
    }

    @Test
    fun normalizesAliasesWithoutSelectingSimplifiedChinese() {
        mapOf(
            "EN-us" to "en",
            "pt-BR" to "pt",
            "es-MX" to "es",
            "in-ID" to "id",
            "ID-id" to "id",
            "tl-PH" to "fil",
            "zh-Hant" to "zh-TW",
            "zh-Hant-HK" to "zh-TW",
            "ZH_tw" to "zh-TW",
            "zh" to "en",
            "zh-CN" to "en",
            "zh-Hans-TW" to "en",
            "" to "en",
            "system" to "en",
            "fr-CA" to "fr",
            "invalid" to "en",
        ).forEach { (input, expected) -> assertEquals(input, expected, AppLanguage.normalize(input)) }
        assertEquals("en", AppLanguage.normalize(null))
        listOf("ja-???", "pt-???", "en--US", "en-", "-ja", "💻").forEach {
            assertEquals(it, "en", AppLanguage.normalize(it))
        }
    }

    @Test
    fun displayUsesSelectedLocaleButCoordinatesKeepDecimalPoint() {
        assertEquals("12,5", displayNumber(12.5, Locale.GERMAN))
        assertEquals("12.5", displayNumber(12.5, Locale.ENGLISH))
        val original = Locale.getDefault()
        try {
            Locale.setDefault(Locale.GERMAN)
            assertEquals("25.50000, 121.25000", coordinates(25.5, 121.25))
            val parsed = requireNotNull(parseCoordInput(coordinates(25.5, 121.25)))
            assertEquals(25.5, parsed.lat, 0.0)
            assertEquals(121.25, parsed.lng, 0.0)
        } finally {
            Locale.setDefault(original)
        }
    }

    @Test
    fun collationUsesTurkishRulesAndStableIdsWithoutChangingNamesOrManualOrder() {
        val items = listOf(item("z", "İzmir", 0), item("b", "Isparta", 1), item("a", "Isparta", 2))
        assertEquals(listOf("a", "b", "z"), items.sortedFor(FavoritesSortMode.Mode.Alphabetical, Locale.forLanguageTag("tr")).map { it.item.id })
        assertEquals(listOf("z", "b", "a"), items.sortedFor(FavoritesSortMode.Mode.Manual, Locale.forLanguageTag("tr")).map { it.item.id })
        assertEquals(listOf("İzmir", "Isparta", "Isparta"), items.map { it.name })
    }

    private fun item(
        id: String,
        name: String,
        order: Int,
    ) = LibraryItemWithContent(
        item = LibraryItem(id = id, kind = LibraryItemKind.Place, sortOrder = order, createdAt = 0L, updatedAt = 0L),
        name = name,
        kind = LibraryItemKind.Place,
    )
}
