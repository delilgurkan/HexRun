# HexRun

**Koş. Halkayı kapat. Mahalleyi al.**

HexRun, koşuyu bir bölge oyununa çeviren bir mobil uygulamadır. Şehir sabit altıgen peteklere (H3) bölünür.
Koşuya başladığın noktaya 50 m yaklaşınca halka kapanır ve halkanın içindeki boş petekler senin renginle boyanır.
Rakiplerin peteklerini düelloyla alırsın; halka atmayı bırakırsan güç erir.

Bu depo ürünün tamamını içerir:

| Klasör | İçerik | Test |
|---|---|---|
| `packages/core` | Oyun kuralları motoru (saf TypeScript): halka tespiti, petekler, düello, erime, etkinlik çarpanları, nişanlar, renk kuralı, hile kontrolü, seri, içe aktarma | 76 birim + özellik tabanlı test, %100 satır kapsamı |
| `packages/contracts` | REST API sözleşmesi (istek/yanıt tipleri), sunucu ve mobil ortak | tip denetimi |
| `apps/server` | API sunucusu: Fastify 5 + PostgreSQL 16, JWT, Apple/Google/e-posta girişi, zamanlanmış işler, push, Strava + saat web kancaları, yönetim | 60 entegrasyon testi gerçek PostgreSQL üzerinde, %95 satır kapsamı, yük testi |
| `apps/mobile` | iOS + Android uygulaması (Expo / React Native, MapLibre, arka plan konumu) | Jest + tip denetimi |
| `apps/web` | hexrun.co tanıtım sitesi (TR/EN), KVKK/GDPR metinleri, evrensel bağlantılar, inceleme yönetim paneli | 52 Playwright testi (erişilebilirlik, bağlantılar, formlar) |
| `docs/` | Mimari, API, kural yorumları, iş planı, lansman listesi, test raporu | — |

## Hızlı başlangıç

```bash
# Gereken: Node 22, PostgreSQL 16 (ya da Docker)
npm ci
npm run build -w @hexrun/core && npm run build -w @hexrun/contracts

# Veritabanı + API (Docker ile)
docker compose up --build            # http://localhost:8080/health

# ya da yerel PostgreSQL ile
createdb hexrun && createdb hexrun_test
DATABASE_URL=postgres://localhost/hexrun npm run dev -w @hexrun/server
DATABASE_URL=postgres://localhost/hexrun npm run seed -w @hexrun/server   # Kadıköy'de 8 örnek oyuncu
```

Geliştirmede e-posta kodu yanıtta `devCode` olarak döner (üretimde dönmez).

## Testler

```bash
npm test -w @hexrun/core                                  # kurallar
TEST_DATABASE_URL=postgres://hexrun:hexrun@localhost:5432/hexrun_test npm test -w @hexrun/server
npm run load -w @hexrun/server                            # yük testi
(cd apps/web && npm test)                                 # site
(cd apps/mobile && npx tsc --noEmit && npm test)          # mobil
```

Ayrıntılar ve son sonuçlar: [docs/TESTING.md](docs/TESTING.md).

## Belgeler

- [Mimari](docs/ARCHITECTURE.md) — bileşenler, veri modeli, eşzamanlılık, ölçekleme
- [API](docs/API.md) — uç noktalar
- [Oyun kuralları ve uygulama kararları](docs/GAME_RULES.md)
- [İş planı](docs/BUSINESS.md) — gelir modeli, büyüme, metrikler, maliyet
- [Lansman listesi](docs/LAUNCH.md) — mağaza, hukuk, altyapı
- [Güvenlik ve gizlilik](docs/SECURITY.md)
