import Foundation

/// Uzak veri durumu: son bilinen değer hata sırasında korunur (çevrimdışı/eski görünüm).
public struct Remote<T: Sendable>: Sendable {
    public var value: T?
    public var error: ApiError?
    public var loading = false
    public init(value: T? = nil) { self.value = value }

    /// İlk yükleme (henüz veri yok).
    public var isInitialLoading: Bool { value == nil && error == nil }
    public var isFailed: Bool { error != nil }
}

@MainActor
public protocol RemoteLoading: AnyObject {}

public extension RemoteLoading {
    func load<T>(_ kp: ReferenceWritableKeyPath<Self, Remote<T>>, _ op: () async throws -> T) async {
        self[keyPath: kp].loading = true
        do {
            let v = try await op()
            self[keyPath: kp].value = v
            self[keyPath: kp].error = nil
        } catch is CancellationError {
        } catch {
            if (error as? ApiError) != .cancelled { self[keyPath: kp].error = (error as? ApiError) ?? .network }
        }
        self[keyPath: kp].loading = false
    }
}

/// Basit gecikmeli çalıştırıcı (kullanıcı adı, düello önizlemesi).
@MainActor
public final class Debouncer {
    private var task: Task<Void, Never>?
    private let ms: UInt64
    public init(ms: UInt64) { self.ms = ms }
    public func run(_ op: @escaping @MainActor () async -> Void) {
        task?.cancel()
        let delay = ms
        task = Task { @MainActor in
            try? await Task.sleep(nanoseconds: delay * 1_000_000)
            if Task.isCancelled { return }
            await op()
        }
    }
    public func cancel() { task?.cancel() }
}
