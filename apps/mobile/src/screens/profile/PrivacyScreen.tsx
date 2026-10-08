import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { useMutation } from '@tanstack/react-query';
import { clampRadius, RULES } from '@hexrun/core';
import { errorText } from '../../api/errorText';
import { qk, useMe } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Card, Divider, Screen, SectionTitle } from '../../components/Screen';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { useServices } from '../../services';
import { FONT, useTheme } from '../../theme';

/** 15A · Gizlilik bölgesi (200–800 m) ve "kim ne görür". Ev konumu sunucuda saklanmaz. */
export function PrivacyScreen() {
  const t = useTheme();
  const { api, queryClient } = useServices();
  const me = useMe();
  const [enabled, setEnabled] = useState(false);
  const [radius, setRadius] = useState(400);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (me.data) {
      setEnabled(me.data.privacy.enabled);
      if (me.data.privacy.radiusM) setRadius(me.data.privacy.radiusM);
    }
  }, [me.data]);

  const save = useMutation({
    mutationFn: async (v: { on: boolean; radiusM: number }) => {
      if (!v.on) return api.me.privacy({ home: null });
      // Sözleşme ev konumunu her değişiklikte ister; sunucu yalnız kaydırılmış merkezi saklar.
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) throw new Error(S.privacy.needLocation);
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return api.me.privacy({ home: { lat: p.coords.latitude, lng: p.coords.longitude }, radiusM: clampRadius(v.radiusM) });
    },
    onSuccess: (m) => {
      queryClient.setQueryData(qk.me, m);
      setMsg(S.privacy.homeSet);
    },
    onError: (e) => setMsg(e instanceof Error && !('status' in e) ? e.message : errorText(e)),
  });

  return (
    <Screen title={S.privacy.title} backLabel={S.profile.title} testID="privacy">
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T v="title2">{S.privacy.zone}</T>
            <T v="callout" tone={2}>
              {S.privacy.zoneSub}
            </T>
          </View>
          <Switch
            value={enabled}
            onValueChange={(v) => {
              setEnabled(v);
              save.mutate({ on: v, radiusM: radius });
            }}
            accessibilityLabel={S.privacy.zone}
            trackColor={{ true: t.c.ink, false: t.c.track }}
            thumbColor={t.c.surf}
          />
        </View>
        {enabled ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="data" tone={2}>
                {S.privacy.inside}
              </T>
              <T v="data">{S.privacy.radius(radius)}</T>
            </View>
            <Slider
              minimumValue={RULES.PRIVACY_RADIUS_MIN_M}
              maximumValue={RULES.PRIVACY_RADIUS_MAX_M}
              step={50}
              value={radius}
              onValueChange={(v) => setRadius(Math.round(v))}
              onSlidingComplete={(v) => save.mutate({ on: true, radiusM: Math.round(v) })}
              minimumTrackTintColor={t.c.ink}
              maximumTrackTintColor={t.c.track}
              thumbTintColor={t.c.ink}
              accessibilityLabel={`${S.privacy.zone} ${S.privacy.radius(radius)}`}
              style={{ height: 44 }}
            />
            <Button kind="secondary" icon="locate" label={S.privacy.setHome} onPress={() => save.mutate({ on: true, radiusM: radius })} loading={save.isPending} />
          </>
        ) : null}
        {msg ? <T v="callout">{msg}</T> : null}
      </Card>
      <SectionTitle>{S.privacy.whoSees}</SectionTitle>
      <Card>
        {S.privacy.rows.map((r, i) => (
          <View key={r.k}>
            {i > 0 ? <Divider /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 }}>
              <T v="callout" style={{ flex: 1 }}>
                {r.k}
              </T>
              <T v="callout" weight={FONT.semibold}>
                {r.v}
              </T>
              {i !== 1 ? <Icon name="lock" size={16} color={t.c.ink2} /> : null}
            </View>
          </View>
        ))}
      </Card>
      <T v="callout" tone={3}>
        {S.privacy.footnote}
      </T>
    </Screen>
  );
}
