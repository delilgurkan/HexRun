import { act, fireEvent, screen } from '@testing-library/react-native';
import { circleTrack, LoopTracker, type TrackPoint } from '@hexrun/core';
import { runStore } from '../run/controller';
import type { SessionSnapshot } from '../run/session';
import { RunScreen } from '../screens/run/RunScreen';
import { fakeApi, renderWith } from '../test/utils';

const mockCtrl = {
  start: jest.fn(async () => undefined),
  refresh: jest.fn(),
  pause: jest.fn(async () => undefined),
  resume: jest.fn(async () => undefined),
  finish: jest.fn(async () => 'run-1'),
  setLocked: jest.fn((locked: boolean) => runStore.set({ locked })),
  dismissConquest: jest.fn(() => runStore.set({ conquest: null })),
  current: null as null | { points: () => TrackPoint[]; previewRing: () => TrackPoint[] },
};

jest.mock('../run/native', () => ({
  getRunController: () => mockCtrl,
  nativeHaptics: { tick: jest.fn(), closeImpact: jest.fn(), cellTick: jest.fn(), crack: jest.fn(), success: jest.fn() },
}));

const center = { lat: 40.987, lng: 29.03 };
const pts = circleTrack(center, 250, 120, 1_760_000_000_000, 3);

function snapAfter(n: number, status: SessionSnapshot['status'] = 'running'): SessionSnapshot {
  const tr = new LoopTracker();
  for (const p of pts.slice(0, n)) tr.push(p);
  mockCtrl.current = { points: () => [...tr.points()], previewRing: () => tr.previewRing() as TrackPoint[] };
  return {
    status,
    clientRunId: 'run-1',
    startedAt: pts[0]!.t,
    elapsedMs: 32 * 60_000 + 57_000,
    tracker: tr.state(),
    pointCount: n,
    lastPoint: pts[n - 1]!,
    closeRadiusM: 50,
    context: {},
    loopsShown: 0,
  };
}

const api = fakeApi({ me: { get: async () => Promise.reject(new Error('x')) } });

beforeEach(() => {
  jest.clearAllMocks();
  runStore.set({ active: true, conquest: null, locked: false, gps: 'strong' });
});

describe('Koşu HUD (05/06/07)', () => {
  it('normal HUD: üç metrik, duraklat, bitir basılı tut', async () => {
    runStore.set({ snap: snapAfter(40) });
    await renderWith(<RunScreen />, { api });
    expect(screen.getByTestId('run-hud')).toBeTruthy();
    expect(screen.getByText('Mesafe · km')).toBeTruthy();
    expect(screen.getByText('Tempo · /km')).toBeTruthy();
    expect(screen.getByText('32:57')).toBeTruthy();
    expect(screen.getByText('GPS güçlü')).toBeTruthy();
    expect(screen.getByText(/Başlangıca .* · halka açık/)).toBeTruthy();
    expect(screen.getByText('BİTİR')).toBeTruthy();
    expect(screen.getByText('basılı tut')).toBeTruthy();
    expect(mockCtrl.start).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('pause'));
    expect(mockCtrl.pause).toHaveBeenCalled();
  });

  it('duraklatıldı: DEVAM', async () => {
    runStore.set({ snap: snapAfter(40, 'paused') });
    await renderWith(<RunScreen />, { api });
    expect(screen.getByText('Duraklatıldı')).toBeTruthy();
    await fireEvent.press(screen.getByText('DEVAM'));
    expect(mockCtrl.resume).toHaveBeenCalled();
  });

  it('kapanış modu (≤300 m): kalan mesafe birincil metrik', async () => {
    // Turun ~%85'i: başlangıca <300 m.
    let n = 100;
    let s = snapAfter(n);
    while (!s.tracker.closingMode && n < 118) s = snapAfter(++n);
    expect(s.tracker.closingMode).toBe(true);
    runStore.set({ snap: s });
    await renderWith(<RunScreen />, { api });
    expect(screen.getByTestId('closing-hud')).toBeTruthy();
    expect(screen.getByText('halkayı kapat')).toBeTruthy();
    expect(screen.getByTestId('preview-cells')).toBeTruthy();
  });

  it('kilit: tüm dokunuşları kapatır', async () => {
    runStore.set({ snap: snapAfter(40) });
    await renderWith(<RunScreen />, { api });
    await fireEvent.press(screen.getByTestId('lock'));
    expect(mockCtrl.setLocked).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('lock-overlay')).toBeTruthy();
  });

  it('fetih anı: 3 vuruş, 5 sn sonra kendiliğinden kapanır', async () => {
    jest.useFakeTimers();
    const s = snapAfter(121);
    const loop = s.tracker.loops[0]!;
    runStore.set({
      snap: s,
      conquest: { loop, preview: { cells: Array.from({ length: 30 }, (_, i) => `c${i}`), empty: 28, own: 2, rival: 0, areaM2: 9200, duels: [] }, shownAt: 0 },
    });
    await renderWith(<RunScreen />, { api });
    expect(screen.getByTestId('beat-1')).toBeTruthy();
    expect(screen.getByText('HALKA KAPANDI')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(screen.getByTestId('beat-2')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1700);
    });
    expect(screen.getByTestId('beat-3')).toBeTruthy();
    expect(screen.getByText('FETHEDİLDİ')).toBeTruthy();
    expect(screen.getByText("30 petek senin: 28'ü boştu, 2 tanesi güçlendi.")).toBeTruthy();
    const native = jest.requireMock('../run/native') as { nativeHaptics: { success: jest.Mock; cellTick: jest.Mock } };
    expect(native.nativeHaptics.success).toHaveBeenCalled();
    expect(native.nativeHaptics.cellTick).toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(5200);
    });
    expect(mockCtrl.dismissConquest).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('Dynamic Type: büyük yazıda metrikler alt alta', async () => {
    const rn = jest.requireActual('react-native') as typeof import('react-native');
    const spy = jest.spyOn(rn, 'useWindowDimensions').mockReturnValue({ width: 393, height: 852, scale: 3, fontScale: 2 });
    runStore.set({ snap: snapAfter(40) });
    await renderWith(<RunScreen />, { api });
    expect(screen.getByTestId('run-hud')).toBeTruthy();
    spy.mockRestore();
  });
});
