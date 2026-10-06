/**
 * 40 rozet. Bazıları "nişan" olarak takılabilir ve haritada iş görür.
 * İlke: hiçbir nişan %20'den fazla etki vermez; nişan + etkinlik toplamı en çok 2x.
 * Kolaylık nişanları (seri dondurma) slot kullanmaz, hep açıktır.
 */
export type BadgeCategory = 'halka' | 'toprak' | 'duello' | 'savunma' | 'seri' | 'zaman' | 'mesafe' | 'sosyal';

export interface PlayerStats {
  loopsClosed: number;
  emptyCellsClaimed: number;
  territoryM2: number;
  peakTerritoryM2: number;
  biggestLoopM2: number;
  duelsWon: number;
  recaptures: number;
  defenses: number;
  duelsDefended: number;
  bestStreakDays: number;
  earlyRuns: number;
  lateRuns: number;
  morningConquests: number;
  blitzAttacks: number;
  eveningDefenses: number;
  longestRunM: number;
  bestMonthDistanceM: number;
  totalDistanceM: number;
  inTeam: boolean;
  friends: number;
  clapsReceived: number;
  importedRuns: number;
  daysSinceSignup: number;
}

export const EMPTY_STATS: PlayerStats = {
  loopsClosed: 0,
  emptyCellsClaimed: 0,
  territoryM2: 0,
  peakTerritoryM2: 0,
  biggestLoopM2: 0,
  duelsWon: 0,
  recaptures: 0,
  defenses: 0,
  duelsDefended: 0,
  bestStreakDays: 0,
  earlyRuns: 0,
  lateRuns: 0,
  morningConquests: 0,
  blitzAttacks: 0,
  eveningDefenses: 0,
  longestRunM: 0,
  bestMonthDistanceM: 0,
  totalDistanceM: 0,
  inTeam: false,
  friends: 0,
  clapsReceived: 0,
  importedRuns: 0,
  daysSinceSignup: 0,
};

export type InsigniaKind = 'kural' | 'kesif' | 'rovans' | 'savunma' | 'sinsilik' | 'kimlik' | 'kolaylik';

export interface Badge {
  id: string;
  name: string;
  category: BadgeCategory;
  /** Nasıl kazanılır (kullanıcıya gösterilir). */
  how: string;
  /** İlerleme: [mevcut, hedef]. */
  progress: (s: PlayerStats) => [number, number];
  /** Takılabilir nişan etkisi. */
  insignia?: { kind: InsigniaKind; effect: string; slot: boolean; counter: string };
}

const P = (key: keyof PlayerStats, target: number) => (s: PlayerStats): [number, number] => [
  Math.min(Number(s[key]), target),
  target,
];

