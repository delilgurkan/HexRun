import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import type { Slot } from '@hexrun/core';
import { COLORS, playerColor, type ColorScheme, type Colors } from './tokens';

export interface Theme {
  scheme: ColorScheme;
  c: Colors;
  isDark: boolean;
  player: (slot: Slot) => string;
  reduceMotion: boolean;
}

function buildTheme(scheme: ColorScheme, reduceMotion: boolean): Theme {
  return {
    scheme,
    c: COLORS[scheme],
    isDark: scheme === 'dark',
    player: (slot: Slot) => playerColor(slot, scheme),
    reduceMotion,
  };
}

const ThemeContext = createContext<Theme>(buildTheme('dark', false));

/** "Hareketi azalt" ayarını izler. */
export function useReduceMotionSetting(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setOn(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setOn(v));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

export function ThemeProvider({ children, scheme: forced }: { children: ReactNode; scheme?: ColorScheme }) {
  const system = useColorScheme();
  const reduceMotion = useReduceMotionSetting();
  const scheme: ColorScheme = forced ?? (system === 'light' ? 'light' : 'dark');
  const theme = useMemo(() => buildTheme(scheme, reduceMotion), [scheme, reduceMotion]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
