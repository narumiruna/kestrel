package dev.narumi.kestrel.core.map

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import dev.narumi.kestrel.core.location.LatLng
import org.maplibre.android.MapLibre
import org.maplibre.android.WellKnownTileServer
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.geometry.LatLng as MlLatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point

private const val SOURCE_MARKER = "kestrel-marker"
private const val LAYER_MARKER = "kestrel-marker-layer"
private const val SOURCE_LINE = "kestrel-line"
private const val LAYER_LINE = "kestrel-line-layer"
private const val SOURCE_WAYPOINTS = "kestrel-waypoints"
private const val LAYER_WAYPOINTS = "kestrel-waypoints-layer"

@Composable
fun KestrelMap(
    modifier: Modifier = Modifier,
    initialCenter: LatLng = LatLng(25.0330, 121.5654),
    initialZoom: Double = 11.0,
    marker: LatLng? = null,
    polyline: List<LatLng> = emptyList(),
    onMapClick: (LatLng) -> Unit = {},
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    LaunchedEffect(Unit) {
        MapLibre.getInstance(context, null, WellKnownTileServer.MapLibre)
    }

    val mapView = remember { MapView(context) }
    var mapRef by remember { mutableStateOf<MapLibreMap?>(null) }
    var styleRef by remember { mutableStateOf<Style?>(null) }
    val clickHandler = remember(onMapClick) {
        MapLibreMap.OnMapClickListener { point ->
            onMapClick(LatLng(point.latitude, point.longitude))
            true
        }
    }

    DisposableEffect(lifecycleOwner) {
        mapView.onCreate(null)
        mapView.onStart()
        mapView.onResume()
        mapView.getMapAsync { map ->
            mapRef = map
            map.cameraPosition = CameraPosition.Builder()
                .target(MlLatLng(initialCenter.lat, initialCenter.lng))
                .zoom(initialZoom)
                .build()
            map.setStyle(Style.Builder().fromJson(OSM_RASTER_STYLE_JSON)) { style ->
                style.addSource(GeoJsonSource(SOURCE_LINE))
                style.addLayer(
                    LineLayer(LAYER_LINE, SOURCE_LINE).withProperties(
                        PropertyFactory.lineColor("#1976d2"),
                        PropertyFactory.lineWidth(4f),
                        PropertyFactory.lineOpacity(0.8f),
                    ),
                )
                style.addSource(GeoJsonSource(SOURCE_WAYPOINTS))
                style.addLayer(
                    CircleLayer(LAYER_WAYPOINTS, SOURCE_WAYPOINTS).withProperties(
                        PropertyFactory.circleRadius(5f),
                        PropertyFactory.circleColor("#1976d2"),
                        PropertyFactory.circleStrokeColor("#ffffff"),
                        PropertyFactory.circleStrokeWidth(1.5f),
                    ),
                )
                style.addSource(GeoJsonSource(SOURCE_MARKER))
                style.addLayer(
                    CircleLayer(LAYER_MARKER, SOURCE_MARKER).withProperties(
                        PropertyFactory.circleRadius(9f),
                        PropertyFactory.circleColor("#d32f2f"),
                        PropertyFactory.circleStrokeColor("#ffffff"),
                        PropertyFactory.circleStrokeWidth(2f),
                    ),
                )
                styleRef = style
            }
            map.addOnMapClickListener(clickHandler)
        }
        val observer = LifecycleEventObserver { _, event ->
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
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapView.onPause()
            mapView.onStop()
            mapView.onDestroy()
            mapRef = null
            styleRef = null
        }
    }

    LaunchedEffect(marker, styleRef) {
        val style = styleRef ?: return@LaunchedEffect
        val source = style.getSourceAs<GeoJsonSource>(SOURCE_MARKER) ?: return@LaunchedEffect
        if (marker == null) {
            source.setGeoJson(null as Feature?)
        } else {
            source.setGeoJson(Point.fromLngLat(marker.lng, marker.lat))
        }
    }

    LaunchedEffect(polyline, styleRef) {
        val style = styleRef ?: return@LaunchedEffect
        val lineSource = style.getSourceAs<GeoJsonSource>(SOURCE_LINE)
        val pointsSource = style.getSourceAs<GeoJsonSource>(SOURCE_WAYPOINTS)
        if (polyline.size < 2) {
            lineSource?.setGeoJson(null as Feature?)
        } else {
            lineSource?.setGeoJson(
                LineString.fromLngLats(polyline.map { Point.fromLngLat(it.lng, it.lat) }),
            )
        }
        if (polyline.isEmpty()) {
            pointsSource?.setGeoJson(null as Feature?)
        } else {
            val features = polyline.map {
                Feature.fromGeometry(Point.fromLngLat(it.lng, it.lat))
            }
            pointsSource?.setGeoJson(
                org.maplibre.geojson.FeatureCollection.fromFeatures(features),
            )
        }
    }

    AndroidView(modifier = modifier, factory = { mapView })
}
