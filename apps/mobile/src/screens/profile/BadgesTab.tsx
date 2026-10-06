import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { BadgeDto, BadgesResponse, Me } from '@hexrun/contracts';
import { BADGES } from '@hexrun/core';
import { isApiError } from '../../api/errors';
import { useBadges } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Card, SectionTitle } from '../../components/Screen';
import { HexTexture, Skeleton } from '../../components/Skeleton';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { startRun } from '../../run/start';
import { useServices } from '../../services';
import { setPrefs, usePrefs } from '../../state/prefs';
import { FONT, RADII, useTheme } from '../../theme';

const LAST_KEY = 'hexrun.badges.last.v1';

function ProgressBar({ value, max }: { value: number; max: number }) {
  const t = useTheme();
  const r = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.c.track, overflow: 'hidden' }}>
      <View style={{ width: `${r * 100}%`, height: 6, backgroundColor: t.c.ink }} />
    </View>
  );
}

function BadgeTile({ b, onPress }: { b: BadgeDto; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${b.name}. ${b.earned ? 'Kazanıldı' : `${b.progress[0]}/${b.progress[1]}`}. ${b.how}`}
      style={({ pressed }) => ({
        width: '31%',
        minHeight: 104,
        padding: 10,
        gap: 6,
        borderRadius: RADII.m - 6,
        backgroundColor: b.earned ? t.c.surf : 'transparent',
        borderWidth: 1,
        borderColor: b.earned ? t.c.line2 : t.c.line,
        borderStyle: b.earned ? 'solid' : 'dashed',
        opacity: pressed ? 0.8 : 1,
      })}
      testID={`badge-${b.id}`}
    >
      <Icon name={b.insignia ? 'defend' : 'map'} size={20} color={b.earned ? t.c.ink : t.c.ink3} fill={b.earned ? t.c.surf2 : 'none'} />
      <T v="callout" weight={FONT.semibold} tone={b.earned ? 1 : 2} style={{ fontSize: 13 }} numberOfLines={2}>
        {b.name}
      </T>
      {!b.earned ? <ProgressBar value={b.progress[0]} max={b.progress[1]} /> : null}
    </Pressable>
  );
}

/** 14D · İkinci rozet kazanılınca bir kez: nişanlar açıldı. */
function InsigniaIntro({ onClose }: { onClose: () => void }) {
  return (
    <Card testID="insignia-intro">
      <T v="title2">{S.badges.unlockedTitle}</T>
      <T tone={2}>{S.badges.unlockedBody}</T>
      {S.badges.unlockedPoints.map((p, i) => (
        <View key={p} style={{ flexDirection: 'row', gap: 10 }}>
          <T v="data" tone={3}>
            {`0${i + 1}`}
          </T>
          <T v="callout" style={{ flex: 1 }}>
            {p}
          </T>
        </View>
      ))}
      <Button label={S.common.done} onPress={onClose} />
    </Card>
  );
}

export function BadgesView({ data, onOpen, onStart }: { data: BadgesResponse; onOpen: (b: BadgeDto) => void; onStart: () => void }) {
  const t = useTheme();
  const introSeen = usePrefs((p) => p.insigniaIntroSeen);
  if (data.earned === 0) {
    const nearest = data.nearest.length ? data.nearest : data.badges.filter((b) => !b.earned).slice(0, 3);
    return (
      <View style={{ gap: 16 }} testID="badges-empty">
        <T v="title2">{S.badges.emptyTitle}</T>
        <T tone={2}>{S.badges.emptyBody(data.total)}</T>
        {nearest.slice(0, 3).map((b) => (
          <Card key={b.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="callout" weight={FONT.bold}>
                {b.name}
              </T>
              <T v="data" tone={2}>{`${b.progress[0]}/${b.progress[1]}`}</T>
            </View>
            <T v="callout" tone={2}>
              {b.how}
            </T>
            <ProgressBar value={b.progress[0]} max={b.progress[1]} />
          </Card>
        ))}
        <Button big label={S.badges.emptyCta} onPress={onStart} />
      </View>
    );
  }
  const byId = new Map(data.badges.map((b) => [b.id, b]));
  const filled = data.slots.filter(Boolean).length;
  return (
    <View style={{ gap: 16 }} testID="badges">
      {data.earned >= 2 && !introSeen ? <InsigniaIntro onClose={() => void setPrefs({ insigniaIntroSeen: true })} /> : null}
      <SectionTitle right={<T v="data" tone={2}>{S.badges.insigniaMeta(filled)}</T>}>{S.badges.insignia}</SectionTitle>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[0, 1, 2].map((i) => {
          const id = data.slots[i] ?? null;
          const b = id ? byId.get(id) : undefined;
          return (
            <Pressable
              key={i}
              onPress={() => b && onOpen(b)}
              accessibilityRole="button"
              accessibilityLabel={b ? `${b.name}: ${b.insignia?.effect ?? ''}` : S.badges.emptySlot}
              style={{ flex: 1, minHeight: 96, padding: 10, borderRadius: RADII.m - 6, backgroundColor: b ? t.c.surf : 'transparent', borderWidth: 1, borderColor: t.c.line2, borderStyle: b ? 'solid' : 'dashed', gap: 4 }}
              testID={`slot-${i}`}
            >
              <T v="callout" weight={FONT.bold} style={{ fontSize: 13 }} numberOfLines={2}>
                {b?.name ?? S.badges.emptySlot}
              </T>
              {b?.insignia ? (
                <T v="callout" tone={2} style={{ fontSize: 12 }} numberOfLines={3}>
                  {b.insignia.effect}
                </T>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <T v="callout" tone={3}>
        {S.badges.insigniaNote}
      </T>
      <SectionTitle right={<T v="data" tone={2}>{S.badges.collectionMeta(data.earned, data.total)}</T>}>{S.badges.collection}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
        {data.badges.map((b) => (
          <BadgeTile key={b.id} b={b} onPress={() => onOpen(b)} />
        ))}
      </View>
    </View>
  );
}

/** 10b · Rozet durumları: boş (yapılacaklar), yükleniyor (iskelet), hata (son bilinen sayı korunur). */
export function BadgesTab({ me }: { me: Me }) {
  const { kv } = useServices();
  const q = useBadges();
  const [last, setLast] = useState<{ earned: number; total: number } | null>(null);
  useEffect(() => {
    if (q.data) void kv.setItem(LAST_KEY, JSON.stringify({ earned: q.data.earned, total: q.data.total })).catch(() => undefined);
    else
      void kv
        .getItem(LAST_KEY)
        .then((r) => r && setLast(JSON.parse(r)))
        .catch(() => undefined);
  }, [q.data, kv]);

  const open = (b: BadgeDto) => router.push({ pathname: '/profile/badge/[id]', params: { id: b.id } });

  if (q.isError && !q.data) {
    const known = last ?? { earned: 0, total: BADGES.length };
    const code = isApiError(q.error) ? `RZ-${q.error.status || 0}` : 'RZ-0';
    return (
      <View style={{ gap: 12, paddingVertical: 12 }} testID="badges-error">
        <T v="title2">{S.badges.errorTitle}</T>
        <T tone={2}>{S.badges.errorBody(known.earned, known.total)}</T>
        <Button kind="secondary" label={S.common.retry} onPress={() => void q.refetch()} style={{ alignSelf: 'flex-start' }} />
        <T v="data" tone={3}>
          {S.common.errorCode(code)}
        </T>
      </View>
    );
  }
  if (!q.data) {
    return (
      <View style={{ gap: 12, minHeight: 320 }} testID="badges-loading" accessibilityLabel={S.badges.loading}>
        <HexTexture />
        <T v="title2">{S.badges.loading}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} width="31%" height={96} radius={RADII.m - 6} />
          ))}
        </View>
      </View>
    );
  }
  return <BadgesView data={q.data} onOpen={open} onStart={() => void startRun(me)} />;
}

