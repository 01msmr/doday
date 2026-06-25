// Tests zuerst (TDD): Datums-Helfer.
import { describe, it, expect, afterEach } from 'vitest';
import { isoDate, timeOf, timeInputValue, shiftDays, startOfWeek, localDateOf, isoWeek } from './dates';
import { setLang } from '../i18n';

describe('isoDate', () => {
  it('formatiert ein Datum als YYYY-MM-DD mit führenden Nullen', () => {
    expect(isoDate(new Date(2026, 5, 3))).toBe('2026-06-03'); // Monat 5 = Juni (0-basiert)
  });
});

// Sprache nach jedem Test zurücksetzen, damit die Reihenfolge egal bleibt.
afterEach(() => setLang('de'));

describe('timeOf (Deutsch, 24h)', () => {
  it('liest die Uhrzeit H:MM (ohne führende Null) aus einem lokalen ISO-Zeitstempel', () => {
    expect(timeOf('2026-06-12T09:30:00')).toBe('9:30');
    expect(timeOf('2026-06-12T00:30:00')).toBe('0:30');
    expect(timeOf('2026-06-12T13:05:00')).toBe('13:05');
  });

  it('rechnet UTC-Zeitstempel (CalDAV) in die lokale Uhrzeit um (ohne führende Null)', () => {
    const utc = '2026-06-12T07:00:00Z';
    const local = new Date(utc);
    const expected = `${local.getHours()}:${String(local.getMinutes()).padStart(2, '0')}`;
    expect(timeOf(utc)).toBe(expected);
  });
});

describe('timeOf (Englisch, 12h AM/PM)', () => {
  it('formatiert im US-Format mit AM/PM, inkl. Mitternacht/Mittag', () => {
    setLang('en');
    expect(timeOf('2026-06-12T09:30:00')).toBe('9:30 AM');
    expect(timeOf('2026-06-12T00:30:00')).toBe('12:30 AM');
    expect(timeOf('2026-06-12T12:00:00')).toBe('12:00 PM');
    expect(timeOf('2026-06-12T13:05:00')).toBe('1:05 PM');
  });
});

describe('timeInputValue', () => {
  it('liefert IMMER 24h, zweistellig – sprachunabhängig (für <input type=time>)', () => {
    expect(timeInputValue('2026-06-12T09:30:00')).toBe('09:30');
    expect(timeInputValue('2026-06-12T13:05:00')).toBe('13:05');
    setLang('en');
    expect(timeInputValue('2026-06-12T09:30:00')).toBe('09:30');
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

describe('isoWeek', () => {
  it('liefert die ISO-Kalenderwoche (Donnerstag bestimmt die Woche)', () => {
    // 2026 beginnt an einem Donnerstag → 1. Januar liegt in KW 1
    expect(isoWeek(new Date('2026-01-01T12:00:00'))).toBe(1);
    expect(isoWeek(new Date('2026-06-12T12:00:00'))).toBe(24);
  });

  it('ordnet Jahreswechsel-Tage der richtigen Woche zu', () => {
    // Mo 29.12.2025 gehört schon zur KW 1 des Jahres 2026
    expect(isoWeek(new Date('2025-12-29T12:00:00'))).toBe(1);
    // Fr 1.1.2027 gehört noch zur KW 53 des Jahres 2026
    expect(isoWeek(new Date('2027-01-01T12:00:00'))).toBe(53);
  });
});
