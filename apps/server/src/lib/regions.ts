import { cellToParent, latLngToCell } from 'h3-js';
import { cellCenter, haversineM, type LatLng } from '@hexrun/core';

/**
 * Lig bölgeleri: yerel başlar ("Kadıköy"), çünkü rakiplerin haritadaki komşuların.
 * İlçe merkezlerine en yakın eşleme (≤ 8 km). Bilinmeyen yerde H3 res-5 bölgesi.
 * Sınır poligonlarıyla değiştirilebilir (bkz. docs/ARCHITECTURE.md).
 */
interface District {
  key: string;
  name: string;
  lat: number;
  lng: number;
}

export const DISTRICTS: readonly District[] = [
  ['adalar', 'Adalar', 40.874, 29.09],
  ['arnavutkoy', 'Arnavutköy', 41.185, 28.739],
  ['atasehir', 'Ataşehir', 40.984, 29.107],
  ['avcilar', 'Avcılar', 40.979, 28.721],
  ['bagcilar', 'Bağcılar', 41.039, 28.856],
  ['bahcelievler', 'Bahçelievler', 41.0, 28.862],
  ['bakirkoy', 'Bakırköy', 40.98, 28.873],
  ['basaksehir', 'Başakşehir', 41.093, 28.802],
  ['bayrampasa', 'Bayrampaşa', 41.046, 28.912],
  ['besiktas', 'Beşiktaş', 41.043, 29.007],
  ['beykoz', 'Beykoz', 41.134, 29.092],
  ['beylikduzu', 'Beylikdüzü', 40.982, 28.64],
  ['beyoglu', 'Beyoğlu', 41.037, 28.977],
  ['buyukcekmece', 'Büyükçekmece', 41.021, 28.585],
  ['catalca', 'Çatalca', 41.144, 28.461],
  ['cekmekoy', 'Çekmeköy', 41.035, 29.172],
  ['esenler', 'Esenler', 41.043, 28.876],
  ['esenyurt', 'Esenyurt', 41.034, 28.68],
  ['eyupsultan', 'Eyüpsultan', 41.048, 28.934],
  ['fatih', 'Fatih', 41.019, 28.94],
  ['gaziosmanpasa', 'Gaziosmanpaşa', 41.065, 28.912],
  ['gungoren', 'Güngören', 41.025, 28.873],
  ['kadikoy', 'Kadıköy', 40.99, 29.029],
  ['kagithane', 'Kağıthane', 41.081, 28.973],
  ['kartal', 'Kartal', 40.889, 29.188],
  ['kucukcekmece', 'Küçükçekmece', 41.0, 28.786],
  ['maltepe', 'Maltepe', 40.935, 29.13],
  ['pendik', 'Pendik', 40.877, 29.233],
  ['sancaktepe', 'Sancaktepe', 41.003, 29.231],
  ['sariyer', 'Sarıyer', 41.167, 29.05],
  ['silivri', 'Silivri', 41.074, 28.246],
  ['sultanbeyli', 'Sultanbeyli', 40.968, 29.262],
  ['sultangazi', 'Sultangazi', 41.106, 28.866],
  ['sile', 'Şile', 41.176, 29.613],
  ['sisli', 'Şişli', 41.06, 28.987],
  ['tuzla', 'Tuzla', 40.816, 29.3],
  ['umraniye', 'Ümraniye', 41.016, 29.124],
  ['uskudar', 'Üsküdar', 41.023, 29.015],
  ['zeytinburnu', 'Zeytinburnu', 40.994, 28.904],
  ['cankaya', 'Çankaya', 39.9, 32.86],
  ['konak', 'Konak', 38.419, 27.129],
  ['karsiyaka', 'Karşıyaka', 38.459, 27.115],
  ['bornova', 'Bornova', 38.47, 27.22],
  ['osmangazi', 'Osmangazi', 40.183, 29.067],
  ['nilufer', 'Nilüfer', 40.213, 28.984],
  ['muratpasa', 'Muratpaşa', 36.887, 30.725],
  ['konyaalti', 'Konyaaltı', 36.877, 30.64],
  ['tepebasi', 'Tepebaşı', 39.785, 30.505],
  ['odunpazari', 'Odunpazarı', 39.763, 30.525],
].map(([key, name, lat, lng]) => ({ key: key as string, name: name as string, lat: lat as number, lng: lng as number }));

const BY_KEY = new Map(DISTRICTS.map((d) => [d.key, d]));
const MAX_M = 8000;

export function leagueRegionFor(p: LatLng): string {
  let best: District | null = null;
  let bestD = Infinity;
  for (const d of DISTRICTS) {
    const x = haversineM(p, d);
    if (x < bestD) {
      bestD = x;
      best = d;
    }
  }
  if (best && bestD <= MAX_M) return best.key;
  return `h5:${cellToParent(latLngToCell(p.lat, p.lng, 12), 5)}`;
}

export function leagueRegionForCell(cell: string): string {
  return leagueRegionFor(cellCenter(cell));
}

export function regionName(key: string | null | undefined): string {
  if (!key) return 'Yerel lig';
  return BY_KEY.get(key)?.name ?? 'Yerel lig';
}

/** Kilit bölgesi: H3 res-5 (≈250 km²). Aynı bölgedeki oyun durum değişiklikleri sıraya girer. */
export function lockRegionOf(cell: string): string {
  return cellToParent(cell, 5);
}

export function parent7Of(cell: string): string {
  return cellToParent(cell, 7);
}
