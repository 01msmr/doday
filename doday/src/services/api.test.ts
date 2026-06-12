// Tests zuerst (TDD): API-Schicht zwischen Frontend und Hono-Backend.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAchievements, saveAchievements, ApiConflictError } from './api';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('loadAchievements', () => {
  it('lädt Daten und ETag vom Backend', async () => {
    const payload = { data: { habits: [], achievements: [] }, etag: '"abc"' };
    fetchMock.mockResolvedValue(response(200, payload));

    const result = await loadAchievements();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/achievements');
    expect(result).toEqual(payload);
  });

  it('wirft bei Server-Fehlern einen verständlichen Fehler', async () => {
    fetchMock.mockResolvedValue(response(502, { error: 'Nextcloud nicht erreichbar' }));
    await expect(loadAchievements()).rejects.toThrow(/502/);
  });
});

describe('saveAchievements', () => {
  it('schreibt per PUT mit If-Match und liefert das neue ETag', async () => {
    fetchMock.mockResolvedValue(response(200, { etag: '"neu"' }));

    const etag = await saveAchievements({ habits: [], achievements: [] }, '"alt"');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/achievements');
    expect(options.method).toBe('PUT');
    expect(options.headers['If-Match']).toBe('"alt"');
    expect(etag).toBe('"neu"');
  });

  it('lässt If-Match weg, wenn noch kein ETag bekannt ist (erste Speicherung)', async () => {
    fetchMock.mockResolvedValue(response(200, { etag: '"erste"' }));
    await saveAchievements({ habits: [], achievements: [] });
    expect(fetchMock.mock.calls[0][1].headers['If-Match']).toBeUndefined();
  });

  it('wirft ApiConflictError bei 409 (extern geändert)', async () => {
    fetchMock.mockResolvedValue(response(409, { error: 'Konflikt' }));
    await expect(saveAchievements({ habits: [], achievements: [] }, '"alt"')).rejects.toThrow(
      ApiConflictError,
    );
  });
});
