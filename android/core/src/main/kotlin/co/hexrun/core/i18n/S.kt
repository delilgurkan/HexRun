package co.hexrun.core.i18n

/**
 * Türkçe arayüz metinleri (birincil dil) — shared/i18n/tr.ts ile birebir.
 * Parametreli metinler fonksiyondur. Tasarım panolarındaki metinlerle aynıdır.
 */
object S {
    object common {
        const val continue_ = "Devam"
        const val skip = "Geç"
        const val back = "Geri"
        const val close = "Kapat"
        const val done = "Tamam"
        const val cancel = "Vazgeç"
        const val retry = "Tekrar dene"
        const val notNow = "Şimdi değil"
        const val loading = "Yükleniyor…"
        const val save = "Kaydet"
        const val you = "Sen"
        const val today = "Bugün"
        const val yesterday = "Dün"
        const val thisWeek = "Bu hafta"
        const val earlier = "Daha önce"
        fun cells(n: Int) = "$n petek"
        const val power = "Güç"
        const val area = "Alan"
        const val distance = "Mesafe"
        const val pace = "Tempo"
        const val time = "Süre"
        fun streakDays(n: Int) = "$n gün"
        fun errorCode(code: String) = "Hata kodu: $code"
        const val genericError = "Bir şeyler ters gitti. Tekrar dene."
        const val offline = "Çevrimdışısın"
        const val soon = "Yakında"
    }

    object tabs {
        const val map = "Harita"
        const val league = "Lig"
        const val team = "Takım"
        const val events = "Etkinlik"
    }

    data class OnboardingPage(val kicker: String, val title: String, val body: String)

    object onboarding {
        val pages = listOf(
            OnboardingPage("1 / 3 · Koş", "Koş.", "Telefon cebinde, GPS izini çizer. Hedef tempo yok, zorunlu rota yok; sokaklar senin."),
            OnboardingPage("2 / 3 · Halkayı kapat", "Halkayı kapat.", "Başladığın yere 50 m yaklaştığında halka kapanır. Kapanmazsa koşu yine kaydedilir, sadece toprak gelmez."),
            OnboardingPage("3 / 3 · Bölgeyi fethet", "Fethet.", "Halkanın içi senin renginle boyanır. Halka atmayı bırakırsan güç erir; rakipler kendi halkalarıyla kuşatır."),
        )
        const val start = "BAŞLAYALIM"
    }

    object permissions {
        const val title = "İki izin, tek sebep: oyun."
        const val body = "Konumunu yalnızca koşu sırasında kaydederiz. Haritada izin değil, sadece kazandığın petekler görünür."
        const val location = "Konum"
        const val locationWhy = "Ekran kapalıyken de izini çizmek ve halkanın kapandığını anlamak için."
        const val locationGrantedAlways = "Verildi · Uygulamayı kullanırken + arka plan"
        const val locationGrantedWhenInUse = "Verildi · Uygulamayı kullanırken"
        const val locationDenied = "Verilmedi · Koşu kilitli kalır"
        const val locationAsk = "Konuma izin ver"
        const val backgroundAsk = "Arka planda da izin ver"
        const val backgroundWhy = "Android'de arka plan konumu ayrı sorulur: ayarlarda \"Her zaman izin ver\"i seç."
        const val openSettings = "Ayarları aç"
        const val notifications = "Bildirimler"
        const val notificationsWhy = "Bölgen kuşatıldığında ya da el değiştirdiğinde haber verelim. Günde en çok 3."
        const val notificationsAsk = "Bildirimlere izin ver"
        const val notificationsGranted = "Verildi"
        const val later = "Şimdilik geç"
    }

