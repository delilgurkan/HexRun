import type { ConfigContext, ExpoConfig } from 'expo/config';

const LOCATION_WHEN_IN_USE =
  'HexRun konumunu yalnızca koşu sırasında, koşu sırasında izini çizmek ve halkanın kapandığını anlamak için kullanır.';
const LOCATION_ALWAYS =
  'Ekran kapalıyken de koşu sırasında izini çizmek ve halkanın kapandığını anlamak için konumuna ihtiyaç var. Koşu bitince konum kaydı durur.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'HexRun',
  slug: 'hexrun',
  scheme: 'hexrun',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#0F1312',
  ios: {
    bundleIdentifier: 'co.hexrun.app',
    supportsTablet: false,
    usesAppleSignIn: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: LOCATION_WHEN_IN_USE,
      NSLocationAlwaysAndWhenInUseUsageDescription: LOCATION_ALWAYS,
      NSLocationAlwaysUsageDescription: LOCATION_ALWAYS,
      UIBackgroundModes: ['location', 'remote-notification'],
      ITSAppUsesNonExemptEncryption: false,
    },
    associatedDomains: ['applinks:hexrun.co'],
  },
  android: {
    package: 'co.hexrun.app',
    adaptiveIcon: {
      backgroundColor: '#0F1312',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'POST_NOTIFICATIONS',
      'VIBRATE',
    ],
    predictiveBackGestureEnabled: true,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: 'hexrun.co', pathPrefix: '/app' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    'expo-web-browser',
    'expo-sharing',
    'expo-localization',
    'expo-apple-authentication',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        backgroundColor: '#F7F6F1',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#0F1312' },
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: LOCATION_WHEN_IN_USE,
        locationAlwaysAndWhenInUsePermission: LOCATION_ALWAYS,
        locationAlwaysPermission: LOCATION_ALWAYS,
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ['expo-notifications', { color: '#E69F00', defaultChannel: 'default' }],
    '@maplibre/maplibre-react-native',
  ],
  experiments: { typedRoutes: false },
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
