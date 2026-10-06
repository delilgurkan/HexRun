import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BadgesResponse,
  FeedItem,
  LeaguePeriod,
  LeagueScope,
  MapResponse,
  Me,
  Page,
} from '@hexrun/contracts';
import { useServices } from '../services';
import type { Bbox, IntegrationProvider, NotificationFilter } from './endpoints';

export const qk = {
  me: ['me'] as const,
  map: (b: Bbox | null) => ['map', b] as const,
  region: (cell: string) => ['region', cell] as const,
  firstLoop: (lat: number, lng: number) => ['firstLoop', lat.toFixed(3), lng.toFixed(3)] as const,
  duels: ['duels'] as const,
  duel: (id: string) => ['duel', id] as const,
  league: (s: LeagueScope, p: LeaguePeriod) => ['league', s, p] as const,
  team: ['team'] as const,
  friends: ['friends'] as const,
  feed: ['feed'] as const,
  notifications: (f: NotificationFilter) => ['notifications', f] as const,
  events: ['events'] as const,
  integrations: ['integrations'] as const,
  stats: ['stats'] as const,
  badges: ['badges'] as const,
  run: (id: string) => ['run', id] as const,
  share: (id: string) => ['share', id] as const,
};

export function useMe(enabled = true) {
  const { api } = useServices();
  return useQuery({ queryKey: qk.me, queryFn: () => api.me.get(), enabled, staleTime: 60_000 });
}

export function useMap(bbox: Bbox | null) {
  const { api, kv } = useServices();
  return useQuery({
    queryKey: qk.map(bbox),
    enabled: !!bbox,
    queryFn: async ({ signal }) => {
      const res = await api.map.get(bbox!, signal);
      kv.setItem('hexrun.lastMap.v1', JSON.stringify({ at: Date.now(), bbox, res })).catch(() => undefined);
      return res;
    },
    placeholderData: (prev) => prev,
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
}

export async function readLastMap(kv: { getItem(k: string): Promise<string | null> }): Promise<{ at: number; res: MapResponse } | null> {
  try {
    const raw = await kv.getItem('hexrun.lastMap.v1');
    return raw ? (JSON.parse(raw) as { at: number; res: MapResponse }) : null;
  } catch {
    return null;
  }
}

export function useRegion(cell: string | undefined) {
  const { api } = useServices();
  return useQuery({ queryKey: qk.region(cell ?? ''), queryFn: () => api.map.region(cell!), enabled: !!cell });
}

export function useFirstLoop(pos: { lat: number; lng: number } | null, enabled: boolean) {
  const { api } = useServices();
  return useQuery({
    queryKey: qk.firstLoop(pos?.lat ?? 0, pos?.lng ?? 0),
    queryFn: () => api.map.firstLoop(pos!.lat, pos!.lng),
    enabled: enabled && !!pos,
    staleTime: 10 * 60_000,
  });
}

export function useDuels(enabled = true) {
  const { api } = useServices();
  return useQuery({ queryKey: qk.duels, queryFn: () => api.duels.list(), enabled, staleTime: 30_000 });
}

export function useDuel(id: string | undefined) {
  const { api } = useServices();
  return useQuery({ queryKey: qk.duel(id ?? ''), queryFn: () => api.duels.get(id!), enabled: !!id });
}

export function useLeague(scope: LeagueScope, period: LeaguePeriod) {
  const { api } = useServices();
  return useQuery({ queryKey: qk.league(scope, period), queryFn: () => api.league(scope, period), placeholderData: (p) => p });
}

export function useTeam() {
  const { api } = useServices();
  return useQuery({ queryKey: qk.team, queryFn: () => api.teams.mine() });
}

export function useFriends() {
  const { api } = useServices();
  return useQuery({ queryKey: qk.friends, queryFn: () => api.friends.list() });
}

export function useFeed() {
  const { api } = useServices();
  return useInfiniteQuery({
    queryKey: qk.feed,
    queryFn: ({ pageParam }) => api.feed.list(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Alkış: iyimser güncelleme, hata olursa geri al. */
export function useClap() {
  const { api, queryClient } = useServices();
  type Data = { pages: Page<FeedItem>[]; pageParams: (string | null)[] };
  const patch = (id: string, fn: (f: FeedItem) => FeedItem) =>
    queryClient.setQueryData<Data>(qk.feed, (d) => (d ? { ...d, pages: d.pages.map((p) => ({ ...p, items: p.items.map((f) => (f.id === id ? fn(f) : f)) })) } : d));
  return useMutation({
    mutationFn: (id: string) => api.feed.clap(id),
    onMutate: (id) => {
      const prev = queryClient.getQueryData<Data>(qk.feed);
      patch(id, (f) => (f.clappedByMe ? f : { ...f, clappedByMe: true, claps: f.claps + 1 }));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(qk.feed, ctx.prev);
    },
    onSuccess: (res, id) => {
      if (res) patch(id, (f) => ({ ...f, claps: res.claps, clappedByMe: res.clappedByMe }));
    },
  });
}

export function useNotifications(filter: NotificationFilter) {
  const { api } = useServices();
  return useInfiniteQuery({
    queryKey: qk.notifications(filter),
    queryFn: ({ pageParam }) => api.notifications.list(filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useMarkRead() {
  const { api, queryClient } = useServices();
  return useMutation({
    mutationFn: (ids?: string[]) => api.notifications.read(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useEvents() {
  const { api } = useServices();
  return useQuery({ queryKey: qk.events, queryFn: () => api.events(), staleTime: 60_000 });
}

export function useIntegrations() {
  const { api } = useServices();
  return useQuery({ queryKey: qk.integrations, queryFn: () => api.integrations.list() });
}

export function useUpdateIntegration() {
  const { api, queryClient } = useServices();
  return useMutation({
    mutationFn: (v: { p: IntegrationProvider; body: { importEnabled?: boolean; exportEnabled?: boolean } }) => api.integrations.update(v.p, v.body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.integrations }),
  });
}

export function useStats() {
  const { api } = useServices();
  return useQuery({ queryKey: qk.stats, queryFn: () => api.me.stats() });
}

export function useBadges() {
  const { api } = useServices();
  return useQuery({ queryKey: qk.badges, queryFn: () => api.me.badges() });
}

export function useSetInsignia() {
  const { api, queryClient } = useServices();
  return useMutation({
    mutationFn: (slots: Array<string | null>) => api.me.setInsignia({ slots }),
    onSuccess: (res: BadgesResponse) => {
      queryClient.setQueryData(qk.badges, res);
      queryClient.setQueryData<Me>(qk.me, (m) => (m ? { ...m, canChangeInsignia: res.canChangeInsignia } : m));
    },
  });
}

export function useRun(id: string | undefined) {
  const { api } = useServices();
  return useQuery({ queryKey: qk.run(id ?? ''), queryFn: () => api.runs.get(id!), enabled: !!id });
}

export function useShareCard(id: string | undefined) {
  const { api } = useServices();
  return useQuery({ queryKey: qk.share(id ?? ''), queryFn: () => api.runs.share(id!), enabled: !!id });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (key: readonly unknown[]) => qc.invalidateQueries({ queryKey: key });
}
