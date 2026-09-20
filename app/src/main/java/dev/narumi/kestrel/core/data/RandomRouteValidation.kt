package dev.narumi.kestrel.core.data

internal fun isValidPointCount(value: Int?): Boolean = value != null && value in RandomRoutePreference.MIN_POINT_COUNT..RandomRoutePreference.MAX_POINT_COUNT

internal fun isValidSpacing(value: Double?): Boolean =
    value != null &&
        value >= RandomRoutePreference.MIN_SPACING_METERS &&
        value <= RandomRoutePreference.MAX_SPACING_METERS

internal fun isValidRandomRoute(
    pointCount: Int?,
    spacingMeters: Double?,
): Boolean = isValidPointCount(pointCount) && isValidSpacing(spacingMeters)
