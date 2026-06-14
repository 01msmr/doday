# Do Day als Nextcloud-ExApp (AppAPI) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Do Day läuft als Nextcloud-ExApp hinter dem Nextcloud-Login, sodass die separate Traefik-Basic-Auth (und damit das ständige Passwort-Nachfragen, v. a. iOS-PWA) entfällt — SSO über die bestehende Nextcloud-Sitzung.

**Architecture:** Das vorhandene Hono-Backend (`server/index.ts`, liefert `/api/v1/*` + `dist/`) wird als ExApp registriert. Nextcloud authentifiziert den Nutzer und reicht Requests über AppAPI an den Container weiter; der Container **verifiziert das AppAPI-Shared-Secret** und bedient nur so legitimierte Anfragen. Der Datenzugriff (WebDAV/CalDAV) bleibt in **Stufe B-minimal** über das bestehende App-Passwort (Einzelnutzer) — die ExApp ist also das **Auth-Gate**, nicht (noch) ein Mehrbenutzer-Umbau. Die kurze URL `do.msmr.co` bleibt als Redirect erhalten; das iOS-Icon zieht auf die Nextcloud-URL um.

**Tech Stack:** Hono + @hono/node-server (Backend), Vite/Vanilla-TS (Frontend), Nextcloud AppAPI (ExApp, manual-install Deploy-Daemon), Traefik (Redirect statt Basic Auth), Docker.

---

## Architektur-Entscheidung (vor allen Tasks lesen)

**B-minimal vs. B-full — bewusst B-minimal:**

| | B-minimal (dieser Plan) | B-full (später) |
|---|---|---|
| Auth-Gate | Nextcloud-Sitzung + AppAPI-Secret | dito |
| WebDAV/CalDAV-Zugriff | bestehendes **App-Passwort** (1 Nutzer) | im Kontext des eingeloggten Nutzers |
| Aufwand | überschaubar, Datenlayer unverändert | hoch (Nutzer-Tokens/Impersonation, AppAPI gibt kein WebDAV-Passwort heraus) |
| Nutzen | Passwort-Generve weg, SSO | echtes Mehrbenutzer-SSO |

B-full ist als „Spätere Erweiterung" am Ende skizziert, aber **nicht Teil dieses Plans**.

**Externe Unbekannte (deshalb Task 0 = Spike):** AppAPI ist versionsabhängig. Sicher dokumentiert sind die **ausgehenden** Header (ExApp→Nextcloud): `AA-VERSION`, `EX-APP-ID`, `EX-APP-VERSION`, `AUTHORIZATION-APP-API` (base64 `userid:secret`), sowie die Container-ENV `APP_ID`, `APP_SECRET`, `APP_PORT`, `APP_HOST`, `NEXTCLOUD_URL`, `AA_VERSION`. **Unsicher / zu verifizieren:** wie der **eingehende** (Nextcloud→ExApp) Proxy-Request signiert ist und unter welchem Header die Nutzer-ID ankommt, sowie die exakte **App-URL/Route**, unter der die UI in Nextcloud erscheint. Diese Werte fixiert Task 0 gegen die laufende Instanz; spätere Tasks referenzieren sie.

## Dateistruktur (was entsteht/sich ändert)

- **Neu** `server/appApiAuth.ts` — Hono-Middleware: verifiziert AppAPI-Requests (Secret/Signatur), stellt die Nutzer-ID bereit; plus `/heartbeat`. Eigene Datei = klare Verantwortung, isoliert testbar.
- **Ändern** `server/config.ts` — lädt zusätzlich `APP_ID`/`APP_SECRET`/`APP_PORT`/`APP_HOST`/`AA_VERSION`; ExApp-Modus optional (lokaler Dev bleibt ohne).
- **Ändern** `server/index.ts` — Middleware einhängen, `/heartbeat`, auf `APP_HOST:APP_PORT` lauschen, wenn ExApp-Modus.
- **Ändern** `src/services/api.ts` — API-Basis konfigurierbar (Proxy-Subpfad).
- **Ändern** `vite.config.ts`, `index.html`, `public/manifest.json` — Asset-/Manifest-Basispfad + `start_url`/`scope` für die Nextcloud-Origin.
- **Ändern** `Dockerfile` — `EXPOSE`/Start auf `APP_PORT`/`APP_HOST`.
- **Ändern** `deploy/compose.example.yml` — ExApp-ENV; Traefik-Redirect `do.msmr.co` → Nextcloud-App-URL; Basic-Auth-Middleware entfernen.
- **Neu** `docs/exapp-appapi-fakten.md` — Spike-Ergebnis (verifizierte AppAPI-Details).
- **Ändern** `docs/projekt-stand.md` — Status „ExApp-Stufe" aktualisieren.

