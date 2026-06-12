# doday

Minimalistische Tagesansicht-PWA mit Nextcloud als Datenbasis: Aufgaben,
Termine, Gewohnheiten und Ziele – gruppiert über hierarchische `#Tags`
im Klartext (z. B. `Keller entrümpeln #Zuhause.Aufräumen`).

## Architektur

```
Browser ── /api/v1/… ──► Hono-Backend (server/) ── WebDAV/CalDAV ──► Nextcloud
   ▲                          │
   └── statisches Frontend ◄──┘ (im Container aus dist/)
```

Das App-Passwort bleibt im Backend (ENV) und erreicht nie den Browser.

## Entwicklung

```bash
npm install
cp .env.example .env   # Nextcloud-Zugang eintragen

# Terminal 1: Backend (Port 3000)
npm run dev:server

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

| Pfad            | Inhalt                                              |
| --------------- | --------------------------------------------------- |
| `src/models`    | Datenmodelle (Habit, Achievement, Task, …)           |
| `src/services`  | Logik: Tags, Registry, Auswahl, ICS, Mock-Daten      |
| `src/ui`        | Rendering: Tagesansicht, Gruppierung                 |
| `src/utils`     | Helfer: Datum, Farb-Validierung                      |
| `server/`       | Hono-Backend + WebDAV-Client                         |
| `deploy/`       | Compose-Vorlage für Traefik                          |
| `docs/`         | Konzepte (z. B. Verschieben per Drag & Drop)         |
