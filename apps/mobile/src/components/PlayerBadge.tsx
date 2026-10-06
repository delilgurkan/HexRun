import { View } from 'react-native';
import type { Slot } from '@hexrun/core';
import { FONT, onPlayerColor, useTheme } from '../theme';
import { T } from './Text';

/**
 * Oyuncu işareti: renkli daire + baş harf. Renk tek taşıyıcı değildir (baş harf her zaman yazar).
 * Kendi işaretçinde son 48 saatte saldıranların sayısı.
 */
export function PlayerBadge({
  slot,
  initials,
  size = 36,
  goldFrame,
  attackers,
  hidden,
  ring,
}: {
  slot: Slot;
  initials: string;
  size?: number;
  goldFrame?: boolean;
  attackers?: number;
  hidden?: boolean;
  ring?: boolean;
}) {
  const t = useTheme();
  const bg = t.player(slot);
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: goldFrame ? 3 : ring ? 2.5 : 2,
          borderColor: goldFrame ? '#C9A227' : ring ? t.c.ink : t.c.casing,
        }}
      >
        {!hidden && (
          <T
            v="label"
            color={onPlayerColor(slot)}
            weight={FONT.extrabold}
            maxFontSizeMultiplier={1}
            style={{ fontSize: Math.max(12, size * 0.36), lineHeight: Math.max(14, size * 0.42), letterSpacing: 0.3, textTransform: 'none' }}
          >
            {initials}
          </T>
        )}
      </View>
      {attackers !== undefined && attackers > 0 && (
        <View
          style={{
            position: 'absolute',
            right: -6,
            top: -6,
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            paddingHorizontal: 4,
            backgroundColor: t.c.inv,
            borderWidth: 1.5,
            borderColor: t.c.casing,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <T v="label" color={t.c.invInk} maxFontSizeMultiplier={1} style={{ fontSize: 11, lineHeight: 13 }}>
            {String(attackers)}
          </T>
        </View>
      )}
    </View>
  );
}
