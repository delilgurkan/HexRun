import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { RADII, TARGET, useTheme } from '../theme';
import { Icon, type IconName } from './Icon';
import { T } from './Text';

export function Chip({
  label,
  icon,
  onPress,
  selected,
  glass,
  left,
  style,
  accessibilityLabel,
  testID,
}: {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  selected?: boolean;
  glass?: boolean;
  left?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const t = useTheme();
  const bg = selected ? t.c.inv : glass ? t.c.glass : t.c.surf2;
  const fg = selected ? t.c.invInk : t.c.ink;
  const content = (
    <>
      {left}
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <T v="callout" color={fg} numberOfLines={1} style={{ fontSize: 14 }}>
        {label}
      </T>
    </>
  );
  const base: ViewStyle = {
    minHeight: onPress ? TARGET.min - 8 : 32,
    paddingHorizontal: 12,
    borderRadius: RADII.s,
    backgroundColor: bg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: glass ? 1 : 0,
    borderColor: t.c.line,
  };
  if (!onPress) {
    return (
      <View style={[base, style]} accessible accessibilityLabel={accessibilityLabel ?? label} testID={testID}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={6}
      style={({ pressed }) => [base, { opacity: pressed ? 0.8 : 1 }, style]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

/** İki ayrı kontrol (kategori, dönem) için bölümlü seçici. */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  style,
  testID,
}: {
  options: ReadonlyArray<{ key: K; label: string }>;
  value: K;
  onChange: (k: K) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      testID={testID}
      style={[{ flexDirection: 'row', backgroundColor: t.c.surf2, borderRadius: RADII.s, padding: 3, gap: 3 }, style]}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={{
              flex: 1,
              minHeight: TARGET.min - 6,
              borderRadius: RADII.s - 3,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? t.c.surf : 'transparent',
              borderWidth: on ? 1 : 0,
              borderColor: t.c.line,
            }}
          >
            <T v="callout" tone={on ? 1 : 2} style={{ fontSize: 14 }} numberOfLines={1}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconLabel({ icon, label, color }: { icon: IconName; label: string; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name={icon} size={16} color={color ?? t.c.ink2} />
      <T v="data" color={color ?? t.c.ink2}>
        {label}
      </T>
    </View>
  );
}
