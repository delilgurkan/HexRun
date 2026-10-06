import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { DuelHitDto, DuelSuggestion, RunSummary } from '@hexrun/contracts';
import { fmtArea, fmtKm, fmtPace, fmtDuration } from '@hexrun/core';
import { Button } from '../../components/Button';
import { Icon, type IconName } from '../../components/Icon';
import { PlayerBadge } from '../../components/PlayerBadge';
import { Card, Divider, Stat } from '../../components/Screen';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { monthName, runRangeLabel } from '../../lib/dates';
import { FONT, RADII, useTheme } from '../../theme';

export type SummaryVariant = 'closed' | 'open' | 'suggestion' | 'review';

/** Önce toprak, sonra fitness: A kapandı · B açık kaldı · C düello önerisi · inceleniyor. */
export function summaryVariant(s: RunSummary): SummaryVariant {
  if (s.status === 'review') return 'review';
  const gained = s.loops.some((l) => l.status === 'applied' && (l.newCells > 0 || l.capturedCells > 0 || l.reinforced > 0));
  if (s.suggestions.length > 0 && !s.loops.some((l) => l.capturedCells > 0)) return 'suggestion';
  if (s.status === 'open' || (!gained && s.loops.length === 0)) return 'open';
  return 'closed';
}

function Tag({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: t.c.surf2, borderRadius: RADII.s, paddingHorizontal: 10, paddingVertical: 4 }}>
      <T v="label">{label}</T>
    </View>
  );
}

function Metrics({ s }: { s: RunSummary }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Stat label={S.common.distance} value={`${fmtKm(s.distanceM, 2)} km`} />
      <Stat label={S.common.pace} value={`${fmtPace(s.paceSecPerKm)}/km`} />
      <Stat label={S.common.time} value={fmtDuration(s.durationMs)} />
    </View>
  );
}

function Row({ icon, title, sub }: { icon: IconName; title: string; sub?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }} accessible accessibilityLabel={sub ? `${title}, ${sub}` : title}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.surf2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="callout">{title}</T>
        {sub ? (
          <T v="callout" tone={2} style={{ fontSize: 13 }}>
            {sub}
          </T>
        ) : null}
      </View>
    </View>
  );
}

function wonHits(s: RunSummary): DuelHitDto[] {
  return s.loops.flatMap((l) => l.hits).filter((h) => h.role === 'attack' && h.captured);
}

export interface SummaryActions {
  onDone: () => void;
  onShare?: () => void;
  onMakeLoop?: () => void;
  onEditSuggestion?: (sg: DuelSuggestion) => void;
  onNote?: (text: string) => Promise<void>;
}

