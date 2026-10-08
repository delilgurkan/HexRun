/* eslint-disable @typescript-eslint/no-require-imports */
/** Yerel modül sahteleri: MapLibre, konum, haptik, ekran açık tutma, güvenli depo. */
import './src/lib/polyfills';
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'tr', languageTag: 'tr-TR' }],
  getCalendars: () => [{ timeZone: 'Europe/Istanbul' }],
}));

jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const passthrough = (name: string) => {
    const C = React.forwardRef((props: { children?: unknown; testID?: string }, _ref: unknown) =>
      React.createElement(View, { testID: props.testID ?? `mock-${name}` }, props.children),
    );
    C.displayName = name;
    return C;
  };
  const MapC = React.forwardRef((props: { children?: unknown }, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({
      unproject: async ([x, y]: [number, number]) => [29.03 + x * 1e-5, 40.98 - y * 1e-5],
      project: async () => [0, 0],
      getBounds: async () => [29, 40.97, 29.05, 41],
    }));
    return React.createElement(View, { testID: 'mock-map' }, props.children);
  });
  return {
    Map: MapC,
    Camera: passthrough('Camera'),
    GeoJSONSource: passthrough('GeoJSONSource'),
    Layer: () => null,
    Marker: passthrough('Marker'),
    Images: () => null,
    UserLocation: () => null,
    NativeUserLocation: () => null,
  };
});

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3, High: 4, BestForNavigation: 6 },
  ActivityType: { Fitness: 3 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true })),
  getBackgroundPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'denied', canAskAgain: true })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'denied', canAskAgain: true })),
  getLastKnownPositionAsync: jest.fn(async () => ({ coords: { latitude: 40.987, longitude: 29.03, accuracy: 10 }, timestamp: Date.now() })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 40.987, longitude: 29.03, accuracy: 10 }, timestamp: Date.now() })),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(() => false),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  performAndroidHapticsAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  AndroidHaptics: { Confirm: 'confirm' },
}));

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
  useKeepAwake: jest.fn(),
}));

jest.mock('expo-secure-store', () => {
  const m = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK: 0,
    getItemAsync: jest.fn(async (k: string) => m.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void m.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void m.delete(k)),
  };
});

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  setNotificationChannelAsync: jest.fn(async () => null),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', DATE: 'date' },
  AndroidImportance: { HIGH: 4 },
}));

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///tmp/card.png') }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  useNetInfo: jest.fn(() => ({ isConnected: true, isInternetReachable: true })),
}));

jest.mock('expo-router', () => {
  const React = require('react');
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), dismiss: jest.fn(), navigate: jest.fn() };
  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: jest.fn(() => ({})),
    useFocusEffect: (cb: () => void) => React.useEffect(cb, []),
    Link: ({ children }: { children: unknown }) => children,
    Redirect: () => null,
    Stack: Object.assign(() => null, { Screen: () => null }),
    Tabs: Object.assign(() => null, { Screen: () => null }),
  };
});
