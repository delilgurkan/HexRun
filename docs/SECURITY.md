# Güvenlik ve gizlilik

- **Kimlik**: e-posta kodu (HMAC ile karma, 10 dk, 5 deneme, gönderim sınırı), Apple/Google kimlik jetonu (JWKS, hedef kitle ve yayıncı doğrulaması). Erişim jetonu HS256, 15 dk. Yenileme jetonları veritabanında SHA-256 karmasıyla saklanır, her kullanımda döner; eski jetonun tekrar kullanımı tüm oturum ailesini iptal eder (testle doğrulandı).
- **Yetki**: kullanıcı yalnız kendi koşusuna, düellosuna, bildirimine erişir; düellolar yalnız iki tarafa görünür (sahip ilk sayılan halkadan sonra). Yönetim uçları `admin` rolü ister.
- **Girdi doğrulama**: tüm gövdeler zod şemalarıyla; GPS noktaları aralık denetimli (en çok 60.000 nokta, 8 MB gövde).
- **Hız sınırları**: genel, giriş ve koşu uçlarında ayrı; anahtar istemci IP'si (`TRUST_PROXY_HOPS` kadar vekil atlanır). E-posta kodu deneme hakkı atomik düşülür.
- **Bağımsız inceleme**: rakip gözle yapılan kod incelemesinde bulunan 12 bulgu (gizlilik sızıntıları, düello yarışları, günlük sınır sıfırlama, hız sınırı atlatma vb.) düzeltildi; her biri için `apps/server/test/review.test.ts` ve motor testlerinde gerileme testi var.
- **Web kancaları**: Strava doğrulama jetonu; saat adaptörü HMAC-SHA256 imzası, sabit zamanlı karşılaştırma.
- **Gizlilik**: rotalar ve halkalar yalnız sahibine; gizlilik bölgesinde ev konumu saklanmaz (rastgele kaydırılmış merkez), petekler opak kimlikle "Gizli oyuncu"; paylaşım kartı harita/rota/rakip adı içermez; akışta saatler yuvarlanır; ham GPS 30 gün sonra silinir; hesap silme tüm kişisel veriyi siler ve petekleri boşa düşürür; veri dışa aktarma uç noktası.
- **Günlükler**: `authorization`, GPS noktaları ve yenileme jetonu günlüklerden çıkarılır.
- **Bağımlılıklar**: `npm audit --omit=dev` CI'da yüksek seviye açıkta başarısız olur (şu an 0 açık).
- **Üretim koruması**: varsayılan geliştirme sırlarıyla üretimde başlatma reddedilir.
