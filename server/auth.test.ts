// Tests zuerst (TDD): Soll-Verhalten des Cookie-Logins.
// Die Token-Funktionen sind reine Krypto-Logik (signieren/prüfen) und gut testbar;
// das Gate prüfen wir als Hono-Integration (Login-Seite, 401, Cookie-Durchgriff).
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { signAuthToken, verifyAuthToken, checkPassword, installLoginGate } from './auth';

const SECRET = 'topsecret';

describe('Auth-Token', () => {
  it('verifiziert ein frisch signiertes Token', () => {
    const now = 1_000_000;
    const token = signAuthToken(SECRET, now);
    expect(verifyAuthToken(SECRET, token, now + 1000, 10_000)).toBe(true);
  });

  it('lehnt ein manipuliertes Token ab', () => {
    const token = signAuthToken(SECRET, 1_000_000) + 'x';
    expect(verifyAuthToken(SECRET, token, 1_000_000, 10_000)).toBe(false);
  });

  it('lehnt ein abgelaufenes Token ab', () => {
    const now = 1_000_000;
    const token = signAuthToken(SECRET, now);
    expect(verifyAuthToken(SECRET, token, now + 20_000, 10_000)).toBe(false);
  });

  it('lehnt ein Token mit falschem Secret ab', () => {
    const token = signAuthToken(SECRET, 1_000_000);
    expect(verifyAuthToken('anders', token, 1_000_000, 10_000)).toBe(false);
  });

  it('checkPassword vergleicht korrekt (gleich/ungleich)', () => {
    expect(checkPassword('geheim', 'geheim')).toBe(true);
    expect(checkPassword('falsch', 'geheim')).toBe(false);
    expect(checkPassword('', 'geheim')).toBe(false);
  });
});

describe('Login-Gate', () => {
  const cfg = { password: 'geheim', secret: SECRET };
  function gated(): Hono {
    const app = new Hono();
    installLoginGate(app, cfg);
    app.get('/api/v1/ping', (c) => c.json({ ok: true }));
    app.get('*', (c) => c.html('<main>App</main>'));
    return app;
  }

  it('blockt /api ohne Cookie mit 401', async () => {
    const res = await gated().request('/api/v1/ping');
    expect(res.status).toBe(401);
  });

  it('zeigt ohne Cookie die Login-Seite statt der App', async () => {
    const res = await gated().request('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('password');
    expect(html).not.toContain('<main>App</main>');
  });

  it('falsches Passwort → 401, kein Cookie', async () => {
    const res = await gated().request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'password=falsch',
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('richtiges Passwort setzt Cookie und der Folge-Request kommt durch', async () => {
    const app = gated();
    const login = await app.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'password=geheim',
    });
    expect(login.status).toBe(302);
    const setCookie = login.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('doday_auth=');
    expect(setCookie).toContain('HttpOnly');
    const cookie = setCookie.split(';')[0];
    const res = await app.request('/api/v1/ping', { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
  });

  it('/login ist ohne Cookie erreichbar', async () => {
    const res = await gated().request('/login');
    expect(res.status).toBe(200);
  });
});
