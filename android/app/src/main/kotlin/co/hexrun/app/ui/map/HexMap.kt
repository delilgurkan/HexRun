package co.hexrun.app.ui.map

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.PointF
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import co.hexrun.app.BuildConfig
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.HexColors
import co.hexrun.core.api.Bbox
import co.hexrun.core.api.MapCell
import co.hexrun.core.api.MapPlayer
import co.hexrun.core.cells.Cells
import co.hexrun.core.colors.Palette
import co.hexrun.core.colors.Slot
import co.hexrun.core.geo.Geo
import co.hexrun.core.geo.LatLng
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point
import org.maplibre.geojson.Polygon
import kotlin.math.PI
import kotlin.math.sin
import org.maplibre.android.geometry.LatLng as MLatLng

/** Haritaya çizilecek her şey (görüntüleyene göre renkler sunucudan `slot` olarak gelir). */
data class MapLayers(
    val cells: List<MapCell> = emptyList(),
    val players: List<MapPlayer> = emptyList(),
    val myId: String? = null,
    val attackers: Int = 0,
    /** Çevrimdışı: son bilinen harita soluk. */
    val faded: Boolean = false,
    /** İlk halka önerisi (kesikli). */
    val suggestion: List<LatLng>? = null,
    /** Koşu izi. */
    val trace: List<LatLng>? = null,
    val start: LatLng? = null,
    val captureRadiusM: Double = 50.0,
    /** Kapanış modunda taralı önizleme. */
    val previewRing: List<LatLng>? = null,
    /** Seçili bölge. */
    val highlight: List<String> = emptyList(),
    /** Düello seçimi. */
    val selection: List<String> = emptyList(),
    val selectionSlot: Slot? = null,
    /** Düello rotası. */
    val route: List<LatLng>? = null,
    val showPlayers: Boolean = true,
)

/** Kamera ve dönüşüm işlemleri (ekrandan bağımsız). */
@Stable
class HexMapState {
    internal var controller: HexMapController? = null

    fun flyTo(p: LatLng, zoom: Double? = null, durationMs: Int = 600) = controller?.flyTo(p, zoom, durationMs)
    fun easeTo(p: LatLng, durationMs: Int = 500) = controller?.easeTo(p, durationMs)
    /** Ekran noktası (px, harita görünümüne göre) → petek. */
    fun cellAt(x: Float, y: Float): String? = controller?.cellAt(x, y)
    fun setPanEnabled(on: Boolean) = controller?.setPan(on)
}

@Composable
fun rememberHexMapState(): HexMapState = remember { HexMapState() }

/**
 * MapLibre haritası: GeoJSON petek dolgu/çizgi katmanları (dolgu opaklığı koyu 0,5 / açık 0,55,
 * mürekkep kılıf), kuşatılan petekler saldırgan renginde taralı + 2 sn "nefes alan" kenar,
 * hayalet (soluk), oyuncu işaretçileri (baş harf), kendi işaretçinde saldıran sayısı.
 */
@Composable
fun HexMap(
    layers: MapLayers,
    modifier: Modifier = Modifier,
    state: HexMapState = rememberHexMapState(),
    center: LatLng? = null,
    zoom: Double = 15.0,
    panEnabled: Boolean = true,
    onBoundsChange: ((Bbox, Double) -> Unit)? = null,
    onCellPress: ((String, LatLng) -> Unit)? = null,
    onPlayerPress: ((MapPlayer) -> Unit)? = null,
) {
    val context = LocalContext.current
    val colors = Hex.colors
    val density = LocalDensity.current.density
    val bounds by rememberUpdatedState(onBoundsChange)
    val cellPress by rememberUpdatedState(onCellPress)
    val playerPress by rememberUpdatedState(onPlayerPress)
    val controller = remember {
        HexMapController(context, density, center ?: DEFAULT_CENTER, zoom).also { state.controller = it }
    }
    controller.onBounds = { b, z -> bounds?.invoke(b, z) }
    controller.onCell = { id, ll -> cellPress?.invoke(id, ll) }
    controller.onPlayer = { p -> playerPress?.invoke(p) }

    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, controller) {
        val obs = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_START -> controller.start()
                Lifecycle.Event.ON_RESUME -> controller.resume()
                Lifecycle.Event.ON_PAUSE -> controller.pause()
                Lifecycle.Event.ON_STOP -> controller.stop()
                else -> Unit
            }
        }
        lifecycle.addObserver(obs)
        onDispose {
            lifecycle.removeObserver(obs)
            controller.destroy()
            if (state.controller === controller) state.controller = null
        }
    }

    SideEffect {
        controller.setTheme(colors, if (colors.isDark) BuildConfig.MAP_STYLE_URL_DARK else BuildConfig.MAP_STYLE_URL)
        controller.setLayers(layers)
        controller.setPan(panEnabled)
    }

    AndroidView(factory = { controller.view }, modifier = modifier)
}

