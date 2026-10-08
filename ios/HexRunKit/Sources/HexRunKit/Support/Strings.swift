import Foundation

// Türkçe arayüz metinleri (birincil dil); `apps/mobile/src/i18n/tr.ts` ile birebir.
// swiftlint:disable line_length
public enum S {
    public enum common {
        public static let `continue` = "Devam"
        public static let skip = "Geç"
        public static let back = "Geri"
        public static let close = "Kapat"
        public static let done = "Tamam"
        public static let cancel = "Vazgeç"
        public static let retry = "Tekrar dene"
        public static let notNow = "Şimdi değil"
        public static let loading = "Yükleniyor…"
        public static let save = "Kaydet"
        public static let you = "Sen"
        public static let today = "Bugün"
        public static let yesterday = "Dün"
        public static let thisWeek = "Bu hafta"
        public static let earlier = "Daha önce"
        public static func cells(_ n: Int) -> String { "\(n) petek" }
        public static let power = "Güç"
        public static let area = "Alan"
        public static let distance = "Mesafe"
        public static let pace = "Tempo"
        public static let time = "Süre"
        public static func streakDays(_ n: Int) -> String { "\(n) gün" }
        public static func errorCode(_ code: String) -> String { "Hata kodu: \(code)" }
        public static let genericError = "Bir şeyler ters gitti. Tekrar dene."
        public static let offline = "Çevrimdışısın"
    }

    public enum tabs {
        public static let map = "Harita"
        public static let league = "Lig"
        public static let team = "Takım"
        public static let events = "Etkinlik"
    }

    public struct OnboardingPage: Sendable { public let kicker: String; public let title: String; public let body: String }

    public enum onboarding {
        public static let pages: [OnboardingPage] = [
            OnboardingPage(kicker: "1 / 3 · Koş", title: "Koş.", body: "Telefon cebinde, GPS izini çizer. Hedef tempo yok, zorunlu rota yok; sokaklar senin."),
            OnboardingPage(kicker: "2 / 3 · Halkayı kapat", title: "Halkayı kapat.", body: "Başladığın yere 50 m yaklaştığında halka kapanır. Kapanmazsa koşu yine kaydedilir, sadece toprak gelmez."),
            OnboardingPage(kicker: "3 / 3 · Bölgeyi fethet", title: "Fethet.", body: "Halkanın içi senin renginle boyanır. Halka atmayı bırakırsan güç erir; rakipler kendi halkalarıyla kuşatır."),
        ]
        public static let start = "BAŞLAYALIM"
    }

    public enum permissions {
        public static let title = "İki izin, tek sebep: oyun."
        public static let body = "Konumunu yalnızca koşu sırasında kaydederiz. Haritada izin değil, sadece kazandığın petekler görünür."
        public static let location = "Konum"
        public static let locationWhy = "Ekran kapalıyken de izini çizmek ve halkanın kapandığını anlamak için."
        public static let locationGrantedAlways = "Verildi · Uygulamayı kullanırken + arka plan"
        public static let locationGrantedWhenInUse = "Verildi · Uygulamayı kullanırken"
        public static let locationDenied = "Verilmedi · Koşu kilitli kalır"
        public static let locationAsk = "Konuma izin ver"
        public static let openSettings = "Ayarları aç"
        public static let notifications = "Bildirimler"
        public static let notificationsWhy = "Bölgen kuşatıldığında ya da el değiştirdiğinde haber verelim. Günde en çok 3."
        public static let notificationsAsk = "Bildirimlere izin ver"
        public static let notificationsGranted = "Verildi"
        public static let later = "Şimdilik geç"
    }

