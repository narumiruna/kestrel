package dev.narumi.kestrel.core.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.doublePreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

@Serializable
data class CameraSnapshot(
    val lat: Double,
    val lng: Double,
    val zoom: Double,
)

@Serializable
data class Favorite(
    val name: String,
    val lat: Double,
    val lng: Double,
    val route: FavoriteRoute? = null,
    val lastUsedAt: Long? = null,
) {
    val isRoute: Boolean get() = route != null
}

@Serializable
data class FavoritesSortMode(
    val mode: Mode = Mode.Manual,
) {
    enum class Mode { Manual, Recent, Alphabetical }
}

@Serializable
data class FavoriteRoute(
    val lats: DoubleArray,
    val lngs: DoubleArray,
    val speedKmh: Double,
    val mode: String = "Once",
) {
    override fun equals(other: Any?): Boolean =
        other is FavoriteRoute &&
            lats.contentEquals(other.lats) &&
            lngs.contentEquals(other.lngs) &&
            speedKmh == other.speedKmh &&
            mode == other.mode

    override fun hashCode(): Int {
        var result = lats.contentHashCode()
        result = result * 31 + lngs.contentHashCode()
        result = result * 31 + speedKmh.hashCode()
        result = result * 31 + mode.hashCode()
        return result
    }
}

@Serializable
data class RouteState(
    val lats: DoubleArray,
    val lngs: DoubleArray,
    val speedKmh: Double,
    val mode: String = "Once",
)

@Serializable
data class SinglePointState(
    val lat: Double,
    val lng: Double,
)

@Serializable
data class MockState(
    val mode: Mode,
    val single: SinglePointState? = null,
    val route: RouteState? = null,
) {
    enum class Mode { Idle, Single, Route }
}

@Serializable
data class StartupPreference(
    val mode: Mode = Mode.Last,
    val libraryItemId: String? = null,
    val favoriteName: String? = null,
) {
    enum class Mode { Last, Current, Favorite }
}

@Serializable
data class RandomRoutePreference(
    val defaultPointCount: Int = RECOMMENDED_POINT_COUNT,
    val defaultSpacingMeters: Double = RECOMMENDED_SPACING_METERS,
    val lastPointCount: Int? = null,
    val lastSpacingMeters: Double? = null,
) {
    companion object {
        const val MIN_POINT_COUNT = 2
        const val MAX_POINT_COUNT = 1000
        const val MIN_SPACING_METERS = 1.0
        const val MAX_SPACING_METERS = 10000.0
        const val RECOMMENDED_POINT_COUNT = 100
        const val RECOMMENDED_SPACING_METERS = 500.0
    }

    val effectivePointCount: Int get() = lastPointCount ?: defaultPointCount
    val effectiveSpacingMeters: Double get() = lastSpacingMeters ?: defaultSpacingMeters
    val usesLastSettings: Boolean get() = lastPointCount != null && lastSpacingMeters != null
}

private val Context.prefStore by preferencesDataStore("kestrel_prefs")

private object Keys {
    val LAST_CAM_LAT = doublePreferencesKey("last_cam_lat")
    val LAST_CAM_LNG = doublePreferencesKey("last_cam_lng")
    val LAST_CAM_ZOOM = doublePreferencesKey("last_cam_zoom")
    val FAVORITES = stringPreferencesKey("favorites_json")
    val LIBRARY_ROOM_MIGRATED = booleanPreferencesKey("library_room_migrated")
    val FAVORITES_SORT_MODE = stringPreferencesKey("favorites_sort_mode_json")
    val MOCK_STATE = stringPreferencesKey("mock_state_json")
    val STARTUP_PREF = stringPreferencesKey("startup_pref_json")
    val RANDOM_ROUTE_PREF = stringPreferencesKey("random_route_pref_json")
}

