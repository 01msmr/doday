# Setup-Assistent für Fremd-Deployments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** doday konfiguriert sich beim ersten Start über ein Web-Formular
(Nextcloud-Zugang + Cookie-Login-Passwort) statt über manuell editierte
`.env`-Variablen, damit andere Leute es selbst hosten können.

**Architecture:** Der Server prüft beim Boot, ob `data/doday-config.json`
existiert. Fehlt sie, läuft nur ein Setup-Hono-App-Zweig (`/setup`-Formular +
`/api/setup*`-Routen, geschützt durch einen beim Boot geloggten Token);
nach erfolgreichem Verbindungstest schreibt er die Config-Datei und beendet
den Prozess, Docker startet neu und bootet in den Normalbetrieb. Existiert
die Datei, läuft alles wie heute, nur dass `AppConfig` aus der Datei statt
aus `process.env` kommt.

**Tech Stack:** Hono, Node `fs`/`crypto`, Vitest (bestehendes Setup, keine
neuen Abhängigkeiten).

## Global Constraints

- Single-Tenant pro Deployment: kein gemeinsamer Server, keine Nutzerverwaltung für mehrere Personen.
- ENV-Variablen für Nextcloud-Zugangsdaten und Cookie-Login entfallen komplett (nur noch Setup-Assistent/Config-Datei).
- `PORT` bleibt eine reine Infrastruktur-ENV-Variable — kein Formularfeld, keine Änderung an dieser Stelle.
- Config-Datei-Pfad ist fix (`data/doday-config.json`), keine eigene ENV-Variable dafür.
- Setup-Token lebt nur im Prozessspeicher (nicht persistiert), wird beim Boot geloggt.
- TDD wie im restlichen Projekt üblich: Test zuerst, dann Implementierung.

---

## File Structure

- **Modify** `server/config.ts` — von ENV-basiertem `loadConfig(env)` auf datei-basierten Store umgestellt: `AppConfig`/`AuthConfig`-Typen, `CONFIG_PATH`, `configExists()`, `readConfig()`, `writeConfig()`.
- **Create** `server/config.test.ts` — Tests für den neuen Store.
- **Create** `server/setupConnectionTest.ts` — `testNextcloudConnection()`, prüft Zugangsdaten per echtem WebDAV-Request (reuses `WebDavClient.ensureFolder`).
- **Create** `server/setupConnectionTest.test.ts` — Tests dafür (fetch-Mock, wie `server/webdav.test.ts`).
- **Create** `server/setupRoutes.ts` — Hono-Routen `GET /setup`, `POST /api/setup/test`, `POST /api/setup`.
- **Create** `server/setupRoutes.test.ts` — Tests dafür (Hono `app.request()`, wie `server/auth.test.ts`).
- **Modify** `server/index.ts` — verzweigt beim Boot zwischen Setup-Modus und Normalbetrieb; `process.env.DODAY_*_CALENDAR` wird durch `config.eventsCalendar`/`config.tasksCalendar` ersetzt; Login-Gate wird unconditional installiert (Cookie-Login ist jetzt Pflicht).
- **Modify** `.env.example` — nur noch `PORT` (Rest zieht ins Setup-Formular).
- **Create** `data/doday-config.example.json` — Vorlage zum Kopieren für lokale Entwicklung (Setup-Assistent-Schnellweg).
- **Modify** `.gitignore` — `data/doday-config.json` ausschließen (Beispiel-Datei bleibt getrackt).
- **Modify** `deploy/compose.example.yml` — Volume für `data/` ergänzen, veraltete ENV-Hinweise entfernen.
- **Modify** `README.md` — „Entwicklung“-Abschnitt beschreibt Setup-Assistent statt `.env`.

---

### Task 1: Config-Store auf Datei umstellen

**Files:**
- Modify: `server/config.ts`
- Test: `server/config.test.ts`

**Interfaces:**
- Produces: `interface AuthConfig { password: string; secret: string }`, `interface AppConfig { nextcloudUrl: string; nextcloudUser: string; appPassword: string; dataDir: string; auth: AuthConfig; eventsCalendar?: string; tasksCalendar?: string }`, `CONFIG_PATH: string`, `configExists(path?: string): boolean`, `readConfig(path?: string): AppConfig`, `writeConfig(config: AppConfig, path?: string): void`.

- [ ] **Step 1: Write the failing test**

Ersetze den Inhalt von `server/config.test.ts` (Datei existiert noch nicht,
also neu anlegen) mit:

