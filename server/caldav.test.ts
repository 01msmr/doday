// Tests zuerst (TDD): CalDAV-Client (Kalender entdecken, Termine/Aufgaben abfragen).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CalDavClient } from './caldav';
import { WebDavConflictError } from './webdav';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function response(status: number, body = '', headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => body,
  };
}

function client(): CalDavClient {
  return new CalDavClient('https://cd.example', 'uli', 'geheim');
}

beforeEach(() => {
  fetchMock.mockReset();
});

const CALENDAR_LIST_XML = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
 <d:response>
  <d:href>/remote.php/dav/calendars/uli/</d:href>
  <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat>
 </d:response>
 <d:response>
  <d:href>/remote.php/dav/calendars/uli/personal/</d:href>
  <d:propstat><d:prop>
   <d:displayname>Persönlich</d:displayname>
   <d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>
   <cal:supported-calendar-component-set><cal:comp name="VEVENT"/><cal:comp name="VTODO"/></cal:supported-calendar-component-set>
  </d:prop></d:propstat>
 </d:response>
 <d:response>
  <d:href>/remote.php/dav/calendars/uli/tasks/</d:href>
  <d:propstat><d:prop>
   <d:displayname>Aufgaben</d:displayname>
   <d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>
   <cal:supported-calendar-component-set><cal:comp name="VTODO"/></cal:supported-calendar-component-set>
  </d:prop></d:propstat>
 </d:response>
</d:multistatus>`;

describe('listCalendars', () => {
  it('findet Kalender mit Name und Komponenten, überspringt die Wurzel', async () => {
    fetchMock.mockResolvedValue(response(207, CALENDAR_LIST_XML));
    const calendars = await client().listCalendars();

    expect(fetchMock.mock.calls[0][1].method).toBe('PROPFIND');
    expect(fetchMock.mock.calls[0][1].headers.Depth).toBe('1');
    expect(calendars).toEqual([
      {
        href: '/remote.php/dav/calendars/uli/personal/',
        displayName: 'Persönlich',
        components: ['VEVENT', 'VTODO'],
      },
      {
        href: '/remote.php/dav/calendars/uli/tasks/',
        displayName: 'Aufgaben',
        components: ['VTODO'],
      },
    ]);
  });
});

describe('reportEvents', () => {
  it('fragt per REPORT mit Zeitfenster UND expand ab (Server entfaltet Wiederholungen)', async () => {
    fetchMock.mockResolvedValue(response(207, '<d:multistatus xmlns:d="DAV:"></d:multistatus>'));
    await client().reportEvents(
      '/remote.php/dav/calendars/uli/personal/',
      new Date(Date.UTC(2026, 5, 12)),
      new Date(Date.UTC(2026, 5, 15)),
    );

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://cd.example/remote.php/dav/calendars/uli/personal/');
    expect(options.method).toBe('REPORT');
    expect(options.body).toContain('time-range start="20260612T000000Z" end="20260615T000000Z"');
    expect(options.body).toContain('expand start="20260612T000000Z"');
  });
});

describe('putObject', () => {
  it('wirft WebDavConflictError bei 412', async () => {
    fetchMock.mockResolvedValue(response(412));
    await expect(
      client().putObject('/remote.php/dav/calendars/uli/tasks/x.ics', 'ICS', '"alt"'),
    ).rejects.toThrow(WebDavConflictError);
  });
});

describe('createObject', () => {
  it('legt mit If-None-Match: * an (überschreibt nie Bestehendes)', async () => {
    fetchMock.mockResolvedValue(response(201, '', { etag: '"neu"' }));
    await client().createObject('/remote.php/dav/calendars/uli/tasks/', 'neu.ics', 'ICS');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://cd.example/remote.php/dav/calendars/uli/tasks/neu.ics');
    expect(options.headers['If-None-Match']).toBe('*');
  });
});
