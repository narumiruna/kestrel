package dev.narumi.kestrel.core.location

private const val NUMBER = """(-?\d+(?:\.\d+)?)"""
private const val URL_COMMA = """(?:,|%2C)"""

private val PLAIN_PAIR = Regex("""$NUMBER\s*[,\s]\s*$NUMBER""")
private val GEO_QUERY = Regex("""^geo:.*[?&]q=$NUMBER\s*$URL_COMMA\s*$NUMBER""", RegexOption.IGNORE_CASE)
private val GEO_PAIR = Regex("""^geo:$NUMBER\s*,\s*$NUMBER(?:[?,;].*)?$""", RegexOption.IGNORE_CASE)
private val MAPS_AT = Regex("""[/@]$NUMBER,$NUMBER(?:,|/|\?|$)""")
private val MAPS_QUERY =
    Regex(
        """[?&](?:q|query|ll|center|destination)=$NUMBER\s*$URL_COMMA\s*$NUMBER""",
        RegexOption.IGNORE_CASE,
    )

fun parseCoordInput(raw: String): LatLng? {
    val input = raw.trim()
    if (input.isEmpty()) return null
    val match =
        GEO_QUERY.find(input)
            ?: MAPS_QUERY.find(input)
            ?: GEO_PAIR.find(input)
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
