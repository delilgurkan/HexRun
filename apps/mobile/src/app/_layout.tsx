import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { Archivo_400Regular } from '@expo-google-fonts/archivo/400Regular';
import { Archivo_500Medium } from '@expo-google-fonts/archivo/500Medium';
import { Archivo_600SemiBold } from '@expo-google-fonts/archivo/600SemiBold';
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold';
import { Archivo_800ExtraBold } from '@expo-google-fonts/archivo/800ExtraBold';
import { Archivo_900Black } from '@expo-google-fonts/archivo/900Black';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono/600SemiBold';
import { getServices, ServicesProvider } from '../services';
import { ThemeProvider, useTheme } from '../theme';
import { initAuth, useAuthStatus } from '../state/auth';
import { loadPrefs } from '../state/prefs';
import { refreshPermissions } from '../lib/permissions';
import { deeplinkOf, registerPush } from '../lib/push';
import { toRoute } from '../lib/deeplink';
import { getRunController } from '../run/native';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const services = getServices();

function useBoot(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.all([loadPrefs(), initAuth(services), refreshPermissions()]).catch(() => undefined);
      await getRunController()
        .recover()
        .catch(() => false);
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

/** Kuyruktaki koşuları bağlantı gelince, uygulama öne gelince ve dakikada bir gönder. */
function useQueueFlusher() {
  useEffect(() => {
    const flush = () => void services.runQueue.flush().catch(() => undefined);
    flush();
    const unsubNet = NetInfo.addEventListener((s) => {
      if (s.isConnected) void services.runQueue.flush(true).catch(() => undefined);
    });
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        flush();
        void refreshPermissions();
      } else void getRunController().current?.flush();
    });
    const id = setInterval(flush, 60_000);
    return () => {
      unsubNet();
      sub.remove();
      clearInterval(id);
    };
  }, []);
}

function usePush(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;
    void registerPush(services.api).catch(() => undefined);
    const go = (n: Notifications.Notification | null | undefined) => {
      const r = toRoute(deeplinkOf(n));
      if (r) router.push(r as never);
    };
    void Notifications.getLastNotificationResponseAsync()
      .then((r) => go(r?.notification))
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => go(r.notification));
    return () => sub.remove();
  }, [signedIn]);
}

function Navigator() {
  const t = useTheme();
  const status = useAuthStatus();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(t.c.bg).catch(() => undefined);
  }, [t.c.bg]);
  useEffect(() => {
    if (status === 'signedOut') router.replace('/');
  }, [status]);
  usePush(status === 'signedIn');
  return (
    <>
      <StatusBar style={t.isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.c.bg }, animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="region/[cell]"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.6, 1],
            sheetGrabberVisible: true,
            sheetCornerRadius: Platform.OS === 'ios' ? 38 : 28,
            contentStyle: { backgroundColor: t.c.surf },
          }}
        />
        <Stack.Screen name="run/index" options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="run/summary" options={{ gestureEnabled: false }} />
        <Stack.Screen name="duel/select" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="share/[runId]" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Archivo_900Black,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  const booted = useBoot();
  useQueueFlusher();
  const ready = fontsLoaded && booted;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  if (!ready) return null;
  return (
    <ServicesProvider services={services}>
      <QueryClientProvider client={services.queryClient}>
        <ThemeProvider>
          <Navigator />
        </ThemeProvider>
      </QueryClientProvider>
    </ServicesProvider>
  );
}
