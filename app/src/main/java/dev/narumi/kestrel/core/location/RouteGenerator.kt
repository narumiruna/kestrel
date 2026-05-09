package dev.narumi.kestrel.core.location

import kotlin.random.Random

object RouteGenerator {
    fun generate(
        start: LatLng,
        pointCount: Int,
        spacingMeters: Double,
        turnVarianceDeg: Double = 60.0,
        random: Random = Random.Default,
    ): List<LatLng> {
        require(pointCount >= 2) { "pointCount must be at least 2" }
        require(spacingMeters > 0) { "spacingMeters must be positive" }
        val points = ArrayList<LatLng>(pointCount)
        points += start
        var bearing = random.nextDouble(0.0, 360.0)
        var current = start
        repeat(pointCount - 1) {
            bearing = (bearing + random.nextDouble(-turnVarianceDeg, turnVarianceDeg)) % 360.0
            if (bearing < 0) bearing += 360.0
            current = destinationPoint(current, bearing, spacingMeters)
            points += current
        }
        return points
    }
}