export const BADGES: readonly Badge[] = [
  { id: 'ilk-halka', name: 'İlk Halka', category: 'halka', how: 'İlk halkanı kapat', progress: P('loopsClosed', 1) },
  {
    id: 'halka-ustasi',
    name: 'Halka Ustası',
    category: 'halka',
    how: '10 halka kapat',
    progress: P('loopsClosed', 10),
    insignia: { kind: 'kural', effect: "Halka 50 m yerine 60 m'de kapanır", slot: true, counter: 'Yok · alanı büyütmez' },
  },
  { id: 'halka-50', name: 'Elli Halka', category: 'halka', how: '50 halka kapat', progress: P('loopsClosed', 50) },
  { id: 'halka-100', name: 'Yüz Halka', category: 'halka', how: '100 halka kapat', progress: P('loopsClosed', 100) },
  { id: 'halka-500', name: 'Halka Efsanesi', category: 'halka', how: '500 halka kapat', progress: P('loopsClosed', 500) },
  {
    id: 'oncu',
    name: 'Öncü',
    category: 'toprak',
    how: '100 boş petek al',
    progress: P('emptyCellsClaimed', 100),
    insignia: { kind: 'kesif', effect: 'Boş petekler 12 güçle başlar', slot: true, counter: 'Yok' },
  },
  { id: 'toprak-10k', name: 'On Bin', category: 'toprak', how: '10.000 m² toprağa sahip ol', progress: P('territoryM2', 10_000) },
  {
    id: 'toprak-50k',
    name: 'Elli Bin',
    category: 'toprak',
    how: 'Bir ara 50.000 m² toprağa sahip ol',
    progress: P('peakTerritoryM2', 50_000),
    insignia: { kind: 'kimlik', effect: 'İşaretçinde altın çerçeve', slot: true, counter: 'Yok · yalnız görünüm' },
  },
  { id: 'toprak-100k', name: 'Yüz Bin', category: 'toprak', how: 'Bir ara 100.000 m² toprağa sahip ol', progress: P('peakTerritoryM2', 100_000) },
  { id: 'toprak-250k', name: 'Çeyrek Milyon', category: 'toprak', how: 'Bir ara 250.000 m² toprağa sahip ol', progress: P('peakTerritoryM2', 250_000) },
  { id: 'genis-halka', name: 'Geniş Halka', category: 'halka', how: 'Tek halkada 10.000 m² çevrele', progress: P('biggestLoopM2', 10_000) },
  { id: 'dev-halka', name: 'Dev Halka', category: 'halka', how: 'Tek halkada 30.000 m² çevrele', progress: P('biggestLoopM2', 30_000) },
  { id: 'ilk-zafer', name: 'İlk Zafer', category: 'duello', how: 'İlk düellonu kazan', progress: P('duelsWon', 1) },
  { id: 'akinci', name: 'Akıncı', category: 'duello', how: '5 düello kazan', progress: P('duelsWon', 5) },
  { id: 'fatih', name: 'Fatih', category: 'duello', how: '25 düello kazan', progress: P('duelsWon', 25) },
  {
    id: 'geri-alan',
    name: 'Geri Alan',
    category: 'duello',
    how: 'Kaybettiğin petekleri 7 gün içinde geri al',
    progress: P('recaptures', 1),
    insignia: { kind: 'rovans', effect: 'Kaybettiği peteklere 7 gün +%20 saldırır', slot: true, counter: 'İlk günlerde savunma halkası at' },
  },
  {
    id: 'ilk-kalkan',
    name: 'İlk Kalkan',
    category: 'savunma',
    how: 'Bir saldırganı halkanla geri it',
    progress: P('defenses', 1),
    insignia: { kind: 'savunma', effect: 'Düello hasarı −%10', slot: true, counter: 'Bir halka fazla at' },
  },
  {
    id: 'sur',
    name: 'Sur',
    category: 'savunma',
    how: '10 kez geri it',
    progress: P('defenses', 10),
    insignia: { kind: 'savunma', effect: 'Halka atmadığın günler güç %20 yavaş erir', slot: true, counter: 'Daha uzun kuşat' },
  },
  {
    id: 'kale-bekcisi',
    name: 'Kale Bekçisi',
    category: 'savunma',
    how: '5 düelloyu toprak kaybetmeden atlat',
    progress: P('duelsDefended', 5),
    insignia: { kind: 'savunma', effect: 'Haftada 1 kez seçtiğin peteklere 24 sa kalkan (hasar −%20)', slot: true, counter: 'Kalkan bitince saldır' },
  },
  { id: 'demir-kale', name: 'Demir Kale', category: 'savunma', how: '25 düelloyu toprak kaybetmeden atlat', progress: P('duelsDefended', 25) },
  {
    id: 'seri-7',
    name: '7 Gün',
    category: 'seri',
    how: 'Bir hafta her gün koş',
    progress: P('bestStreakDays', 7),
    insignia: { kind: 'kolaylik', effect: 'Ayda 1 kaçırılan gün affedilir', slot: false, counter: 'Yok' },
  },
  {
    id: 'seri-30',
    name: '30 Gün',
    category: 'seri',
    how: '30 gün üst üste koş',
    progress: P('bestStreakDays', 30),
    insignia: { kind: 'kolaylik', effect: 'Ayda 2 kaçırılan gün affedilir', slot: false, counter: 'Yok' },
  },
  { id: 'seri-100', name: '100 Gün', category: 'seri', how: '100 gün üst üste koş', progress: P('bestStreakDays', 100) },
  { id: 'seri-365', name: '365 Gün', category: 'seri', how: 'Bir yıl her gün koş', progress: P('bestStreakDays', 365) },
  { id: 'erken-kus', name: 'Erken Kuş', category: 'zaman', how: '06:00 öncesi 10 koşu', progress: P('earlyRuns', 10) },
  {
    id: 'safak-akincisi',
    name: 'Şafak Akıncısı',
    category: 'zaman',
    how: 'Sabah Avantajı sırasında ilk fetih',
    progress: P('morningConquests', 1),
    insignia: { kind: 'sinsilik', effect: 'Düello bildirimin rakibe 2 sa geç gider', slot: true, counter: 'Bildirimleri açık tut' },
  },
  { id: 'gece-kusu', name: 'Gece Kuşu', category: 'zaman', how: '22:00 sonrası 10 koşu', progress: P('lateRuns', 10) },
  { id: 'blitz-ustasi', name: 'Blitz Ustası', category: 'zaman', how: 'Hafta Sonu Blitz sırasında 10 saldırı', progress: P('blitzAttacks', 10) },
  { id: 'aksam-nobeti', name: 'Akşam Nöbeti', category: 'zaman', how: 'Akşam Savunması sırasında 5 kez geri it', progress: P('eveningDefenses', 5) },
  { id: 'on-km', name: 'On Km', category: 'mesafe', how: 'Tek koşuda 10 km', progress: P('longestRunM', 10_000) },
  { id: 'yari-maraton', name: 'Yarı Maraton', category: 'mesafe', how: 'Tek koşuda 21,1 km', progress: P('longestRunM', 21_097) },
  { id: 'maraton', name: 'Maraton', category: 'mesafe', how: 'Tek koşuda 42,2 km', progress: P('longestRunM', 42_195) },
  { id: 'aylik-100', name: 'Ayda 100', category: 'mesafe', how: 'Bir ayda 100 km', progress: P('bestMonthDistanceM', 100_000) },
  { id: 'toplam-500', name: '500 Km', category: 'mesafe', how: 'Toplam 500 km', progress: P('totalDistanceM', 500_000) },
  { id: 'toplam-1000', name: '1000 Km', category: 'mesafe', how: 'Toplam 1000 km', progress: P('totalDistanceM', 1_000_000) },
  { id: 'takim-oyuncusu', name: 'Takım Oyuncusu', category: 'sosyal', how: 'Bir takıma katıl', progress: (s) => [s.inTeam ? 1 : 0, 1] },
  { id: 'mahalle-dostu', name: 'Mahalle Dostu', category: 'sosyal', how: '5 arkadaş edin', progress: P('friends', 5) },
  { id: 'alkislanan', name: 'Alkışlanan', category: 'sosyal', how: '25 alkış al', progress: P('clapsReceived', 25) },
  { id: 'bilekten', name: 'Bilekten', category: 'sosyal', how: 'Saatinden ilk koşunu aktar', progress: P('importedRuns', 1) },
  {
    id: 'caylak-mezunu',
    name: 'Çaylak Mezunu',
    category: 'halka',
    how: 'Çaylak dönemini 5 halkayla bitir',
    progress: (s) => [s.daysSinceSignup >= 14 && s.loopsClosed >= 5 ? 1 : 0, 1],
  },
];

