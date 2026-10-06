import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import type { MapResponse } from '@hexrun/contracts';
import { cellOf } from '@hexrun/core';
import { isApiError } from '../../api/errors';
import { readLastMap, useDuels, useFirstLoop, useMap, useMe, useNotifications, useStats, useEvents } from '../../api/hooks';
import { Button, IconButton } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { PlayerBadge } from '../../components/PlayerBadge';
import { HexTexture, Skeleton } from '../../components/Skeleton';
import { siegeLevel } from '../../components/hatMath';
import { S } from '../../i18n';
import { minutesAgo } from '../../lib/dates';
import { eventsShortLabel, resolveEvents } from '../../lib/events';
import { openSettings, useLocationPermission } from '../../lib/permissions';
import { DEFAULT_CENTER, useCurrentLocation } from '../../lib/useLocation';
import { HexMap, type Bounds } from '../../map/HexMap';
import { startRun } from '../../run/start';
import { useServices } from '../../services';
import { rememberDuels, rememberMap, rememberMe } from '../../state/mapCache';
import { setPrefs, usePrefs } from '../../state/prefs';
import { GUTTER, useTheme } from '../../theme';
import { FirstLoopCard, OfflineCard, SiegeBanner } from './MapOverlays';

/**
 * 03 · Ana harita. Arayüz yalnız dört köşede ve tek birincil eylemde.
 * Durumlar: dolu, boş (ilk halka önerisi), yükleniyor (petek iskeleti), çevrimdışı (soluk + tekrar dene).
 */
