package co.hexrun.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Space
import co.hexrun.core.i18n.S

/** M3 üst uygulama çubuğu (Android: 64 dp, geri oku, başlık sola). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HTopBar(title: String?, onBack: (() -> Unit)?, actions: @Composable RowScope.() -> Unit = {}, backDescription: String = S.common.back) {
    val c = Hex.colors
    TopAppBar(
        title = { if (title != null) HText(title, style = Hex.type.title2, maxLines = 1, heading = true) },
        navigationIcon = {
            if (onBack != null) IconButtonH(HexIcon.Back, backDescription, onBack)
        },
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(containerColor = c.bg, titleContentColor = c.ink, navigationIconContentColor = c.ink, actionIconContentColor = c.ink),
        windowInsets = WindowInsets(0, 0, 0, 0),
    )
}

/**
 * Alt ekran iskeleti: durum çubuğu boşluğu, üst çubuk, kaydırılabilir içerik, isteğe bağlı alt
 * eylem alanı (CTA). `large` başlık içerikte büyük yazılır.
 */
@Composable
fun HScreen(
    title: String? = null,
    onBack: (() -> Unit)? = null,
    large: Boolean = false,
    actions: @Composable RowScope.() -> Unit = {},
    scroll: Boolean = true,
    footer: (@Composable ColumnScope.() -> Unit)? = null,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = Hex.colors
    Column(modifier.fillMaxSize().background(c.bg).statusBarsPadding().imePadding()) {
        HTopBar(if (large) null else title, onBack, actions)
        val body = Modifier.weight(1f).fillMaxWidth()
        Column(
            (if (scroll) body.verticalScroll(rememberScrollState()) else body).padding(horizontal = Space.gutter).padding(top = 8.dp, bottom = if (footer != null) 16.dp else 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (large && title != null) HText(title, style = Hex.type.title1, heading = true)
            content()
            if (footer == null) Spacer(Modifier.navigationBarsPadding())
        }
        if (footer != null) {
            Column(
                Modifier.fillMaxWidth().padding(horizontal = Space.gutter).padding(top = 8.dp, bottom = 12.dp).navigationBarsPadding(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                content = footer,
            )
        }
    }
}

/** Boş / hata durumu: tek başlık, tek açıklama, tek eylem. */
@Composable
fun StateBlock(
    title: String,
    modifier: Modifier = Modifier,
    icon: HexIcon? = null,
    body: String? = null,
    action: String? = null,
    onAction: (() -> Unit)? = null,
    footnote: String? = null,
    extra: (@Composable ColumnScope.() -> Unit)? = null,
) {
    val c = Hex.colors
    Column(
        modifier.fillMaxWidth().padding(vertical = 24.dp).semantics { liveRegion = LiveRegionMode.Polite },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (icon != null) {
            Box(Modifier.size(48.dp).clip(CircleShape).background(c.surf2), contentAlignment = Alignment.Center) { HIcon(icon) }
        }
        HText(title, style = Hex.type.title2, heading = true)
        if (body != null) HText(body, tone = Tone.Ink2)
        extra?.invoke(this)
        if (action != null && onAction != null) HButton(action, onAction, kind = ButtonKind.Secondary)
        if (footnote != null) DataText(footnote, tone = Tone.Ink3)
    }
}

/** Liste iskeleti (yükleniyor). */
@Composable
fun SkeletonList(count: Int = 4, height: androidx.compose.ui.unit.Dp = 56.dp) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        repeat(count) { Skeleton(height = height) }
    }
}

@Composable
fun HSpacer(w: Int = 0, h: Int = 0) = Spacer(Modifier.width(w.dp).height(h.dp))

@Composable
fun RowScope.Fill() = Spacer(Modifier.weight(1f))