export const BADGE_BY_ID: ReadonlyMap<string, Badge> = new Map(BADGES.map((b) => [b.id, b]));

export function earnedBadges(s: PlayerStats): string[] {
  return BADGES.filter((b) => {
    const [cur, tgt] = b.progress(s);
    return cur >= tgt;
  }).map((b) => b.id);
}

/** Boş koleksiyon bir yapılacaklar listesidir: en yakın N rozet. */
export function nearestBadges(s: PlayerStats, owned: ReadonlySet<string>, n = 3): Array<{ badge: Badge; ratio: number }> {
  return BADGES.filter((b) => !owned.has(b.id))
    .map((b) => {
      const [c, t] = b.progress(s);
      return { badge: b, ratio: t > 0 ? c / t : 0 };
    })
    .sort((a, b) => b.ratio - a.ratio || BADGES.indexOf(a.badge) - BADGES.indexOf(b.badge))
    .slice(0, n);
}

export type InsigniaId = 'halka-ustasi' | 'oncu' | 'toprak-50k' | 'geri-alan' | 'ilk-kalkan' | 'sur' | 'kale-bekcisi' | 'safak-akincisi';

export const SLOT_INSIGNIA: readonly InsigniaId[] = BADGES.filter((b) => b.insignia?.slot).map((b) => b.id as InsigniaId);

export function isSlotInsignia(id: string): id is InsigniaId {
  return (SLOT_INSIGNIA as readonly string[]).includes(id);
}

/** Seri dondurma hakkı (ayda): kolaylık nişanlarından en iyisi, toplanmaz. */
export function streakFreezesPerMonth(owned: ReadonlySet<string>): number {
  if (owned.has('seri-30')) return 2;
  if (owned.has('seri-7')) return 1;
  return 0;
}
