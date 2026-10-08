package co.hexrun.core.ui

import co.hexrun.core.Rules
import co.hexrun.core.api.DuelPreview

/** Düello alanı seçimi (mobile/src/screens/duel/selection.ts). */
object DuelSelection {
    enum class PaintMode { ADD, REMOVE }
    enum class State { EMPTY, SMALL, BIG, LIMIT, INVALID, OK }

    /** Hareketin ilk peteği seçiliyse silme, değilse ekleme modu. */
    fun paintModeFor(first: String, selected: Set<String>): PaintMode = if (first in selected) PaintMode.REMOVE else PaintMode.ADD

    fun applyPaint(selected: Set<String>, cell: String, mode: PaintMode, allowed: Set<String>): Set<String> {
        if (cell !in allowed) return selected
        return when (mode) {
            PaintMode.ADD -> if (selected.size < Rules.DUEL_MAX_CELLS) selected + cell else selected
            PaintMode.REMOVE -> selected - cell
        }
    }

    fun state(n: Int, preview: DuelPreview?): State {
        if (n == 0) return State.EMPTY
        if (n < Rules.DUEL_MIN_CELLS) return State.SMALL
        if (n > Rules.DUEL_MAX_CELLS) return State.BIG
        if (preview != null && !preview.ok) {
            return when (preview.error) {
                "limit" -> State.LIMIT
                "size" -> if (n < Rules.DUEL_MIN_CELLS) State.SMALL else State.BIG
                else -> State.INVALID
            }
        }
        return State.OK
    }
}
