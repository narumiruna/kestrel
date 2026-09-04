package dev.narumi.kestrel.core.map

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import dev.narumi.kestrel.core.data.CameraSnapshot
import dev.narumi.kestrel.core.location.LatLng
import org.maplibre.android.MapLibre
import org.maplibre.android.WellKnownTileServer
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point
import org.maplibre.android.geometry.LatLng as MlLatLng

private val EMPTY_FEATURES = FeatureCollection.fromFeatures(emptyList<Feature>())

private const val SOURCE_MOCK = "kestrel-mock"
private const val LAYER_MOCK = "kestrel-mock-layer"
private const val LAYER_MOCK_HALO = "kestrel-mock-halo-layer"
private const val SOURCE_LINE = "kestrel-line"
private const val LAYER_LINE = "kestrel-line-layer"
private const val SOURCE_WAYPOINTS = "kestrel-waypoints"
private const val LAYER_WAYPOINTS = "kestrel-waypoints-layer"
private const val SOURCE_PREVIEW_LINE = "kestrel-preview-line"
private const val LAYER_PREVIEW_LINE = "kestrel-preview-line-layer"
private const val SOURCE_PREVIEW_WAYPOINTS = "kestrel-preview-waypoints"
private const val LAYER_PREVIEW_WAYPOINTS = "kestrel-preview-waypoints-layer"
private const val SOURCE_PREVIEW_POINT = "kestrel-preview-point"
private const val LAYER_PREVIEW_POINT = "kestrel-preview-point-layer"
private const val SOURCE_ME = "kestrel-me"
private const val LAYER_ME_HALO = "kestrel-me-halo-layer"
private const val LAYER_ME = "kestrel-me-layer"

private data class MapColors(
    val primary: Int,
    val preview: Int,
    val mock: Int,
    val onPrimary: Int,
)

private data class MapListeners(
    val click: MapLibreMap.OnMapClickListener,
    val longClick: MapLibreMap.OnMapLongClickListener,
)

@Composable
fun KestrelMap(
    modifier: Modifier = Modifier,
    initialCenter: LatLng = LatLng(25.0330, 121.5654),
    initialZoom: Double = 11.0,
    mockLocation: LatLng? = null,
    currentRoute: List<LatLng> = emptyList(),
    previewRoute: List<LatLng> = emptyList(),
    previewPoint: LatLng? = null,
    myLocation: LatLng? = null,
    cameraTarget: CameraSnapshot? = null,
    onMapClick: (LatLng) -> Unit = {},
    onMapLongClick: (LatLng) -> Unit = {},
    onCameraIdle: (CameraSnapshot) -> Unit = {},
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val currentMapClick by rememberUpdatedState(onMapClick)
    val currentMapLongClick by rememberUpdatedState(onMapLongClick)
    val currentCameraIdle by rememberUpdatedState(onCameraIdle)
    val colorScheme = MaterialTheme.colorScheme
    val colors =
        remember(colorScheme) {
            MapColors(
                primary = colorScheme.primary.toArgb(),
                preview = colorScheme.tertiary.toArgb(),
                mock = colorScheme.error.toArgb(),
                onPrimary = colorScheme.onPrimary.toArgb(),
            )
        }
    val mapView =
        remember {
            MapLibre.getInstance(context, null, WellKnownTileServer.MapLibre)
            MapView(context)
        }
    val listeners =
        remember {
            MapListeners(
                click =
                    MapLibreMap.OnMapClickListener { point ->
                        currentMapClick(LatLng(point.latitude, point.longitude))
                        true
                    },
                longClick =
                    MapLibreMap.OnMapLongClickListener { point ->
                        currentMapLongClick(LatLng(point.latitude, point.longitude))
                        true
                    },
            )
        }
    var mapRef by remember { mutableStateOf<MapLibreMap?>(null) }
    var styleRef by remember { mutableStateOf<Style?>(null) }

    BindMapLifecycle(
        mapView = mapView,
        lifecycle = lifecycleOwner.lifecycle,
        initialCenter = initialCenter,
        initialZoom = initialZoom,
        colors = colors,
        listeners = listeners,
        onCameraIdle = { currentCameraIdle(it) },
        onMapReady = { mapRef = it },
        onStyleReady = { styleRef = it },
        onDisposeMap = {
            mapRef = null
            styleRef = null
        },
    )
    UpdatePointSource(styleRef, SOURCE_MOCK, mockLocation)
    UpdatePointSource(styleRef, SOURCE_PREVIEW_POINT, previewPoint)
    UpdatePointSource(styleRef, SOURCE_ME, myLocation)
    UpdateCamera(mapRef, cameraTarget)
    UpdateRoute(styleRef, currentRoute, SOURCE_LINE, SOURCE_WAYPOINTS)
    UpdateRoute(styleRef, previewRoute, SOURCE_PREVIEW_LINE, SOURCE_PREVIEW_WAYPOINTS)

    AndroidView(modifier = modifier, factory = { mapView })
}

