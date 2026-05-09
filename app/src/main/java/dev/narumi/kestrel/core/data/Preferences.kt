package dev.narumi.kestrel.core.data

import android.content.Context
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
data class CameraSnapshot(val lat: Double, val lng: Double, val zoom: Double)

@Serializable
data class Favorite(val name: String, val lat: Double, val lng: Double)

@Serializable
data class RouteState(
    val lats: DoubleArray,
    val lngs: DoubleArray,
    val speedKmh: Double,
)

@Serializable
data class SinglePointState(val lat: Double, val lng: Double)

@Serializable
data class MockState(
    val mode: Mode,
    val single: SinglePointState? = null,
    val route: RouteState? = null,
) {
    enum class Mode { Idle, Single, Route }
}

private val Context.prefStore by preferencesDataStore("kestrel_prefs")

private object Keys {
    val LAST_CAM_LAT = doublePreferencesKey("last_cam_lat")
    val LAST_CAM_LNG = doublePreferencesKey("last_cam_lng")
    val LAST_CAM_ZOOM = doublePreferencesKey("last_cam_zoom")
    val FAVORITES = stringPreferencesKey("favorites_json")
    val MOCK_STATE = stringPreferencesKey("mock_state_json")
}

class KestrelPrefs(context: Context) {
    private val json = Json { ignoreUnknownKeys = true }
    private val store = context.applicationContext.prefStore

    val lastCamera: Flow<CameraSnapshot?> = store.data.map { it.toCamera() }
    val favorites: Flow<List<Favorite>> = store.data.map { it.toFavorites(json) }
    val mockState: Flow<MockState?> = store.data.map { it.toMockState(json) }

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
            val current = it[Keys.FAVORITES]?.let { raw ->
                runCatching {
                    json.decodeFromString(favoritesSerializer, raw)
                }.getOrDefault(emptyList())
            } ?: emptyList()
            it[Keys.FAVORITES] = json.encodeToString(favoritesSerializer, transform(current))
        }
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

    private fun Preferences.toMockState(json: Json): MockState? {
        val raw = this[Keys.MOCK_STATE] ?: return null
        return runCatching {
            json.decodeFromString(MockState.serializer(), raw)
        }.getOrNull()
    }
}
