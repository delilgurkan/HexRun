import type { AuthResponse } from '@hexrun/contracts';
import { createStore, useStore } from '../lib/store';
import type { Services } from '../services';
import { setPrefs } from './prefs';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export const authStore = createStore<{ status: AuthStatus }>({ status: 'loading' });

export function useAuthStatus(): AuthStatus {
  return useStore(authStore, (s) => s.status);
}

export async function initAuth(s: Services): Promise<AuthStatus> {
  s.client.setLogoutHandler(() => {
    s.queryClient.clear();
    authStore.set({ status: 'signedOut' });
  });
  const tokens = await s.client.tokens.get();
  const status: AuthStatus = tokens ? 'signedIn' : 'signedOut';
  authStore.set({ status });
  return status;
}

export async function completeSignIn(s: Services, res: AuthResponse): Promise<void> {
  await s.client.saveAuth(res);
  s.queryClient.setQueryData(['me'], res.user);
  await setPrefs({ needsProfile: res.needsProfile });
  authStore.set({ status: 'signedIn' });
}

export async function signOut(s: Services): Promise<void> {
  const t = await s.client.tokens.get();
  if (t) await s.api.auth.logout(t.refreshToken).catch(() => undefined);
  await s.client.tokens.clear();
  s.queryClient.clear();
  authStore.set({ status: 'signedOut' });
}
