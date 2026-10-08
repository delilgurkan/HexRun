# Test raporu

Son çalıştırma: tümü geçti.

| Katman | Komut | Sonuç |
|---|---|---|
| Oyun motoru | `npm test -w @hexrun/core` | 78 test (özellik tabanlı fast-check dahil: 300 rastgele eylem dizisi), %100 satır / %96 dal kapsamı |
| API sunucusu | `npm test -w @hexrun/server` (gerçek PostgreSQL 16) | 68 entegrasyon testi, %97 satır kapsamı |
| Mobil | `cd apps/mobile && npx tsc --noEmit && npm test` | tip denetimi temiz, 67 test (7 paket); `expo export` iOS + Android paketleri derleniyor |
| Web sitesi + yönetim | `cd apps/web && npm test` | html-validate temiz, 52 Playwright testi (axe erişilebilirlik açık/koyu, bağlantı taraması, 320 px taşma, formlar, yönetim akışları) |
| Bağımlılık güvenliği | `npm audit --omit=dev` | 0 açık |

## Neler test ediliyor
- **Kurallar**: halka tespiti (histerezis, 50/60 m, duraklatma, GPS gürültüsü), boş/kendi/rakip petek, günlük sınırlar, düello kapsaması (%80), fetih canı min(50, eski), diğer düelloların sıfırlanması, kuşatma eşikleri, savunma, erime ve idempotent zamanlayıcı, nişan etkileri ve tavanları, etkinlik pencereleri (İstanbul saati), renk kuralı, seri dondurma, içe aktarma tekrar tespiti, hile kontrolü. Tasarımdaki "kaç günde el değiştirir" tablosu motorla yeniden üretilir (bkz. GAME_RULES.md).
- **Sunucu, uçtan uca**: e-posta kodu / Apple / Google girişi, jeton döndürme ve çalıntı jeton tespiti; iki oyunculu tam senaryo (ilk halka → harita → düello → kuşatma uyarıları → savunma → fetih → erime → boşa düşme); inceleme kuyruğu ve yönetici onayı; gizlilik bölgesi; push günlük tavanı; lig, takım, arkadaş, akış, alkış; veri dışa aktarma ve hesap silme; Strava OAuth + web kancası + GPX gönderme; imzalı saat web kancası.
- **Eşzamanlılık**: 8 oyuncunun aynı anda üst üste binen halkaları (her petek tam bir kez alınır), aynı koşunun çift gönderimi, saldırı + savunma + zamanlayıcının aynı anda çalışması, iptal ile halka yarışı, paralel düello açma.
- **Bağımsız inceleme**: rakip gözle yapılan incelemenin 12 bulgusu düzeltildi; gerileme testleri `apps/server/test/review.test.ts` ve motor testlerinde.

## Yük testi (`npm run load -w @hexrun/server`, tek çekirdek, 60 oyuncu, ≈10.900 sahipli petek)

| Uç nokta | Verim | p50 | p99 | Hata |
|---|---|---|---|---|
| GET /v1/map, tipik ekran (≈1,2 km kare) | ≈90 istek/sn | 187 ms | 1,17 sn | 0 |
| GET /v1/map, en kötü durum (≈2,8 km kare, 10.900 petek) | ≈37 istek/sn | 496 ms | 1,6 sn | 0 |
| POST /v1/runs (halka + düello + rozet + bildirim, tek işlem) | ≈370 istek/sn | 21 ms | 239 ms | 0 |

Optimizasyon öncesi en kötü durum haritası p50 3,8 sn idi (görüntüleyenden bağımsız taban önbelleği + gzip ile düzeltildi).

## Doğrulanamayanlar (bu ortamda cihaz/simülatör yok)
Gerçek cihazda harita çizimi, arka plan GPS, haptik, Apple/Google giriş arayüzü, push teslimi ve paylaşım görüntüsü yakalama.
Lansman öncesi TestFlight ve Play iç test kanalında elle test planı: [LAUNCH.md](LAUNCH.md).
