import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { ShareCard } from '@hexrun/contracts';
import { fmtArea, fmtDuration, fmtKm, fmtPace } from '@hexrun/core';
import { useShareCard } from '../../api/hooks';
import { Button } from '../../components/Button';
import { Segmented } from '../../components/Chip';
import { Screen } from '../../components/Screen';
import { Silhouette } from '../../components/Silhouette';
import { Skeleton } from '../../components/Skeleton';
import { StateBlock } from '../../components/StateBlock';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { COLORS, FONT, playerColor, RADII, type ColorScheme } from '../../theme';

/** 9:16 hikâye kartı: yalnız petek silüeti ve m²; harita, rota, rakip adı yok. */
export function StoryCard({ card, scheme, width }: { card: ShareCard; scheme: ColorScheme; width: number }) {
  const c = COLORS[scheme];
  const h = Math.round((width * 16) / 9);
  const col = playerColor(card.slot, scheme);
  const txt = (extra: object = {}) => ({ color: c.ink, ...extra });
  return (
    <View style={{ width, height: h, backgroundColor: c.bg, borderRadius: RADII.l, padding: 24, justifyContent: 'space-between', overflow: 'hidden' }} testID="story-card">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="title2" weight={FONT.black} style={txt()}>
          hexrun
        </T>
        <T v="data" style={txt({ color: c.ink2 })}>
          {card.dateLabel}
        </T>
      </View>
      <View style={{ alignItems: 'center' }}>
        <Silhouette rings={card.silhouette} width={width - 64} height={h * 0.38} color={col} stroke={c.casing} />
      </View>
      <View style={{ gap: 6 }}>
        <T v="label" style={txt({ color: c.ink2 })}>
          {card.kicker}
        </T>
        <T v="display" tabular style={txt({ fontSize: 44, lineHeight: 48 })} adjustsFontSizeToFit numberOfLines={1}>
          +{fmtArea(card.gainedAreaM2)}
        </T>
        <T v="callout" style={txt()}>
          {card.line}
        </T>
        <T v="data" style={txt({ color: c.ink2 })}>
          {`${fmtKm(card.distanceM, 1)} km · ${fmtDuration(card.durationMs)} · ${fmtPace(card.paceSecPerKm)}/km`}
        </T>
        <T v="data" style={txt({ color: c.ink2 })}>
          {`@${card.username}${card.teamName ? ` · ${card.teamName}` : ''}`}
        </T>
      </View>
    </View>
  );
}

/** 18A · Fethi paylaş: kart görüntüsü alınır ve sistem paylaşım sayfası açılır. */
export function ShareScreen() {
  const { runId } = useLocalSearchParams<{ runId: string }>();
  const q = useShareCard(runId);
  const [scheme, setScheme] = useState<ColorScheme>('dark');
  const [busy, setBusy] = useState(false);
  const ref = useRef<View>(null);
  const share = async () => {
    setBusy(true);
    try {
      const uri = await captureRef(ref, { format: 'png', quality: 1, width: 1080, height: 1920 });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(S.share.unavailable);
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: S.share.title, UTI: 'public.png' });
    } catch {
      Alert.alert(S.common.genericError);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen title={S.share.title} footer={q.data ? <Button big icon="shareIos" label={S.share.share} onPress={share} loading={busy} testID="share-btn" /> : undefined}>
      <Segmented
        options={[
          { key: 'dark', label: S.share.dark },
          { key: 'light', label: S.share.light },
        ]}
        value={scheme}
        onChange={setScheme}
      />
      {q.data ? (
        <View style={{ alignItems: 'center' }}>
          <View ref={ref} collapsable={false}>
            <StoryCard card={q.data} scheme={scheme} width={270} />
          </View>
        </View>
      ) : q.isError ? (
        <StateBlock title={S.common.genericError} action={S.common.retry} onAction={() => void q.refetch()} />
      ) : (
        <Skeleton height={480} width={270} style={{ alignSelf: 'center' }} />
      )}
      <T v="callout" tone={3}>
        {S.share.privacyNote}
      </T>
    </Screen>
  );
}
