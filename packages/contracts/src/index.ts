/**
 * HexRun API v1 sözleşmesi.
 * Taban yol: /v1 · JSON · kimlik doğrulama: `Authorization: Bearer <accessToken>`.
 * Zamanlar ISO-8601 (UTC) dizgesi; mesafe metre; alan m²; tempo sn/km.
 * Hata gövdesi her zaman `ApiError`.
 */

export type Slot = 'keh' | 'kir' | 'lim' | 'zum' | 'gok' | 'lac' | 'gul' | 'mer';
export type Platform = 'ios' | 'android';
export type RunSource =
  | 'phone'
  | 'apple_watch'
  | 'wear_os'
  | 'garmin'
  | 'coros'
  | 'suunto'
  | 'polar'
  | 'strava'
  | 'apple_health'
  | 'health_connect';

export interface ApiError {
  error: {
    /** Makine kodu, ör. `duel_limit`, `unauthorized`, `validation`. */
    code: string;
    /** Kullanıcıya gösterilebilir Türkçe mesaj. */
    message: string;
    details?: unknown;
  };
}

/* ─────────────── Kimlik ─────────────── */

export interface EmailStartRequest {
  email: string;
}
export interface EmailStartResponse {
  sent: true;
  /** Yalnız geliştirme ortamında döner. */
  devCode?: string;
}
export interface EmailVerifyRequest {
  email: string;
  code: string;
}
export interface AppleAuthRequest {
  identityToken: string;
  /** İlk girişte Apple'ın verdiği ad. */
  fullName?: string;
}
export interface GoogleAuthRequest {
  idToken: string;
}
export interface RefreshRequest {
  refreshToken: string;
}
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  /** Erişim jetonunun ömrü (sn). */
  expiresIn: number;
  user: Me;
  /** Profil kurulumu (kullanıcı adı + imza rengi) gerekiyor mu? */
  needsProfile: boolean;
}

/* ─────────────── Profil ─────────────── */

export interface PublicPlayer {
  id: string;
  username: string;
  displayName: string;
  initials: string;
  slot: Slot;
  teamName: string | null;
  /** Takılı nişanlar (rakiplere görünür). */
  insignia: string[];
  goldFrame: boolean;
}

export interface Me extends PublicPlayer {
  email: string | null;
  createdAt: string;
  /** Çaylak dönemi bittiyse 0. */
  newbieDaysLeft: number;
  teamId: string | null;
  privacy: { enabled: boolean; radiusM: number | null };
  /** Bugün nişan değiştirilebilir mi (günde 1). */
  canChangeInsignia: boolean;
  locale: string;
}

export interface UpdateMeRequest {
  username?: string;
  displayName?: string;
  slot?: Slot;
}
export interface UsernameAvailability {
  username: string;
  available: boolean;
  reason?: 'taken' | 'invalid' | 'reserved';
}
export interface PrivacyRequest {
  /** null → gizlilik bölgesini kapat. Ev konumu sunucuda saklanmaz; yalnız kaydırılmış merkez saklanır. */
  home: { lat: number; lng: number } | null;
  radiusM?: number;
}
export interface PushTokenRequest {
  token: string;
  platform: Platform;
}

/* ─────────────── Harita ─────────────── */

export interface MapCell {
  /** H3 res-12 dizini. */
  id: string;
  /** Sahip yoksa null. Gizlilik bölgesindeyse "hidden:<opaque>" ve ad yok. */
  ownerId: string | null;
  power: number;
  /** Görüntüleyene göre renk (komşu kuralı uygulanmış). */
  slot: Slot | null;
  /** Bu petek görüntüleyenle ilgili bir düelloda mı: `defending` = sana saldırılıyor, `attacking` = senin düellon. */
  duel: 'defending' | 'attacking' | null;
  /** Düelloda en önde giden saldırganın ilerlemesi (yalnız sahibine ve o saldırgana). */
  progress: number | null;
  /** Kuşatılan petekte saldırganın renk slotu (tarama bu renkte çizilir). */
  attackerSlot: Slot | null;
  /** Son 7 günde eriyen güç (hayalet segment). */
  ghost: number;
}

