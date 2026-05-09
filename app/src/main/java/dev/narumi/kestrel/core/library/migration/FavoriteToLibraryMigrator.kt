package dev.narumi.kestrel.core.library.migration

import dev.narumi.kestrel.core.data.Favorite
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.library.LibraryItemKind
import dev.narumi.kestrel.core.library.db.LibraryItemEntity
import dev.narumi.kestrel.core.library.db.PlaceEntity
import dev.narumi.kestrel.core.library.db.RouteEntity
import dev.narumi.kestrel.core.library.db.RouteRevisionEntity
import dev.narumi.kestrel.core.library.db.WaypointEntity
import java.util.UUID

object FavoriteToLibraryMigrator {
    fun migrate(
        favorites: List<Favorite>,
        startupPreference: StartupPreference,
        uuidFactory: () -> String = { UUID.randomUUID().toString() },
        nowProvider: () -> Long = { System.currentTimeMillis() },
    ): FavoriteMigrationResult {
        var startupLibraryItemId = startupPreference.libraryItemId
        val rows =
            favorites.mapIndexed { index, favorite ->
                val migrated = migrateFavorite(favorite, index, uuidFactory, nowProvider)
                if (startupLibraryItemId == null && favorite.name == startupPreference.favoriteName) {
                    startupLibraryItemId = migrated.libraryItem.id
                }
                migrated
            }
        return FavoriteMigrationResult(rows = rows, startupLibraryItemId = startupLibraryItemId)
    }

    private fun migrateFavorite(
        favorite: Favorite,
        sortOrder: Int,
        uuidFactory: () -> String,
        nowProvider: () -> Long,
    ): MigratedFavoriteRows {
        val timestamps = favorite.lastUsedAt ?: nowProvider()
        val itemId = uuidFactory()
        val route = favorite.route
        return if (route == null) {
            val placeId = uuidFactory()
            MigratedFavoriteRows(
                place =
                    PlaceEntity(
                        id = placeId,
                        name = favorite.name,
                        lat = favorite.lat,
                        lng = favorite.lng,
                        createdAt = timestamps,
                        updatedAt = timestamps,
                    ),
                libraryItem =
                    LibraryItemEntity(
                        id = itemId,
                        kind = LibraryItemKind.Place,
                        placeId = placeId,
                        sortOrder = sortOrder,
                        lastUsedAt = favorite.lastUsedAt,
                        createdAt = timestamps,
                        updatedAt = timestamps,
                    ),
            )
        } else {
            val routeId = uuidFactory()
            val revisionId = uuidFactory()
            require(route.lats.size == route.lngs.size) {
                "Favorite route waypoint arrays must have the same length for ${favorite.name}"
            }
            val waypoints =
                route.lats.indices
                    .map { index ->
                        WaypointEntity(
                            id = uuidFactory(),
                            routeRevisionId = revisionId,
                            sequence = index,
                            lat = route.lats[index],
                            lng = route.lngs[index],
                        )
                    }
            MigratedFavoriteRows(
                route =
                    RouteEntity(
                        id = routeId,
                        name = favorite.name,
                        defaultSpeedKmh = route.speedKmh,
                        mode = route.mode,
                        currentRevisionId = revisionId,
                        createdAt = timestamps,
                        updatedAt = timestamps,
                    ),
                routeRevision =
                    RouteRevisionEntity(
                        id = revisionId,
                        routeId = routeId,
                        revisionNumber = 1,
                        createdAt = timestamps,
                    ),
                waypoints = waypoints,
                libraryItem =
                    LibraryItemEntity(
                        id = itemId,
                        kind = LibraryItemKind.Route,
                        routeId = routeId,
                        sortOrder = sortOrder,
                        lastUsedAt = favorite.lastUsedAt,
                        createdAt = timestamps,
                        updatedAt = timestamps,
                    ),
            )
        }
    }
}

data class FavoriteMigrationResult(
    val rows: List<MigratedFavoriteRows>,
    val startupLibraryItemId: String? = null,
)

data class MigratedFavoriteRows(
    val place: PlaceEntity? = null,
    val route: RouteEntity? = null,
    val routeRevision: RouteRevisionEntity? = null,
    val waypoints: List<WaypointEntity> = emptyList(),
    val libraryItem: LibraryItemEntity,
)
