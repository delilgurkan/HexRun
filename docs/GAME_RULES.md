# Oyun kuralları ve uygulama kararları

Kaynak: tasarım tuvalindeki "Oyun kuralları" panosu. Sabitler `packages/core/src/constants.ts` içinde tek yerde.
Tasarımın açık bıraktığı ya da çeliştiği yerlerde verilen kararlar **kalın** işaretli.

## Petek ve halka
- H3 res-12 (≈307 m²). Halka, koşunun başladığı noktaya 50 m (Halka Ustası: 60 m) yaklaşınca kapanır; aynı koşuda her dönüş yeni halkadır.
- **Halkanın "kurulması" için** başlangıçtan en az 100 m uzaklaşmak ve en az 400 m (çaylak: 200 m) yol gerekir — başlangıçta oyalanmak halka sayılmaz.
- Halka içi = merkezi poligonun içinde kalan petekler.
- Boş → 10 güç (Öncü: 12), çarpan yok. Kendi → +10 (Sabah Avantajı 2x), günde petek başına en çok 2 halka, tavan 100. Rakip → kendi başına değişmez.

## Düello
- 7–60 bitişik petek, tek sahip. Saldırgan başına 3 aktif düello; bir petek aynı saldırganın tek düellosunda.
- Can = alanın (hâlâ sahibinde olan peteklerin) ortalama gücü − ilerleme.
- Sayılan halka: alanın ≥ %80'ini kapsar (gizli, gösterilmez). +10 ilerleme (Blitz 2x), aynı düelloya günde 2 (çaylak 14 gün: 3).
- **Savunma**: sahibin halkası alanın ≥ %80'ini kapsarsa (saldırıyla simetrik) ilerleme −10 (Akşam Savunması 1,5x), düello başına günde 2; ayrıca peteklerin gücü +10. Sonuç: can +20 (tasarımdaki "85 → 100, 60 → 50, can 25 → 50" örneği birebir tutar).
- Can 0 → alanın tamamı aynı halkada geçer; petek gücü min(50, eski güç). O peteklerdeki diğer düellolar sıfırlanır, hakları geri döner.
- İlk sayılan halka 48 saatte gelmezse düello silinir. Saldırgan 48 saat sayılan halka atmazsa ilerleme günde −10.
- Sahip düelloyu ilk sayılan halkadan sonra görür; başkaları hiç görmez.

## Erime
- Sahip bir petekte 24 saat halka atmazsa günde −5; 0'da petek boşa düşer ve düello alanlarından çıkar; alan 7'nin altına inerse düello kapanır.
- Zamanlayıcı idempotenttir; kaçırılan günler toplu uygulanır. Geç gelen (içe aktarılan) bir halka erime saatini geriye almaz.

## Simülasyon doğrulaması
Tasarımdaki "85 güçlü alan kaç günde el değiştirir?" tablosu motorla yeniden üretilir (`packages/core/test/engine.test.ts`):

| Senaryo | Tasarım | Motor |
|---|---|---|
| Sahip 2 · saldırgan 2 | düşmez | düşmez |
| Sahip 1 · saldırgan 2 | ~10 gün | 9–11 |
| Sahip 2 · çaylak 3 | ~10 gün | **8** (fetih, sahip o gün savunmadan önceki 3. halkada gelir; tablo gün sonunu yuvarlıyor) |
| Sahip 2 · saldırgan 2 · Blitz | ~3 hafta sonu | 3. hafta sonu |
| Sahip yok · saldırgan 1 | ~6 gün | 5–7 |
| Sahip yok · saldırgan 2 | ~4 gün | 3–5 |
| Kimse gelmiyor | ~18 gün | 17–18 |

## Etkinlikler
Sabah Avantajı 06–09 (güç kazanımı 2x), Hafta Sonu Blitz Cmt–Paz (saldırı 2x), Akşam Savunması 18–21 (geri itme 1,5x).
Her biri farklı hamleye uygulanır, toplanmaz. Saat dilimi Europe/Istanbul; çarpan halkanın kapandığı ana göre.

## Nişanlar
3 slot, günde 1 değişiklik, koşu sırasında değiştirilemez, takılı nişanlar rakiplere görünür.
**İlke "hiçbir nişan %20'den fazla etki vermez" esas alındı**; tasarımda "erime ½" yazan Sur nişanı bu yüzden erimeyi %20 yavaşlatır.
Saldırı çarpanı = min(2, etkinlik × (1 + saldırgan nişanı)) × (1 − savunan nişanı, en çok %20).

| Nişan | Etki |
|---|---|
| Halka Ustası | Halka 60 m'de kapanır |
| Öncü | Boş petek 12 güçle başlar |
| Elli Bin | İşaretçide altın çerçeve (görünüm) |
| Geri Alan | Son 7 günde kaybettiğin peteklerin yarısından fazlasını içeren düelloda +%20 |
| İlk Kalkan | Gelen düello hasarı −%10 |
| Sur | Erime %20 yavaş |
| Kale Bekçisi | Haftada bir, seçilen peteklere 24 saat −%20 hasar |
| Şafak Akıncısı | Düello bildirimi rakibe 2 saat geç gider |
| 7 Gün / 30 Gün (kolaylık, slot yok) | Ayda 1 / 2 kaçırılan gün seriyi bozmaz |

40 rozetin tam listesi: `packages/core/src/badges.ts`.

## Renk kuralı
8 renk körlüğüne güvenli slot (Okabe–Ito). Görüntüleyen kendini her zaman kendi renginde görür; komşu bölgeler aynı
renk ya da yasaklı çift (Zümrüt–Gül, Kehribar–Mercan, Zümrüt–Lacivert, Lacivert–Gül) olamaz. DSatur graf boyaması,
kayma oyuncu çiftine göre deterministik.

## Gizlilik, inceleme, içe aktarma
- Gizlilik bölgesi 200–800 m; ev konumu **saklanmaz**, yalnız en çok yarıçapın %40'ı kadar rastgele kaydırılmış merkez saklanır. Bölgedeki petekler başkalarına "Gizli oyuncu" olarak, opak kimlikle görünür; paylaşım kartına girmez.
- İnceleme: 400 m'lik kayan pencerede 2'30"/km'den hızlı tempo, ışınlanma (> 15 m/s sıçrama) ya da uzun GPS boşluğu. Harita değişmez; yönetici onaylayınca halka işlenir.
- İçe aktarma: aynı koşu (zaman örtüşmesi ≥ %60, mesafe ± %15) iki kaynaktan bir kez sayılır; 24 saatten eski koşu yalnız istatistiğe.
