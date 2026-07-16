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
