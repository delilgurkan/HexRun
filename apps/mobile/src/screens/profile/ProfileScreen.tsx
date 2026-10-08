import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMe } from '../../api/hooks';
import { IconButton } from '../../components/Button';
import { Segmented } from '../../components/Chip';
import { PlayerBadge } from '../../components/PlayerBadge';
import { Screen } from '../../components/Screen';
import { Skeleton } from '../../components/Skeleton';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { BadgesTab } from './BadgesTab';
import { FriendsTab } from './FriendsTab';
import { StatsTab } from './StatsTab';

type Tab = 'stats' | 'badges' | 'friends';

/** Profil: haritadaki avatardan açılır. İstatistik · Rozetler (Nişanlar) · Arkadaşlar. */
export function ProfileScreen() {
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab ?? 'stats');
  const me = useMe();
  return (
    <Screen
      title={S.profile.title}
      backLabel={S.tabs.map}
      right={<IconButton icon="gear" accessibilityLabel={S.profile.settings} onPress={() => router.push('/profile/settings')} />}
      testID="profile"
    >
      {me.data ? (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <PlayerBadge slot={me.data.slot} initials={me.data.initials} size={56} goldFrame={me.data.goldFrame} ring />
          <View style={{ flex: 1 }}>
            <T v="title2">{me.data.displayName}</T>
            <T v="callout" tone={2}>
              {`@${me.data.username}${me.data.teamName ? ` · ${me.data.teamName}` : ''}`}
            </T>
          </View>
        </View>
      ) : (
        <Skeleton height={56} />
      )}
      <Segmented
        options={[
          { key: 'stats', label: S.profile.tabs.stats },
          { key: 'badges', label: S.profile.tabs.badges },
          { key: 'friends', label: S.profile.tabs.friends },
        ]}
        value={tab}
        onChange={setTab}
      />
      {me.data ? tab === 'stats' ? <StatsTab me={me.data} /> : tab === 'badges' ? <BadgesTab me={me.data} /> : <FriendsTab me={me.data} /> : null}
    </Screen>
  );
}
