import { useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '../../components/Icon';
import { T } from '../../components/Text';
import { FONT, MOTION, RADII, TARGET, useTheme } from '../../theme';

/**
 * Basılı tutma düğmesi (Bitir 1,5 sn): geri alınmaz eylem. Erişilebilirlik eylemiyle
 * (VoiceOver/TalkBack) onay penceresi açılır.
 */
export function HoldButton({
  label,
  hint,
  icon,
  onComplete,
  confirmTitle,
  duration = MOTION.finishHold,
  style,
  testID,
}: {
  label: string;
  hint: string;
  icon: IconName;
  onComplete: () => void;
  confirmTitle: string;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const t = useTheme();
  const p = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const [holding, setHolding] = useState(false);

  const start = () => {
    setHolding(true);
    anim.current = Animated.timing(p, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: false });
    anim.current.start(({ finished }) => {
      setHolding(false);
      if (finished) {
        p.setValue(0);
        onComplete();
      }
    });
  };
  const cancel = () => {
    anim.current?.stop();
    setHolding(false);
    Animated.timing(p, { toValue: 0, duration: MOTION.tap, useNativeDriver: false }).start();
  };

  return (
    <Pressable
      testID={testID}
      onPressIn={start}
      onPressOut={cancel}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={() =>
        Alert.alert(confirmTitle, undefined, [
          { text: 'Vazgeç', style: 'cancel' },
          { text: label, style: 'destructive', onPress: onComplete },
        ])
      }
      style={[{ minHeight: TARGET.runBar, borderRadius: RADII.cta, backgroundColor: t.c.inv, overflow: 'hidden', justifyContent: 'center' }, style]}
    >
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: p.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          backgroundColor: t.c.ink2,
          opacity: 0.45,
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <Icon name={icon} color={t.c.invInk} />
        <View>
          <T v="callout" color={t.c.invInk} weight={FONT.black} style={{ fontSize: 18, letterSpacing: 1 }} maxFontSizeMultiplier={1.4}>
            {label}
          </T>
          <T v="label" color={t.c.invInk} style={{ opacity: holding ? 1 : 0.7, textTransform: 'none' }} maxFontSizeMultiplier={1.4}>
            {hint}
          </T>
        </View>
      </View>
    </Pressable>
  );
}
