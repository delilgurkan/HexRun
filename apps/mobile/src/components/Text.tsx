import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { TYPE, useTheme, type TypeName } from '../theme';

export interface TProps extends TextProps {
  v?: TypeName;
  color?: string;
  /** mürekkep tonu: 1 (varsayılan), 2, 3 */
  tone?: 1 | 2 | 3;
  align?: TextStyle['textAlign'];
  weight?: string;
  tabular?: boolean;
}

/** Tipografi ölçeğine bağlı metin. Dynamic Type açık; hiçbir metin 12 pt altına inmez. */
export function T({ v = 'body', color, tone = 1, align, weight, tabular, style, maxFontSizeMultiplier, ...rest }: TProps) {
  const t = useTheme();
  const base = TYPE[v];
  const c = color ?? (tone === 1 ? t.c.ink : tone === 2 ? t.c.ink2 : t.c.ink3);
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? (v === 'hudXl' || v === 'hudM' ? 1.35 : 2.2)}
      style={[
        base,
        { color: c },
        align ? { textAlign: align } : null,
        weight ? { fontFamily: weight } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
      {...rest}
    />
  );
}
