package dev.narumi.kestrel.core.library.db

import androidx.room.TypeConverter
import dev.narumi.kestrel.core.library.LibraryItemKind
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

class LibraryConverters {
    private val json = Json { ignoreUnknownKeys = true }
    private val tagsSerializer = ListSerializer(String.serializer())

    @TypeConverter
    fun fromLibraryItemKind(value: LibraryItemKind): String = value.name

    @TypeConverter
    fun toLibraryItemKind(value: String): LibraryItemKind =
        runCatching { LibraryItemKind.valueOf(value) }
            .getOrDefault(LibraryItemKind.Place)

    @TypeConverter
    fun fromSyncStatus(value: SyncStatus): String = value.name

    @TypeConverter
    fun toSyncStatus(value: String): SyncStatus =
        runCatching { SyncStatus.valueOf(value) }
            .getOrDefault(SyncStatus.LocalOnly)

    @TypeConverter
    fun fromTags(value: List<String>): String = json.encodeToString(tagsSerializer, value)

    @TypeConverter
    fun toTags(value: String): List<String> =
        runCatching { json.decodeFromString(tagsSerializer, value) }
            .getOrDefault(emptyList())
}
