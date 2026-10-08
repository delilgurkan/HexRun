# HexRun iOS + watchOS (Swift / SwiftUI)

React Native uygulamasının (`apps/mobile`, yalnız referans) yerini alan native istemci.
Ortak şartname: `docs/NATIVE.md`.

```
ios/
├─ project.yml              XcodeGen spesifikasyonu (.xcodeproj git'e girmez)
├─ Config/*.xcconfig        API_BASE_URL, MAP_STYLE_URL(_DARK), GOOGLE_CLIENT_ID, APS_ENVIRONMENT
├─ HexRunKit/               Platformdan bağımsız Swift paketi (Linux'ta test edilir)
│  ├─ Sources/CH3           Uber H3 v4.5.0 (C, değiştirilmeden)
│  ├─ Sources/HexRunKit     geo, LoopTracker, H3, biçimlendirme, etkinlikler, palet, Hat, modeller,
│  │                        APIClient, RunSession, RunQueue, derin bağlantı, WatchPayload, görünüm modelleri
│  └─ Tests                 shared/test-vectors/*.json ile birebir testler + birim testleri
├─ HexRun/                  SwiftUI uygulaması (tema, ikonlar, MapLibre, ekranlar s01–s18)
│  ├─ Resources/Fonts       Archivo + IBM Plex Mono (Google Fonts, OFL)
│  └─ Tests                 HexRunTests (uygulama katmanı, sahte API)
├─ HexRunUITests/           XCUITest duman akışı (-uiTestMockAPI)
├─ HexRunWatch/             watchOS uygulaması (ayrı ekip; WatchConnectivity aynası)
└─ ci.sh                    CI giriş noktası
```

## Kurulum

```sh
brew install xcodegen
cd ios
xcodegen generate          # HexRun.xcodeproj
open HexRun.xcodeproj
```

Şemalar: **HexRun** (uygulama; test eylemi HexRunTests + HexRunUITests), **HexRunWatch** (saat uygulaması,
HexRun içine gömülür), **HexRunWatchTests**.

`HexRunKit` Xcode olmadan da test edilir:

```sh
cd ios/HexRunKit && swift test
# Linux (Docker): depo kökü bağlanmalı, vektörler ../../shared/test-vectors altında okunur
docker run --rm -v "$PWD/../..":/repo -w /repo/ios/HexRunKit swift:6.1-noble swift test
```

## Yapılandırma

