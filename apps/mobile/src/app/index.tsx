import { Redirect } from 'expo-router';
import { useAuthStatus } from '../state/auth';
import { usePrefs } from '../state/prefs';
import { useRunState } from '../run/controller';

/** Giriş kapısı: onboarding → izinler → kayıt → profil → harita; yarım koşu varsa koşu modu. */
export default function Gate() {
  const status = useAuthStatus();
  const prefs = usePrefs((p) => p);
  const running = useRunState((s) => s.active);
  if (!prefs.loaded || status === 'loading') return null;
  if (running && status === 'signedIn') return <Redirect href="/run" />;
  if (!prefs.onboardingDone) return <Redirect href="/onboarding" />;
  if (!prefs.permissionsDone) return <Redirect href="/onboarding/permissions" />;
  if (status === 'signedOut') return <Redirect href="/auth" />;
  if (prefs.needsProfile) return <Redirect href="/auth/profile" />;
  return <Redirect href="/(tabs)" />;
}
