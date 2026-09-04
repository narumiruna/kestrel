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
    initialProgressMeters: Double = 0.0,
    initialForward: Boolean = true,
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
    private val segmentEnds: DoubleArray =
        DoubleArray(segments.size).also { ends ->
            var distance = 0.0
            segments.forEachIndexed { index, segment ->
                distance += segment.length
                ends[index] = distance
            }
        }
    private val totalDistance: Double = segmentEnds.lastOrNull() ?: 0.0

    // Seeded from persisted state so that a service restart resumes near where the previous run
    // stopped, instead of from the first waypoint. Clamped into [0, totalDistance] to keep corrupt
    // or stale snapshots from producing out-of-range progress.
    private var progress: Double = initialProgressMeters.coerceIn(0.0, totalDistance)

    // PingPong only; Once/Loop ignore this. Defaults to forward so old persisted payloads (which
    // never stored direction) resume in the natural reading direction.
    private var forward: Boolean = initialForward

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

    fun isForward(): Boolean = forward

    private fun sampleAt(meters: Double): MockSample {
        if (segments.isEmpty()) {
            return MockSample(point = LatLng(0.0, 0.0), speedMps = 0.0, bearingDeg = 0.0)
        }
        val segmentIndex = segmentIndexAt(meters)
        val segment = segments[segmentIndex]
        val segmentStart = if (segmentIndex == 0) 0.0 else segmentEnds[segmentIndex - 1]
        val offset = (meters - segmentStart).coerceIn(0.0, segment.length)
        return MockSample(
            point = lerpLatLng(segment.from, segment.to, offset / segment.length),
            speedMps = if (isFinished()) 0.0 else speedMps,
            bearingDeg = segment.bearing,
        )
    }

    private fun segmentIndexAt(meters: Double): Int {
        var low = 0
        var high = segmentEnds.lastIndex
        while (low < high) {
            val middle = (low + high) ushr 1
            if (segmentEnds[middle] < meters) {
                low = middle + 1
            } else {
                high = middle
            }
        }
        return low
    }

    private data class Segment(
        val from: LatLng,
        val to: LatLng,
        val length: Double,
        val bearing: Double,
    )
}
