import type { BadgeDto, BadgesResponse, LeagueResponse, Me, NotificationDto, PublicPlayer, RunSummary, LoopResult, MapResponse } from '@hexrun/contracts';

export const player = (id: string, name: string, slot: PublicPlayer['slot'], ini: string): PublicPlayer => ({
  id,
  username: name.toLowerCase().replace(/\s/g, ''),
  displayName: name,
  initials: ini,
  slot,
  teamName: null,
  insignia: [],
  goldFrame: false,
});

export const me: Me = {
  ...player('me', 'Deniz Arslan', 'keh', 'DA'),
  username: 'denizkosar',
  teamName: 'Moda Rüzgarı',
  email: 'deniz@example.com',
  createdAt: '2026-08-01T00:00:00Z',
  newbieDaysLeft: 0,
  teamId: 't1',
  privacy: { enabled: false, radiusM: null },
  canChangeInsignia: true,
  locale: 'tr',
};

const loop = (o: Partial<LoopResult> = {}): LoopResult => ({
  index: 1,
  status: 'applied',
  closedAt: '2026-10-04T04:14:00Z',
  lengthM: 3000,
  areaM2: 19220,
  cells: 62,
  newCells: 14,
  reinforced: 0,
  capturedCells: 48,
  gainedAreaM2: 19220,
  hits: [],
  multipliers: { gain: 2, attack: 2, pushback: 1 },
  ...o,
});

const base: RunSummary = {
  id: 'run-1',
  source: 'phone',
  startedAt: '2026-10-04T03:29:00Z',
  endedAt: '2026-10-04T04:14:00Z',
  distanceM: 8400,
  durationMs: 45 * 60_000 + 13_000,
  paceSecPerKm: 323,
  loops: [],
  openGapM: null,
  status: 'applied',
  review: null,
  newBadges: [],
  streakDays: 35,
  monthDistanceM: 126_400,
  suggestions: [],
  totalGainedAreaM2: 0,
};

const emre = player('emre', 'Emre Şahin', 'lim', 'EŞ');

export const summaryClosed: RunSummary = {
  ...base,
  loops: [
    loop({
      hits: [{ duelId: 'd1', role: 'attack', counted: true, opponent: emre, hpBefore: 20, hpAfter: 0, captured: true, cells: 48 }],
    }),
  ],
  totalGainedAreaM2: 19220,
  newBadges: [{ id: 'safak-akincisi', name: 'Şafak Akıncısı', category: 'zaman', how: 'Sabah Avantajı sırasında ilk fetih', earned: true, earnedAt: '2026-10-04T04:14:00Z', progress: [1, 1], insignia: null }],
};

export const summaryOpen: RunSummary = { ...base, status: 'open', openGapM: 430, distanceM: 7950, paceSecPerKm: 331 };

export const summarySuggestion: RunSummary = {
  ...base,
  loops: [loop({ newCells: 6, capturedCells: 0, cells: 6, gainedAreaM2: 1860 })],
  totalGainedAreaM2: 1860,
  suggestions: [{ defender: player('zeynep', 'Zeynep Çelik', 'gok', 'ZÇ'), cells: Array.from({ length: 21 }, (_, i) => `c${i}`), avgPower: 55, routeLengthM: 4600 }],
};

export const summaryReview: RunSummary = {
  ...base,
  status: 'review',
  distanceM: 6100,
  loops: [loop({ status: 'review', cells: 44 })],
  review: { reasons: ['speed'], paceSecPerKm: 125, segmentM: 1200 },
};

const badge = (id: string, name: string, earned: boolean, progress: [number, number], insignia: BadgeDto['insignia'] = null): BadgeDto => ({
  id,
  name,
  category: 'halka',
  how: `${name} nasıl`,
  earned,
  earnedAt: earned ? '2026-09-21T10:00:00Z' : null,
  progress,
  insignia,
});

export const badgesEmpty: BadgesResponse = {
  earned: 0,
  total: 40,
  badges: [badge('ilk-halka', 'İlk Halka', false, [0, 1]), badge('seri-7', '7 Gün', false, [3, 7]), badge('erken-kus', 'Erken Kuş', false, [2, 10])],
  nearest: [badge('ilk-halka', 'İlk Halka', false, [0, 1]), badge('seri-7', '7 Gün', false, [3, 7]), badge('erken-kus', 'Erken Kuş', false, [2, 10])],
  slots: [null, null, null],
  canChangeInsignia: true,
};

export const badgesFull: BadgesResponse = {
  earned: 2,
  total: 40,
  badges: [
    badge('halka-ustasi', 'Halka Ustası', true, [10, 10], { kind: 'kural', effect: "Halka 50 m yerine 60 m'de kapanır", slot: true, counter: 'Yok' }),
    badge('oncu', 'Öncü', true, [100, 100], { kind: 'kesif', effect: 'Boş petekler 12 güçle başlar', slot: true, counter: 'Yok' }),
    badge('sur', 'Sur', false, [4, 10]),
  ],
  nearest: [],
  slots: ['oncu', null, null],
  canChangeInsignia: true,
};

export const league = (rows = 5): LeagueResponse => ({
  regionId: 'r1',
  regionName: 'Kadıköy',
  scope: 'individual',
  period: 'week',
  rows: Array.from({ length: rows }, (_, i) => ({
    rank: i + 1,
    id: i === 0 ? 'me' : `p${i}`,
    name: i === 0 ? 'Deniz Arslan' : `Oyuncu ${i}`,
    initials: i === 0 ? 'DA' : `O${i}`,
    slot: 'gok' as const,
    valueM2: 31620 - i * 1000,
    delta: i === 0 ? 13 : -1,
    subtitle: null,
    isMe: i === 0,
  })),
  me: rows ? { rank: 1, id: 'me', name: 'Deniz Arslan', initials: 'DA', slot: 'keh', valueM2: 31620, delta: 13, subtitle: null, isMe: true } : null,
  meNote: rows ? "2.'ye 420 m² önde" : null,
  endsAt: new Date(Date.now() + (2 * 24 + 7) * 3_600_000 + 60_000).toISOString(),
  updatedAt: new Date().toISOString(),
});

export const notifications: NotificationDto[] = [
  {
    id: 'n1',
    kind: 'siege_warn',
    category: 'siege',
    title: "Selin'le düello · 17 petek",
    body: "Blitz'te 2 halka daha atarsa onun olur",
    createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    read: false,
    action: { label: 'Savun', deeplink: 'hexrun://run?defend=d9' },
  },
  {
    id: 'n2',
    kind: 'duel_won',
    category: 'region',
    title: "Emre'yle düelloyu kazandın",
    body: '48 petek 50 güçle senin',
    createdAt: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    read: true,
    action: null,
  },
  {
    id: 'n3',
    kind: 'decay_warning',
    category: 'region',
    title: 'Kalamış eriyor',
    body: '3 gündür halka yok · 12 petek · güç 64 → 54',
    createdAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    read: true,
    action: null,
  },
];

export const mapResponse = (cells: MapResponse['cells'] = []): MapResponse => ({
  cells,
  players: [{ id: 'me', displayName: 'Deniz Arslan', initials: 'DA', slot: 'keh', goldFrame: false, hidden: false, marker: { lat: 40.987, lng: 29.03 }, cells: cells.length }],
  attackersLast48h: 3,
  activeEvents: [],
  truncated: false,
  serverTime: new Date().toISOString(),
});
