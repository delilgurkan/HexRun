import CoreLocation
import Foundation
import HexRunKit

/// CoreLocation: izin, anlık konum ve koşu sırasında arka planda en iyi doğrulukla izleme
/// (`CLBackgroundActivitySession`, `pausesLocationUpdatesAutomatically = false`, `.fitness`).
@MainActor
final class LocationService: NSObject, LocationProvider, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var onPoints: (@MainActor ([TrackPoint]) -> Void)?
    private var running = false
    private var backgroundSession: CLBackgroundActivitySession?
    private var authWaiters: [CheckedContinuation<LocationPermission, Never>] = []
    private var oneShot: [CheckedContinuation<CLLocation?, Never>] = []
    /// İzin/konum değişince (AppModel'e yansıtılır).
    var onPermission: ((LocationPermission) -> Void)?
    var onLocation: ((CLLocation) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        manager.activityType = .fitness
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    var permission: LocationPermission {
        switch manager.authorizationStatus {
        case .authorizedAlways: return .always
        case .authorizedWhenInUse: return .whenInUse
        case .denied, .restricted: return .denied
        default: return .unknown
        }
    }

    var lastKnown: LatLng? { manager.location.map { LatLng(lat: $0.coordinate.latitude, lng: $0.coordinate.longitude) } }

    /// Önce "kullanırken", sonra "her zaman" (arka plan) izni. Gerekçe ekranından sonra çağrılır.
    func requestPermission() async -> LocationPermission {
        if permission == .unknown {
            _ = await withCheckedContinuation { (c: CheckedContinuation<LocationPermission, Never>) in
                authWaiters.append(c)
                manager.requestWhenInUseAuthorization()
            }
        }
        if permission == .whenInUse {
            manager.requestAlwaysAuthorization()
        }
        return permission
    }

    /// Tek seferlik güncel konum (harita merkezi, gizlilik evi).
    func currentLocation() async -> CLLocation? {
        guard permission == .whenInUse || permission == .always else { return nil }
        return await withCheckedContinuation { (c: CheckedContinuation<CLLocation?, Never>) in
            oneShot.append(c)
            manager.requestLocation()
        }
    }

    func startMonitoringForMap() {
        guard permission == .whenInUse || permission == .always, !running else { return }
        manager.distanceFilter = 25
        manager.startUpdatingLocation()
    }

    func stopMonitoringForMap() {
        if !running { manager.stopUpdatingLocation() }
    }

    // MARK: LocationProvider

    func startRunUpdates(_ onPoints: @escaping @MainActor ([TrackPoint]) -> Void) {
        self.onPoints = onPoints
        running = true
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 3
        manager.activityType = .fitness
        manager.pausesLocationUpdatesAutomatically = false
        if permission == .always || permission == .whenInUse {
            manager.allowsBackgroundLocationUpdates = true
            manager.showsBackgroundLocationIndicator = true
            backgroundSession = CLBackgroundActivitySession()
        }
        manager.startUpdatingLocation()
    }

    func stopRunUpdates() {
        running = false
        onPoints = nil
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
        backgroundSession?.invalidate()
        backgroundSession = nil
        manager.distanceFilter = 25
    }

    // MARK: CLLocationManagerDelegate

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        MainActor.assumeIsolated {
            let p = self.permission
            if p != .unknown {
                let w = self.authWaiters
                self.authWaiters = []
                w.forEach { $0.resume(returning: p) }
            }
            self.onPermission?(p)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        MainActor.assumeIsolated {
            if let last = locations.last {
                let w = self.oneShot
                self.oneShot = []
                w.forEach { $0.resume(returning: last) }
                self.onLocation?(last)
            }
            guard self.running, let cb = self.onPoints else { return }
            let pts = locations
                .filter { $0.horizontalAccuracy >= 0 }
                .map { TrackPoint(lat: $0.coordinate.latitude, lng: $0.coordinate.longitude, t: $0.timestamp.epochMs, acc: $0.horizontalAccuracy) }
            if !pts.isEmpty { cb(pts) }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        MainActor.assumeIsolated {
            let w = self.oneShot
            self.oneShot = []
            w.forEach { $0.resume(returning: nil) }
        }
    }
}

/// UI testleri ve simülatör için: Moda çevresinde 200 m'lik halka koşusu (hızlandırılmış).
@MainActor
final class SimulatedLocation: LocationProvider {
    private var task: Task<Void, Never>?
    var intervalMs: UInt64 = 40

    func startRunUpdates(_ onPoints: @escaping @MainActor ([TrackPoint]) -> Void) {
        task?.cancel()
        let pts = Geo.circleTrack(center: Fixtures.moda, radiusM: 200, n: 180, t0: Date().epochMs, speedMps: 3.2)
        let interval = intervalMs
        task = Task { @MainActor in
            for p in pts {
                if Task.isCancelled { return }
                try? await Task.sleep(nanoseconds: interval * 1_000_000)
                onPoints([p])
            }
        }
    }

    func stopRunUpdates() {
        task?.cancel()
        task = nil
    }
}
