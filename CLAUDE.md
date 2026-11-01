# doday
> Governed by **CLAUDE MASTER** (`../../CLAUDE.md`). Rules here extend it; they do not override it.

Minimalistische Planer-PWA; Backend Hono (`server/`), Frontend Vite (`src/`), deployed als Docker-Container.
Nextcloud liefert Tasks, Kalender und WebDAV (`achievements.json`).

## Befehle
- `npm run dev` + `npm run dev:server` — Frontend + Backend parallel
- `npm test` — Vitest
- `npm run build` — tsc + Vite nach `dist/`

## Regeln
- `.env` und `data/doday-config.json` nie committen (nur `.example`-Dateien in Git).
- App-Passwort bleibt im Backend — erreicht nie den Browser.
- TypeScript strict; kein `any`.