    object auth {
        const val tagline = "Mahalle seni bekliyor."
        fun social(region: String, n: String) = "$region'de bu hafta $n koşucu toprak aldı."
        const val google = "Google ile devam et"
        const val email = "E-posta ile devam et"
        const val haveAccount = "Hesabın var mı?"
        const val login = "Giriş yap"
        const val legalPre = "Devam ederek "
        const val terms = "Kullanım Koşulları"
        const val legalMid = "'nı ve "
        const val privacy = "Gizlilik Politikası"
        const val legalPost = "'nı kabul edersin."
        const val emailTitle = "E-posta adresin"
        const val emailBody = "Sana 6 haneli bir giriş kodu göndereceğiz. Şifre yok."
        const val emailPlaceholder = "ad@ornek.com"
        const val sendCode = "Kodu gönder"
        const val codeTitle = "Kodu gir"
        fun codeBody(email: String) = "$email adresine gönderdiğimiz 6 haneli kodu yaz."
        const val verify = "Doğrula"
        const val resend = "Kodu tekrar gönder"
        const val invalidEmail = "Geçerli bir e-posta adresi yaz."
        fun devCode(code: String) = "Geliştirme kodu: $code"
        const val googleMissing = "Google girişi için istemci kimliği tanımlı değil."
        const val googleNoAccount = "Bu cihazda Google hesabı bulunamadı."
    }

    object profileSetup {
        const val title = "Haritada nasıl görüneceksin?"
        const val username = "Kullanıcı adı"
        const val available = "Uygun · Lig ve haritada bu adla görünürsün"
        const val taken = "Bu ad alınmış"
        const val invalid = "3–20 karakter: küçük harf, rakam, alt çizgi"
        const val reserved = "Bu ad kullanılamaz"
        const val checking = "Kontrol ediliyor…"
        const val displayName = "Görünen ad"
        const val color = "İmza rengi"
        fun neighborRule(name: String) =
            "Kendini hep $name görürsün. Komşun da $name seçtiyse onu haritanda başka renkte görürsün; renkler hiç karışmaz."
        const val submit = "HARİTAYA GEÇ"
    }

    object map {
        const val start = "KOŞUYA BAŞLA"
        /** Android: Extended FAB metni (tasarım). */
        const val startFab = "Koşuya başla"
        const val startA11y = "Koşuya başla"
        const val locating = "Konum bulunuyor…"
        const val loadingRegions = "Bölgeler yükleniyor"
        fun eventsChip(n: Int) = "$n etkinlik"
        fun attackersA11y(n: Int) = "Son 48 saatte sana $n kişi saldırdı"
        fun streakChip(n: Int) = "$n gün"
        fun bellA11y(n: Int) = if (n > 0) "Bildirimler, $n okunmamış" else "Bildirimler"
        const val avatarA11y = "Profil"
        const val myLocation = "Konumum"
        const val offlineTitle = "Çevrimdışısın"
        fun offlineBody(min: Int) = "Harita $min dk önceki hali. Koşun kaydedilir, fetih bağlanınca hesaplanır."
        const val firstLoopTag = "İlk halkan"
        fun firstLoopMeta(km: String, m2: String) = "$km km · ≈ $m2"
        const val firstDay = "İlk gün"
        const val firstLoopTitle = "Buradaki petekler boş"
        fun firstLoopBody(km: String) = "Çevresinde $km km koş, başladığın yere dön. Halka kapanınca içi senin renginle boyanır."
        val firstLoopSteps = listOf("Başla", "Geri dön", "Fethet")
        const val firstLoopCta = "BU HALKAYLA BAŞLA"
        const val ownRoute = "Kendi rotamla koşacağım"
        const val runLocked = "Konum izni yok · koşu kilitli"
        const val runLockedBody = "Koşu için konum izni gerekiyor. Ayarlardan açabilirsin."
        fun siegeBanner(name: String) = "$name'le düello"
        fun siegeBannerBody(name: String, time: String, loops: Int) = "$name $time'de halka kapattı · $loops halka daha"
        const val defend = "Savun"
        const val hiddenPlayer = "Gizli oyuncu"
        fun playerA11y(name: String, cells: Int) = "$name, $cells petek"
    }

