import { fmtArea, fmtDuration, fmtKm, fmtPace, initials } from '@hexrun/core';
import { closingRemainingM, closingTicks } from '../run/closing';
import { dayGroup, hhmm, relativeLabel, runRangeLabel, shareDateLabel } from '../lib/dates';
import { fillSchedule } from '../run/conquest';
import { silhouettePath } from '../components/Silhouette';

describe('biçimlendirme (core)', () => {
  it('Türkçe sayılar', () => {
    expect(fmtKm(6120)).toBe('6,12');
    expect(fmtPace(323)).toBe(`5'23"`);
    expect(fmtPace(null)).toBe(`–'––"`);
    expect(fmtDuration(32 * 60_000 + 57_000)).toBe('32:57');
    expect(fmtArea(19220)).toBe('19.220 m²');
    expect(initials('Deniz Arslan')).toBe('DA');
  });
});

describe('tarih etiketleri', () => {
  const start = Date.parse('2026-10-04T03:29:00Z'); // 06:29 İstanbul
  const end = Date.parse('2026-10-04T04:14:00Z');
  it('koşu aralığı', () => {
    expect(runRangeLabel(start, end)).toBe('4 Ekim Pazar · 06:29–07:14');
    expect(shareDateLabel(start)).toBe('4 EKİM 2026');
    expect(hhmm(start)).toBe('06:29');
  });
  it('gün grupları', () => {
    const now = Date.parse('2026-10-05T09:00:00Z');
    expect(dayGroup(start, now)).toBe('yesterday');
    expect(dayGroup(now - 60_000, now)).toBe('today');
    expect(dayGroup(now - 3 * 86_400_000, now)).toBe('week');
    expect(dayGroup(now - 30 * 86_400_000, now)).toBe('earlier');
    expect(relativeLabel(start, now)).toBe('Dün 06:29');
  });
});

describe('kapanış modu haptik tıkları', () => {
  it('her 10 m tek tık', () => {
    expect(closingTicks(100, 85)).toEqual(['single']);
    expect(closingTicks(300, 281)).toEqual(['single']);
  });
  it('son 20 m iki kat sık ve çift', () => {
    expect(closingTicks(72, 60)).toEqual(['double', 'double']);
  });
  it('uzaklaşırken ya da mod dışında tık yok', () => {
    expect(closingTicks(80, 90)).toEqual([]);
    expect(closingTicks(400, 320)).toEqual([]);
  });
  it('en çok 3 tık', () => {
    expect(closingTicks(300, 100)).toHaveLength(3);
  });
  it('kalan mesafe 5 m yuvarlanır', () => {
    expect(closingRemainingM(86.4)).toBe(85);
  });
});

describe('dolum dalgası', () => {
  it('14 ms/hücre, en çok 1,5 sn', () => {
    expect(fillSchedule(3)).toEqual([0, 14, 28]);
    const big = fillSchedule(500);
    expect(big[big.length - 1]!).toBeLessThanOrEqual(1500);
  });
});

describe('silüet', () => {
  it('halkaları kutuya sığdırır', () => {
    const d = silhouettePath([[{ lat: 41, lng: 29 }, { lat: 41.001, lng: 29 }, { lat: 41.001, lng: 29.001 }]], 100, 100);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });
});
