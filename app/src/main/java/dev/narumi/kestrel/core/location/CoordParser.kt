package dev.narumi.kestrel.core.location

private val PLAIN_PAIR = Regex("""(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)""")
private val MAPS_AT = Regex("""[/@](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|/|\?|$)""")
private val MAPS_QUERY = Regex("""[?&](?:q|ll|center|destination)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)""")

fun parseCoordInput(raw: String): LatLng? {
    val input = raw.trim()
    if (input.isEmpty()) return null
    val match =
        MAPS_QUERY.find(input)
            ?: MAPS_AT.find(input)
            ?: PLAIN_PAIR.matchEntire(input)
            ?: return null
    return match.groupValues.toLatLngOrNull()
}

private fun List<String>.toLatLngOrNull(): LatLng? {
    val lat = getOrNull(1)?.toDoubleOrNull()
    val lng = getOrNull(2)?.toDoubleOrNull()
    if (lat == null || lng == null) return null
    if (lat !in -90.0..90.0 || lng !in -180.0..180.0) return null
    return LatLng(lat, lng)
}
