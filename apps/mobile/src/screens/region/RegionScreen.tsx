import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMe, useRegion } from '../../api/hooks';
import { IconButton } from '../../components/Button';
import { Skeleton } from '../../components/Skeleton';
import { StateBlock } from '../../components/StateBlock';
import { S } from '../../i18n';
import { startRun } from '../../run/start';
import { GUTTER, useTheme } from '../../theme';
import { RegionView } from './RegionView';

export function RegionScreen() {
  const t = useTheme();
  const { cell } = useLocalSearchParams<{ cell: string }>();
  const region = useRegion(cell);
  const me = useMe();
  return (
    <View style={{ flex: 1, backgroundColor: t.c.surf }}>
      <View style={{ position: 'absolute', right: 8, top: 8, zIndex: 2 }}>
        <IconButton icon="close" accessibilityLabel={S.common.close} onPress={() => router.back()} />
      </View>
      {region.data ? (
        <RegionView
          r={region.data}
          me={me.data}
          actions={{
            onRunHere: () => {
              router.back();
              void startRun(me.data, region.data?.myDuel ? { attackDuelId: region.data.myDuel.id } : {});
            },
            onStartDuel: () => router.replace({ pathname: '/duel/select', params: { cell: cell ?? '', defender: region.data?.owner?.id ?? '' } }),
            onOpenDuel: (d) => router.replace({ pathname: '/duel/[id]', params: { id: d.id } }),
          }}
        />
      ) : region.isError ? (
        <View style={{ padding: GUTTER }}>
          <StateBlock title={S.common.genericError} action={S.common.retry} onAction={() => void region.refetch()} />
        </View>
      ) : (
        <View style={{ padding: GUTTER, gap: 12 }} testID="region-loading">
          <Skeleton width="60%" height={30} />
          <Skeleton width="40%" height={16} />
          <Skeleton height={8} />
          <Skeleton height={60} />
        </View>
      )}
    </View>
  );
}
