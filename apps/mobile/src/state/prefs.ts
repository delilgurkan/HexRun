import { asyncStorageKV, readJSON, writeJSON, type KV } from '../lib/storage';
import { createStore, useStore } from '../lib/store';

export interface Prefs {
  loaded: boolean;
  onboardingDone: boolean;
  permissionsDone: boolean;
  needsProfile: boolean;
  firstLoopDismissed: boolean;
  insigniaIntroSeen: boolean;
  /** Hatırlatılacak etkinlik kimlikleri. */
  remind: string[];
}

const KEY = 'hexrun.prefs.v1';

const DEFAULTS: Prefs = {
  loaded: false,
  onboardingDone: false,
  permissionsDone: false,
  needsProfile: false,
  firstLoopDismissed: false,
  insigniaIntroSeen: false,
  remind: [],
};

export const prefsStore = createStore<Prefs>({ ...DEFAULTS });

let kv: KV = asyncStorageKV;
export function setPrefsKV(k: KV) {
  kv = k;
}

export async function loadPrefs(): Promise<Prefs> {
  const saved = await readJSON<Partial<Prefs>>(kv, KEY);
  prefsStore.set({ ...DEFAULTS, ...(saved ?? {}), loaded: true });
  return prefsStore.get();
}

export async function setPrefs(patch: Partial<Omit<Prefs, 'loaded'>>): Promise<void> {
  prefsStore.set(patch);
  const { loaded: _l, ...rest } = prefsStore.get();
  await writeJSON(kv, KEY, rest);
}

export function usePrefs<U>(select: (p: Prefs) => U): U {
  return useStore(prefsStore, select);
}
