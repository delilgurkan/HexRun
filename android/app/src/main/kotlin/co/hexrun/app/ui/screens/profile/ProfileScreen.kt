package co.hexrun.app.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.nav.LocalNav
import co.hexrun.app.nav.Routes
import co.hexrun.app.ui.Load
import co.hexrun.app.ui.components.ButtonKind
import co.hexrun.app.ui.components.DataText
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HCard
import co.hexrun.app.ui.components.HDivider
import co.hexrun.app.ui.components.HIcon
import co.hexrun.app.ui.components.HScreen
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.HexIcon
import co.hexrun.app.ui.components.HexTexture
import co.hexrun.app.ui.components.IconButtonH
import co.hexrun.app.ui.components.Label
import co.hexrun.app.ui.components.PlayerBadge
import co.hexrun.app.ui.components.ProgressLine
import co.hexrun.app.ui.components.SectionTitle
import co.hexrun.app.ui.components.Segmented
import co.hexrun.app.ui.components.SilhouetteShape
import co.hexrun.app.ui.components.Skeleton
import co.hexrun.app.ui.components.Stat
import co.hexrun.app.ui.components.StateBlock
import co.hexrun.app.ui.components.TextButtonH
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.screens.auth.hexFieldColors
import co.hexrun.app.ui.screens.run.rememberRunStarter
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Radii
import co.hexrun.app.ui.theme.Target
import co.hexrun.app.util.shareText
import co.hexrun.core.api.ApiError
import co.hexrun.core.api.BadgeDto
import co.hexrun.core.api.BadgesResponse
import co.hexrun.core.api.FeedItem
import co.hexrun.core.api.FriendItem
import co.hexrun.core.api.FriendsResponse
import co.hexrun.core.api.Me
import co.hexrun.core.api.StatsResponse
import co.hexrun.core.format.Format
import co.hexrun.core.i18n.S
import co.hexrun.core.run.RunContext
import co.hexrun.core.ui.BadgeCatalog
import co.hexrun.core.ui.Dates
import kotlinx.coroutines.launch

/** Profil: haritadaki avatardan açılır. İstatistik · Rozetler (Nişanlar) · Arkadaşlar (M3 sekmeler). */
@Composable
fun ProfileScreen(tab: String?, code: String?) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val vm: ProfileViewModel = viewModel { ProfileViewModel(graph.api, graph.kv) }
    val me by graph.me.me.collectAsStateWithLifecycle()
    val prefs by graph.prefs.prefs.collectAsStateWithLifecycle()
    var current by rememberSaveable { mutableStateOf(tab ?: if (code != null) "friends" else "stats") }
    val stats by vm.stats.state.collectAsStateWithLifecycle()
    val badges by vm.badges.state.collectAsStateWithLifecycle()
    val last by vm.lastBadges.collectAsStateWithLifecycle()
    val friends by vm.friends.state.collectAsStateWithLifecycle()
    val feed by vm.feed.collectAsStateWithLifecycle()
    val friendError by vm.friendError.collectAsStateWithLifecycle()
    val start = rememberRunStarter()
    val tabs = listOf("stats" to S.profile.tabStats, "badges" to S.profile.tabBadges, "friends" to S.profile.tabFriends)
    HScreen(
        title = S.profile.title,
        onBack = nav::back,
        actions = { IconButtonH(HexIcon.Gear, S.profile.settings, { nav.go(Routes.SETTINGS) }) },
        modifier = Modifier.testTag("profile"),
    ) {
        val m = me
        if (m != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                PlayerBadge(m.slot, m.initials, size = 56.dp, goldFrame = m.goldFrame, ring = true)
                Column(Modifier.weight(1f)) {
                    HText(m.displayName, style = Hex.type.title2)
                    HText("@${m.username}${m.teamName?.let { " · $it" } ?: ""}", style = Hex.type.callout, tone = Tone.Ink2)
                }
            }
        } else Skeleton(height = 56.dp)
        val idx = tabs.indexOfFirst { it.first == current }.coerceAtLeast(0)
        val c = Hex.colors
        TabRow(
            selectedTabIndex = idx, containerColor = c.bg, contentColor = c.ink,
            indicator = { pos -> TabRowDefaults.SecondaryIndicator(Modifier.tabIndicatorOffset(pos[idx]), color = c.ink) },
            divider = { HDivider() },
        ) {
            tabs.forEachIndexed { i, (k, label) ->
                Tab(selected = i == idx, onClick = { current = k }, text = { HText(label, style = Hex.type.callout, weight = if (i == idx) FontWeight.Bold else FontWeight.SemiBold, tone = if (i == idx) Tone.Ink else Tone.Ink2) })
            }
        }
        if (m != null) when (current) {
            "badges" -> BadgesTab(badges, last, prefs.insigniaIntroSeen, onRetry = { vm.badges.load() }, onOpen = { nav.go(Routes.badge(it.id)) }, onStart = { start(RunContext()) }, onIntroSeen = {
                graph.appScope.launch { graph.prefs.update { it.copy(insigniaIntroSeen = true) } }
            })
            "friends" -> FriendsTab(
                friends, feed, initialCode = code, error = friendError,
                onInvite = { inv -> context.shareText(S.friends.inviteMessage(inv)) },
                onAccept = { vm.acceptFriend(it) }, onRetry = { vm.friends.load() },
                onClap = vm::clap, onMore = { vm.loadFeed(more = true) }, onRetryFeed = { vm.loadFeed() },
            )
            else -> StatsTab(stats, m, onRetry = { vm.stats.load() })
        }
    }
}