    public enum auth {
        public static let tagline = "Mahalle seni bekliyor."
        public static func social(_ region: String, _ n: String) -> String { "\(region)'de bu hafta \(n) koşucu toprak aldı." }
        public static let apple = "Apple ile devam et"
        public static let google = "Google ile devam et"
        public static let email = "E-posta ile devam et"
        public static let haveAccount = "Hesabın var mı?"
        public static let login = "Giriş yap"
        public static let legalPre = "Devam ederek "
        public static let terms = "Kullanım Koşulları"
        public static let legalMid = "'nı ve "
        public static let privacy = "Gizlilik Politikası"
        public static let legalPost = "'nı kabul edersin."
        public static let emailTitle = "E-posta adresin"
        public static let emailBody = "Sana 6 haneli bir giriş kodu göndereceğiz. Şifre yok."
        public static let emailPlaceholder = "ad@ornek.com"
        public static let sendCode = "Kodu gönder"
        public static let codeTitle = "Kodu gir"
        public static func codeBody(_ email: String) -> String { "\(email) adresine gönderdiğimiz 6 haneli kodu yaz." }
        public static let verify = "Doğrula"
        public static let resend = "Kodu tekrar gönder"
        public static let invalidEmail = "Geçerli bir e-posta adresi yaz."
        public static func devCode(_ code: String) -> String { "Geliştirme kodu: \(code)" }
        public static let googleMissing = "Google girişi için istemci kimliği tanımlı değil."
    }

    public enum profileSetup {
        public static let title = "Haritada nasıl görüneceksin?"
        public static let username = "Kullanıcı adı"
        public static let available = "Uygun · Lig ve haritada bu adla görünürsün"
        public static let taken = "Bu ad alınmış"
        public static let invalid = "3–20 karakter: küçük harf, rakam, alt çizgi"
        public static let reserved = "Bu ad kullanılamaz"
        public static let checking = "Kontrol ediliyor…"
        public static let displayName = "Görünen ad"
        public static let color = "İmza rengi"
        public static func neighborRule(_ name: String) -> String {
            "Kendini hep \(name) görürsün. Komşun da \(name) seçtiyse onu haritanda başka renkte görürsün; renkler hiç karışmaz."
        }
        public static let submit = "HARİTAYA GEÇ"
    }

    public enum map {
        public static let start = "KOŞUYA BAŞLA"
        public static let startA11y = "Koşuya başla"
        public static let locating = "Konum bulunuyor…"
        public static let loadingRegions = "Bölgeler yükleniyor"
        public static func eventsChip(_ n: Int) -> String { "\(n) etkinlik" }
        public static func attackersA11y(_ n: Int) -> String { "Son 48 saatte sana \(n) kişi saldırdı" }
        public static func streakChip(_ n: Int) -> String { "\(n) gün" }
        public static func bellA11y(_ n: Int) -> String { n > 0 ? "Bildirimler, \(n) okunmamış" : "Bildirimler" }
        public static let avatarA11y = "Profil"
        public static let myLocation = "Konumum"
        public static let offlineTitle = "Çevrimdışısın"
        public static func offlineBody(_ min: Int) -> String { "Harita \(min) dk önceki hali. Koşun kaydedilir, fetih bağlanınca hesaplanır." }
        public static let firstLoopTag = "İlk halkan"
        public static func firstLoopMeta(_ km: String, _ m2: String) -> String { "\(km) km · ≈ \(m2)" }
        public static let firstDay = "İlk gün"
        public static let firstLoopTitle = "Buradaki petekler boş"
        public static func firstLoopBody(_ km: String) -> String { "Çevresinde \(km) km koş, başladığın yere dön. Halka kapanınca içi senin renginle boyanır." }
        public static let firstLoopSteps = ["Başla", "Geri dön", "Fethet"]
        public static let firstLoopCta = "BU HALKAYLA BAŞLA"
        public static let ownRoute = "Kendi rotamla koşacağım"
        public static let runLocked = "Konum izni yok · koşu kilitli"
        public static let runLockedBody = "Koşu için konum izni gerekiyor. Ayarlardan açabilirsin."
        public static func siegeBanner(_ name: String) -> String { "\(name)'le düello" }
        public static func siegeBannerBody(_ name: String, _ time: String, _ loops: Int) -> String { "\(name) \(time)'de halka kapattı · \(loops) halka daha" }
        public static let defend = "Savun"
        public static let hiddenPlayer = "Gizli oyuncu"
    }