@Composable
private fun BindMapLifecycle(
    mapView: MapView,
    lifecycle: Lifecycle,
    initialCenter: LatLng,
    initialZoom: Double,
    colors: MapColors,
    listeners: MapListeners,
    onCameraIdle: (CameraSnapshot) -> Unit,
    onMapReady: (MapLibreMap) -> Unit,
    onStyleReady: (Style) -> Unit,
    onDisposeMap: () -> Unit,
) {
    DisposableEffect(lifecycle) {
        var map: MapLibreMap? = null
        var cameraListener: MapLibreMap.OnCameraIdleListener? = null
        mapView.onCreate(null)
        mapView.onStart()
        mapView.onResume()
        mapView.getMapAsync { readyMap ->
            map = readyMap
            onMapReady(readyMap)
            initializeMap(readyMap, initialCenter, initialZoom, colors, onStyleReady)
            readyMap.addOnMapClickListener(listeners.click)
            readyMap.addOnMapLongClickListener(listeners.longClick)
            val readyCameraListener = createCameraListener(readyMap, onCameraIdle)
            cameraListener = readyCameraListener
            readyMap.addOnCameraIdleListener(readyCameraListener)
        }
        val observer = createLifecycleObserver(mapView)
        lifecycle.addObserver(observer)
        onDispose {
            map?.removeOnMapClickListener(listeners.click)
            map?.removeOnMapLongClickListener(listeners.longClick)
            cameraListener?.let { map?.removeOnCameraIdleListener(it) }
            lifecycle.removeObserver(observer)
            mapView.onPause()
            mapView.onStop()
            mapView.onDestroy()
            onDisposeMap()
        }
    }
}

private fun initializeMap(
    map: MapLibreMap,
    initialCenter: LatLng,
    initialZoom: Double,
    colors: MapColors,
    onStyleReady: (Style) -> Unit,
) {
    map.cameraPosition =
        CameraPosition
            .Builder()
            .target(MlLatLng(initialCenter.lat, initialCenter.lng))
            .zoom(initialZoom)
            .build()
    map.setStyle(Style.Builder().fromJson(OSM_RASTER_STYLE_JSON)) { style ->
        addRouteLayers(style, colors)
        addPreviewLayers(style, colors)
        addMockLayers(style, colors)
        addMyLocationLayers(style, colors)
        onStyleReady(style)
    }
}

private fun addRouteLayers(
    style: Style,
    colors: MapColors,
) {
    style.addSource(GeoJsonSource(SOURCE_LINE))
    style.addLayer(
        LineLayer(LAYER_LINE, SOURCE_LINE).withProperties(
            PropertyFactory.lineColor(colors.primary),
            PropertyFactory.lineWidth(4f),
            PropertyFactory.lineOpacity(0.85f),
        ),
    )
    style.addSource(GeoJsonSource(SOURCE_WAYPOINTS))
    style.addLayer(
        CircleLayer(LAYER_WAYPOINTS, SOURCE_WAYPOINTS).withProperties(
            PropertyFactory.circleRadius(5f),
            PropertyFactory.circleColor(colors.primary),
            PropertyFactory.circleStrokeColor(colors.onPrimary),
            PropertyFactory.circleStrokeWidth(1.5f),
        ),
    )
}

private fun addPreviewLayers(
    style: Style,
    colors: MapColors,
) {
    style.addSource(GeoJsonSource(SOURCE_PREVIEW_LINE))
    style.addLayer(
        LineLayer(LAYER_PREVIEW_LINE, SOURCE_PREVIEW_LINE).withProperties(
            PropertyFactory.lineColor(colors.preview),
            PropertyFactory.lineWidth(5f),
            PropertyFactory.lineOpacity(0.92f),
            PropertyFactory.lineDasharray(arrayOf(1.5f, 1.5f)),
        ),
    )
    style.addSource(GeoJsonSource(SOURCE_PREVIEW_WAYPOINTS))
    style.addLayer(
        CircleLayer(LAYER_PREVIEW_WAYPOINTS, SOURCE_PREVIEW_WAYPOINTS).withProperties(
            PropertyFactory.circleRadius(6f),
            PropertyFactory.circleColor(colors.preview),
            PropertyFactory.circleStrokeColor(colors.onPrimary),
            PropertyFactory.circleStrokeWidth(2f),
        ),
    )
    style.addSource(GeoJsonSource(SOURCE_PREVIEW_POINT))
    style.addLayer(
        CircleLayer(LAYER_PREVIEW_POINT, SOURCE_PREVIEW_POINT).withProperties(
            PropertyFactory.circleRadius(10f),
            PropertyFactory.circleColor(colors.preview),
            PropertyFactory.circleStrokeColor(colors.onPrimary),
            PropertyFactory.circleStrokeWidth(3f),
        ),
    )
}

