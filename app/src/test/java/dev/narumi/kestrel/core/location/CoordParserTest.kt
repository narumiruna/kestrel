package dev.narumi.kestrel.core.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CoordParserTest {
    @Test
    fun parsesCommaSeparated() {
        val r = parseCoordInput("25.0330, 121.5654")!!
        assertEquals(25.0330, r.lat, 1e-6)
        assertEquals(121.5654, r.lng, 1e-6)
    }

    @Test
    fun parsesSpaceSeparated() {
        val r = parseCoordInput("25.0330 121.5654")!!
        assertEquals(25.0330, r.lat, 1e-6)
        assertEquals(121.5654, r.lng, 1e-6)
    }

    @Test
    fun parsesNoSpaceAfterComma() {
        val r = parseCoordInput("25.0330,121.5654")!!
        assertEquals(25.0330, r.lat, 1e-6)
        assertEquals(121.5654, r.lng, 1e-6)
    }

    @Test
    fun parsesNegativeValues() {
        val r = parseCoordInput("-33.8688, 151.2093")!!
        assertEquals(-33.8688, r.lat, 1e-6)
        assertEquals(151.2093, r.lng, 1e-6)
    }

    @Test
    fun parsesIntegerCoords() {
        val r = parseCoordInput("0, 0")!!
        assertEquals(0.0, r.lat, 0.0)
        assertEquals(0.0, r.lng, 0.0)
    }

    @Test
    fun parsesGoogleMapsAtUrl() {
        val url = "https://www.google.com/maps/place/Taipei+101/@25.0330,121.5654,15z/data=!3m1"
        val r = parseCoordInput(url)!!
        assertEquals(25.0330, r.lat, 1e-6)
        assertEquals(121.5654, r.lng, 1e-6)
    }

    @Test
    fun parsesGoogleMapsQUrl() {
        val url = "https://www.google.com/maps/?q=25.0330,121.5654"
        val r = parseCoordInput(url)!!
        assertEquals(25.0330, r.lat, 1e-6)
        assertEquals(121.5654, r.lng, 1e-6)
    }

    @Test
    fun parsesGoogleMapsLlUrl() {
        val url = "https://maps.google.com/?ll=25.03,121.56&z=12"
        val r = parseCoordInput(url)!!
        assertEquals(25.03, r.lat, 1e-6)
        assertEquals(121.56, r.lng, 1e-6)
    }

    @Test
    fun parsesGoogleMapsQueryUrl() {
        val url = "https://www.google.com/maps/search/?api=1&query=25.0330%2C121.5654"
        val r = parseCoordInput(url)!!
        assertEquals(25.0330, r.lat, 1e-6)
        assertEquals(121.5654, r.lng, 1e-6)
    }

    @Test
    fun parsesGeoPairIntentUri() {
        val r = parseCoordInput("geo:25.0330,121.5654?z=15")!!
        assertEquals(25.0330, r.lat, 1e-6)
        assertEquals(121.5654, r.lng, 1e-6)
    }

    @Test
    fun parsesGeoQueryIntentUri() {
        val r = parseCoordInput("geo:0,0?q=25.0330,121.5654(Taipei 101)")!!
        assertEquals(25.0330, r.lat, 1e-6)
        assertEquals(121.5654, r.lng, 1e-6)
    }

    @Test
    fun geoQueryBeatsGeoPair() {
        val r = parseCoordInput("geo:0,0?q=25.0330,121.5654")!!
        assertEquals(25.0330, r.lat, 1e-6)
        assertEquals(121.5654, r.lng, 1e-6)
    }

    @Test
    fun trimsSurroundingWhitespace() {
        val r = parseCoordInput("   25.0330, 121.5654   ")!!
        assertEquals(25.0330, r.lat, 1e-6)
        assertEquals(121.5654, r.lng, 1e-6)
    }

    @Test
    fun rejectsEmpty() {
        assertNull(parseCoordInput(""))
        assertNull(parseCoordInput("   "))
    }

    @Test
    fun rejectsGarbage() {
        assertNull(parseCoordInput("hello world"))
        assertNull(parseCoordInput("25.0330"))
        assertNull(parseCoordInput("not, numbers"))
    }

    @Test
    fun rejectsLatOutOfRange() {
        assertNull(parseCoordInput("90.1, 0"))
        assertNull(parseCoordInput("-90.1, 0"))
    }

    @Test
    fun rejectsLngOutOfRange() {
        assertNull(parseCoordInput("0, 180.1"))
        assertNull(parseCoordInput("0, -180.1"))
    }

    @Test
    fun acceptsLatLngBoundaries() {
        assertEquals(LatLng(90.0, 180.0), parseCoordInput("90.0, 180.0"))
        assertEquals(LatLng(-90.0, -180.0), parseCoordInput("-90.0, -180.0"))
    }

    @Test
    fun rejectsTrailingGarbageOnPlainPair() {
        assertNull(parseCoordInput("25.03, 121.56 extra"))
    }

    @Test
    fun mapsAtBeatsPlainWhenUrlContainsBoth() {
        val url = "https://www.google.com/maps/place/X/@25.03,121.56,15z"
        val r = parseCoordInput(url)!!
        assertEquals(25.03, r.lat, 1e-6)
        assertEquals(121.56, r.lng, 1e-6)
    }
}
