import { useMemo, useState } from 'react';
import { Pressable, SectionList, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import type { NotificationDto, NotificationKind } from '@hexrun/contracts';
import type { NotificationFilter } from '../../api/endpoints';
import { useMarkRead, useNotifications } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { Icon, type IconName } from '../../components/Icon';
import { Header } from '../../components/Screen';
import { Skeleton } from '../../components/Skeleton';
import { StateBlock } from '../../components/StateBlock';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { dayGroup, hhmm, shortDate, type DayGroup } from '../../lib/dates';
import { toRoute } from '../../lib/deeplink';
import { FONT, GUTTER, useTheme } from '../../theme';

const GROUP_LABEL: Record<DayGroup, string> = { today: S.common.today, yesterday: S.common.yesterday, week: S.common.thisWeek, earlier: S.common.earlier };

function kindIcon(k: NotificationKind): IconName | 'hatch' | 'swap2' | 'ghost2' {
  switch (k) {
    case 'siege_warn':
    case 'siege_alarm':
    case 'duel_started':
      return 'hatch';
    case 'cells_lost':
    case 'duel_won':
      return 'swap2';
    case 'decay_warning':
    case 'decay_lost':
      return 'ghost2';
    case 'event_started':
      return 'events';
    case 'team':
      return 'team';
    case 'review_result':
      return 'eye';
    case 'badge':
      return 'defend';
    default:
      return 'bell';
  }
}

/** Oyun dilinden ikon: kuşatma = tarama, el değiştirme = iki renk üst üste, erime = hayalet segment. */
function NotifIcon({ kind }: { kind: NotificationKind }) {
  const t = useTheme();
  const k = kindIcon(kind);
  const box = { width: 40, height: 40, borderRadius: 12, backgroundColor: t.c.surf2, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const };
  if (k === 'hatch')
    return (
      <View style={box}>
        <Svg width={40} height={40}>
          <Defs>
            <Pattern id="nh" patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
              <Line x1={0} y1={0} x2={0} y2={6} stroke={t.c.ink} strokeWidth={2.5} />
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width={40} height={40} fill="url(#nh)" />
        </Svg>
      </View>
    );
  if (k === 'swap2')
    return (
      <View style={box}>
        <View style={{ position: 'absolute', left: 8, top: 8, width: 18, height: 18, borderRadius: 4, backgroundColor: t.player('gul') }} />
        <View style={{ position: 'absolute', right: 8, bottom: 8, width: 18, height: 18, borderRadius: 4, backgroundColor: t.player('keh'), borderWidth: 1.5, borderColor: t.c.casing }} />
      </View>
    );
  if (k === 'ghost2')
    return (
      <View style={[box, { flexDirection: 'row', gap: 2, paddingHorizontal: 6 }]}>
        {[1, 1, 0.32, 0].map((o, i) => (
          <View key={i} style={{ flex: 1, height: 8, borderRadius: 1, backgroundColor: o ? t.player('keh') : t.c.track, opacity: o || 1 }} />
        ))}
      </View>
    );
  return (
    <View style={box}>
      <Icon name={k} size={20} />
    </View>
  );
}

function Item({ n, onOpen }: { n: NotificationDto; onOpen: (n: NotificationDto) => void }) {
  const t = useTheme();
  const g = dayGroup(n.createdAt);
  return (
    <Pressable
      onPress={() => onOpen(n)}
      accessibilityRole="button"
      accessibilityLabel={`${n.read ? '' : 'Okunmamış. '}${n.title}. ${n.body}`}
      style={({ pressed }) => ({ flexDirection: 'row', gap: 12, paddingHorizontal: GUTTER, paddingVertical: 12, opacity: pressed ? 0.85 : 1 })}
      testID={`notif-${n.id}`}
    >
      <NotifIcon kind={n.kind} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <T v="callout" weight={n.read ? FONT.medium : FONT.bold} style={{ flex: 1 }}>
            {n.title}
          </T>
          <T v="data" tone={3} style={{ fontSize: 12 }}>
            {g === 'today' || g === 'yesterday' ? hhmm(n.createdAt) : shortDate(n.createdAt)}
          </T>
        </View>
        <T v="callout" tone={2} style={{ fontSize: 14 }}>
          {n.body}
        </T>
        {n.action ? (
          <Button
            label={n.action.label}
            onPress={() => {
              const r = toRoute(n.action?.deeplink);
              if (r) router.push(r as never);
            }}
            style={{ alignSelf: 'flex-start', marginTop: 6 }}
            testID={`notif-action-${n.id}`}
          />
        ) : null}
      </View>
      {!n.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.c.ink, marginTop: 6 }} accessibilityElementsHidden /> : null}
    </Pressable>
  );
}

/** 13 · Bildirim merkezi: filtreler + satır içi eylem (Savun, Geri al). */
export function NotificationsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const q = useNotifications(filter);
  const markRead = useMarkRead();
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const sections = useMemo(() => {
    const order: DayGroup[] = ['today', 'yesterday', 'week', 'earlier'];
    return order
      .map((g) => ({ key: g, title: GROUP_LABEL[g], data: items.filter((n) => dayGroup(n.createdAt) === g) }))
      .filter((s) => s.data.length);
  }, [items]);

  const open = (n: NotificationDto) => {
    if (!n.read) markRead.mutate([n.id]);
    const r = toRoute(n.action?.deeplink);
    if (r) router.push(r as never);
  };

  const filters: Array<{ key: NotificationFilter; label: string }> = [
    { key: 'all', label: S.notifications.filters.all },
    { key: 'siege', label: S.notifications.filters.siege },
    { key: 'region', label: S.notifications.filters.region },
    { key: 'team', label: S.notifications.filters.team },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, paddingTop: insets.top }} testID="notifications">
      <Header
        title={S.notifications.title}
        backLabel={S.tabs.map}
        right={<Button kind="ghost" label={S.notifications.markRead} onPress={() => markRead.mutate(undefined)} style={{ borderWidth: 0 }} testID="mark-read" />}
      />
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: GUTTER, paddingVertical: 8 }} accessibilityRole="tablist">
        {filters.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} testID={`filter-${f.key}`} />
        ))}
      </View>
      {q.isLoading ? (
        <View style={{ padding: GUTTER, gap: 12 }} testID="notifications-loading">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} height={56} />
          ))}
        </View>
      ) : q.isError && !items.length ? (
        <View style={{ padding: GUTTER }}>
          <StateBlock title={S.notifications.error} action={S.common.retry} onAction={() => void q.refetch()} />
        </View>
      ) : !items.length ? (
        <View style={{ padding: GUTTER }}>
          <StateBlock icon="bell" title={S.notifications.empty} testID="notifications-empty" />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => <Item n={item} onOpen={open} />}
          renderSectionHeader={({ section }) => (
            <View style={{ backgroundColor: t.c.bg, paddingHorizontal: GUTTER, paddingTop: 12, paddingBottom: 4 }}>
              <T v="label" tone={2} accessibilityRole="header">
                {section.title}
              </T>
            </View>
          )}
          onEndReached={() => q.hasNextPage && void q.fetchNextPage()}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        />
      )}
    </View>
  );
}
