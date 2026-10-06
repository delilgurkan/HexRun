import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { createStore, useStore } from './store';

export type LocPerm = 'unknown' | 'denied' | 'whenInUse' | 'always';

export const permStore = createStore<{ location: LocPerm; notifications: 'unknown' | 'granted' | 'denied' }>({
  location: 'unknown',
  notifications: 'unknown',
});

export function useLocationPermission(): LocPerm {
  return useStore(permStore, (s) => s.location);
}

export async function refreshPermissions(): Promise<void> {
  const fg = await Location.getForegroundPermissionsAsync().catch(() => null);
  let location: LocPerm = fg?.granted ? 'whenInUse' : fg?.status === 'denied' ? 'denied' : 'unknown';
  if (fg?.granted) {
    const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
    if (bg?.granted) location = 'always';
  }
  const n = await Notifications.getPermissionsAsync().catch(() => null);
  permStore.set({ location, notifications: n?.granted ? 'granted' : n?.status === 'denied' ? 'denied' : 'unknown' });
}

/** Önce ön plan, sonra arka plan ("her zaman") konum izni. */
export async function requestLocation(): Promise<LocPerm> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) {
    permStore.set({ location: 'denied' });
    return 'denied';
  }
  let result: LocPerm = 'whenInUse';
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.granted) result = 'always';
  } catch {
    // Arka plan izni bazı cihazlarda ayrı ekranda verilir.
  }
  permStore.set({ location: result });
  return result;
}

export async function requestNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'HexRun', importance: Notifications.AndroidImportance.HIGH }).catch(() => undefined);
  }
  const r = await Notifications.requestPermissionsAsync();
  permStore.set({ notifications: r.granted ? 'granted' : 'denied' });
  return r.granted;
}

export function openSettings(): void {
  void Linking.openSettings();
}