---

### Task 0: Spike — AppAPI-Fakten gegen die laufende Nextcloud fixieren

**Files:**
- Create: `docs/exapp-appapi-fakten.md`

Kein Code — Recherche/Verifikation. Ergebnis schriftlich festhalten, alle Folgetasks bauen darauf.

- [ ] **Step 1: AppAPI-Version & Deploy-Daemon-Lage prüfen**

Auf dem Server (SSH zu 10.0.10.100, Nextcloud-Container):
```bash
php occ app_api:daemon:list
php occ app_api:app:list
php occ config:app:get app_api version || php occ app:list | grep app_api
```
Notieren: ist AppAPI installiert? Gibt es schon einen Deploy-Daemon? Welche Version?

- [ ] **Step 2: Eingehende Proxy-Auth klären (der kritische Punkt)**

Auf der aktuellen AppAPI-Doku der installierten Version nachsehen (Authentication / Deployment):
- Wie verifiziert die ExApp, dass ein Request wirklich von Nextcloud kam? (Shared Secret? `AA-SIGNATURE`-HMAC? Welche Header genau?)
- Unter welchem Header kommt die **Nutzer-ID** im eingehenden Request an?
- Über welche **URL/Route** ist die ExApp-UI in Nextcloud erreichbar (Top-Menü-Eintrag bzw. `…/apps/app_api/proxy/<appid>/…`)?

Quelle: <https://nextcloud.github.io/app_api/tech_details/Authentication.html> und Deployment-Seite der passenden Version.

- [ ] **Step 3: Ergebnis festhalten**

`docs/exapp-appapi-fakten.md` mit: AppAPI-Version, Daemon-Status, **exakter Name des Inbound-Auth-Headers + Verfahren (Secret vs. HMAC)**, **Nutzer-ID-Header**, **App-UI-URL-Schema**, ENV-Liste. Diese Datei ist die Wahrheit für Task 2/3/6.

- [ ] **Step 4: Commit**

```bash
git add docs/exapp-appapi-fakten.md
git commit -m "docs(exapp): AppAPI-Fakten der Instanz fixiert (Spike)"
```

---

### Task 1: ExApp-Konfiguration in `config.ts` (ohne Verhalten zu ändern)

**Files:**
- Modify: `server/config.ts`
- Test: `server/config.test.ts` (neu, falls nicht vorhanden)

- [ ] **Step 1: Failing test — ExApp-ENV wird geladen, ist aber optional**

```ts
// server/config.test.ts
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

const base = {
  NEXTCLOUD_URL: 'https://cd.msmr.co',
  NEXTCLOUD_USER: 'uli',
  NEXTCLOUD_APP_PASSWORD: 'pw',
};

describe('loadConfig ExApp-Felder', () => {
  it('lässt exApp undefiniert, wenn keine APP_*-Variablen gesetzt sind', () => {
    const cfg = loadConfig({ ...base } as NodeJS.ProcessEnv);
    expect(cfg.exApp).toBeUndefined();
  });

  it('füllt exApp, wenn APP_ID und APP_SECRET gesetzt sind', () => {
    const cfg = loadConfig({
      ...base,
      APP_ID: 'doday',
      APP_SECRET: 'sekret',
      APP_PORT: '9000',
      APP_HOST: '0.0.0.0',
      AA_VERSION: '2.0.0',
    } as NodeJS.ProcessEnv);
    expect(cfg.exApp).toEqual({
      appId: 'doday',
      secret: 'sekret',
      port: 9000,
      host: '0.0.0.0',
      aaVersion: '2.0.0',
    });
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npx vitest run server/config.test.ts`
Expected: FAIL (`cfg.exApp` existiert nicht)

- [ ] **Step 3: Minimal implementieren**