    public enum region {
        public static func title(_ name: String) -> String { "\(name)'in alanı" }
        public static let myTitle = "Senin alanın"
        public static let emptyTitle = "Sahipsiz petekler"
        public static func meta(_ cells: Int, _ area: String) -> String { "\(cells) petek · \(area)" }
        public static func ownerSince(_ days: Int, _ team: String?) -> String { "Sahip · \(days) gündür" + (team.map { " · \($0)" } ?? "") }
        public static func duelHp(_ hp: Int, _ cells: Int) -> String { "Düello canı \(hp) · alan \(cells) petek" }
        public static func loopsToCapture(_ n: Int, _ event: String?) -> String { event.map { "\($0) ile \(n) halka" } ?? "\(n) halka" }
        public static let area = "Alan"
        public static let ownership = "Sahiplik"
        public static func ownershipDays(_ n: Int) -> String { "\(n) gün" }
        public static let lastDefense = "Son savunma"
        public static let never = "Henüz yok"
        public static func privateDuel(_ name: String) -> String { "Düellon yalnız sen ve \(name) görür" }
        public static let incoming = "Bu alandaki düellolar"
        public static let history = "El değiştirme"
        public static func insignia(_ name: String) -> String { "\(name)'in nişanları" }
        public static let startDuel = "Düello başlat"
        public static let runHere = "Burada koş"
        public static let loopHere = "Burada halka kapat"
        public static func loopHereBoost(_ label: String) -> String { "Burada halka kapat · \(label)" }
        public static let slotsFull = "Düello hakkın dolu (3/3)"
        public static let hidden = "Bu petekler bir gizlilik bölgesinde."
        public static func eventUntil(_ time: String) -> String { "\(time)'a kadar" }
    }

    public enum run {
        public static let gpsStrong = "GPS güçlü"
        public static let gpsWeak = "GPS zayıf"
        public static let gpsSearching = "GPS aranıyor"
        public static func toStart(_ d: String) -> String { "Başlangıca \(d) · halka açık" }
        public static let distanceKm = "Mesafe · km"
        public static let pacePerKm = "Tempo · /km"
        public static let time = "Süre"
        public static let pause = "DURAKLAT"
        public static let resume = "DEVAM"
        public static let finish = "BİTİR"
        public static let holdHint = "basılı tut"
        public static let paused = "Duraklatıldı"
        public static let lockA11y = "Ekranı kilitle"
        public static let unlockHint = "Kilidi açmak için basılı tut"
        public static let locked = "Kilitli"
        public static func closingLeft(_ m: Int) -> String { "\(m) m" }
        public static let closingCta = "halkayı kapat"
        public static func closingCells(_ n: Int) -> String { "\(n) petek" }
        public static func closingPreview(_ empty: Int) -> String { "Kapanınca \(empty) boş petek senin." }
        public static func duelCoverage(_ name: String, _ inside: Int, _ total: Int) -> String { "Düello alanı · \(name) \(inside)/\(total) petek" }
        public static func voiceClosing(_ m: Int) -> String { "\(m) metre, halkayı kapat" }
        public static func defending(_ name: String) -> String { "Savunma · \(name)" }
        public static let noPermission = "Konum izni yok"
        public static let recovered = "Yarım kalan koşun geri yüklendi"
    }

    public enum conquest {
        public static let closed = "HALKA KAPANDI"
        public static let conquered = "FETHEDİLDİ"
        public static func title(_ time: String, _ events: String?) -> String { "Fetih · \(time)" + (events.map { " · \($0)" } ?? "") }
        public static func headline(_ total: Int, _ empty: Int, _ own: Int) -> String {
            "\(total) petek senin: \(empty)'\(empty == 1 ? "i" : "ü") boştu" + (own > 0 ? ", \(own) tanesi güçlendi" : "") + "."
        }
        public static func duelLine(_ name: String) -> String { "\(name)'le düello" }
        public static func newCells(_ n: Int) -> String { "\(n) yeni petek" }
        public static func reinforced(_ n: Int) -> String { "\(n) güçlendi" }
        public static func covered(_ inside: Int, _ total: Int) -> String { "\(inside)/\(total) alan kapsandı" }
        public static let serverNote = "Kesin sonuç koşu bitince hesaplanır."
        public static let `continue` = "KOŞUYA DEVAM"
        public static let finish = "BİTİR"
    }

