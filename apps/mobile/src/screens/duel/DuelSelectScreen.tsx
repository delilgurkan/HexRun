import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { MapRef } from '@maplibre/maplibre-react-native';
import type { DuelSummary } from '@hexrun/contracts';
import { cellCenter, cellOf, fmtArea, fmtKm } from '@hexrun/core';
import { errorText } from '../../api/errorText';
import { useMe, useRegion } from '../../api/hooks';
import { Button, IconButton } from '../../components/Button';
import { Segmented } from '../../components/Chip';
import { PlayerBadge } from '../../components/PlayerBadge';
import { Stat } from '../../components/Screen';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { HexMap } from '../../map/HexMap';
import { startRun } from '../../run/start';
import { useServices } from '../../services';
import { mapCache } from '../../state/mapCache';
import { GUTTER, RADII, useTheme } from '../../theme';
import { applyPaint, paintModeFor, selectionState, type PaintMode } from './selection';

const first = (n: string) => n.split(' ')[0] ?? n;

/**
 * 16 · Düello alanı seçimi: parmağını kaydırdıkça petekler boyanır, aynı yerden tekrar
 * kaydırınca seçim kalkar (7–60). Tamam → düello başlar ve rota çizilir. Tolerans gösterilmez.
 */
export function DuelSelectScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { api, queryClient } = useServices();
  const params = useLocalSearchParams<{ cell?: string; cells?: string; defender?: string }>();
  const region = useRegion(params.cell || params.cells?.split(',')[0]);
  const me = useMe();
  const mapRef = useRef<MapRef>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set((params.cells ?? '').split(',').filter(Boolean)));
  const [mode, setMode] = useState<'paint' | 'pan'>('paint');
  const [created, setCreated] = useState<DuelSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const paint = useRef<{ mode: PaintMode; last: string | null } | null>(null);

  const owner = region.data?.owner ?? null;
  const allowed = useMemo(() => new Set(region.data?.cells ?? []), [region.data?.cells]);
  const ownerCells = useMemo(() => {
    const c = mapCache().cells;
    return (region.data?.cells ?? []).map((id) => c.get(id) ?? { id, ownerId: owner?.id ?? null, power: region.data?.avgPower ?? 0, slot: owner?.slot ?? null, duel: null, progress: null, attackerSlot: null, ghost: 0 });
  }, [region.data, owner]);

  const ids = useMemo(() => [...selected].sort(), [selected]);
  const [debounced, setDebounced] = useState(ids);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(ids), 400);
    return () => clearTimeout(id);
  }, [ids]);
  const preview = useQuery({
    queryKey: ['duelPreview', debounced.join(',')],
    queryFn: () => api.duels.preview({ cells: debounced }),
    enabled: debounced.length >= 7 && debounced.length <= 60 && !created,
  });
  const state = selectionState(ids.length, debounced.length === ids.length ? preview.data : null);

  const toCell = async (x: number, y: number): Promise<string | null> => {
    const ll = await mapRef.current?.unproject([x, y]).catch(() => null);
    if (!ll) return null;
    return cellOf({ lng: ll[0], lat: ll[1] });
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => mode === 'paint' && !created,
        onMoveShouldSetPanResponder: () => mode === 'paint' && !created,
        onPanResponderGrant: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          void toCell(locationX, locationY).then((c) => {
            if (!c) return;
            setSelected((s) => {
              const m = paintModeFor(c, s);
              paint.current = { mode: m, last: c };
              return applyPaint(s, c, m, allowed);
            });
          });
        },
        onPanResponderMove: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          void toCell(locationX, locationY).then((c) => {
            const p = paint.current;
            if (!c || !p || c === p.last) return;
            p.last = c;
            setSelected((s) => applyPaint(s, c, p.mode, allowed));
          });
        },
        onPanResponderRelease: () => {
          paint.current = null;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, created, allowed],
  );

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await api.duels.create({ cells: ids });
      setCreated(d);
      void queryClient.invalidateQueries({ queryKey: ['duels'] });
      void queryClient.invalidateQueries({ queryKey: ['map'] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const name = owner ? first(owner.displayName) : '';
  const slotsUsed = 3 - (preview.data?.slotsLeft ?? region.data?.duelSlotsLeft ?? 3);
  const area = preview.data?.areaM2 ?? ids.length * 307;
  const center = params.cell ? cellCenter(params.cell) : ids[0] ? cellCenter(ids[0]) : undefined;

  let kicker = S.duelSelect.kickerSel;
  let head = S.duelSelect.headSel(ids.length);
  let side = S.duelSelect.sideArea(fmtArea(area));
  let sub = S.duelSelect.subSel;
  if (state === 'empty') [kicker, head, side, sub] = [S.duelSelect.kickerEmpty, S.duelSelect.headEmpty, S.common.cells(0), S.duelSelect.subEmpty(name)];
  if (state === 'small') [kicker, side, sub] = [S.duelSelect.kickerSmall, S.duelSelect.sideMin, S.duelSelect.subSmall];
  if (state === 'big') [kicker, side, sub] = [S.duelSelect.kickerBig, S.duelSelect.sideMax, S.duelSelect.subBig];
  if (state === 'limit') [kicker, sub] = [S.duelSelect.kickerLimit, S.duelSelect.subLimit];
  if (state === 'invalid') [kicker, sub] = [S.duelSelect.kickerError, preview.data?.error === 'not_connected' ? S.duelSelect.subNotConnected : S.common.genericError];

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }} testID="duel-select">
      <View style={{ flex: 1 }} {...responder.panHandlers}>
        <HexMap
          mapRef={mapRef}
          cells={ownerCells}
          showPlayers={false}
          highlight={region.data?.cells}
          selection={created ? created.cells : ids}
          selectionColor={me.data ? t.player(me.data.slot) : undefined}
          route={created?.route ?? null}
          center={center}
          zoom={16}
          dragPan={mode === 'pan' || !!created}
        />
      </View>
      <View style={{ position: 'absolute', top: insets.top + 8, left: GUTTER, right: GUTTER, gap: 8 }} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <IconButton icon="close" glass accessibilityLabel={created ? S.common.close : S.common.cancel} onPress={() => router.back()} />
          <View style={{ flex: 1, backgroundColor: t.c.glass, borderRadius: RADII.s, padding: 8, borderWidth: 1, borderColor: t.c.line }}>
            <T v="callout" weight="Archivo_700Bold">
              {S.duelSelect.title} · {S.duelSelect.slot(Math.max(0, slotsUsed) + (created ? 1 : 0))}
            </T>
            {owner ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <PlayerBadge slot={owner.slot} initials={owner.initials} size={20} />
                <T v="data" tone={2}>
                  {S.duelSelect.owner(owner.displayName, region.data?.cells.length ?? 0, Math.round(region.data?.avgPower ?? 0))}
                </T>
              </View>
            ) : null}
          </View>
        </View>
        {!created ? (
          <Segmented
            options={[
              { key: 'paint', label: S.duelSelect.paint },
              { key: 'pan', label: S.duelSelect.pan },
            ]}
            value={mode}
            onChange={setMode}
            style={{ backgroundColor: t.c.glass }}
          />
        ) : null}
        {!created && mode === 'paint' ? (
          <T v="callout" tone={2} align="center">
            {state === 'empty' ? S.duelSelect.hintEmpty(name) : S.duelSelect.hint}
          </T>
        ) : null}
      </View>

      <View style={{ backgroundColor: t.c.surf, borderTopLeftRadius: RADII.sheet, borderTopRightRadius: RADII.sheet, padding: GUTTER, paddingBottom: insets.bottom + 12, gap: 10, borderTopWidth: 1, borderColor: t.c.line }}>
        {created ? (
          <>
            <T v="label" tone={2}>
              {S.duelSelect.started(name)}
            </T>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <T v="title1">{S.duelSelect.routeReady}</T>
              <T v="data">{S.common.cells(created.cells.length)}</T>
            </View>
            <T tone={2}>{S.duelSelect.routeSub(name)}</T>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Stat label={S.duelSelect.statDistance} value={`${fmtKm(created.routeLengthM, 1)} km`} />
              <Stat label={S.duelSelect.statTime} value={`~${Math.round((created.routeLengthM / 1000) * 5.5)} dk`} />
              <Stat label={S.duelSelect.statHp} value={String(Math.round(created.hp))} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button
                kind="secondary"
                label={S.duelSelect.edit}
                onPress={async () => {
                  await api.duels.cancel(created.id).catch(() => undefined);
                  setSelected(new Set(created.cells));
                  setCreated(null);
                }}
                style={{ flex: 1 }}
              />
              <Button label={S.duelSelect.run} icon="play" onPress={() => void startRun(me.data, { attackDuelId: created.id })} style={{ flex: 1 }} testID="duel-run" />
            </View>
          </>
        ) : (
          <>
            <T v="label" tone={2} testID="selection-kicker">
              {kicker}
            </T>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <T v="title1" testID="selection-head">
                {head}
              </T>
              <T v="data" tone={2}>
                {side}
              </T>
            </View>
            <T tone={2}>{sub}</T>
            {preview.data?.ok && state === 'ok' ? (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Stat label={S.duelSelect.statDistance} value={`${fmtKm(preview.data.routeLengthM, 1)} km`} />
                <Stat label={S.duelSelect.statTime} value={`~${preview.data.estMinutes} dk`} />
                <Stat label={S.duelSelect.statHp} value={String(Math.round(preview.data.avgPower))} />
              </View>
            ) : null}
            {error ? <T v="callout">{error}</T> : null}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button kind="secondary" label={S.common.cancel} onPress={() => router.back()} style={{ flex: 1 }} />
              <Button label={S.duelSelect.confirm} onPress={confirm} disabled={state !== 'ok' || !preview.data?.ok} loading={busy} style={{ flex: 1 }} testID="duel-confirm" />
            </View>
          </>
        )}
      </View>
    </View>
  );
}
