import Foundation

/// Uygulama içi hedefler. `hexrun://` şeması, `https://hexrun.co/app/...`,
/// `https://hexrun.co/invite/<kod>` ve `https://hexrun.co/r/<koşu>` desteklenir.
public enum DeepLink: Hashable, Sendable {
    case map
    case run(defend: String?, attack: String?)
    case duel(String)
    case duelRevenge(String)
    case duelSelect(cell: String)
    case region(String)
    case notifications
    case profile(tab: String?)
    case badge(String)
    case settings
    case privacy
    case integrations(connected: String?, error: String?)
    case share(String)
    case summary(runId: String)
    case friends(code: String?)
    case invite(String)
    case league
    case team
    case events

    public static func parse(_ raw: String?) -> DeepLink? {
        guard let raw, !raw.isEmpty else { return nil }
        var rest: String
        let lower = raw.lowercased()
        if lower.hasPrefix("hexrun://") {
            rest = String(raw.dropFirst("hexrun://".count))
        } else if let r = stripHost(raw) {
            // Evrensel bağlantılar.
            if r.hasPrefix("invite/") {
                let code = String(r.dropFirst("invite/".count)).split(separator: "?").first.map(String.init) ?? ""
                return code.isEmpty ? nil : .invite(code)
            }
            if r.hasPrefix("r/") {
                let id = String(r.dropFirst(2)).split(separator: "?").first.map(String.init) ?? ""
                return id.isEmpty ? nil : .summary(runId: id)
            }
            guard r.hasPrefix("app/") || r == "app" else { return nil }
            rest = String(r.dropFirst(min(4, r.count)))
        } else if raw.hasPrefix("/") {
            rest = String(raw.dropFirst())
        } else {
            return nil
        }
        while rest.hasPrefix("/") { rest.removeFirst() }
        let parts = rest.split(separator: "?", maxSplits: 1).map(String.init)
        let path = parts.first ?? ""
        let query = parts.count > 1 ? parseQuery(parts[1]) : [:]
        let seg = path.split(separator: "/").map { $0.removingPercentEncoding ?? String($0) }
        let head = seg.first ?? ""
        switch head {
        case "", "map": return .map
        case "run":
            if seg.count >= 2, seg[1] == "summary" { return query["runId"].map { .summary(runId: $0) } ?? .map }
            return .run(defend: query["defend"], attack: query["attack"])
        case "duel":
            if seg.count >= 3, seg[1] == "revenge" { return .duelRevenge(seg[2]) }
            if seg.count >= 2, seg[1] == "select" { return query["cell"].map { .duelSelect(cell: $0) } ?? .map }
            return seg.count >= 2 ? .duel(seg[1]) : .map
        case "region":
            if seg.count >= 2 { return .region(seg[1]) }
            return query["cell"].map { .region($0) } ?? .map
        case "notifications": return .notifications
        case "profile":
            if seg.count >= 2 {
                switch seg[1] {
                case "settings": return .settings
                case "privacy": return .privacy
                case "integrations": return .integrations(connected: query["connected"], error: query["error"])
                case "badge": return seg.count >= 3 ? .badge(seg[2]) : .profile(tab: "badges")
                default: return .profile(tab: seg[1])
                }
            }
            return .profile(tab: query["tab"])
        case "integrations": return .integrations(connected: query["connected"], error: query["error"])
        case "share": return seg.count >= 2 ? .share(seg[1]) : nil
        case "friends": return .friends(code: query["code"])
        case "invite": return seg.count >= 2 ? .invite(seg[1]) : (query["code"].map { .invite($0) })
        case "league": return .league
        case "team": return .team
        case "events": return .events
        case "auth": return .map
        default: return nil
        }
    }

    static func stripHost(_ raw: String) -> String? {
        for prefix in ["https://hexrun.co/", "https://www.hexrun.co/"] where raw.lowercased().hasPrefix(prefix) {
            return String(raw.dropFirst(prefix.count))
        }
        return nil
    }

    static func parseQuery(_ q: String) -> [String: String] {
        var out: [String: String] = [:]
        for pair in q.split(separator: "&") {
            let kv = pair.split(separator: "=", maxSplits: 1).map(String.init)
            guard let k = kv.first, !k.isEmpty else { continue }
            let v = kv.count > 1 ? kv[1] : ""
            out[k.removingPercentEncoding ?? k] = v.replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? v
        }
        return out
    }

    /// Push yükünden derin bağlantı: `url` ya da `deeplink`.
    public static func fromPush(_ userInfo: [AnyHashable: Any]) -> DeepLink? {
        if let s = userInfo["url"] as? String { return parse(s) }
        if let s = userInfo["deeplink"] as? String { return parse(s) }
        if let d = userInfo["data"] as? [AnyHashable: Any] { return fromPush(d) }
        return nil
    }
}