```typescript
// Tests zuerst (TDD): Config kommt jetzt aus einer Datei statt aus ENV.
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configExists, readConfig, writeConfig, type AppConfig } from './config';

const TEST_PATH = join(tmpdir(), `doday-config-test-${process.pid}.json`);

const SAMPLE: AppConfig = {
  nextcloudUrl: 'https://cd.example',
  nextcloudUser: 'uli',
  appPassword: 'geheim',
  dataDir: '/Notes/DoDay',
  auth: { password: 'anmelden', secret: 'abc123' },
  eventsCalendar: 'Persönlich',
  tasksCalendar: 'Aufgaben',
};

afterEach(() => {
  rmSync(TEST_PATH, { force: true });
});

describe('configExists', () => {
  it('ist false, solange keine Datei existiert', () => {
    expect(configExists(TEST_PATH)).toBe(false);
  });

  it('ist true, nachdem geschrieben wurde', () => {
    writeConfig(SAMPLE, TEST_PATH);
    expect(configExists(TEST_PATH)).toBe(true);
  });
});

describe('writeConfig/readConfig', () => {
  it('liest exakt das zurück, was geschrieben wurde', () => {
    writeConfig(SAMPLE, TEST_PATH);
    expect(readConfig(TEST_PATH)).toEqual(SAMPLE);
  });

  it('legt fehlende Verzeichnisse an', () => {
    const nested = join(tmpdir(), `doday-nested-${process.pid}`, 'sub', 'config.json');
    writeConfig(SAMPLE, nested);
    expect(existsSync(nested)).toBe(true);
    rmSync(join(tmpdir(), `doday-nested-${process.pid}`), { recursive: true, force: true });
  });

  it('lässt optionale Kalendernamen weg, wenn nicht gesetzt', () => {
    const { eventsCalendar, tasksCalendar, ...rest } = SAMPLE;
    writeConfig(rest as AppConfig, TEST_PATH);
    const loaded = readConfig(TEST_PATH);
    expect(loaded.eventsCalendar).toBeUndefined();
    expect(loaded.tasksCalendar).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/config.test.ts`
Expected: FAIL — `configExists`/`readConfig`/`writeConfig` sind noch nicht exportiert (aktuell exportiert `config.ts` nur `loadConfig`).

- [ ] **Step 3: Write minimal implementation**

Ersetze den kompletten Inhalt von `server/config.ts` mit:

```typescript
// Konfiguration liegt in einer Datei (data/doday-config.json), die der
// Setup-Assistent beim ersten Start schreibt (server/setupRoutes.ts).
// Kein ENV mehr für Nextcloud-Zugangsdaten oder Cookie-Login – nur PORT
// bleibt eine Infrastruktur-ENV-Variable (siehe server/index.ts).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface AuthConfig {
  password: string;
  secret: string;
}

export interface AppConfig {
  /** Basis-URL der Nextcloud, z. B. https://cd.msmr.co */
  nextcloudUrl: string;
  nextcloudUser: string;
  appPassword: string;
  /** Ordner für App-Daten in den Nextcloud-Dateien */
  dataDir: string;
  /** Cookie-Login: gemeinsames Passwort + HMAC-Schlüssel fürs Sitzungs-Cookie */
  auth: AuthConfig;
  eventsCalendar?: string;
  tasksCalendar?: string;
}

export const CONFIG_PATH = 'data/doday-config.json';

export function configExists(path: string = CONFIG_PATH): boolean {
  return existsSync(path);
}

export function readConfig(path: string = CONFIG_PATH): AppConfig {
  return JSON.parse(readFileSync(path, 'utf-8')) as AppConfig;
}

export function writeConfig(config: AppConfig, path: string = CONFIG_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/config.test.ts`
Expected: PASS (6 Tests)

- [ ] **Step 5: Commit**

```bash
git add server/config.ts server/config.test.ts
git commit -m "Config-Store auf Datei umstellen statt ENV"
```

---

### Task 2: Verbindungstest für den Setup-Assistenten

**Files:**
- Create: `server/setupConnectionTest.ts`
- Test: `server/setupConnectionTest.test.ts`

**Interfaces:**
- Consumes: `WebDavClient` aus `server/webdav.ts` (Konstruktor `(baseUrl, user, appPassword)`, Methode `ensureFolder(path: string): Promise<void>`, wirft bei Fehler).
- Produces: `interface ConnectionTestInput { nextcloudUrl: string; nextcloudUser: string; appPassword: string; dataDir: string }`, `function testNextcloudConnection(input: ConnectionTestInput): Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the failing test**

Create `server/setupConnectionTest.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/setupConnectionTest.test.ts`
Expected: FAIL — Modul `./setupConnectionTest` existiert nicht.

- [ ] **Step 3: Write minimal implementation**

Create `server/setupConnectionTest.ts`:

```typescript
// Verbindungstest fürs Setup-Formular: prüft echte Zugangsdaten gegen die
// Nextcloud, bevor irgendetwas gespeichert wird. Nutzt denselben WebDAV-Weg
// wie der spätere Normalbetrieb (ensureFolder legt den Datenordner an bzw.
// bestätigt, dass er existiert).
import { WebDavClient } from './webdav';

export interface ConnectionTestInput {
  nextcloudUrl: string;
  nextcloudUser: string;
  appPassword: string;
  dataDir: string;
}

