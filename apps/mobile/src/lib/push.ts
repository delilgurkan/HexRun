import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type { Api } from '../api/endpoints';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/**
 * İzin verilmişse Expo push jetonunu sunucuya kaydeder (PUT /v1/me/push-token).
 * İzin istemez; izin onboarding'de gerekçesiyle istenir.
 */
export async function registerPush(api: Api): Promise<string | null> {
  if (!Device.isDevice) return null;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'HexRun', importance: Notifications.AndroidImportance.HIGH });
  }
  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  await api.me.pushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
  return token;
}

/** Bildirim verisinden derin bağlantı: `data.deeplink` ya da `data.url`. */
export function deeplinkOf(n: Notifications.Notification | null | undefined): string | null {
  const d = n?.request.content.data as Record<string, unknown> | undefined;
  const v = d?.deeplink ?? d?.url;
  return typeof v === 'string' ? v : null;
}
