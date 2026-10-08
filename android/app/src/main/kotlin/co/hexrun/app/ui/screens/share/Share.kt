package co.hexrun.app.ui.screens.share

import android.content.Intent
import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.nav.LocalNav
import co.hexrun.app.ui.Query
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HScreen
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.HexIcon
import co.hexrun.app.ui.components.Segmented
import co.hexrun.app.ui.components.SilhouetteShape
import co.hexrun.app.ui.components.Skeleton
import co.hexrun.app.ui.components.StateBlock
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.theme.DarkColors
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.HexColors
import co.hexrun.app.ui.theme.LightColors
import co.hexrun.app.ui.theme.Radii
import co.hexrun.core.api.ShareCard
import co.hexrun.core.format.Format
import co.hexrun.core.i18n.S
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/** Kart dışa aktarım boyutu: 1080 × 1920 px (9:16). */
private const val OUT_W = 1080
private const val OUT_H = 1920
private const val DESIGN_W = 270f

/**
 * 9:16 hikâye kartı: yalnız petek silüeti ve m²; harita, rota, rakip adı yok. Tüm ölçüler
 * tasarımdaki 270 birim genişliğe göre `width` ile ölçeklenir (önizleme ve 1080 px dışa aktarım aynı).
 */
@Composable
fun StoryCard(card: ShareCard, colors: HexColors, width: Dp, modifier: Modifier = Modifier) {
    val u = width.value / DESIGN_W
    val type = Hex.type
    val col = colors.player(card.slot)
    val h = width * 16f / 9f
    Column(
        modifier.requiredSize(width, h).clip(RoundedCornerShape((28 * u).dp)).background(colors.bg).padding((24 * u).dp).testTag("story-card"),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            HText("hexrun", style = type.title2.copy(fontSize = (22 * u).sp, lineHeight = (28 * u).sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Black), color = colors.ink)
            HText(card.dateLabel, style = type.data.copy(fontSize = (13 * u).sp, lineHeight = (16 * u).sp), color = colors.ink2)
        }
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            SilhouetteShape(card.silhouette, col, Modifier.size(width - (64 * u).dp, h * 0.38f), stroke = colors.casing)
        }
        Column(verticalArrangement = Arrangement.spacedBy((6 * u).dp)) {
            HText(card.kicker, style = type.label.copy(fontSize = (12 * u).sp, lineHeight = (16 * u).sp), color = colors.ink2, upper = true)
            HText("+${Format.area(card.gainedAreaM2)}", style = type.display.copy(fontSize = (44 * u).sp, lineHeight = (48 * u).sp), color = colors.ink, maxLines = 1)
            HText(card.line, style = type.callout.copy(fontSize = (15 * u).sp, lineHeight = (20 * u).sp), color = colors.ink)
            HText("${Format.km(card.distanceM, 1)} km · ${Format.duration(card.durationMs)} · ${Format.pace(card.paceSecPerKm)}/km", style = type.data.copy(fontSize = (13 * u).sp, lineHeight = (16 * u).sp), color = colors.ink2)
            HText("@${card.username}${card.teamName?.let { " · $it" } ?: ""}", style = type.data.copy(fontSize = (13 * u).sp, lineHeight = (16 * u).sp), color = colors.ink2)
        }
    }
}

/**
 * 18A · Fethi paylaş: kart composable'ı bir grafik katmanına kaydedilip 1080×1920 bit eşleme
 * olarak alınır, FileProvider ile `ACTION_SEND` (image/png) paylaşılır.
 */
@Composable
fun ShareScreen(runId: String) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val q = remember(runId) { Query(scope) { graph.api.share(runId) } }
    LaunchedEffect(runId) { q.load() }
    val state by q.state.collectAsStateWithLifecycle()
    var dark by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    val layer = rememberGraphicsLayer()
    val density = LocalDensity.current
    val exportW = with(density) { OUT_W.toDp() }
    val previewW = 270.dp
    val scale = previewW.value / exportW.value

    val share: () -> Unit = {
        busy = true
        err = null
        scope.launch {
            runCatching {
                val bmp: Bitmap = layer.toImageBitmap().asAndroidBitmap()
                val out = if (bmp.width != OUT_W) Bitmap.createScaledBitmap(bmp, OUT_W, OUT_H, true) else bmp
                val uri = withContext(Dispatchers.IO) {
                    val dir = File(context.cacheDir, "share").apply { mkdirs() }
                    val f = File(dir, "hexrun-$runId.png")
                    FileOutputStream(f).use { out.compress(Bitmap.CompressFormat.PNG, 100, it) }
                    FileProvider.getUriForFile(context, "${context.packageName}.files", f)
                }
                val send = Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                context.startActivity(Intent.createChooser(send, S.share.title))
            }.onFailure { err = S.share.unavailable }
            busy = false
        }
    }

    HScreen(
        title = S.share.title,
        onBack = nav::back,
        footer = if (state.data != null) { { HButton(S.share.share, share, Modifier.fillMaxWidth().testTag("share-btn"), big = true, icon = HexIcon.Share, loading = busy) } } else null,
    ) {
        Segmented(listOf(true to S.share.dark, false to S.share.light), dark, { dark = it })
        val card = state.data
        when {
            card != null -> Box(Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = "${card.kicker}, +${Format.area(card.gainedAreaM2)}, ${card.line}" }, contentAlignment = Alignment.Center) {
                // Kart 1080 px genişlikte çizilir ve kaydedilir; ekranda 270 dp'ye küçültülerek gösterilir.
                Box(Modifier.requiredSize(previewW, previewW * 16f / 9f), contentAlignment = Alignment.Center) {
                    Box(
                        Modifier.requiredSize(exportW, exportW * 16f / 9f)
                            .graphicsLayer { scaleX = scale; scaleY = scale }
                            .drawWithContent {
                                layer.record { this@drawWithContent.drawContent() }
                                drawLayer(layer)
                            },
                    ) {
                        StoryCard(card, if (dark) DarkColors else LightColors, exportW)
                    }
                }
            }
            state.failed -> StateBlock(S.common.genericError, action = S.common.retry, onAction = { q.load() })
            else -> Skeleton(Modifier.size(270.dp, 480.dp), height = 480.dp)
        }
        HText(S.share.privacyNote, style = Hex.type.callout, tone = Tone.Ink3)
        err?.let { HText(it, style = Hex.type.callout) }
    }
}