/** Konum yokken harita merkezi (Kadıköy). */
val DEFAULT_CENTER = LatLng(40.9875, 29.0297)

internal class HexMapController(context: Context, private val density: Float, center: LatLng, zoom: Double) {
    private val appContext = context.applicationContext
    val view: MapView = MapView(context).apply { onCreate(null) }
    private var map: MapLibreMap? = null
    private var style: Style? = null
    private var styleUrl: String? = null
    private var colors: HexColors? = null
    private var layers = MapLayers()
    private var applied: MapLayers? = null
    private var pan = true
    private var started = false
    private var resumed = false
    private var destroyed = false
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var breath: Job? = null
    private val boundaryCache = HashMap<String, List<Point>>()
    private val images = HashSet<String>()

    var onBounds: (Bbox, Double) -> Unit = { _, _ -> }
    var onCell: (String, LatLng) -> Unit = { _, _ -> }
    var onPlayer: (MapPlayer) -> Unit = {}

    init {
        view.getMapAsync { m ->
            if (destroyed) return@getMapAsync
            map = m
            m.uiSettings.isLogoEnabled = false
            m.uiSettings.isCompassEnabled = false
            m.uiSettings.isRotateGesturesEnabled = false
            m.uiSettings.isTiltGesturesEnabled = false
            m.uiSettings.isAttributionEnabled = true
            m.uiSettings.setAttributionMargins((8 * density).toInt(), 0, 0, (8 * density).toInt())
            m.setMinZoomPreference(11.0)
            m.setMaxZoomPreference(19.0)
            m.cameraPosition = CameraPosition.Builder().target(MLatLng(center.lat, center.lng)).zoom(zoom).build()
            m.addOnCameraIdleListener { emitBounds() }
            m.addOnMapClickListener { ll -> handleClick(ll) }
            setPan(pan)
            loadStyle()
        }
    }

    fun start() { if (!started && !destroyed) { view.onStart(); started = true } }
    fun resume() { if (!resumed && !destroyed) { view.onResume(); resumed = true } }
    fun pause() { if (resumed) { view.onPause(); resumed = false } }
    fun stop() { if (started) { view.onStop(); started = false } }

    fun destroy() {
        if (destroyed) return
        pause()
        stop()
        scope.cancel()
        destroyed = true
        view.onDestroy()
    }

    fun setTheme(c: HexColors, url: String) {
        val changed = colors?.isDark != c.isDark || url != styleUrl
        colors = c
        if (changed) {
            styleUrl = url
            loadStyle()
        }
    }

    fun setLayers(l: MapLayers) {
        layers = l
        apply()
    }

    fun setPan(on: Boolean) {
        pan = on
        map?.uiSettings?.let {
            it.isScrollGesturesEnabled = on
            it.isZoomGesturesEnabled = on
            it.isDoubleTapGesturesEnabled = on
        }
    }

    fun flyTo(p: LatLng, zoom: Double?, durationMs: Int) {
        val m = map ?: return
        val z = zoom ?: m.cameraPosition.zoom
        val update = CameraUpdateFactory.newLatLngZoom(MLatLng(p.lat, p.lng), z)
        if (durationMs <= 0 || !ValueAnimator.areAnimatorsEnabled()) m.moveCamera(update) else m.animateCamera(update, durationMs)
    }

