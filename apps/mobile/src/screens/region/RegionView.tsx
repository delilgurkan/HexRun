import { ScrollView, View } from 'react-native';
import type { DuelSummary, Me, RegionDetail } from '@hexrun/contracts';
import { BADGE_BY_ID, fmtArea } from '@hexrun/core';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { Hat } from '../../components/Hat';
import { duelHp } from '../../components/hatMath';
import { PlayerBadge } from '../../components/PlayerBadge';
import { Divider, SectionTitle, Stat } from '../../components/Screen';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { relativeLabel, shortDate } from '../../lib/dates';
import { endsAtLabel, eventsShortLabel } from '../../lib/events';
import { FONT, GUTTER, useTheme } from '../../theme';

const first = (name: string) => name.split(' ')[0] ?? name;

export interface RegionActions {
  onRunHere: () => void;
  onStartDuel: () => void;
  onOpenDuel: (d: DuelSummary) => void;
}

/** 04 · Bölge detayı (sheet). */
export function RegionView({ r, me, actions }: { r: RegionDetail; me: Me | null | undefined; actions: RegionActions }) {
  const t = useTheme();
  const owner = r.owner;
  const mine = !!owner && !!me && owner.id === me.id;
  const ownerName = r.hidden ? S.map.hiddenPlayer : owner ? first(owner.displayName) : null;
  const title = !owner && !r.hidden ? S.region.emptyTitle : mine ? S.region.myTitle : S.region.title(ownerName ?? '');
  const duel = r.myDuel;
  const attackEvent = r.activeEvents.find((e) => e.active && e.move === 'attack');
  const gainEvent = r.activeEvents.find((e) => e.active && e.move === 'gain');
  const ownerColor = owner ? t.player(owner.slot) : t.c.ink3;

  let cta: { label: string; onPress: () => void; testID: string };
  if (duel) cta = { label: attackEvent ? S.region.loopHereBoost(eventsShortLabel([attackEvent])) : S.region.loopHere, onPress: actions.onRunHere, testID: 'cta-loop' };
  else if (mine) cta = { label: gainEvent ? S.region.loopHereBoost(eventsShortLabel([gainEvent])) : S.region.loopHere, onPress: actions.onRunHere, testID: 'cta-loop' };
  else if (owner && !r.hidden && r.canStartDuel) cta = { label: S.region.startDuel, onPress: actions.onStartDuel, testID: 'cta-duel' };
  else cta = { label: S.region.runHere, onPress: actions.onRunHere, testID: 'cta-run' };

  return (
    <View style={{ flex: 1 }} testID="region">
      <ScrollView contentContainerStyle={{ padding: GUTTER, gap: 14, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {owner ? <PlayerBadge slot={owner.slot} initials={owner.initials} hidden={r.hidden} goldFrame={owner.goldFrame} size={44} /> : null}
          <View style={{ flex: 1 }}>
            <T v="title1" accessibilityRole="header" numberOfLines={2}>
              {title}
            </T>
            <T v="data" tone={2}>
              {S.region.meta(r.cells.length, fmtArea(r.areaM2))}
            </T>
          </View>
        </View>

        {r.activeEvents
          .filter((e) => e.active)
          .map((e) => (
            <Chip key={e.id} icon="events" label={`${e.name} · ${eventsShortLabel([e])}${e.endsInMin !== null ? ` · ${S.region.eventUntil(endsAtLabel(e.endsInMin) ?? '')}` : ''}`} />
          ))}

        {r.hidden ? <T tone={2}>{S.region.hidden}</T> : null}

        {owner && !r.hidden ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T v="callout" weight={FONT.bold}>
                  {owner.displayName}
                </T>
                <T v="callout" tone={2} style={{ fontSize: 13 }}>
                  {S.region.ownerSince(r.ownedSinceDays ?? 0, owner.teamName)}
                </T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T v="title1" tabular>
                  {Math.round(r.avgPower)}
                </T>
                <T v="label" tone={3}>
                  {S.common.power}
                </T>
              </View>
            </View>
            <Hat
              power={r.avgPower}
              progress={duel ? duel.progress : null}
              ownerColor={ownerColor}
              attackerColor={me ? t.player(me.slot) : t.c.ink}
              size="md"
              testID="region-hat"
            />
            {duel ? (
              <T v="data" tone={2}>
                {S.region.duelHp(duelHp(duel.power, duel.progress), duel.cells.length)} · {S.region.loopsToCapture(duel.loopsToCapture, attackEvent ? first(attackEvent.name.split(' ').slice(-1).join(' ')) : null)}
              </T>
            ) : null}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Stat label={S.region.area} value={fmtArea(r.areaM2)} />
          {owner ? <Stat label={S.region.ownership} value={r.ownedSinceDays !== null ? S.region.ownershipDays(r.ownedSinceDays) : '—'} /> : null}
          {owner ? <Stat label={S.region.lastDefense} value={r.lastDefenseAt ? relativeLabel(r.lastDefenseAt) : S.region.never} /> : null}
        </View>

        {duel && owner ? (
          <T v="callout" tone={3}>
            {S.region.privateDuel(first(owner.displayName))}
          </T>
        ) : null}

        {owner && !r.hidden && !mine && owner.insignia.length ? (
          <View style={{ gap: 8 }}>
            <SectionTitle>{S.region.insignia(first(owner.displayName))}</SectionTitle>
            {owner.insignia.map((id) => {
              const b = BADGE_BY_ID.get(id);
              return (
                <View key={id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <T v="callout" weight={FONT.semibold}>
                    {b?.name ?? id}
                  </T>
                  <T v="callout" tone={2} style={{ flex: 1, textAlign: 'right', fontSize: 13 }}>
                    {b?.insignia?.effect ?? ''}
                  </T>
                </View>
              );
            })}
          </View>
        ) : null}

        {mine && r.incomingDuels.length ? (
          <View style={{ gap: 10 }}>
            <SectionTitle>{S.region.incoming}</SectionTitle>
            {r.incomingDuels.map((d) => (
              <View key={d.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <PlayerBadge slot={d.attacker.slot} initials={d.attacker.initials} size={28} />
                  <T v="callout" style={{ flex: 1 }}>
                    {d.attacker.displayName}
                  </T>
                  <Button kind="secondary" label={S.map.defend} icon="defend" onPress={() => actions.onOpenDuel(d)} />
                </View>
                <Hat power={d.power} progress={d.progress} ownerColor={ownerColor} attackerColor={t.player(d.attacker.slot)} size="sm" />
              </View>
            ))}
          </View>
        ) : null}

        {r.history.length ? (
          <View style={{ gap: 8 }}>
            <SectionTitle>{S.region.history}</SectionTitle>
            {r.history.map((h, i) => (
              <View key={`${h.at}-${i}`} style={{ flexDirection: 'row', gap: 12 }}>
                <T v="data" tone={3} style={{ width: 56 }}>
                  {shortDate(h.at)}
                </T>
                <T v="callout" tone={2} style={{ flex: 1 }}>
                  {h.text}
                </T>
              </View>
            ))}
          </View>
        ) : null}
        {!r.canStartDuel && owner && !mine && !duel && r.duelSlotsLeft === 0 ? (
          <T v="callout" tone={3}>
            {S.region.slotsFull}
          </T>
        ) : null}
      </ScrollView>
      <Divider />
      <View style={{ padding: GUTTER }}>
        <Button big label={cta.label} onPress={cta.onPress} testID={cta.testID} />
      </View>
    </View>
  );
}
