// Mini-iCalendar-Werkzeuge: genau die Felder, die doday braucht – nicht mehr.
// Bewusst kein voller RFC-5545-Parser: Wiederholungen (RRULE) expandiert uns
// der Nextcloud-Server selbst (CalDAV "expand"), Zeitzonen kommen dadurch
// immer als UTC an. Das hält diesen Code klein und testbar.

export interface ParsedEvent {
  uid: string;
  summary: string;
  /** UTC-ISO ("2026-06-12T07:00:00Z") oder Datum ("2026-06-13") bei ganztägig */
  start: string;
  end: string;
  allDay: boolean;
}

export interface ParsedTodo {
  uid: string;
  summary: string;
  due?: string;
  completed: boolean;
}

export interface DavObject {
  href: string;
  etag: string | null;
  data: string;
}

/** Gefaltete Zeilen zusammenziehen (Folgezeilen beginnen mit Leerzeichen/Tab) */
function unfold(ics: string): string {
  return ics.replace(/\r?\n[ \t]/g, '');
}

/** \\n, \\, \\; \\\\ zurückübersetzen */
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/** Erste Property-Zeile lesen: Name → { params, value } */
function getProp(block: string, name: string): { params: string; value: string } | null {
  const match = block.match(new RegExp(`^${name}((?:;[^:\\r\\n]*)?):(.*)$`, 'm'));
  if (!match) {
    return null;
  }
  return { params: match[1] ?? '', value: match[2].trim() };
}

/** "20260612T070000Z" → "2026-06-12T07:00:00Z"; "20260613" → "2026-06-13" */
function stampToIso(stamp: string): string {
  if (/^\d{8}$/.test(stamp)) {
    return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`;
  }
  const match = stamp.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) {
    return stamp;
  }
  const [, y, mo, d, h, mi, s, z] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${z}`;
}

/** Date → "20260613T073000Z" */
function dateToUtcStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

/** Alle BEGIN:X…END:X-Blöcke einer Komponente herausschneiden */
function blocks(ics: string, component: string): string[] {
  const result: string[] = [];
  const pattern = new RegExp(`BEGIN:${component}\\r?\\n([\\s\\S]*?)END:${component}`, 'g');
  for (const match of unfold(ics).matchAll(pattern)) {
    result.push(match[1]);
  }
  return result;
}

/** Alle VEVENTs einer iCal-Datei (durch expand können es mehrere Instanzen sein) */
export function parseEvents(ics: string): ParsedEvent[] {
  return blocks(ics, 'VEVENT').map((block) => {
    const start = getProp(block, 'DTSTART');
    const end = getProp(block, 'DTEND');
    const allDay = (start?.params ?? '').includes('VALUE=DATE');
    return {
      uid: getProp(block, 'UID')?.value ?? '',
      summary: unescapeText(getProp(block, 'SUMMARY')?.value ?? ''),
      start: stampToIso(start?.value ?? ''),
      end: stampToIso(end?.value ?? start?.value ?? ''),
      allDay,
    };
  });
}

/** Das (eine) VTODO einer iCal-Datei */
export function parseTodo(ics: string): ParsedTodo | null {
  const block = blocks(ics, 'VTODO')[0];
  if (!block) {
    return null;
  }
  const due = getProp(block, 'DUE');
  const status = getProp(block, 'STATUS')?.value;
  return {
    uid: getProp(block, 'UID')?.value ?? '',
    summary: unescapeText(getProp(block, 'SUMMARY')?.value ?? ''),
    due: due ? stampToIso(due.value).slice(0, 10) : undefined,
    completed: status === 'COMPLETED',
  };
}

/**
 * Aufgabe abhaken bzw. wieder öffnen – per Zeilen-Chirurgie im VTODO-Block,
 * damit alle übrigen Felder (Beschreibung, Erinnerungen, …) unangetastet bleiben.
 */
export function setTodoCompleted(ics: string, completed: boolean, now: Date): string {
  const lines = unfold(ics).split(/\r?\n/);
  const result: string[] = [];
  let inTodo = false;
  for (const line of lines) {
    if (line === 'BEGIN:VTODO') {
      inTodo = true;
    }
    // Alte Status-Zeilen im VTODO entfernen
    if (inTodo && /^(STATUS|COMPLETED|PERCENT-COMPLETE)[;:]/.test(line)) {
      continue;
    }
    if (inTodo && line === 'END:VTODO') {
      if (completed) {
        result.push('STATUS:COMPLETED', `COMPLETED:${dateToUtcStamp(now)}`, 'PERCENT-COMPLETE:100');
      } else {
        result.push('STATUS:NEEDS-ACTION');
      }
      inTodo = false;
    }
    result.push(line);
  }
  return result.join('\r\n');
}

/**
 * Aufgabe umschreiben (Titel + Fälligkeit) – gleiche Zeilen-Chirurgie wie beim
 * Abhaken: nur SUMMARY/DUE werden ersetzt, alles andere bleibt unangetastet.
 */
export function updateTodoIcs(ics: string, fields: { title: string; due?: string }): string {
  const lines = unfold(ics).split(/\r?\n/);
  const result: string[] = [];
  let inTodo = false;
  for (const line of lines) {
    if (line === 'BEGIN:VTODO') {
      inTodo = true;
    }
    // Alte SUMMARY-/DUE-Zeilen im VTODO entfernen – sie werden neu gesetzt
    if (inTodo && /^(SUMMARY|DUE)[;:]/.test(line)) {
      continue;
    }
    if (inTodo && line === 'END:VTODO') {
      result.push(`SUMMARY:${escapeText(fields.title)}`);
      if (fields.due) {
        result.push(`DUE;VALUE=DATE:${fields.due.replaceAll('-', '')}`);
      }
      inTodo = false;
    }
    result.push(line);
  }
  return result.join('\r\n');
}

/** Folgetag eines ISO-Datums – DTEND ganztägiger Termine ist EXKLUSIV */
function nextDayStamp(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

/**
 * Termin umschreiben (Titel + Zeiten). Getimte Termine bekommen UTC-Stempel,
 * ganztägige bleiben ganztägig (VALUE=DATE, exklusives Ende = Folgetag).
 * Nur für Einzeltermine gedacht – Serien (RRULE) prüft der Aufrufer vorher.
 */
export function updateEventIcs(
  ics: string,
  fields: { title: string; startUtc?: Date; endUtc?: Date; date?: string },
): string {
  const lines = unfold(ics).split(/\r?\n/);
  const result: string[] = [];
  let inEvent = false;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
    }
    if (inEvent && /^(SUMMARY|DTSTART|DTEND)[;:]/.test(line)) {
      continue;
    }
    if (inEvent && line === 'END:VEVENT') {
      result.push(`SUMMARY:${escapeText(fields.title)}`);
      if (fields.date) {
        result.push(
          `DTSTART;VALUE=DATE:${fields.date.replaceAll('-', '')}`,
          `DTEND;VALUE=DATE:${nextDayStamp(fields.date)}`,
        );
      } else if (fields.startUtc && fields.endUtc) {
        result.push(
          `DTSTART:${dateToUtcStamp(fields.startUtc)}`,
          `DTEND:${dateToUtcStamp(fields.endUtc)}`,
        );
      }
      inEvent = false;
    }
    result.push(line);
  }
  return result.join('\r\n');
}

