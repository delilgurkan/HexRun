export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new HttpError(400, code, message, details);
export const unauthorized = (message = 'Oturum gerekli.') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'Bu işlem için yetkin yok.') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Bulunamadı.') => new HttpError(404, 'not_found', message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
export const tooMany = (message = 'Çok fazla deneme. Biraz bekle.') => new HttpError(429, 'rate_limited', message);
