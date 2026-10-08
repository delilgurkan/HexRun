import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { errorText } from '../../api/errorText';
import { Icon, type IconName } from '../../components/Icon';
import { Card, Divider, Screen, SectionTitle } from '../../components/Screen';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { ENV } from '../../lib/env';
import { openSettings } from '../../lib/permissions';
import { useServices } from '../../services';
import { signOut } from '../../state/auth';
import { TARGET, useTheme } from '../../theme';

function Item({ icon, label, onPress, danger, busy, testID }: { icon: IconName; label: string; onPress: () => void; danger?: boolean; busy?: boolean; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TARGET.min + 4, opacity: pressed || busy ? 0.6 : 1 })}
      testID={testID}
    >
      <Icon name={icon} size={20} color={danger ? t.c.ink : t.c.ink2} />
      <T v="callout" style={{ flex: 1, textDecorationLine: danger ? 'underline' : 'none' }}>
        {label}
      </T>
      <Icon name="chevron" size={18} color={t.c.ink3} />
    </Pressable>
  );
}

/** Ayarlar: gizlilik, saatler, veri dışa aktarma, hesap silme, yasal bağlantılar. */
export function SettingsScreen() {
  const services = useServices();
  const { api } = services;
  const [exporting, setExporting] = useState(false);
  const open = (url: string) => void WebBrowser.openBrowserAsync(url).catch(() => undefined);

  const doExport = async () => {
    setExporting(true);
    try {
      const data = await api.me.export();
      const file = new File(Paths.cache, `hexrun-verilerim-${new Date().toISOString().slice(0, 10)}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(data, null, 2));
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: S.settings.export });
      else Alert.alert(S.settings.exportDone);
    } catch (e) {
      Alert.alert(S.common.genericError, errorText(e));
    } finally {
      setExporting(false);
    }
  };

  const doDelete = () =>
    Alert.alert(S.settings.deleteConfirmTitle, S.settings.deleteConfirmBody, [
      { text: S.common.cancel, style: 'cancel' },
      {
        text: S.settings.deleteConfirm,
        style: 'destructive',
        onPress: async () => {
          try {
            await api.me.remove();
            await signOut(services);
          } catch (e) {
            Alert.alert(S.common.genericError, errorText(e));
          }
        },
      },
    ]);

  return (
    <Screen title={S.settings.title} backLabel={S.profile.title} testID="settings">
      <SectionTitle>{S.settings.account}</SectionTitle>
      <Card>
        <Item icon="eye" label={S.settings.privacy} onPress={() => router.push('/profile/privacy')} />
        <Divider />
        <Item icon="watch" label={S.settings.integrations} onPress={() => router.push('/profile/integrations')} />
        <Divider />
        <Item icon="bell" label={S.settings.notifications} onPress={openSettings} />
        <Divider />
        <Item icon="shareIos" label={S.settings.export} onPress={doExport} busy={exporting} testID="export" />
        <Divider />
        <Item icon="backIos" label={S.settings.logout} onPress={() => void signOut(services)} />
        <Divider />
        <Item icon="close" label={S.settings.delete} onPress={doDelete} danger testID="delete-account" />
      </Card>
      <SectionTitle>{S.settings.legal}</SectionTitle>
      <Card>
        <Item icon="chevron" label={S.settings.terms} onPress={() => open(ENV.termsUrl)} />
        <Divider />
        <Item icon="chevron" label={S.settings.privacyPolicy} onPress={() => open(ENV.privacyUrl)} />
        <Divider />
        <Item icon="chevron" label={S.settings.licenses} onPress={() => open('https://hexrun.co/lisanslar')} />
      </Card>
      <View style={{ gap: 4 }}>
        <T v="data" tone={3}>
          {S.settings.mapAttribution}
        </T>
        <T v="data" tone={3}>
          {S.settings.version(Constants.expoConfig?.version ?? '1.0.0')}
        </T>
      </View>
    </Screen>
  );
}
