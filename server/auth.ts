// Cookie-Login: ein gemeinsames Passwort schützt die App, ohne dass iOS bei
// jedem PWA-Start neu fragt (anders als Basic Auth). Nach einmaliger Anmeldung
// hält ein signiertes, langlebiges Cookie die Sitzung.
//
// Das Cookie ist ein HMAC-signierter Zeitstempel: "<ms>.<hmac>". Es enthält kein
// Geheimnis und ist fälschungssicher, solange der Server-Secret stimmt.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

const COOKIE = 'doday_auth';
/** Sitzungsdauer: 90 Tage – übersteht iOS-PWA-Kaltstarts bequem. */
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/** Konstantzeit-Vergleich zweier Strings (kein Timing-Leak beim Passwort). */
export function checkPassword(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Signiertes Sitzungs-Token aus einem Zeitstempel erzeugen. */
export function signAuthToken(secret: string, nowMs: number): string {
  const payload = String(nowMs);
  const mac = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${mac}`;
}

/** Token prüfen: gültige Signatur, nicht abgelaufen, nicht aus der Zukunft. */
export function verifyAuthToken(
  secret: string,
  token: string | undefined,
  nowMs: number,
  maxAgeMs: number,
): boolean {
  if (!token) {
    return false;
  }
  const dot = token.lastIndexOf('.');
  if (dot < 0) {
    return false;
  }
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
    return false;
  }
  const issued = Number(payload);
  return Number.isFinite(issued) && nowMs >= issued && nowMs - issued <= maxAgeMs;
}

/** Schlichte, eigenständige Login-Seite (kein externes Asset nötig). */
function loginPage(error = ''): string {
  const note = error ? `<p class="err">${error}</p>` : '';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#f3f0e9" /><title>Do Day – Anmelden</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin:0; min-height:100dvh; display:grid; place-items:center;
        font-family:'Avenir Next',system-ui,sans-serif; background:#f3f0e9; color:#26251f; }
      form { display:grid; gap:.9rem; width:min(20rem,86vw); padding:1.6rem;
        border:1px solid rgb(38 37 31 / .14); border-radius:1rem; background:#fcfaf3; }
      h1 { margin:0; font:600 1.2rem/1.2 'Iowan Old Style',Georgia,serif; }
      input { padding:.7rem .8rem; font:inherit; border:1px solid rgb(38 37 31 / .2);
        border-radius:.6rem; background:#fff; color:inherit; }
      button { padding:.7rem; font:inherit; font-weight:600; border:none; border-radius:.6rem;
        background:#5d7a55; color:#fcfaf3; cursor:pointer; }
      .err { margin:0; color:#a23; font-size:.9rem; }
      @media (prefers-color-scheme: dark) {
        body { background:#16171b; color:#e8e5dd; } form { background:#232631; border-color:rgb(232 229 221 / .1); }
        input { background:#16171b; border-color:rgb(232 229 221 / .2); } button { background:#8fae87; color:#16171b; }
      }
    </style></head><body>
    <form method="post" action="/login">
      <h1>Do Day</h1>${note}
      <input type="password" name="password" placeholder="Passwort" autofocus
        autocomplete="current-password" aria-label="Passwort" />
      <button type="submit">Anmelden</button>
    </form></body></html>`;
}

/**
 * Hängt den Login-Schutz an die App: schützt alles außer der Login-Seite selbst.
 * Ohne gültiges Cookie → /api/* bekommt 401, alles andere die Login-Seite.
 */
export function installLoginGate(app: Hono, cfg: { password: string; secret: string }): void {
  app.use('*', async (c, next) => {
    const path = c.req.path;
    if (path === '/login' || path === '/logout' || path === '/heartbeat') {
      return next();
    }
    if (verifyAuthToken(cfg.secret, getCookie(c, COOKIE), Date.now(), MAX_AGE_MS)) {
      return next();
    }
    if (path.startsWith('/api/')) {
      return c.json({ error: 'Nicht angemeldet' }, 401);
    }
    return c.html(loginPage());
  });

  app.get('/login', (c) => c.html(loginPage()));

  app.post('/login', async (c) => {
    const body = await c.req.parseBody();
    const password = typeof body.password === 'string' ? body.password : '';
    if (!checkPassword(password, cfg.password)) {
      return c.html(loginPage('Falsches Passwort.'), 401);
    }
    setCookie(c, COOKIE, signAuthToken(cfg.secret, Date.now()), {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: Math.floor(MAX_AGE_MS / 1000),
    });
    return c.redirect('/');
  });

  app.get('/logout', (c) => {
    deleteCookie(c, COOKIE, { path: '/' });
    return c.redirect('/login');
  });
}
