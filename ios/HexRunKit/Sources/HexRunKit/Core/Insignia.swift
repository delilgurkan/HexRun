import Foundation

/// Rozet kataloğundan nişanlar (core `badges.ts`): rakibin bölge sayfasında ad ve etki gösterilir.
public struct InsigniaInfo: Hashable, Sendable {
    public var id: String
    public var name: String
    public var kind: String
    public var effect: String
    public var slot: Bool
}

public enum Insignia {
    public static let totalBadges = 40

    public static let all: [InsigniaInfo] = [
        InsigniaInfo(id: "halka-ustasi", name: "Halka Ustası", kind: "kural", effect: "Halka 50 m yerine 60 m'de kapanır", slot: true),
        InsigniaInfo(id: "oncu", name: "Öncü", kind: "kesif", effect: "Boş petekler 12 güçle başlar", slot: true),
        InsigniaInfo(id: "toprak-50k", name: "Elli Bin", kind: "kimlik", effect: "İşaretçinde altın çerçeve", slot: true),
        InsigniaInfo(id: "geri-alan", name: "Geri Alan", kind: "rovans", effect: "Kaybettiği peteklere 7 gün +%20 saldırır", slot: true),
        InsigniaInfo(id: "ilk-kalkan", name: "İlk Kalkan", kind: "savunma", effect: "Düello hasarı −%10", slot: true),
        InsigniaInfo(id: "sur", name: "Sur", kind: "savunma", effect: "Halka atmadığın günler güç %20 yavaş erir", slot: true),
        InsigniaInfo(id: "kale-bekcisi", name: "Kale Bekçisi", kind: "savunma", effect: "Haftada 1 kez seçtiğin peteklere 24 sa kalkan (hasar −%20)", slot: true),
        InsigniaInfo(id: "seri-7", name: "7 Gün", kind: "kolaylik", effect: "Ayda 1 kaçırılan gün affedilir", slot: false),
        InsigniaInfo(id: "seri-30", name: "30 Gün", kind: "kolaylik", effect: "Ayda 2 kaçırılan gün affedilir", slot: false),
        InsigniaInfo(id: "safak-akincisi", name: "Şafak Akıncısı", kind: "sinsilik", effect: "Düello bildirimin rakibe 2 sa geç gider", slot: true),
    ]

    public static func byId(_ id: String) -> InsigniaInfo? { all.first { $0.id == id } }

    /// Halka seçenekleri: Halka Ustası 60 m, çaylak döneminde 200 m asgari çevre.
    public static func loopOptions(insignia: [String], newbieDaysLeft: Int) -> LoopOptions {
        LoopOptions(
            closeRadiusM: insignia.contains("halka-ustasi") ? Rules.loopCloseMMaster : Rules.loopCloseM,
            minLoopLengthM: newbieDaysLeft > 0 ? Rules.minLoopLengthMNewbie : Rules.minLoopLengthM
        )
    }
}
