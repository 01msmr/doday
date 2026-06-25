// CalDAV-Client: Kalender entdecken, Termine/Aufgaben abfragen, Objekte schreiben.
// Wie der WebDAV-Client bewusst nur fetch – die XML-Bodies sind kleine,
// feste Schablonen, die Antworten zerlegt server/ical.ts.
//
// Wichtigster Trick: Beim Termin-REPORT schicken wir <expand> mit –
// dann entfaltet die Nextcloud Wiederholungstermine (RRULE) selbst und
// liefert konkrete Instanzen in UTC. Uns bleibt simples Parsen.
import { parseMultistatus, type DavObject } from './ical';
import { WebDavConflictError } from './webdav';

export interface CalendarInfo {
  href: string;
  displayName: string;
  components: string[];
}

/** Date → "20260612T000000Z" (für time-range/expand) */
function utcStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

export class CalDavClient {
  constructor(
    private baseUrl: string,
    private user: string,
    private appPassword: string,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const token = Buffer.from(`${this.user}:${this.appPassword}`).toString('base64');
    return {
      Authorization: `Basic ${token}`,
      'Accept-Encoding': 'identity',
      ...extra,
    };
  }

  /** Server-Pfad (href) → vollständige URL */
  private url(href: string): string {
    return `${this.baseUrl}${href}`;
  }

  private calendarsHref(): string {
    return `/remote.php/dav/calendars/${encodeURIComponent(this.user)}/`;
  }

  /** Alle Kalender des Nutzers samt unterstützter Komponenten (VEVENT/VTODO) */
  async listCalendars(): Promise<CalendarInfo[]> {
    const body = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:displayname/><d:resourcetype/><cal:supported-calendar-component-set/></d:prop>
</d:propfind>`;
    const res = await fetch(this.url(this.calendarsHref()), {
      method: 'PROPFIND',
      headers: this.headers({ Depth: '1', 'Content-Type': 'application/xml' }),
      body,
    });
    if (!res.ok) {
      throw new Error(`CalDAV PROPFIND fehlgeschlagen: ${res.status}`);
    }
    const xml = await res.text();

    const calendars: CalendarInfo[] = [];
    for (const match of xml.matchAll(/<d:response>([\s\S]*?)<\/d:response>/g)) {
      const block = match[1];
      // Nur echte Kalender-Sammlungen (die Wurzel hat kein <cal:calendar/>)
      if (!/<cal:calendar\s*\/>/.test(block)) {
        continue;
      }
      const href = block.match(/<d:href>([^<]+)<\/d:href>/)?.[1];
      if (!href) {
        continue;
      }
      const displayName = block.match(/<d:displayname>([^<]*)<\/d:displayname>/)?.[1] ?? '';
      const components = [...block.matchAll(/<cal:comp name="([A-Z]+)"/g)].map((m) => m[1]);
      calendars.push({ href, displayName, components });
    }
    return calendars;
  }

  /** Gemeinsames REPORT-Gerüst */
  private async report(calendarHref: string, body: string): Promise<DavObject[]> {
    const res = await fetch(this.url(calendarHref), {
      method: 'REPORT',
      headers: this.headers({ Depth: '1', 'Content-Type': 'application/xml' }),
      body,
    });
    if (!res.ok) {
      throw new Error(`CalDAV REPORT ${calendarHref} fehlgeschlagen: ${res.status}`);
    }
    return parseMultistatus(await res.text());
  }

  /** Termine im Zeitfenster – Wiederholungen vom Server entfaltet (expand) */
  async reportEvents(calendarHref: string, startUtc: Date, endUtc: Date): Promise<DavObject[]> {
    const start = utcStamp(startUtc);
    const end = utcStamp(endUtc);
    const body = `<?xml version="1.0"?>
<cal:calendar-query xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <cal:calendar-data><cal:expand start="${start}" end="${end}"/></cal:calendar-data>
  </d:prop>
  <cal:filter>
    <cal:comp-filter name="VCALENDAR">
      <cal:comp-filter name="VEVENT">
        <cal:time-range start="${start}" end="${end}"/>
      </cal:comp-filter>
    </cal:comp-filter>
  </cal:filter>
</cal:calendar-query>`;
    return this.report(calendarHref, body);
  }

  /** Alle Aufgaben einer Liste (offen UND erledigt – das Filtern macht die App) */
  async reportTodos(calendarHref: string): Promise<DavObject[]> {
    const body = `<?xml version="1.0"?>
<cal:calendar-query xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><cal:calendar-data/></d:prop>
  <cal:filter>
    <cal:comp-filter name="VCALENDAR">
      <cal:comp-filter name="VTODO"/>
    </cal:comp-filter>
  </cal:filter>
</cal:calendar-query>`;
    return this.report(calendarHref, body);
  }

  /** Einzelnes Objekt (z. B. eine Aufgabe) samt ETag laden */
  async getObject(href: string): Promise<{ data: string; etag: string | null }> {
    const res = await fetch(this.url(href), { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`CalDAV GET ${href} fehlgeschlagen: ${res.status}`);
    }
    return { data: await res.text(), etag: res.headers.get('etag') };
  }

  /** Objekt zurückschreiben – If-Match schützt vor Überschreiben fremder Änderungen */
  async putObject(href: string, ics: string, etag?: string): Promise<string | null> {
    const headers = this.headers({ 'Content-Type': 'text/calendar; charset=utf-8' });
    if (etag) {
      headers['If-Match'] = etag;
    }
    const res = await fetch(this.url(href), { method: 'PUT', headers, body: ics });
    if (res.status === 412) {
      throw new WebDavConflictError(`${href} wurde extern geändert (ETag-Konflikt)`);
    }
    if (!res.ok) {
      throw new Error(`CalDAV PUT ${href} fehlgeschlagen: ${res.status}`);
    }
    return res.headers.get('etag');
  }

  /** Neues Objekt anlegen – If-None-Match: * verhindert jedes Überschreiben */
  async createObject(calendarHref: string, filename: string, ics: string): Promise<void> {
    const res = await fetch(this.url(`${calendarHref}${filename}`), {
      method: 'PUT',
      headers: this.headers({
        'Content-Type': 'text/calendar; charset=utf-8',
        'If-None-Match': '*',
      }),
      body: ics,
    });
    if (!res.ok) {
      throw new Error(`CalDAV CREATE ${filename} fehlgeschlagen: ${res.status}`);
    }
  }

  /** Objekt löschen – 404 gilt als Erfolg (bereits weg ist auch weg) */
  async deleteObject(href: string): Promise<void> {
    const res = await fetch(this.url(href), { method: 'DELETE', headers: this.headers() });
    if (!res.ok && res.status !== 404) {
      throw new Error(`CalDAV DELETE ${href} fehlgeschlagen: ${res.status}`);
    }
  }
}
