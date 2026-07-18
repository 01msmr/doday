# doday

Minimalistische Planer-PWA mit Nextcloud als Datenbasis: Aufgaben, Termine,
Gewohnheiten und Ziele – gruppiert über hierarchische `#Tags` im Klartext
(z. B. `Keller entrümpeln #Zuhause.Aufräumen`). Fünf Ansichten über die
untere Navigation (Do Day, Do Morrow, Do Week, Do Month, UN:DONE), per
Wisch oder Pfeiltasten wechselbar; Oberfläche auf Deutsch/Englisch.

## Architektur

```
Browser ── /api/v1/… ──► Hono-Backend (server/) ── WebDAV/CalDAV ──► Nextcloud
   ▲                          │
   └── statisches Frontend ◄──┘ (im Container aus dist/)
```

Das App-Passwort bleibt im Backend (Config-Datei) und erreicht nie den Browser.

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

```bash
npm test        # Unit-Tests (Vitest)
npm run lint    # ESLint (src + server)
npm run build   # Typprüfung + Produktions-Build
```

## Deployment (do.msmr.co)

```bash
docker build -t doday .
# oder mit der Vorlage deploy/compose.example.yml hinter Traefik
```

## Ordnerstruktur

| Pfad                           | Inhalt                                                      |
| ------------------------------ | ----------------------------------------------------------- |
| `src/models`                   | Datenmodelle (Habit, Achievement, Task, …)                  |
| `src/services`                 | Logik: Tags, Registry, Auswahl, ICS, Nextcloud-API-Client   |
| `src/ui`                       | Rendering: Tagesansicht, Wochen/Monats-Cockpit, Drag & Drop |
| `src/utils`                    | Helfer: Datum, Farb-Validierung                             |
| `src/i18n.ts`, `src/lang.json` | Deutsch/Englisch-Umschaltung                                |
| `server/`                      | Hono-Backend + WebDAV-Client                                |
| `deploy/`                      | Compose-Vorlage für Traefik                                 |
| `docs/`                        | Konzepte (z. B. Verschieben per Drag & Drop)                |
