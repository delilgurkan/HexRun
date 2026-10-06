import { S } from '../i18n';
import { isApiError } from './errors';

/**
 * Sunucu hata gövdesi her zaman Türkçe, gösterilebilir bir `message` taşır; onu kullanırız.
 * Yalnız mesajın olmadığı ya da istemcinin özel davrandığı kodlar burada eşlenir.
 */
const FALLBACK: Record<string, string> = {
  duel_limit: 'Aynı anda en çok 3 düellon olabilir.',
  duel_overlap: 'Bu peteklerin bir kısmı zaten düellonda.',
  duel_size: 'Düello alanı 7–60 petek olmalı.',
  duel_not_connected: 'Seçtiğin petekler tek parça olmalı.',
  duel_mixed_owner: 'Yalnız tek bir sahibin petekleri seçilebilir.',
  duel_not_owned: 'Bu petekler artık o oyuncunun değil.',
  duel_self: 'Kendi alanına düello açamazsın.',
  insignia_daily_limit: 'Bugünkü değişiklik hakkını kullandın.',
  insignia_running: 'Koşu sırasında nişan değiştirilemez.',
  not_earned: 'Bu rozeti henüz kazanmadın.',
  not_insignia: 'Bu rozet nişan olarak takılmaz.',
  shield_weekly_limit: 'Kalkanı bu hafta kullandın.',
  username_taken: 'Bu ad alınmış',
  username_invalid: '3–20 karakter: küçük harf, rakam, alt çizgi',
  username_reserved: 'Bu ad kullanılamaz',
  rate_limited: 'Çok hızlı gittin; biraz sonra tekrar dene.',
  not_configured: 'Yakında',
  network: 'Bağlantı kurulamadı.',
  timeout: 'Bağlantı kurulamadı.',
};

export function errorText(e: unknown): string {
  if (isApiError(e)) {
    if (e.code === 'not_configured') return FALLBACK.not_configured!;
    if (e.message && !/^HTTP \d+$/.test(e.message)) return e.message;
    return FALLBACK[e.code] ?? S.common.genericError;
  }
  return S.common.genericError;
}
