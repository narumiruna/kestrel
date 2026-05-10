package dev.narumi.kestrel.core.location

data class MockSample(
    val point: LatLng,
    val speedMps: Double,
    val bearingDeg: Double,
)

class MovementEngine(
    waypoints: List<LatLng>,
    private val speedMps: Double,
    private val mode: Mode = Mode.Once,
) {
    enum class Mode { Once, Loop, PingPong }

    init {
        require(waypoints.size >= 2) { "MovementEngine requires at least 2 waypoints" }
        require(speedMps > 0) { "speed must be positive" }
    }

    private val segments: List<Segment> =
        buildList {
            for (i in 0 until waypoints.lastIndex) {
                val a = waypoints[i]
                val b = waypoints[i + 1]
                val len = haversineMeters(a, b)
                if (len > 0.0) add(Segment(a, b, len, bearingDegrees(a, b)))
            }
        }
    private val totalDistance: Double = segments.sumOf { it.length }
    private var progress: Double = 0.0
    private var forward: Boolean = true

    fun advance(deltaSeconds: Double): MockSample {
        if (totalDistance == 0.0) return sampleAt(0.0)
        val delta = speedMps * deltaSeconds
        when (mode) {
            Mode.Once -> {
                progress = (progress + delta).coerceIn(0.0, totalDistance)
            }
            Mode.Loop -> {
                var next = (progress + delta) % totalDistance
                if (next < 0) next += totalDistance
                progress = next
            }
            Mode.PingPong -> {
                var next = if (forward) progress + delta else progress - delta
                if (next > totalDistance) {
                    next = 2 * totalDistance - next
                    forward = false
                } else if (next < 0) {
                    next = -next
                    forward = true
                }
                progress = next
            }
        }
        return sampleAt(progress)
    }

    fun isFinished(): Boolean = mode == Mode.Once && progress >= totalDistance

    fun progressMeters(): Double = progress

    private fun sampleAt(meters: Double): MockSample {
        if (segments.isEmpty()) {
            return MockSample(point = LatLng(0.0, 0.0), speedMps = 0.0, bearingDeg = 0.0)
        }
        var remaining = meters
        for (segment in segments) {
            if (remaining <= segment.length) {
                val t = if (segment.length == 0.0) 0.0 else remaining / segment.length
                return MockSample(
                    point = lerpLatLng(segment.from, segment.to, t),
                    speedMps = if (isFinished()) 0.0 else speedMps,
                    bearingDeg = segment.bearing,
                )
            }
            remaining -= segment.length
        }
        val last = segments.last()
        return MockSample(point = last.to, speedMps = 0.0, bearingDeg = last.bearing)
    }

    private data class Segment(
        val from: LatLng,
        val to: LatLng,
        val length: Double,
        val bearing: Double,
    )
}
