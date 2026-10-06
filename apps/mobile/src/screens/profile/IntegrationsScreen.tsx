import { useEffect, useState } from 'react';
import { Alert, Platform, Switch, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMutation } from '@tanstack/react-query';
import type { IntegrationDto } from '@hexrun/contracts';
import type { IntegrationProvider } from '../../api/endpoints';
import { errorText } from '../../api/errorText';
import { isApiError } from '../../api/errors';
import { qk, useIntegrations, useUpdateIntegration } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Card, Divider, Screen, SectionTitle } from '../../components/Screen';
import { Skeleton } from '../../components/Skeleton';
import { StateBlock } from '../../components/StateBlock';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { relativeLabel } from '../../lib/dates';
import { deviceName } from '../../run/native';
import { useServices } from '../../services';
import { FONT, useTheme } from '../../theme';

const WATCHES: IntegrationProvider[] = Platform.OS === 'ios' ? ['apple_watch', 'garmin', 'coros', 'suunto', 'polar'] : ['wear_os', 'garmin', 'coros', 'suunto', 'polar'];
const APPS: IntegrationProvider[] = Platform.OS === 'ios' ? ['strava', 'apple_health'] : ['strava', 'health_connect'];
const DEVICE_SOURCES = new Set<IntegrationProvider>(['apple_watch', 'wear_os', 'apple_health', 'health_connect']);

function Row({ p, dto, onConnect, onDisconnect, soon, busy }: { p: IntegrationProvider; dto?: IntegrationDto; onConnect: () => void; onDisconnect: () => void; soon: boolean; busy: boolean }) {
  const t = useTheme();
  const update = useUpdateIntegration();
  const connected = !!dto?.connected;
  const sub = connected
    ? [dto?.device, dto?.lastSyncAt ? S.integrations.lastSync(relativeLabel(dto.lastSyncAt)) : null].filter(Boolean).join(' · ') ||
      (p === 'apple_watch' || p === 'wear_os' ? S.integrations.appInstalled : p === 'apple_health' || p === 'health_connect' ? S.integrations.healthSub : '')
    : p === 'apple_health' || p === 'health_connect'
      ? S.integrations.healthSub
      : S.integrations.autoImport;
  return (
    <View style={{ gap: 8, paddingVertical: 4 }} testID={`integration-${p}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
        <Icon name={p === 'strava' || p.startsWith('apple_h') || p === 'health_connect' ? 'pace' : 'watch'} size={22} />
        <View style={{ flex: 1 }}>
          <T v="callout" weight={FONT.semibold}>
            {S.integrations.names[p] ?? p}
          </T>
          {sub ? (
            <T v="callout" tone={2} style={{ fontSize: 13 }}>
              {sub}
            </T>
          ) : null}
        </View>
        {connected ? (
          <Button kind="ghost" label={S.integrations.connected} icon="check" onPress={onDisconnect} accessibilityHint={S.integrations.disconnect} />
        ) : soon ? (
          <T v="label" tone={3}>
            Yakında
          </T>
        ) : (
          <Button kind="secondary" label={S.integrations.connect} onPress={onConnect} loading={busy} />
        )}
      </View>
      {p === 'strava' && connected ? (
        <>
          {(['importEnabled', 'exportEnabled'] as const).map((k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingLeft: 34 }}>
              <T v="callout" style={{ flex: 1 }}>
                {k === 'importEnabled' ? S.integrations.stravaImport : S.integrations.stravaExport}
              </T>
              <Switch
                value={!!dto?.[k]}
                onValueChange={(v) => update.mutate({ p, body: { [k]: v } })}
                accessibilityLabel={k === 'importEnabled' ? S.integrations.stravaImport : S.integrations.stravaExport}
                trackColor={{ true: t.c.ink, false: t.c.track }}
                thumbColor={t.c.surf}
              />
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

/** 17A · Saat ve uygulamalar: aynı kurallar, 24 saat penceresi, aynı koşu bir kez. */
export function IntegrationsScreen() {
  const { api, queryClient } = useServices();
  const q = useIntegrations();
  const params = useLocalSearchParams<{ connected?: string; error?: string }>();
  const [soon, setSoon] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (params.connected || params.error) void queryClient.invalidateQueries({ queryKey: qk.integrations });
    if (params.error) Alert.alert(S.common.genericError);
  }, [params.connected, params.error, queryClient]);

  const connect = async (p: IntegrationProvider) => {
    setBusy(p);
    try {
      const r = await api.integrations.connect(p, DEVICE_SOURCES.has(p) ? deviceName() : undefined);
      if (r.url) await WebBrowser.openAuthSessionAsync(r.url, 'hexrun://integrations');
      await queryClient.invalidateQueries({ queryKey: qk.integrations });
    } catch (e) {
      if (isApiError(e) && (e.code === 'not_configured' || e.status === 501)) setSoon((s) => new Set(s).add(p));
      else Alert.alert(S.common.genericError, errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const disconnect = useMutation({
    mutationFn: (p: IntegrationProvider) => api.integrations.disconnect(p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.integrations }),
  });
  const ask = (p: IntegrationProvider) =>
    Alert.alert(S.integrations.disconnect, S.integrations.names[p], [
      { text: S.common.cancel, style: 'cancel' },
      { text: S.integrations.disconnect, style: 'destructive', onPress: () => disconnect.mutate(p) },
    ]);

  const byP = new Map((q.data ?? []).map((d) => [d.provider, d]));
  const section = (title: string, list: IntegrationProvider[]) => (
    <>
      <SectionTitle>{title}</SectionTitle>
      <Card>
        {list.map((p, i) => (
          <View key={p}>
            {i > 0 ? <Divider /> : null}
            <Row p={p} dto={byP.get(p)} soon={soon.has(p)} busy={busy === p} onConnect={() => void connect(p)} onDisconnect={() => ask(p)} />
          </View>
        ))}
      </Card>
    </>
  );
  return (
    <Screen title={S.integrations.title} backLabel={S.profile.title} testID="integrations">
      {q.isLoading ? (
        <Skeleton height={240} />
      ) : q.isError ? (
        <StateBlock title={S.common.genericError} action={S.common.retry} onAction={() => void q.refetch()} />
      ) : (
        <>
          {section(S.integrations.watches, WATCHES)}
          {section(S.integrations.apps, APPS)}
          <T v="callout" tone={3}>
            {S.integrations.rule}
          </T>
        </>
      )}
    </Screen>
  );
}
