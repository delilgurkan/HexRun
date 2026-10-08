import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiClient } from '../api/client';
import type { Api } from '../api/endpoints';
import { RunQueue } from '../api/runQueue';
import { memoryTokenStore } from '../api/tokens';
import { memoryKV } from '../lib/storage';
import { ServicesProvider, type Services } from '../services';
import { ThemeProvider, type ColorScheme } from '../theme';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends (...a: never[]) => unknown ? T[K] : DeepPartial<T[K]> };

const never = () => new Promise<never>(() => undefined);

/** Sahte API: verilmeyen uçlar hiç dönmeyen söz döner (yükleniyor durumu). */
export function fakeApi(over: DeepPartial<Api> = {}): Api {
  const handler: ProxyHandler<object> = {
    get(target, prop: string) {
      const v = (target as Record<string, unknown>)[prop];
      if (v !== undefined) return typeof v === 'object' && v !== null ? new Proxy(v, handler) : v;
      return new Proxy(jest.fn(never), handler);
    },
  };
  return new Proxy(over as object, handler) as Api;
}

export function makeTestServices(api: Api): Services {
  const kv = memoryKV();
  return {
    client: new ApiClient({ baseUrl: 'http://test', tokens: memoryTokenStore() }),
    api,
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity }, mutations: { retry: false } } }),
    runQueue: new RunQueue({ kv, submit: api.runs.submit }),
    kv,
  };
}

export async function renderWith(ui: ReactElement, opts: { api?: Api; services?: Services; scheme?: ColorScheme } = {}) {
  const services = opts.services ?? makeTestServices(opts.api ?? fakeApi());
  const utils = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <ServicesProvider services={services}>
        <QueryClientProvider client={services.queryClient}>
          <ThemeProvider scheme={opts.scheme ?? 'dark'}>{ui}</ThemeProvider>
        </QueryClientProvider>
      </ServicesProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, services };
}
