import { useState } from 'react';
import { Alert, Share, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import type { TeamResponse } from '@hexrun/contracts';
import { fmtArea, fmtInt } from '@hexrun/core';
import { errorText } from '../../api/errorText';
import { qk, useLeague, useTeam } from '../../api/hooks';
import { Button } from '../../components/Button';
import { PlayerBadge } from '../../components/PlayerBadge';
import { Card, Screen, SectionTitle, Stat } from '../../components/Screen';
import { Skeleton } from '../../components/Skeleton';
import { StateBlock } from '../../components/StateBlock';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { useServices } from '../../services';
import { FONT, RADII, TARGET, useTheme } from '../../theme';

function TeamView({ team }: { team: TeamResponse }) {
  const t = useTheme();
  const { api, queryClient } = useServices();
  const league = useLeague('team', 'all');
  const leave = useMutation({
    mutationFn: () => api.teams.leave(),
    onSuccess: () => {
      queryClient.setQueryData(qk.team, null);
      void queryClient.invalidateQueries({ queryKey: qk.me });
    },
  });
  return (
    <View style={{ gap: 16 }} testID="team">
      <View style={{ gap: 4 }}>
        <T v="title1" accessibilityRole="header">
          {team.name}
        </T>
        <T v="callout" tone={2}>
          {[S.team.captain(team.captain.displayName), S.team.members(team.members.length), S.team.rank(league.data?.regionName ?? null, team.regionRank)].filter(Boolean).join(' · ')}
        </T>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <Stat label={S.team.shared} value={fmtArea(team.territoryM2)} />
        <Stat label={S.team.week} value={`+${fmtArea(team.weekGainM2)}`} />
        <Stat label={S.team.cellsLabel} value={fmtInt(team.cells)} />
      </View>
      {league.data?.rows.length ? (
        <Card>
          <SectionTitle right={<Button kind="ghost" label={S.team.toLeague} onPress={() => router.push('/league')} style={{ borderWidth: 0 }} />}>
            {S.team.leagueTitle(league.data.regionName)}
          </SectionTitle>
          {league.data.rows.slice(0, 3).map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 36 }}>
              <T v="data" tone={2} style={{ width: 20 }}>
                {String(r.rank)}
              </T>
              <T v="callout" weight={r.isMe || r.id === team.id ? FONT.bold : FONT.medium} style={{ flex: 1 }}>
                {r.name}
              </T>
              <T v="data">{fmtInt(r.valueM2)} m²</T>
            </View>
          ))}
        </Card>
      ) : null}
      <SectionTitle>{S.team.membersTitle}</SectionTitle>
      {team.members.map((m) => (
        <View key={m.player.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48 }} accessible accessibilityLabel={`${m.player.displayName}, ${fmtArea(m.territoryM2)}`}>
          <PlayerBadge slot={m.player.slot} initials={m.player.initials} size={32} />
          <View style={{ flex: 1 }}>
            <T v="callout" weight={FONT.semibold}>
              {m.player.displayName}
            </T>
            {m.role === 'captain' ? (
              <T v="callout" tone={2} style={{ fontSize: 13 }}>
                {S.team.captainRole}
              </T>
            ) : null}
          </View>
          <T v="data">{fmtInt(m.territoryM2)}</T>
        </View>
      ))}
      {team.inviteCode ? (
        <Button kind="secondary" label={S.team.inviteCode(team.inviteCode)} icon="shareIos" onPress={() => void Share.share({ message: S.friends.inviteMessage(team.inviteCode!) })} />
      ) : null}
      <T v="callout" tone={3}>
        {S.team.noTeamBody}
      </T>
      <Button
        kind="danger"
        label={S.team.leave}
        onPress={() =>
          Alert.alert(S.team.leave, S.team.leaveConfirm, [
            { text: S.common.cancel, style: 'cancel' },
            { text: S.team.leave, style: 'destructive', onPress: () => leave.mutate() },
          ])
        }
      />
      <View style={{ height: 1, backgroundColor: t.c.line }} />
    </View>
  );
}

function NoTeam() {
  const t = useTheme();
  const { api, queryClient } = useServices();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const done = (team: TeamResponse) => {
    queryClient.setQueryData(qk.team, team);
    void queryClient.invalidateQueries({ queryKey: qk.me });
  };
  const create = useMutation({ mutationFn: () => api.teams.create({ name: name.trim() }), onSuccess: done, onError: (e) => setErr(errorText(e)) });
  const join = useMutation({ mutationFn: () => api.teams.join({ code: code.trim() }), onSuccess: done, onError: (e) => setErr(errorText(e)) });
  const input = { minHeight: TARGET.min + 4, borderRadius: RADII.s, borderWidth: 1, borderColor: t.c.line2, backgroundColor: t.c.surf, color: t.c.ink, paddingHorizontal: 12, fontFamily: FONT.medium, fontSize: 16 } as const;
  return (
    <View style={{ gap: 16 }} testID="no-team">
      <StateBlock icon="team" title={S.team.noTeamTitle} body={S.team.noTeamBody} />
      <Card>
        <TextInput value={name} onChangeText={setName} placeholder={S.team.createPlaceholder} placeholderTextColor={t.c.ink3} style={input} accessibilityLabel={S.team.createPlaceholder} maxLength={32} />
        <Button label={S.team.create} onPress={() => create.mutate()} disabled={name.trim().length < 3} loading={create.isPending} />
      </Card>
      <Card>
        <TextInput value={code} onChangeText={setCode} placeholder={S.team.joinPlaceholder} placeholderTextColor={t.c.ink3} autoCapitalize="characters" style={input} accessibilityLabel={S.team.joinPlaceholder} />
        <Button kind="secondary" label={S.team.join} onPress={() => join.mutate()} disabled={code.trim().length < 4} loading={join.isPending} />
      </Card>
      {err ? <T v="callout">{err}</T> : null}
    </View>
  );
}

/** 12 · Takım: yalnız üyelerin toplam m²'si ile sıralanır; savunma bireysel. */
export function TeamScreen() {
  const q = useTeam();
  return (
    <Screen title={S.team.title} large onBack={null}>
      {q.isLoading ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={36} width="60%" />
          <Skeleton height={60} />
          <Skeleton height={120} />
        </View>
      ) : q.isError ? (
        <StateBlock title={S.common.genericError} action={S.common.retry} onAction={() => void q.refetch()} />
      ) : q.data ? (
        <TeamView team={q.data} />
      ) : (
        <NoTeam />
      )}
    </Screen>
  );
}