In `server/config.ts` das Interface + Laden ergänzen:
```ts
export interface ExAppConfig {
  appId: string;
  secret: string;
  port: number;
  host: string;
  aaVersion: string;
}

// in AppConfig ergänzen:
//   exApp?: ExAppConfig;

// am Ende von loadConfig, vor dem return, berechnen:
const exApp =
  env.APP_ID && env.APP_SECRET
    ? {
        appId: env.APP_ID,
        secret: env.APP_SECRET,
        port: Number(env.APP_PORT ?? 9000),
        host: env.APP_HOST ?? '0.0.0.0',
        aaVersion: env.AA_VERSION ?? '',
      }
    : undefined;
// ... und im return-Objekt `exApp,` hinzufügen
```

- [ ] **Step 4: Test ausführen — muss bestehen**

Run: `npx vitest run server/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/config.ts server/config.test.ts
git commit -m "feat(exapp): optionale ExApp-Konfiguration aus APP_*-ENV"
```

---

### Task 2: AppAPI-Auth-Middleware + /heartbeat

**Files:**
- Create: `server/appApiAuth.ts`
- Test: `server/appApiAuth.test.ts`
- Modify: `server/index.ts`

> **Hinweis:** Das *Verifikationsverfahren* (reines Shared-Secret vs. HMAC-`AA-SIGNATURE`) und der **Inbound-Header-Name** stammen aus `docs/exapp-appapi-fakten.md` (Task 0). Der untenstehende Code zeigt die Shared-Secret-Variante; ist laut Spike HMAC nötig, wird in Step 3 die Vergleichsfunktion entsprechend gefüllt (gleiche Signatur, gleiche Tests).

- [ ] **Step 1: Failing test — Middleware lässt nur gültige AppAPI-Requests durch**

```ts
// server/appApiAuth.test.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { appApiAuth } from './appApiAuth';

const cfg = { appId: 'doday', secret: 'sekret', port: 9000, host: '0.0.0.0', aaVersion: '2.0.0' };

function appWith() {
  const app = new Hono();
  app.use('/api/*', appApiAuth(cfg));
  app.get('/api/v1/ping', (c) => c.json({ user: c.get('userId') }));
  return app;
}

describe('appApiAuth', () => {
  it('lehnt ohne AppAPI-Header mit 401 ab', async () => {
    const res = await appWith().request('/api/v1/ping');
    expect(res.status).toBe(401);
  });

  it('lehnt mit falschem Secret mit 401 ab', async () => {
    const auth = Buffer.from('uli:falsch').toString('base64');
    const res = await appWith().request('/api/v1/ping', {
      headers: { 'EX-APP-ID': 'doday', 'AUTHORIZATION-APP-API': auth },
    });
    expect(res.status).toBe(401);
  });

  it('lässt gültigen Request durch und stellt userId bereit', async () => {
    const auth = Buffer.from('uli:sekret').toString('base64');
    const res = await appWith().request('/api/v1/ping', {
      headers: { 'EX-APP-ID': 'doday', 'AUTHORIZATION-APP-API': auth },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: 'uli' });
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npx vitest run server/appApiAuth.test.ts`
Expected: FAIL (`./appApiAuth` existiert nicht)

- [ ] **Step 3: Minimal implementieren**

```ts
// server/appApiAuth.ts
import type { MiddlewareHandler } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import type { ExAppConfig } from './config';

/**
 * Verifiziert, dass ein Request von Nextcloud (AppAPI) kam, und stellt die
 * Nutzer-ID unter c.get('userId') bereit. Verfahren laut docs/exapp-appapi-fakten.md:
 * EX-APP-ID muss passen, AUTHORIZATION-APP-API ist base64 "userid:secret".
 */
export function appApiAuth(cfg: ExAppConfig): MiddlewareHandler {
  return async (c, next) => {
    const exAppId = c.req.header('EX-APP-ID');
    const authz = c.req.header('AUTHORIZATION-APP-API');
    if (exAppId !== cfg.appId || !authz) {
      return c.json({ error: 'AppAPI-Auth fehlt' }, 401);
    }
    const [userId, secret] = Buffer.from(authz, 'base64').toString('utf8').split(':');
    const ok =
      !!userId &&
      !!secret &&
      secret.length === cfg.secret.length &&
      timingSafeEqual(Buffer.from(secret), Buffer.from(cfg.secret));
    if (!ok) {
      return c.json({ error: 'AppAPI-Secret ungültig' }, 401);
    }
    c.set('userId', userId);
    await next();
  };
}
```

- [ ] **Step 4: Test ausführen — muss bestehen**

