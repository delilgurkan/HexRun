import type { DuelSummary, MapCell } from '@hexrun/contracts';
import { cellsAreaM2, cellsInPolygon, loopCells, type ClosedLoop, type LatLng } from '@hexrun/core';

export interface DuelCoverage {
  duel: DuelSummary;
  inside: number;
  total: number;
}

export interface ConquestPreview {
  cells: string[];
  /** Sahipsiz (ya da önbellekte bilinmeyen) petekler: senin olur. */
  empty: number;
  /** Zaten senin: güçlenir. */
  own: number;
  /** Rakip petekleri (düello dışında değişmez). */
  rival: number;
  areaM2: number;
  /** Saldırdığın düello alanlarının halka içinde kalan kısmı. */
  duels: DuelCoverage[];
}

export interface ConquestContext {
  myId: string | null;
  /** Son bilinen harita petekleri (id → hücre). */
  cells: ReadonlyMap<string, MapCell>;
  attacking: readonly DuelSummary[];
}

function classify(ids: string[], ctx: ConquestContext): ConquestPreview {
  let empty = 0;
  let own = 0;
  let rival = 0;
  for (const id of ids) {
    const c = ctx.cells.get(id);
    if (!c || !c.ownerId) empty++;
    else if (ctx.myId && c.ownerId === ctx.myId) own++;
    else rival++;
  }
  const set = new Set(ids);
  const duels = ctx.attacking
    .filter((d) => d.status === 'active')
    .map((d) => ({ duel: d, inside: d.cells.filter((c) => set.has(c)).length, total: d.cells.length }))
    .filter((d) => d.inside > 0);
  return { cells: ids, empty, own, rival, areaM2: cellsAreaM2(ids), duels };
}

/** İstemci tarafı fetih önizlemesi (kesin sonuç sunucuda; tolerans gösterilmez). */
export function previewConquest(loop: Pick<ClosedLoop, 'ring'>, ctx: ConquestContext): ConquestPreview {
  return classify(loopCells(loop), ctx);
}

/** Kapanış modunda açık halkanın düz kapatılmış önizlemesi. */
export function previewOpenRing(ring: readonly LatLng[], ctx: ConquestContext): ConquestPreview {
  return classify(ring.length >= 4 ? cellsInPolygon(ring) : [], ctx);
}

/** Dolum dalgası: hücreler başlangıçtan dışa doğru 14 ms arayla, toplam en çok 1,5 sn. */
export function fillSchedule(n: number, perCellMs = 14, maxMs = 1500): number[] {
  if (n <= 0) return [];
  const step = n * perCellMs > maxMs ? maxMs / n : perCellMs;
  return Array.from({ length: n }, (_, i) => Math.round(i * step));
}