    fun easeTo(p: LatLng, durationMs: Int) {
        val m = map ?: return
        val update = CameraUpdateFactory.newLatLng(MLatLng(p.lat, p.lng))
        if (durationMs <= 0 || !ValueAnimator.areAnimatorsEnabled()) m.moveCamera(update) else m.easeCamera(update, durationMs)
    }

    fun cellAt(x: Float, y: Float): String? {
        val m = map ?: return null
        val ll = m.projection.fromScreenLocation(PointF(x, y))
        return runCatching { Cells.cellOf(LatLng(ll.latitude, ll.longitude)) }.getOrNull()
    }

    private fun emitBounds() {
        val m = map ?: return
        val b = m.projection.visibleRegion.latLngBounds
        onBounds(Bbox(b.latitudeSouth, b.longitudeWest, b.latitudeNorth, b.longitudeEast), m.cameraPosition.zoom)
    }

    private fun handleClick(ll: MLatLng): Boolean {
        val m = map ?: return false
        if (layers.showPlayers) {
            val pt = m.projection.toScreenLocation(ll)
            val hit = runCatching { m.queryRenderedFeatures(pt, L_PLAYERS) }.getOrDefault(emptyList())
            val pid = hit.firstOrNull()?.getStringProperty("pid")
            val p = pid?.let { id -> layers.players.firstOrNull { it.id == id } }
            if (p != null) {
                onPlayer(p)
                return true
            }
        }
        val cell = runCatching { Cells.cellOf(LatLng(ll.latitude, ll.longitude)) }.getOrNull() ?: return false
        onCell(cell, LatLng(ll.latitude, ll.longitude))
        return true
    }

    private fun loadStyle() {
        val m = map ?: return
        val url = styleUrl ?: return
        style = null
        applied = null
        images.clear()
        m.setStyle(Style.Builder().fromUri(url)) { st ->
            if (destroyed) return@setStyle
            style = st
            setupLayers(st)
            apply()
        }
    }

