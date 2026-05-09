package dev.narumi.kestrel.core.library.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "waypoints",
    foreignKeys = [
        ForeignKey(
            entity = RouteRevisionEntity::class,
            parentColumns = ["id"],
            childColumns = ["route_revision_id"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index(value = ["route_revision_id", "sequence"])],
)
data class WaypointEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "route_revision_id") val routeRevisionId: String,
    val sequence: Int,
    val lat: Double,
    val lng: Double,
    @ColumnInfo(name = "speed_kmh") val speedKmh: Double? = null,
    @ColumnInfo(name = "pause_seconds") val pauseSeconds: Double? = null,
)
