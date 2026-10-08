package co.hexrun.app.ui.screens.team

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import co.hexrun.app.data.MeRepository
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.nav.LocalNav
import co.hexrun.app.nav.Routes
import co.hexrun.app.ui.Load
import co.hexrun.app.ui.attempt
import co.hexrun.app.ui.components.ButtonKind
import co.hexrun.app.ui.components.DataText
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HCard
import co.hexrun.app.ui.components.HScreen
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.HexIcon
import co.hexrun.app.ui.components.PlayerBadge
import co.hexrun.app.ui.components.SectionTitle
import co.hexrun.app.ui.components.Skeleton
import co.hexrun.app.ui.components.Stat
import co.hexrun.app.ui.components.StateBlock
import co.hexrun.app.ui.components.TextButtonH
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.screens.auth.hexFieldColors
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Radii
import co.hexrun.app.util.shareText
import co.hexrun.core.api.ErrorText
import co.hexrun.core.api.HexRunApi
import co.hexrun.core.api.LeaguePeriod
import co.hexrun.core.api.LeagueResponse
import co.hexrun.core.api.LeagueScope
import co.hexrun.core.api.TeamResponse
import co.hexrun.core.format.Format
import co.hexrun.core.i18n.S
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class TeamUi(
    /** data null + yüklenmedi → takım yok (204). */
    val team: Load<TeamResponse?> = Load(loading = true),
    val league: LeagueResponse? = null,
    val busy: Boolean = false,
    val error: String? = null,
)

class TeamViewModel(private val api: HexRunApi, private val me: MeRepository) : ViewModel() {
    private val _ui = MutableStateFlow(TeamUi())
    val ui: StateFlow<TeamUi> = _ui.asStateFlow()

    init { load() }

    fun load() {
        _ui.update { it.copy(team = it.team.copy(loading = true, error = null)) }
        viewModelScope.launch {
            attempt { api.myTeam() }
                .onSuccess { t ->
                    _ui.update { it.copy(team = Load(t)) }
                    if (t != null) attempt { api.league(LeagueScope.TEAM, LeaguePeriod.ALL) }.onSuccess { l -> _ui.update { it.copy(league = l) } }
                }
                .onFailure { e -> _ui.update { it.copy(team = it.team.copy(loading = false, error = e)) } }
        }
    }

    private fun mutate(block: suspend () -> TeamResponse?) {
        _ui.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            attempt { block() }
                .onSuccess { t ->
                    _ui.update { it.copy(busy = false, team = Load(t)) }
                    me.refresh()
                    if (t != null) attempt { api.league(LeagueScope.TEAM, LeaguePeriod.ALL) }.onSuccess { l -> _ui.update { it.copy(league = l) } }
                }
                .onFailure { e -> _ui.update { it.copy(busy = false, error = ErrorText.of(e)) } }
        }
    }

    fun create(name: String) = mutate { api.createTeam(name.trim()) }
    fun join(code: String) = mutate { api.joinTeam(code.trim()) }
    fun leave() = mutate { api.leaveTeam(); null }
}

/** 12 · Takım: yalnız üyelerin toplam m²'si ile sıralanır; savunma bireysel. */
@Composable
fun TeamScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val vm: TeamViewModel = viewModel { TeamViewModel(graph.api, graph.me) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    HScreen(title = S.team.title, large = true) {
        val t = ui.team
        when {
            t.initialLoading -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Skeleton(Modifier.fillMaxWidth(0.6f), height = 36.dp); Skeleton(height = 60.dp); Skeleton(height = 120.dp)
            }
            t.failed && t.data == null -> StateBlock(S.common.genericError, action = S.common.retry, onAction = vm::load)
            t.data != null -> TeamView(t.data, ui.league, onLeague = { nav.go(Routes.main("league")) }, onInvite = { code -> context.shareText(S.friends.inviteMessage(code)) }, onLeave = vm::leave)
            else -> NoTeam(ui.busy, ui.error, vm::create, vm::join)
        }
    }
}