    object region {
        fun title(name: String) = "$name'in alanı"
        const val myTitle = "Senin alanın"
        const val emptyTitle = "Sahipsiz petekler"
        fun meta(cells: Int, area: String) = "$cells petek · $area"
        fun ownerSince(days: Int, team: String?) = "Sahip · $days gündür${if (team != null) " · $team" else ""}"
        fun duelHp(hp: Int, cells: Int) = "Düello canı $hp · alan $cells petek"
        fun loopsToCapture(n: Int, event: String?) = if (event != null) "$event ile $n halka" else "$n halka"
        const val area = "Alan"
        const val ownership = "Sahiplik"
        fun ownershipDays(n: Int) = "$n gün"
        const val lastDefense = "Son savunma"
        const val never = "Henüz yok"
        fun privateDuel(name: String) = "Düellon yalnız sen ve $name görür"
        const val incoming = "Bu alandaki düellolar"
        const val history = "El değiştirme"
        fun insignia(name: String) = "$name'in nişanları"
        const val startDuel = "Düello başlat"
        const val runHere = "Burada koş"
        const val loopHere = "Burada halka kapat"
        fun loopHereBoost(label: String) = "Burada halka kapat · $label"
        const val slotsFull = "Düello hakkın dolu (3/3)"
        const val hidden = "Bu petekler bir gizlilik bölgesinde."
        fun eventUntil(time: String) = "$time'a kadar"
    }

    object run {
        const val gpsStrong = "GPS güçlü"
        const val gpsWeak = "GPS zayıf"
        const val gpsSearching = "GPS aranıyor"
        fun toStart(d: String) = "Başlangıca $d · halka açık"
        const val distanceKm = "Mesafe · km"
        const val pacePerKm = "Tempo · /km"
        const val time = "Süre"
        const val pause = "DURAKLAT"
        const val resume = "DEVAM"
        const val finish = "BİTİR"
        const val holdHint = "basılı tut"
        const val paused = "Duraklatıldı"
        const val lockA11y = "Ekranı kilitle"
        const val unlockHint = "Kilidi açmak için basılı tut"
        const val locked = "Kilitli"
        fun closingLeft(m: Int) = "$m m"
        const val closingCta = "halkayı kapat"
        fun closingCells(n: Int) = "$n petek"
        fun closingPreview(empty: Int) = "Kapanınca $empty boş petek senin."
        fun duelCoverage(name: String, inside: Int, total: Int) = "Düello alanı · $name $inside/$total petek"
        fun voiceClosing(m: Int) = "$m metre, halkayı kapat"
        fun defending(name: String) = "Savunma · $name"
        const val noPermission = "Konum izni yok"
        const val recovered = "Yarım kalan koşun geri yüklendi"
        const val notificationTitle = "Koşu sürüyor"
        fun notificationBody(km: String, time: String) = "$km km · $time · Bitirmek için uygulamayı aç."
        const val notificationChannel = "Koşu"
        const val finishConfirm = "Koşuyu bitirmek istiyor musun?"
    }

    object conquest {
        const val closed = "HALKA KAPANDI"
        const val conquered = "FETHEDİLDİ"
        fun title(time: String, events: String?) = "Fetih · $time${if (events != null) " · $events" else ""}"
        fun headline(total: Int, empty: Int, own: Int) =
            "$total petek senin: $empty'${TrGrammar.possessive(empty)} boştu${if (own > 0) ", $own tanesi güçlendi" else ""}."
        fun duelLine(name: String) = "$name'le düello"
        fun newCells(n: Int) = "$n yeni petek"
        fun reinforced(n: Int) = "$n güçlendi"
        fun covered(inside: Int, total: Int) = "$inside/$total alan kapsandı"
        const val serverNote = "Kesin sonuç koşu bitince hesaplanır."
        const val continue_ = "KOŞUYA DEVAM"
        const val finish = "BİTİR"
    }