    public enum summary {
        public static let done = "Bitti"
        public static func closedHead(_ cells: Int, _ duel: Int) -> String { duel > 0 ? "\(cells) petek senin, \(duel)'i düelloyla" : "\(cells) petek senin" }
        public static let gained = "Kazanılan alan"
        public static func newBadge(_ name: String) -> String { "Yeni rozet: \(name)" }
        public static func duelWon(_ name: String) -> String { "\(name)'le düelloyu kazandın" }
        public static func duelWonBody(_ cells: Int) -> String { "\(cells) petek 50 güçle senin" }
        public static func streak(_ n: Int) -> String { "seri \(n) gün" }
        public static func openTag(_ m: Int) -> String { "\(m) m eksik" }
        public static let openTitle = "Halka açık kaldı"
        public static let openBody = "Koşun kaydedildi. Toprak için başlangıca 50 m yaklaşman gerekiyordu."
        public static let openNoChange = "Halka olmadan haritada bir şey değişmez"
        public static let openNoChangeSub = "Geçtiğin petekler etkilenmedi"
        public static func monthDistance(_ month: String) -> String { "\(month) mesafesi" }
        public static let streakLabel = "Seri"
        public static func makeLoop(_ m: Int) -> String { "Bu rotayı halka yap · +\(m) m" }
        public static let suggestionTag = "Öneri"
        public static func suggestionTitle(_ name: String) -> String { "\(name)'in alanından geçtin" }
        public static func suggestionBody(_ name: String, _ cells: Int) -> String {
            "Bu halka \(name)'in \(cells) peteğinden geçti ama düello yoktu, o yüzden bir şey değişmedi. Bu alanla düello açmak istersen seçim hazır."
        }
        public static func suggestionMeta(_ cells: Int, _ power: Int) -> String { "\(cells) petek · ort. güç \(power)" }
        public static let route = "Rota"
        public static let slots = "Hakkın"
        public static func slotsValue(_ left: Int) -> String { "\(3 - left)/3 düello" }
        public static func suggestionNote(_ name: String) -> String {
            "Bu koşu geriye dönük sayılmaz. Seçimi düzenleyip Tamam dediğinde düello başlar; yalnız sen ve \(name) görürsünüz."
        }
        public static let editArea = "Alanı düzenle"
        public static let share = "Paylaş"
        public static let toMap = "Haritaya dön"
        public static let pendingTitle = "Koşun kaydedildi"
        public static let pendingBody = "Bağlantı gelince gönderilir; fetih o zaman hesaplanır."
        public static let sending = "Gönderiliyor…"
        public static let reviewTag = "İnceleniyor"
        public static let reviewTitle = "Halkan inceleniyor"
        public static func reviewBody(_ km: String) -> String {
            "\(km) km'lik bir bölümde tempo koşu temposunun çok üstünde. GPS sıçraması da olabilir; kontrol ediyoruz."
        }
        public static let reviewSaved = "Koşu ve seri kaydedildi"
        public static let reviewMapUnchanged = "Harita şimdilik değişmez"
        public static func reviewPendingCells(_ n: Int) -> String { "\(n) petek beklemede" }
        public static let reviewEta = "Genelde 1 saat içinde sonuçlanır"
        public static let reviewEtaSub = "Sonucu bildirimle haber veririz"
        public static let addNote = "Bilgi ekle"
        public static let notePlaceholder = "Örn. tünelden geçtim, GPS sıçradı"
        public static let noteSent = "Notun iletildi"
        public static let failedTitle = "Koşu gönderilemedi"
    }

    public enum siege {
        public static let title = "Kuşatma"
        public static func head(_ name: String, _ hp: Int) -> String { "\(name)'le düello · can \(hp)" }
        public static func cells(_ n: Int) -> String { "\(n) peteğin" }
        public static func yourArea(_ cells: Int, _ area: String, _ days: Int) -> String { "Alanın \(cells) petek · \(area) · \(days) gündür senin" }
        public static func hpLeft(_ hp: Int) -> String { "\(hp) düello canın kaldı" }
        public static func estimate(_ n: Int, _ event: String?) -> String { (event.map { "\($0)'te " } ?? "") + "\(n) halka daha atarsa onun olur" }
        public static let explain = "Bu petekleri dolaşan bir halka kapatırsan gücün +10 artar, saldırgan −10 geri itilir."
        public static func defensesLeft(_ n: Int) -> String { "Bugün \(n) savunma halkası hakkın var." }
        public static let cta = "SAVUN · KOŞUYA BAŞLA"
        public static func attacking(_ name: String) -> String { "\(name)'in alanına düello" }
        public static let attackCta = "KOŞUYA BAŞLA"
        public static let cancelDuel = "Düellodan çekil"
        public static func expires(_ h: Int) -> String { "\(h) saat içinde sayılan halka gelmezse düello silinir" }
    }

