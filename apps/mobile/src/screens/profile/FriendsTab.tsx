import { useState } from 'react';
import { Pressable, Share, TextInput, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import type { FeedItem, FriendItem, Me } from '@hexrun/contracts';
import { errorText } from '../../api/errorText';
import { qk, useClap, useFeed, useFriends } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Segmented } from '../../components/Chip';
import { Icon } from '../../components/Icon';
import { PlayerBadge } from '../../components/PlayerBadge';
import { Card, Divider } from '../../components/Screen';
import { Silhouette } from '../../components/Silhouette';
import { Skeleton } from '../../components/Skeleton';
import { StateBlock } from '../../components/StateBlock';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { useServices } from '../../services';
import { FONT, RADII, TARGET, useTheme } from '../../theme';

function FriendRow({ f }: { f: FriendItem }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 52 }} accessible accessibilityLabel={`${f.player.displayName}, ${f.relation}`}>
      <PlayerBadge slot={f.player.slot} initials={f.player.initials} size={36} />
      <View style={{ flex: 1 }}>
        <T v="callout" weight={FONT.semibold}>
          {f.player.displayName}
        </T>
        <T v="callout" tone={2} style={{ fontSize: 13 }}>
          {f.relation}
        </T>
      </View>
      {f.status === 'besieging_you' ? <Icon name="siege" size={20} /> : f.status === 'running' ? <Icon name="pace" size={20} /> : null}
    </View>
  );
}

export function FeedRow({ f, onClap }: { f: FeedItem; onClap: (id: string) => void }) {
  const t = useTheme();
  return (
    <Card testID={`feed-${f.id}`}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <PlayerBadge slot={f.player.slot} initials={f.player.initials} size={32} />
        <T v="callout" weight={FONT.semibold} style={{ flex: 1 }}>
          {`${f.player.displayName} · ${f.timeLabel}`}
        </T>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="title2">{f.title}</T>
          <T v="callout" tone={2}>
            {f.subtitle}
          </T>
        </View>
        {f.silhouette?.length ? <Silhouette rings={f.silhouette} width={72} height={56} color={t.player(f.player.slot)} stroke={t.c.casing} /> : null}
      </View>
      <Pressable
        onPress={() => !f.clappedByMe && onClap(f.id)}
        accessibilityRole="button"
        accessibilityState={{ selected: f.clappedByMe }}
        accessibilityLabel={S.friends.clapA11y(f.claps, f.clappedByMe)}
        style={{ alignSelf: 'flex-start', minHeight: TARGET.min, paddingHorizontal: 12, borderRadius: RADII.pill, flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: f.clappedByMe ? t.c.inv : t.c.surf2 }}
        testID={`clap-${f.id}`}
      >
        <Icon name="clap" size={18} color={f.clappedByMe ? t.c.invInk : t.c.ink} />
        <T v="data" color={f.clappedByMe ? t.c.invInk : t.c.ink}>
          {String(f.claps)}
        </T>
      </Pressable>
    </Card>
  );
}

/** 11 + 18B · Arkadaşlar: oyun ilişkisi listesi ve alkışlı akış. */
export function FriendsTab({ me: _me }: { me: Me }) {
  const t = useTheme();
  const [view, setView] = useState<'feed' | 'list'>('feed');
  const friends = useFriends();
  const feed = useFeed();
  const clap = useClap();
  const { api, queryClient } = useServices();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const accept = useMutation({
    mutationFn: () => api.friends.accept(code.trim()),
    onSuccess: (r) => {
      queryClient.setQueryData(qk.friends, r);
      setCode('');
    },
    onError: (e) => setErr(errorText(e)),
  });
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <View style={{ gap: 12 }} testID="friends">
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Segmented
          options={[
            { key: 'feed', label: S.friends.feed },
            { key: 'list', label: S.friends.list },
          ]}
          value={view}
          onChange={setView}
          style={{ flex: 1 }}
        />
        <Button
          label={S.friends.invite}
          icon="plus"
          onPress={() => friends.data && void Share.share({ message: S.friends.inviteMessage(friends.data.inviteCode) })}
          disabled={!friends.data}
        />
      </View>
      {view === 'list' ? (
        friends.isLoading ? (
          <Skeleton height={160} />
        ) : friends.data ? (
          <>
            <T v="label" tone={2}>
              {S.friends.count(friends.data.friends.length)}
            </T>
            {friends.data.friends.length ? (
              <Card>
                {friends.data.friends.map((f, i) => (
                  <View key={f.player.id}>
                    {i > 0 ? <Divider /> : null}
                    <FriendRow f={f} />
                  </View>
                ))}
              </Card>
            ) : (
              <T tone={2}>{S.friends.empty}</T>
            )}
            <Card>
              <T v="label" tone={2}>
                {S.friends.addByCode}
              </T>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder={S.friends.codePlaceholder}
                  placeholderTextColor={t.c.ink3}
                  autoCapitalize="characters"
                  accessibilityLabel={S.friends.codePlaceholder}
                  style={{ flex: 1, minHeight: TARGET.min, borderRadius: RADII.s, borderWidth: 1, borderColor: t.c.line2, color: t.c.ink, paddingHorizontal: 12, fontFamily: FONT.mono }}
                />
                <Button label={S.friends.add} onPress={() => accept.mutate()} disabled={code.trim().length < 4} loading={accept.isPending} />
              </View>
              {err ? <T v="callout">{err}</T> : null}
            </Card>
          </>
        ) : (
          <StateBlock title={S.common.genericError} action={S.common.retry} onAction={() => void friends.refetch()} />
        )
      ) : feed.isLoading ? (
        <Skeleton height={160} />
      ) : items.length ? (
        <>
          {items.map((f) => (
            <FeedRow key={f.id} f={f} onClap={(id) => clap.mutate(id)} />
          ))}
          {feed.hasNextPage ? <Button kind="ghost" label={S.notifications.loadMore} onPress={() => void feed.fetchNextPage()} /> : null}
        </>
      ) : feed.isError ? (
        <StateBlock title={S.common.genericError} action={S.common.retry} onAction={() => void feed.refetch()} />
      ) : (
        <T tone={2}>{S.friends.feedEmpty}</T>
      )}
    </View>
  );
}
