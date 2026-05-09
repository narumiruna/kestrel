package dev.narumi.kestrel.core.location

import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

private const val EARTH_RADIUS_M = 6_371_000.0

fun haversineMeters(
    a: LatLng,
    b: LatLng,
): Double {
    val lat1 = Math.toRadians(a.lat)
    val lat2 = Math.toRadians(b.lat)
    val dLat = lat2 - lat1
    val dLng = Math.toRadians(b.lng - a.lng)
    val h =
        sin(dLat / 2) * sin(dLat / 2) +
            cos(lat1) * cos(lat2) * sin(dLng / 2) * sin(dLng / 2)
    return 2 * EARTH_RADIUS_M * asin(sqrt(h))
}

fun bearingDegrees(
    a: LatLng,
    b: LatLng,
): Double {
    val lat1 = Math.toRadians(a.lat)
    val lat2 = Math.toRadians(b.lat)
    val dLng = Math.toRadians(b.lng - a.lng)
    val y = sin(dLng) * cos(lat2)
    val x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLng)
    return (Math.toDegrees(atan2(y, x)) + 360.0) % 360.0
}

fun lerpLatLng(
    a: LatLng,
    b: LatLng,
    t: Double,
): LatLng =
    LatLng(
        lat = a.lat + (b.lat - a.lat) * t,
        lng = a.lng + (b.lng - a.lng) * t,
    )

fun destinationPoint(
    from: LatLng,
    bearingDeg: Double,
    distanceMeters: Double,
): LatLng {
    val angularDist = distanceMeters / EARTH_RADIUS_M
    val brng = Math.toRadians(bearingDeg)
    val lat1 = Math.toRadians(from.lat)
    val lng1 = Math.toRadians(from.lng)
    val lat2 = asin(sin(lat1) * cos(angularDist) + cos(lat1) * sin(angularDist) * cos(brng))
    val lng2 =
        lng1 +
            atan2(
                sin(brng) * sin(angularDist) * cos(lat1),
                cos(angularDist) - sin(lat1) * sin(lat2),
            )
    val normalizedLng = ((lng2 + 3 * PI) % (2 * PI)) - PI
    return LatLng(Math.toDegrees(lat2), Math.toDegrees(normalizedLng))
}
