# API v1

Taban: `https://api.hexrun.co` · JSON · `Authorization: Bearer <accessToken>` · tipler: `packages/contracts/src/index.ts`.
Hata gövdesi: `{"error": {"code": "...", "message": "Türkçe, kullanıcıya gösterilebilir"}}`.
Erişim jetonu 15 dk; yenileme jetonu 60 gün, her kullanımda döner (eski jeton tekrar gelirse tüm oturum ailesi iptal edilir).

| Yöntem | Yol | Açıklama |
|---|---|---|
| POST | /v1/auth/email/start · /v1/auth/email/verify | 6 haneli kod (10 dk, 5 deneme, dakikada 1, saatte 5) |
| POST | /v1/auth/apple · /v1/auth/google | Kimlik jetonu doğrulama (JWKS); doğrulanmış e-posta mevcut hesaba bağlanır |
| POST | /v1/auth/refresh · /v1/auth/logout | Jeton döndürme / iptal |
| GET/PATCH/DELETE | /v1/me | Profil; silme petekleri boşa düşürür ve tüm veriyi siler |
| GET | /v1/me/export | KVKK/GDPR veri dışa aktarma |
| GET | /v1/usernames/:name | Uygunluk (Türkçe karakterler sadeleştirilir) |
| PUT | /v1/me/privacy · /v1/me/push-token · /v1/me/activity | Gizlilik bölgesi, push jetonu, "koşuyor" durumu |
| GET | /v1/me/stats · /v1/me/badges | İstatistik, 40 rozet + en yakın 3 |
| PUT/POST | /v1/me/insignia · /v1/me/shield | Nişan slotları, Kale Bekçisi kalkanı |
| GET | /v1/map?bbox= | Petekler (görüntüleyene göre renk, düello, hayalet), oyuncular, etkinlikler (≤ 6 km) |
| GET | /v1/map/region?cell= · /v1/map/first-loop?lat=&lng= | Bölge sheet'i, ilk halka önerisi |
| POST | /v1/runs | Koşu gönder (idempotent `clientRunId`) → özet |
| GET | /v1/runs · /v1/runs/:id · /v1/runs/:id/share | Geçmiş, özet, paylaşım kartı |
| POST | /v1/runs/:id/note | İncelemeye bilgi ekle |
| POST | /v1/duels/preview · /v1/duels | Seçim doğrulama · düello başlat |
| GET/DELETE | /v1/duels · /v1/duels/:id | Liste, ayrıntı, vazgeç |
| GET | /v1/league?scope=individual\|team&period=week\|month\|all | Yerel lig |
| GET/POST | /v1/teams/mine · /v1/teams/:id · /v1/teams · /v1/teams/join · /v1/teams/leave | Takım |
| GET/POST/DELETE | /v1/friends · /v1/friends/accept · /v1/friends/:id | Arkadaşlar (davet kodu) |
| GET/POST | /v1/feed · /v1/feed/:id/clap | Arkadaş akışı, alkış (aç/kapa) |
| GET/POST | /v1/notifications · /v1/notifications/read | Bildirim merkezi (filter=all\|siege\|region\|team) |
| GET/POST | /v1/events · /v1/events/:id/remind | Etkinlikler, hatırlatma |
| GET/POST/PATCH/DELETE | /v1/integrations[/:provider[/connect]] | Saat ve uygulamalar |
| GET/POST | /v1/integrations/strava/callback · /webhook | Strava OAuth ve web kancası |
| POST | /v1/integrations/:provider/webhook · /link | İmzalı (HMAC-SHA256, `X-HexRun-Signature`) saat adaptörü |
| POST | /v1/waitlist | Web sitesi bekleme listesi |
| GET/POST | /v1/admin/reviews · /v1/admin/reviews/:loopId · /v1/admin/metrics | Yönetim (admin rolü) |
| GET | /health · /ready | Canlılık / hazırlık |

Hız sınırları: genel 300/dk, giriş uçları 10/dk, koşu gönderimi 30/dk (ortam değişkenleriyle ayarlanır).
