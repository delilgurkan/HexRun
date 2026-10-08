# HexRun mobil (Expo)

Koş. Halkayı kapat. Mahalleyi al. — iOS + Android uygulaması (Expo SDK 57, expo-router, TypeScript strict).

## Önemli: Expo Go yetmez

Uygulama yerel modüller kullanır: **MapLibre** (`@maplibre/maplibre-react-native`), **arka plan konum**
(`expo-location` + `expo-task-manager`), Apple ile giriş, bildirimler. Bunlar Expo Go'da yoktur;
bir **development build** gerekir.

```bash
# 1) Paylaşılan paketleri derle (apps/mobile bunları file: bağımlılığı olarak dist/'ten okur)
cd ../..            # repo kökü
npm ci
npm run build -w @hexrun/core && npm run build -w @hexrun/contracts

# 2) Mobil bağımlılıklar (apps/mobile kök workspace'lerin dışında, kendi node_modules'u var)
cd apps/mobile
npm ci
cp .env.example .env.local   # değerleri doldur

# 3a) Yerel dev build (Xcode / Android Studio gerekir)
npx expo run:ios      # ya da: npx expo run:android
# 3b) ya da EAS ile bulutta dev build, sonra:
npx eas-cli@latest build --profile development --platform ios
npm start             # expo start --dev-client
```

## Ortam değişkenleri (`EXPO_PUBLIC_*`, derleme anında gömülür)

| Değişken | Açıklama | Varsayılan |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | API tabanı (`/v1` istemcide eklenir) | `http://localhost:3000` |
| `EXPO_PUBLIC_MAP_STYLE_URL` | MapLibre stil adresi (açık tema) | OpenFreeMap `positron` |
| `EXPO_PUBLIC_MAP_STYLE_URL_DARK` | Koyu tema stili | OpenFreeMap `dark` |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` / `_ANDROID_` / `_WEB_` | Google OAuth istemci kimlikleri | boş → Google düğmesi uyarı verir |
| `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_PRIVACY_URL` | Yasal sayfalar | hexrun.co |
| `EAS_PROJECT_ID` | Expo push jetonu için proje kimliği (`app.config.ts` → `extra.eas.projectId`) | — |

## Komutlar

```bash
npm run typecheck   # tsc --noEmit (strict)
npm test            # jest-expo + @testing-library/react-native
npx expo-doctor
```

## EAS build / submit

`eas.json` profilleri: `development` (dev client, dahili dağıtım), `development-simulator`,
`preview` (dahili, staging API), `production` (mağaza, otomatik build numarası).
`eas-build-pre-install` betiği monorepo kökünde `@hexrun/core` ve `@hexrun/contracts`'ı derler
(dist/ git'te yok).

```bash
npx eas-cli@latest login
npx eas-cli@latest init                       # projectId'yi EAS_PROJECT_ID olarak ver
npx eas-cli@latest build --profile preview --platform all
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --profile production --platform ios      # eas.json → ascAppId
npx eas-cli@latest submit --profile production --platform android  # play service account JSON
```

Kimlik bilgileri: Apple ile giriş için Apple Developer'da *Sign in with Apple* yeteneği
(`ios.usesAppleSignIn`), Google için OAuth istemcileri, Android FCM için `google-services.json`
(EAS secret olarak) gerekir.

## Mimari

```
index.ts                 giriş: polyfill → arka plan konum görevi → expo-router
src/app/                 dosya tabanlı rotalar (ince; ekranlar src/screens/)
  (tabs)/                Harita · Lig · Takım · Etkinlik
  run/                   tam ekran koşu modu + özet (sekme çubuğu yok)
  region/[cell]          bölge sheet'i · duel/select, duel/[id] · profile/* · notifications · share/[runId]
src/screens/             ekranlar (testlerde doğrudan render edilir)
src/components/          Hat göstergesi, ikonlar (Tokens SVG yolları), düğmeler, çipler, iskeletler
src/theme/               token'lar (koyu/açık), tipografi, boşluk, köşe, hareket; Reduce Motion
src/map/                 MapLibre sarmalayıcı, petek GeoJSON (core `cellBoundary`)
src/run/                 RunSession (durum makinesi, kalıcı günlük), RunController, haptik, konum görevi
src/api/                 tipli fetch istemcisi (401 → tek yenileme), uçlar, react-query kancaları, çevrimdışı koşu kuyruğu
src/i18n/                tr (birincil), en
```

- Oyun mantığı `@hexrun/core`'dan: `LoopTracker`, `cellOf`, `cellBoundary`, `eventWindow`, `RULES`, biçimlendirme.
- Koşu: her GPS noktası günlüğe yazılır ve AsyncStorage'da saklanır; uygulama öldürülürse günlük
  `LoopTracker`'a yeniden oynatılır. Bitince `clientRunId` (UUID) ile kuyruğa girer; geçici hatalarda
  üstel geri çekilmeyle yeniden denenir, sunucu idempotent.
- Derin bağlantılar: `hexrun://run?defend=<duelId>`, `hexrun://duel/<id>`, `hexrun://friends?code=…`,
  `hexrun://integrations?connected=strava`.

## Bu ortamda doğrulanamayanlar

Simülatör/cihaz yok: harita çizimi, arka plan konum, haptik, Apple/Google girişi, push ve paylaşım
gerçek cihazda denenmeli. `expo export` ile iOS ve Android JS paketleri başarıyla derlendi.
