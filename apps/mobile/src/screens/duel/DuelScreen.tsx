import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';
import type { DuelSummary, Me, RegionDetail } from '@hexrun/contracts';
import { fmtArea, RULES } from '@hexrun/core';
import { useDuel, useMe, useRegion } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Hat } from '../../components/Hat';
import { duelHp } from '../../components/hatMath';
import { PlayerBadge } from '../../components/PlayerBadge';
import { Card, Screen, SectionTitle } from '../../components/Screen';
import { Skeleton } from '../../components/Skeleton';
import { StateBlock } from '../../components/StateBlock';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { relativeLabel } from '../../lib/dates';
import { activeNow } from '../../lib/events';
import { startRun } from '../../run/start';
import { useServices } from '../../services';
import { FONT, useTheme } from '../../theme';

const first = (n: string) => n.split(' ')[0] ?? n;

/** 09B · Kuşatma ekranı (sahibin bakışı) ya da saldırganın düello özeti. */
export function SiegeView({ d, me, region, onDefend, onCancel }: { d: DuelSummary; me: Me; region?: RegionDetail; onDefend: () => void; onCancel?: () => void }) {
  const t = useTheme();
  const defending = d.defender.id === me.id;
  const rival = defending ? d.attacker : d.defender;
  const hp = duelHp(d.power, d.progress);
  const events = activeNow();
  const attackEv = events.find((e) => e.move === 'attack');
  const gainEv = events.find((e) => e.move === 'gain');
  const pushEv = events.find((e) => e.move === 'pushback');
  const gainMult = gainEv?.multiplier ?? 1;
  const pushMult = pushEv?.multiplier ?? 1;
  const powerAfter = Math.min(RULES.MAX_POWER, Math.round(d.power + RULES.OWNER_GAIN * gainMult));
  const progressAfter = Math.max(0, Math.round(d.progress - RULES.PUSHBACK * pushMult));
  const defensesLeft = Math.max(0, RULES.DEFENSE_DAILY_LIMIT - d.defensesToday);
  return (
    <View style={{ gap: 16 }} testID={defending ? 'siege' : 'attack'}>
      <T v="label" tone={2}>
        {defending ? S.siege.head(first(rival.displayName), hp) : S.siege.attacking(first(rival.displayName))}
      </T>
      <T v="title1" accessibilityRole="header">
        {S.siege.cells(d.cells.length)}
      </T>
      {region && defending ? (
        <T v="data" tone={2}>
          {S.siege.yourArea(region.cells.length, fmtArea(region.areaM2), region.ownedSinceDays ?? 0)}
        </T>
      ) : null}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <PlayerBadge slot={d.attacker.slot} initials={d.attacker.initials} size={32} />
            <T v="callout" weight={FONT.bold}>
              {defending ? first(d.attacker.displayName) : S.common.you} {Math.round(d.progress)}
            </T>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <T v="callout" weight={FONT.bold}>
              {defending ? S.common.you : first(d.defender.displayName)} {Math.round(d.power)}
            </T>
            <PlayerBadge slot={d.defender.slot} initials={d.defender.initials} size={32} />
          </View>
        </View>
        <Hat power={d.power} progress={d.progress} ownerColor={t.player(d.defender.slot)} attackerColor={t.player(d.attacker.slot)} size="lg" testID="siege-hat" />
        <T v="title2">{S.siege.hpLeft(hp)}</T>
        <T tone={2}>{S.siege.estimate(d.loopsToCapture, attackEv ? attackEv.name.split(' ').slice(-1)[0] ?? null : null)}</T>
      </Card>
      {defending ? (
        <>
          <T tone={2}>
            {`Bu ${d.cells.length} peteği dolaşan bir halka kapatırsan: gücün ${Math.round(d.power)} → ${powerAfter}${gainEv ? ` (${gainEv.name} ${String(gainMult).replace('.', ',')}x)` : ''}, ${first(d.attacker.displayName)} ${Math.round(d.progress)} → ${progressAfter}; düello canın ${hp} → ${duelHp(powerAfter, progressAfter)}.`}
          </T>
          <T v="callout">{S.siege.defensesLeft(defensesLeft)}</T>
        </>
      ) : (
        <>
          <T tone={2}>{`${S.region.duelHp(hp, d.cells.length)} · ${d.attacksToday}/${d.attackLimitToday}`}</T>
          {d.expiresAt && !d.firstCountedAt ? <T v="callout" tone={3}>{S.siege.expires(Math.max(0, Math.round((Date.parse(d.expiresAt) - Date.now()) / 3_600_000)))}</T> : null}
        </>
      )}
      {d.lastAttackAt ? (
        <View style={{ gap: 6 }}>
          <SectionTitle>{S.region.history}</SectionTitle>
          <T v="data" tone={2}>
            {relativeLabel(d.lastAttackAt)} · halka
          </T>
        </View>
      ) : null}
      <Button big label={defending ? S.siege.cta : S.siege.attackCta} icon={defending ? 'defend' : 'play'} onPress={onDefend} testID="siege-cta" />
      {!defending && onCancel ? <Button kind="ghost" label={S.siege.cancelDuel} onPress={onCancel} /> : null}
    </View>
  );
}

export function DuelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const duel = useDuel(id);
  const me = useMe();
  const region = useRegion(duel.data?.cells[0]);
  const { api, queryClient } = useServices();
  const d = duel.data;
  return (
    <Screen title={S.siege.title} backLabel={S.tabs.map}>
      {d && me.data ? (
        <SiegeView
          d={d}
          me={me.data}
          region={region.data}
          onDefend={() => void startRun(me.data, d.defender.id === me.data?.id ? { defendDuelId: d.id } : { attackDuelId: d.id })}
          onCancel={() =>
            Alert.alert(S.siege.cancelDuel, undefined, [
              { text: S.common.cancel, style: 'cancel' },
              {
                text: S.siege.cancelDuel,
                style: 'destructive',
                onPress: async () => {
                  await api.duels.cancel(d.id).catch(() => undefined);
                  void queryClient.invalidateQueries({ queryKey: ['duels'] });
                  router.back();
                },
              },
            ])
          }
        />
      ) : duel.isError ? (
        <StateBlock title={S.common.genericError} action={S.common.retry} onAction={() => void duel.refetch()} />
      ) : (
        <View style={{ gap: 12 }}>
          <Skeleton height={28} width="70%" />
          <Skeleton height={16} />
          <Skeleton height={120} />
        </View>
      )}
    </Screen>
  );
}
