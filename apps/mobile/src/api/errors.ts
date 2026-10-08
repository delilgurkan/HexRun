import type { ApiError as ApiErrorBody } from '@hexrun/contracts';

/** Uygulama içi API hatası. `status` 0 → ağ hatası / zaman aşımı. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Bağlantı yok ya da zaman aşımı: tekrar denenebilir. */
  get isNetwork(): boolean {
    return this.status === 0;
  }

  /** Geçici hata: ağ, 408, 429, 5xx. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }

  static fromBody(status: number, body: unknown): ApiError {
    const b = body as Partial<ApiErrorBody> | null;
    if (b && typeof b === 'object' && b.error && typeof b.error.code === 'string') {
      return new ApiError(status, b.error.code, b.error.message ?? b.error.code, b.error.details);
    }
    return new ApiError(status, `http_${status}`, `HTTP ${status}`);
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