    private fun setupLayers(st: Style) {
        val c = colors ?: return
        for (id in listOf(S_CELLS, S_HIGHLIGHT, S_SELECTION, S_PREVIEW, S_SUGGESTION, S_ROUTE, S_TRACE, S_START, S_PLAYERS)) {
            if (st.getSource(id) == null) st.addSource(GeoJsonSource(id))
        }
        for (slot in Palette.SLOTS) {
            st.addImage("hatch-${slot.wire}", MapBitmaps.hatch(Palette.color(slot, c.isDark).toInt(), density))
        }
        st.addImage("hatch-ink", MapBitmaps.hatch(c.ink.toArgb(), density))
        val ink = c.ink.toArgb()
        st.addLayer(
            FillLayer(L_FILL, S_CELLS).withProperties(
                PropertyFactory.fillColor(Expression.toColor(Expression.get("fill"))),
                PropertyFactory.fillOpacity(Expression.get("alpha")),
            ),
        )
        st.addLayer(
            FillLayer(L_SIEGE_HATCH, S_CELLS).withFilter(Expression.eq(Expression.get("siege"), true)).withProperties(
                PropertyFactory.fillPattern(Expression.get("hatch")),
                PropertyFactory.fillOpacity(0.9f),
            ),
        )
        st.addLayer(LineLayer(L_CASING, S_CELLS).withProperties(PropertyFactory.lineColor(c.casing.toArgb()), PropertyFactory.lineWidth(1f), PropertyFactory.lineOpacity(0.55f)))
        st.addLayer(
            LineLayer(L_SIEGE_EDGE, S_CELLS).withFilter(Expression.eq(Expression.get("siege"), true)).withProperties(
                PropertyFactory.lineColor(Expression.toColor(Expression.get("siegeColor"))),
                PropertyFactory.lineWidth(2.5f),
                PropertyFactory.lineDasharray(arrayOf(1.5f, 1f)),
                PropertyFactory.lineOpacity(0.9f),
            ),
        )
        st.addLayer(
            LineLayer(L_ATTACK_EDGE, S_CELLS).withFilter(Expression.eq(Expression.get("attacking"), true)).withProperties(
                PropertyFactory.lineColor(ink), PropertyFactory.lineWidth(2f), PropertyFactory.lineDasharray(arrayOf(2f, 1.5f)), PropertyFactory.lineOpacity(0.8f),
            ),
        )
        st.addLayer(LineLayer(L_HIGHLIGHT, S_HIGHLIGHT).withProperties(PropertyFactory.lineColor(ink), PropertyFactory.lineWidth(2.5f)))
        st.addLayer(FillLayer(L_SELECTION_FILL, S_SELECTION).withProperties(PropertyFactory.fillColor(Expression.toColor(Expression.get("fill"))), PropertyFactory.fillOpacity(0.45f)))
        st.addLayer(LineLayer(L_SELECTION_LINE, S_SELECTION).withProperties(PropertyFactory.lineColor(ink), PropertyFactory.lineWidth(2f)))
        st.addLayer(FillLayer(L_PREVIEW_FILL, S_PREVIEW).withProperties(PropertyFactory.fillPattern("hatch-ink"), PropertyFactory.fillOpacity(0.35f)))
        st.addLayer(LineLayer(L_PREVIEW_LINE, S_PREVIEW).withProperties(PropertyFactory.lineColor(ink), PropertyFactory.lineWidth(2f), PropertyFactory.lineDasharray(arrayOf(2f, 2f))))
        st.addLayer(
            LineLayer(L_SUGGESTION, S_SUGGESTION).withProperties(
                PropertyFactory.lineColor(ink), PropertyFactory.lineWidth(3f), PropertyFactory.lineDasharray(arrayOf(2f, 1.5f)), PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
            ),
        )
        st.addLayer(
            LineLayer(L_ROUTE, S_ROUTE).withProperties(
                PropertyFactory.lineColor(ink), PropertyFactory.lineWidth(3f), PropertyFactory.lineDasharray(arrayOf(1f, 1.2f)), PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
            ),
        )
        st.addLayer(
            LineLayer(L_TRACE_CASING, S_TRACE).withProperties(
                PropertyFactory.lineColor(ink), PropertyFactory.lineWidth(7f), PropertyFactory.lineCap(Property.LINE_CAP_ROUND), PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
            ),
        )
        st.addLayer(
            LineLayer(L_TRACE, S_TRACE).withProperties(
                PropertyFactory.lineColor(c.trace.toArgb()), PropertyFactory.lineWidth(3.5f), PropertyFactory.lineCap(Property.LINE_CAP_ROUND), PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
            ),
        )
        st.addLayer(LineLayer(L_START_RINGS, S_START).withFilter(Expression.eq(Expression.geometryType(), "LineString")).withProperties(PropertyFactory.lineColor(ink), PropertyFactory.lineWidth(1.5f)))
        st.addLayer(FillLayer(L_START_TRI, S_START).withFilter(Expression.eq(Expression.geometryType(), "Polygon")).withProperties(PropertyFactory.fillColor(ink)))
        st.addLayer(
            SymbolLayer(L_PLAYERS, S_PLAYERS).withProperties(
                PropertyFactory.iconImage(Expression.get("icon")),
                PropertyFactory.iconAllowOverlap(true),
                PropertyFactory.iconIgnorePlacement(true),
            ),
        )
    }

    private fun boundary(id: String): List<Point> = boundaryCache.getOrPut(id) {
        val b = runCatching { Cells.cellBoundary(id) }.getOrDefault(emptyList()).map { Point.fromLngLat(it.lng, it.lat) }
        if (b.isEmpty()) b else b + b.first()
    }.also { if (boundaryCache.size > 30_000) boundaryCache.clear() }

    private fun cellFeature(id: String): Feature? {
        val ring = boundary(id)
        if (ring.size < 4) return null
        return Feature.fromGeometry(Polygon.fromLngLats(listOf(ring)))
    }

    private fun line(points: List<LatLng>?): FeatureCollection =
        if (points == null || points.size < 2) EMPTY else FeatureCollection.fromFeature(Feature.fromGeometry(LineString.fromLngLats(points.map { Point.fromLngLat(it.lng, it.lat) })))

