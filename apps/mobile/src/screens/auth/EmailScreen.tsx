import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { errorText } from '../../api/errorText';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { T } from '../../components/Text';
import { S } from '../../i18n';
import { useServices } from '../../services';
import { completeSignIn } from '../../state/auth';
import { FONT, RADII, TARGET, useTheme } from '../../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** E-posta ile tek kullanımlık kod (şifresiz) giriş. */
export function EmailScreen() {
  const t = useTheme();
  const { api, ...services } = useServices();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const codeRef = useRef<TextInput>(null);

  const input = {
    minHeight: TARGET.min + 8,
    borderRadius: RADII.s,
    borderWidth: 1,
    borderColor: t.c.line2,
    backgroundColor: t.c.surf,
    color: t.c.ink,
    paddingHorizontal: 14,
    fontFamily: FONT.medium,
    fontSize: 17,
  } as const;

  const send = async () => {
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) {
      setError(S.auth.invalidEmail);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.auth.emailStart(e);
      setDevCode(r.devCode ?? null);
      if (r.devCode) setCode(r.devCode);
      setStep('code');
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.emailVerify(email.trim().toLowerCase(), code.trim());
      await completeSignIn({ api, ...services }, res);
      router.replace(res.needsProfile ? '/auth/profile' : '/');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        title={step === 'email' ? S.auth.emailTitle : S.auth.codeTitle}
        large
        onBack={step === 'code' ? () => setStep('email') : undefined}
        testID="email-auth"
        footer={
          step === 'email' ? (
            <Button big label={S.auth.sendCode} onPress={send} loading={busy} disabled={!email} testID="email-send" />
          ) : (
            <>
              <Button big label={S.auth.verify} onPress={verify} loading={busy} disabled={code.trim().length < 4} testID="email-verify" />
              <Button kind="ghost" label={S.auth.resend} onPress={send} style={{ borderWidth: 0 }} />
            </>
          )
        }
      >
        {step === 'email' ? (
          <View style={{ gap: 12 }}>
            <T tone={2}>{S.auth.emailBody}</T>
            <TextInput
              testID="email-input"
              value={email}
              onChangeText={setEmail}
              placeholder={S.auth.emailPlaceholder}
              placeholderTextColor={t.c.ink3}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={send}
              accessibilityLabel={S.auth.emailTitle}
              style={input}
            />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <T tone={2}>{S.auth.codeBody(email.trim())}</T>
            <TextInput
              ref={codeRef}
              testID="code-input"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              accessibilityLabel={S.auth.codeTitle}
              style={[input, { fontFamily: FONT.mono, fontSize: 28, letterSpacing: 10, textAlign: 'center' }]}
            />
            {devCode ? (
              <T v="data" tone={3}>
                {S.auth.devCode(devCode)}
              </T>
            ) : null}
          </View>
        )}
        {error ? (
          <T v="callout" accessibilityLiveRegion="assertive" testID="auth-error">
            {error}
          </T>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