`Config/Shared.xcconfig` varsayılanları taşır; gizli/ortama özgü değerler `Config/Local.xcconfig`
(git'e girmez, `#include?` ile okunur) ya da CI'da `xcodebuild ... KEY=değer` ile verilir.
xcconfig'te `//` yorum başlattığından URL'ler `https:/$()/...` biçiminde yazılır.

| Anahtar | Açıklama |
|---|---|
| `API_BASE_URL` | Sunucu (Debug: `http://localhost:8080`, Release: `https://api.hexrun.co`) |
| `MAP_STYLE_URL`, `MAP_STYLE_URL_DARK` | MapLibre stil JSON'u (varsayılan OpenFreeMap positron/dark) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_REVERSED_CLIENT_ID` | Google Sign-In iOS istemcisi ve URL şeması |
| `DEVELOPMENT_TEAM` | İmzalama takımı |
| `APS_ENVIRONMENT` | `development` / `production` (push entitlement) |

Değerler Info.plist'e (`API_BASE_URL`, `MAP_STYLE_URL`, `GIDClientID`) aktarılır ve `AppConfig` okur.

## İmzalama, yetenekler

Bundle kimlikleri: `co.hexrun.app`, `co.hexrun.app.watchkitapp`. App ID'de şunlar açılmalı:
Sign in with Apple, Push Notifications, Associated Domains (`applinks:hexrun.co`; sunucu
`https://hexrun.co/.well-known/apple-app-site-association` dosyasını `/invite/*`, `/r/*`, `/app/*` için sunmalı),
Background Modes (location, remote-notification, processing — Info.plist'te tanımlı).
Entitlements dosyası `project.yml` içinden üretilir.

## Push (APNs)

Apple Developer'da bir **APNs Auth Key (.p8)** oluşturun; Key ID, Team ID ve bundle kimliği sunucu
ortamına verilir (sunucu `provider: "apns"` jetonlarını doğrudan APNs'e gönderir). Uygulama izin verildiğinde
`PUT /v1/me/push-token {token, platform:"ios", provider:"apns"}` çağırır; bildirime dokunulunca
`data.url` derin bağlantısı açılır.

## Harita

MapLibre Native (SPM `maplibre-gl-native-distribution`). Petekler tek GeoJSON kaynağında; her `slot` için ayrı
dolgu katmanı (opaklık koyu 0,5 / açık 0,55), mürekkep kılıf, kuşatılan petekler `attackerSlot` renginde taralı
desen + 2 sn nefes alan kesikli kenar, hayalet (eriyen güç) soluk kesikli kenar. Stil URL'si açık/koyu temaya göre.

## Fontlar

`HexRun/Resources/Fonts` içindeki TTF'ler Google Fonts'tan (Archivo 400–900, IBM Plex Mono 400–600; OFL lisansları
yanında) gelir ve `UIAppFonts` ile kaydedilir. Font bulunamazsa `HXFont` sistem fontuna düşer.

## Saat

`HexRunWatch` WatchConnectivity ile telefondaki koşuyu aynalar (`docs/NATIVE.md` · Telefon ↔ saat protokolü;
yük kodlaması `HexRunKit/WatchPayload.swift`). Telefon tarafı `HexRun/Platform/WatchBridge.swift`.
Saatte bağımsız koşu kaydı kapsam dışıdır (koşu her zaman telefonda kaydedilir).

## CI

`ios/ci.sh`: XcodeGen → `swift test` (HexRunKit) → `xcodebuild test` (HexRun, ilk uygun iPhone simülatörü)
→ watchOS derleme → `xcodebuild test` (HexRunWatchTests, ilk uygun Apple Watch simülatörü). İmzalama kapalı
(`CODE_SIGNING_ALLOWED=NO`).

## TestFlight

```sh
xcodegen generate
xcodebuild -project HexRun.xcodeproj -scheme HexRun -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/HexRun.xcarchive \
  DEVELOPMENT_TEAM=XXXXXXXXXX archive
xcodebuild -exportArchive -archivePath build/HexRun.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/export   # method: app-store-connect
xcrun altool --upload-app -f build/export/HexRun.ipa -t ios --apiKey $ASC_KEY_ID --apiIssuer $ASC_ISSUER
```

fastlane taslağı (`ios/fastlane/Fastfile`):

```ruby
lane :beta do
  sh("cd .. && xcodegen generate")
  app_store_connect_api_key(key_id: ENV["ASC_KEY_ID"], issuer_id: ENV["ASC_ISSUER"], key_content: ENV["ASC_KEY"])
  match(type: "appstore", app_identifier: ["co.hexrun.app", "co.hexrun.app.watchkitapp"])
  increment_build_number(xcodeproj: "HexRun.xcodeproj", build_number: ENV["GITHUB_RUN_NUMBER"])
  build_app(project: "HexRun.xcodeproj", scheme: "HexRun", export_method: "app-store")
  upload_to_testflight(skip_waiting_for_build_processing: true)
end
```

## Test stratejisi

- `HexRunKit`: geo, halka (her `loops.json` vakası ve örnek), H3 (`cells.json`), biçimlendirme, etkinlikler
  (Europe/Istanbul), Hat, renk kuralı vektörleri; APIClient (URLProtocol saplaması, eşzamanlı 401 → tek yenileme,
  çıkış, ApiError), RunSession (durumlar, günlükten kurtarma, halka olayı), RunQueue (geri çekilme, idempotency,
  4xx bırakma, yeniden yükleme), WatchPayload, derin bağlantılar, görünüm modelleri (sahte sunucu `MockBackend`).
- `HexRunTests`: tema/ikon/font, GeoJSON, simüle koşu, paylaşım kartı çizimi.
- `HexRunUITests`: onboarding → e-posta girişi (sahte) → harita → koşu → özet.

## Bilinen eksikler

- Arayüz metinleri yalnız Türkçe (`HexRunKit/Support/Strings.swift`); İngilizce (`apps/mobile/src/i18n/en.ts`)
  String Catalog olarak eklenmeli.
