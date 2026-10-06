import { getLocales } from 'expo-localization';
import { en } from './en';
import { tr, type Strings } from './tr';

export type { Strings };

function pick(): Strings {
  try {
    const lang = getLocales()[0]?.languageCode ?? 'tr';
    return lang === 'en' ? en : tr;
  } catch {
    return tr;
  }
}

/** Uygulama metinleri. Türkçe birincil; cihaz dili İngilizceyse İngilizce. */
export const S: Strings = pick();

export function useStrings(): Strings {
  return S;
}