/** 10 · İstatistik: önce toprak (silüet), sonra savunma ve seri. */
@Composable
fun StatsTab(q: Load<StatsResponse>, me: Me, onRetry: () -> Unit) {
    val s = q.data
    when {
        s != null -> StatsView(s, me)
        q.failed -> StateBlock(S.common.genericError, action = S.common.retry, onAction = onRetry)
        else -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) { Skeleton(height = 96.dp); Skeleton(height = 60.dp); Skeleton(height = 60.dp) }
    }
}

@Composable
fun StatsView(s: StatsResponse, me: Me) {
    val c = Hex.colors
    val max = maxOf(1.0, s.last14Days.maxOfOrNull { it.gainedM2 } ?: 1.0)
    Column(Modifier.testTag("stats"), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        HCard {
            Label(S.stats.territory)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    HText(Format.area(s.territoryM2), style = Hex.type.title1)
                    HText(S.stats.territoryMeta(s.cells, s.regionName, s.regionRank), style = Hex.type.callout, tone = Tone.Ink2)
                }
                if (s.silhouettes.isNotEmpty()) SilhouetteShape(s.silhouettes, c.player(me.slot), Modifier.size(96.dp, 72.dp), stroke = c.casing)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Stat(S.stats.monthDistance(Dates.monthName(System.currentTimeMillis())), "${Format.km(s.monthDistanceM, 1)} km", Modifier.weight(1f))
            Stat(S.stats.avgPace, "${Format.pace(s.avgPaceSecPerKm)}/km", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Stat(S.stats.defense, "${s.defenses.won} / ${s.defenses.total}", Modifier.weight(1f))
            Stat(S.stats.biggestLoop, Format.area(s.biggestLoopM2), Modifier.weight(1f))
        }
        HCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HIcon(HexIcon.Streak)
                HText(S.stats.streak(s.streakDays), style = Hex.type.title2, modifier = Modifier.weight(1f))
                DataText(S.stats.bestStreak(s.bestStreakDays), tone = Tone.Ink2)
            }
            Label(S.stats.last14, tone = Tone.Ink3)
            Row(
                Modifier.fillMaxWidth().height(40.dp).clearAndSetSemantics { contentDescription = S.stats.last14A11y(s.last14Days.count { it.ran }) },
                horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.Bottom,
            ) {
                for (d in s.last14Days) {
                    Box(Modifier.weight(1f).height(if (d.ran) (10 + 30 * d.gainedM2 / max).dp else 6.dp).clip(RoundedCornerShape(2.dp)).background(if (d.ran) c.player(me.slot) else c.track))
                }
            }
        }
        SectionTitle(S.stats.recent)
        if (s.recent.isNotEmpty()) {
            HCard {
                s.recent.forEachIndexed { i, r ->
                    if (i > 0) HDivider()
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        HText("${Dates.relativeLabel(r.at).split(' ').first()} · ${r.text}", style = Hex.type.callout, modifier = Modifier.weight(1f))
                        DataText(r.delta)
                    }
                }
            }
        } else HText(S.stats.noRecent, tone = Tone.Ink2)
        DataText("${Format.int(s.cells)} petek", tone = Tone.Ink3)
    }
}