Run: `npx vitest run server/appApiAuth.test.ts`
Expected: PASS

- [ ] **Step 5: Middleware + /heartbeat in index.ts einhängen (nur im ExApp-Modus)**

In `server/index.ts` nach `const app = new Hono();`:
```ts
// AppAPI: Pflicht-Healthcheck (ungeschützt) + Schutz aller /api-Routen
if (config.exApp) {
  app.get('/heartbeat', (c) => c.json({ status: 'ok' }));
  app.use('/api/*', appApiAuth(config.exApp));
}
```
Import oben ergänzen: `import { appApiAuth } from './appApiAuth';`

- [ ] **Step 6: Volle Test-Suite + Typcheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, tsc exit 0

- [ ] **Step 7: Commit**

```bash
git add server/appApiAuth.ts server/appApiAuth.test.ts server/index.ts
git commit -m "feat(exapp): AppAPI-Auth-Middleware + /heartbeat"
```

---

### Task 3: Frontend unter dem AppAPI-Proxy-Pfad lauffähig machen

Problem: Als ExApp wird die UI unter einem **Subpfad** ausgeliefert (siehe Task 0). Die heutigen absoluten Pfade (`/api/v1/…`, `/icon-192.png`) brechen dort. Lösung: konfigurierbare Basis.

**Files:**
- Modify: `src/services/api.ts`
- Test: `src/services/api.test.ts`
- Modify: `vite.config.ts`, `index.html`, `public/manifest.json`

- [ ] **Step 1: Failing test — API-URL respektiert eine Basis**

```ts
// in src/services/api.test.ts ergänzen
import { apiUrl } from './api';

describe('apiUrl', () => {
  it('hängt die Route an die konfigurierte Basis', () => {
    expect(apiUrl('tags', '')).toBe('/api/v1/tags');
    expect(apiUrl('tags', '/index.php/apps/app_api/proxy/doday')).toBe(
      '/index.php/apps/app_api/proxy/doday/api/v1/tags',
    );
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npx vitest run src/services/api.test.ts`
Expected: FAIL (`apiUrl` existiert nicht)

- [ ] **Step 3: Minimal implementieren**

In `src/services/api.ts`:
```ts
/** Basis-Pfad, unter dem das Frontend läuft (leer = Root, gesetzt via Vite base). */
const BASE = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

/** Baut die volle API-URL inkl. optionaler Basis (für den ExApp-Proxy-Subpfad). */
export function apiUrl(route: string, base: string = BASE): string {
  return `${base}/api/v1/${route}`;
}
```
Danach die zwei `fetch(\`/api/v1/${route}\`)`-Stellen auf `fetch(apiUrl(route))` umstellen.

- [ ] **Step 4: Test ausführen — muss bestehen**

Run: `npx vitest run src/services/api.test.ts`
Expected: PASS

- [ ] **Step 5: Vite-Basis + Asset-Pfade konfigurierbar machen**

In `vite.config.ts` `base: process.env.VITE_BASE ?? '/'` setzen. In `index.html` die festen `/icon…`/`/manifest.json`-Referenzen auf relative Pfade (`./…`) umstellen, in `public/manifest.json` `start_url`/`scope` ebenso relativ (`"."`). Exakte Zielbasis = App-UI-URL aus Task 0; Build dann mit `VITE_BASE=<basis> npm run build`.

- [ ] **Step 6: Build + Tests**

Run: `npm run build && npx vitest run`
Expected: Build ok, Tests grün

- [ ] **Step 7: Commit**

```bash
git add src/services/api.ts src/services/api.test.ts vite.config.ts index.html public/manifest.json
git commit -m "feat(exapp): Frontend unter konfigurierbarem Basis-Pfad (Proxy-tauglich)"
```

---

### Task 4: Container als ExApp starten (Port/Host aus ENV)

**Files:**
- Modify: `Dockerfile`
- Modify: `server/index.ts:Ende` (listen)

- [ ] **Step 1: Listen auf APP_HOST/APP_PORT im ExApp-Modus**

In `server/index.ts` den `serve`-Aufruf anpassen:
```ts
const listenPort = config.exApp?.port ?? config.port;
const listenHost = config.exApp?.host ?? undefined;
serve({ fetch: app.fetch, port: listenPort, hostname: listenHost }, (info) => {
  console.log(`doday-Backend läuft auf ${listenHost ?? 'localhost'}:${info.port}`);
});
```

