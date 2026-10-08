/**
 * Kesinleşen kural setinin sabitleri (tasarım: "Oyun kuralları" panosu).
 * Sunucu ve istemci aynı değerleri buradan okur; tek doğruluk kaynağı.
 */
export const RULES = {
  /** H3 çözünürlüğü: res 12 ≈ 307 m² / petek. */
  H3_RES: 12,
  /** Başlangıca dönüş mesafesi (m). */
  LOOP_CLOSE_M: 50,
  /** Halka Ustası nişanı ile yakalama mesafesi (m). */
  LOOP_CLOSE_M_MASTER: 60,
  /** Halkanın "kurulması" için başlangıçtan en az bu kadar uzaklaşmak gerekir (yakalama + histerezis). */
  LOOP_ARM_EXTRA_M: 50,
  /** Halka sayılması için asgari çevre (m). */
  MIN_LOOP_LENGTH_M: 400,
  /** Çaylak döneminde kısa halkalar da sayılır. */
  MIN_LOOP_LENGTH_M_NEWBIE: 200,
  /** HUD'un "halkayı kapat" moduna geçtiği mesafe (m). */
  CLOSING_MODE_M: 300,
  /** Boş petek alındığında güç (çarpan uygulanmaz). */
  NEW_CELL_POWER: 10,
  /** Öncü nişanı ile boş petek gücü. */
  NEW_CELL_POWER_PIONEER: 12,
  /** Sahibin halkası: güç artışı. */
  OWNER_GAIN: 10,
  /** Sahibin halkası saldırganın ilerlemesini geri iter. */
  PUSHBACK: 10,
  /** Sayılan saldırı halkası düello canını düşürür. */
  ATTACK: 10,
  /** Gizli tolerans: halka alanın en az bu oranını kapsamalı. Kullanıcıya gösterilmez. */
  DUEL_COVERAGE: 0.8,
  DUEL_MIN_CELLS: 7,
  DUEL_MAX_CELLS: 60,
  MAX_ACTIVE_DUELS: 3,
  /** Aynı düelloya günde sayılan halka. */
  ATTACK_DAILY_LIMIT: 2,
  NEWBIE_ATTACK_LIMIT: 3,
  NEWBIE_DAYS: 14,
  /** Sahibin aynı petek için günde sayılan halkası. */
  OWNER_DAILY_LIMIT: 2,
  /** Sahibin aynı düelloyu günde geri itme hakkı. */
  DEFENSE_DAILY_LIMIT: 2,
  /** Fetih canı: min(50, eski güç). */
  CAPTURE_POWER: 50,
  /** Sahip 24 saat halka atmazsa günde −5. */
  DECAY: 5,
  DECAY_AFTER_H: 24,
  /** Saldırgan 48 saat saldırmazsa ilerleme günde −10. */
  ATTACK_DECAY: 10,
  ATTACK_DECAY_AFTER_H: 48,
  /** İlk sayılan halka 48 saatte gelmezse düello silinir. */
  DUEL_EXPIRE_H: 48,
  MAX_POWER: 100,
  PRIVACY_RADIUS_MIN_M: 200,
  PRIVACY_RADIUS_MAX_M: 800,
  /** Kuşatma uyarı eşikleri (ilerleme / sahibin gücü). */
  SIEGE_WARN: 0.7,
  SIEGE_ALARM: 0.9,
  /** Push bildirim günlük tavanı. */
  PUSH_DAILY_CAP: 3,
  /** İçe aktarılan koşu yalnız son 24 saatte bittiyse haritaya işlenir. */
  IMPORT_MAP_WINDOW_H: 24,
  /** Nişan: aynı anda takılı slot ve günlük değişiklik. */
  INSIGNIA_SLOTS: 3,
  INSIGNIA_MAX_EFFECT: 0.2,
  /** Nişan + etkinlik toplam çarpanı tavanı. */
  MAX_TOTAL_MULTIPLIER: 2,
  /** Oyun saati dilimi (etkinlikler, günlük limitler). */
  TIMEZONE: 'Europe/Istanbul',
} as const;

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
