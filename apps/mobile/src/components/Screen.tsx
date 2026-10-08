import type { ReactNode } from 'react';
import { Platform, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GUTTER, RADII, useTheme } from '../theme';
import { IconButton } from './Button';
import { platformIcon } from './Icon';
import { T } from './Text';

export function Header({
  title,
  backLabel,
  onBack,
  right,
  large,
}: {
  title?: string;
  backLabel?: string;
  onBack?: (() => void) | null;
  right?: ReactNode;
  large?: boolean;
}) {
  const t = useTheme();
  const back = onBack === null ? null : (onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/'))));
  return (
    <View style={{ paddingHorizontal: GUTTER - 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 4 }}>
        {back ? <IconButton icon={platformIcon('back')} onPress={back} accessibilityLabel={backLabel ?? 'Geri'} /> : <View style={{ width: 8 }} />}
        {backLabel && Platform.OS === 'ios' ? (
          <T v="callout" tone={2} onPress={back ?? undefined} accessibilityElementsHidden>
            {backLabel}
          </T>
        ) : null}
        <View style={{ flex: 1 }}>
          {!large && title ? (
            <T v="title2" numberOfLines={1} accessibilityRole="header" style={{ textAlign: Platform.OS === 'ios' && backLabel ? 'center' : 'left' }}>
              {title}
            </T>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>{right}</View>
      </View>
      {large && title ? (
        <T v="title1" accessibilityRole="header" style={{ paddingHorizontal: 6, marginTop: 4, color: t.c.ink }}>
          {title}
        </T>
      ) : null}
    </View>
  );
}

/** Sekme ve alt ekran iskeleti: güvenli alan, başlık, kaydırılabilir içerik. */
export function Screen({
  title,
  backLabel,
  onBack,
  right,
  large,
  children,
  scroll = true,
  footer,
  contentStyle,
  testID,
}: {
  title?: string;
  backLabel?: string;
  onBack?: (() => void) | null;
  right?: ReactNode;
  large?: boolean;
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, paddingTop: insets.top }} testID={testID}>
      <Header title={title} backLabel={backLabel} onBack={onBack} right={right} large={large} />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[{ paddingHorizontal: GUTTER, paddingBottom: footer ? 24 : insets.bottom + 32, gap: 16, paddingTop: 8 }, contentStyle]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
      {footer ? <View style={{ paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: insets.bottom + 12, gap: 8 }}>{footer}</View> : null}
    </View>
  );
}

export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      style={[{ backgroundColor: t.c.surf, borderRadius: RADII.l - 8, padding: 16, gap: 10, borderWidth: 1, borderColor: t.c.line }, style]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
      <T v="label" tone={2} accessibilityRole="header">
        {children}
      </T>
      {right}
    </View>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 96, gap: 2 }} accessible accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ''}`}>
      <T v="label" tone={3}>
        {label}
      </T>
      <T v="title2" tabular>
        {value}
      </T>
      {sub ? (
        <T v="callout" tone={2} style={{ fontSize: 13 }}>
          {sub}
        </T>
      ) : null}
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line }} />;
}