export interface MapPlayer {
  id: string;
  /** Gizli oyuncuda "Gizli oyuncu". */
  displayName: string;
  /** Gizli oyuncuda boş. */
  initials: string;
  slot: Slot;
  goldFrame: boolean;
  hidden: boolean;
  /** İşaretçi konumu (en büyük bölgenin ağırlık merkezi). */
  marker: { lat: number; lng: number } | null;
  cells: number;
}

export interface MapResponse {
  cells: MapCell[];
  players: MapPlayer[];
  /** Görüntüleyenin kendi işaretçisi için: son 48 saatte sana saldıran kişi sayısı. */
  attackersLast48h: number;
  activeEvents: ActiveEvent[];
  /** Kısmi sonuç (sınır aşımı). */
  truncated: boolean;
  serverTime: string;
}

export interface FirstLoopSuggestion {
  /** Önerilen halka (kesikli çizilir). */
  ring: Array<{ lat: number; lng: number }>;
  lengthM: number;
  areaM2: number;
  emptyCells: number;
}

export interface RegionHistoryItem {
  at: string;
  text: string;
}

export interface RegionDetail {
  owner: PublicPlayer | null;
  hidden: boolean;
  /** Dokunulan peteğin sahibine ait bitişik petekler. */
  cells: string[];
  areaM2: number;
  avgPower: number;
  ownedSinceDays: number | null;
  lastDefenseAt: string | null;
  /** Görüntüleyenin bu bölgedeki düellosu (varsa). */
  myDuel: DuelSummary | null;
  /** Sahip görüntüleyense: bu bölgedeki tüm düellolar. */
  incomingDuels: DuelSummary[];
  history: RegionHistoryItem[];
  activeEvents: ActiveEvent[];
  canStartDuel: boolean;
  duelSlotsLeft: number;
}

/* ─────────────── Koşu ─────────────── */

export interface TrackPointDto {
  lat: number;
  lng: number;
  /** Epoch ms. */
  t: number;
  acc?: number;
}

export interface SubmitRunRequest {
  /** İstemcinin ürettiği UUID: tekrar gönderim güvenli (idempotent). */
  clientRunId: string;
  source: RunSource;
  points: TrackPointDto[];
  /** Saat/uygulama kaynağının kendi kimliği. */
  externalId?: string;
  device?: string;
}

export type LoopStatus = 'applied' | 'review' | 'rejected' | 'stats_only';

export interface DuelHitDto {
  duelId: string;
  role: 'attack' | 'defense';
  counted: boolean;
  /** `coverage` kullanıcıya "alan kapsanmadı" diye gösterilir, yüzde gösterilmez. */
  reason?: 'coverage' | 'daily_limit' | 'too_small';
  opponent: PublicPlayer | null;
  hpBefore: number;
  hpAfter: number;
  captured: boolean;
  cells: number;
}

export interface LoopResult {
  index: number;
  status: LoopStatus;
  closedAt: string;
  lengthM: number;
  areaM2: number;
  cells: number;
  newCells: number;
  reinforced: number;
  capturedCells: number;
  gainedAreaM2: number;
  hits: DuelHitDto[];
  multipliers: { gain: number; attack: number; pushback: number };
}

export interface DuelSuggestion {
  defender: PublicPlayer;
  cells: string[];
  avgPower: number;
  routeLengthM: number;
}

export interface RunSummary {
  id: string;
  source: RunSource;
  startedAt: string;
  endedAt: string;
  distanceM: number;
  durationMs: number;
  paceSecPerKm: number | null;
  loops: LoopResult[];
  /** Halka kapanmadıysa: başlangıca kalan mesafe (öneri: "+430 m"). */
  openGapM: number | null;
  status: 'applied' | 'review' | 'open' | 'stats_only' | 'duplicate';
  review: { reasons: string[]; paceSecPerKm?: number; segmentM?: number; note?: string } | null;
  newBadges: BadgeDto[];
  streakDays: number;
  monthDistanceM: number;
  suggestions: DuelSuggestion[];
  totalGainedAreaM2: number;
}