export async function testNextcloudConnection(
  input: ConnectionTestInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const dav = new WebDavClient(input.nextcloudUrl, input.nextcloudUser, input.appPassword);
    await dav.ensureFolder(input.dataDir);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unbekannter Fehler' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/setupConnectionTest.test.ts`
Expected: PASS (4 Tests)

- [ ] **Step 5: Commit**

```bash
git add server/setupConnectionTest.ts server/setupConnectionTest.test.ts
git commit -m "Verbindungstest für den Setup-Assistenten"
```

---

### Task 3: Setup-Routen (Formular, Test, Speichern)

**Files:**
- Create: `server/setupRoutes.ts`
- Test: `server/setupRoutes.test.ts`

**Interfaces:**
- Consumes: `checkPassword(input: string, expected: string): boolean` aus `server/auth.ts`; `writeConfig(config: AppConfig, path?: string): void` und `type AppConfig`/`AuthConfig` aus `server/config.ts`; `testNextcloudConnection(input): Promise<{ok:true}|{ok:false,error:string}>` aus `server/setupConnectionTest.ts`.
- Produces: `interface SetupDeps { token: string; onSaved: () => void }`, `function installSetupRoutes(app: Hono, deps: SetupDeps): void` — registriert `GET /setup`, `POST /api/setup/test`, `POST /api/setup` sowie einen abschließenden `app.all('*', …)`-Catch-all, der auf `/setup` umleitet (muss zuletzt registriert werden, sonst würde er die anderen Routen verdecken).

- [ ] **Step 1: Write the failing test**

Create `server/setupRoutes.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/setupRoutes.test.ts`
Expected: FAIL — Modul `./setupRoutes` existiert nicht.

- [ ] **Step 3: Write minimal implementation**

Create `server/setupRoutes.ts`:

```typescript
// Setup-Assistent: Formular + Routen für die Ersteinrichtung (nur aktiv,
// solange keine Config-Datei existiert – siehe server/index.ts).
import { createHash } from 'node:crypto';
import type { Hono } from 'hono';
import { checkPassword } from './auth';
import { writeConfig, type AppConfig } from './config';
import { testNextcloudConnection } from './setupConnectionTest';

export interface SetupDeps {
  /** Beim Boot generierter Token, geloggt in server/index.ts */
  token: string;
  /** Nach erfolgreichem Speichern aufgerufen (process.exit in index.ts) */
  onSaved: () => void;
}

interface SetupFormInput {
  token?: string;
  nextcloudUrl?: string;
  nextcloudUser?: string;
  appPassword?: string;
  appLoginPassword?: string;
  dataDir?: string;
  eventsCalendar?: string;
  tasksCalendar?: string;
}

function validate(input: SetupFormInput): string | null {
  if (!input.nextcloudUrl?.trim()) return 'Nextcloud-URL fehlt';
  if (!input.nextcloudUser?.trim()) return 'Nextcloud-Nutzername fehlt';
  if (!input.appPassword?.trim()) return 'Nextcloud-App-Passwort fehlt';
  if (!input.appLoginPassword?.trim()) return 'App-Login-Passwort fehlt';
  return null;
}

function buildConfig(input: SetupFormInput): AppConfig {
  return {
    nextcloudUrl: input.nextcloudUrl!.trim().replace(/\/+$/, ''),
    nextcloudUser: input.nextcloudUser!.trim(),
    appPassword: input.appPassword!,
    dataDir: input.dataDir?.trim() || '/Notes/DoDay',
    auth: {
      password: input.appLoginPassword!,
      secret: createHash('sha256').update(input.appLoginPassword!).digest('hex'),
    },
    eventsCalendar: input.eventsCalendar?.trim() || undefined,
    tasksCalendar: input.tasksCalendar?.trim() || undefined,
  };
}

/** Schlichte, eigenständige Setup-Seite (kein externes Asset nötig) */
function setupPage(): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#f3f0e9" /><title>Do Day – Ersteinrichtung</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin:0; min-height:100dvh; display:grid; place-items:center;
        font-family:'Avenir Next',system-ui,sans-serif; background:#f3f0e9; color:#26251f; }
      form { display:grid; gap:.9rem; width:min(26rem,90vw); padding:1.6rem;
        border:1px solid rgb(38 37 31 / .14); border-radius:1rem; background:#fcfaf3; }
      h1 { margin:0; font:600 1.2rem/1.2 'Iowan Old Style',Georgia,serif; }
      label { display:grid; gap:.3rem; font-size:.9rem; }
      input { padding:.7rem .8rem; font:inherit; border:1px solid rgb(38 37 31 / .2);
        border-radius:.6rem; background:#fff; color:inherit; }
      button { padding:.7rem; font:inherit; font-weight:600; border:none; border-radius:.6rem;
        background:#5d7a55; color:#fcfaf3; cursor:pointer; }
      button.secondary { background:transparent; border:1px solid #5d7a55; color:#5d7a55; }
      .msg { margin:0; font-size:.9rem; }
      .msg.err { color:#a23; } .msg.ok { color:#5d7a55; }
      details { border-top:1px solid rgb(38 37 31 / .14); padding-top:.6rem; }
      @media (prefers-color-scheme: dark) {
        body { background:#16171b; color:#e8e5dd; } form { background:#232631; border-color:rgb(232 229 221 / .1); }
        input { background:#16171b; border-color:rgb(232 229 221 / .2); } button { background:#8fae87; color:#16171b; }
        button.secondary { border-color:#8fae87; color:#8fae87; }
      }
    </style></head><body>
    <form id="setup">
      <h1>Do Day – Ersteinrichtung</h1>
      <p class="msg" id="msg"></p>
      <label>Setup-Token (aus den Docker-Logs)
        <input name="token" required autocomplete="off" />
      </label>
      <label>Nextcloud-URL
        <input name="nextcloudUrl" type="url" placeholder="https://deine-nextcloud.example.com" required />
      </label>
      <label>Nextcloud-Nutzername
        <input name="nextcloudUser" required />
      </label>
      <label>Nextcloud-App-Passwort
        <input name="appPassword" type="password" required />
      </label>
      <label>App-Login-Passwort (schützt doday selbst)
        <input name="appLoginPassword" type="password" required />
      </label>
      <details>
        <summary>Weitere Einstellungen (optional)</summary>
        <label>Datenordner<input name="dataDir" placeholder="/Notes/DoDay" /></label>
        <label>Termine-Kalender<input name="eventsCalendar" /></label>
        <label>Aufgaben-Kalender<input name="tasksCalendar" /></label>
      </details>
      <button type="button" class="secondary" id="test">Verbindung testen</button>
      <button type="submit">Einrichten &amp; starten</button>
    </form>
    <script>
      const form = document.getElementById('setup');
      const msg = document.getElementById('msg');
      function body() {
        return Object.fromEntries(new FormData(form).entries());
      }
      function showResult(json, ok) {
        msg.textContent = ok ? 'Verbindung erfolgreich.' : (json.error || 'Fehler');
        msg.className = 'msg ' + (ok ? 'ok' : 'err');
      }
      document.getElementById('test').addEventListener('click', async () => {
        const res = await fetch('/api/setup/test', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body()),
        });
        showResult(await res.json(), res.ok);
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const res = await fetch('/api/setup', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body()),
        });
        const json = await res.json();
        if (res.ok) {
          msg.textContent = 'Gespeichert – doday startet neu …';
          msg.className = 'msg ok';
        } else {
          showResult(json, false);
        }
      });
    </script></body></html>`;
}

