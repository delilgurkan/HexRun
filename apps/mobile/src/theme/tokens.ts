/**
 * HexRun tasarım token'ları (Tokens.dc.html). İki platformda aynı adlar.
 * Kabuk renksizdir: yalnız mürekkep ve kâğıt; renk oyunculara aittir.
 */
import { Platform } from 'react-native';
import { PALETTE, SLOTS, type Slot } from '@hexrun/core';

export type ColorScheme = 'dark' | 'light';

export interface Colors {
  /** zemin */
  bg: string;
  /** yüzey */
  surf: string;
  /** yüzey-2 */
  surf2: string;
  glass: string;
  /** mürekkep */
  ink: string;
  ink2: string;
  /** mürekkep-3: yalnız ≥13 pt metinde. */
  ink3: string;
  line: string;
  line2: string;
  track: string;
  /** ters-zemin (birincil buton) */
  inv: string;
  invInk: string;
  land: string;
  water: string;
  park: string;
  road: string;
  roadCasing: string;
  minor: string;
  mapLabel: string;
  /** bölge-kenarı kılıfı */
  casing: string;
  tex: string;
  dim: string;
  frame: string;
  /** iz (koşu çizgisi) iç rengi */
  trace: string;
  shadow: string;
}

export const COLORS: Record<ColorScheme, Colors> = {
  dark: {
    bg: '#0F1312',
    surf: '#1A1F1D',
    surf2: '#232927',
    glass: 'rgba(26,31,29,0.92)',
    ink: '#F2F1EA',
    ink2: '#B4BBB7',
    ink3: '#8F9893',
    line: 'rgba(242,241,234,0.14)',
    line2: 'rgba(242,241,234,0.30)',
    track: 'rgba(242,241,234,0.16)',
    inv: '#F2F1EA',
    invInk: '#0F1312',
    land: '#141917',
    water: '#0D1F26',
    park: '#17251D',
    road: '#2B3431',
    roadCasing: '#141917',
    minor: '#1F2624',
    mapLabel: '#8F9893',
    casing: '#0F1312',
    tex: 'rgba(242,241,234,0.09)',
    dim: 'rgba(15,19,18,0.55)',
    frame: '#2E3431',
    trace: '#0F1312',
    shadow: '#000000',
  },
  light: {
    bg: '#F7F6F1',
    surf: '#FFFFFF',
    surf2: '#EDEBE4',
    glass: 'rgba(255,255,255,0.94)',
    ink: '#141716',
    ink2: '#454B48',
    ink3: '#636A66',
    line: 'rgba(20,23,22,0.12)',
    line2: 'rgba(20,23,22,0.26)',
    track: 'rgba(20,23,22,0.12)',
    inv: '#141716',
    invInk: '#F7F6F1',
    land: '#EFEDE6',
    water: '#C9DDE3',
    park: '#D9E4CF',
    road: '#FFFFFF',
    roadCasing: '#D6D2C6',
    minor: '#FBFAF6',
    mapLabel: '#636A66',
    casing: '#141716',
    tex: 'rgba(20,23,22,0.08)',
    dim: 'rgba(247,246,241,0.55)',
    frame: '#C9C6BC',
    trace: '#FFFFFF',
    shadow: '#141716',
  },
};

/** Oyuncu rengi: koyu temada Lacivert kenar rengi daha açık (#1B7EBF). */
export function playerColor(slot: Slot, scheme: ColorScheme): string {
  const p = PALETTE[slot];
  return scheme === 'dark' ? p.darkEdge : p.hex;
}

export function playerPalette(scheme: ColorScheme): Record<Slot, string> {
  const out = {} as Record<Slot, string>;
  for (const s of SLOTS) out[s] = playerColor(s, scheme);
  return out;
}

/** Baş harf metni oyuncu renginin üstünde: açık renklerde koyu, koyularda açık. */
export function onPlayerColor(slot: Slot): string {
  return slot === 'kir' || slot === 'zum' || slot === 'lac' ? '#FFFFFF' : '#141716';
}

/** Harita petek dolgusu opaklığı. */
export const CELL_FILL_OPACITY: Record<ColorScheme, number> = { dark: 0.5, light: 0.55 };

export const SPACE = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 24, s6: 32, s7: 48, s8: 64 } as const;
/** Yan boşluk 16; koşu ekranında 20. */
export const GUTTER = 16;
export const GUTTER_RUN = 20;

export const RADII = {
  xs: 6,
  s: 12,
  m: 20,
  l: 28,
  pill: 999,
  /** CTA: iOS 30, Android 18 (tasarım btnR). */
  cta: Platform.OS === 'ios' ? 30 : 18,
  sheet: Platform.OS === 'ios' ? 38 : 28,
  hat: 1,
} as const;

export const MOTION = {
  tap: 120,
  sheet: 280,
  sheetDamping: 0.85,
  /** Hücre başına dolum gecikmesi, toplam en çok 1,5 sn. */
  fillPerCell: 14,
  fillMax: 1500,
  breathe: 2000,
  conquestTotal: 2400,
  conquestBeat1: 300,
  conquestBeat2: 1800,
  conquestAutoDismiss: 5000,
  finishHold: 1500,
} as const;

/** Dokunma hedefleri. */
export const TARGET = {
  min: Platform.OS === 'ios' ? 44 : 48,
  run: 64,
  runBar: 72,
  gap: 12,
} as const;

export const FONT = {
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  extrabold: 'Archivo_800ExtraBold',
  black: 'Archivo_900Black',
  mono: 'IBMPlexMono_500Medium',
  monoRegular: 'IBMPlexMono_400Regular',
  monoBold: 'IBMPlexMono_600SemiBold',
} as const;

export interface TypeStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  textTransform?: 'uppercase' | 'none';
}

/**
 * Tipografi ölçeği. Archivo'nun genişlik ekseni Google Fonts statik kesimlerinde yok;
 * genişletilmiş başlık yerine harf aralığı, dar HUD rakamı yerine tabular rakam kullanılır.
 */
export const TYPE = {
  hudXl: { fontFamily: FONT.extrabold, fontSize: 112, lineHeight: 104, letterSpacing: -4 },
  display: { fontFamily: FONT.black, fontSize: 52, lineHeight: 52, letterSpacing: 0.5 },
  hudM: { fontFamily: FONT.bold, fontSize: 48, lineHeight: 52, letterSpacing: -1.5 },
  title1: { fontFamily: FONT.extrabold, fontSize: 30, lineHeight: 36, letterSpacing: 0.2 },
  title2: { fontFamily: FONT.bold, fontSize: 22, lineHeight: 28 },
  body: { fontFamily: FONT.regular, fontSize: Platform.OS === 'ios' ? 17 : 16, lineHeight: 24 },
  callout: { fontFamily: FONT.medium, fontSize: 15, lineHeight: 20 },
  label: { fontFamily: FONT.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' },
  data: { fontFamily: FONT.mono, fontSize: 13, lineHeight: 16 },
} satisfies Record<string, TypeStyle>;

export type TypeName = keyof typeof TYPE;

/** HUD rakamları bu ölçeğin üstünde büyümez; metrikler alt alta dizilir (≈ AX3). */
export const HUD_MAX_FONT_SCALE = 1.35;
