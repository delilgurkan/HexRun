/** Türkçe biçimlendirme: 6,12 km · 5'23" · 19.220 m² · 32:57. */

const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

export function fmtInt(n: number): string {
  return nf0.format(Math.round(n));
}

export function fmtKm(m: number, digits = 2): string {
  return (m / 1000).toFixed(digits).replace('.', ',');
}

export function fmtPace(secPerKm: number | null | undefined): string {
  if (secPerKm === null || secPerKm === undefined || !Number.isFinite(secPerKm) || secPerKm <= 0) return `–'––"`;
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`;
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return h ? `${h}:${mm}:${String(sec).padStart(2, '0')}` : `${mm}:${String(sec).padStart(2, '0')}`;
}

export function fmtArea(m2: number): string {
  return `${fmtInt(m2)} m²`;
}

/** Baş harfler: "Deniz Arslan" → "DA". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const a = parts[0]![0] ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : parts[0]![1] ?? '';
  return (a + b).toLocaleUpperCase('tr-TR');
}