    public enum duelSelect {
        public static let title = "Düello alanı"
        public static func owner(_ name: String, _ n: Int, _ power: Int) -> String { "\(name) · \(n) petek · güç \(power)" }
        public static let hint = "Kaydırarak boya · tekrar kaydırınca silinir"
        public static func hintEmpty(_ name: String) -> String { "\(name)'in peteklerinin üstünden kaydır" }
        public static let kickerSel = "Seçim"
        public static let kickerEmpty = "Boş"
        public static let kickerSmall = "Çok az"
        public static let kickerBig = "Çok fazla"
        public static let kickerLimit = "Hak dolu"
        public static let kickerError = "Seçim geçersiz"
        public static func headSel(_ n: Int) -> String { "\(n) petek" }
        public static let headEmpty = "Henüz seçim yok"
        public static func sideArea(_ m2: String) -> String { "≈ \(m2)" }
        public static let sideMin = "en az 7"
        public static let sideMax = "en çok 60"
        public static let subSel = "Nereden koşacağını sen seç; sokakları ve parkları petek altından görebilirsin."
        public static func subEmpty(_ name: String) -> String { "En az 7, en çok 60 petek seçebilirsin. Yalnız \(name)'in petekleri boyanır." }
        public static let subSmall = "Düello için biraz daha boya. Küçük alan kısa rota demek, ama en az 7 petek gerekir."
        public static let subBig = "Bir düello alanı en çok 60 petek olabilir. Birkaç peteği sil."
        public static let subLimit = "Aynı anda en çok 3 düellon olabilir. Biri bitince yenisini açabilirsin."
        public static let subNotConnected = "Seçtiğin petekler tek parça olmalı."
        public static let paint = "Boya"
        public static let pan = "Kaydır"
        public static let confirm = "Tamam"
        public static func started(_ name: String) -> String { "Düello başladı · \(name)" }
        public static let routeReady = "Rota hazır"
        public static func routeSub(_ name: String) -> String {
            "Rota tüm alanı dolaşır. Farklı sokaktan koşabilirsin; alanı dolaştığın sürece sayılır. \(name) ilk halkanda haberdar olur."
        }
        public static let statDistance = "Mesafe"
        public static let statTime = "Süre"
        public static let statHp = "Can"
        public static let edit = "Alanı düzenle"
        public static let run = "Koşuya başla"
        public static func slot(_ used: Int) -> String { "\(used)/3" }
    }

    public enum profile {
        public static let title = "Profil"
        public static let stats = "İstatistik"
        public static let badges = "Rozetler"
        public static let friends = "Arkadaşlar"
        public static let settings = "Ayarlar"
    }

    public enum stats {
        public static let territory = "Toprağın"
        public static func territoryMeta(_ cells: Int, _ region: String?, _ rank: Int?) -> String {
            "\(cells) petek" + ((region != nil && rank != nil) ? " · \(region!)'de \(rank!)." : "")
        }
        public static func monthDistance(_ month: String) -> String { "\(month) mesafe" }
        public static let avgPace = "Ort. tempo"
        public static let defense = "Savunma"
        public static let biggestLoop = "En büyük halka"
        public static func streak(_ n: Int) -> String { "\(n) gün seri" }
        public static func bestStreak(_ n: Int) -> String { "en iyi \(n) gün" }
        public static let last14 = "Son 14 gün"
        public static let recent = "Son hareketler"
        public static let noRecent = "İlk halkanı kapatınca burada görünecek."
    }

