/** Ortam değişkenleri (EXPO_PUBLIC_* derleme anında gömülür). */
const trimSlash = (s: string) => s.replace(/\/+$/, '');

export const ENV = {
  apiUrl: trimSlash(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'),
  /** Ücretsiz, OSM tabanlı vektör stil (OpenFreeMap). */
  mapStyleUrl: process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/positron',
  mapStyleUrlDark: process.env.EXPO_PUBLIC_MAP_STYLE_URL_DARK ?? process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/dark',
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
  googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://hexrun.co/kosullar',
  privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://hexrun.co/gizlilik',
} as const;