- [ ] **Step 2: Dockerfile auf konfigurierbaren Port**

In `Dockerfile` `EXPOSE 3000` → `EXPOSE 9000` (bzw. der in Task 5 registrierte Port) und sicherstellen, dass `dist/` mit korrekter `VITE_BASE` gebaut wurde (Build-Arg ergänzen):
```dockerfile
ARG VITE_BASE=/
ENV VITE_BASE=$VITE_BASE
# ... vor `RUN npm run build`
```

- [ ] **Step 3: Lokaler Smoke-Test (ohne Nextcloud)**

Run:
```bash
APP_ID=doday APP_SECRET=test APP_PORT=9000 APP_HOST=127.0.0.1 \
NEXTCLOUD_URL=https://cd.msmr.co NEXTCLOUD_USER=uli NEXTCLOUD_APP_PASSWORD=xxx \
npx tsx server/index.ts &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9000/heartbeat   # erwartet 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9000/api/v1/tags # erwartet 401 (kein AppAPI-Header)
kill %1
```
Expected: `200` dann `401`

- [ ] **Step 4: Commit**

```bash
git add server/index.ts Dockerfile
git commit -m "feat(exapp): Container lauscht auf APP_HOST/APP_PORT, /heartbeat verifiziert"
```

---

### Task 5: Deploy-Daemon + ExApp registrieren

**Files:** keine im Repo — Server-/occ-Schritte. In `docs/exapp-appapi-fakten.md` mitprotokollieren.

- [ ] **Step 1: Image bauen & Container starten (manual-install)**

Auf dem Server, im Repo-Verzeichnis. `VITE_BASE` = App-UI-Basis aus Task 0:
```bash
docker compose build --build-arg VITE_BASE=/index.php/apps/app_api/proxy/doday/ doday
# Container im selben Docker-Netz wie Nextcloud starten, Port 9000 intern erreichbar
docker compose up -d doday
```

- [ ] **Step 2: Manual-Install-Daemon registrieren (falls noch keiner existiert)**

```bash
php occ app_api:daemon:register \
  manual-docker "Manual (Compose)" manual-install \
  http <doday-container-host>:9000 https://cd.msmr.co
```
`<doday-container-host>` = im Nextcloud-Netz erreichbarer Hostname/Container-Name des doday-Containers.

- [ ] **Step 3: ExApp registrieren (Secret = APP_SECRET des Containers)**

```bash
php occ app_api:app:register doday manual-docker --json-info \
  '{"appid":"doday","name":"Do Day","version":"0.1.0","daemon_config_name":"manual-docker","secret":"<APP_SECRET>","port":9000,"protocol":"http","system":false,"scopes":[]}'
```
`<APP_SECRET>` muss exakt der `APP_SECRET`-ENV des Containers entsprechen (Task 4). Scopes laut Task-0-Bedarf (B-minimal: leer/minimal, da Datenzugriff weiter per App-Passwort).

- [ ] **Step 4: Heartbeat/Enable prüfen**

```bash
php occ app_api:app:list
# Status muss "enabled" / erreichbar sein; sonst Logs des Containers + occ-Ausgabe prüfen
```
Expected: `doday` gelistet, enabled.

---

### Task 6: UI über Nextcloud öffnen — SSO verifizieren

- [ ] **Step 1: App-UI-URL aufrufen (eingeloggt in Nextcloud)**

Die App-UI-URL aus Task 0 im Browser öffnen (eingeloggt). Erwartung: Do Day lädt **ohne** separate Passwortabfrage; `/api/v1/*` antwortet (200), weil AppAPI den Request mit gültigem Secret proxyt.

- [ ] **Step 2: Negativtest**

App-UI-URL in einem **abgemeldeten** Browser/Inkognito öffnen → Nextcloud-Login erscheint (kein Durchgriff). Direkter Aufruf des Containers `/api/v1/tags` ohne AppAPI-Header → 401.

- [ ] **Step 3: Ergebnis in `docs/exapp-appapi-fakten.md` notieren** (URL, Verhalten) und committen.

---

### Task 7: `do.msmr.co` als Redirect behalten + iOS-Icon umziehen

**Files:**
- Modify: `deploy/compose.example.yml`
- Modify: `docs/projekt-stand.md`

- [ ] **Step 1: Traefik-Redirect statt App auf `do.msmr.co`**