export function installSetupRoutes(app: Hono, deps: SetupDeps): void {
  async function validateAndTest(
    body: SetupFormInput,
  ): Promise<{ error: string; status: 400 | 403 } | { config: AppConfig }> {
    if (!checkPassword(body.token ?? '', deps.token)) {
      return { error: 'Falscher Setup-Token', status: 403 };
    }
    const invalid = validate(body);
    if (invalid) {
      return { error: invalid, status: 400 };
    }
    const config = buildConfig(body);
    const result = await testNextcloudConnection(config);
    if (!result.ok) {
      return { error: result.error, status: 400 };
    }
    return { config };
  }

  app.get('/setup', (c) => c.html(setupPage()));

  app.post('/api/setup/test', async (c) => {
    const result = await validateAndTest((await c.req.json()) as SetupFormInput);
    if ('error' in result) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json({ ok: true });
  });

  app.post('/api/setup', async (c) => {
    const result = await validateAndTest((await c.req.json()) as SetupFormInput);
    if ('error' in result) {
      return c.json({ error: result.error }, result.status);
    }
    writeConfig(result.config);
    setTimeout(() => deps.onSaved(), 100);
    return c.json({ ok: true });
  });

  // Solange kein Config-Datei existiert, ist ALLES andere gesperrt und
  // schickt auf die Setup-Seite zurück (hier statt in server/index.ts, damit
  // es mit den anderen Setup-Routen zusammen testbar ist).
  app.all('*', (c) => c.redirect('/setup'));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/setupRoutes.test.ts`
Expected: PASS (9 Tests)

- [ ] **Step 5: Commit**

```bash
git add server/setupRoutes.ts server/setupRoutes.test.ts
git commit -m "Setup-Routen: Formular, Verbindungstest, Speichern"
```

---

### Task 4: Setup-Modus in server/index.ts verdrahten

**Files:**
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: `configExists()`, `readConfig()` aus `./config`; `installSetupRoutes(app, { token, onSaved })` aus `./setupRoutes`; alles Bestehende aus `./auth`, `./webdav`, `./caldav`, `./ical`, `../src/services/tagService` unverändert.

- [ ] **Step 1: Modify server/index.ts**

Ersetze die ersten 47 Zeilen (bis einschließlich des `installLoginGate`-Blocks)
sowie die beiden `process.env.DODAY_*_CALENDAR`-Zugriffe und den `serve(...)`-Aufruf
am Dateiende. Der komplette neue Dateiinhalt:

```typescript
// doday-Backend: dünner API-Layer zwischen Browser und Nextcloud.
//
// Warum ein Backend? Das App-Passwort bleibt auf dem Server (in der
// Config-Datei) und wandert nie in den Browser. Der Browser spricht nur
// /api/v1/... – gleiche Origin, kein CORS, und später ExApp-tauglich (AppAPI).
//
// Im Container liefert derselbe Prozess auch das gebaute Frontend (dist/) aus.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import { configExists, readConfig } from './config';
import { installLoginGate } from './auth';
import { installSetupRoutes } from './setupRoutes';
import { WebDavClient, WebDavConflictError } from './webdav';
import { CalDavClient, type CalendarInfo } from './caldav';
import {
  buildEventIcsUtc,
  buildTodoIcs,
  parseEvents,
  parseTodo,
  setTodoCompleted,
  updateEventIcs,
  updateTodoIcs,
} from './ical';
// Dieselbe Tag-Logik wie im Frontend – ein Repo, eine Wahrheit
import { parseTags } from '../src/services/tagService';

const port = Number(process.env.PORT ?? 3000);
const app = new Hono();

if (!configExists()) {
  // Erster Start: es gibt noch keine data/doday-config.json. Der Setup-
  // Assistent (server/setupRoutes.ts) ist die einzige erreichbare Route,
  // bis jemand mit dem hier geloggten Token die Zugangsdaten einträgt.
  const token = randomUUID();
  installSetupRoutes(app, {
    token,
    onSaved: () => setTimeout(() => process.exit(0), 100),
  });

  serve({ fetch: app.fetch, port }, (info) => {
    console.log('=== doday Ersteinrichtung ===');
    console.log(`Öffne http://localhost:${info.port}/setup und gib diesen Token ein:`);
    console.log(`Setup-Token: ${token}`);
    console.log('==============================');
  });
} else {
  const config = readConfig();
  const dav = new WebDavClient(config.nextcloudUrl, config.nextcloudUser, config.appPassword);
  const caldav = new CalDavClient(config.nextcloudUrl, config.nextcloudUser, config.appPassword);

  const ACHIEVEMENTS_FILE = `${config.dataDir}/achievements.json`;
  const TAGS_FILE = `${config.dataDir}/tags.json`;

  /** Startwerte, solange die Dateien in der Nextcloud noch nicht existieren */
  const DEFAULT_ACHIEVEMENTS = { habits: [], achievements: [] };
  const defaultTags = () => ({ version: 0, updatedAt: new Date().toISOString(), tags: [] });

  app.get('/api/v1/health', (c) => c.json({ ok: true, dataDir: config.dataDir }));

  // Cookie-Login schützt API + ausgeliefertes Frontend. Muss VOR den
  // API-/Static-Routen stehen, damit es sie umfasst. Seit dem Setup-Assistenten
  // ist ein Login-Passwort Pflicht – kein ungeschützter Betrieb mehr möglich.
  installLoginGate(app, config.auth);

  /** GET = Datei lesen (oder Startwert), PUT = schreiben mit ETag-Konfliktschutz */
  function jsonFileRoutes(route: string, file: string, fallback: () => unknown): void {
    app.get(`/api/v1/${route}`, async (c) => {
      const result = await dav.getJson(file);
      return c.json(result ?? { data: fallback(), etag: null });
    });

    app.put(`/api/v1/${route}`, async (c) => {
      try {
        const body = await c.req.json();
        const etag = c.req.header('if-match') ?? undefined;
        await dav.ensureFolder(config.dataDir);
        const newEtag = await dav.putJson(file, body, etag);
        return c.json({ etag: newEtag });
      } catch (error) {
        if (error instanceof WebDavConflictError) {
          // Client soll neu laden und seine Änderung erneut anwenden
          return c.json({ error: 'Konflikt – Datei wurde extern geändert' }, 409);
        }
        throw error;
      }
    });
  }

  jsonFileRoutes('achievements', ACHIEVEMENTS_FILE, () => DEFAULT_ACHIEVEMENTS);
  jsonFileRoutes('tags', TAGS_FILE, defaultTags);

  /* ---------- CalDAV: Termine + Aufgaben ---------- */

  // Kalenderliste kurz cachen – sie ändert sich selten.
  // App-generierte Kalender (z. B. Deck-Boards) bleiben außen vor:
  // deren VTODOs sind Karten/Listen, keine echten Aufgaben.
  let calendarCache: { at: number; list: CalendarInfo[] } | null = null;
  async function calendars(): Promise<CalendarInfo[]> {
    if (!calendarCache || Date.now() - calendarCache.at > 5 * 60_000) {
      const list = (await caldav.listCalendars()).filter(
        (cal) => !cal.href.includes('app-generated'),
      );
      calendarCache = { at: Date.now(), list };
    }
    return calendarCache.list;
  }

  /** Ziel-Kalender fürs Anlegen: per Config benannt, sonst der erste passende */
  async function targetCalendar(component: string, wantedName?: string): Promise<CalendarInfo> {
    const candidates = (await calendars()).filter((cal) => cal.components.includes(component));
    const wanted = wantedName ? candidates.find((cal) => cal.displayName === wantedName) : undefined;
    const calendar = wanted ?? candidates[0];
    if (!calendar) {
      throw new Error(`Kein Nextcloud-Kalender mit ${component}-Unterstützung gefunden`);
    }
    return calendar;
  }

  /** Termine + Aufgaben des Zeitfensters aus allen Kalendern, fertig fürs Frontend */
  app.get('/api/v1/agenda', async (c) => {
    const start = new Date(Number(c.req.query('start')));
    const end = new Date(Number(c.req.query('end')));

    const events = [];
    const tasks = [];
    for (const calendar of await calendars()) {
      if (calendar.components.includes('VEVENT')) {
        for (const object of await caldav.reportEvents(calendar.href, start, end)) {
          const instances = parseEvents(object.data);
          // Serie? Mehrere expandierte Instanzen ODER Serien-Marker in der Datei.
          // Serien sind im Frontend nicht editierbar (kein Stift).
          const recurring =
            instances.length > 1 || /^(RRULE|RECURRENCE-ID)[;:]/m.test(object.data);
          for (const event of instances) {
            const { cleanText, tags } = parseTags(event.summary);
            events.push({
              id: `${object.href}#${event.start}`,
              href: object.href,
              rawText: event.summary,
              title: cleanText,
              tags,
              start: event.start,
              end: event.end,
              allDay: event.allDay,
              recurring,
            });
          }
        }
      }
      if (calendar.components.includes('VTODO')) {
        for (const object of await caldav.reportTodos(calendar.href)) {
          const todo = parseTodo(object.data);
          if (!todo) {
            continue;
          }
          const { cleanText, tags } = parseTags(todo.summary);
          tasks.push({
            id: object.href,
            href: object.href,
            rawText: todo.summary,
            title: cleanText,
            tags,
            completed: todo.completed,
            completedAt: todo.completedAt,
            due: todo.due,
          });
        }
      }
    }
    events.sort((a, b) => a.start.localeCompare(b.start));
    return c.json({ events, tasks });
  });

  /** Neue Aufgabe in Nextcloud Tasks (VTODO) */
  app.post('/api/v1/tasks', async (c) => {
    const { title, due } = (await c.req.json()) as { title?: string; due?: string };
    if (!title?.trim()) {
      return c.json({ error: 'Titel fehlt' }, 400);
    }
    const calendar = await targetCalendar('VTODO', config.tasksCalendar);
    const uid = crypto.randomUUID();
    await caldav.createObject(calendar.href, `${uid}.ics`, buildTodoIcs({ uid, title, due }));

    const href = `${calendar.href}${uid}.ics`;
    const { cleanText, tags } = parseTags(title);
    return c.json({
      task: { id: href, href, rawText: title, title: cleanText, tags, completed: false, due },
    });
  });

  /** Aufgabe abhaken / wieder öffnen – lädt das VTODO, ändert nur den Status */
  app.post('/api/v1/tasks/toggle', async (c) => {
    const { href, completed } = (await c.req.json()) as { href?: string; completed?: boolean };
    if (!href) {
      return c.json({ error: 'href fehlt' }, 400);
    }
    try {
      const current = await caldav.getObject(href);
      const updated = setTodoCompleted(current.data, completed === true, new Date());
      await caldav.putObject(href, updated, current.etag ?? undefined);
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof WebDavConflictError) {
        return c.json({ error: 'Konflikt – Aufgabe wurde extern geändert' }, 409);
      }
      throw error;
    }
  });

  /** Aufgabe bearbeiten: Titel (inkl. #Tags) und Fälligkeit umschreiben */
  app.post('/api/v1/tasks/update', async (c) => {
    const { href, title, due } = (await c.req.json()) as {
      href?: string;
      title?: string;
      due?: string;
    };
    if (!href || !title?.trim()) {
      return c.json({ error: 'href und Titel werden benötigt' }, 400);
    }
    try {
      const current = await caldav.getObject(href);
      const updated = updateTodoIcs(current.data, { title, due });
      await caldav.putObject(href, updated, current.etag ?? undefined);
      const todo = parseTodo(updated);
      const { cleanText, tags } = parseTags(title);
      return c.json({
        task: {
          id: href,
          href,
          rawText: title,
          title: cleanText,
          tags,
          completed: todo?.completed ?? false,
          due,
        },
      });
    } catch (error) {
      if (error instanceof WebDavConflictError) {
        return c.json({ error: 'Konflikt – Aufgabe wurde extern geändert' }, 409);
      }
      throw error;
    }
  });

  /** Aufgabe löschen – entfernt das VTODO aus der Nextcloud */
  app.post('/api/v1/tasks/delete', async (c) => {
    const { href } = (await c.req.json()) as { href?: string };
    if (!href) {
      return c.json({ error: 'href fehlt' }, 400);
    }
    await caldav.deleteObject(href);
    return c.json({ ok: true });
  });

  /** Neuer Termin direkt im Nextcloud-Kalender (synct von dort auf alle Geräte) */
  app.post('/api/v1/events', async (c) => {
    const { title, start, end } = (await c.req.json()) as {
      title?: string;
      start?: number;
      end?: number;
    };
    if (!title?.trim() || !start || !end) {
      return c.json({ error: 'Titel, Start und Ende werden benötigt' }, 400);
    }
    const calendar = await targetCalendar('VEVENT', config.eventsCalendar);
    const uid = crypto.randomUUID();
    const startUtc = new Date(start);
    const endUtc = new Date(end);
    await caldav.createObject(
      calendar.href,
      `${uid}.ics`,
      buildEventIcsUtc({ uid, title, startUtc, endUtc }),
    );

    const { cleanText, tags } = parseTags(title);
    return c.json({
      event: {
        id: `${calendar.href}${uid}.ics#${startUtc.toISOString()}`,
        rawText: title,
        title: cleanText,
        tags,
        start: startUtc.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        end: endUtc.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        allDay: false,
      },
    });
  });

  /** Einzeltermin bearbeiten – Serien lehnt der Server ab (Schutz vor Massenänderung) */
  app.post('/api/v1/events/update', async (c) => {
    const { href, title, start, end, date } = (await c.req.json()) as {
      href?: string;
      title?: string;
      start?: number;
      end?: number;
      date?: string;
    };
    if (!href || !title?.trim() || (!date && (!start || !end))) {
      return c.json({ error: 'href, Titel und Zeitangaben werden benötigt' }, 400);
    }
    try {
      const current = await caldav.getObject(href);
      if (/^(RRULE|RECURRENCE-ID)[;:]/m.test(current.data)) {
        return c.json({ error: 'Serientermine bitte direkt in der Nextcloud ändern' }, 400);
      }
      const startUtc = start ? new Date(start) : undefined;
      const endUtc = end ? new Date(end) : undefined;
      const updated = updateEventIcs(current.data, { title, startUtc, endUtc, date });
      await caldav.putObject(href, updated, current.etag ?? undefined);

      const event = parseEvents(updated)[0];
      const { cleanText, tags } = parseTags(title);
      return c.json({
        event: {
          id: `${href}#${event.start}`,
          href,
          rawText: title,
          title: cleanText,
          tags,
          start: event.start,
          end: event.end,
          allDay: event.allDay,
          recurring: false,
        },
      });
    } catch (error) {
      if (error instanceof WebDavConflictError) {
        return c.json({ error: 'Konflikt – Termin wurde extern geändert' }, 409);
      }
      throw error;
    }
  });

  /** Unerwartete Fehler (z. B. Nextcloud nicht erreichbar) → 502 mit Klartext */
  app.onError((error, c) => {
    console.error('[doday]', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unbekannter Fehler' }, 502);
  });

  // Produktion (Container): gebautes Frontend aus dist/ ausliefern
  if (existsSync('./dist')) {
    app.use('/*', serveStatic({ root: './dist' }));
    app.get('*', serveStatic({ path: './dist/index.html' }));
  }

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`doday-Backend läuft auf http://localhost:${info.port}`);
    console.log(`Nextcloud: ${config.nextcloudUrl} (Daten in ${config.dataDir})`);
  });
}
```

- [ ] **Step 2: Typprüfung**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Restliche Tests laufen lassen**

Run: `npm test`
Expected: alle bestehenden Suiten weiterhin grün (index.ts selbst hat wie
bisher keine eigene Testdatei — das Verdrahten wird in Task 6 manuell im
Browser geprüft).

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "Setup-Modus in server/index.ts verdrahten"
```

