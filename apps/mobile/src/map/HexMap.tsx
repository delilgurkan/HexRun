import { useEffect, useMemo, useState, type ReactNode, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, Marker, type CameraRef, type MapRef, type ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import type { MapCell, MapPlayer } from '@hexrun/contracts';
import { cellOf, type LatLng } from '@hexrun/core';
import type { NativeSyntheticEvent } from 'react-native';
import { PlayerBadge } from '../components/PlayerBadge';
import { ENV } from '../lib/env';
import { CELL_FILL_OPACITY, MOTION, useTheme } from '../theme';
import { cellsToGeoJSON, circle, EMPTY_FC, idsToGeoJSON, lineToGeoJSON, polygonToGeoJSON, triangle } from './geojson';

export interface Bounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface HexMapProps {
  cells?: readonly MapCell[];
  players?: readonly MapPlayer[];
  myId?: string | null;
  attackers?: number;
  /** Çevrimdışı: son bilinen harita soluk. */
  faded?: boolean;
  /** İlk halka önerisi (kesikli). */
  suggestion?: readonly LatLng[] | null;
  /** Koşu izi. */
  trace?: readonly LatLng[];
  start?: LatLng | null;
  captureRadiusM?: number;
  /** Kapanış modunda taralı önizleme. */
  previewRing?: readonly LatLng[] | null;
  /** Seçili bölge (bölge sayfası). */
  highlight?: readonly string[];
  /** Düello seçimi. */
  selection?: readonly string[];
  selectionColor?: string;
  /** Düello rotası. */
  route?: readonly LatLng[] | null;
  center?: LatLng;
  zoom?: number;
  dragPan?: boolean;
  showPlayers?: boolean;
  onBoundsChange?: (b: Bounds, zoom: number) => void;
  onCellPress?: (cellId: string, at: LatLng) => void;
  onPlayerPress?: (p: MapPlayer) => void;
  mapRef?: Ref<MapRef>;
  cameraRef?: Ref<CameraRef>;
  children?: ReactNode;
  testID?: string;
}

/** Breathing kuşatma kenarı: 2 sn döngü; "Hareketi azalt" açıkken sabit tarama. */
function useBreath(enabled: boolean): number {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setOn((v) => !v), MOTION.breathe / 2);
    return () => clearInterval(id);
  }, [enabled]);
  return enabled ? (on ? 1 : 0.35) : 0.9;
}

