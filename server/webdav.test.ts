// Tests zuerst (TDD): WebDAV-Client für JSON-Dateien in der Nextcloud.
// fetch wird gemockt – die Tests prüfen URLs, Header und Fehlerverhalten.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebDavClient, WebDavConflictError } from './webdav';

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

function client(): WebDavClient {
  return new WebDavClient('https://cd.example', 'uli', 'geheim');
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('getJson', () => {
  it('lädt die Datei mit Basic-Auth vom richtigen DAV-Pfad', async () => {
    fetchMock.mockResolvedValue(response(200, '{"version":1}', { etag: '"abc"' }));
    const result = await client().getJson('/Notes/DoDay/tags.json');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://cd.example/remote.php/dav/files/uli/Notes/DoDay/tags.json');
    expect(options.headers.Authorization).toMatch(/^Basic /);
    expect(result).toEqual({ data: { version: 1 }, etag: '"abc"' });
  });

  it('verzichtet auf Kompression (Accept-Encoding: identity) – Apache verfälscht sonst ETags', async () => {
    fetchMock.mockResolvedValue(response(200, '{}'));
    await client().getJson('/x.json');
    expect(fetchMock.mock.calls[0][1].headers['Accept-Encoding']).toBe('identity');
  });

  it('normalisiert Apache-gzip-ETags ("abc-gzip" → "abc") für sauberes If-Match', async () => {
    fetchMock.mockResolvedValue(response(200, '{}', { etag: '"abc-gzip"' }));
    const result = await client().getJson('/x.json');
    expect(result?.etag).toBe('"abc"');
  });

  it('entfernt das W/-Präfix schwacher ETags', async () => {
    fetchMock.mockResolvedValue(response(200, '{}', { etag: 'W/"abc"' }));
    const result = await client().getJson('/x.json');
    expect(result?.etag).toBe('"abc"');
  });

  it('kodiert Sonderzeichen im Pfad (Umlaute, Leerzeichen)', async () => {
    fetchMock.mockResolvedValue(response(200, '{}'));
    await client().getJson('/Notes/Do Day/tags.json');
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://cd.example/remote.php/dav/files/uli/Notes/Do%20Day/tags.json',
    );
  });

  it('gibt null zurück, wenn die Datei (noch) nicht existiert', async () => {
    fetchMock.mockResolvedValue(response(404));
    expect(await client().getJson('/Notes/DoDay/tags.json')).toBeNull();
  });

  it('wirft bei anderen Fehlern (z. B. 401 falsches Passwort)', async () => {
    fetchMock.mockResolvedValue(response(401));
    await expect(client().getJson('/x.json')).rejects.toThrow(/401/);
  });
});

describe('putJson', () => {
  it('schreibt JSON per PUT und liefert das neue ETag', async () => {
    fetchMock.mockResolvedValue(response(204, '', { etag: '"neu"' }));
    const etag = await client().putJson('/Notes/DoDay/tags.json', { version: 2 });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.method).toBe('PUT');
    expect(options.body).toContain('"version": 2');
    expect(etag).toBe('"neu"');
  });

  it('schickt If-Match, wenn ein ETag bekannt ist (Konflikt-Schutz)', async () => {
    fetchMock.mockResolvedValue(response(204));
    await client().putJson('/x.json', {}, '"abc"');
    expect(fetchMock.mock.calls[0][1].headers['If-Match']).toBe('"abc"');
  });

  it('wirft WebDavConflictError bei 412 (Datei wurde extern geändert)', async () => {
    fetchMock.mockResolvedValue(response(412));
    await expect(client().putJson('/x.json', {}, '"alt"')).rejects.toThrow(WebDavConflictError);
  });
});

describe('ensureFolder', () => {
  it('legt jeden Pfad-Abschnitt per MKCOL an und ignoriert Bereits-vorhanden (405)', async () => {
    fetchMock
      .mockResolvedValueOnce(response(405)) // /Notes existiert schon
      .mockResolvedValueOnce(response(201)); // /Notes/DoDay neu angelegt
    await client().ensureFolder('/Notes/DoDay');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/files/uli/Notes');
    expect(fetchMock.mock.calls[0][1].method).toBe('MKCOL');
    expect(fetchMock.mock.calls[1][0]).toContain('/files/uli/Notes/DoDay');
  });

  it('wirft bei echten Fehlern (z. B. 401)', async () => {
    fetchMock.mockResolvedValue(response(401));
    await expect(client().ensureFolder('/Notes')).rejects.toThrow(/401/);
  });
});