@Suppress("TooManyFunctions")
class KestrelPrefs(
    context: Context,
) {
    private val json = Json { ignoreUnknownKeys = true }
    private val store = context.applicationContext.prefStore

    val lastCamera: Flow<CameraSnapshot?> = store.data.map { it.toCamera() }
    @Deprecated("Library data now lives in Room; use LibraryRepository instead.")
    val favorites: Flow<List<Favorite>> = store.data.map { it.toFavorites(json) }
    val libraryRoomMigrated: Flow<Boolean> = store.data.map { it[Keys.LIBRARY_ROOM_MIGRATED] == true }
    val favoritesSortMode: Flow<FavoritesSortMode> = store.data.map { it.toFavoritesSortMode(json) }
    val mockState: Flow<MockState?> = store.data.map { it.toMockState(json) }
    val startupPreference: Flow<StartupPreference> = store.data.map { it.toStartupPref(json) }
    val randomRoutePreference: Flow<RandomRoutePreference> =
        store.data.map { it.toRandomRoutePref(json) }

    suspend fun setLastCamera(snap: CameraSnapshot) {
        store.edit {
            it[Keys.LAST_CAM_LAT] = snap.lat
            it[Keys.LAST_CAM_LNG] = snap.lng
            it[Keys.LAST_CAM_ZOOM] = snap.zoom
        }
    }

    @Deprecated("Library data now lives in Room; migration-only.")
    suspend fun addFavorite(fav: Favorite) {
        mutateFavorites { current ->
            current.filter { it.name != fav.name } + fav
        }
    }

    @Deprecated("Library data now lives in Room; migration-only.")
    suspend fun removeFavorite(name: String) {
        mutateFavorites { current -> current.filter { it.name != name } }
    }

    @Deprecated("Library data now lives in Room; migration-only.")
    suspend fun renameFavorite(
        oldName: String,
        newName: String,
    ) {
        if (oldName == newName) return
        store.edit { prefs ->
            val current = prefs.decodeFavorites()
            if (current.any { it.name == newName }) return@edit
            prefs[Keys.FAVORITES] =
                json.encodeToString(
                    favoritesSerializer,
                    current.map { if (it.name == oldName) it.copy(name = newName) else it },
                )
            val startup = prefs.toStartupPref(json)
            if (startup.mode == StartupPreference.Mode.Favorite && startup.favoriteName == oldName) {
                prefs[Keys.STARTUP_PREF] =
                    json.encodeToString(
                        StartupPreference.serializer(),
                        startup.copy(favoriteName = newName),
                    )
            }
        }
    }

    @Deprecated("Library data now lives in Room; migration-only.")
    suspend fun updateFavoritePoint(
        name: String,
        lat: Double,
        lng: Double,
    ) {
        mutateFavorites { current ->
            current.map { if (it.name == name) it.copy(lat = lat, lng = lng) else it }
        }
    }

    @Deprecated("Library data now lives in Room; migration-only.")
    suspend fun updateFavoriteRouteParams(
        name: String,
        speedKmh: Double,
        mode: String,
    ) {
        mutateFavorites { current ->
            current.map {
                if (it.name == name && it.route != null) {
                    it.copy(route = it.route.copy(speedKmh = speedKmh, mode = mode))
                } else {
                    it
                }
            }
        }
    }

    @Deprecated("Library data now lives in Room; migration-only.")
    suspend fun reorderFavorite(
        name: String,
        toIndex: Int,
    ) {
        mutateFavorites { current ->
            val from = current.indexOfFirst { it.name == name }
            if (from < 0) return@mutateFavorites current
            val clamped = toIndex.coerceIn(0, current.lastIndex)
            if (clamped == from) return@mutateFavorites current
            val moved = current.toMutableList()
            val item = moved.removeAt(from)
            moved.add(clamped, item)
            moved
        }
    }

    @Deprecated("Library data now lives in Room; migration-only.")
    suspend fun touchFavorite(name: String) {
        val now = System.currentTimeMillis()
        mutateFavorites { current ->
            current.map { if (it.name == name) it.copy(lastUsedAt = now) else it }
        }
    }

    suspend fun setLibraryRoomMigrated(migrated: Boolean) {
        store.edit { it[Keys.LIBRARY_ROOM_MIGRATED] = migrated }
    }

    suspend fun setFavoritesSortMode(mode: FavoritesSortMode.Mode) {
        store.edit {
            it[Keys.FAVORITES_SORT_MODE] =
                json.encodeToString(FavoritesSortMode.serializer(), FavoritesSortMode(mode))
        }
    }

    suspend fun setStartupPreference(pref: StartupPreference) {
        store.edit {
            it[Keys.STARTUP_PREF] = json.encodeToString(StartupPreference.serializer(), pref)
        }
    }

    suspend fun setRandomRouteDefaults(
        pointCount: Int,
        spacingMeters: Double,
    ) {
        store.edit { prefs ->
            val current = prefs.toRandomRoutePref(json)
            prefs[Keys.RANDOM_ROUTE_PREF] =
                json.encodeToString(
                    RandomRoutePreference.serializer(),
                    current.copy(
                        defaultPointCount = pointCount,
                        defaultSpacingMeters = spacingMeters,
                    ),
                )
        }
    }

    suspend fun setLastRandomRouteSettings(
        pointCount: Int,
        spacingMeters: Double,
    ) {
        store.edit { prefs ->
            val current = prefs.toRandomRoutePref(json)
            prefs[Keys.RANDOM_ROUTE_PREF] =
                json.encodeToString(
                    RandomRoutePreference.serializer(),
                    current.copy(
                        lastPointCount = pointCount,
                        lastSpacingMeters = spacingMeters,
                    ),
                )
        }
    }

    suspend fun resetRandomRoutePreference() {
        store.edit { it.remove(Keys.RANDOM_ROUTE_PREF) }
    }

    suspend fun setMockState(state: MockState?) {
        store.edit {
            if (state == null) {
                it.remove(Keys.MOCK_STATE)
            } else {
                it[Keys.MOCK_STATE] = json.encodeToString(MockState.serializer(), state)
            }
        }
    }

    private val favoritesSerializer = ListSerializer(Favorite.serializer())

    suspend fun libraryRoomMigratedValue(): Boolean = libraryRoomMigrated.first()

    @Suppress("DEPRECATION")
    suspend fun legacyFavoritesValue(): List<Favorite> = favorites.first()

    suspend fun startupPreferenceValue(): StartupPreference = startupPreference.first()

    private suspend fun mutateFavorites(transform: (List<Favorite>) -> List<Favorite>) {
        store.edit {
            val current = it.decodeFavorites()
            it[Keys.FAVORITES] = json.encodeToString(favoritesSerializer, transform(current))
        }
    }

    private fun MutablePreferences.decodeFavorites(): List<Favorite> {
        val raw = this[Keys.FAVORITES] ?: return emptyList()
        return runCatching {
            json.decodeFromString(favoritesSerializer, raw)
        }.getOrDefault(emptyList())
    }

    private fun Preferences.toCamera(): CameraSnapshot? {
        val lat = this[Keys.LAST_CAM_LAT] ?: return null
        val lng = this[Keys.LAST_CAM_LNG] ?: return null
        val zoom = this[Keys.LAST_CAM_ZOOM] ?: return null
        return CameraSnapshot(lat, lng, zoom)
    }

    private fun Preferences.toFavorites(json: Json): List<Favorite> {
        val raw = this[Keys.FAVORITES] ?: return emptyList()
        return runCatching {
            json.decodeFromString(favoritesSerializer, raw)
        }.getOrDefault(emptyList())
    }

    private fun Preferences.toFavoritesSortMode(json: Json): FavoritesSortMode {
        val raw = this[Keys.FAVORITES_SORT_MODE] ?: return FavoritesSortMode()
        return runCatching {
            json.decodeFromString(FavoritesSortMode.serializer(), raw)
        }.getOrDefault(FavoritesSortMode())
    }

    private fun Preferences.toMockState(json: Json): MockState? {
        val raw = this[Keys.MOCK_STATE] ?: return null
        return runCatching {
            json.decodeFromString(MockState.serializer(), raw)
        }.getOrNull()
    }

    private fun Preferences.toStartupPref(json: Json): StartupPreference {
        val raw = this[Keys.STARTUP_PREF] ?: return StartupPreference()
        return runCatching {
            json.decodeFromString(StartupPreference.serializer(), raw)
        }.getOrDefault(StartupPreference())
    }

    private fun Preferences.toRandomRoutePref(json: Json): RandomRoutePreference {
        val raw = this[Keys.RANDOM_ROUTE_PREF] ?: return RandomRoutePreference()
        return runCatching {
            json.decodeFromString(RandomRoutePreference.serializer(), raw)
        }.getOrDefault(RandomRoutePreference())
    }
}