    public enum badges {
        public static let title = "Rozetler"
        public static let emptyTitle = "İlk rozetin bir halka uzakta"
        public static func emptyBody(_ n: Int) -> String { "\(n) rozet var. Şunlar sana en yakın:" }
        public static let emptyCta = "İLK HALKAYA BAŞLA"
        public static let loading = "Rozetler yükleniyor"
        public static let errorTitle = "Rozetler yüklenemedi"
        public static func errorBody(_ earned: Int, _ total: Int) -> String {
            "Son bilinen: \(earned) / \(total). Kazandığın hiçbir rozet kaybolmaz; bağlantı gelince eşitlenir."
        }
        public static let insignia = "Nişanlar"
        public static func insigniaMeta(_ n: Int) -> String { "\(n)/3 · değişiklik 1/gün" }
        public static let insigniaNote = "Takılı nişanlar rakiplerin bölge sayfasında görünür."
        public static let emptySlot = "Boş slot"
        public static let collection = "Koleksiyon"
        public static func collectionMeta(_ e: Int, _ t: Int) -> String { "\(e) / \(t)" }
        public static func earnedOn(_ date: String) -> String { "kazanıldı \(date)" }
        public static let howTo = "Nasıl kazanılır"
        public static let counter = "Rakip karşı hamlesi"
        public static let replaceWhich = "Hangi nişanın yerine?"
        public static let equip = "Tak"
        public static func equipInto(_ name: String) -> String { "\(name) yerine tak" }
        public static let equipEmpty = "Boş slota tak"
        public static let unequip = "Çıkar"
        public static let changeNote = "Bugünkü değişiklik hakkını kullanır · koşu sırasında değiştirilemez"
        public static let changeUsed = "Bugünkü değişiklik hakkını kullandın. Yarın tekrar değiştirebilirsin."
        public static let notInsignia = "Bu rozet nişan olarak takılmaz."
        public static let alwaysOn = "hep açık"
        public static let kinds: [String: String] = [
            "kural": "Kural bükme", "kesif": "keşif", "rovans": "rövanş", "savunma": "savunma",
            "sinsilik": "sinsilik", "kimlik": "kimlik", "kolaylik": "kolaylık",
        ]
        public static let unlockedTitle = "Nişanlar açıldı"
        public static let unlockedBody = "Rozetlerin artık haritada iş görür."
        public static let unlockedPoints = [
            "Aynı anda 3 nişan takılı olur, günde bir kez değiştirebilirsin.",
            "Rakiplerin hangilerini taktığını görür, sen de onlarınkini.",
            "7 Gün gibi seri rozetleri slot istemez: ayda 1 kaçırılan gün affedilir.",
        ]
        public static let seeInsignia = "Nişanlarımı gör"
    }

    public enum league {
        public static let title = "Lig"
        public static let individual = "Bireysel"
        public static let team = "Takım"
        public static let week = "Haftalık"
        public static let month = "Aylık"
        public static let all = "Tümü"
        public static let metric = "Alan"
        public static let metricWeek = "Bu hafta kazanılan alan"
        public static let metricMonth = "Bu ay kazanılan alan"
        public static let metricAll = "Toplam toprak"
        public static func endsIn(_ d: Int, _ h: Int) -> String { "bitişe \(d) g \(h) sa" }
        public static let emptyTitle = "Hafta yeni başladı"
        public static func emptyBody(_ region: String) -> String {
            "Tablo Pazartesi 00:00'da sıfırlandı. Bu hafta \(region)'de henüz kimse toprak almadı; ilk halka seni zirveye koyar."
        }
        public static let loading = "Sıralama yükleniyor"
        public static let errorTitle = "Sıralama güncellenemedi"
        public static func errorBody(_ time: String) -> String { "Gördüğün tablo \(time)'dan" }
        public static func rankA11y(_ rank: Int, _ name: String, _ value: String) -> String { "\(rank). \(name), \(value)" }
    }

