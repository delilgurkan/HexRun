import { createContext, useContext, type ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { ApiClient } from './api/client';
import { createApi, type Api } from './api/endpoints';
import { isApiError } from './api/errors';
import { RunQueue } from './api/runQueue';
import { secureTokenStore, type TokenStore } from './api/tokens';
import { ENV } from './lib/env';
import { asyncStorageKV, type KV } from './lib/storage';

export interface Services {
  client: ApiClient;
  api: Api;
  queryClient: QueryClient;
  runQueue: RunQueue;
  kv: KV;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 60 * 60_000,
        networkMode: 'offlineFirst',
        retry: (n, e) => isApiError(e) && e.isRetryable && !e.isNetwork && n < 2,
      },
      mutations: { networkMode: 'offlineFirst', retry: false },
    },
  });
}

export function createServices(opts: { tokens?: TokenStore; kv?: KV; fetchImpl?: typeof fetch; baseUrl?: string } = {}): Services {
  const client = new ApiClient({ baseUrl: opts.baseUrl ?? ENV.apiUrl, tokens: opts.tokens ?? secureTokenStore(), fetchImpl: opts.fetchImpl });
  const api = createApi(client);
  const kv = opts.kv ?? asyncStorageKV;
  return {
    client,
    api,
    queryClient: makeQueryClient(),
    runQueue: new RunQueue({ kv, submit: (r) => api.runs.submit(r) }),
    kv,
  };
}

let singleton: Services | null = null;
/** Uygulama genelinde tek örnek (arka plan görevi de kullanır). */
export function getServices(): Services {
  if (!singleton) singleton = createServices();
  return singleton;
}
export function setServices(s: Services | null): void {
  singleton = s;
}

const Ctx = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <Ctx.Provider value={services}>{children}</Ctx.Provider>;
}

export function useServices(): Services {
  const s = useContext(Ctx);
  if (!s) throw new Error('ServicesProvider eksik');
  return s;
}

export function useApi(): Api {
  return useServices().api;
}