    private fun polygon(points: List<LatLng>): Feature {
        val ring = points.map { Point.fromLngLat(it.lng, it.lat) }.toMutableList()
        if (ring.isNotEmpty() && ring.first() != ring.last()) ring.add(ring.first())
        return Feature.fromGeometry(Polygon.fromLngLats(listOf(ring)))
    }

    private fun src(id: String): GeoJsonSource? = style?.getSourceAs(id)

    private fun apply() {
        val st = style ?: return
        val c = colors ?: return
        val l = layers
        val prev = applied
        if (prev == null || prev.cells !== l.cells || prev.faded != l.faded || prev.myId != l.myId) {
            val alpha = c.cellFillOpacity * (if (l.faded) 0.45f else 1f)
            val feats = l.cells.mapNotNull { cell ->
                val f = cellFeature(cell.id) ?: return@mapNotNull null
                val slot = cell.slot
                val siege = cell.duel == "defending"
                f.addStringProperty("id", cell.id)
                f.addStringProperty("fill", if (slot != null) hex(Palette.color(slot, c.isDark)) else "rgba(0,0,0,0)")
                // Hayalet: son 7 günde eriyen güç → dolgu soluklaşır.
                val ghostFade = if (cell.ghost > 0 && cell.power > 0) (cell.power / (cell.power + cell.ghost)).toFloat().coerceIn(0.4f, 1f) else 1f
                f.addNumberProperty("alpha", if (slot != null) alpha * ghostFade else 0f)
                f.addBooleanProperty("siege", siege)
                f.addBooleanProperty("attacking", cell.duel == "attacking")
                f.addStringProperty("hatch", if (siege && cell.attackerSlot != null) "hatch-${cell.attackerSlot!!.wire}" else "hatch-ink")
                f.addStringProperty("siegeColor", if (siege && cell.attackerSlot != null) hex(Palette.color(cell.attackerSlot!!, c.isDark)) else hex(c.ink.toArgb().toLong() and 0xFFFFFFFFL))
                f
            }
            src(S_CELLS)?.setGeoJson(FeatureCollection.fromFeatures(feats))
            st.getLayer(L_CASING)?.setProperties(PropertyFactory.lineOpacity(if (l.faded) 0.25f else 0.55f))
            updateBreathing(l.cells.any { it.duel == "defending" } && !l.faded)
        }
        if (prev == null || prev.highlight !== l.highlight) {
            src(S_HIGHLIGHT)?.setGeoJson(FeatureCollection.fromFeatures(l.highlight.mapNotNull { cellFeature(it) }))
        }
        if (prev == null || prev.selection !== l.selection || prev.selectionSlot != l.selectionSlot) {
            val fill = l.selectionSlot?.let { hex(Palette.color(it, c.isDark)) } ?: hex(c.ink.toArgb().toLong() and 0xFFFFFFFFL)
            src(S_SELECTION)?.setGeoJson(FeatureCollection.fromFeatures(l.selection.mapNotNull { id -> cellFeature(id)?.also { it.addStringProperty("fill", fill) } }))
        }
        if (prev == null || prev.previewRing !== l.previewRing) {
            val r = l.previewRing
            src(S_PREVIEW)?.setGeoJson(if (r != null && r.size >= 4) FeatureCollection.fromFeature(polygon(r)) else EMPTY)
        }
        if (prev == null || prev.suggestion !== l.suggestion) src(S_SUGGESTION)?.setGeoJson(line(l.suggestion))
        if (prev == null || prev.route !== l.route) src(S_ROUTE)?.setGeoJson(line(l.route))
        if (prev == null || prev.trace !== l.trace) src(S_TRACE)?.setGeoJson(line(l.trace))
        if (prev == null || prev.start != l.start || prev.captureRadiusM != l.captureRadiusM) {
            val s = l.start
            src(S_START)?.setGeoJson(
                if (s == null) EMPTY else FeatureCollection.fromFeatures(
                    listOf(
                        Feature.fromGeometry(LineString.fromLngLats(Geo.circle(s, l.captureRadiusM).map { Point.fromLngLat(it.lng, it.lat) })),
                        Feature.fromGeometry(LineString.fromLngLats(Geo.circle(s, l.captureRadiusM * 0.8).map { Point.fromLngLat(it.lng, it.lat) })),
                        polygon(Geo.triangle(s)),
                    ),
                ),
            )
        }
        if (prev == null || prev.players !== l.players || prev.attackers != l.attackers || prev.showPlayers != l.showPlayers || prev.myId != l.myId) {
            val feats = if (!l.showPlayers) emptyList() else l.players.mapNotNull { p ->
                val mk = p.marker ?: return@mapNotNull null
                val me = p.id == l.myId
                val key = "pl-${p.slot.wire}-${p.initials}-${p.goldFrame}-${p.hidden}-$me-${if (me) l.attackers else 0}-${c.isDark}"
                if (images.add(key)) {
                    st.addImage(key, MapBitmaps.marker(appContext, c, p.slot, p.initials, me, p.goldFrame, p.hidden, if (me) l.attackers else 0, density))
                }
                Feature.fromGeometry(Point.fromLngLat(mk.lng, mk.lat)).also {
                    it.addStringProperty("icon", key)
                    it.addStringProperty("pid", p.id)
                }
            }
            src(S_PLAYERS)?.setGeoJson(FeatureCollection.fromFeatures(feats))
        }
        applied = l
    }

