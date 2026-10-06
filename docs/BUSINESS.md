# HexRun — iş planı

> Not: Bu belgedeki fiyatlar ve hedefler **doğrulanması gereken varsayımlardır**; piyasa büyüklüğü gibi dış veriler
> uydurulmadı, `[VERİ]` ile işaretli yerler araştırmayla doldurulmalı.

## Problem ve vaat
Koşu uygulamaları geçmişi kaydeder ama "bugün neden koşayım?" sorusuna cevap vermez. HexRun her koşuya yerel bir amaç
verir: kendi mahalleni almak, komşunla düelloya girmek, toprağını korumak. Oyun haritanın kendisidir; rakipler
komşularındır.

## Hedef kitle (ilk 12 ay)
1. İstanbul'da haftada 2+ koşan, Strava/Garmin kullanan 20–40 yaş koşucular (Kadıköy, Beşiktaş, Ataşehir, Moda sahili ile başla).
2. Koşu kulüpleri ve kurumsal koşu toplulukları (takım ligi).
3. İkincil: yürüyüş yapanlar — kurallar yaya tempoyla çalışır.

Neden tek şehir, tek ilçe ile başlamak: oyunun değeri yoğunluktan gelir. Bir mahallede 50 aktif oyuncu, 50 şehirde birer
oyuncudan değerlidir. Lig bu yüzden ilçe düzeyindedir.

## Gelir modeli
**İlke: para ile toprak satın alınmaz (pay-to-win yok).** Rekabetin adil olması ürünün kendisidir.

| Akış | İçerik | Varsayım fiyat |
|---|---|---|
| HexRun Kulüp (abonelik) | Geçmiş haritalar ve sezon arşivi, gelişmiş istatistik (bölge ısı haritası, savunma analizi), ek paylaşım kartı tasarımları, profil temaları (yapılacak: ürün kodunda henüz yok) | aylık [₺ fiyat], yıllık [₺ fiyat] — fiyat testi A/B |
| Sponsorlu etkinlikler | Markalı haftalık etkinlik (ör. "Pazar sabahı Blitz"), ödüllü sezon finali; kurallar değişmez, ödül ve görünürlük satılır | etkinlik başına sabit ücret |
| Kulüp / kurum ligi (B2B) | Özel takım ligi, yönetim paneli, kurum içi sıralama | koltuk başına aylık |
| Belediye / spor kulübü ortaklıkları | Park çevresi halka rotaları, sağlıklı yaşam kampanyaları | proje bazlı |

Yapılacak (tasarımda da açık): aylık sezon — toprak sıfırlanmaz, aylık lig ödüllenir; sponsor ödülleri.

## Büyüme
- **Doğal döngü**: düello bildirimi ("Selin'le düello · 17 petek") rakibi uygulamaya geri çağırır; fetih kartı (harita/rota içermez) Instagram hikâyesine uygundur; davet kodu arkadaş + takım.
- **Tohumlama**: ilk ilçede 3–5 koşu kulübüyle lansman; kulüp başına takım ligi.
- **Strava/Garmin içe aktarma**: kullanıcı mevcut alışkanlığını bırakmadan başlar (telefonu evde bırakan da halka kapatır).
- **İlk gün deneyimi**: harita hiçbir zaman "veri yok" demez; yakındaki boş park çevresinde 2,1 km'lik ilk halka önerilir.

## Kuzey yıldızı ve metrikler
- Kuzey yıldızı: **haftalık sayılan halka sayısı** (aktif oyunun en dürüst ölçüsü).
- Aktivasyon: kayıttan sonra 7 gün içinde ilk halkayı kapatan oran.
- Tutunma: D7 / D30, haftalık en az 2 halka atan oyuncu oranı.
- Sosyal yoğunluk: en az bir rakibi olan oyuncu oranı; ilçe başına aktif oyuncu.
- Gelir: Kulüp dönüşümü, ARPPU, sponsor geliri / etkinlik.
Yönetim panelindeki `/v1/admin/metrics` DAU, WAU, günlük koşu, halka, inceleme kuyruğu ve aktif düelloyu verir; ürün analitiği (olay takibi) lansman öncesi eklenmeli (KVKK aydınlatmasıyla).

## Maliyet yapısı (başlangıç)
- Altyapı: 2× küçük API örneği + yönetilen PostgreSQL + statik site + harita karoları (MapLibre ile kendi barındırılan ya da ücretli karo sağlayıcı) — [aylık ₺ tahmini].
- Push: Expo (ücretsiz katman) → APNs/FCM.
- E-posta: işlemsel e-posta sağlayıcısı.
- Apple Developer (yıllık) + Google Play (tek sefer) hesapları.
- Hukuk: KVKK aydınlatma, kullanım koşulları, VERBİS değerlendirmesi.

## Rekabet ve fark
Bölge tabanlı koşu oyunları dünyada denendi [VERİ: rakip listesi ve durumları]. HexRun'un farkları: adil ve açık kurallar
(sabit petek, düello canı, günlük sınırlar, para ile toprak satılmaz), tasarımdan itibaren gizlilik (rota kimseye
görünmez, ev çevresi gizli), renk körlüğüne güvenli harita, yerel lig ve Türkçe-önce ürün.

## Riskler
| Risk | Önlem |
|---|---|
| Güvenlik (trafikte koşu, özel mülk) | Koşullar + uygulama içi uyarı; rota zorunlu değil |
| Hile (bisiklet, araç, sahte GPS) | Sunucu tarafı yeniden hesap, tempo/ışınlanma incelemesi, yönetici kuyruğu |
| Gizlilik (ev konumu, rutin) | Rotalar yalnız sahibine; gizlilik bölgesi; saatler akışta yuvarlanır; ham GPS 30 gün |
| Yoğunluk eşiği | İlçe ilçe büyüme, kulüp ortaklıkları |
| Pil tüketimi | Yalnız koşu sırasında konum; arka plan güncelleme aralığı ayarlı |

## 90 günlük plan
1. Hafta 1–4: kapalı beta (Kadıköy, 2 kulüp, ~100 oyuncu), TestFlight + Play iç test; kural dengesi verisi.
2. Hafta 5–8: Strava onayı, Garmin başvurusu, Kulüp aboneliği fiyat testi, mağaza listelemeleri.
3. Hafta 9–12: İstanbul Anadolu yakası açılışı, ilk sponsorlu etkinlik, sezon 1.
