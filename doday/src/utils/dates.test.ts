// Tests zuerst (TDD): Datums-Helfer.
import { describe, it, expect } from 'vitest';
import { isoDate, timeOf, shiftDays } from './dates';

describe('isoDate', () => {
  it('formatiert ein Datum als YYYY-MM-DD mit führenden Nullen', () => {
    expect(isoDate(new Date(2026, 5, 3))).toBe('2026-06-03'); // Monat 5 = Juni (0-basiert)
  });
});

describe('timeOf', () => {
  it('liest die Uhrzeit HH:MM aus einem ISO-Zeitstempel', () => {
    expect(timeOf('2026-06-12T09:30:00')).toBe('09:30');
  });
});

describe('shiftDays', () => {
  it('verschiebt ein Datum um n Tage nach vorn', () => {
    expect(isoDate(shiftDays(new Date(2026, 5, 12), 1))).toBe('2026-06-13');
  });

  it('beherrscht Monatswechsel', () => {
    expect(isoDate(shiftDays(new Date(2026, 5, 30), 1))).toBe('2026-07-01');
  });

  it('verschiebt mit negativem n zurück', () => {
    expect(isoDate(shiftDays(new Date(2026, 5, 1), -1))).toBe('2026-05-31');
  });

  it('verändert das Original-Datum nicht', () => {
    const original = new Date(2026, 5, 12);
    shiftDays(original, 5);
    expect(isoDate(original)).toBe('2026-06-12');
  });
});
