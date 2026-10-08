package co.hexrun.core

import co.hexrun.core.api.DuelPreview
import co.hexrun.core.api.LoopResult
import co.hexrun.core.api.RunSummary
import co.hexrun.core.api.ActiveEvent
import co.hexrun.core.i18n.S
import co.hexrun.core.ui.Conquest
import co.hexrun.core.ui.Dates
import co.hexrun.core.ui.DuelSelection
import co.hexrun.core.ui.EventsUi
import co.hexrun.core.ui.RunUi
import co.hexrun.core.ui.SummaryVariant
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals

class UiHelpersTest {
    private fun ms(s: String) = Instant.parse(s).toEpochMilli()

    @Test
    fun dates() {
        assertEquals("4 Ekim Pazar · 06:29–07:14", Dates.runRangeLabel("2026-10-04T03:29:00Z", "2026-10-04T04:14:00Z"))
        assertEquals("4 EKİM 2026", Dates.shareDateLabel(ms("2026-10-04T03:29:00Z")))
        val now = ms("2026-10-05T10:00:00Z")
        assertEquals("Bugün 06:52", Dates.relativeLabel(ms("2026-10-05T03:52:00Z"), now))
        assertEquals("Dün 21:30", Dates.relativeLabel(ms("2026-10-04T18:30:00Z"), now))
        assertEquals("11 Eyl", Dates.relativeLabel(ms("2026-09-11T08:00:00Z"), now))
        assertEquals(Dates.DayGroup.WEEK, Dates.dayGroup(ms("2026-10-01T08:00:00Z"), now))
    }

    @Test
    fun events() {
        val t = ms("2026-10-10T04:00:00Z") // Cumartesi 07:00 İstanbul
        val list = EventsUi.resolve(listOf(ActiveEvent(id = "morning", name = "Sabah Avantajı", multiplier = 2.0, participantsToday = 1240)), t)
        assertEquals(listOf(true, true, false), list.map { it.active })
        assertEquals(1240, list[0].participantsToday)
        assertEquals("güç 2x · saldırı 2x", EventsUi.shortLabel(list.filter { it.active }))
        assertEquals("08:59", EventsUi.endsAtLabel(list[0].endsInMin, t))
        assertEquals("2 g 3 sa sonra", S.events.startsIn(51, 0))
        assertEquals("savunma 1,5x", EventsUi.shortLabel(listOf(ActiveEvent(id = "evening", move = "pushback", multiplier = 1.5))))
    }

    @Test
    fun selection() {
        val allowed = setOf("a", "b", "c")
        assertEquals(DuelSelection.PaintMode.ADD, DuelSelection.paintModeFor("a", emptySet()))
        assertEquals(DuelSelection.PaintMode.REMOVE, DuelSelection.paintModeFor("a", setOf("a")))
        assertEquals(setOf("a"), DuelSelection.applyPaint(emptySet(), "a", DuelSelection.PaintMode.ADD, allowed))
        assertEquals(emptySet(), DuelSelection.applyPaint(emptySet(), "z", DuelSelection.PaintMode.ADD, allowed))
        assertEquals(DuelSelection.State.EMPTY, DuelSelection.state(0, null))
        assertEquals(DuelSelection.State.SMALL, DuelSelection.state(3, null))
        assertEquals(DuelSelection.State.BIG, DuelSelection.state(61, null))
        assertEquals(DuelSelection.State.LIMIT, DuelSelection.state(10, DuelPreview(ok = false, error = "limit")))
        assertEquals(DuelSelection.State.INVALID, DuelSelection.state(10, DuelPreview(ok = false, error = "not_connected")))
        assertEquals(DuelSelection.State.OK, DuelSelection.state(10, DuelPreview(ok = true)))
    }

    @Test
    fun summaryAndConquest() {
        assertEquals(SummaryVariant.REVIEW, RunUi.summaryVariant(RunSummary(id = "1", status = "review")))
        assertEquals(SummaryVariant.OPEN, RunUi.summaryVariant(RunSummary(id = "1", status = "open")))
        assertEquals(SummaryVariant.CLOSED, RunUi.summaryVariant(RunSummary(id = "1", loops = listOf(LoopResult(newCells = 3)))))
        assertEquals(listOf(0L, 14L, 28L), Conquest.fillSchedule(3))
        assertEquals(1500.0 / 200 * 199, Conquest.fillSchedule(200).last().toDouble(), 1.0)
        assertEquals("62 petek senin: 41'i boştu, 21 tanesi güçlendi.", S.conquest.headline(62, 41, 21))
        assertEquals("1 petek senin: 1'i boştu.", S.conquest.headline(1, 1, 0))
        assertEquals("62 petek senin, 48'i düelloyla", S.summary.closedHead(62, 48))
        assertEquals(listOf("ü", "i", "si", "sı", "u", "ı", "ü", "i"), listOf(14, 48, 2, 6, 10, 40, 100, 2000).map { co.hexrun.core.i18n.TrGrammar.possessive(it) })
    }
}
