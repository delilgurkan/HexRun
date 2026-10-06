import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { View } from 'react-native';
import type { ActiveEvent } from '@hexrun/contracts';
import { fmtInt } from '@hexrun/core';
import { useEvents, useMe } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Card, Divider, Screen, SectionTitle } from '../../components/Screen';
import { StateBlock } from '../../components/StateBlock';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { endsAtLabel, resolveEvents } from '../../lib/events';
import { startRun } from '../../run/start';
import { useApi } from '../../services';
import { setPrefs, usePrefs } from '../../state/prefs';
import { FONT, useTheme } from '../../theme';

const mult = (m: number) => `${String(m).replace('.', ',')}x`;

function hm(min: number) {
  return { h: Math.floor(min / 60), m: min % 60 };
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** 12 · Etkinlik: aktif pencere ve diğer çarpanlar; sayaçlar core `eventWindow` ile. */
export function EventsScreen() {
  const t = useTheme();
  const now = useNow();
  const q = useEvents();
  const me = useMe();
  const api = useApi();
  const remind = usePrefs((p) => p.remind);
  const events = resolveEvents(q.data, now);
  const active = events.filter((e) => e.active);
  const hero = active[0];
  const others = events.filter((e) => e !== hero);

  /** Hatırlat: etkinlik başlarken yerel bildirim. */
  const toggleRemind = async (e: ActiveEvent) => {
    const on = remind.includes(e.id);
    const identifier = `event-${e.id}`;
    try {
      if (on) await Notifications.cancelScheduledNotificationAsync(identifier);
      else
        await Notifications.scheduleNotificationAsync({
          identifier,
          content: { title: e.name, body: e.description, data: { deeplink: 'hexrun://events' } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(60, e.startsInMin * 60) },
        });
    } catch {
      // İzin yoksa yalnız tercih saklanır.
    }
    void api.remindEvent(e.id, !on).catch(() => undefined);
    await setPrefs({ remind: on ? remind.filter((x) => x !== e.id) : [...remind, e.id] });
  };

  return (
    <Screen title={S.events.title} large onBack={null} testID="events">
      {hero ? (
        <Card testID="event-hero">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="label" tone={2}>
              {S.events.nowEverywhere(hero.window)}
            </T>
            {hero.endsInMin !== null ? (
              <T v="data" testID="event-countdown">
                {S.events.remaining(hm(hero.endsInMin).h, hm(hero.endsInMin).m)}
              </T>
            ) : null}
          </View>
          <T v="title1">{hero.name}</T>
          <T tone={2}>{hero.description}</T>
          {hero.participantsToday > 0 ? <T v="callout">{S.events.participants(fmtInt(hero.participantsToday))}</T> : null}
          <Button big label={S.map.start} onPress={() => void startRun(me.data)} />
        </Card>
      ) : (
        <StateBlock icon="events" title={S.events.noneActive} body={S.events.noneActiveBody} />
      )}
      <SectionTitle>{S.events.others}</SectionTitle>
      <Card>
        {others.map((e, i) => (
          <View key={e.id} style={{ gap: 6 }}>
            {i > 0 ? <Divider /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }} accessible accessibilityLabel={`${e.name}, ${e.window}, ${S.events.moves[e.move]} ${mult(e.multiplier)}`}>
              <View style={{ flex: 1 }}>
                <T v="callout" weight={FONT.bold}>
                  {e.name}
                  {e.active ? ` · ${S.events.active}` : ''}
                </T>
                <T v="callout" tone={2} style={{ fontSize: 13 }}>
                  {`${e.window} · ${S.events.everywhere} · ${S.events.moves[e.move]} ${mult(e.multiplier)}`}
                </T>
              </View>
              {e.active ? (
                <T v="data">{endsAtLabel(e.endsInMin, now)}</T>
              ) : (
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <T v="data" tone={2}>
                    {S.events.startsIn(hm(e.startsInMin).h, hm(e.startsInMin).m)}
                  </T>
                  <Button kind={remind.includes(e.id) ? 'secondary' : 'ghost'} label={remind.includes(e.id) ? S.events.reminded : S.events.remind} onPress={() => void toggleRemind(e)} />
                </View>
              )}
            </View>
          </View>
        ))}
      </Card>
      <T v="callout" tone={3} style={{ color: t.c.ink3 }}>
        {S.events.rules}
      </T>
    </Screen>
  );
}
