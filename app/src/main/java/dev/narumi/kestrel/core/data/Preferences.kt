package dev.narumi.kestrel.core.data

import android.content.Context
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.doublePreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
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
            lats.contentEquals(other.lats) && lngs.contentEquals(other.lngs) &&
            speedKmh == other.speedKmh && mode == other.mode

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
    val favoriteName: String? = null,
) {
    enum class Mode { Last, Current, Favorite }
}

private val Context.prefStore by preferencesDataStore("kestrel_prefs")

private object Keys {
    val LAST_CAM_LAT = doublePreferencesKey("last_cam_lat")
    val LAST_CAM_LNG = doublePreferencesKey("last_cam_lng")
    val LAST_CAM_ZOOM = doublePreferencesKey("last_cam_zoom")
    val FAVORITES = stringPreferencesKey("favorites_json")
    val FAVORITES_SORT_MODE = stringPreferencesKey("favorites_sort_mode_json")
    val MOCK_STATE = stringPreferencesKey("mock_state_json")
    val STARTUP_PREF = stringPreferencesKey("startup_pref_json")
}

class KestrelPrefs(
    context: Context,
) {
    private val json = Json { ignoreUnknownKeys = true }
    private val store = context.applicationContext.prefStore

    val lastCamera: Flow<CameraSnapshot?> = store.data.map { it.toCamera() }
    val favorites: Flow<List<Favorite>> = store.data.map { it.toFavorites(json) }
    val favoritesSortMode: Flow<FavoritesSortMode> = store.data.map { it.toFavoritesSortMode(json) }
    val mockState: Flow<MockState?> = store.data.map { it.toMockState(json) }
    val startupPreference: Flow<StartupPreference> = store.data.map { it.toStartupPref(json) }

    suspend fun setLastCamera(snap: CameraSnapshot) {
        store.edit {
            it[Keys.LAST_CAM_LAT] = snap.lat
            it[Keys.LAST_CAM_LNG] = snap.lng
            it[Keys.LAST_CAM_ZOOM] = snap.zoom
        }
    }

    suspend fun addFavorite(fav: Favorite) {
        mutateFavorites { current ->
            current.filter { it.name != fav.name } + fav
        }
    }

    suspend fun removeFavorite(name: String) {
        mutateFavorites { current -> current.filter { it.name != name } }
    }

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

    suspend fun updateFavoritePoint(
        name: String,
        lat: Double,
        lng: Double,
    ) {
        mutateFavorites { current ->
            current.map { if (it.name == name) it.copy(lat = lat, lng = lng) else it }
        }
    }

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

    suspend fun touchFavorite(name: String) {
        val now = System.currentTimeMillis()
        mutateFavorites { current ->
            current.map { if (it.name == name) it.copy(lastUsedAt = now) else it }
        }
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
}
