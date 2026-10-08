# Native uygulamalar: ortak şartname

HexRun mobil istemcisi iki native uygulamadır: **iOS (Swift / SwiftUI)** ve **Android (Kotlin / Jetpack Compose)**,
ayrıca **watchOS** ve **Wear OS** eşlikçileri. Sunucu, API ve oyun kuralları değişmez (`apps/server`, `packages/core`).

## Tek doğruluk kaynakları

| Konu | Kaynak |
|---|---|
| Ekranlar, metin, renk, ölçü | Tasarım tuvali (26 artboard): `project/*.dc.html` |
| Arayüz metinleri | `shared/i18n/tr.ts` (birincil), `shared/i18n/en.ts` (İngilizce; native uygulamalara henüz taşınmadı) |
| API | `packages/contracts/src/index.ts` (tipler) ve `docs/API.md` (uç noktalar) |
| Oyun kuralları | `packages/core/src` ve `docs/GAME_RULES.md` |
| İstemci tarafı mantığın doğruluğu | `shared/test-vectors/*.json` — TypeScript motorundan üretilir (`npx tsx packages/core/scripts/vectors.ts`). Swift ve Kotlin testleri bu dosyaları okur ve **aynı** sonucu vermek zorundadır |

## İstemcide yeniden yazılan mantık (her iki dilde, vektörlerle test edilir)

- `geo`: haversine, destination, poligon alanı (`geo.json`)
- `LoopTracker`: halka kapanma (50/60 m, histerezis 100 m, asgari çevre 400/200 m), doğruluk > 50 m ve > 12 m/s sıçrama atma,
  duraklat/devam, HUD durumu (mesafe, süre, tempo, başlangıca uzaklık, `armed`, `closingMode` ≤ 300 m) (`loops.json`)
- H3: `cellOf`, `cellBoundary`, `cellsInPolygon` (res 12) — iOS'ta vendored Uber H3 C (`ios/HexRunKit/Sources/CH3`), Android'de `com.uber:h3` (`cells.json`)
- Biçimlendirme: `6,12` km, `5'23"`, `32:57` / `1:02:03`, `19.220`, `19.220 m²`, baş harfler (Türkçe büyük harf: `ş→Ş`, `i→İ`, `ı→I`) (`format.json`)
- Etkinlik pencereleri (Europe/Istanbul): Sabah 06–09, Blitz Cmt–Paz, Akşam 18–21; `eventWindow` sayaçları (`events.json`)
- Hat göstergesi segmentleri (`hat.json`), renk paleti ve komşu kuralı (`colors.json`)

Sunucu her zaman yetkilidir: istemci ham GPS noktalarını gönderir, halkaları sunucu yeniden hesaplar.

## Platform kararları

| Konu | iOS | Android |
|---|---|---|
| Asgari sürüm | iOS 17, watchOS 10 | minSdk 26, target/compileSdk 35, Wear OS 3 |
| UI | SwiftUI, Observation (`@Observable`) | Jetpack Compose, Material 3, ViewModel + StateFlow |
| Harita | MapLibre Native iOS (SPM `maplibre-gl-native-distribution`) | MapLibre Android (`org.maplibre.gl:android-sdk`) |
| Konum | CoreLocation, `allowsBackgroundLocationUpdates`, `CLBackgroundActivitySession` | Fused Location Provider + `foregroundServiceType="location"` |
| Giriş | Sign in with Apple (AuthenticationServices), Google Sign-In SDK, e-posta kodu | Credential Manager (Google), e-posta kodu |
| Jeton saklama | Keychain | EncryptedSharedPreferences / DataStore + Tink |
| Ağ | URLSession + Codable, async/await | OkHttp + kotlinx.serialization, coroutines |
| Çevrimdışı koşu kuyruğu | Dosyaya kalıcı kuyruk + `BGProcessingTask` | Room/DataStore kuyruğu + WorkManager |
| Push | APNs (`provider: "apns"`) | FCM (`provider: "fcm"`) |
| Haptik | UIImpactFeedbackGenerator / CoreHaptics | VibrationEffect / HapticFeedbackConstants |
| Paylaşım kartı | `ImageRenderer` + `ShareLink` | Compose → Bitmap + `ACTION_SEND` |
| Saat | watchOS (SwiftUI) + WatchConnectivity: canlı HUD, yaklaşma, düello halkası, fetih | Wear OS (Compose for Wear) + Data Layer API: aynı |
| Erişilebilirlik | Dynamic Type, VoiceOver, Reduce Motion | font ölçeği (sp), TalkBack, animasyon ölçeği |

