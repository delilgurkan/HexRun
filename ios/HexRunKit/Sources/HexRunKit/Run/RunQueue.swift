import Foundation

public struct QueuedRun: Codable, Hashable, Sendable {
    public var req: SubmitRunRequest
    public var attempts: Int
    /// Bir sonraki deneme zamanı (epoch ms).
    public var nextAttemptAt: Int64
    public var createdAt: Int64
    public var lastError: String?
}

public struct RunQueueState: Codable, Sendable {
    public var items: [QueuedRun] = []
    /// clientRunId → sunucu özeti.
    public var results: [String: RunSummary] = [:]
    /// Sonuç ekleme sırası (en eskiler atılır).
    public var resultOrder: [String] = []
    /// Kalıcı (4xx) hatayla bırakılan koşular: clientRunId → mesaj.
    public var dropped: [String: String] = [:]
}

public enum QueuedRunStatus: Equatable, Sendable { case done, pending, failed(String), unknown }

/// Çevrimdışı koşu kuyruğu. Her koşu bir istemci UUID'si taşır; sunucu `clientRunId` ile
/// idempotent olduğundan aynı koşu tekrar gönderilse de bir kez sayılır. Geçici hatalarda
/// üstel geri çekilme + titreşim; kalıcı 4xx hatada iş kuyruktan düşer.
public actor RunQueue {
    public static let storageKey = "hexrun.runQueue.v1"

    private let kv: KeyValueStore
    private let submit: @Sendable (SubmitRunRequest) async throws -> RunSummary
    private let now: @Sendable () -> Int64
    private let base: Double
    private let maxDelay: Double
    private let random: @Sendable () -> Double
    private let keep: Int
    private var state: RunQueueState?
    private var flushing: Task<Void, Never>?
    private var listeners: [UUID: @Sendable () -> Void] = [:]

    public init(
        kv: KeyValueStore,
        submit: @escaping @Sendable (SubmitRunRequest) async throws -> RunSummary,
        now: @escaping @Sendable () -> Int64 = { Date().epochMs },
        baseDelayMs: Double = 5_000,
        maxDelayMs: Double = 10 * 60_000,
        random: @escaping @Sendable () -> Double = { Double.random(in: 0..<1) },
        keepResults: Int = 20
    ) {
        self.kv = kv
        self.submit = submit
        self.now = now
        base = baseDelayMs
        maxDelay = maxDelayMs
        self.random = random
        keep = keepResults
    }

    @discardableResult
    public func subscribe(_ fn: @escaping @Sendable () -> Void) -> UUID {
        let id = UUID()
        listeners[id] = fn
        return id
    }

    public func unsubscribe(_ id: UUID) { listeners[id] = nil }

    private func emit() { for l in listeners.values { l() } }

    @discardableResult
    public func load() -> RunQueueState {
        if let s = state { return s }
        let s = kv.value(RunQueueState.self, forKey: Self.storageKey) ?? RunQueueState()
        state = s
        return s
    }

    private func save(_ s: RunQueueState) {
        state = s
        kv.setValue(s, forKey: Self.storageKey)
        emit()
    }

    public func enqueue(_ req: SubmitRunRequest) {
        var s = load()
        if s.results[req.clientRunId] != nil || s.items.contains(where: { $0.req.clientRunId == req.clientRunId }) { return }
        let t = now()
        s.items.append(QueuedRun(req: req, attempts: 0, nextAttemptAt: t, createdAt: t, lastError: nil))
        save(s)
    }

    public func pending() -> [QueuedRun] { load().items }

    public func result(_ clientRunId: String) -> RunSummary? { load().results[clientRunId] }

    public func status(_ clientRunId: String) -> QueuedRunStatus {
        let s = load()
        if s.results[clientRunId] != nil { return .done }
        if let msg = s.dropped[clientRunId] { return .failed(msg) }
        if s.items.contains(where: { $0.req.clientRunId == clientRunId }) { return .pending }
        return .unknown
    }

    /// Üstel geri çekilme ±%20 titreşim.
    public nonisolated func backoff(_ attempts: Int, random r: Double) -> Int64 {
        let exp = min(maxDelay, base * pow(2, Double(max(0, attempts - 1))))
        return Int64(jsRound(exp * (0.8 + 0.4 * r)))
    }

    /// Vakti gelen işleri gönderir. `force` geri çekilmeyi yok sayar ("Tekrar dene").
    public func flush(force: Bool = false) async {
        if let f = flushing { return await f.value }
        let task = Task { await self.doFlush(force: force) }
        flushing = task
        await task.value
        flushing = nil
    }

    private func doFlush(force: Bool) async {
        let t0 = now()
        let due = load().items.filter { force || $0.nextAttemptAt <= t0 }
        for item in due {
            let id = item.req.clientRunId
            do {
                let summary = try await submit(item.req)
                var s = load()
                s.items.removeAll { $0.req.clientRunId == id }
                s.results[id] = summary
                s.resultOrder.removeAll { $0 == id }
                s.resultOrder.append(id)
                while s.resultOrder.count > keep { s.results[s.resultOrder.removeFirst()] = nil }
                save(s)
            } catch {
                var s = load()
                guard let idx = s.items.firstIndex(where: { $0.req.clientRunId == id }) else { continue }
                let api = error as? ApiError
                s.items[idx].attempts += 1
                s.items[idx].lastError = api?.message ?? String(describing: error)
                if let api, !api.isRetryable, api.status != 401 {
                    // Kalıcı hata: tekrar göndermek sonucu değiştirmez.
                    s.dropped[id] = api.message
                    s.items.remove(at: idx)
                } else {
                    s.items[idx].nextAttemptAt = now() + backoff(s.items[idx].attempts, random: random())
                }
                save(s)
                // Ağ yoksa diğerlerini de deneme.
                if api?.isNetwork == true { break }
            }
        }
    }

    /// En yakın deneme zamanı (zamanlayıcı ve arka plan görevi için).
    public func nextDueAt() -> Int64? { load().items.map(\.nextAttemptAt).min() }
}
