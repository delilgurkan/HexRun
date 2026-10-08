import * as SecureStore from 'expo-secure-store';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Erişim jetonunun bitişi (epoch ms). */
  expiresAt: number;
}

export interface TokenStore {
  get(): Promise<Tokens | null>;
  set(t: Tokens): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'hexrun.tokens.v1';

/** Jetonlar cihazın güvenli deposunda (Keychain / Keystore). Bellekte önbelleklenir. */
export function secureTokenStore(): TokenStore {
  let cache: Tokens | null | undefined;
  return {
    async get() {
      if (cache !== undefined) return cache;
      try {
        const raw = await SecureStore.getItemAsync(KEY);
        cache = raw ? (JSON.parse(raw) as Tokens) : null;
      } catch {
        cache = null;
      }
      return cache;
    },
    async set(t) {
      cache = t;
      await SecureStore.setItemAsync(KEY, JSON.stringify(t), {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    },
    async clear() {
      cache = null;
      await SecureStore.deleteItemAsync(KEY);
    },
  };
}

export function memoryTokenStore(initial: Tokens | null = null): TokenStore {
  let t = initial;
  return {
    get: async () => t,
    set: async (v) => {
      t = v;
    },
    clear: async () => {
      t = null;
    },
  };
}