## Sunucu sözleşmesindeki native ekleri

- `PUT /v1/me/push-token` gövdesi: `{ token, platform: "ios" | "android", provider?: "apns" | "fcm" | "expo" }`.
  `provider` yoksa: Expo biçimli jeton → `expo`, değilse iOS → `apns`, Android → `fcm`.
- Push yükünde `data.url` her zaman bir derin bağlantıdır (`hexrun://run?defend=<id>`, `hexrun://duel/revenge/<id>`, `hexrun://notifications`).
- Derin bağlantılar: `hexrun://` şeması + evrensel bağlantılar `https://hexrun.co/invite/<kod>`, `https://hexrun.co/r/...`.

## Derleme ve doğrulama

Bu geliştirme ortamında iOS SDK ve Android SDK yoktur. Doğrulama iki katmanlıdır:

1. Yerel: `ios/HexRunKit` (Swift paketi) Linux'ta `swift test` ile; `android/core` (saf Kotlin/JVM) `./gradlew :core:test` ile.
2. CI (`.github/workflows/native.yml`): macOS'ta XcodeGen + `xcodebuild test` (iOS simülatörü) ve watchOS derlemesi;
   Ubuntu'da Android `assembleDebug`, birim testleri, lint ve Wear OS derlemesi.

## Telefon ↔ saat protokolü (watchOS: WatchConnectivity, Wear OS: Wearable Data Layer)

Telefon koşuyu kaydeder (yetkili kaynak), saat canlı gösterir ve bilekte titreşir. Tüm yükler JSON nesnesidir
(watchOS'ta `[String: Any]` sözlüğü, Wear OS'ta UTF-8 JSON bayt dizisi).

| Yön | watchOS | Wear OS | Yük |
|---|---|---|---|
| Telefon → saat, sürekli durum (en son durum kazanır) | `updateApplicationContext` | `DataClient` `PutDataMapRequest("/hexrun/hud")`, anahtar `json` | `{"type":"hud","state":"idle"\|"running"\|"paused"\|"finished","distanceM":6120,"durationMs":1977000,"paceSecPerKm":323,"distToStartM":85,"armed":true,"closingMode":true,"events":["morning","blitz"],"duel":{"opponent":"Zeynep","coveredCells":40,"totalCells":48}\|null,"ts":1791300000000}` |
| Telefon → saat, anlık olay | `sendMessage` (ulaşılamazsa `transferUserInfo`) | `MessageClient` yol `/hexrun/event` | `{"type":"tick"}` (yaklaşma tık), `{"type":"conquest","cells":62,"areaM2":19220,"captured":48}`, `{"type":"loop_open"}` |
| Saat → telefon, komut | `sendMessage` | `MessageClient` yol `/hexrun/command` | `{"type":"command","action":"pause"\|"resume"\|"finish"}` (finish yalnız saatte 1,5 sn basılı tutunca) |

Saat yükleri sürüm alanı taşımaz; bilinmeyen alanlar yok sayılır, eksik alanlar varsayılan değer alır.
Saat ekranları: `s17-saat` artboard'u (her zaman koyu, tek büyük rakam; koşu, yaklaşma, düello halkası, fetih).
