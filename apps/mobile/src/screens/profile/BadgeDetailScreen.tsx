import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { errorText } from '../../api/errorText';
import { useBadges, useSetInsignia } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Card, Screen, SectionTitle } from '../../components/Screen';
import { Skeleton } from '../../components/Skeleton';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { shortDate } from '../../lib/dates';
import { useRunState } from '../../run/controller';
import { FONT, RADII, TARGET, useTheme } from '../../theme';

/** 14B · Rozet detayı: hangi nişanın yerine takılacak (günde 1 değişiklik, koşuda kilitli). */
export function BadgeDetailScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useBadges();
  const set = useSetInsignia();
  const running = useRunState((s) => s.active);
  const [slot, setSlot] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const data = q.data;
  const b = data?.badges.find((x) => x.id === id);
  if (!data || !b) {
    return (
      <Screen title={S.badges.title} backLabel={S.profile.tabs.badges}>
        <Skeleton height={120} />
      </Screen>
    );
  }
  const byId = new Map(data.badges.map((x) => [x.id, x]));
  const equippedAt = data.slots.indexOf(b.id);
  const slottable = !!b.insignia?.slot;
  const firstEmpty = data.slots.findIndex((s) => !s);
  const target = slot ?? (firstEmpty >= 0 ? firstEmpty : null);
  const targetBadge = target !== null && data.slots[target] ? byId.get(data.slots[target]!) : undefined;
  const locked = !data.canChangeInsignia || running;

  const save = (slots: Array<string | null>) => {
    setErr(null);
    set.mutate(slots, { onSuccess: () => router.back(), onError: (e) => setErr(errorText(e)) });
  };

  return (
    <Screen
      title={b.name}
      backLabel={S.profile.tabs.badges}
      testID="badge-detail"
      footer={
        b.earned && slottable ? (
          equippedAt >= 0 ? (
            <Button big kind="secondary" label={S.badges.unequip} disabled={locked} loading={set.isPending} onPress={() => save(data.slots.map((s) => (s === b.id ? null : s)))} />
          ) : (
            <Button
              big
              label={targetBadge ? S.badges.equipInto(targetBadge.name) : S.badges.equipEmpty}
              disabled={locked || target === null}
              loading={set.isPending}
              onPress={() => save(data.slots.map((s, i) => (i === target ? b.id : s === b.id ? null : s)))}
              testID="equip"
            />
          )
        ) : undefined
      }
    >
      <T v="label" tone={2}>
        {[b.insignia ? S.badges.kinds[b.insignia.kind] ?? b.insignia.kind : b.category, b.earned && b.earnedAt ? S.badges.earnedOn(shortDate(b.earnedAt)) : `${b.progress[0]}/${b.progress[1]}`].join(' · ')}
      </T>
      <T v="title1" accessibilityRole="header">
        {b.name}
      </T>
      {b.insignia ? <T v="title2">{b.insignia.effect}</T> : <T tone={2}>{S.badges.notInsignia}</T>}
      <Card>
        <SectionTitle>{S.badges.howTo}</SectionTitle>
        <T>{b.how}</T>
        {b.insignia ? (
          <>
            <SectionTitle>{S.badges.counter}</SectionTitle>
            <T>{b.insignia.counter}</T>
          </>
        ) : null}
        {b.insignia && !b.insignia.slot ? (
          <T v="data" tone={2}>
            {S.badges.alwaysOn}
          </T>
        ) : null}
      </Card>
      {b.earned && slottable && equippedAt < 0 ? (
        <>
          <SectionTitle>{S.badges.replaceWhich}</SectionTitle>
          {[0, 1, 2].map((i) => {
            const cur = data.slots[i] ? byId.get(data.slots[i]!) : undefined;
            const sel = target === i;
            return (
              <Pressable
                key={i}
                onPress={() => setSlot(i)}
                accessibilityRole="radio"
                accessibilityState={{ checked: sel }}
                accessibilityLabel={cur ? `${cur.name}: ${cur.insignia?.effect ?? ''}` : S.badges.emptySlot}
                style={{ minHeight: TARGET.min + 8, padding: 12, borderRadius: RADII.m - 6, borderWidth: sel ? 2 : 1, borderColor: sel ? t.c.ink : t.c.line2, gap: 2 }}
              >
                <T v="callout" weight={FONT.bold}>
                  {cur?.name ?? S.badges.emptySlot}
                </T>
                {cur?.insignia ? (
                  <T v="callout" tone={2} style={{ fontSize: 13 }}>
                    {cur.insignia.effect}
                  </T>
                ) : null}
              </Pressable>
            );
          })}
          <T v="callout" tone={3}>
            {locked ? S.badges.changeUsed : S.badges.changeNote}
          </T>
        </>
      ) : null}
      {err ? <T v="callout">{err}</T> : null}
      <View />
    </Screen>
  );
}