    public enum friends {
        public static let invite = "Davet et"
        public static func count(_ n: Int) -> String { "\(n) arkadaş" }
        public static let feed = "Akış"
        public static let list = "Liste"
        public static func inviteMessage(_ code: String) -> String { "HexRun'da benimle koş! Davet kodum: \(code) · hexrun://friends?code=\(code)" }
        public static let addByCode = "Kodla ekle"
        public static let codePlaceholder = "Davet kodu"
        public static let add = "Ekle"
        public static let remove = "Arkadaşlıktan çıkar"
        public static let empty = "Henüz arkadaşın yok. Davet kodunu paylaş."
        public static let feedEmpty = "Arkadaşlarının fetihleri burada görünecek."
        public static func clapA11y(_ n: Int, _ mine: Bool) -> String { mine ? "Alkışladın, \(n) alkış" : "Alkışla, \(n) alkış" }
    }

    public enum team {
        public static let title = "Takım"
        public static func captain(_ name: String) -> String { "Kaptan \(name)" }
        public static func members(_ n: Int) -> String { "\(n) üye" }
        public static func rank(_ region: String?, _ rank: Int?) -> String { (region != nil && rank != nil) ? "\(region!) \(rank!)." : "" }
        public static let shared = "ortak toprak"
        public static let week = "bu hafta"
        public static let cellsLabel = "petek"
        public static func leagueTitle(_ region: String) -> String { "\(region) takım sıralaması" }
        public static let toLeague = "Lig"
        public static let membersTitle = "Üyeler"
        public static let captainRole = "Kaptan"
        public static let noTeamTitle = "Takımın yok"
        public static let noTeamBody = "Takımlar birlikte oynamaz; üyelerin toplam m²'si ile sıralanır, savunma bireyseldir."
        public static let create = "Takım kur"
        public static let createPlaceholder = "Takım adı"
        public static let join = "Takıma katıl"
        public static let joinPlaceholder = "Davet kodu"
        public static let leave = "Takımdan ayrıl"
        public static let leaveConfirm = "Takımdan ayrılmak istediğine emin misin?"
        public static func inviteCode(_ code: String) -> String { "Davet kodu: \(code)" }
    }

    public enum events {
        public static let title = "Etkinlik"
        public static func nowEverywhere(_ window: String) -> String { "Şimdi · her yerde · \(window)" }
        public static func remaining(_ h: Int, _ m: Int) -> String { h > 0 ? "\(h) sa \(m) dk" : "\(m) dk" }
        public static func startsIn(_ h: Int, _ m: Int) -> String {
            h >= 24 ? "\(h / 24) g \(h % 24) sa sonra" : h > 0 ? "\(h) sa \(m) dk sonra" : "\(m) dk sonra"
        }
        public static func participants(_ n: String) -> String { "Bugün \(n) koşucu katıldı." }
        public static let others = "Diğer etkinlikler"
        public static let active = "aktif"
        public static let everywhere = "her yerde"
        public static let remind = "Hatırlat"
        public static let reminded = "Hatırlatılacak"
        public static let moves: [MoveKind: String] = [.gain: "güç", .attack: "saldırı", .pushback: "savunma"]
        public static let noneActive = "Şu an aktif çarpan yok"
        public static let noneActiveBody = "Boş petek alımında çarpan yok; halkalar her zaman sayılır."
        public static let rules = "Her çarpan farklı bir hamleye uygulanır, üst üste binmez; boş petek alımında çarpan yok."
    }

    public enum notifications {
        public static let title = "Bildirimler"
        public static let markRead = "Okundu"
        public static let filters: [NotificationFilter: String] = [.all: "Tümü", .siege: "Kuşatma", .region: "Bölge", .team: "Takım"]
        public static let empty = "Yeni bildirim yok."
        public static let loadMore = "Daha fazla"
        public static let error = "Bildirimler yüklenemedi"
    }

    public struct PrivacyRow: Sendable { public let k: String; public let v: String }

    public enum privacy {
        public static let title = "Gizlilik"
        public static let zone = "Gizlilik bölgesi"
        public static let zoneSub = "Evinin çevresi"
        public static let inside = "Daire içi: \"Gizli oyuncu\""
        public static func radius(_ m: Int) -> String { "\(m) m" }
        public static let setHome = "Şu anki konumu ev olarak kullan"
        public static let homeSet = "Ev konumu ayarlandı"
        public static let whoSees = "Kim ne görür"
        public static let rows = [
            PrivacyRow(k: "Halkaların ve rotaların", v: "Yalnız sen"),
            PrivacyRow(k: "Bölge dışındaki peteklerin", v: "Adınla, herkes"),
            PrivacyRow(k: "Bölge içindeki peteklerin", v: "Gizli oyuncu"),
        ]
        public static let footnote = "Daire başkalarına çizilmez ve merkezi her hesapta rastgele kaydırılır; peteklerin rengi görünür, adın ve baş harfin görünmez."
        public static let needLocation = "Ev konumunu ayarlamak için konum izni gerekiyor."
    }