    object summary {
        const val done = "Bitti"
        fun closedHead(cells: Int, duel: Int) = if (duel > 0) "$cells petek senin, $duel'${TrGrammar.possessive(duel)} düelloyla" else "$cells petek senin"
        const val gained = "Kazanılan alan"
        fun newBadge(name: String) = "Yeni rozet: $name"
        fun duelWon(name: String) = "$name'le düelloyu kazandın"
        fun duelWonBody(cells: Int) = "$cells petek 50 güçle senin"
        fun streak(n: Int) = "seri $n gün"
        fun openTag(m: Int) = "$m m eksik"
        const val openTitle = "Halka açık kaldı"
        const val openBody = "Koşun kaydedildi. Toprak için başlangıca 50 m yaklaşman gerekiyordu."
        const val openNoChange = "Halka olmadan haritada bir şey değişmez"
        const val openNoChangeSub = "Geçtiğin petekler etkilenmedi"
        fun monthDistance(month: String) = "$month mesafesi"
        const val streakLabel = "Seri"
        fun makeLoop(m: Int) = "Bu rotayı halka yap · +$m m"
        const val suggestionTag = "Öneri"
        fun suggestionTitle(name: String) = "$name'in alanından geçtin"
        fun suggestionBody(name: String, cells: Int) =
            "Bu halka $name'in $cells peteğinden geçti ama düello yoktu, o yüzden bir şey değişmedi. Bu alanla düello açmak istersen seçim hazır."
        fun suggestionMeta(cells: Int, power: Int) = "$cells petek · ort. güç $power"
        const val route = "Rota"
        const val slots = "Hakkın"
        fun slotsValue(left: Int) = "${3 - left}/3 düello"
        fun suggestionNote(name: String) =
            "Bu koşu geriye dönük sayılmaz. Seçimi düzenleyip Tamam dediğinde düello başlar; yalnız sen ve $name görürsünüz."
        const val editArea = "Alanı düzenle"
        const val share = "Paylaş"
        const val toMap = "Haritaya dön"
        const val pendingTitle = "Koşun kaydedildi"
        const val pendingBody = "Bağlantı gelince gönderilir; fetih o zaman hesaplanır."
        const val sending = "Gönderiliyor…"
        const val reviewTag = "İnceleniyor"
        const val reviewTitle = "Halkan inceleniyor"
        fun reviewBody(km: String) =
            "$km km'lik bir bölümde tempo koşu temposunun çok üstünde. GPS sıçraması da olabilir; kontrol ediyoruz."
        const val reviewSaved = "Koşu ve seri kaydedildi"
        const val reviewMapUnchanged = "Harita şimdilik değişmez"
        fun reviewPendingCells(n: Int) = "$n petek beklemede"
        const val reviewEta = "Genelde 1 saat içinde sonuçlanır"
        const val reviewEtaSub = "Sonucu bildirimle haber veririz"
        const val addNote = "Bilgi ekle"
        const val notePlaceholder = "Örn. tünelden geçtim, GPS sıçradı"
        const val noteSent = "Notun iletildi"
        fun hpChange(before: Int, after: Int) = "Can $before → $after"
    }

    object siege {
        const val title = "Kuşatma"
        fun head(name: String, hp: Int) = "$name'le düello · can $hp"
        fun cells(n: Int) = "$n peteğin"
        fun yourArea(cells: Int, area: String, days: Int) = "Alanın $cells petek · $area · $days gündür senin"
        fun hpLeft(hp: Int) = "$hp düello canın kaldı"
        fun estimate(n: Int, event: String?) = "${if (event != null) "$event'te " else ""}$n halka daha atarsa onun olur"
        const val explain = "Bu petekleri dolaşan bir halka kapatırsan gücün +10 artar, saldırgan −10 geri itilir."
        fun defensesLeft(n: Int) = "Bugün $n savunma halkası hakkın var."
        const val cta = "SAVUN · KOŞUYA BAŞLA"
        fun attacking(name: String) = "$name'in alanına düello"
        const val attackCta = "KOŞUYA BAŞLA"
        const val cancelDuel = "Düellodan çekil"
        fun expires(h: Int) = "$h saat içinde sayılan halka gelmezse düello silinir"
        fun defenseOutcome(cells: Int, power: Int, powerAfter: Int, gainLabel: String?, attacker: String, progress: Int, progressAfter: Int, hp: Int, hpAfter: Int) =
            "Bu $cells peteği dolaşan bir halka kapatırsan: gücün $power → $powerAfter${gainLabel?.let { " ($it)" } ?: ""}, $attacker $progress → $progressAfter; düello canın $hp → $hpAfter."
    }

