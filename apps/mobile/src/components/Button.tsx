import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { FONT, RADII, TARGET, useTheme } from '../theme';
import { Icon, type IconName } from './Icon';
import { T } from './Text';

export type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  /** Birincil CTA: büyük harf, 56 pt. */
  big?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  right?: ReactNode;
}

/** Birincil buton = ters zemin (mürekkep üstüne kâğıt). Hedef ≥ 44 pt. */
export function Button({ label, onPress, kind = 'primary', icon, disabled, loading, big, accessibilityLabel, accessibilityHint, style, testID, right }: ButtonProps) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.c.inv : kind === 'secondary' ? t.c.surf2 : 'transparent';
  const fg = kind === 'primary' ? t.c.invInk : t.c.ink;
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        {
          minHeight: big ? 56 : TARGET.min,
          paddingHorizontal: big ? 24 : 16,
          borderRadius: big ? RADII.cta : RADII.m,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: inactive ? 0.45 : pressed ? 0.85 : 1,
          borderWidth: kind === 'ghost' || kind === 'danger' ? 1 : 0,
          borderColor: kind === 'danger' ? t.c.ink : t.c.line2,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <T
        v={big ? 'callout' : 'callout'}
        color={fg}
        weight={big ? FONT.black : FONT.semibold}
        style={big ? { fontSize: 17, letterSpacing: 1 } : undefined}
        numberOfLines={2}
        align="center"
      >
        {label}
      </T>
      {right ? <View>{right}</View> : null}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = TARGET.min,
  glass,
  badge,
  testID,
  children,
}: {
  icon?: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  size?: number;
  glass?: boolean;
  badge?: number;
  testID?: string;
  children?: ReactNode;
}) {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={Math.max(0, (TARGET.min - size) / 2)}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: glass ? t.c.glass : 'transparent',
        borderWidth: glass ? 1 : 0,
        borderColor: t.c.line,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {children ?? (icon ? <Icon name={icon} size={22} /> : null)}
      {badge !== undefined && badge > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 4,
            backgroundColor: t.c.inv,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <T v="label" color={t.c.invInk} style={{ fontSize: 11, lineHeight: 14 }} maxFontSizeMultiplier={1.2}>
            {badge > 9 ? '9+' : String(badge)}
          </T>
        </View>
      )}
    </Pressable>
  );
}