private fun addMockLayers(
    style: Style,
    colors: MapColors,
) {
    style.addSource(GeoJsonSource(SOURCE_MOCK))
    style.addLayer(
        CircleLayer(LAYER_MOCK_HALO, SOURCE_MOCK).withProperties(
            PropertyFactory.circleRadius(22f),
            PropertyFactory.circleColor(colors.mock),
            PropertyFactory.circleOpacity(0.18f),
        ),
    )
    style.addLayer(
        CircleLayer(LAYER_MOCK, SOURCE_MOCK).withProperties(
            PropertyFactory.circleRadius(9f),
            PropertyFactory.circleColor(colors.mock),
            PropertyFactory.circleStrokeColor(colors.onPrimary),
            PropertyFactory.circleStrokeWidth(2f),
        ),
    )
}

private fun addMyLocationLayers(
    style: Style,
    colors: MapColors,
) {
    style.addSource(GeoJsonSource(SOURCE_ME))
    style.addLayer(
        CircleLayer(LAYER_ME_HALO, SOURCE_ME).withProperties(
            PropertyFactory.circleRadius(18f),
            PropertyFactory.circleColor(colors.primary),
            PropertyFactory.circleOpacity(0.18f),
        ),
    )
    style.addLayer(
        CircleLayer(LAYER_ME, SOURCE_ME).withProperties(
            PropertyFactory.circleRadius(7f),
            PropertyFactory.circleColor(colors.primary),
            PropertyFactory.circleStrokeColor(colors.onPrimary),
            PropertyFactory.circleStrokeWidth(2f),
        ),
    )
}

private fun createCameraListener(
    map: MapLibreMap,
    onCameraIdle: (CameraSnapshot) -> Unit,
) = MapLibreMap.OnCameraIdleListener {
    val position = map.cameraPosition
    onCameraIdle(
        CameraSnapshot(
            position.target?.latitude ?: 0.0,
            position.target?.longitude ?: 0.0,
            position.zoom,
        ),
    )
}

private fun createLifecycleObserver(mapView: MapView) =
    LifecycleEventObserver { _, event ->
        when (event) {
            Lifecycle.Event.ON_PAUSE -> mapView.onPause()
            Lifecycle.Event.ON_STOP -> mapView.onStop()
            Lifecycle.Event.ON_RESUME -> mapView.onResume()
            Lifecycle.Event.ON_START -> mapView.onStart()
            else -> Unit
        }
    }

@Composable
private fun UpdatePointSource(
    style: Style?,
    sourceId: String,
    location: LatLng?,
) {
    LaunchedEffect(location, style) {
        val source = style?.getSourceAs<GeoJsonSource>(sourceId) ?: return@LaunchedEffect
        if (location == null) {
            source.setGeoJson(EMPTY_FEATURES)
        } else {
            source.setGeoJson(Point.fromLngLat(location.lng, location.lat))
        }
    }
}

@Composable
private fun UpdateCamera(
    map: MapLibreMap?,
    target: CameraSnapshot?,
) {
    LaunchedEffect(target, map) {
        if (map == null || target == null) return@LaunchedEffect
        map.animateCamera(
            CameraUpdateFactory.newLatLngZoom(MlLatLng(target.lat, target.lng), target.zoom),
        )
    }
}

@Composable
private fun UpdateRoute(
    style: Style?,
    polyline: List<LatLng>,
    lineSourceId: String,
    pointsSourceId: String,
) {
    LaunchedEffect(polyline, style, lineSourceId, pointsSourceId) {
        val lineSource = style?.getSourceAs<GeoJsonSource>(lineSourceId)
        val pointsSource = style?.getSourceAs<GeoJsonSource>(pointsSourceId)
        if (polyline.size < 2) {
            lineSource?.setGeoJson(EMPTY_FEATURES)
        } else {
            lineSource?.setGeoJson(
                LineString.fromLngLats(polyline.map { Point.fromLngLat(it.lng, it.lat) }),
            )
        }
        if (polyline.isEmpty()) {
            pointsSource?.setGeoJson(EMPTY_FEATURES)
        } else {
            pointsSource?.setGeoJson(
                FeatureCollection.fromFeatures(
                    polyline.map { Feature.fromGeometry(Point.fromLngLat(it.lng, it.lat)) },
                ),
            )
        }
    }
}