export interface RunListItem {
  id: string;
  source: RunSource;
  startedAt: string;
  endedAt: string;
  distanceM: number;
  durationMs: number;
  status: RunSummary['status'];
  gainedAreaM2: number;
  loops: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/* ─────────────── Düello ─────────────── */

export interface CreateDuelRequest {
  cells: string[];
}

export type DuelStatus = 'active' | 'won' | 'expired' | 'closed' | 'reset' | 'cancelled';

export interface DuelSummary {
  id: string;
  status: DuelStatus;
  attacker: PublicPlayer;
  defender: PublicPlayer;
  cells: string[];
  /** Düello canı (alanın ortalama gücü − ilerleme). */
  hp: number;
  power: number;
  progress: number;
  createdAt: string;
  firstCountedAt: string | null;
  lastAttackAt: string | null;
  attacksToday: number;
  attackLimitToday: number;
  defensesToday: number;
  /** Tahmini kaç halka daha (mevcut çarpanlarla). */
  loopsToCapture: number;
  /** Alanı dolaşan önerilen rota. */
  route: Array<{ lat: number; lng: number }>;
  routeLengthM: number;
  /** 48 sa içinde sayılan halka gelmezse silinir. */
  expiresAt: string | null;
}

export interface DuelPreview {
  ok: boolean;
  error?: 'self' | 'size' | 'not_owned' | 'mixed_owner' | 'not_connected' | 'limit' | 'overlap' | 'duplicate_cells';
  cells: number;
  areaM2: number;
  avgPower: number;
  routeLengthM: number;
  estMinutes: number;
  slotsLeft: number;
}

/* ─────────────── İlerleme ─────────────── */

export interface StatsResponse {
  territoryM2: number;
  cells: number;
  regionRank: number | null;
  regionName: string | null;
  monthDistanceM: number;
  avgPaceSecPerKm: number | null;
  defenses: { won: number; total: number };
  biggestLoopM2: number;
  streakDays: number;
  bestStreakDays: number;
  /** Son 14 gün: her gün kazanılan m². */
  last14Days: Array<{ day: string; gainedM2: number; ran: boolean }>;
  recent: Array<{ at: string; text: string; delta: string }>;
  /** Bölge silüetleri (görsel). */
  silhouettes: Array<Array<{ lat: number; lng: number }>>;
}

export interface BadgeDto {
  id: string;
  name: string;
  category: string;
  how: string;
  earned: boolean;
  earnedAt: string | null;
  progress: [number, number];
  insignia: { kind: string; effect: string; slot: boolean; counter: string } | null;
}

export interface BadgesResponse {
  earned: number;
  total: number;
  badges: BadgeDto[];
  nearest: BadgeDto[];
  /** Takılı nişanlar, 3 slot (boş = null). */
  slots: Array<string | null>;
  canChangeInsignia: boolean;
}

export interface SetInsigniaRequest {
  slots: Array<string | null>;
}

export interface ShieldRequest {
  cells: string[];
}

/* ─────────────── Lig, takım, sosyal ─────────────── */

export type LeagueScope = 'individual' | 'team';
export type LeaguePeriod = 'week' | 'month' | 'all';

export interface LeagueRow {
  rank: number;
  id: string;
  name: string;
  initials: string;
  slot: Slot;
  /** Dönemde kazanılan alan (hafta/ay) ya da toplam toprak (tümü). */
  valueM2: number;
  /** Önceki döneme göre sıra değişimi. */
  delta: number | null;
  subtitle: string | null;
  isMe: boolean;
}

export interface LeagueResponse {
  regionId: string;
  regionName: string;
  scope: LeagueScope;
  period: LeaguePeriod;
  rows: LeagueRow[];
  me: LeagueRow | null;
  /** "2.'ye 420 m² önde" gibi. */
  meNote: string | null;
  endsAt: string | null;
  updatedAt: string;
}

export interface TeamMember {
  player: PublicPlayer;
  role: 'captain' | 'member';
  territoryM2: number;
}

export interface TeamResponse {
  id: string;
  name: string;
  slot: Slot;
  inviteCode: string | null;
  captain: PublicPlayer;
  members: TeamMember[];
  territoryM2: number;
  weekGainM2: number;
  cells: number;
  regionRank: number | null;
}

export interface CreateTeamRequest {
  name: string;
}
export interface JoinTeamRequest {
  code: string;
}

export interface FriendItem {
  player: PublicPlayer;
  /** Oyun ilişkisi: "seni kuşatıyor", "şu an koşuyor", "bu hafta 3 halka". */
  relation: string;
  status: 'besieging_you' | 'running' | 'idle' | 'you_besiege';
}

export interface FriendsResponse {
  friends: FriendItem[];
  inviteCode: string;
}

export interface FeedItem {
  id: string;
  player: PublicPlayer;
  kind: 'conquest' | 'badge' | 'streak';
  title: string;
  subtitle: string;
  /** Yuvarlanmış zaman ("2 sa önce"). */
  timeLabel: string;
  claps: number;
  clappedByMe: boolean;
  silhouette: Array<Array<{ lat: number; lng: number }>> | null;
}

/* ─────────────── Bildirim, etkinlik ─────────────── */

export type NotificationKind =
  | 'duel_started'
  | 'siege_warn'
  | 'siege_alarm'
  | 'cells_lost'
  | 'duel_won'
  | 'duel_reset'
  | 'duel_expired'
  | 'decay_warning'
  | 'decay_lost'
  | 'event_started'
  | 'badge'
  | 'team'
  | 'review_result';

export interface NotificationDto {
  id: string;
  kind: NotificationKind;
  category: 'siege' | 'region' | 'team' | 'other';
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  /** Satır içi eylem: Savun → koşu, Geri al → düello seçimi. */
  action: { label: string; deeplink: string } | null;
}

export interface ActiveEvent {
  id: 'morning' | 'blitz' | 'evening';
  name: string;
  move: 'gain' | 'attack' | 'pushback';
  multiplier: number;
  window: string;
  description: string;
  active: boolean;
  endsInMin: number | null;
  startsInMin: number;
  participantsToday: number;
}

/* ─────────────── Entegrasyon, paylaşım ─────────────── */

export type Provider = 'garmin' | 'coros' | 'suunto' | 'polar' | 'strava';

export interface IntegrationDto {
  provider: Provider | 'apple_health' | 'health_connect' | 'apple_watch' | 'wear_os';
  connected: boolean;
  /** Strava: alma ve gönderme ayrı ayrı açılır. */
  importEnabled: boolean;
  exportEnabled: boolean;
  lastSyncAt: string | null;
  device: string | null;
}

export interface ShareCard {
  dateLabel: string;
  kicker: string;
  gainedAreaM2: number;
  line: string;
  distanceM: number;
  durationMs: number;
  paceSecPerKm: number | null;
  username: string;
  teamName: string | null;
  slot: Slot;
  /** Gizlilik bölgesi dışındaki petek silüeti; harita, rota, rakip adı yok. */
  silhouette: Array<Array<{ lat: number; lng: number }>>;
}

export const API_VERSION = 'v1';

/* ─────────────── Ek uç noktalar ─────────────── */

/** PUT /v1/me/activity — koşu başlarken true, biterken false. */
export interface ActivityRequest {
  running: boolean;
}

/** POST /v1/events/:id/remind — "Hatırlat". */
export interface RemindRequest {
  on: boolean;
}

/** POST /v1/integrations/:provider/connect */
export interface ConnectRequest {
  device?: string;
}
export interface ConnectResponse {
  /** OAuth sağlayıcılarında tarayıcıda açılacak adres; cihaz kaynaklarında null. */
  url: string | null;
}

/** POST /v1/feed/:id/clap */
export interface ClapResponse {
  claps: number;
  clappedByMe: boolean;
}
