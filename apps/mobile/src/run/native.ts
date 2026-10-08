import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import type { TrackPoint } from '@hexrun/core';
import { uuidv4 } from '../lib/uuid';
import { getServices } from '../services';
import { mapCache } from '../state/mapCache';
import { RunController, type HapticsAdapter, type KeepAwakeAdapter, type LocationAdapter } from './controller';

export const LOCATION_TASK = 'hexrun-run-location';
const KEEP_AWAKE_TAG = 'hexrun-run';

export function toTrackPoint(l: Location.LocationObject): TrackPoint {
  return {
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    t: l.timestamp,
    ...(l.coords.accuracy != null ? { acc: l.coords.accuracy } : {}),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const nativeHaptics: HapticsAdapter = {
  tick(strength) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (strength === 'double') void sleep(90).then(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)).catch(() => undefined);
  },
  closeImpact() {
    if (Platform.OS === 'android') void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm).catch(() => undefined);
    else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => undefined);
  },
  cellTick() {
    void Haptics.selectionAsync().catch(() => undefined);
  },
  crack() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      .then(() => sleep(70))
      .then(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium))
      .catch(() => undefined);
  },
  success() {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
};

const keepAwake: KeepAwakeAdapter = {
  activate: () => void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined),
  deactivate: () => void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined),
};

let watcher: Location.LocationSubscription | null = null;

/**
 * Konum: arka plan izni varsa TaskManager görevi (ekran kapalıyken de), yoksa yalnız ön plan
 * izleyicisi. Görev noktaları doğrudan denetleyiciye (ya da depoya) yazar.
 */
export const nativeLocation: LocationAdapter = {
  async start(onPoints) {
    const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
    if (bg?.granted) {
      const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
      if (!started) {
        await Location.startLocationUpdatesAsync(LOCATION_TASK, {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 3,
          activityType: Location.ActivityType.Fitness,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'HexRun koşunu kaydediyor',
            notificationBody: 'Halkanı çiziyoruz. Bitirmek için uygulamayı aç.',
            notificationColor: '#0F1312',
            killServiceOnDestroy: false,
          },
        });
      }
      return;
    }
    watcher?.remove();
    watcher = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 3 },
      (loc) => onPoints([toTrackPoint(loc)]),
    );
  },
  async stop() {
    watcher?.remove();
    watcher = null;
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  },
};

let controller: RunController | null = null;

export function getRunController(): RunController {
  if (!controller) {
    const s = getServices();
    controller = new RunController({
      kv: s.kv,
      uuid: uuidv4,
      location: nativeLocation,
      haptics: nativeHaptics,
      keepAwake,
      queue: s.runQueue,
      onActivity: (running) => void s.api.me.activity(running).catch(() => undefined),
      conquestContext: () => {
        const c = mapCache();
        return { myId: c.myId, cells: c.cells, attacking: c.attacking };
      },
    });
  }
  return controller;
}

export function deviceName(): string | undefined {
  return Device.modelName ?? undefined;
}
