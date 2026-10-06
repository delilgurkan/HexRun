# @hexrun/core

HexRun oyun kuralları motoru: saf, deterministik TypeScript. Telefon (HUD) ve sunucu (yetkili hesap) aynı kodu çalıştırır.
Kurallar ve kararlar: [docs/GAME_RULES.md](../../docs/GAME_RULES.md).

## React Native notu
`h3-js` yüklenirken `new TextDecoder('utf-16le')` çağırır; Hermes/Expo'nun yerleşik `TextDecoder`'ı yalnız UTF-8
destekler ve uygulama açılışta çöker. Mobil uygulama bunu `apps/mobile/src/lib/polyfills.ts` ile çözer (giriş
dosyasında ve Jest kurulumunda ilk yüklenen modül). Çekirdeği kullanan başka bir React Native istemcisi aynı
dolguyu ilk import olarak yüklemelidir.