    object duelSelect {
        const val title = "Düello alanı"
        fun owner(name: String, n: Int, power: Int) = "$name · $n petek · güç $power"
        const val hint = "Kaydırarak boya · tekrar kaydırınca silinir"
        fun hintEmpty(name: String) = "$name'in peteklerinin üstünden kaydır"
        const val kickerSel = "Seçim"
        const val kickerEmpty = "Boş"
        const val kickerSmall = "Çok az"
        const val kickerBig = "Çok fazla"
        const val kickerLimit = "Hak dolu"
        const val kickerError = "Seçim geçersiz"
        fun headSel(n: Int) = "$n petek"
        const val headEmpty = "Henüz seçim yok"
        fun sideArea(m2: String) = "≈ $m2"
        const val sideMin = "en az 7"
        const val sideMax = "en çok 60"
        const val subSel = "Nereden koşacağını sen seç; sokakları ve parkları petek altından görebilirsin."
        fun subEmpty(name: String) = "En az 7, en çok 60 petek seçebilirsin. Yalnız $name'in petekleri boyanır."
        const val subSmall = "Düello için biraz daha boya. Küçük alan kısa rota demek, ama en az 7 petek gerekir."
        const val subBig = "Bir düello alanı en çok 60 petek olabilir. Birkaç peteği sil."
        const val subLimit = "Aynı anda en çok 3 düellon olabilir. Biri bitince yenisini açabilirsin."
        const val subNotConnected = "Seçtiğin petekler tek parça olmalı."
        const val paint = "Boya"
        const val pan = "Kaydır"
        const val confirm = "Tamam"
        fun started(name: String) = "Düello başladı · $name"
        const val routeReady = "Rota hazır"
        fun routeSub(name: String) =
            "Rota tüm alanı dolaşır. Farklı sokaktan koşabilirsin; alanı dolaştığın sürece sayılır. $name ilk halkanda haberdar olur."
        const val statDistance = "Mesafe"
        const val statTime = "Süre"
        const val statHp = "Can"
        const val edit = "Alanı düzenle"
        const val run = "Koşuya başla"
        fun slot(used: Int) = "$used/3"
        fun cellA11y(selected: Int) = "Düello seçimi, $selected petek"
    }

    object profile {
        const val title = "Profil"
        const val tabStats = "İstatistik"
        const val tabBadges = "Rozetler"
        const val tabFriends = "Arkadaşlar"
        const val settings = "Ayarlar"
    }

    object stats {
        const val territory = "Toprağın"
        fun territoryMeta(cells: Int, region: String?, rank: Int?) =
            "$cells petek${if (region != null && rank != null) " · $region'de $rank." else ""}"
        fun monthDistance(month: String) = "$month mesafe"
        const val avgPace = "Ort. tempo"
        const val defense = "Savunma"
        const val biggestLoop = "En büyük halka"
        fun streak(n: Int) = "$n gün seri"
        fun bestStreak(n: Int) = "en iyi $n gün"
        const val last14 = "Son 14 gün"
        fun last14A11y(days: Int) = "Son 14 gün: $days gün koşu"
        const val recent = "Son hareketler"
        const val noRecent = "İlk halkanı kapatınca burada görünecek."
    }

