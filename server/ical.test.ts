// Tests zuerst (TDD): Mini-iCalendar-Parser für genau die Felder, die doday braucht.
import { describe, it, expect } from 'vitest';
import {
  parseEvents,
  parseTodo,
  setTodoCompleted,
  buildTodoIcs,
  parseMultistatus,
} from './ical';

const EVENT_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:abc-123',
  'DTSTAMP:20260601T080000Z',
  'DTSTART:20260612T070000Z',
  'DTEND:20260612T071500Z',
  'SUMMARY:Standup #Arbeit.Projekte',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('parseEvents', () => {
  it('liest UID, Zeiten (UTC) und SUMMARY aus einem VEVENT', () => {
    const events = parseEvents(EVENT_ICS);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      uid: 'abc-123',
      summary: 'Standup #Arbeit.Projekte',
      start: '2026-06-12T07:00:00Z',
      end: '2026-06-12T07:15:00Z',
      allDay: false,
    });
  });

  it('liest mehrere VEVENTs (expandierte Wiederholungen) aus einer Datei', () => {
    const two = EVENT_ICS.replace(
      'END:VEVENT',
      'END:VEVENT\r\nBEGIN:VEVENT\r\nUID:abc-123\r\nDTSTART:20260613T070000Z\r\nDTEND:20260613T071500Z\r\nSUMMARY:Standup #Arbeit.Projekte\r\nEND:VEVENT',
    );
    expect(parseEvents(two)).toHaveLength(2);
  });

  it('erkennt ganztägige Termine (VALUE=DATE)', () => {
    const allDay = EVENT_ICS.replace(
      'DTSTART:20260612T070000Z',
      'DTSTART;VALUE=DATE:20260613',
    ).replace('DTEND:20260612T071500Z', 'DTEND;VALUE=DATE:20260614');
    const events = parseEvents(allDay);
    expect(events[0].allDay).toBe(true);
    expect(events[0].start).toBe('2026-06-13');
  });

  it('entfaltet gefaltete Zeilen und entschärft Escapes', () => {
    const folded = EVENT_ICS.replace(
      'SUMMARY:Standup #Arbeit.Projekte',
      'SUMMARY:Standup\\, lange Beschreibu\r\n ng #Arbeit',
    );
    expect(parseEvents(folded)[0].summary).toBe('Standup, lange Beschreibung #Arbeit');
  });
});

const TODO_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VTODO',
  'UID:todo-1',
  'DTSTAMP:20260601T080000Z',
  'SUMMARY:Keller entrümpeln #Zuhause.Aufräumen',
  'DUE;VALUE=DATE:20260613',
  'END:VTODO',
  'END:VCALENDAR',
].join('\r\n');

describe('parseTodo', () => {
  it('liest UID, SUMMARY und DUE (Datum)', () => {
    expect(parseTodo(TODO_ICS)).toEqual({
      uid: 'todo-1',
      summary: 'Keller entrümpeln #Zuhause.Aufräumen',
      due: '2026-06-13',
      completed: false,
    });
  });

  it('erkennt erledigte Aufgaben (STATUS:COMPLETED)', () => {
    const done = TODO_ICS.replace('END:VTODO', 'STATUS:COMPLETED\r\nEND:VTODO');
    expect(parseTodo(done)?.completed).toBe(true);
  });
});

describe('setTodoCompleted', () => {
  it('hakt ab: setzt STATUS, COMPLETED und PERCENT-COMPLETE, Rest bleibt', () => {
    const done = setTodoCompleted(TODO_ICS, true, new Date(Date.UTC(2026, 5, 12, 18, 0, 0)));
    expect(done).toContain('STATUS:COMPLETED');
    expect(done).toContain('COMPLETED:20260612T180000Z');
    expect(done).toContain('PERCENT-COMPLETE:100');
    expect(done).toContain('SUMMARY:Keller entrümpeln #Zuhause.Aufräumen'); // unangetastet
  });

  it('macht das Abhaken rückgängig (NEEDS-ACTION, keine COMPLETED-Zeile)', () => {
    const done = setTodoCompleted(TODO_ICS, true, new Date());
    const undone = setTodoCompleted(done, false, new Date());
    expect(undone).toContain('STATUS:NEEDS-ACTION');
    expect(undone).not.toContain('COMPLETED:');
    expect(undone).not.toContain('PERCENT-COMPLETE:100');
  });
});

describe('buildTodoIcs', () => {
  it('baut ein gültiges VTODO mit SUMMARY, DUE und UID', () => {
    const ics = buildTodoIcs({ uid: 'neu-1', title: 'Angebot schreiben #Arbeit', due: '2026-06-13' });
    expect(ics).toContain('BEGIN:VTODO');
    expect(ics).toContain('UID:neu-1');
    expect(ics).toContain('SUMMARY:Angebot schreiben #Arbeit');
    expect(ics).toContain('DUE;VALUE=DATE:20260613');
    expect(ics).toContain('\r\n');
  });

  it('lässt DUE weg, wenn kein Datum gesetzt ist', () => {
    expect(buildTodoIcs({ uid: 'x', title: 'Irgendwann' })).not.toContain('DUE');
  });
});

describe('buildEventIcsUtc', () => {
  it('baut ein VEVENT mit UTC-Zeiten für die Nextcloud', async () => {
    const { buildEventIcsUtc } = await import('./ical');
    const ics = buildEventIcsUtc({
      uid: 'ev-1',
      title: 'Zahnarzt #Gesundheit',
      startUtc: new Date(Date.UTC(2026, 5, 13, 7, 30)),
      endUtc: new Date(Date.UTC(2026, 5, 13, 8, 15)),
    });
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART:20260613T073000Z');
    expect(ics).toContain('DTEND:20260613T081500Z');
    expect(ics).toContain('SUMMARY:Zahnarzt #Gesundheit');
  });
});

describe('parseMultistatus', () => {
  it('liest href, etag und calendar-data aus einer SabreDAV-Antwort', () => {
    const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
 <d:response>
  <d:href>/remote.php/dav/calendars/uli/personal/abc.ics</d:href>
  <d:propstat><d:prop>
   <d:getetag>&quot;etag-1&quot;</d:getetag>
   <cal:calendar-data>BEGIN:VCALENDAR&#13;
BEGIN:VEVENT&#13;
SUMMARY:Test &amp; mehr&#13;
END:VEVENT&#13;
END:VCALENDAR&#13;
</cal:calendar-data>
  </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
 </d:response>
</d:multistatus>`;
    const objects = parseMultistatus(xml);
    expect(objects).toHaveLength(1);
    expect(objects[0].href).toBe('/remote.php/dav/calendars/uli/personal/abc.ics');
    expect(objects[0].etag).toBe('"etag-1"');
    expect(objects[0].data).toContain('SUMMARY:Test & mehr');
  });
});
