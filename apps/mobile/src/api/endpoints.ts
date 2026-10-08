import type {
  ActiveEvent,
  ClapResponse,
  ConnectResponse,
  AuthResponse,
  BadgesResponse,
  CreateDuelRequest,
  CreateTeamRequest,
  DuelPreview,
  DuelSummary,
  EmailStartResponse,
  FeedItem,
  FirstLoopSuggestion,
  FriendsResponse,
  IntegrationDto,
  JoinTeamRequest,
  LeaguePeriod,
  LeagueResponse,
  LeagueScope,
  MapResponse,
  Me,
  NotificationDto,
  Page,
  Platform,
  PrivacyRequest,
  RegionDetail,
  RunListItem,
  RunSummary,
  SetInsigniaRequest,
  ShareCard,
  ShieldRequest,
  StatsResponse,
  SubmitRunRequest,
  TeamResponse,
  UpdateMeRequest,
  UsernameAvailability,
} from '@hexrun/contracts';
import type { ApiClient } from './client';

export type NotificationFilter = 'all' | 'siege' | 'region' | 'team';
export type IntegrationProvider = IntegrationDto['provider'];
export type Bbox = { minLat: number; minLng: number; maxLat: number; maxLng: number };

/** Tüm REST uçları (packages/contracts ile birebir). */
export function createApi(c: ApiClient) {
  return {
    auth: {
      emailStart: (email: string) => c.post<EmailStartResponse>('/auth/email/start', { email }, { auth: false }),
      emailVerify: (email: string, code: string) => c.post<AuthResponse>('/auth/email/verify', { email, code }, { auth: false }),
      apple: (identityToken: string, fullName?: string) =>
        c.post<AuthResponse>('/auth/apple', { identityToken, fullName }, { auth: false }),
      google: (idToken: string) => c.post<AuthResponse>('/auth/google', { idToken }, { auth: false }),
      logout: (refreshToken: string) => c.post<null>('/auth/logout', { refreshToken }, { auth: false }),
    },
    me: {
      get: () => c.get<Me>('/me'),
      update: (body: UpdateMeRequest) => c.patch<Me>('/me', body),
      username: (name: string) => c.get<UsernameAvailability>(`/usernames/${encodeURIComponent(name)}`),
      remove: () => c.delete<null>('/me'),
      export: () => c.get<unknown>('/me/export', undefined, { timeoutMs: 60_000 }),
      privacy: (body: PrivacyRequest) => c.put<Me>('/me/privacy', body),
      pushToken: (token: string, platform: Platform) => c.put<null>('/me/push-token', { token, platform }),
      stats: () => c.get<StatsResponse>('/me/stats'),
      badges: () => c.get<BadgesResponse>('/me/badges'),
      setInsignia: (body: SetInsigniaRequest) => c.put<BadgesResponse>('/me/insignia', body),
      shield: (body: ShieldRequest) => c.post<null>('/me/shield', body),
      /** Koşu başlarken true, biterken false ("şu an koşuyor", koşuda nişan kilidi). */
      activity: (running: boolean) => c.put<null>('/me/activity', { running }),
    },
    map: {
      get: (b: Bbox, signal?: AbortSignal) =>
        c.get<MapResponse>('/map', { bbox: [b.minLat, b.minLng, b.maxLat, b.maxLng].map((x) => x.toFixed(6)).join(',') }, { signal }),
      region: (cell: string) => c.get<RegionDetail>('/map/region', { cell }),
      /** 204 → null (öneri yok). */
      firstLoop: (lat: number, lng: number) => c.get<FirstLoopSuggestion | null>('/map/first-loop', { lat, lng }),
    },
    runs: {
      submit: (body: SubmitRunRequest) => c.post<RunSummary>('/runs', body, { timeoutMs: 45_000 }),
      list: (cursor?: string | null) => c.get<Page<RunListItem>>('/runs', { cursor: cursor ?? undefined }),
      get: (id: string) => c.get<RunSummary>(`/runs/${id}`),
      note: (id: string, text: string) => c.post<null>(`/runs/${id}/note`, { text }),
      share: (id: string) => c.get<ShareCard>(`/runs/${id}/share`),
    },
    duels: {
      preview: (body: CreateDuelRequest) => c.post<DuelPreview>('/duels/preview', body),
      create: (body: CreateDuelRequest) => c.post<DuelSummary>('/duels', body),
      list: () => c.get<{ attacking: DuelSummary[]; defending: DuelSummary[] }>('/duels'),
      get: (id: string) => c.get<DuelSummary>(`/duels/${id}`),
      cancel: (id: string) => c.delete<null>(`/duels/${id}`),
    },
    league: (scope: LeagueScope, period: LeaguePeriod) => c.get<LeagueResponse>('/league', { scope, period }),
    teams: {
      /** 204 → null (takım yok). */
      mine: () => c.get<TeamResponse | null>('/teams/mine'),
      get: (id: string) => c.get<TeamResponse>(`/teams/${id}`),
      create: (body: CreateTeamRequest) => c.post<TeamResponse>('/teams', body),
      join: (body: JoinTeamRequest) => c.post<TeamResponse>('/teams/join', body),
      leave: () => c.post<null>('/teams/leave'),
    },
    friends: {
      list: () => c.get<FriendsResponse>('/friends'),
      accept: (code: string) => c.post<FriendsResponse>('/friends/accept', { code }),
      remove: (id: string) => c.delete<null>(`/friends/${id}`),
    },
    feed: {
      list: (cursor?: string | null) => c.get<Page<FeedItem>>('/feed', { cursor: cursor ?? undefined }),
      clap: (id: string) => c.post<ClapResponse | null>(`/feed/${id}/clap`),
    },
    notifications: {
      list: (filter: NotificationFilter, cursor?: string | null) =>
        c.get<Page<NotificationDto>>('/notifications', { filter, cursor: cursor ?? undefined }),
      read: (ids?: string[]) => c.post<null>('/notifications/read', ids ? { ids } : {}),
    },
    events: () => c.get<ActiveEvent[]>('/events'),
    remindEvent: (id: 'morning' | 'blitz' | 'evening', on: boolean) => c.post<null>(`/events/${id}/remind`, { on }),
    integrations: {
      list: () => c.get<IntegrationDto[]>('/integrations'),
      connect: (p: IntegrationProvider, device?: string) => c.post<ConnectResponse>(`/integrations/${p}/connect`, device ? { device } : {}),
      update: (p: IntegrationProvider, body: { importEnabled?: boolean; exportEnabled?: boolean }) =>
        c.patch<IntegrationDto>(`/integrations/${p}`, body),
      disconnect: (p: IntegrationProvider) => c.delete<null>(`/integrations/${p}`),
    },
  };
}

export type Api = ReturnType<typeof createApi>;