---

### Task 5: Vorlagen, Compose-Datei und README aktualisieren

**Files:**
- Modify: `.env.example`
- Create: `data/doday-config.example.json`
- Modify: `.gitignore`
- Modify: `deploy/compose.example.yml`
- Modify: `README.md`

- [ ] **Step 1: `.env.example` auf PORT reduzieren**

Ersetze den kompletten Inhalt von `.env.example` mit:

```
# Vorlage: nach .env kopieren (`cp .env.example .env`). Nextcloud-Zugang und
# Cookie-Login-Passwort werden NICHT mehr hier eingetragen, sondern beim
# ersten Start über den Setup-Assistenten (http://<host>:3000/setup) – siehe
# README. Für lokale Entwicklung gibt es alternativ
# data/doday-config.example.json zum Kopieren.

# Port des Backends (Vite-Dev-Proxy und Traefik erwarten 3000)
PORT=3000
```

- [ ] **Step 2: `data/doday-config.example.json` anlegen**

Create `data/doday-config.example.json`:

```json
{
  "nextcloudUrl": "https://deine-nextcloud.example.com",
  "nextcloudUser": "dein-nutzername",
  "appPassword": "xxxxx-xxxxx-xxxxx-xxxxx-xxxxx",
  "dataDir": "/Notes/DoDay",
  "auth": {
    "password": "ein-langes-app-login-passwort",
    "secret": "beliebiger-langer-zufallsstring"
  }
}
```