export function SummaryView({ s, actions }: { s: RunSummary; actions: SummaryActions }) {
  const t = useTheme();
  const v = summaryVariant(s);
  const range = runRangeLabel(s.startedAt, s.endedAt);
  const totalCells = s.loops.reduce((a, l) => a + l.newCells + l.capturedCells, 0);
  const duelCells = s.loops.reduce((a, l) => a + l.capturedCells, 0);
  const hits = wonHits(s);
  const firstHit = s.loops.flatMap((l) => l.hits).find((h) => h.counted);

  if (v === 'review') return <ReviewView s={s} actions={actions} />;

  if (v === 'open') {
    return (
      <View style={{ gap: 16 }} testID="summary-open">
        {s.openGapM ? <Tag label={S.summary.openTag(Math.round(s.openGapM))} /> : null}
        <T v="label" tone={2}>
          {S.summary.done} · {range}
        </T>
        <T v="title1" accessibilityRole="header">
          {S.summary.openTitle}
        </T>
        <T tone={2}>{S.summary.openBody}</T>
        <Metrics s={s} />
        <Card>
          <Row icon="map" title={S.summary.openNoChange} sub={S.summary.openNoChangeSub} />
          <Divider />
          <Row icon="pace" title={S.summary.monthDistance(monthName(s.endedAt))} sub={`+${fmtKm(s.distanceM)} km`} />
          <Divider />
          <Row icon="streak" title={S.summary.streakLabel} sub={S.common.streakDays(s.streakDays)} />
        </Card>
        {s.openGapM && actions.onMakeLoop ? <Button big label={S.summary.makeLoop(Math.round(s.openGapM))} onPress={actions.onMakeLoop} /> : null}
      </View>
    );
  }

  const sg = s.suggestions[0];
  return (
    <View style={{ gap: 16 }} testID={v === 'suggestion' ? 'summary-suggestion' : 'summary-closed'}>
      <T v="label" tone={2}>
        {S.summary.done} · {range}
      </T>
      <T v="title1" accessibilityRole="header">
        {S.summary.closedHead(totalCells, duelCells)}
      </T>
      <View style={{ gap: 2 }}>
        <T v="label" tone={3}>
          {S.summary.gained}
        </T>
        <T v="display" tabular style={{ fontSize: 44, lineHeight: 48 }} testID="gained">
          +{fmtArea(s.totalGainedAreaM2)}
        </T>
        {firstHit ? (
          <T v="data" tone={2}>
            {`Can ${firstHit.hpBefore} → ${firstHit.hpAfter}`}
          </T>
        ) : null}
      </View>
      <Metrics s={s} />
      {s.newBadges.map((b) => (
        <Card key={b.id}>
          <Row icon="defend" title={S.summary.newBadge(b.name)} sub={b.how} />
        </Card>
      ))}
      {hits.map((h) => (
        <Card key={h.duelId}>
          <Row
            icon="siege"
            title={S.summary.duelWon(h.opponent?.displayName.split(' ')[0] ?? '')}
            sub={`${S.summary.duelWonBody(h.cells)} · ${S.summary.streak(s.streakDays)}`}
          />
        </Card>
      ))}
      {v === 'suggestion' && sg ? (
        <Card testID="suggestion-card">
          <Tag label={S.summary.suggestionTag} />
          <T v="title2">{S.summary.suggestionTitle(sg.defender.displayName.split(' ')[0] ?? sg.defender.username)}</T>
          <T tone={2}>{S.summary.suggestionBody(sg.defender.displayName.split(' ')[0] ?? sg.defender.username, sg.cells.length)}</T>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <PlayerBadge slot={sg.defender.slot} initials={sg.defender.initials} size={36} />
            <View style={{ flex: 1 }}>
              <T v="callout" weight={FONT.bold}>
                {sg.defender.displayName}
              </T>
              <T v="callout" tone={2} style={{ fontSize: 13 }}>
                {S.summary.suggestionMeta(sg.cells.length, Math.round(sg.avgPower))}
              </T>
            </View>
            <T v="data">can {Math.round(sg.avgPower)}</T>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Stat label={S.common.area} value={S.common.cells(sg.cells.length)} />
            <Stat label={S.summary.route} value={`~${fmtKm(sg.routeLengthM, 1)} km`} />
          </View>
          <T v="callout" tone={3}>
            {S.summary.suggestionNote(sg.defender.displayName.split(' ')[0] ?? '')}
          </T>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button kind="secondary" label={S.common.notNow} onPress={actions.onDone} style={{ flex: 1 }} />
            <Button label={S.summary.editArea} onPress={() => actions.onEditSuggestion?.(sg)} style={{ flex: 1 }} testID="edit-suggestion" />
          </View>
        </Card>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Icon name="streak" size={18} color={t.c.ink2} />
        <T v="callout" tone={2}>
          {S.summary.streak(s.streakDays)}
        </T>
      </View>
    </View>
  );
}

/** 15B · Şüpheli halka cezalandırılmaz, bekletilir. */
function ReviewView({ s, actions }: { s: RunSummary; actions: SummaryActions }) {
  const t = useTheme();
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const segKm = fmtKm(s.review?.segmentM ?? s.distanceM, 1);
  const pending = s.loops.reduce((a, l) => a + l.cells, 0);
  return (
    <View style={{ gap: 16 }} testID="summary-review">
      <Tag label={S.summary.reviewTag} />
      <T v="label" tone={2}>
        {S.summary.done} · {s.review?.paceSecPerKm ? `${fmtPace(s.review.paceSecPerKm)}/km · ${segKm} km · ` : ''}
        {runRangeLabel(s.startedAt, s.endedAt)}
      </T>
      <T v="title1" accessibilityRole="header">
        {S.summary.reviewTitle}
      </T>
      <T tone={2}>{S.summary.reviewBody(segKm)}</T>
      <Card>
        <Row icon="check" title={S.summary.reviewRows.saved} sub={`${fmtKm(s.distanceM, 1)} km · ${S.summary.streak(s.streakDays)}`} />
        <Divider />
        <Row icon="map" title={S.summary.reviewRows.mapUnchanged} sub={S.summary.reviewRows.pendingCells(pending)} />
        <Divider />
        <Row icon="time" title={S.summary.reviewRows.eta} sub={S.summary.reviewRows.etaSub} />
      </Card>
      {open && !sent ? (
        <View style={{ gap: 8 }}>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={S.summary.notePlaceholder}
            placeholderTextColor={t.c.ink3}
            multiline
            maxLength={280}
            accessibilityLabel={S.summary.addNote}
            style={{ minHeight: 88, borderRadius: RADII.s, borderWidth: 1, borderColor: t.c.line2, backgroundColor: t.c.surf, color: t.c.ink, padding: 12, fontFamily: FONT.regular, fontSize: 16 }}
          />
          <Button
            label={S.common.save}
            disabled={!note.trim()}
            onPress={async () => {
              await actions.onNote?.(note.trim());
              setSent(true);
            }}
          />
        </View>
      ) : null}
      {sent ? <T v="callout">{S.summary.noteSent}</T> : null}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {!sent ? <Button kind="secondary" label={S.summary.addNote} onPress={() => setOpen(true)} style={{ flex: 1 }} /> : null}
        <Button label={S.common.done} onPress={actions.onDone} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
