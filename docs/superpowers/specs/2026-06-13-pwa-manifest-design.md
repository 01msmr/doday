# Design: PWA-Manifest (Homescreen-Vollbild)

Datum: 2026-06-13 · Status: von Uli freigegeben

## Ziel

Do Day soll vom iPhone-Homescreen als Vollbild-App starten (ohne
Safari-Adressleiste) und im Browser ein sauberes Web-App-Manifest haben.
**Kein Service Worker / keine Offline-Daten** (Nutzerentscheidung) – die
Daten kommen weiterhin live aus der Nextcloud.

## Ansatz

Statisches `manifest.json` in `public/` – keine neue Abhängigkeit, kein
Build-/Server-Eingriff. Reiht sich in das bestehende Muster ein (Icons liegen
schon in `public/` und werden vom vorhandenen `serveStatic` aus `dist/`
ausgeliefert). Dateiname bewusst `manifest.json` (nicht `.webmanifest`),
damit Hosos statischer Server den MIME-Typ sicher als `application/json`
liefert.

## Umfang

1. **`public/manifest.json`**
   - `name` / `short_name`: „Do Day"
   - `display`: `standalone`
   - `start_url`: `/`, `scope`: `/`
   - `theme_color` + `background_color`: `#f3f0e9` (helles Papier – Marken-Look;
     Manifest erlaubt nur einen Splash-Wert, App folgt sonst Hell/Dunkel)
   - `icons`: 192×192 und 512×512, `purpose: "any"`, erzeugt aus
     `public/app-icon-1024.png`

2. **`public/icon-192.png`, `public/icon-512.png`** – per `sips` aus dem
   1024er-Original verkleinert (wie bei apple-touch-icon/favicon).

3. **`index.html`** im `<head>`:
   - `<link rel="manifest" href="/manifest.json" />`
   - `<meta name="apple-mobile-web-app-capable" content="yes" />`
   - `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`
   (Das `apple-touch-icon` ist bereits verlinkt.)

## Bewusst NICHT enthalten (YAGNI)

- Kein Service Worker, kein Offline-Cache, kein `vite-plugin-pwa`.
- Kein `maskable`-Icon (ohne Safe-Zone-Padding sähe es auf Android beschnitten
  aus; iOS nutzt ohnehin das `apple-touch-icon`).

## Tests

Keine Logik → keine Unit-Tests. Prüfung manuell:
- Desktop-Chrome: DevTools → Application → Manifest zeigt Felder + Icons ohne Fehler.
- iPhone: „Zum Home-Bildschirm" → App startet im Vollbild ohne Safari-Leiste,
  korrektes Icon.
- `npm run build` baut ohne Fehler; `manifest.json` + Icons liegen in `dist/`.
