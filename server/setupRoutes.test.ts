// Tests zuerst (TDD): Setup-Routen als Hono-Integrationstest
// (gleiches Muster wie server/auth.test.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { installSetupRoutes } from './setupRoutes';
import { testNextcloudConnection } from './setupConnectionTest';
import { writeConfig } from './config';

vi.mock('./setupConnectionTest', () => ({ testNextcloudConnection: vi.fn() }));
vi.mock('./config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./config')>()),
  writeConfig: vi.fn(),
}));

const TOKEN = 'setup-token-123';
const VALID_BODY = {
  token: TOKEN,
  nextcloudUrl: 'https://cd.example',
  nextcloudUser: 'uli',
  appPassword: 'app-pw',
  appLoginPassword: 'anmelde-pw',
};

function app(onSaved = vi.fn()) {
  const hono = new Hono();
  installSetupRoutes(hono, { token: TOKEN, onSaved });
  return { hono, onSaved };
}

function post(hono: Hono, path: string, body: unknown) {
  return hono.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(testNextcloudConnection).mockReset();
  vi.mocked(writeConfig).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /setup', () => {
  it('liefert die Formular-Seite', async () => {
    const res = await app().hono.request('/setup');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Setup-Token');
    expect(html).toContain('Nextcloud');
  });
});

describe('alle anderen Routen', () => {
  it('leiten auf /setup um, solange nicht konfiguriert ist', async () => {
    const res = await app().hono.request('/api/v1/health', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/setup');
  });
});

describe('POST /api/setup/test', () => {
  it('lehnt falschen Token ab (403)', async () => {
    const { hono } = app();
    const res = await post(hono, '/api/setup/test', { ...VALID_BODY, token: 'falsch' });
    expect(res.status).toBe(403);
  });

  it('lehnt unvollständige Eingaben ab (400)', async () => {
    const { hono } = app();
    const res = await post(hono, '/api/setup/test', { ...VALID_BODY, nextcloudUrl: '' });
    expect(res.status).toBe(400);
  });

  it('gibt den Fehler des Verbindungstests weiter', async () => {
    vi.mocked(testNextcloudConnection).mockResolvedValue({ ok: false, error: 'Falsches Passwort' });
    const { hono } = app();
    const res = await post(hono, '/api/setup/test', VALID_BODY);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Falsches Passwort');
    expect(writeConfig).not.toHaveBeenCalled();
  });

  it('meldet Erfolg, speichert aber nichts', async () => {
    vi.mocked(testNextcloudConnection).mockResolvedValue({ ok: true });
    const { hono } = app();
    const res = await post(hono, '/api/setup/test', VALID_BODY);
    expect(res.status).toBe(200);
    expect(writeConfig).not.toHaveBeenCalled();
  });
});

describe('POST /api/setup', () => {
  it('schreibt die Config mit abgeleitetem Cookie-Secret und startet neu', async () => {
    vi.useFakeTimers();
    vi.mocked(testNextcloudConnection).mockResolvedValue({ ok: true });
    const onSaved = vi.fn();
    const { hono } = app(onSaved);
    const res = await post(hono, '/api/setup', VALID_BODY);
    expect(res.status).toBe(200);

    expect(writeConfig).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(writeConfig).mock.calls[0][0];
    expect(saved.nextcloudUrl).toBe('https://cd.example');
    expect(saved.dataDir).toBe('/Notes/DoDay');
    expect(saved.auth.password).toBe('anmelde-pw');
    expect(saved.auth.secret).toEqual(expect.any(String));
    expect(saved.auth.secret.length).toBeGreaterThan(10);

    expect(onSaved).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('übernimmt optionale Felder, wenn gesetzt', async () => {
    vi.mocked(testNextcloudConnection).mockResolvedValue({ ok: true });
    const { hono } = app();
    await post(hono, '/api/setup', {
      ...VALID_BODY,
      dataDir: '/Custom',
      eventsCalendar: 'Termine',
      tasksCalendar: 'Todos',
    });
    const saved = vi.mocked(writeConfig).mock.calls[0][0];
    expect(saved.dataDir).toBe('/Custom');
    expect(saved.eventsCalendar).toBe('Termine');
    expect(saved.tasksCalendar).toBe('Todos');
  });
});