- [ ] **Step 3: `.gitignore` ergänzen**

In `.gitignore`, nach der `.env`-Zeile ergänzen:

```
# Von echten Zugangsdaten geschriebene Config – die *.example.json bleibt getrackt
data/doday-config.json
```

- [ ] **Step 4: `deploy/compose.example.yml` aktualisieren**

Ersetze den kompletten Inhalt von `deploy/compose.example.yml` mit:

```yaml
# Service-Block für die bestehende docker-compose.yml auf dem Docker-Rechner.
# Werte (Netzwerk "traefik", certresolver "letsencrypt", entrypoint "websecure")
# entsprechen dem vorhandenen Setup der anderen Dienste.
#
# Nextcloud-Zugangsdaten werden NICHT mehr per ENV gesetzt: beim ersten Start
# ohne data/doday-config.json läuft doday im Setup-Modus (Token in den
# Container-Logs, `docker compose logs doday`) – Formular unter /setup.
services:
  doday:
    # Variante A: lokal bauen     → docker compose up -d --build doday
    build: ./doday
    # Variante B: später via GHCR → image: ghcr.io/<github-user>/doday:latest
    restart: unless-stopped
    env_file: ./doday/.env # nur noch PORT
    volumes:
      # Persistiert die Config-Datei, die der Setup-Assistent schreibt.
      - ./doday-data:/app/data
    networks:
      - traefik
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.doday.rule=Host(`do.msmr.co`)"
      - "traefik.http.routers.doday.tls.certresolver=letsencrypt"
      - "traefik.http.routers.doday.entrypoints=websecure"
      - "traefik.http.routers.doday.tls.domains[0].main=do.msmr.co"
      # Port IM Container (doday-Backend lauscht auf 3000 – kein ports:-Mapping nötig)
      - "traefik.http.services.doday.loadbalancer.server.port=3000"
      - "traefik.docker.network=traefik"

# Nur nötig, falls die Datei eigenständig genutzt wird – in der bestehenden
# Compose-Datei ist das Netzwerk "traefik" bereits deklariert.
networks:
  traefik:
    external: true
```

