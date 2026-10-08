package co.hexrun.app.ui.screens.main

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import co.hexrun.app.ui.components.HIcon
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.HexIcon
import co.hexrun.app.ui.screens.events.EventsScreen
import co.hexrun.app.ui.screens.league.LeagueScreen
import co.hexrun.app.ui.screens.map.MapScreen
import co.hexrun.app.ui.screens.team.TeamScreen
import co.hexrun.app.ui.theme.Hex
import co.hexrun.core.i18n.S

private data class Tab(val key: String, val label: String, val icon: HexIcon)

private val TABS = listOf(
    Tab("map", S.tabs.map, HexIcon.Map),
    Tab("league", S.tabs.league, HexIcon.League),
    Tab("team", S.tabs.team, HexIcon.Team),
    Tab("events", S.tabs.events, HexIcon.Events),
)

/**
 * Kök: 4 sekme (Harita · Lig · Takım · Etkinlik) M3 NavigationBar; profil avatardan, bildirimler
 * zilden açılır. Koşu ayrı tam ekran moddur (sekme çubuğu yok).
 */
@Composable
fun MainScreen(initialTab: String) {
    val c = Hex.colors
    var tab by rememberSaveable { mutableStateOf(initialTab) }
    LaunchedEffect(initialTab) { tab = initialTab }
    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when (tab) {
                "league" -> LeagueScreen()
                "team" -> TeamScreen()
                "events" -> EventsScreen()
                else -> MapScreen()
            }
        }
        NavigationBar(containerColor = c.surf, contentColor = c.ink) {
            for (t in TABS) {
                val selected = tab == t.key
                NavigationBarItem(
                    selected = selected,
                    onClick = { tab = t.key },
                    icon = { HIcon(t.icon, tint = if (selected) c.invInk else c.ink2) },
                    label = { HText(t.label, style = Hex.type.label.copy(letterSpacing = Hex.type.body.letterSpacing), color = if (selected) c.ink else c.ink2, weight = if (selected) FontWeight.Bold else FontWeight.SemiBold) },
                    colors = NavigationBarItemDefaults.colors(indicatorColor = c.inv, selectedIconColor = c.invInk, unselectedIconColor = c.ink2, selectedTextColor = c.ink, unselectedTextColor = c.ink2),
                )
            }
        }
    }
}