    object badges {
        const val title = "Rozetler"
        const val emptyTitle = "İlk rozetin bir halka uzakta"
        fun emptyBody(n: Int) = "$n rozet var. Şunlar sana en yakın:"
        const val emptyCta = "İLK HALKAYA BAŞLA"
        const val loading = "Rozetler yükleniyor"
        const val errorTitle = "Rozetler yüklenemedi"
        fun errorBody(earned: Int, total: Int) =
            "Son bilinen: $earned / $total. Kazandığın hiçbir rozet kaybolmaz; bağlantı gelince eşitlenir."
        const val insignia = "Nişanlar"
        fun insigniaMeta(n: Int) = "$n/3 · değişiklik 1/gün"
        const val insigniaNote = "Takılı nişanlar rakiplerin bölge sayfasında görünür."
        const val emptySlot = "Boş slot"
        const val collection = "Koleksiyon"
        fun collectionMeta(e: Int, t: Int) = "$e / $t"
        fun earnedOn(date: String) = "kazanıldı $date"
        const val howTo = "Nasıl kazanılır"
        const val counter = "Rakip karşı hamlesi"
        const val replaceWhich = "Hangi nişanın yerine?"
        const val equip = "Tak"
        fun equipInto(name: String) = "$name yerine tak"
        const val equipEmpty = "Boş slota tak"
        const val unequip = "Çıkar"
        const val changeNote = "Bugünkü değişiklik hakkını kullanır · koşu sırasında değiştirilemez"
        const val changeUsed = "Bugünkü değişiklik hakkını kullandın. Yarın tekrar değiştirebilirsin."
        const val notInsignia = "Bu rozet nişan olarak takılmaz."
        const val alwaysOn = "hep açık"
        const val earned = "Kazanıldı"
        val kinds = mapOf(
            "kural" to "Kural bükme",
            "kesif" to "keşif",
            "rovans" to "rövanş",
            "savunma" to "savunma",
            "sinsilik" to "sinsilik",
            "kimlik" to "kimlik",
            "kolaylik" to "kolaylık",
        )
        const val unlockedTitle = "Nişanlar açıldı"
        const val unlockedBody = "Rozetlerin artık haritada iş görür."
        val unlockedPoints = listOf(
            "Aynı anda 3 nişan takılı olur, günde bir kez değiştirebilirsin.",
            "Rakiplerin hangilerini taktığını görür, sen de onlarınkini.",
            "7 Gün gibi seri rozetleri slot istemez: ayda 1 kaçırılan gün affedilir.",
        )
        const val seeInsignia = "Nişanlarımı gör"
    }

    object league {
        const val title = "Lig"
        const val individual = "Bireysel"
        const val team = "Takım"
        const val week = "Haftalık"
        const val month = "Aylık"
        const val all = "Tümü"
        const val metric = "Alan"
        const val metricWeek = "Bu hafta kazanılan alan"
        const val metricMonth = "Bu ay kazanılan alan"
        const val metricAll = "Toplam toprak"
        fun endsIn(d: Int, h: Int) = "bitişe $d g $h sa"
        const val emptyTitle = "Hafta yeni başladı"
        fun emptyBody(region: String) =
            "Tablo Pazartesi 00:00'da sıfırlandı. Bu hafta $region'de henüz kimse toprak almadı; ilk halka seni zirveye koyar."
        const val loading = "Sıralama yükleniyor"
        const val errorTitle = "Sıralama güncellenemedi"
        fun errorBody(time: String) = "Gördüğün tablo $time'dan"
        fun rankA11y(rank: Int, name: String, value: String) = "$rank. $name, $value"
    }

