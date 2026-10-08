import { RULES } from '@hexrun/core';
import type { DuelPreview } from '@hexrun/contracts';

export type PaintMode = 'add' | 'remove';

/** Boyama: hareketin ilk peteği seçiliyse silme, değilse ekleme modu. */
export function paintModeFor(first: string, selected: ReadonlySet<string>): PaintMode {
  return selected.has(first) ? 'remove' : 'add';
}

export function applyPaint(selected: ReadonlySet<string>, cell: string, mode: PaintMode, allowed: ReadonlySet<string>): Set<string> {
  const next = new Set(selected);
  if (!allowed.has(cell)) return next;
  if (mode === 'add') {
    if (next.size < RULES.DUEL_MAX_CELLS) next.add(cell);
  } else next.delete(cell);
  return next;
}

export type SelectionState = 'empty' | 'small' | 'big' | 'limit' | 'invalid' | 'ok';

export function selectionState(n: number, preview: DuelPreview | null | undefined): SelectionState {
  if (n === 0) return 'empty';
  if (n < RULES.DUEL_MIN_CELLS) return 'small';
  if (n > RULES.DUEL_MAX_CELLS) return 'big';
  if (preview && !preview.ok) {
    if (preview.error === 'limit') return 'limit';
    if (preview.error === 'size') return n < RULES.DUEL_MIN_CELLS ? 'small' : 'big';
    return 'invalid';
  }
  return 'ok';
}
