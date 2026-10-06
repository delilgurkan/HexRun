import { duelHp, hatA11y, hatLabel, hatSegments, siegeLevel } from '../components/hatMath';

describe('Hat göstergesi', () => {
  it('85 güç: 8 tam segment + yarım segment', () => {
    const s = hatSegments({ power: 85 });
    expect(s).toHaveLength(10);
    expect(s.slice(0, 8).every((x) => x.owner === 1)).toBe(true);
    expect(s[8]!.owner).toBeCloseTo(0.5);
    expect(s[9]!.owner).toBe(0);
    expect(s.every((x) => x.attack === 0)).toBe(true);
  });

  it('düello: tarama sahibin dolgusunun üstüne biner (60/85)', () => {
    const s = hatSegments({ power: 85, progress: 60 });
    expect(s.filter((x) => x.attack === 1)).toHaveLength(6);
    expect(s[6]!.attack).toBe(0);
    expect(hatLabel({ power: 85, progress: 60 })).toBe('60/85');
    expect(duelHp(85, 60)).toBe(25);
  });

  it('ilerleme gücü geçemez', () => {
    const s = hatSegments({ power: 50, progress: 80 });
    expect(s.filter((x) => x.attack > 0)).toHaveLength(5);
  });

  it('hayalet segment: eriyen güç soluk kalır (72, −9)', () => {
    const s = hatSegments({ power: 72, ghost: 9 });
    expect(s[7]!.owner).toBeCloseTo(0.2);
    expect(s[7]!.ghost).toBe(1);
    expect(s[8]!.ghost).toBeCloseTo(0.1);
    expect(hatLabel({ power: 72, ghost: 9 })).toBe('72 (−9)');
  });

  it('sınırlar ve kuşatma eşikleri', () => {
    expect(hatSegments({ power: 140 }).every((x) => x.owner === 1)).toBe(true);
    expect(hatSegments({ power: -5 }).every((x) => x.owner === 0)).toBe(true);
    expect(siegeLevel(85, 60)).toBe('warn');
    expect(siegeLevel(85, 80)).toBe('alarm');
    expect(siegeLevel(85, 20)).toBe('none');
    expect(siegeLevel(85, null)).toBe('none');
    expect(hatA11y({ power: 85, progress: 60 })).toContain('düello canı 25');
  });
});
