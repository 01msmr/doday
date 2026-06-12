// Tests zuerst (TDD): ICS-Erzeugung für "Termin in den Geräte-Kalender".
import { describe, it, expect } from 'vitest';
import { buildEventIcs } from './ics';

const baseEvent = {
  title: 'Zahnarzt #Gesundheit',
  date: '2026-06-13',
  start: '09:30',
  end: '10:15',
};

describe('buildEventIcs', () => {
  it('erzeugt einen gültigen VCALENDAR/VEVENT-Rahmen', () => {
    const ics = buildEventIcs(baseEvent);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('setzt Start und Ende als lokale Zeit (floating)', () => {
    const ics = buildEventIcs(baseEvent);
    expect(ics).toContain('DTSTART:20260613T093000');
    expect(ics).toContain('DTEND:20260613T101500');
  });

  it('übernimmt den Titel inklusive #Tags in SUMMARY', () => {
    const ics = buildEventIcs(baseEvent);
    expect(ics).toContain('SUMMARY:Zahnarzt #Gesundheit');
  });

  it('escapet Sonderzeichen in SUMMARY (Komma, Semikolon)', () => {
    const ics = buildEventIcs({ ...baseEvent, title: 'Essen, kochen; planen' });
    expect(ics).toContain('SUMMARY:Essen\\, kochen\\; planen');
  });

  it('nutzt CRLF-Zeilenenden (RFC 5545) und vergibt eine UID', () => {
    const ics = buildEventIcs(baseEvent);
    expect(ics).toContain('\r\n');
    expect(ics).toMatch(/UID:[^\r\n]+@doday/);
  });
});
