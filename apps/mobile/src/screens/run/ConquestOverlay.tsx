import { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { fmtArea, fmtDuration, fmtInt, fmtKm, fmtPace } from '@hexrun/core';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { hhmm } from '../../lib/dates';
import { eventNames } from '../../lib/events';
import type { ConquestState, HapticsAdapter } from '../../run/controller';
import { fillSchedule } from '../../run/conquest';
import type { SessionSnapshot } from '../../run/session';
import { GUTTER, MOTION, RADII, useTheme } from '../../theme';

export type Beat = 1 | 2 | 3;

/**
 * 07 · Fetih anı: üç vuruş, toplam 2,4 sn; koşu durmaz.
 * 1) 0–0,3 sn kapanış (sert haptik, denetleyicide) 2) 0,3–1,8 sn dolum dalgası (her 10 petekte tık,
 * m² sayacı) 3) 2,0 sn → sonuç (başarı haptiği); kart 5 sn sonra kendiliğinden kapanır.
 * "Hareketi azalt" açıkken dolum tek karede olur, haptik korunur.
 */
export function ConquestOverlay({
  conquest,
  snap,
  haptics,
  activeEventNames,
  onContinue,
  onFinish,
}: {
  conquest: ConquestState;
  snap: SessionSnapshot;
  haptics: HapticsAdapter;
  activeEventNames: string[];
  onContinue: () => void;
  onFinish: () => void;
}) {
  const t = useTheme();
  const [beat, setBeat] = useState<Beat>(1);
  const [counted, setCounted] = useState(0);
  const [left, setLeft] = useState(5);
  const fade = useRef(new Animated.Value(0)).current;
  const p = conquest.preview;
  const gained = p.empty > 0 || p.own > 0 || p.duels.length > 0;

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    Animated.timing(fade, { toValue: 1, duration: t.reduceMotion ? 0 : MOTION.conquestBeat1, useNativeDriver: true }).start();
    const n = p.cells.length;
    if (t.reduceMotion) {
      at(MOTION.conquestBeat1, () => {
        setBeat(2);
        setCounted(p.areaM2);
        for (let i = 0; i < Math.min(5, Math.floor(n / 10)); i++) at(MOTION.conquestBeat1 + i * 80, () => haptics.cellTick());
      });
    } else {
      at(MOTION.conquestBeat1, () => setBeat(2));
      const sched = fillSchedule(n);
      sched.forEach((ms, i) => {
        if ((i + 1) % 10 === 0) at(MOTION.conquestBeat1 + ms, () => haptics.cellTick());
        if (i % Math.max(1, Math.floor(n / 30)) === 0 || i === n - 1) at(MOTION.conquestBeat1 + ms, () => setCounted(Math.round((p.areaM2 * (i + 1)) / n)));
      });
    }
    if (p.duels.length) at(MOTION.conquestBeat2 - 100, () => haptics.crack());
    at(2000, () => {
      setBeat(3);
      setCounted(p.areaM2);
      haptics.success();
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conquest.loop.index]);

  // Kare 3'ten sonra 5 sn geri sayım, sonra HUD geri gelir.
  useEffect(() => {
    if (beat !== 3) return;
    const id = setInterval(() => setLeft((v) => v - 1), 1000);
    return () => clearInterval(id);
  }, [beat]);
  useEffect(() => {
    if (left <= 0) onContinue();
  }, [left, onContinue]);

  const eventsLabel = activeEventNames.length ? eventNames(activeEventNames.map((name) => ({ name }))) : null;
  const duel = p.duels[0];

  return (
    <Animated.View
      testID="conquest"
      accessibilityViewIsModal
      accessibilityLiveRegion="assertive"
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: t.c.bg, opacity: fade, paddingHorizontal: GUTTER, justifyContent: 'center', gap: 16 }}
    >
      {beat === 1 ? (
        <T v="display" align="center" testID="beat-1" accessibilityRole="header">
          {S.conquest.closed}
        </T>
      ) : null}
      {beat === 2 ? (
        <View style={{ gap: 8, alignItems: 'center' }} testID="beat-2">
          <T v="hudXl" tabular align="center" adjustsFontSizeToFit numberOfLines={1} style={{ fontSize: 72, lineHeight: 76 }}>
            {fmtInt(counted)} m²
          </T>
          {duel ? <T tone={2}>{S.conquest.duelLine(duel.duel.defender.displayName.split(' ')[0] ?? '')}</T> : null}
        </View>
      ) : null}
      {beat === 3 ? (
        <View style={{ gap: 14 }} testID="beat-3">
          <T v="label" tone={2}>
            {S.conquest.title(hhmm(conquest.loop.closedAt), eventsLabel)}
          </T>
          <T v="display" accessibilityRole="header">
            {gained ? S.conquest.conquered : S.conquest.closed}
          </T>
          <T v="title2">{S.conquest.headline(p.empty + p.own, p.empty, p.own)}</T>
          <T v="title1" tabular>
            +{fmtArea(p.empty > 0 ? Math.round((p.areaM2 * p.empty) / Math.max(1, p.cells.length)) : 0)}
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label={S.conquest.newCells(p.empty)} />
            {p.own > 0 ? <Chip label={S.conquest.reinforced(p.own)} /> : null}
            {duel ? <Chip label={S.conquest.covered(duel.inside, duel.total)} /> : null}
          </View>
          <T v="callout" tone={3}>
            {S.conquest.serverNote}
          </T>
          <View style={{ flexDirection: 'row', gap: 16, paddingVertical: 8, borderTopWidth: 1, borderColor: t.c.line }}>
            <Metric k={S.common.distance} v={fmtKm(snap.tracker.distanceM)} />
            <Metric k={S.common.pace} v={fmtPace(snap.tracker.paceSecPerKm)} />
            <Metric k={S.common.time} v={fmtDuration(snap.elapsedMs)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button big label={`${S.conquest.continue} ${left}`} onPress={onContinue} style={{ flex: 2, borderRadius: RADII.cta }} testID="conquest-continue" />
            <Button big kind="secondary" label={S.conquest.finish} onPress={onFinish} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flex: 1 }}>
      <T v="label" tone={3}>
        {k}
      </T>
      <T v="title2" tabular>
        {v}
      </T>
    </View>
  );
}
