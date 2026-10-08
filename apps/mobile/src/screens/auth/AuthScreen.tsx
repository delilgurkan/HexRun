import { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { router } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorText } from '../../api/errorText';
import { Button } from '../../components/Button';
import { HexTexture } from '../../components/Skeleton';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { ENV } from '../../lib/env';
import { useServices } from '../../services';
import { completeSignIn } from '../../state/auth';
import { FONT, GUTTER, RADII, useTheme } from '../../theme';

WebBrowser.maybeCompleteAuthSession();

function useGoogleSignIn(onIdToken: (t: string) => void) {
  const configured = !!(Platform.OS === 'ios' ? ENV.googleIosClientId : ENV.googleAndroidClientId) || !!ENV.googleWebClientId;
  const [request, response, prompt] = Google.useIdTokenAuthRequest({
    iosClientId: ENV.googleIosClientId || undefined,
    androidClientId: ENV.googleAndroidClientId || undefined,
    webClientId: ENV.googleWebClientId || undefined,
    clientId: ENV.googleWebClientId || 'unset',
  });
  useEffect(() => {
    if (response?.type === 'success') {
      const tok = response.params.id_token ?? response.authentication?.idToken;
      if (tok) onIdToken(tok);
    }
  }, [response, onIdToken]);
  return { ready: configured && !!request, prompt: () => (configured ? prompt() : Promise.resolve(null)), configured };
}

export function LegalText() {
  const open = (url: string) => void WebBrowser.openBrowserAsync(url).catch(() => undefined);
  return (
    <T v="callout" tone={2} align="center" style={{ fontSize: 13 }}>
      {S.auth.legalPre}
      <T v="callout" style={{ fontSize: 13, textDecorationLine: 'underline' }} accessibilityRole="link" onPress={() => open(ENV.termsUrl)}>
        {S.auth.terms}
      </T>
      {S.auth.legalMid}
      <T v="callout" style={{ fontSize: 13, textDecorationLine: 'underline' }} accessibilityRole="link" onPress={() => open(ENV.privacyUrl)}>
        {S.auth.privacy}
      </T>
      {S.auth.legalPost}
    </T>
  );
}

/** 02 · Kayıt / giriş: iOS'ta Apple, Android'de Google en üstte; e-posta kodu her yerde. */
export function AuthScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const services = useServices();
  const [busy, setBusy] = useState<null | 'apple' | 'google'>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const finish = async (fn: () => Promise<Parameters<typeof completeSignIn>[1]>) => {
    try {
      const res = await fn();
      await completeSignIn(services, res);
      router.replace(res.needsProfile ? '/auth/profile' : '/');
    } catch (e) {
      Alert.alert(S.common.genericError, errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const google = useGoogleSignIn((idToken) => void finish(() => services.api.auth.google(idToken)));

  const signInApple = async () => {
    setBusy('apple');
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!cred.identityToken) throw new Error('identityToken yok');
      const fullName = cred.fullName ? AppleAuthentication.formatFullName(cred.fullName) || undefined : undefined;
      await finish(() => services.api.auth.apple(cred.identityToken!, fullName));
    } catch (e) {
      setBusy(null);
      if ((e as { code?: string }).code !== 'ERR_REQUEST_CANCELED') Alert.alert(S.common.genericError);
    }
  };

  const signInGoogle = async () => {
    if (!google.configured) {
      Alert.alert(S.auth.googleMissing);
      return;
    }
    setBusy('google');
    const r = await google.prompt().catch(() => null);
    if (!r || r.type !== 'success') setBusy(null);
  };

  const appleBtn =
    Platform.OS === 'ios' && appleAvailable ? (
      <AppleAuthentication.AppleAuthenticationButton
        key="apple"
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={t.isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={RADII.cta}
        style={{ height: 56, width: '100%' }}
        onPress={signInApple}
      />
    ) : null;
  const googleBtn = (
    <Button
      key="google"
      big
      kind={Platform.OS === 'android' ? 'primary' : 'secondary'}
      label={S.auth.google}
      onPress={signInGoogle}
      loading={busy === 'google'}
      testID="auth-google"
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }} testID="auth">
      <HexTexture />
      <View style={{ flex: 1, paddingTop: insets.top + 48, paddingHorizontal: GUTTER, justifyContent: 'space-between', paddingBottom: insets.bottom + 16 }}>
        <View style={{ gap: 12 }}>
          <T v="display" weight={FONT.black} style={{ fontSize: 64, lineHeight: 66, letterSpacing: 1 }} accessibilityRole="header">
            hexrun
          </T>
          <T v="title2">{S.auth.tagline}</T>
        </View>
        <View style={{ gap: 12 }}>
          {Platform.OS === 'ios' ? [appleBtn, googleBtn] : [googleBtn]}
          <Button big kind="secondary" label={S.auth.email} onPress={() => router.push('/auth/email')} testID="auth-email" />
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
            <T v="callout" tone={2}>
              {S.auth.haveAccount}
            </T>
            <Button kind="ghost" label={S.auth.login} onPress={() => router.push('/auth/email')} style={{ borderWidth: 0, paddingHorizontal: 6 }} />
          </View>
          <LegalText />
        </View>
      </View>
    </View>
  );
}