/** Kesikli çerçeve (kazanılmamış rozet, boş nişan slotu). */
private fun Modifier.dashed(color: Color, radius: Float = 14f): Modifier = drawBehind {
    drawRoundRect(color, style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f))), cornerRadius = CornerRadius(radius * density))
}

/** 10b · Rozet durumları: boş (yapılacaklar), yükleniyor (iskelet), hata (son bilinen sayı korunur). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BadgesTab(q: Load<BadgesResponse>, last: BadgeCount?, introSeen: Boolean, onRetry: () -> Unit, onOpen: (BadgeDto) -> Unit, onStart: () -> Unit, onIntroSeen: () -> Unit) {
    val c = Hex.colors
    val data = q.data
    if (data == null && q.failed) {
        val known = last ?: BadgeCount(0, BadgeCatalog.ALL.size)
        val code = (q.error as? ApiError)?.let { "RZ-${it.status}" } ?: "RZ-0"
        Column(Modifier.testTag("badges-error"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            HText(S.badges.errorTitle, style = Hex.type.title2)
            HText(S.badges.errorBody(known.earned, known.total), tone = Tone.Ink2)
            HButton(S.common.retry, onRetry, kind = ButtonKind.Secondary)
            DataText(S.common.errorCode(code), tone = Tone.Ink3)
        }
        return
    }
    if (data == null) {
        Box(Modifier.fillMaxWidth().heightIn(min = 320.dp).testTag("badges-loading").semantics { contentDescription = S.badges.loading }) {
            HexTexture(Modifier.matchParentSize())
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                HText(S.badges.loading, style = Hex.type.title2)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), maxItemsInEachRow = 3) {
                    repeat(9) { Skeleton(Modifier.weight(1f), height = 96.dp, radius = Radii.m - 6.dp) }
                }
            }
        }
        return
    }
    if (data.earned == 0) {
        val nearest = data.nearest.ifEmpty { data.badges.filter { !it.earned }.take(3) }
        Column(Modifier.testTag("badges-empty"), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            HText(S.badges.emptyTitle, style = Hex.type.title2)
            HText(S.badges.emptyBody(data.total), tone = Tone.Ink2)
            for (b in nearest.take(3)) HCard {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    HText(b.name, style = Hex.type.callout, weight = FontWeight.Bold)
                    DataText("${b.progressNow.toLong()}/${b.progressMax.toLong()}", tone = Tone.Ink2)
                }
                HText(b.how, style = Hex.type.callout, tone = Tone.Ink2)
                ProgressLine(b.progressNow, b.progressMax)
            }
            HButton(S.badges.emptyCta, onStart, Modifier.fillMaxWidth(), big = true)
        }
        return
    }
    val byId = data.badges.associateBy { it.id }
    val filled = data.slots.count { it != null }
    Column(Modifier.testTag("badges"), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (data.earned >= 2 && !introSeen) {
            HCard(Modifier.testTag("insignia-intro")) {
                HText(S.badges.unlockedTitle, style = Hex.type.title2)
                HText(S.badges.unlockedBody, tone = Tone.Ink2)
                S.badges.unlockedPoints.forEachIndexed { i, p ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        DataText("0${i + 1}", tone = Tone.Ink3)
                        HText(p, style = Hex.type.callout, modifier = Modifier.weight(1f))
                    }
                }
                HButton(S.common.done, onIntroSeen)
            }
        }
        SectionTitle(S.badges.insignia) { DataText(S.badges.insigniaMeta(filled), tone = Tone.Ink2) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (i in 0 until 3) {
                val b = data.slots.getOrNull(i)?.let { byId[it] }
                val shape = RoundedCornerShape(Radii.m - 6.dp)
                Column(
                    Modifier.weight(1f).heightIn(min = 96.dp).clip(shape)
                        .let { if (b != null) it.background(c.surf).border(1.dp, c.line2, shape) else it.dashed(c.line2) }
                        .clickable(enabled = b != null, role = Role.Button) { b?.let(onOpen) }
                        .semantics(mergeDescendants = true) { contentDescription = b?.let { "${it.name}: ${it.insignia?.effect ?: ""}" } ?: S.badges.emptySlot }
                        .padding(10.dp).testTag("slot-$i"),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    HText(b?.name ?: S.badges.emptySlot, style = Hex.type.callout.copy(fontSize = 13.sp), weight = FontWeight.Bold, maxLines = 2)
                    b?.insignia?.let { HText(it.effect, style = Hex.type.callout.copy(fontSize = 12.sp), tone = Tone.Ink2, maxLines = 3) }
                }
            }
        }
        HText(S.badges.insigniaNote, style = Hex.type.callout, tone = Tone.Ink3)
        SectionTitle(S.badges.collection) { DataText(S.badges.collectionMeta(data.earned, data.total), tone = Tone.Ink2) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), maxItemsInEachRow = 3) {
            for (b in data.badges) BadgeTile(b, Modifier.weight(1f)) { onOpen(b) }
        }
    }
}

@Composable
private fun BadgeTile(b: BadgeDto, modifier: Modifier, onClick: () -> Unit) {
    val c = Hex.colors
    val shape = RoundedCornerShape(Radii.m - 6.dp)
    Column(
        modifier.heightIn(min = 104.dp).clip(shape)
            .let { if (b.earned) it.background(c.surf).border(1.dp, c.line2, shape) else it.dashed(c.line) }
            .clickable(role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) {
                contentDescription = "${b.name}. ${if (b.earned) S.badges.earned else "${b.progressNow.toLong()}/${b.progressMax.toLong()}"}. ${b.how}"
            }
            .padding(10.dp).testTag("badge-${b.id}"),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        HIcon(if (b.insignia != null) HexIcon.Defend else HexIcon.Map, size = 20.dp, tint = if (b.earned) c.ink else c.ink3)
        HText(b.name, style = Hex.type.callout.copy(fontSize = 13.sp), weight = FontWeight.SemiBold, tone = if (b.earned) Tone.Ink else Tone.Ink2, maxLines = 2)
        if (!b.earned) ProgressLine(b.progressNow, b.progressMax)
    }
}

/** 11 + 18B · Arkadaşlar: oyun ilişkisi listesi ve alkışlı akış; davet kodu paylaşımı. */
@Composable
fun FriendsTab(
    q: Load<FriendsResponse>,
    feed: FeedUi,
    initialCode: String?,
    error: String?,
    onInvite: (String) -> Unit,
    onAccept: (String) -> Unit,
    onRetry: () -> Unit,
    onClap: (String) -> Unit,
    onMore: () -> Unit,
    onRetryFeed: () -> Unit,
) {
    var view by rememberSaveable { mutableStateOf(if (initialCode != null) "list" else "feed") }
    var code by rememberSaveable { mutableStateOf(initialCode ?: "") }
    Column(Modifier.testTag("friends"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Segmented(listOf("feed" to S.friends.feed, "list" to S.friends.list), view, { view = it }, Modifier.weight(1f))
            HButton(S.friends.invite, { q.data?.let { onInvite(it.inviteCode) } }, icon = HexIcon.Plus, enabled = q.data != null)
        }
        if (view == "list") {
            val d = q.data
            when {
                d != null -> {
                    Label(S.friends.count(d.friends.size))
                    if (d.friends.isNotEmpty()) HCard {
                        d.friends.forEachIndexed { i, f ->
                            if (i > 0) HDivider()
                            FriendRow(f)
                        }
                    } else HText(S.friends.empty, tone = Tone.Ink2)
                    HCard {
                        Label(S.friends.addByCode)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                code, { code = it.take(20) }, Modifier.weight(1f), singleLine = true, placeholder = { Text(S.friends.codePlaceholder) },
                                textStyle = Hex.type.data.copy(fontSize = 15.sp), keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                                shape = RoundedCornerShape(Radii.s), colors = hexFieldColors(),
                            )
                            HButton(S.friends.add, { onAccept(code) }, enabled = code.trim().length >= 4)
                        }
                        error?.let { HText(it, style = Hex.type.callout) }
                    }
                }
                q.failed -> StateBlock(S.common.genericError, action = S.common.retry, onAction = onRetry)
                else -> Skeleton(height = 160.dp)
            }
        } else {
            when {
                feed.items.isNotEmpty() -> {
                    for (f in feed.items) FeedRow(f, onClap)
                    if (feed.cursor != null) TextButtonH(S.notifications.loadMore, onMore, Modifier.fillMaxWidth())
                }
                feed.loading -> Skeleton(height = 160.dp)
                feed.error != null -> StateBlock(S.common.genericError, action = S.common.retry, onAction = onRetryFeed)
                else -> HText(S.friends.feedEmpty, tone = Tone.Ink2)
            }
        }
    }
}