    /** Kuşatma kenarı 2 sn döngüyle nefes alır; animasyonlar kapalıyken sabit. */
    private fun updateBreathing(on: Boolean) {
        val enabled = on && ValueAnimator.areAnimatorsEnabled()
        if (!enabled) {
            breath?.cancel()
            breath = null
            style?.getLayer(L_SIEGE_EDGE)?.setProperties(PropertyFactory.lineOpacity(0.9f))
            return
        }
        if (breath?.isActive == true) return
        breath = scope.launch {
            val t0 = System.currentTimeMillis()
            while (isActive) {
                val t = (System.currentTimeMillis() - t0) % 2000L
                val a = 0.35f + 0.65f * (0.5f + 0.5f * sin(2 * PI * t / 2000.0).toFloat())
                style?.getLayer(L_SIEGE_EDGE)?.setProperties(PropertyFactory.lineOpacity(a))
                delay(80)
            }
        }
    }

    private fun hex(argb: Long): String = String.format(java.util.Locale.ROOT, "#%06X", argb and 0xFFFFFF)

    companion object {
        private val EMPTY: FeatureCollection = FeatureCollection.fromFeatures(emptyList<Feature>())
        private const val S_CELLS = "hx-cells"
        private const val S_HIGHLIGHT = "hx-highlight"
        private const val S_SELECTION = "hx-selection"
        private const val S_PREVIEW = "hx-preview"
        private const val S_SUGGESTION = "hx-suggestion"
        private const val S_ROUTE = "hx-route"
        private const val S_TRACE = "hx-trace"
        private const val S_START = "hx-start"
        private const val S_PLAYERS = "hx-players"
        private const val L_FILL = "hx-cells-fill"
        private const val L_SIEGE_HATCH = "hx-cells-siege-hatch"
        private const val L_CASING = "hx-cells-casing"
        private const val L_SIEGE_EDGE = "hx-cells-siege-edge"
        private const val L_ATTACK_EDGE = "hx-cells-attack-edge"
        private const val L_HIGHLIGHT = "hx-highlight-line"
        private const val L_SELECTION_FILL = "hx-selection-fill"
        private const val L_SELECTION_LINE = "hx-selection-line"
        private const val L_PREVIEW_FILL = "hx-preview-fill"
        private const val L_PREVIEW_LINE = "hx-preview-line"
        private const val L_SUGGESTION = "hx-suggestion-line"
        private const val L_ROUTE = "hx-route-line"
        private const val L_TRACE_CASING = "hx-trace-casing"
        private const val L_TRACE = "hx-trace-line"
        private const val L_START_RINGS = "hx-start-rings"
        private const val L_START_TRI = "hx-start-triangle"
        private const val L_PLAYERS = "hx-players"
    }
}