@Composable
fun TeamView(team: TeamResponse, league: LeagueResponse?, onLeague: () -> Unit, onInvite: (String) -> Unit, onLeave: () -> Unit) {
    var confirm by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            HText(team.name, style = Hex.type.title1, heading = true)
            HText(
                listOf(S.team.captain(team.captain.displayName), S.team.members(team.members.size), S.team.rank(league?.regionName, team.regionRank)).filter { it.isNotEmpty() }.joinToString(" · "),
                style = Hex.type.callout, tone = Tone.Ink2,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Stat(S.team.shared, Format.area(team.territoryM2), Modifier.weight(1f))
            Stat(S.team.week, "+${Format.area(team.weekGainM2)}", Modifier.weight(1f))
            Stat(S.team.cellsLabel, Format.int(team.cells), Modifier.weight(1f))
        }
        if (league != null && league.rows.isNotEmpty()) {
            HCard {
                SectionTitle(S.team.leagueTitle(league.regionName)) { TextButtonH(S.team.toLeague, onLeague) }
                for (r in league.rows.take(3)) {
                    Row(Modifier.defaultMinSize(minHeight = 36.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        DataText("${r.rank}", Modifier.width(20.dp), tone = Tone.Ink2)
                        HText(r.name, style = Hex.type.callout, weight = if (r.isMe || r.id == team.id) FontWeight.Bold else FontWeight.Medium, modifier = Modifier.weight(1f))
                        DataText("${Format.int(r.valueM2)} m²")
                    }
                }
            }
        }
        SectionTitle(S.team.membersTitle)
        for (m in team.members) {
            Row(
                Modifier.defaultMinSize(minHeight = 48.dp).clearAndSetSemantics { contentDescription = "${m.player.displayName}, ${Format.area(m.territoryM2)}" },
                horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically,
            ) {
                PlayerBadge(m.player.slot, m.player.initials, size = 32.dp)
                Column(Modifier.weight(1f)) {
                    HText(m.player.displayName, style = Hex.type.callout, weight = FontWeight.SemiBold)
                    if (m.role == "captain") HText(S.team.captainRole, style = Hex.type.callout, tone = Tone.Ink2)
                }
                DataText(Format.int(m.territoryM2))
            }
        }
        team.inviteCode?.let { code -> HButton(S.team.inviteCode(code), { onInvite(code) }, Modifier.fillMaxWidth(), kind = ButtonKind.Secondary, icon = HexIcon.Share) }
        HText(S.team.noTeamBody, style = Hex.type.callout, tone = Tone.Ink3)
        HButton(S.team.leave, { confirm = true }, Modifier.fillMaxWidth(), kind = ButtonKind.Danger)
    }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { HText(S.team.leave, style = Hex.type.title2) },
            text = { HText(S.team.leaveConfirm) },
            confirmButton = { TextButtonH(S.team.leave, { confirm = false; onLeave() }) },
            dismissButton = { TextButtonH(S.common.cancel, { confirm = false }) },
            containerColor = Hex.colors.surf,
        )
    }
}

@Composable
fun NoTeam(busy: Boolean, error: String?, onCreate: (String) -> Unit, onJoin: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        StateBlock(S.team.noTeamTitle, icon = HexIcon.Team, body = S.team.noTeamBody)
        HCard {
            OutlinedTextField(name, { name = it.take(32) }, Modifier.fillMaxWidth(), singleLine = true, label = { Text(S.team.createPlaceholder) }, shape = RoundedCornerShape(Radii.s), colors = hexFieldColors())
            HButton(S.team.create, { onCreate(name) }, Modifier.fillMaxWidth(), enabled = name.trim().length >= 3, loading = busy)
        }
        HCard {
            OutlinedTextField(
                code, { code = it.take(20) }, Modifier.fillMaxWidth(), singleLine = true, label = { Text(S.team.joinPlaceholder) },
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters), shape = RoundedCornerShape(Radii.s), colors = hexFieldColors(),
            )
            HButton(S.team.join, { onJoin(code) }, Modifier.fillMaxWidth(), kind = ButtonKind.Secondary, enabled = code.trim().length >= 4, loading = busy)
        }
        if (error != null) HText(error, style = Hex.type.callout)
    }
}
