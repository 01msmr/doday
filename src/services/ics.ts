// ICS-Erzeugung: Der Weg von der Web-App in den Geräte-Kalender.
// Eine .ics-Datei ist das Standardformat (RFC 5545), das iOS/macOS/Android
// beim Öffnen direkt dem System-Kalender anbieten ("Geräte-Dienste").
// Die #Tags bleiben im Titel (SUMMARY) – synchronisiert das Gerät seinen
// Kalender mit Nextcloud, landet der Termin samt Tags automatisch dort.

export interface IcsEventInput {
  /** Titel inkl. #Tags, z. B. "Zahnarzt #Gesundheit" */
  title: string;
  /** Tag des Termins, z. B. "2026-06-13" */
  date: string;
  /** Beginn "HH:MM" */
  start: string;
  /** Ende "HH:MM" */
  end: string;
}

/** "2026-06-13" + "09:30" → "20260613T093000" (lokale/floating Zeit) */
function icsStamp(date: string, time: string): string {
  return `${date.replaceAll('-', '')}T${time.replace(':', '')}00`;
}

/** Sonderzeichen nach RFC 5545 escapen (\ ; , und Zeilenumbrüche) */
function escapeIcsText(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\n', '\\n');
}

export function buildEventIcs(event: IcsEventInput): string {
  // DTSTAMP (Erstellzeitpunkt) muss UTC sein: 20260612T171530Z
  const dtstamp = `${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//doday//DE',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@doday`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${icsStamp(event.date, event.start)}`,
    `DTEND:${icsStamp(event.date, event.end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  // RFC 5545 verlangt CRLF-Zeilenenden
  return lines.join('\r\n') + '\r\n';
}