(Der `extra_hosts`-Eintrag für die private Nextcloud-Domain entfällt aus der
Vorlage — das war ohnehin ein Detail des einen konkreten Heimnetzes, nicht
etwas, das andere Deployments brauchen.)

- [ ] **Step 5: `README.md` – Abschnitt „Entwicklung“ ersetzen**

Ersetze in `README.md` den Block von `## Entwicklung` bis vor `## Qualität`
(Zeilen 17–31) mit:

```markdown
## Entwicklung

```bash
npm install
cp .env.example .env

# Terminal 1: Backend (Port 3000)
npm run dev:server
```

Beim allerersten Start ohne `data/doday-config.json` läuft der Server im
Setup-Modus: Terminal 1 loggt einen Setup-Token, unter
http://localhost:3000/setup trägst du Nextcloud-URL, -Nutzername,
App-Passwort und ein App-Login-Passwort ein. Nach dem Speichern beendet
sich der Prozess einmal selbst – `npm run dev:server` einfach erneut
starten.

Schneller für wiederholte lokale Checkouts: `data/doday-config.example.json`
nach `data/doday-config.json` kopieren und ausfüllen, dann startet der
Server direkt im Normalbetrieb.

```bash
# Terminal 2: Frontend mit Proxy auf /api (Port 5173)
npm run dev
```

→ http://localhost:5173

## Qualität
```