/** Text für SUMMARY escapen */
function escapeText(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\n', '\\n');
}

/** Neue Aufgabe als iCal-Datei (für PUT in den Tasks-Kalender) */
export function buildTodoIcs(todo: { uid: string; title: string; due?: string }): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//doday//DE',
    'BEGIN:VTODO',
    `UID:${todo.uid}`,
    `DTSTAMP:${dateToUtcStamp(new Date())}`,
    `SUMMARY:${escapeText(todo.title)}`,
    ...(todo.due ? [`DUE;VALUE=DATE:${todo.due.replaceAll('-', '')}`] : []),
    'STATUS:NEEDS-ACTION',
    'END:VTODO',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** Neuer Termin als iCal-Datei mit UTC-Zeiten (für PUT in den Kalender) */
export function buildEventIcsUtc(event: {
  uid: string;
  title: string;
  startUtc: Date;
  endUtc: Date;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//doday//DE',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${dateToUtcStamp(new Date())}`,
    `DTSTART:${dateToUtcStamp(event.startUtc)}`,
    `DTEND:${dateToUtcStamp(event.endUtc)}`,
    `SUMMARY:${escapeText(event.title)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** Grund-Entities aus SabreDAV-XML zurückübersetzen */
function decodeXml(text: string): string {
  return text
    .replace(/&#13;/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Multistatus-Antwort eines REPORT/PROPFIND in (href, etag, data)-Objekte zerlegen */
export function parseMultistatus(xml: string): DavObject[] {
  const objects: DavObject[] = [];
  for (const match of xml.matchAll(/<d:response>([\s\S]*?)<\/d:response>/g)) {
    const body = match[1];
    const href = body.match(/<d:href>([^<]+)<\/d:href>/)?.[1];
    if (!href) {
      continue;
    }
    const etag = body.match(/<d:getetag>([^<]*)<\/d:getetag>/)?.[1];
    const data = body.match(/<cal:calendar-data[^>]*>([\s\S]*?)<\/cal:calendar-data>/)?.[1];
    objects.push({
      href,
      etag: etag ? decodeXml(etag) : null,
      data: data ? decodeXml(data) : '',
    });
  }
  return objects;
}