export function HexMap(p: HexMapProps) {
  const t = useTheme();
  const fillOpacity = CELL_FILL_OPACITY[t.scheme] * (p.faded ? 0.45 : 1);
  const hasSiege = useMemo(() => (p.cells ?? []).some((c) => c.duel === 'defending'), [p.cells]);
  const breath = useBreath(hasSiege && !t.reduceMotion && !p.faded);
  const cellsFC = useMemo(() => cellsToGeoJSON(p.cells ?? [], t.player, p.myId ?? null), [p.cells, t.player, p.myId]);
  const highlightFC = useMemo(() => (p.highlight?.length ? idsToGeoJSON(p.highlight) : EMPTY_FC), [p.highlight]);
  const selectionFC = useMemo(() => (p.selection?.length ? idsToGeoJSON(p.selection) : EMPTY_FC), [p.selection]);
  const traceF = useMemo(() => (p.trace && p.trace.length >= 2 ? lineToGeoJSON(p.trace) : null), [p.trace]);
  const suggestionF = useMemo(() => (p.suggestion && p.suggestion.length >= 2 ? lineToGeoJSON(p.suggestion) : null), [p.suggestion]);
  const routeF = useMemo(() => (p.route && p.route.length >= 2 ? lineToGeoJSON(p.route) : null), [p.route]);
  const previewF = useMemo(() => (p.previewRing && p.previewRing.length >= 4 ? polygonToGeoJSON(p.previewRing) : null), [p.previewRing]);
  const startF = useMemo(() => {
    if (!p.start) return null;
    const r = p.captureRadiusM ?? 50;
    return {
      type: 'FeatureCollection' as const,
      features: [lineToGeoJSON(circle(p.start, r)), lineToGeoJSON(circle(p.start, r * 0.8)), polygonToGeoJSON(triangle(p.start))],
    };
  }, [p.start, p.captureRadiusM]);

  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const [w, s, east, n] = e.nativeEvent.bounds;
    p.onBoundsChange?.({ minLat: s, minLng: w, maxLat: n, maxLng: east }, e.nativeEvent.zoom);
  };

  const styleUrl = t.isDark ? ENV.mapStyleUrlDark : ENV.mapStyleUrl;

  return (
    <View style={StyleSheet.absoluteFill} testID={p.testID ?? 'hex-map'}>
      <Map
        ref={p.mapRef}
        style={StyleSheet.absoluteFill}
        mapStyle={styleUrl}
        logo={false}
        attribution
        attributionPosition={{ bottom: 8, left: 8 }}
        compass={false}
        dragPan={p.dragPan ?? true}
        touchPitch={false}
        onRegionDidChange={onRegionDidChange}
        onPress={(e) => {
          if (!p.onCellPress) return;
          const [lng, lat] = e.nativeEvent.lngLat;
          p.onCellPress(cellOf({ lat, lng }), { lat, lng });
        }}
      >
        <Camera ref={p.cameraRef} initialViewState={p.center ? { center: [p.center.lng, p.center.lat], zoom: p.zoom ?? 15 } : { zoom: p.zoom ?? 13 }} minZoom={11} maxZoom={19} />

        <GeoJSONSource id="cells" data={cellsFC}>
          <Layer type="fill" id="cells-fill" style={{ fillColor: ['get', 'fill'], fillOpacity, fillOpacityTransition: { duration: MOTION.sheet, delay: 0 } }} />
          <Layer
            type="line"
            id="cells-casing"
            style={{ lineColor: t.c.casing, lineWidth: 1, lineOpacity: p.faded ? 0.25 : 0.55 }}
          />
          <Layer
            type="line"
            id="cells-siege-edge"
            filter={['==', ['get', 'siege'], true]}
            style={{ lineColor: t.c.ink, lineWidth: 2.5, lineDasharray: [1.5, 1], lineOpacity: breath, lineOpacityTransition: { duration: MOTION.breathe / 2, delay: 0 } }}
          />
          <Layer
            type="line"
            id="cells-attack-edge"
            filter={['==', ['get', 'attacking'], true]}
            style={{ lineColor: t.c.ink, lineWidth: 2, lineDasharray: [2, 1.5], lineOpacity: 0.8 }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="highlight" data={highlightFC}>
          <Layer type="line" id="highlight-line" style={{ lineColor: t.c.ink, lineWidth: 2.5 }} />
        </GeoJSONSource>

        <GeoJSONSource id="selection" data={selectionFC}>
          <Layer type="fill" id="selection-fill" style={{ fillColor: p.selectionColor ?? t.c.ink, fillOpacity: 0.35 }} />
          <Layer type="line" id="selection-line" style={{ lineColor: t.c.ink, lineWidth: 2 }} />
        </GeoJSONSource>

        {previewF ? (
          <GeoJSONSource id="preview" data={previewF}>
            <Layer type="fill" id="preview-fill" style={{ fillColor: t.c.ink, fillOpacity: 0.12 }} />
            <Layer type="line" id="preview-line" style={{ lineColor: t.c.ink, lineWidth: 2, lineDasharray: [2, 2] }} />
          </GeoJSONSource>
        ) : null}

        {suggestionF ? (
          <GeoJSONSource id="suggestion" data={suggestionF}>
            <Layer type="line" id="suggestion-line" style={{ lineColor: t.c.ink, lineWidth: 3, lineDasharray: [2, 1.5], lineCap: 'round' }} />
          </GeoJSONSource>
        ) : null}

        {routeF ? (
          <GeoJSONSource id="route" data={routeF}>
            <Layer type="line" id="route-line" style={{ lineColor: t.c.ink, lineWidth: 3, lineDasharray: [1, 1.2], lineCap: 'round' }} />
          </GeoJSONSource>
        ) : null}

        {traceF ? (
          <GeoJSONSource id="trace" data={traceF}>
            <Layer type="line" id="trace-casing" style={{ lineColor: t.c.ink, lineWidth: 7, lineCap: 'round', lineJoin: 'round' }} />
            <Layer type="line" id="trace-line" style={{ lineColor: t.c.trace, lineWidth: 3.5, lineCap: 'round', lineJoin: 'round' }} />
          </GeoJSONSource>
        ) : null}

        {startF ? (
          <GeoJSONSource id="start" data={startF}>
            <Layer type="line" id="start-rings" filter={['==', ['geometry-type'], 'LineString']} style={{ lineColor: t.c.ink, lineWidth: 1.5 }} />
            <Layer type="fill" id="start-triangle" filter={['==', ['geometry-type'], 'Polygon']} style={{ fillColor: t.c.ink }} />
          </GeoJSONSource>
        ) : null}

        {(p.showPlayers ?? true)
          ? (p.players ?? [])
              .filter((pl) => pl.marker)
              .map((pl) => (
                <Marker key={pl.id} id={`pl-${pl.id}`} lngLat={[pl.marker!.lng, pl.marker!.lat]} onPress={() => p.onPlayerPress?.(pl)}>
                  <View accessible accessibilityRole="button" accessibilityLabel={pl.hidden ? 'Gizli oyuncu' : `${pl.displayName}, ${pl.cells} petek`}>
                    <PlayerBadge
                      slot={pl.slot}
                      initials={pl.initials}
                      hidden={pl.hidden}
                      goldFrame={pl.goldFrame}
                      size={pl.id === p.myId ? 40 : 32}
                      ring={pl.id === p.myId}
                      attackers={pl.id === p.myId ? p.attackers : undefined}
                    />
                  </View>
                </Marker>
              ))
          : null}
        {p.children}
      </Map>
    </View>
  );
}
