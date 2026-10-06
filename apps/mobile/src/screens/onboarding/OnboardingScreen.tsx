import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { OnboardingArt } from '../../components/OnboardingArt';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { setPrefs } from '../../state/prefs';
import { GUTTER, TYPE, useTheme } from '../../theme';

/** 01 · Üç kelime, üç ekran: Koş. Halkayı kapat. Fethet. */
export function OnboardingScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState<0 | 1 | 2>(0);
  const page = S.onboarding.pages[i]!;
  const finish = async () => {
    await setPrefs({ onboardingDone: true });
    router.replace('/onboarding/permissions');
  };
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 16 }} testID="onboarding">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: GUTTER, minHeight: 48 }}>
        <T v="label" tone={2}>
          {page.kicker}
        </T>
        {i < 2 ? <Button label={S.common.skip} kind="ghost" onPress={finish} style={{ borderWidth: 0 }} /> : null}
      </View>
      <View style={{ flex: 1, maxHeight: 400, marginHorizontal: GUTTER }}>
        <OnboardingArt step={i} />
      </View>
      <View style={{ paddingHorizontal: GUTTER, gap: 12, flex: 1, justifyContent: 'flex-end' }}>
        <T v="display" accessibilityRole="header" style={{ fontSize: TYPE.display.fontSize }}>
          {page.title}
        </T>
        <T tone={2}>{page.body}</T>
        <View style={{ flexDirection: 'row', gap: 6, marginVertical: 12 }} accessible accessibilityLabel={page.kicker}>
          {[0, 1, 2].map((k) => (
            <View key={k} style={{ height: 4, flex: k === i ? 2 : 1, borderRadius: 2, backgroundColor: k <= i ? t.c.ink : t.c.track }} />
          ))}
        </View>
        {i < 2 ? (
          <Button big label={S.common.continue} onPress={() => setI((i + 1) as 1 | 2)} />
        ) : (
          <Button big label={S.onboarding.start} onPress={finish} testID="onboarding-start" />
        )}
      </View>
    </View>
  );
}
