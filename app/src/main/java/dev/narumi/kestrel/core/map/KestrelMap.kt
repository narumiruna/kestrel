package dev.narumi.kestrel.core.map

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
private const val SOURCE_ME = "kestrel-me"
private const val LAYER_ME_HALO = "kestrel-me-halo-layer"
private const val LAYER_ME = "kestrel-me-layer"

@Composable
fun KestrelMap(
    modifier: Modifier = Modifier,
    initialCenter: LatLng = LatLng(25.0330, 121.5654),
    initialZoom: Double = 11.0,
    mockLocation: LatLng? = null,
    polyline: List<LatLng> = emptyList(),
    myLocation: LatLng? = null,
    cameraTarget: CameraSnapshot? = null,
    onMapClick: (LatLng) -> Unit = {},
    onMapLongClick: (LatLng) -> Unit = {},
    onCameraIdle: (CameraSnapshot) -> Unit = {},
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val primaryArgb = MaterialTheme.colorScheme.primary.toArgb()
    val mockArgb = MaterialTheme.colorScheme.error.toArgb()
    val onPrimaryArgb = MaterialTheme.colorScheme.onPrimary.toArgb()

    val mapView =
        remember {
            MapLibre.getInstance(context, null, WellKnownTileServer.MapLibre)
            MapView(context)
        }
    var mapRef by remember { mutableStateOf<MapLibreMap?>(null) }
    var styleRef by remember { mutableStateOf<Style?>(null) }
    val clickHandler =
        remember(onMapClick) {
            MapLibreMap.OnMapClickListener { point ->
                onMapClick(LatLng(point.latitude, point.longitude))
                true
            }
        }
    val longClickHandler =
        remember(onMapLongClick) {
            MapLibreMap.OnMapLongClickListener { point ->
                onMapLongClick(LatLng(point.latitude, point.longitude))
                true
            }
        }

    DisposableEffect(lifecycleOwner) {
        mapView.onCreate(null)
        mapView.onStart()
        mapView.onResume()
        mapView.getMapAsync { map ->
            mapRef = map
            map.cameraPosition =
                CameraPosition
                    .Builder()
                    .target(MlLatLng(initialCenter.lat, initialCenter.lng))
                    .zoom(initialZoom)
                    .build()
            map.setStyle(Style.Builder().fromJson(OSM_RASTER_STYLE_JSON)) { style ->
                style.addSource(GeoJsonSource(SOURCE_LINE))
                style.addLayer(
                    LineLayer(LAYER_LINE, SOURCE_LINE).withProperties(
                        PropertyFactory.lineColor(primaryArgb),
                        PropertyFactory.lineWidth(4f),
                        PropertyFactory.lineOpacity(0.85f),
                    ),
                )
                style.addSource(GeoJsonSource(SOURCE_WAYPOINTS))
                style.addLayer(
                    CircleLayer(LAYER_WAYPOINTS, SOURCE_WAYPOINTS).withProperties(
                        PropertyFactory.circleRadius(5f),
                        PropertyFactory.circleColor(primaryArgb),
                        PropertyFactory.circleStrokeColor(onPrimaryArgb),
                        PropertyFactory.circleStrokeWidth(1.5f),
                    ),
                )
                style.addSource(GeoJsonSource(SOURCE_MOCK))
                style.addLayer(
                    CircleLayer(LAYER_MOCK_HALO, SOURCE_MOCK).withProperties(
                        PropertyFactory.circleRadius(22f),
                        PropertyFactory.circleColor(mockArgb),
                        PropertyFactory.circleOpacity(0.18f),
                    ),
                )
                style.addLayer(
                    CircleLayer(LAYER_MOCK, SOURCE_MOCK).withProperties(
                        PropertyFactory.circleRadius(9f),
                        PropertyFactory.circleColor(mockArgb),
                        PropertyFactory.circleStrokeColor(onPrimaryArgb),
                        PropertyFactory.circleStrokeWidth(2f),
                    ),
                )
                style.addSource(GeoJsonSource(SOURCE_ME))
                style.addLayer(
                    CircleLayer(LAYER_ME_HALO, SOURCE_ME).withProperties(
                        PropertyFactory.circleRadius(18f),
                        PropertyFactory.circleColor(primaryArgb),
                        PropertyFactory.circleOpacity(0.18f),
                    ),
                )
                style.addLayer(
                    CircleLayer(LAYER_ME, SOURCE_ME).withProperties(
                        PropertyFactory.circleRadius(7f),
                        PropertyFactory.circleColor(primaryArgb),
                        PropertyFactory.circleStrokeColor(onPrimaryArgb),
                        PropertyFactory.circleStrokeWidth(2f),
                    ),
                )
                styleRef = style
            }
            map.addOnMapClickListener(clickHandler)
            map.addOnMapLongClickListener(longClickHandler)
            map.addOnCameraIdleListener {
                val pos = map.cameraPosition
                onCameraIdle(
                    CameraSnapshot(pos.target?.latitude ?: 0.0, pos.target?.longitude ?: 0.0, pos.zoom),
                )
            }
        }
        val observer =
            LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                    Lifecycle.Event.ON_STOP -> mapView.onStop()
                    Lifecycle.Event.ON_RESUME -> mapView.onResume()
                    Lifecycle.Event.ON_START -> mapView.onStart()
                    else -> Unit
                }
            }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            mapRef?.removeOnMapClickListener(clickHandler)
            mapRef?.removeOnMapLongClickListener(longClickHandler)
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapView.onPause()
            mapView.onStop()
            mapView.onDestroy()
            mapRef = null
            styleRef = null
        }
    }

    LaunchedEffect(mockLocation, styleRef) {
        val style = styleRef ?: return@LaunchedEffect
        val source = style.getSourceAs<GeoJsonSource>(SOURCE_MOCK) ?: return@LaunchedEffect
        if (mockLocation == null) {
            source.setGeoJson(EMPTY_FEATURES)
        } else {
            source.setGeoJson(Point.fromLngLat(mockLocation.lng, mockLocation.lat))
        }
    }

    LaunchedEffect(myLocation, styleRef) {
        val style = styleRef ?: return@LaunchedEffect
        val source = style.getSourceAs<GeoJsonSource>(SOURCE_ME) ?: return@LaunchedEffect
        if (myLocation == null) {
            source.setGeoJson(EMPTY_FEATURES)
        } else {
            source.setGeoJson(Point.fromLngLat(myLocation.lng, myLocation.lat))
        }
    }

    LaunchedEffect(cameraTarget, mapRef) {
        val map = mapRef ?: return@LaunchedEffect
        val target = cameraTarget ?: return@LaunchedEffect
        map.animateCamera(
            CameraUpdateFactory.newLatLngZoom(MlLatLng(target.lat, target.lng), target.zoom),
        )
    }

    LaunchedEffect(polyline, styleRef) {
        val style = styleRef ?: return@LaunchedEffect
        val lineSource = style.getSourceAs<GeoJsonSource>(SOURCE_LINE)
        val pointsSource = style.getSourceAs<GeoJsonSource>(SOURCE_WAYPOINTS)
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
            val features =
                polyline.map {
                    Feature.fromGeometry(Point.fromLngLat(it.lng, it.lat))
                }
            pointsSource?.setGeoJson(FeatureCollection.fromFeatures(features))
        }
    }

    AndroidView(modifier = modifier, factory = { mapView })
}
