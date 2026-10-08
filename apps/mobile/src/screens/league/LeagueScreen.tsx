import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LeaguePeriod, LeagueRow, LeagueScope } from '@hexrun/contracts';
import { fmtInt } from '@hexrun/core';
import { useLeague, useMe } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Segmented } from '../../components/Chip';
import { PlayerBadge } from '../../components/PlayerBadge';
import { Skeleton } from '../../components/Skeleton';
import { StateBlock } from '../../components/StateBlock';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { hhmm, dayGroup } from '../../lib/dates';
import { startRun } from '../../run/start';
import { FONT, GUTTER, RADII, useTheme } from '../../theme';

const ROW_H = 60;

function Row({ r, faded, pinned }: { r: LeagueRow; faded?: boolean; pinned?: boolean }) {
  const t = useTheme();
  const delta = r.delta ?? 0;
  return (
    <View
      testID={pinned ? 'league-me' : `league-row-${r.rank}`}
      accessible
      accessibilityLabel={S.league.rankA11y(r.rank, r.isMe ? S.common.you : r.name, `${fmtInt(r.valueM2)} m²`)}
      style={{
        minHeight: ROW_H,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: GUTTER,
        opacity: faded ? 0.5 : 1,
        backgroundColor: r.isMe ? t.c.surf2 : 'transparent',
        borderRadius: pinned ? RADII.m : 0,
      }}
    >
      <T v="data" tone={2} style={{ width: 28, textAlign: 'right' }}>
        {r.rank > 0 ? String(r.rank) : '—'}
      </T>
      <PlayerBadge slot={r.slot} initials={r.initials} size={32} ring={r.isMe} />
      <View style={{ flex: 1 }}>
        <T v="callout" weight={r.isMe ? FONT.bold : FONT.medium} numberOfLines={1}>
          {r.isMe ? S.common.you : r.name}
        </T>
        {r.subtitle ? (
          <T v="callout" tone={2} style={{ fontSize: 13 }} numberOfLines={1}>
            {r.subtitle}
          </T>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T v="data" tabular>
          {fmtInt(r.valueM2)}
        </T>
        {r.delta !== null ? (
          <T v="data" tone={2} style={{ fontSize: 12 }}>
            {delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${-delta}` : '·'}
          </T>
        ) : null}
      </View>
    </View>
  );
}

function endsIn(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const ms = Math.max(0, Date.parse(endsAt) - Date.now());
  const h = Math.floor(ms / 3_600_000);
  return S.league.endsIn(Math.floor(h / 24), h % 24);
}

/** 11 · Lig: yerel bölge, kategori ve dönem ayrı kontroller; senin satırın altta sabit. */
export function LeagueScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [scope, setScope] = useState<LeagueScope>('individual');
  const [period, setPeriod] = useState<LeaguePeriod>('week');
  const q = useLeague(scope, period);
  const me = useMe();
  const data = q.data;
  const region = data?.regionName ?? '';
  const failed = q.isError;
  const loading = !data && q.isLoading;
  const empty = !!data && data.rows.length === 0;
  const metric = period === 'week' ? S.league.metricWeek : period === 'month' ? S.league.metricMonth : S.league.metricAll;
  const meRow: LeagueRow | null =
    data?.me ??
    (me.data ? { rank: 0, id: me.data.id, name: me.data.displayName, initials: me.data.initials, slot: me.data.slot, valueM2: 0, delta: null, subtitle: null, isMe: true } : null);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, paddingTop: insets.top }} testID="league">
      <View style={{ paddingHorizontal: GUTTER, gap: 10, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, minHeight: 48 }}>
          <T v="title1" accessibilityRole="header">
            {S.league.title}
          </T>
          <T v="title2" tone={2}>
            {region}
          </T>
        </View>
        <Segmented
          testID="league-scope"
          options={[
            { key: 'individual', label: S.league.individual },
            { key: 'team', label: S.league.team },
          ]}
          value={scope}
          onChange={setScope}
        />
        <Segmented
          testID="league-period"
          options={[
            { key: 'week', label: S.league.week },
            { key: 'month', label: S.league.month },
            { key: 'all', label: S.league.all },
          ]}
          value={period}
          onChange={setPeriod}
        />
        {data && !empty ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="label" tone={2}>
              {S.league.metric} · {metric}
            </T>
            {period !== 'all' && endsIn(data.endsAt) ? (
              <T v="data" tone={2}>
                {endsIn(data.endsAt)}
              </T>
            ) : null}
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: GUTTER, gap: 8 }} testID="league-loading" accessibilityLabel={S.league.loading}>
          <T v="callout" tone={2}>
            {S.league.loading}
          </T>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} height={ROW_H - 8} />
          ))}
        </View>
      ) : failed && !data ? (
        <View style={{ paddingHorizontal: GUTTER }}>
          <StateBlock title={S.league.errorTitle} action={S.common.retry} onAction={() => void q.refetch()} testID="league-error" />
        </View>
      ) : empty ? (
        <View style={{ paddingHorizontal: GUTTER, flex: 1 }} testID="league-empty">
          <StateBlock title={S.league.emptyTitle} body={S.league.emptyBody(region)} />
          <Button big label={S.map.start} onPress={() => void startRun(me.data)} />
        </View>
      ) : (
        <>
          {failed && data ? (
            <View style={{ paddingHorizontal: GUTTER, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} testID="league-stale">
              <View style={{ flex: 1 }}>
                <T v="callout" weight={FONT.bold}>
                  {S.league.errorTitle}
                </T>
                <T v="callout" tone={2} style={{ fontSize: 13 }}>
                  {S.league.errorBody(`${dayGroup(data.updatedAt) === 'today' ? 'bugün ' : ''}${hhmm(data.updatedAt)}`)}
                </T>
              </View>
              <Button kind="secondary" label={S.common.retry} onPress={() => void q.refetch()} />
            </View>
          ) : null}
          <FlatList
            data={data?.rows ?? []}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => <Row r={item} faded={failed} />}
            getItemLayout={(_, i) => ({ length: ROW_H, offset: ROW_H * i, index: i })}
            contentContainerStyle={{ paddingBottom: 96 }}
          />
        </>
      )}

      {meRow && !loading ? (
        <View style={{ position: 'absolute', left: 8, right: 8, bottom: 8, backgroundColor: t.c.surf, borderRadius: RADII.m, borderWidth: 1, borderColor: t.c.line }}>
          <Row r={{ ...meRow, isMe: true }} pinned />
          {data?.meNote ? (
            <T v="callout" tone={2} style={{ paddingHorizontal: GUTTER, paddingBottom: 8, fontSize: 13 }}>
              {data.meNote}
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
