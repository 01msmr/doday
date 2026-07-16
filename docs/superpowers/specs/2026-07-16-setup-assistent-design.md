# Setup-Assistent für Fremd-Deployments

## Ziel

doday soll anderen Leuten zur Verfügung gestellt werden können: jede*r hostet
eine eigene Instanz (eigener Server/Container) und verbindet sie mit der
eigenen Nextcloud. Es bleibt Single-Tenant pro Deployment — kein gemeinsamer
Server, keine Nutzerverwaltung für mehrere Personen.

Statt Zugangsdaten manuell in `.env` einzutragen, konfiguriert sich doday
beim ersten Start über ein Web-Formular. ENV-Variablen für Nextcloud-
Zugangsdaten und Cookie-Login entfallen komplett — auch für das
Bestandsdeploy `do.msmr.co` und lokale Entwicklung (siehe „Migration &
lokale Entwicklung“).

## Architektur

Der Server prüft beim Start, ob eine Config-Datei existiert
(`data/doday-config.json`, neues Docker-Volume, Pfad fix — keine eigene
ENV-Variable dafür, das wäre spekulativ).

- **Datei fehlt → Setup-Modus.** Nur `/setup` (Formular) und
  `/api/setup/*` sind erreichbar. Jede andere Route antwortet mit einem
  Hinweis auf `/setup`. Ein zufälliger Setup-Token wird beim Boot im
  Prozessspeicher erzeugt und gut sichtbar geloggt:

  ```
  === doday Ersteinrichtung ===
  Öffne http://<host>:3000/setup und gib diesen Token ein:
  Setup-Token: 8f3a2c91-...
  ==============================
  ```

- **Datei vorhanden → Normalbetrieb** wie heute, Config wird einmal beim
  Start aus der Datei geladen (`server/config.ts`).

`PORT` bleibt eine reine Infrastruktur-ENV-Variable (Traefik/Vite-Proxy
erwarten sie fix) — kein Formularfeld, keine Änderung.

## Formularfelder (`/setup`)

Pflicht:
- Nextcloud-URL
- Nextcloud-Nutzername
- App-Passwort (Nextcloud, „Einstellungen → Sicherheit → Geräte & Sitzungen“)
- App-Login-Passwort (Cookie-Login, ersetzt bisheriges `DODAY_PASSWORD`;
  der HMAC-Schlüssel wird wie bisher automatisch daraus abgeleitet — kein
  eigenes Feld dafür)

Optional (Standardwerte wie bisher vorbelegt, einklappbar):
- Datenordner (Default `/Notes/DoDay`)
- Termine-Kalender (Anzeigename, Default: erster passender Kalender)
- Aufgaben-Kalender (Anzeigename, Default: erster passender Kalender)

## Datenfluss

1. `GET /setup` liefert die Formular-Seite. Nur erreichbar/aktiv, solange
   keine Config-Datei existiert.
2. „Verbindung testen“ → `POST /api/setup/test`: prüft den Token, führt
   einen echten WebDAV-Request gegen die angegebene Nextcloud aus
   (PROPFIND/MKCOL auf den Datenordner, analog zur bestehenden Logik in
   `server/webdav.ts`). Ergebnis (ok/Fehlermeldung) wird direkt im
   Formular angezeigt, nichts wird gespeichert.
3. „Speichern“ → `POST /api/setup`: gleiche Token- und Verbindungsprüfung,
   schreibt bei Erfolg `data/doday-config.json`, antwortet mit Erfolg und
   beendet den Prozess (`process.exit(0)`). Docker (`restart:
   unless-stopped`) startet den Container neu; der Server findet jetzt die
   Config-Datei und bootet normal durch.
4. Jede Route außer `/setup` und `/api/setup/*` antwortet im Setup-Modus
   mit einem Hinweis auf `/setup` statt mit ihrer normalen Antwort.

## Config-Datei

`data/doday-config.json` bündelt, was heute über ENV kam:

```json
{
  "nextcloudUrl": "https://...",
  "nextcloudUser": "...",
  "appPassword": "...",
  "dataDir": "/Notes/DoDay",
  "auth": { "password": "...", "secret": "..." },
  "eventsCalendar": "Persönlich",
  "tasksCalendar": "Aufgaben"
}
```

`server/config.ts` liest diese Datei statt (bzw. zusätzlich zu, für
`auth.secret`-Ableitung) der bisherigen ENV-Variablen. `eventsCalendar`/
`tasksCalendar` wandern aus dem direkten `process.env`-Zugriff in
`server/index.ts:164` und `server/index.ts:249` in die zentrale
`AppConfig` — bisher lasen beide Stellen `process.env.DODAY_TASKS_CALENDAR`
bzw. `process.env.DODAY_EVENTS_CALENDAR` direkt, das wird konsolidiert.

## Fehlerbehandlung

- Fehlendes/falsches Token bei `/api/setup/*` → 403.
- Verbindungstest schlägt fehl (falsche URL, falsches Passwort, Ordner
  nicht anlegbar) → Klartext-Fehlermeldung im Formular, nichts wird
  gespeichert oder neu gestartet.
- Speichern schlägt fehl (z. B. Datei nicht schreibbar) → Fehlermeldung im
  Formular, kein Neustart.

## Migration & lokale Entwicklung

- **Bestandsdeploy `do.msmr.co`:** einmalig manuell migrieren (Config-Datei
  von Hand anlegen oder Setup-Assistenten einmal durchklicken). Kein Teil
  dieses Specs/Plans — separater Schritt nach der Implementierung.
- **Lokale Entwicklung:** Statt `.env` gibt es künftig
  `data/doday-config.example.json` als Vorlage (analog zu
  `.env.example`), die nach `data/doday-config.json` kopiert werden kann —
  der Setup-Assistent entfällt dann, da `config.ts` nur prüft, ob die
  Datei existiert.
- `.env.example` und die zugehörigen README-Zeilen werden entsprechend
  entfernt/angepasst.

## Testing

TDD wie im restlichen Projekt üblich:
- `server/config.ts`: Datei fehlt → Setup-Modus-Flag; Datei vorhanden →
  korrekt geparste `AppConfig`.
- Setup-Token: Erzeugung, Gültigkeitsprüfung (richtig/falsch/fehlt).
- `POST /api/setup/test`: Erfolgsfall und Fehlerfälle (Mock der
  WebDAV-Anfrage).
- `POST /api/setup`: schreibt Datei korrekt, ruft `process.exit` nur bei
  Erfolg.
- Middleware: Setup-Modus blockiert alle Routen außer `/setup` und
  `/api/setup/*`.
- Manueller Browser-Test des kompletten Flows (Setup-Seite öffnen, Token
  eingeben, testen, speichern, Neustart abwarten, App normal nutzen) vor
  Abschluss, da UI-Änderung.
