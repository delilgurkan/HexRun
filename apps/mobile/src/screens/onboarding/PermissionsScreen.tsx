import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { Icon, type IconName } from '../../components/Icon';
import { Card } from '../../components/Screen';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { openSettings, permStore, requestLocation, requestNotifications } from '../../lib/permissions';
import { useStore } from '../../lib/store';
import { setPrefs } from '../../state/prefs';
import { GUTTER, useTheme } from '../../theme';

function PermCard({ icon, title, why, status, children }: { icon: IconName; title: string; why: string; status?: string; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.surf2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} />
        </View>
        <T v="title2">{title}</T>
      </View>
      <T tone={2}>{why}</T>
      {status ? (
        <T v="data" tone={2}>
          {status}
        </T>
      ) : null}
      {children}
    </Card>
  );
}

/**
 * İzinler: sistem penceresinden önce gerekçe. Konum reddedilirse uygulama yine açılır
 * ama koşu kilitli kalır.
 */
export function PermissionsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const perm = useStore(permStore, (s) => s);
  const done = async () => {
    await setPrefs({ permissionsDone: true });
    router.replace('/');
  };
  const locStatus =
    perm.location === 'always'
      ? S.permissions.locationGrantedAlways
      : perm.location === 'whenInUse'
        ? S.permissions.locationGrantedWhenInUse
        : perm.location === 'denied'
          ? S.permissions.locationDenied
          : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16, paddingHorizontal: GUTTER, gap: 16 }} testID="permissions">
      <T v="title1" accessibilityRole="header">
        {S.permissions.title}
      </T>
      <T tone={2}>{S.permissions.body}</T>
      <PermCard icon="locate" title={S.permissions.location} why={S.permissions.locationWhy} status={locStatus}>
        {perm.location === 'unknown' ? <Button label={S.permissions.locationAsk} onPress={() => void requestLocation()} /> : null}
        {perm.location === 'denied' ? <Button kind="secondary" label={S.permissions.openSettings} onPress={openSettings} /> : null}
      </PermCard>
      <PermCard
        icon="bell"
        title={S.permissions.notifications}
        why={S.permissions.notificationsWhy}
        status={perm.notifications === 'granted' ? S.permissions.notificationsGranted : undefined}
      />
      <View style={{ flex: 1 }} />
      {perm.notifications !== 'granted' ? (
        <Button
          big
          label={S.permissions.notificationsAsk}
          onPress={async () => {
            await requestNotifications().catch(() => false);
            await done();
          }}
        />
      ) : (
        <Button big label={S.common.continue} onPress={done} />
      )}
      {perm.notifications !== 'granted' ? <Button kind="ghost" label={S.permissions.later} onPress={done} style={{ borderWidth: 0 }} /> : null}
    </View>
  );
}