@Composable
private fun FriendRow(f: FriendItem) {
    Row(
        Modifier.fillMaxWidth().defaultMinSize(minHeight = 52.dp).clearAndSetSemantics { contentDescription = "${f.player.displayName}, ${f.relation}" },
        horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        PlayerBadge(f.player.slot, f.player.initials, size = 36.dp)
        Column(Modifier.weight(1f)) {
            HText(f.player.displayName, style = Hex.type.callout, weight = FontWeight.SemiBold)
            HText(f.relation, style = Hex.type.callout, tone = Tone.Ink2)
        }
        when (f.status) {
            "besieging_you" -> HIcon(HexIcon.Siege, size = 20.dp)
            "running" -> HIcon(HexIcon.Pace, size = 20.dp)
        }
    }
}

@Composable
fun FeedRow(f: FeedItem, onClap: (String) -> Unit) {
    val c = Hex.colors
    HCard(Modifier.testTag("feed-${f.id}")) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            PlayerBadge(f.player.slot, f.player.initials, size = 32.dp)
            HText("${f.player.displayName} · ${f.timeLabel}", style = Hex.type.callout, weight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                HText(f.title, style = Hex.type.title2)
                HText(f.subtitle, style = Hex.type.callout, tone = Tone.Ink2)
            }
            f.silhouette?.takeIf { it.isNotEmpty() }?.let { SilhouetteShape(it, c.player(f.player.slot), Modifier.size(72.dp, 56.dp), stroke = c.casing) }
        }
        val shape = RoundedCornerShape(50)
        Row(
            Modifier.defaultMinSize(minHeight = Target.min).clip(shape).background(if (f.clappedByMe) c.inv else c.surf2)
                .clickable(role = Role.Button) { if (!f.clappedByMe) onClap(f.id) }
                .semantics(mergeDescendants = true) { selected = f.clappedByMe; contentDescription = S.friends.clapA11y(f.claps, f.clappedByMe) }
                .padding(horizontal = 12.dp).testTag("clap-${f.id}"),
            horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically,
        ) {
            HIcon(HexIcon.Clap, size = 18.dp, tint = if (f.clappedByMe) c.invInk else c.ink)
            DataText("${f.claps}", color = if (f.clappedByMe) c.invInk else c.ink)
        }
    }
}
