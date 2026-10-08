# Lansman listesi

## Hukuk ve şirket
- [ ] Şirket kuruluşu; site metinlerindeki `[ŞİRKET UNVANI]`, `[MERSİS NO]`, adres vb. yer tutucuları (`apps/web/site.config.json`).
- [ ] KVKK aydınlatma metni ve gizlilik politikasının avukat incelemesi; VERBİS kayıt yükümlülüğünün değerlendirilmesi.
- [ ] Kullanım koşulları, topluluk kuralları incelemesi; AB kullanıcıları için GDPR temsilcisi kararı.
- [ ] Marka araştırması: "HexRun" (tasarımda not: X'te eski bir hesap ve aynı adlı bir site var; mağaza adı "HexRun: Run & Claim").

## Altyapı
- [ ] Yönetilen PostgreSQL 16 (günlük yedek, PITR), API için 2+ örnek (`apps/server/Dockerfile`), TLS, `api.hexrun.co`.
- [ ] `.env.example`'daki üretim sırları (JWT_SECRET, HASH_SECRET, SMTP_URL, EXPO_ACCESS_TOKEN, GOOGLE_CLIENT_IDS).
- [ ] `ADMIN_EMAILS`; `/admin/` için ayrıca barındırıcıda erişim koruması (ör. Cloudflare Access).
- [ ] Hata izleme ve günlük toplama (sağlayıcı seçimi gizlilik politikasına yazılmalı).
- [ ] Harita karo sağlayıcısı ve stil (`EXPO_PUBLIC_MAP_STYLE_URL`).
- [ ] hexrun.co statik barındırma (`apps/web/dist`), evrensel bağlantı dosyalarında Apple Team ID ve Android SHA-256.

## Mağazalar
- [ ] Apple: Sign in with Apple yetkisi, arka plan konum gerekçesi (inceleme notunda oyunun koşu sırasında izi çizdiği açıklanmalı), hesap silme uygulama içinde (var), gizlilik etiketleri (konum, iletişim bilgisi, kullanım verisi).
- [ ] Google Play: arka plan konum beyanı + video, Data Safety formu, hesap silme sayfası (`/hesap-silme`, var), ön plan hizmeti türü "location".
- [ ] EAS Build / Submit profilleri (`apps/mobile/eas.json`), ekran görüntüleri (tasarım tuvalindeki ekranlardan), mağaza metinleri TR/EN.

## Entegrasyonlar
- [ ] Strava API uygulaması (geri çağırma: `/v1/integrations/strava/callback`), web kancası aboneliği.
- [ ] Garmin Connect Developer, Polar AccessLink, Suunto, Coros iş ortağı başvuruları; onay sonrası adaptör.

## Ürün
- [ ] Kapalı beta: kural dengesi (erime hızı, düello tavanları) gerçek veriyle gözden geçirilmeli.
- [ ] Analitik olayları (KVKK onayıyla) ve kuzey yıldızı panosu.
- [ ] Destek kanalı ve SSS.
