import type { AuthResponse } from '@hexrun/contracts';
import { ApiError } from './errors';
import type { TokenStore, Tokens } from './tokens';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  body?: unknown;
  query?: Query;
  /** Varsayılan true: Bearer jetonu eklenir ve 401'de bir kez yenilenir. */
  auth?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Yenileme başarısızsa çağrılır (oturum kapandı). */
  onLogout?: () => void;
  now?: () => number;
}

/**
 * Tipli fetch istemcisi: `/v1` taban yolu, Bearer JWT, istek zaman aşımı,
 * 401'de tek seferlik jeton yenileme (eşzamanlı isteklerde tek yenileme), sonra çıkış.
 */
export class ApiClient {
  readonly baseUrl: string;
  readonly tokens: TokenStore;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private onLogout?: () => void;
  private refreshing: Promise<Tokens | null> | null = null;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.tokens = opts.tokens;
    this.fetchImpl = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.onLogout = opts.onLogout;
    this.now = opts.now ?? Date.now;
  }

  setLogoutHandler(fn: () => void): void {
    this.onLogout = fn;
  }

  url(path: string, query?: Query): string {
    const p = path.startsWith('/') ? path : `/${path}`;
    let u = `${this.baseUrl}/v1${p}`;
    if (query) {
      const qs = Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      if (qs) u += `?${qs}`;
    }
    return u;
  }

  async saveAuth(res: AuthResponse): Promise<void> {
    await this.tokens.set({
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      expiresAt: this.now() + res.expiresIn * 1000,
    });
  }

  async request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
    const auth = opts.auth ?? true;
    let tokens = auth ? await this.tokens.get() : null;
    // Süresi dolmak üzereyse önden yenile (30 sn pay).
    if (auth && tokens && tokens.expiresAt - 30_000 < this.now()) {
      tokens = (await this.refresh()) ?? tokens;
    }
    let res = await this.send(method, path, opts, tokens?.accessToken);
    if (res.status === 401 && auth && tokens) {
      const fresh = await this.refresh(tokens.refreshToken);
      if (!fresh) {
        await this.logout();
        throw await this.toError(res);
      }
      res = await this.send(method, path, opts, fresh.accessToken);
      if (res.status === 401) {
        await this.logout();
        throw await this.toError(res);
      }
    }
    if (!res.ok) throw await this.toError(res);
    if (res.status === 204) return null as T;
    const text = await res.text();
    if (!text) return null as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(res.status, 'bad_json', 'Sunucu yanıtı okunamadı.');
    }
  }

  get<T>(path: string, query?: Query, opts: Omit<RequestOptions, 'query'> = {}): Promise<T> {
    return this.request<T>('GET', path, { ...opts, query });
  }
  post<T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'body'> = {}): Promise<T> {
    return this.request<T>('POST', path, { ...opts, body });
  }
  put<T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'body'> = {}): Promise<T> {
    return this.request<T>('PUT', path, { ...opts, body });
  }
  patch<T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'body'> = {}): Promise<T> {
    return this.request<T>('PATCH', path, { ...opts, body });
  }
  delete<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>('DELETE', path, opts);
  }

  /** Eşzamanlı 401'ler tek bir yenileme isteğini paylaşır. */
  refresh(refreshToken?: string): Promise<Tokens | null> {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        try {
          const rt = refreshToken ?? (await this.tokens.get())?.refreshToken;
          if (!rt) return null;
          const res = await this.send('POST', '/auth/refresh', { body: { refreshToken: rt } }, undefined);
          if (!res.ok) {
            // Ağ hatası değil, gerçek ret: oturum bitti.
            return null;
          }
          const body = (await res.json()) as AuthResponse;
          await this.saveAuth(body);
          return await this.tokens.get();
        } catch (e) {
          // Ağ hatasında oturumu kapatma; çağıran ağ hatasını görsün.
          if (e instanceof ApiError && e.isNetwork) throw e;
          return null;
        } finally {
          this.refreshing = null;
        }
      })();
    }
    return this.refreshing;
  }

  async logout(): Promise<void> {
    await this.tokens.clear();
    this.onLogout?.();
  }

  private async send(method: Method, path: string, opts: RequestOptions, accessToken: string | undefined): Promise<Response> {
    const controller = new AbortController();
    const timeout = opts.timeoutMs ?? this.timeoutMs;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onAbort);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    try {
      return await this.fetchImpl(this.url(path, opts.query), {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      if (timedOut) throw new ApiError(0, 'timeout', 'İstek zaman aşımına uğradı.');
      if (opts.signal?.aborted) throw new ApiError(0, 'aborted', 'İstek iptal edildi.');
      throw new ApiError(0, 'network', 'Bağlantı kurulamadı.', e);
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
  }

  private async toError(res: Response): Promise<ApiError> {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return ApiError.fromBody(res.status, body);
  }
}
