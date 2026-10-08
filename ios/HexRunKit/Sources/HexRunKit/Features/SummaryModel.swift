import Foundation
import Observation

/// 08 · Koşu özeti: önce toprak, sonra fitness. A kapandı · B açık kaldı · C düello önerisi · inceleniyor.
public enum SummaryPresenter {
    public enum Variant: Sendable, Equatable { case closed, open, suggestion, review }

    public static func variant(_ s: RunSummary) -> Variant {
        if s.status == .review { return .review }
        let gained = s.loops.contains { $0.status == .applied && ($0.newCells > 0 || $0.capturedCells > 0 || $0.reinforced > 0) }
        if !s.suggestions.isEmpty && !s.loops.contains(where: { $0.capturedCells > 0 }) { return .suggestion }
        if s.status == .open || (!gained && s.loops.isEmpty) { return .open }
        return .closed
    }

    public static func totalCells(_ s: RunSummary) -> Int { s.loops.reduce(0) { $0 + $1.newCells + $1.capturedCells } }
    public static func duelCells(_ s: RunSummary) -> Int { s.loops.reduce(0) { $0 + $1.capturedCells } }
    public static func wonHits(_ s: RunSummary) -> [DuelHitDto] { s.loops.flatMap(\.hits).filter { $0.role == .attack && $0.captured } }
    public static func firstCountedHit(_ s: RunSummary) -> DuelHitDto? { s.loops.flatMap(\.hits).first { $0.counted } }
    public static func pendingCells(_ s: RunSummary) -> Int { s.loops.reduce(0) { $0 + $1.cells } }
    public static func range(_ s: RunSummary) -> String { TRDate.runRange(s.startedAt, s.endedAt) }
}

@MainActor
@Observable
public final class SummaryModel {
    public enum Phase: Equatable, Sendable { case sending, pending, failed(String), done(RunSummary), loadingRemote, remoteFailed }

    public let request: SummaryRequest
    public private(set) var phase: Phase
    public var noteSent = false
    @ObservationIgnored private let app: AppModel
    @ObservationIgnored private var sub: UUID?
    @ObservationIgnored private let sendingGraceMs: UInt64

    public init(app: AppModel, request: SummaryRequest, sendingGraceMs: UInt64 = 8_000) {
        self.app = app
        self.request = request
        self.sendingGraceMs = sendingGraceMs
        if case .remote = request { phase = .loadingRemote } else { phase = .sending }
    }

    public var summary: RunSummary? { if case let .done(s) = phase { return s }; return nil }

    /// Durumu izler: kuyruk her değiştiğinde ve gecikme sonunda kontrol eder.
    public func start() async {
        switch request {
        case let .remote(id):
            do { phase = .done(try await app.api.run(id)) } catch { phase = .remoteFailed }
        case let .queued(cid):
            let q = app.queue
            sub = await q.subscribe { [weak self] in Task { @MainActor in await self?.check(cid) } }
            await check(cid)
            Task { @MainActor [weak self, sendingGraceMs] in
                try? await Task.sleep(nanoseconds: sendingGraceMs * 1_000_000)
                if self?.phase == .sending { self?.phase = .pending }
            }
        }
    }

    public func stop() async {
        if let s = sub { await app.queue.unsubscribe(s) }
        sub = nil
    }

    func check(_ cid: String) async {
        switch await app.queue.status(cid) {
        case .done:
            if let s = await app.queue.result(cid) {
                if case .done = phase { return }
                phase = .done(s)
            }
        case let .failed(msg): phase = .failed(msg)
        case .pending, .unknown: if phase != .sending { phase = .pending }
        }
    }

    public func retry() async {
        guard case let .queued(cid) = request else {
            phase = .loadingRemote
            await start()
            return
        }
        phase = .sending
        await app.queue.flush(force: true)
        await check(cid)
    }

    public func sendNote(_ text: String) async {
        guard let s = summary, !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        do {
            try await app.api.runNote(s.id, text: text.trimmingCharacters(in: .whitespaces))
            noteSent = true
        } catch {}
    }
}
