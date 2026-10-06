import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import type { LatLng } from '@hexrun/core';
import { useLocationPermission } from './permissions';

/** Kadıköy: konum yokken harita merkezi. */
export const DEFAULT_CENTER: LatLng = { lat: 40.9875, lng: 29.0297 };

/** Son bilinen + güncel konum (izin varsa). `fix` false iken koşu "Konum bulunuyor…" der. */
export function useCurrentLocation(): { pos: LatLng | null; fix: boolean; accuracy: number | null } {
  const perm = useLocationPermission();
  const [pos, setPos] = useState<LatLng | null>(null);
  const [fix, setFix] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  useEffect(() => {
    if (perm !== 'whenInUse' && perm !== 'always') return;
    let alive = true;
    (async () => {
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (alive && last) setPos({ lat: last.coords.latitude, lng: last.coords.longitude });
      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
      if (alive && cur) {
        setPos({ lat: cur.coords.latitude, lng: cur.coords.longitude });
        setAccuracy(cur.coords.accuracy ?? null);
        setFix(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [perm]);
  return { pos, fix, accuracy };
}
