#!/usr/bin/env bash
# HexRun Android CI: çekirdek testleri (ortak vektörler), uygulama birim testleri (ViewModel +
# Robolectric/Compose), lint, telefon ve Wear OS hata ayıklama derlemeleri.
# GitHub ubuntu koşucularında Android SDK hazırdır (ANDROID_HOME); yerelde -PwithAndroid bayrağı
# Android modüllerini zorla ekler.
set -euo pipefail
cd "$(dirname "$0")"

# CI gizli değişkeninden Firebase yapılandırması (isteğe bağlı; yoksa push kapalı derlenir).
if [[ -n "${GOOGLE_SERVICES_JSON:-}" && ! -f app/google-services.json ]]; then
  printf '%s' "$GOOGLE_SERVICES_JSON" > app/google-services.json
fi

./gradlew --no-daemon --stacktrace -PwithAndroid \
  :core:test \
  :app:testDebugUnitTest \
  :app:lintDebug \
  :app:assembleDebug \
  :wear:testDebugUnitTest \
  :wear:assembleDebug