    object friends {
        const val invite = "Davet et"
        fun count(n: Int) = "$n arkadaş"
        const val feed = "Akış"
        const val list = "Liste"
        fun inviteMessage(code: String) = "HexRun'da benimle koş! Davet kodum: $code · https://hexrun.co/invite/$code"
        const val addByCode = "Kodla ekle"
        const val codePlaceholder = "Davet kodu"
        const val add = "Ekle"
        const val remove = "Arkadaşlıktan çıkar"
        const val empty = "Henüz arkadaşın yok. Davet kodunu paylaş."
        const val feedEmpty = "Arkadaşlarının fetihleri burada görünecek."
        fun clapA11y(n: Int, mine: Boolean) = if (mine) "Alkışladın, $n alkış" else "Alkışla, $n alkış"
        fun added(name: String) = "$name arkadaşın oldu"
    }

    object team {
        const val title = "Takım"
        fun captain(name: String) = "Kaptan $name"
        fun members(n: Int) = "$n üye"
        fun rank(region: String?, rank: Int?) = if (region != null && rank != null) "$region $rank." else ""
        const val shared = "ortak toprak"
        const val week = "bu hafta"
        const val cellsLabel = "petek"
        fun leagueTitle(region: String) = "$region takım sıralaması"
        const val toLeague = "Lig"
        const val membersTitle = "Üyeler"
        const val captainRole = "Kaptan"
        const val noTeamTitle = "Takımın yok"
        const val noTeamBody = "Takımlar birlikte oynamaz; üyelerin toplam m²'si ile sıralanır, savunma bireyseldir."
        const val create = "Takım kur"
        const val createPlaceholder = "Takım adı"
        const val join = "Takıma katıl"
        const val joinPlaceholder = "Davet kodu"
        const val leave = "Takımdan ayrıl"
        const val leaveConfirm = "Takımdan ayrılmak istediğine emin misin?"
        fun inviteCode(code: String) = "Davet kodu: $code"
    }

    object events {
        const val title = "Etkinlik"
        fun nowEverywhere(window: String) = "Şimdi · her yerde · $window"
        fun remaining(h: Int, m: Int) = if (h > 0) "$h sa $m dk" else "$m dk"
        fun startsIn(h: Int, m: Int) = when {
            h >= 24 -> "${h / 24} g ${h % 24} sa sonra"
            h > 0 -> "$h sa $m dk sonra"
            else -> "$m dk sonra"
        }
        fun participants(n: String) = "Bugün $n koşucu katıldı."
        const val others = "Diğer etkinlikler"
        const val active = "aktif"
        const val everywhere = "her yerde"
        const val remind = "Hatırlat"
        const val reminded = "Hatırlatılacak"
        val moves = mapOf("gain" to "güç", "attack" to "saldırı", "pushback" to "savunma")
        const val noneActive = "Şu an aktif çarpan yok"
        const val noneActiveBody = "Boş petek alımında çarpan yok; halkalar her zaman sayılır."
        const val rules = "Her çarpan farklı bir hamleye uygulanır, üst üste binmez; boş petek alımında çarpan yok."
        const val channel = "Etkinlik hatırlatmaları"
    }

    object notifications {
        const val title = "Bildirimler"
        const val markRead = "Okundu"
        const val filterAll = "Tümü"
        const val filterSiege = "Kuşatma"
        const val filterRegion = "Bölge"
        const val filterTeam = "Takım"
        const val empty = "Yeni bildirim yok."
        const val loadMore = "Daha fazla"
        const val error = "Bildirimler yüklenemedi"
        const val unread = "Okunmamış. "
        const val channel = "Oyun bildirimleri"
    }

    data class PrivacyRow(val k: String, val v: String)

    object privacy {
        const val title = "Gizlilik"
        const val zone = "Gizlilik bölgesi"
        const val zoneSub = "Evinin çevresi"
        const val inside = "Daire içi: \"Gizli oyuncu\""
        fun radius(m: Int) = "$m m"
        const val setHome = "Şu anki konumu ev olarak kullan"
        const val homeSet = "Ev konumu ayarlandı"
        const val whoSees = "Kim ne görür"
        val rows = listOf(
            PrivacyRow("Halkaların ve rotaların", "Yalnız sen"),
            PrivacyRow("Bölge dışındaki peteklerin", "Adınla, herkes"),
            PrivacyRow("Bölge içindeki peteklerin", "Gizli oyuncu"),
        )
        const val footnote =
            "Daire başkalarına çizilmez ve merkezi her hesapta rastgele kaydırılır; peteklerin rengi görünür, adın ve baş harfin görünmez."
        const val needLocation = "Ev konumunu ayarlamak için konum izni gerekiyor."
    }