In `deploy/compose.example.yml` die doday-Router-Labels durch einen Redirect ersetzen (302 → App-UI-URL):
```yaml
- "traefik.http.routers.doday.rule=Host(`do.msmr.co`)"
- "traefik.http.routers.doday.entrypoints=websecure"
- "traefik.http.routers.doday.tls.certresolver=letsencrypt"
- "traefik.http.middlewares.doday-redir.redirectregex.regex=^https://do\\.msmr\\.co/.*"
- "traefik.http.middlewares.doday-redir.redirectregex.replacement=https://cd.msmr.co/index.php/apps/app_api/proxy/doday/"
- "traefik.http.routers.doday.middlewares=doday-redir"
```
(Exakte Ziel-URL aus Task 0.)

- [ ] **Step 2: iOS-Icon neu anlegen**

Auf dem iPhone die App-UI-URL (Nextcloud) öffnen → „Zum Home-Bildschirm". Altes `do.msmr.co`-Icon entfernen. (Doku-Schritt, kein Code.)

- [ ] **Step 3: Doku aktualisieren + Commit**

`docs/projekt-stand.md`: „ExApp-Stufe" auf erledigt/aktiv, Redirect + Icon-Umzug beschreiben.
```bash
git add deploy/compose.example.yml docs/projekt-stand.md
git commit -m "feat(exapp): do.msmr.co als Redirect auf die Nextcloud-App-URL"
```

---

### Task 8: Basic Auth entfernen + Abschluss-Verifikation

**Files:**
- Modify: `deploy/compose.example.yml`, `docs/projekt-stand.md`

- [ ] **Step 1: Traefik-Basic-Auth-Middleware entfernen**

Die `doday-auth`-Basicauth-Labels und den `doday-pwa`-Sonderrouter aus `deploy/compose.example.yml` löschen (durch ExApp obsolet).

- [ ] **Step 2: End-to-End-Verifikation**

- App über Nextcloud öffnen (Desktop + iPhone): lädt ohne Passwortabfrage, Aufgaben/Termine/Tags laden und speichern.
- iOS-Icon: Kaltstart → **keine** Passwortabfrage mehr (Kernziel erreicht).
- `do.msmr.co` im Browser → leitet auf die App weiter.

- [ ] **Step 3: Doku + Memory**

`docs/projekt-stand.md` Störungs-Lehren/Status ergänzen; Memory `doday-pwa-concept` um den ExApp-Stand erweitern.
```bash
git add deploy/compose.example.yml docs/projekt-stand.md
git commit -m "chore(exapp): Basic Auth entfernt, ExApp ist das Auth-Gate"
```

---

## Spätere Erweiterung (NICHT in diesem Plan): B-full Mehrbenutzer

Datenzugriff im Kontext des eingeloggten Nutzers statt festem App-Passwort: erfordert nutzergebundene Credentials (AppAPI-User-Scopes/Impersonation oder Nextcloud-interne APIs für Files/Calendar) und ein Mapping `userId → WebDAV/CalDAV-Zugriff`. Eigener Spike + Plan.

---

## Self-Review (gegen Ziel & Spec geprüft)

- **Ziel „Passwort-Generve weg":** Task 2 (Gate) + Task 6 (SSO-Verifikation) + Task 8 (Basic Auth raus) + iOS-Kaltstart-Check decken es ab. ✅
- **URL behalten:** Task 7 (Redirect + Icon-Umzug) — deckt die in der Diskussion zugesagte Lösung. ✅
- **Datenlayer unverändert (B-minimal):** explizit als Entscheidung dokumentiert; WebDAV/CalDAV-Auth bleibt App-Passwort. ✅
- **Externe Unbekannte:** nicht erfunden, sondern in Task 0 verifiziert; Task 2/3/5/7 referenzieren die fixierten Werte (Inbound-Header, App-URL, VITE_BASE). ⚠️ bewusst spike-abhängig.
- **Typkonsistenz:** `ExAppConfig` (Task 1) wird in `appApiAuth` (Task 2) und `index.ts` (Task 2/4) identisch verwendet; `apiUrl` (Task 3) einheitlich benannt.
- **Risiko/Annahme:** Verifikationsverfahren des Inbound-Requests (Secret vs. HMAC) steht erst nach Task 0 fest — Task 2 ist so geschnitten, dass nur die Vergleichsfunktion getauscht wird, Tests/Signatur bleiben.
