package co.hexrun.core.ui

/** Nişan bilgisi (rakip bölge sayfasında gösterilir). */
data class BadgeInsignia(val kind: String, val effect: String, val slot: Boolean, val counter: String)

data class Badge(val id: String, val name: String, val category: String, val how: String, val insignia: BadgeInsignia?)

/**
 * 40 rozetin istemci kataloğu (packages/core/src/badges.ts'den üretildi). Sunucu rozet
 * listesini zaten döner; bu katalog yalnız rakibin takılı nişanlarını adlandırmak içindir.
 */
object BadgeCatalog {
    val ALL: List<Badge> = listOf(
        Badge("ilk-halka", "İlk Halka", "halka", "İlk halkanı kapat", null),
        Badge("halka-ustasi", "Halka Ustası", "halka", "10 halka kapat", BadgeInsignia("kural", "Halka 50 m yerine 60 m'de kapanır", true, "Yok · alanı büyütmez")),
        Badge("halka-50", "Elli Halka", "halka", "50 halka kapat", null),
        Badge("halka-100", "Yüz Halka", "halka", "100 halka kapat", null),
        Badge("halka-500", "Halka Efsanesi", "halka", "500 halka kapat", null),
        Badge("oncu", "Öncü", "toprak", "100 boş petek al", BadgeInsignia("kesif", "Boş petekler 12 güçle başlar", true, "Yok")),
        Badge("toprak-10k", "On Bin", "toprak", "10.000 m² toprağa sahip ol", null),
        Badge("toprak-50k", "Elli Bin", "toprak", "Bir ara 50.000 m² toprağa sahip ol", BadgeInsignia("kimlik", "İşaretçinde altın çerçeve", true, "Yok · yalnız görünüm")),
        Badge("toprak-100k", "Yüz Bin", "toprak", "Bir ara 100.000 m² toprağa sahip ol", null),
        Badge("toprak-250k", "Çeyrek Milyon", "toprak", "Bir ara 250.000 m² toprağa sahip ol", null),
        Badge("genis-halka", "Geniş Halka", "halka", "Tek halkada 10.000 m² çevrele", null),
        Badge("dev-halka", "Dev Halka", "halka", "Tek halkada 30.000 m² çevrele", null),
        Badge("ilk-zafer", "İlk Zafer", "duello", "İlk düellonu kazan", null),
        Badge("akinci", "Akıncı", "duello", "5 düello kazan", null),
        Badge("fatih", "Fatih", "duello", "25 düello kazan", null),
        Badge("geri-alan", "Geri Alan", "duello", "Kaybettiğin petekleri 7 gün içinde geri al", BadgeInsignia("rovans", "Kaybettiği peteklere 7 gün +%20 saldırır", true, "İlk günlerde savunma halkası at")),
        Badge("ilk-kalkan", "İlk Kalkan", "savunma", "Bir saldırganı halkanla geri it", BadgeInsignia("savunma", "Düello hasarı −%10", true, "Bir halka fazla at")),
        Badge("sur", "Sur", "savunma", "10 kez geri it", BadgeInsignia("savunma", "Halka atmadığın günler güç %20 yavaş erir", true, "Daha uzun kuşat")),
        Badge("kale-bekcisi", "Kale Bekçisi", "savunma", "5 düelloyu toprak kaybetmeden atlat", BadgeInsignia("savunma", "Haftada 1 kez seçtiğin peteklere 24 sa kalkan (hasar −%20)", true, "Kalkan bitince saldır")),
        Badge("demir-kale", "Demir Kale", "savunma", "25 düelloyu toprak kaybetmeden atlat", null),
        Badge("seri-7", "7 Gün", "seri", "Bir hafta her gün koş", BadgeInsignia("kolaylik", "Ayda 1 kaçırılan gün affedilir", false, "Yok")),
        Badge("seri-30", "30 Gün", "seri", "30 gün üst üste koş", BadgeInsignia("kolaylik", "Ayda 2 kaçırılan gün affedilir", false, "Yok")),
        Badge("seri-100", "100 Gün", "seri", "100 gün üst üste koş", null),
        Badge("seri-365", "365 Gün", "seri", "Bir yıl her gün koş", null),
        Badge("erken-kus", "Erken Kuş", "zaman", "06:00 öncesi 10 koşu", null),
        Badge("safak-akincisi", "Şafak Akıncısı", "zaman", "Sabah Avantajı sırasında ilk fetih", BadgeInsignia("sinsilik", "Düello bildirimin rakibe 2 sa geç gider", true, "Bildirimleri açık tut")),
        Badge("gece-kusu", "Gece Kuşu", "zaman", "22:00 sonrası 10 koşu", null),
        Badge("blitz-ustasi", "Blitz Ustası", "zaman", "Hafta Sonu Blitz sırasında 10 saldırı", null),
        Badge("aksam-nobeti", "Akşam Nöbeti", "zaman", "Akşam Savunması sırasında 5 kez geri it", null),
        Badge("on-km", "On Km", "mesafe", "Tek koşuda 10 km", null),
        Badge("yari-maraton", "Yarı Maraton", "mesafe", "Tek koşuda 21,1 km", null),
        Badge("maraton", "Maraton", "mesafe", "Tek koşuda 42,2 km", null),
        Badge("aylik-100", "Ayda 100", "mesafe", "Bir ayda 100 km", null),
        Badge("toplam-500", "500 Km", "mesafe", "Toplam 500 km", null),
        Badge("toplam-1000", "1000 Km", "mesafe", "Toplam 1000 km", null),
        Badge("takim-oyuncusu", "Takım Oyuncusu", "sosyal", "Bir takıma katıl", null),
        Badge("mahalle-dostu", "Mahalle Dostu", "sosyal", "5 arkadaş edin", null),
        Badge("alkislanan", "Alkışlanan", "sosyal", "25 alkış al", null),
        Badge("bilekten", "Bilekten", "sosyal", "Saatinden ilk koşunu aktar", null),
        Badge("caylak-mezunu", "Çaylak Mezunu", "halka", "Çaylak dönemini 5 halkayla bitir", null),
    )

    val BY_ID: Map<String, Badge> = ALL.associateBy { it.id }
}