    public enum rookie {
        public static func chip(_ n: Int) -> String { "Çaylak · \(n) gün kaldı" }
        public static func title(_ day: Int) -> String { "Çaylak dönemi · \(day)/14. gün" }
        public static let head = "Günde 3 saldırı hakkın var"
        public static let body = "Aynı düelloya normalde günde 2 halka sayılır, sana 3. Kısa halkalar da sayılır."
    }

    public enum settings {
        public static let title = "Ayarlar"
        public static let account = "Hesap"
        public static let privacy = "Gizlilik"
        public static let integrations = "Saat ve uygulamalar"
        public static let notifications = "Bildirim izinleri"
        public static let export = "Verilerimi dışa aktar"
        public static let exportDone = "Veri dosyan hazır"
        public static let delete = "Hesabımı sil"
        public static let deleteConfirmTitle = "Hesabın silinsin mi?"
        public static let deleteConfirmBody = "Toprağın, koşuların ve rozetlerin kalıcı olarak silinir. Bu işlem geri alınamaz."
        public static let deleteConfirm = "Kalıcı olarak sil"
        public static let logout = "Çıkış yap"
        public static let legal = "Yasal"
        public static let terms = "Kullanım Koşulları"
        public static let privacyPolicy = "Gizlilik Politikası"
        public static let licenses = "Açık kaynak lisansları"
        public static let mapAttribution = "Harita verisi © OpenStreetMap katkıcıları"
        public static func version(_ v: String) -> String { "Sürüm \(v)" }
    }

    public enum integrations {
        public static let title = "Saat ve uygulamalar"
        public static let watches = "Saatler"
        public static let apps = "Uygulamalar"
        public static let connect = "Bağla"
        public static let connected = "Bağlı"
        public static let disconnect = "Bağlantıyı kes"
        public static let autoImport = "Koşuları otomatik al"
        public static let stravaImport = "Strava'dan koşuları al"
        public static let stravaExport = "HexRun koşuların Strava'ya gitsin"
        public static func lastSync(_ t: String) -> String { "son eşitleme \(t)" }
        public static let appInstalled = "HexRun uygulaması yüklü"
        public static let healthSub = "Antrenman ve nabız"
        public static let soon = "Yakında"
        public static let rule = "Koşu bittikten sonra 24 saat içinde gelirse haritaya işlenir. Aynı koşu iki kaynaktan gelirse bir kez sayılır."
        public static let names: [IntegrationProvider: String] = [
            .apple_watch: "Apple Watch", .wear_os: "Wear OS saat", .garmin: "Garmin Connect", .coros: "Coros", .suunto: "Suunto",
            .polar: "Polar Flow", .strava: "Strava", .apple_health: "Apple Sağlık", .health_connect: "Health Connect",
        ]
    }

    public enum share {
        public static let title = "Fethi paylaş"
        public static let dark = "Koyu"
        public static let light = "Açık"
        public static let privacyNote = "Kartta harita, rota ve rakip adı yok. Gizlilik bölgendeki petekler silüete girmez."
        public static let share = "Paylaş"
        public static let unavailable = "Bu cihazda paylaşım kullanılamıyor."
    }

    public enum watch {
        public static func loopOpen(_ d: String) -> String { "Halka açık · \(d)" }
        public static let closeLoop = "Halkayı kapat"
        public static let km = "km"
        public static let startAhead = "başlangıca dön"
        public static func duel(_ name: String) -> String { "Düello · \(name)" }
        public static let duelCells = "petek dolaşıldı"
        public static let conquest = "Fetih"
        public static let conquestCells = "petek senin"
        public static let idleTitle = "HexRun"
        public static let idleBody = "Koşuyu telefondan başlat; saat canlı gösterir."
        public static let paused = "Duraklatıldı"
    }
}
