// Tests zuerst (TDD): Datums-Helfer.
import { describe, it, expect } from 'vitest';
import { isoDate, timeOf, shiftDays, startOfWeek, localDateOf } from './dates';

describe('isoDate', () => {
  it('formatiert ein Datum als YYYY-MM-DD mit führenden Nullen', () => {
    expect(isoDate(new Date(2026, 5, 3))).toBe('2026-06-03'); // Monat 5 = Juni (0-basiert)
  });
});

describe('timeOf', () => {
  it('liest die Uhrzeit HH:MM aus einem lokalen ISO-Zeitstempel', () => {
    expect(timeOf('2026-06-12T09:30:00')).toBe('09:30');
  });

  it('rechnet UTC-Zeitstempel (CalDAV) in die lokale Uhrzeit um', () => {
    const utc = '2026-06-12T07:00:00Z';
    const expected = new Intl.DateTimeFormat('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(utc));
    expect(timeOf(utc)).toBe(expected);
  });
});

describe('localDateOf', () => {
  it('liefert das lokale Datum für lokale/floating Zeitstempel', () => {
    expect(localDateOf('2026-06-12T10:00:00')).toBe('2026-06-12');
    expect(localDateOf('2026-06-13')).toBe('2026-06-13');
  });

  it('rechnet UTC-Zeitstempel auf den LOKALEN Tag um (Mitternachts-Kante)', () => {
    const utc = '2026-06-12T22:30:00Z';
    expect(localDateOf(utc)).toBe(isoDate(new Date(utc)));
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

describe('startOfWeek', () => {
  it('liefert den Montag der Woche (Freitag → Montag davor)', () => {
    expect(isoDate(startOfWeek(new Date(2026, 5, 12)))).toBe('2026-06-08'); // Fr 12.6.
  });

  it('zählt den Sonntag zur laufenden Woche (deutsche Wochenlogik)', () => {
    expect(isoDate(startOfWeek(new Date(2026, 5, 14)))).toBe('2026-06-08'); // So 14.6.
  });

  it('lässt einen Montag unverändert', () => {
    expect(isoDate(startOfWeek(new Date(2026, 5, 8)))).toBe('2026-06-08');
  });
});
