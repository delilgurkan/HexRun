# Mimari

```
 iOS / Android (Expo)  ──HTTPS/JSON──▶  API (Fastify, durumsuz, N örnek)  ──▶  PostgreSQL 16
   LoopTracker (core)                      core motoru (aynı kod)                 petek, düello, koşu…
   çevrimdışı kuyruk                       zamanlanmış işler (tek örnek kilidi)
                                           push ──▶ Expo ──▶ APNs / FCM
 hexrun.co (statik)  ──▶ /v1/waitlist      Strava / saat adaptörü ──▶ web kancaları
 /admin (statik)     ──▶ /v1/admin/*
```

## Tek kural kaynağı

`@hexrun/core` hem telefonda (HUD: mesafe, tempo, "85 m · halkayı kapat", önizleme) hem sunucuda (yetkili hesap)
çalışır. Telefon koşunun ham GPS noktalarını gönderir; sunucu halkaları **yeniden** tespit eder, hile kontrolünden
geçirir ve kuralları uygular. Böylece istemci hiçbir oyun sonucunu dikte edemez.

## Veri modeli (özet)

- `cells` — H3 res-12 petek (≈307 m²): sahip, güç, erime sayaçları, `parent7` (harita sorgusu), `lock_region` (res-5 kilit bölgesi).
- `duels` — saldırgan, sahip, sabit petek listesi, ilerleme, günlük sayaçlar, `defender_visible_at` (sahip ilk sayılan halkadan sonra görür; Şafak Akıncısı ile 2 sa gecikmeli).
- `runs` / `loops` — koşu, halkalar, inceleme durumu; ham GPS 30 gün sonra silinir.
- `cell_events` — tarihçe (bölge sayfası) ve hayalet segment (son 7 günde eriyen güç).
- `player_stats`, `badges_earned`, `run_days`, `area_gains` — istatistik, rozet, seri, lig.
- `notifications` — uygulama içi + push kuyruğu (günde en çok 3 push).
- `teams`, `friendships`, `feed_items`, `claps`, `integrations`, `waitlist`.

PostGIS gerekmez: mekânsal indeksleme H3 ebeveyn hücreleriyle yapılır.

## Eşzamanlılık

Oyun durumunu değiştiren her işlem (halka, düello açma, zamanlayıcı) ilgili **res-5 bölgelerinin** danışma
kilitlerini (`pg_advisory_xact_lock`) **sıralı** alır; böylece aynı mahalledeki işlemler sıraya girer, farklı
mahalleler paralel çalışır ve kilitlenme oluşmaz. Kilit sonrası düellolar yeniden okunur; ölümcül kilitlenme ya da
serileştirme hatasında işlem otomatik yeniden denenir. Koşu gönderimi kullanıcı başına ayrıca serileştirilir ve
`clientRunId` ile idempotenttir (aynı koşu iki kez işlenmez — eşzamanlı çift gönderim testle doğrulandı).

## Zamanlanmış işler

`apps/server/src/jobs.ts`: push gönderimi (30 sn), erime/düello zamanlayıcısı (5 dk, idempotent: kaçırılan günler
toplu uygulanır), etkinlik hatırlatmaları, erime uyarıları, lig anlık görüntüsü, saklama/temizlik. Her iş
`pg_try_advisory_lock` ile birden çok örnekte yalnız bir kez çalışır.

## Ölçekleme

- API durumsuzdur; yatay ölçeklenir. Harita tabanı (görüntüleyenden bağımsız petek verisi) süreç içinde 5 sn
  önbelleğe alınır ve aynı süreçteki yazmalarla anında geçersizleşir (diğer örneklerde en çok 5 sn gecikme).
- Ölçülen (tek çekirdek, bkz. TESTING.md): tipik ekran haritası ≈90 istek/sn, koşu gönderimi ≈370 istek/sn.
- Bir sonraki adımlar: harita için Redis tabanlı paylaşımlı önbellek; lig sorguları için materyalize görünüm;
  `cell_events` için zaman bölümlemesi; okuma replikası.

## Bilinen sınırlamalar / yol haritası

- Lig bölgeleri ilçe merkezine en yakın eşleme ile belirlenir (≤ 8 km). İlçe sınır poligonları eklenmeli.
- Garmin, Coros, Suunto, Polar iş ortağı programları onay gerektirir; sunucu imzalı web kancası ve hesap bağlama
  uçlarıyla hazırdır, sağlayıcı adaptörü (ayrı küçük servis) onaydan sonra yazılır. Strava tam uygulanmıştır.
- Düello rotası "park içi" uyarısı (tasarım 16-C) harita verisi gerektirir; istemci tarafında MapLibre katmanlarından
  hesaplanabilir — yol haritasında.
