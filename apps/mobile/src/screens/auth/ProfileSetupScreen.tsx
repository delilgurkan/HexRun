import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { Slot } from '@hexrun/contracts';
import { initials as toInitials, PALETTE, SLOTS } from '@hexrun/core';
import { errorText } from '../../api/errorText';
import { useMe } from '../../api/hooks';
import { Button } from '../../components/Button';
import { PlayerBadge } from '../../components/PlayerBadge';
import { Screen, SectionTitle } from '../../components/Screen';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { useServices } from '../../services';
import { setPrefs } from '../../state/prefs';
import { FONT, RADII, TARGET, useTheme } from '../../theme';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return d;
}

/** Profil kurulumu: kullanıcı adı + imza rengi (paletten; serbest renk yok) + komşu kuralı. */
export function ProfileSetupScreen() {
  const t = useTheme();
  const { api, queryClient } = useServices();
  const me = useMe();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [slot, setSlot] = useState<Slot>('keh');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me.data) {
      if (!username && me.data.username) setUsername(me.data.username);
      if (!displayName && me.data.displayName) setDisplayName(me.data.displayName);
      if (me.data.slot) setSlot(me.data.slot);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data]);

  const name = useDebounced(username.trim().toLowerCase(), 350);
  const valid = USERNAME_RE.test(name);
  const avail = useQuery({ queryKey: ['username', name], queryFn: () => api.me.username(name), enabled: valid, staleTime: 30_000 });
  const mine = me.data?.username === name;
  const ok = valid && (mine || avail.data?.available === true);

  let hint: string | null = null;
  if (username && !USERNAME_RE.test(username.trim().toLowerCase())) hint = S.profileSetup.invalid;
  else if (valid && avail.isFetching) hint = S.profileSetup.checking;
  else if (ok) hint = S.profileSetup.available;
  else if (avail.data && !avail.data.available)
    hint = avail.data.reason === 'reserved' ? S.profileSetup.reserved : avail.data.reason === 'invalid' ? S.profileSetup.invalid : S.profileSetup.taken;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.me.update({ username: name, slot, ...(displayName.trim() ? { displayName: displayName.trim() } : {}) });
      queryClient.setQueryData(['me'], updated);
      await setPrefs({ needsProfile: false });
      router.replace('/');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const colorName = PALETTE[slot].name;
  const ini = toInitials(displayName || username || 'H R');
  const input = {
    flex: 1,
    minHeight: TARGET.min + 8,
    color: t.c.ink,
    fontFamily: FONT.medium,
    fontSize: 17,
  } as const;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        title={S.profileSetup.title}
        large
        backLabel={S.common.back}
        testID="profile-setup"
        footer={<Button big label={S.profileSetup.submit} onPress={submit} disabled={!ok} loading={busy} testID="profile-submit" />}
      >
        <SectionTitle>{S.profileSetup.username}</SectionTitle>
        <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: RADII.s, borderWidth: 1, borderColor: t.c.line2, backgroundColor: t.c.surf, paddingHorizontal: 14 }}>
          <T v="title2" tone={3}>
            @
          </T>
          <TextInput
            testID="username-input"
            value={username}
            onChangeText={(v) => setUsername(v.toLowerCase())}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            accessibilityLabel={S.profileSetup.username}
            style={input}
          />
        </View>
        {hint ? (
          <T v="callout" tone={ok ? 1 : 2} testID="username-hint" accessibilityLiveRegion="polite">
            {hint}
          </T>
        ) : null}
        <SectionTitle>{S.profileSetup.displayName}</SectionTitle>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={40}
          accessibilityLabel={S.profileSetup.displayName}
          style={[input, { flex: 0, borderRadius: RADII.s, borderWidth: 1, borderColor: t.c.line2, backgroundColor: t.c.surf, paddingHorizontal: 14 }]}
        />
        <SectionTitle>{S.profileSetup.color}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }} accessibilityRole="radiogroup">
          {SLOTS.map((s) => {
            const sel = s === slot;
            return (
              <Pressable
                key={s}
                onPress={() => setSlot(s)}
                accessibilityRole="radio"
                accessibilityState={{ checked: sel }}
                accessibilityLabel={PALETTE[s].name}
                style={{ alignItems: 'center', gap: 4, width: 72 }}
                testID={`swatch-${s}`}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: t.player(s),
                    borderWidth: sel ? 3 : 1,
                    borderColor: sel ? t.c.ink : t.c.line,
                  }}
                />
                <T v="callout" tone={sel ? 1 : 2} style={{ fontSize: 13 }}>
                  {PALETTE[s].name}
                </T>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 8 }}>
          <PlayerBadge slot={slot} initials={ini} size={44} ring />
          <T tone={2} style={{ flex: 1 }} testID="neighbor-rule">
            {S.profileSetup.neighborRule(colorName)}
          </T>
        </View>
        {error ? <T v="callout">{error}</T> : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
