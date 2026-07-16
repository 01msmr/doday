// Tests zuerst (TDD): Verbindungstest für den Setup-Assistenten.
// fetch wird gemockt (gleiches Muster wie server/webdav.test.ts).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testNextcloudConnection } from './setupConnectionTest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function response(status: number, headers: Record<string, string> = {}) {
  return { ok: status >= 200 && status < 300, status, headers: new Headers(headers), text: async () => '' };
}

const INPUT = {
  nextcloudUrl: 'https://cd.example',
  nextcloudUser: 'uli',
  appPassword: 'geheim',
  dataDir: '/Notes/DoDay',
};

beforeEach(() => {
  fetchMock.mockReset();
});

describe('testNextcloudConnection', () => {
  it('meldet Erfolg, wenn der Ordner angelegt/bestätigt werden kann', async () => {
    fetchMock.mockResolvedValue(response(201));
    const result = await testNextcloudConnection(INPUT);
    expect(result).toEqual({ ok: true });
  });

  it('meldet Erfolg auch wenn der Ordner schon existiert (405)', async () => {
    fetchMock.mockResolvedValue(response(405));
    const result = await testNextcloudConnection(INPUT);
    expect(result).toEqual({ ok: true });
  });

  it('meldet Fehler bei falschem Passwort (401)', async () => {
    fetchMock.mockResolvedValue(response(401));
    const result = await testNextcloudConnection(INPUT);
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain('401');
  });

  it('meldet Fehler, wenn fetch selbst wirft (Netzwerk/DNS)', async () => {
    fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    const result = await testNextcloudConnection(INPUT);
    expect(result).toEqual({ ok: false, error: 'getaddrinfo ENOTFOUND' });
  });
});