- [ ] **Step 6: Auch die Architektur-Zeile in README.md anpassen**

Ersetze:

```markdown
Das App-Passwort bleibt im Backend (ENV) und erreicht nie den Browser.
```

mit:

```markdown
Das App-Passwort bleibt im Backend (Config-Datei) und erreicht nie den Browser.
```

- [ ] **Step 7: Commit**

```bash
git add .env.example data/doday-config.example.json .gitignore deploy/compose.example.yml README.md
git commit -m "Doku & Vorlagen auf Setup-Assistenten umstellen"
```

---

### Task 6: Manuelle Verifikation des kompletten Flows

**Files:** keine Code-Änderungen — reine Verifikation.

- [ ] **Step 1: Sauberen Zustand herstellen**

```bash
rm -f data/doday-config.json
npm run dev:server
```

Erwartet: Terminal zeigt den Setup-Banner mit einem Token.

- [ ] **Step 2: Setup-Seite im Browser öffnen**

http://localhost:3000/setup öffnen. Erwartet: Formular mit Feldern für
Token, Nextcloud-URL, -Nutzername, App-Passwort, App-Login-Passwort und
einem einklappbaren „Weitere Einstellungen“-Bereich.

- [ ] **Step 3: Falschen Token testen**

Ein falsches Token eintragen, „Verbindung testen“ klicken. Erwartet:
Fehlermeldung im Formular, kein Absturz.

- [ ] **Step 4: Echte Zugangsdaten eintragen und testen**

Richtigen Token + echte Nextcloud-Zugangsdaten eintragen, „Verbindung
testen“ klicken. Erwartet: „Verbindung erfolgreich.“

- [ ] **Step 5: Speichern**

„Einrichten & starten“ klicken. Erwartet: Meldung „Gespeichert – doday
startet neu …“, danach beendet sich der Prozess im Terminal (sichtbar am
Terminal-Prompt).

- [ ] **Step 6: Normalbetrieb prüfen**

```bash
npm run dev:server
```

Erwartet: Server startet normal (kein Setup-Banner mehr), `data/doday-config.json`
existiert. http://localhost:5173 öffnen (Frontend-Terminal ggf. weiterhin
laufen lassen), Login-Seite erscheint (Cookie-Login), nach Anmeldung mit
dem gesetzten App-Login-Passwort lädt die App wie gewohnt Aufgaben/Termine.

- [ ] **Step 7: Aufräumen**

```bash
rm -f data/doday-config.json
```

(Lokale Testdatei entfernen, damit sie nicht versehentlich committet wird —
sie steht ohnehin in `.gitignore`.)