    object rookie {
        fun chip(n: Int) = "Çaylak · $n gün kaldı"
        fun title(day: Int) = "Çaylak dönemi · $day/14. gün"
        const val head = "Günde 3 saldırı hakkın var"
        const val body = "Aynı düelloya normalde günde 2 halka sayılır, sana 3. Kısa halkalar da sayılır."
    }

    object settings {
        const val title = "Ayarlar"
        const val account = "Hesap"
        const val privacy = "Gizlilik"
        const val integrations = "Saat ve uygulamalar"
        const val notifications = "Bildirim izinleri"
        const val export = "Verilerimi dışa aktar"
        const val exportDone = "Veri dosyan hazır"
        const val delete = "Hesabımı sil"
        const val deleteConfirmTitle = "Hesabın silinsin mi?"
        const val deleteConfirmBody = "Toprağın, koşuların ve rozetlerin kalıcı olarak silinir. Bu işlem geri alınamaz."
        const val deleteConfirm = "Kalıcı olarak sil"
        const val logout = "Çıkış yap"
        const val legal = "Yasal"
        const val terms = "Kullanım Koşulları"
        const val privacyPolicy = "Gizlilik Politikası"
        const val licenses = "Açık kaynak lisansları"
        const val mapAttribution = "Harita verisi © OpenStreetMap katkıcıları"
        fun version(v: String) = "Sürüm $v"
    }

    object integrations {
        const val title = "Saat ve uygulamalar"
        const val watches = "Saatler"
        const val apps = "Uygulamalar"
        const val connect = "Bağla"
        const val connected = "Bağlı"
        const val disconnect = "Bağlantıyı kes"
        const val autoImport = "Koşuları otomatik al"
        const val stravaImport = "Strava'dan koşuları al"
        const val stravaExport = "HexRun koşuların Strava'ya gitsin"
        fun lastSync(t: String) = "son eşitleme $t"
        const val appInstalled = "HexRun uygulaması yüklü"
        const val healthSub = "Antrenman ve nabız"
        const val rule = "Koşu bittikten sonra 24 saat içinde gelirse haritaya işlenir. Aynı koşu iki kaynaktan gelirse bir kez sayılır."
        val names = mapOf(
            "apple_watch" to "Apple Watch",
            "wear_os" to "Wear OS saat",
            "garmin" to "Garmin Connect",
            "coros" to "Coros",
            "suunto" to "Suunto",
            "polar" to "Polar Flow",
            "strava" to "Strava",
            "apple_health" to "Apple Sağlık",
            "health_connect" to "Health Connect",
        )
    }

    object share {
        const val title = "Fethi paylaş"
        const val dark = "Koyu"
        const val light = "Açık"
        const val privacyNote = "Kartta harita, rota ve rakip adı yok. Gizlilik bölgendeki petekler silüete girmez."
        const val share = "Paylaş"
        const val unavailable = "Bu cihazda paylaşım kullanılamıyor."
    }

    /** Wear OS saat metinleri (s17-saat). */
    object watch {
        fun loopOpen(km: String) = "Halka açık · $km"
        const val closeLoop = "Halkayı kapat"
        fun approach(m: Int) = "$m m · halkayı kapat"
        const val km = "km"
        fun duel(name: String) = "Düello · $name"
        const val cellsCovered = "petek dolaşıldı"
        const val conquest = "Fetih"
        const val cellsYours = "petek senin"
        const val idleTitle = "HexRun"
        const val idleBody = "Koşuyu telefondan başlat; saat canlı göstergeyi gösterir."
        const val paused = "Duraklatıldı"
    }
}
