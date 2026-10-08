import { View } from 'react-native';
import type { DuelSummary, FirstLoopSuggestion } from '@hexrun/contracts';
import { fmtArea, fmtKm } from '@hexrun/core';
import { Button } from '../../components/Button';
import { Hat } from '../../components/Hat';
import { Icon } from '../../components/Icon';
import { PlayerBadge } from '../../components/PlayerBadge';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { hhmm } from '../../lib/dates';
import { RADII, useTheme } from '../../theme';

export function Panel({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: t.c.glass,
        borderRadius: RADII.l - 6,
        padding: 16,
        gap: 10,
        borderWidth: 1,
        borderColor: t.c.line,
        shadowColor: t.c.shadow,
        shadowOpacity: t.isDark ? 0.5 : 0.16,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      }}
    >
      {children}
    </View>
  );
}

/** 03b · Boş: "İlk halkan" önerisi. */
export function FirstLoopCard({ s, onStart, onDismiss }: { s: FirstLoopSuggestion; onStart: () => void; onDismiss: () => void }) {
  const t = useTheme();
  return (
    <Panel testID="first-loop">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T v="label" tone={2}>
          {S.map.firstLoopTag} · {S.map.firstLoopMeta(fmtKm(s.lengthM, 1), fmtArea(s.areaM2))}
        </T>
        <View style={{ backgroundColor: t.c.surf2, borderRadius: RADII.s, paddingHorizontal: 8, paddingVertical: 2 }}>
          <T v="label">{S.map.firstDay}</T>
        </View>
      </View>
      <T v="title2">{S.map.firstLoopTitle}</T>
      <T tone={2}>{S.map.firstLoopBody(fmtKm(s.lengthM, 1))}</T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {S.map.firstLoopSteps.map((st, i) => (
          <View key={st} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name={i === 0 ? 'start' : i === 1 ? 'loop' : 'map'} size={16} color={t.c.ink2} />
            <T v="callout" tone={2} style={{ fontSize: 13 }}>
              {st}
            </T>
          </View>
        ))}
      </View>
      <Button big label={S.map.firstLoopCta} onPress={onStart} testID="first-loop-start" />
      <Button kind="ghost" label={S.map.ownRoute} onPress={onDismiss} style={{ borderWidth: 0 }} />
    </Panel>
  );
}

/** 03b · Hata: çevrimdışı, son bilinen harita soluk. */
export function OfflineCard({ minutes, onRetry }: { minutes: number | null; onRetry: () => void }) {
  return (
    <Panel testID="offline-card">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="layers" size={18} />
        <T v="title2">{S.map.offlineTitle}</T>
      </View>
      <T tone={2}>{S.map.offlineBody(minutes ?? 0)}</T>
      <Button kind="secondary" label={S.common.retry} onPress={onRetry} style={{ alignSelf: 'flex-start' }} />
    </Panel>
  );
}

/** 09A · Haritada kuşatma uyarısı (%70 eşiği). Yalnız sen ve saldıran görür. */
export function SiegeBanner({ duel, ownerSlot, onPress }: { duel: DuelSummary; ownerSlot: Parameters<typeof PlayerBadge>[0]['slot']; onPress: () => void }) {
  const t = useTheme();
  const name = duel.attacker.displayName.split(' ')[0] ?? duel.attacker.username;
  return (
    <Panel testID="siege-banner">
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <PlayerBadge slot={duel.attacker.slot} initials={duel.attacker.initials} size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="callout" weight="Archivo_700Bold">
            {S.map.siegeBanner(name)}
          </T>
          <T v="callout" tone={2} style={{ fontSize: 13 }}>
            {S.map.siegeBannerBody(name, duel.lastAttackAt ? hhmm(duel.lastAttackAt) : '—', duel.loopsToCapture)}
          </T>
        </View>
        <Button label={S.map.defend} icon="defend" onPress={onPress} />
      </View>
      <Hat power={duel.power} progress={duel.progress} ownerColor={t.player(ownerSlot)} attackerColor={t.player(duel.attacker.slot)} size="sm" />
    </Panel>
  );
}
