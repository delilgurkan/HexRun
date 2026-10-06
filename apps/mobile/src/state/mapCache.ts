import type { DuelSummary, MapCell, MapResponse } from '@hexrun/contracts';

/** Son bilinen harita ve düellolar: koşu sırasında fetih önizlemesi ve düello kapsaması için. */
const cache: { myId: string | null; cells: Map<string, MapCell>; attacking: DuelSummary[]; defending: DuelSummary[] } = {
  myId: null,
  cells: new Map(),
  attacking: [],
  defending: [],
};

export function rememberMap(res: MapResponse, myId: string | null) {
  cache.myId = myId;
  for (const c of res.cells) cache.cells.set(c.id, c);
  // Bellek sınırı.
  if (cache.cells.size > 20_000) {
    const drop = cache.cells.size - 20_000;
    let i = 0;
    for (const k of cache.cells.keys()) {
      if (i++ >= drop) break;
      cache.cells.delete(k);
    }
  }
}

export function rememberDuels(d: { attacking: DuelSummary[]; defending: DuelSummary[] }) {
  cache.attacking = d.attacking;
  cache.defending = d.defending;
}

export function rememberMe(id: string | null) {
  cache.myId = id;
}

export function mapCache() {
  return cache;
}
