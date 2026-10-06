import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { fmtDuration, fmtKm, fmtPace } from '@hexrun/core';
import { useMe } from '../../api/hooks';
import { Button, IconButton } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { activeNow, eventsShortLabel } from '../../lib/events';
import { HexMap } from '../../map/HexMap';
import { closingRemainingM } from '../../run/closing';
import { previewOpenRing } from '../../run/conquest';
import { useRunState, type GpsQuality } from '../../run/controller';
import { getRunController, nativeHaptics } from '../../run/native';
import { loopOptionsFor } from '../../run/start';
import { mapCache } from '../../state/mapCache';
import { FONT, GUTTER_RUN, HUD_MAX_FONT_SCALE, RADII, TARGET, TYPE, useTheme } from '../../theme';
import { ConquestOverlay } from './ConquestOverlay';
import { HoldButton } from './HoldButton';

function distLabel(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${fmtKm(m, 1)} km`;
}

function gpsLabel(q: GpsQuality): string {
  return q === 'strong' ? S.run.gpsStrong : q === 'weak' ? S.run.gpsWeak : S.run.gpsSearching;
}

/**
 * 05/06/07 · Koşu modu: tam ekran, sekme çubuğu yok. Üç metrik güneşte okunur;
 * ≤300 m'de "halkayı kapat" moduna geçer; halka kapanınca fetih anı. Tüm eylemler altta, ≥64 pt.
 */
export function RunScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const params = useLocalSearchParams<{ defend?: string; attack?: string }>();
  const controller = getRunController();
  const me = useMe();
  const active = useRunState((s) => s.active);
  const snap = useRunState((s) => s.snap);
  const conquest = useRunState((s) => s.conquest);
  const gps = useRunState((s) => s.gps);
  const locked = useRunState((s) => s.locked);
  const cameraRef = useRef<CameraRef>(null);
  const [finishing, setFinishing] = useState(false);
  const stacked = fontScale > HUD_MAX_FONT_SCALE;

  // Derin bağlantıyla (hexrun://run?defend=…) açıldıysa koşuyu başlat.
  useEffect(() => {
    if (!active && !finishing) {
      void controller.start({ defendDuelId: params.defend, attackDuelId: params.attack }, loopOptionsFor(me.data)).catch(() => router.replace('/'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Süre her saniye.
  useEffect(() => {
    const id = setInterval(() => controller.refresh(), 1000);
    return () => clearInterval(id);
  }, [controller]);

  // Android geri hareketi koşudan çıkarmaz.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const last = snap?.lastPoint;
  useEffect(() => {
    if (last) cameraRef.current?.easeTo({ center: [last.lng, last.lat], duration: t.reduceMotion ? 0 : 500 });
  }, [last, t.reduceMotion]);

  const tracker = snap?.tracker;
  const closing = !!tracker?.closingMode && !conquest;
  const points = controller.current?.points() ?? [];
  const bucket = Math.floor((snap?.pointCount ?? 0) / 3);
  const preview = useMemo(() => {
    if (!closing || !controller.current) return null;
    const c = mapCache();
    return previewOpenRing(controller.current.previewRing(), { myId: c.myId, cells: c.cells, attacking: c.attacking });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing, bucket]);
  const events = activeNow();
  const cells = useMemo(() => [...mapCache().cells.values()], []);
  const defendName = useMemo(() => {
    const id = snap?.context.defendDuelId;
    const d = id ? mapCache().defending.find((x) => x.id === id) : undefined;
    return d?.attacker.displayName ?? null;
  }, [snap?.context.defendDuelId]);

  const finish = useCallback(async () => {
    setFinishing(true);
    const id = await controller.finish();
    if (id) router.replace({ pathname: '/run/summary', params: { clientRunId: id } });
    else router.replace('/');
  }, [controller]);

  if (!snap || !tracker) {
    return <View style={{ flex: 1, backgroundColor: t.c.bg }} testID="run-starting" />;
  }

  const paused = snap.status === 'paused';
  const remaining = closingRemainingM(tracker.distToStartM);
  const mapH = closing ? '58%' : '42%';

  const metric = (label: string, value: string, big = false) => (
    <View style={{ flex: stacked ? undefined : 1, gap: 2 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <T v="label" tone={2} maxFontSizeMultiplier={HUD_MAX_FONT_SCALE}>
        {label}
      </T>
      <T v={big ? 'hudXl' : 'hudM'} tabular numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={HUD_MAX_FONT_SCALE}>
        {value}
      </T>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }} testID="run-screen">
      <View style={{ height: mapH, overflow: 'hidden', borderBottomLeftRadius: RADII.l, borderBottomRightRadius: RADII.l }}>
        <HexMap
          cells={cells}
          faded
          showPlayers={false}
          trace={points}
          start={tracker.start}
          captureRadiusM={snap.closeRadiusM}
          previewRing={closing ? controller.current?.previewRing() : null}
          center={last ?? tracker.start ?? undefined}
          zoom={16}
          cameraRef={cameraRef}
          testID="run-map"
        />
        <View style={{ position: 'absolute', top: insets.top + 8, left: GUTTER_RUN, right: GUTTER_RUN, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Chip glass label={gpsLabel(gps)} icon="locate" testID="gps-chip" />
          {events.length ? <Chip glass label={eventsShortLabel(events)} /> : null}
          {defendName ? <Chip glass icon="defend" label={S.run.defending(defendName)} /> : null}
          <View style={{ flex: 1 }} />
          <IconButton icon="lock" glass accessibilityLabel={S.run.lockA11y} onPress={() => controller.setLocked(true)} testID="lock" />
        </View>
        {closing && preview ? (
          <View style={{ position: 'absolute', bottom: 12, left: GUTTER_RUN }}>
            <Chip glass icon="area" label={S.run.closingCells(preview.cells.length)} testID="preview-cells" />
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1, paddingHorizontal: GUTTER_RUN, paddingTop: 16, gap: 12 }}>
        {closing ? (
          <View style={{ gap: 6 }} testID="closing-hud" accessibilityLiveRegion="polite">
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
              <T v="hudXl" tabular maxFontSizeMultiplier={HUD_MAX_FONT_SCALE} accessibilityLabel={S.run.voiceClosing(remaining)}>
                {S.run.closingLeft(remaining)}
              </T>
              <T v="title2" style={{ marginBottom: 14 }}>
                {S.run.closingCta}
              </T>
            </View>
            {preview ? <T tone={2}>{S.run.closingPreview(preview.empty)}</T> : null}
            {preview?.duels[0] ? (
              <T v="data" tone={2}>
                {S.run.duelCoverage(preview.duels[0].duel.defender.displayName.split(' ')[0] ?? '', preview.duels[0].inside, preview.duels[0].total)}
              </T>
            ) : null}
            <View style={{ flexDirection: stacked ? 'column' : 'row', gap: 12 }}>
              {metric(S.common.distance, fmtKm(tracker.distanceM))}
              {metric(S.common.pace, fmtPace(tracker.paceSecPerKm))}
              {metric(S.common.time, fmtDuration(snap.elapsedMs))}
            </View>
          </View>
        ) : (
          <View style={{ gap: 8 }} testID="run-hud">
            <T v="callout" tone={2}>
              {paused ? S.run.paused : tracker.start ? S.run.toStart(distLabel(tracker.distToStartM)) : S.run.gpsSearching}
            </T>
            {metric(S.run.distanceKm, fmtKm(tracker.distanceM), true)}
            <View style={{ flexDirection: stacked ? 'column' : 'row', gap: 16 }}>
              {metric(S.run.pacePerKm, fmtPace(tracker.paceSecPerKm))}
              {metric(S.run.time, fmtDuration(snap.elapsedMs))}
            </View>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', gap: 12, paddingBottom: insets.bottom + 12 }}>
          <Button
            big
            kind="secondary"
            icon={paused ? 'play' : 'pause'}
            label={paused ? S.run.resume : S.run.pause}
            onPress={() => void (paused ? controller.resume() : controller.pause())}
            style={{ flex: 1, minHeight: TARGET.runBar }}
            testID="pause"
          />
          <HoldButton label={S.run.finish} hint={S.run.holdHint} icon="stop" confirmTitle={S.run.finish} onComplete={finish} style={{ flex: 1 }} testID="finish" />
        </View>
      </View>

      {conquest ? (
        <ConquestOverlay
          conquest={conquest}
          snap={snap}
          haptics={nativeHaptics}
          activeEventNames={events.map((e) => e.name)}
          onContinue={() => controller.dismissConquest()}
          onFinish={finish}
        />
      ) : null}

      {locked ? (
        <Pressable
          testID="lock-overlay"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: insets.bottom + 120 }}
          delayLongPress={1500}
          onLongPress={() => controller.setLocked(false)}
          accessibilityRole="button"
          accessibilityLabel={S.run.locked}
          accessibilityHint={S.run.unlockHint}
          accessibilityActions={[{ name: 'activate' }]}
          onAccessibilityAction={() => controller.setLocked(false)}
        >
          <View style={{ backgroundColor: t.c.inv, borderRadius: RADII.pill, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <T v="callout" color={t.c.invInk} weight={FONT.bold}>
              {S.run.locked}
            </T>
            <T v="callout" color={t.c.invInk} style={{ fontSize: TYPE.label.fontSize + 1 }}>
              · {S.run.unlockHint}
            </T>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
