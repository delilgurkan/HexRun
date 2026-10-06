import { View } from 'react-native';
import type { Me, StatsResponse } from '@hexrun/contracts';
import { fmtArea, fmtInt, fmtKm, fmtPace } from '@hexrun/core';
import { useStats } from '../../api/hooks';
import { Icon } from '../../components/Icon';
import { Card, Divider, SectionTitle, Stat } from '../../components/Screen';
import { Silhouette } from '../../components/Silhouette';
import { Skeleton } from '../../components/Skeleton';
import { StateBlock } from '../../components/StateBlock';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { monthName, relativeLabel } from '../../lib/dates';
import { useTheme } from '../../theme';

/** 10 · İstatistik: önce toprak (silüet), sonra savunma ve seri. */
export function StatsView({ s, me }: { s: StatsResponse; me: Me }) {
  const t = useTheme();
  const max = Math.max(1, ...s.last14Days.map((d) => d.gainedM2));
  return (
    <View style={{ gap: 16 }} testID="stats">
      <Card>
        <T v="label" tone={2}>
          {S.stats.territory}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <T v="title1" tabular>
              {fmtArea(s.territoryM2)}
            </T>
            <T v="callout" tone={2}>
              {S.stats.territoryMeta(s.cells, s.regionName, s.regionRank)}
            </T>
          </View>
          {s.silhouettes.length ? <Silhouette rings={s.silhouettes} width={96} height={72} color={t.player(me.slot)} stroke={t.c.casing} /> : null}
        </View>
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Stat label={S.stats.monthDistance(monthName(Date.now()))} value={`${fmtKm(s.monthDistanceM, 1)} km`} />
        <Stat label={S.stats.avgPace} value={`${fmtPace(s.avgPaceSecPerKm)}/km`} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Stat label={S.stats.defense} value={`${s.defenses.won} / ${s.defenses.total}`} />
        <Stat label={S.stats.biggestLoop} value={fmtArea(s.biggestLoopM2)} />
      </View>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="streak" />
          <T v="title2">{S.stats.streak(s.streakDays)}</T>
          <View style={{ flex: 1 }} />
          <T v="data" tone={2}>
            {S.stats.bestStreak(s.bestStreakDays)}
          </T>
        </View>
        <T v="label" tone={3}>
          {S.stats.last14}
        </T>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-end', height: 40 }} accessibilityLabel={`${S.stats.last14}: ${s.last14Days.filter((d) => d.ran).length} gün koşu`}>
          {s.last14Days.map((d) => (
            <View
              key={d.day}
              style={{
                flex: 1,
                height: d.ran ? 10 + (30 * d.gainedM2) / max : 6,
                borderRadius: 2,
                backgroundColor: d.ran ? t.player(me.slot) : t.c.track,
              }}
            />
          ))}
        </View>
      </Card>
      <SectionTitle>{S.stats.recent}</SectionTitle>
      {s.recent.length ? (
        <Card>
          {s.recent.map((r, i) => (
            <View key={`${r.at}-${i}`} style={{ gap: 8 }}>
              {i > 0 ? <Divider /> : null}
              <View style={{ flexDirection: 'row', gap: 12 }} accessible>
                <View style={{ flex: 1 }}>
                  <T v="callout">{`${relativeLabel(r.at).split(' ')[0]} · ${r.text}`}</T>
                </View>
                <T v="data">{r.delta}</T>
              </View>
            </View>
          ))}
        </Card>
      ) : (
        <T tone={2}>{S.stats.noRecent}</T>
      )}
      <T v="data" tone={3}>
        {`${fmtInt(s.cells)} petek`}
      </T>
    </View>
  );
}

export function StatsTab({ me }: { me: Me }) {
  const q = useStats();
  if (q.data) return <StatsView s={q.data} me={me} />;
  if (q.isError) return <StateBlock title={S.common.genericError} action={S.common.retry} onAction={() => void q.refetch()} />;
  return (
    <View style={{ gap: 12 }}>
      <Skeleton height={96} />
      <Skeleton height={60} />
      <Skeleton height={60} />
    </View>
  );
}