export function MapScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { kv } = useServices();
  const perm = useLocationPermission();
  const net = useNetInfo();
  const { pos, fix } = useCurrentLocation();
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [lastMap, setLastMap] = useState<{ at: number; res: MapResponse } | null>(null);
  const cameraRef = useRef<CameraRef>(null);
  const firstLoopDismissed = usePrefs((p) => p.firstLoopDismissed);

  const me = useMe();
  const map = useMap(bounds);
  const duels = useDuels();
  const stats = useStats();
  const events = useEvents();
  const notifs = useNotifications('all');

  useEffect(() => {
    void readLastMap(kv).then(setLastMap);
  }, [kv]);
  useEffect(() => {
    if (map.data) rememberMap(map.data, me.data?.id ?? null);
  }, [map.data, me.data?.id]);
  useEffect(() => {
    if (duels.data) rememberDuels(duels.data);
  }, [duels.data]);
  useEffect(() => {
    rememberMe(me.data?.id ?? null);
  }, [me.data?.id]);

  // Başlangıçta konum yoksa varsayılan bbox.
  useEffect(() => {
    if (bounds) return;
    const c = pos ?? DEFAULT_CENTER;
    const d = 0.01;
    setBounds({ minLat: c.lat - d, minLng: c.lng - d, maxLat: c.lat + d, maxLng: c.lng + d });
  }, [pos, bounds]);

  const offline = net.isConnected === false || (map.isError && isApiError(map.error) && map.error.isNetwork);
  const data: MapResponse | undefined = map.data ?? (offline ? lastMap?.res : undefined);
  const loading = !data && !offline;
  const myId = me.data?.id ?? null;
  const myPlayer = data?.players.find((p) => p.id === myId);
  const myCells = stats.data?.cells ?? myPlayer?.cells ?? data?.cells.filter((c) => c.ownerId && c.ownerId === myId).length ?? 0;
  const isEmpty = !!data && !offline && myCells === 0 && !firstLoopDismissed;
  const firstLoop = useFirstLoop(pos, isEmpty);
  const suggestion = isEmpty ? firstLoop.data : null;

  const active = useMemo(() => resolveEvents(data?.activeEvents ?? events.data).filter((e) => e.active), [data?.activeEvents, events.data]);
  const unread = notifs.data?.pages[0]?.items.filter((n) => !n.read).length ?? 0;
  const siege = (duels.data?.defending ?? []).filter((d) => d.status === 'active' && siegeLevel(d.power, d.progress) !== 'none').sort((a, b) => b.progress / b.power - a.progress / a.power)[0];
  const runLocked = perm === 'denied';

  const onCellPress = useCallback(
    (cellId: string) => {
      router.push({ pathname: '/region/[cell]', params: { cell: cellId } });
    },
    [],
  );

  const recenter = () => {
    if (pos) cameraRef.current?.flyTo({ center: [pos.lng, pos.lat], zoom: 15.5, duration: t.reduceMotion ? 0 : 600 });
  };

  const start = (firstLoopRun = false) => void startRun(me.data, firstLoopRun ? { firstLoop: true } : {});

  const waitingGps = (perm === 'whenInUse' || perm === 'always') && !fix;
  const ctaLabel = runLocked ? S.map.runLocked : waitingGps ? S.map.locating : S.map.start;

  return (
    <View style={{ flex: 1, backgroundColor: t.c.land }} testID="map-screen">
      <HexMap
        cells={data?.cells}
        players={data?.players}
        myId={myId}
        attackers={data?.attackersLast48h}
        faded={offline}
        suggestion={suggestion?.ring ?? null}
        center={pos ?? DEFAULT_CENTER}
        zoom={15}
        cameraRef={cameraRef}
        onBoundsChange={(b) => setBounds(b)}
        onCellPress={onCellPress}
        onPlayerPress={(p) => p.marker && onCellPress(cellOf(p.marker))}
      />
      {loading ? <HexTexture opacity={0.9} /> : null}

      {/* Üst köşeler: avatar + seri, etkinlik çipi, zil */}
      <View style={{ position: 'absolute', top: insets.top + 8, left: GUTTER, right: GUTTER, gap: 8 }} pointerEvents="box-none">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} pointerEvents="box-none">
          <IconButton accessibilityLabel={S.map.avatarA11y} onPress={() => router.push('/profile')} size={48} testID="avatar">
            {me.data ? <PlayerBadge slot={me.data.slot} initials={me.data.initials} size={44} goldFrame={me.data.goldFrame} ring /> : <Skeleton width={44} height={44} radius={22} />}
          </IconButton>
          {stats.data && stats.data.streakDays > 0 ? <Chip glass icon="streak" label={S.map.streakChip(stats.data.streakDays)} /> : null}
          {me.data && me.data.newbieDaysLeft > 0 ? <Chip glass label={S.rookie.chip(me.data.newbieDaysLeft)} /> : null}
          <View style={{ flex: 1 }} />
          <IconButton icon="bell" glass accessibilityLabel={S.map.bellA11y(unread)} badge={unread} onPress={() => router.push('/notifications')} testID="bell" />
        </View>
        {active.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip
              glass
              icon="events"
              label={`${S.map.eventsChip(active.length)} · ${eventsShortLabel(active)}`}
              onPress={() => router.push('/events')}
              testID="events-chip"
            />
          </ScrollView>
        ) : null}
        {loading ? (
          <Chip glass label={S.map.loadingRegions} testID="map-loading" />
        ) : null}
      </View>

      {/* Sağ kenar: konumum */}
      <View style={{ position: 'absolute', right: GUTTER, bottom: insets.bottom + (isEmpty ? 420 : 170) }}>
        <IconButton icon="locate" glass accessibilityLabel={S.map.myLocation} onPress={recenter} />
      </View>

      {/* Alt: kart + tek birincil eylem */}
      <View style={{ position: 'absolute', left: GUTTER, right: GUTTER, bottom: 12, gap: 10 }} pointerEvents="box-none">
        {offline ? <OfflineCard minutes={lastMap ? minutesAgo(lastMap.at) : null} onRetry={() => void map.refetch()} /> : null}
        {!offline && siege && me.data ? (
          <SiegeBanner duel={siege} ownerSlot={me.data.slot} onPress={() => router.push({ pathname: '/duel/[id]', params: { id: siege.id } })} />
        ) : null}
        {suggestion ? (
          <FirstLoopCard s={suggestion} onStart={() => start(true)} onDismiss={() => void setPrefs({ firstLoopDismissed: true })} />
        ) : (
          <Button
            big
            label={ctaLabel}
            icon={runLocked ? 'lock' : 'play'}
            accessibilityLabel={runLocked ? S.map.runLocked : S.map.startA11y}
            accessibilityHint={runLocked ? S.map.runLockedBody : undefined}
            onPress={runLocked ? openSettings : () => start(false)}
            disabled={waitingGps}
            testID="start-run"
            style={{ minHeight: 64 }}
          />
        )}
      </View>
    </View>
  );
}
