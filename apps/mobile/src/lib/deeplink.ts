/**
 * hexrun:// ve https://hexrun.co/app/ bağlantılarını uygulama yollarına çevirir.
 * Ör. hexrun://run?defend=<duelId> → /run?defend=<duelId>, hexrun://duel/<id> → /duel/<id>.
 */
export function toRoute(url: string | null | undefined): string | null {
  if (!url) return null;
  let rest: string;
  if (url.startsWith('hexrun://')) rest = url.slice('hexrun://'.length);
  else if (/^https:\/\/(www\.)?hexrun\.co\/app\//.test(url)) rest = url.replace(/^https:\/\/(www\.)?hexrun\.co\/app\//, '');
  else if (url.startsWith('/')) rest = url.slice(1);
  else return null;
  rest = rest.replace(/^\/+/, '');
  const [path = '', query] = rest.split('?');
  const known = ['run', 'duel', 'region', 'notifications', 'profile', 'share', 'friends', 'league', 'team', 'events', 'auth', 'integrations'];
  const head = path.split('/')[0] ?? '';
  if (head === '' || head === 'map') return '/';
  if (!known.includes(head)) return null;
  const tabs: Record<string, string> = { league: '/league', team: '/team', events: '/events', integrations: '/profile/integrations' };
  const base = tabs[head] ?? `/${path}`;
  return query ? `${base}?${query}` : base;
}
