# Spec: Kompakte Gesten-Demo (Doppeltipp auf „UN:DONE")

Stand: 2026-06-26 · Status: Design (genehmigt, vor Implementierung)

## Zweck

Eine sehr kompakte, einmal ablaufende Demo, die neuen Nutzern die drei
Wisch-Gesten der App zeigt — jede genau einmal erklärt, mit erläuterndem
Overlay. Ausgelöst durch **Doppeltipp auf den „UN:DONE"-Navi-Knopf**.
Reines Onboarding: **keine Daten-Mutation** (kein Anlegen, kein Abhaken).

## Auslöser & Lebenszyklus

- **Trigger:** Doppeltipp (zwei Taps < ~350 ms) auf `.nav-item--plain`
  („UN:DONE"). Ein einzelner Tap wechselt weiter normal in die UN:DONE-Ansicht.
- **Start:** Die Demo springt zuerst nach **DO DAY** (`goToView('day')`),
  blendet einen Backdrop + Overlay ein und startet das Skript.
- **Ende:** Nach dem letzten Schritt steht die App auf **DO DAY**; Overlay/
  Backdrop blenden aus. Läuft **einmal**, kein Loop.
- **Abbruch:** Tippen irgendwo bricht sofort ab — laufende Timer werden
  gestoppt, Overlay/Backdrop entfernt, eine evtl. laufende Vorschau sauber
  abgeräumt; die aktuelle Ansicht bleibt stehen.

## Antrieb (Technik)

Die Demo **verwendet die echte Gesten-Engine wieder**, programmatisch
angestoßen — kein zweiter Animations-Pfad:

- **Tab-Wechsel / Wrap:** Synthese des Wisch-Zustands (`swipeEdge`,
  `swipeStartY`, `swipeNavTop`) + Aufruf von `startEdgePreview()` und
  `endEdgePreview(dx)` mit einem „committenden" `dx`. So laufen exakt die
  realen Übergänge inkl. Trennlinie und Wrap-Flug.
- **Spalten-Wechsel:** `switchMobileColumn('side')` / `('main')`.

Ein Schritt-Treiber arbeitet eine Liste von Schritten ab; jeder Schritt
setzt den Overlay-Text, stößt die Geste an und wartet (per `setTimeout`)
die Animationsdauer ab, bevor der nächste folgt. Der Treiber lebt in
`main.ts` (wo State + Gesten-Engine liegen).

Begründung: zeigt das reale Verhalten, kein Doppel-Code, keine
Abweichungs-Gefahr. Verworfene Alternative: separater „Skript-Animator"
(mehr Code, müsste die Engine-Animationen nachbauen).

## Ablauf (Skript)

Voraussetzung: Ein-Spalten-Layout (mobil). Im Breitbild läuft die Demo nicht
(Gesten/Trennlinie existieren dort nicht) — Doppeltipp verhält sich dort wie
ein normaler UN:DONE-Wechsel.

0. Doppeltipp auf „UN:DONE" → `goToView('day')`, Backdrop + Overlay ein.
1. **Kanten-Wisch** (Geste 1). Overlay: „Von der Kante wischen = Tab wechseln."
   Auto-Übergänge vorwärts durch alle Tabs:
   `day → morrow → week → month → undone`.
2. **Inside-Wisch** (Geste 2). Overlay: „Innen wischen schiebt die rechte Karte
   rein/raus." Einmal `side` → `main`.
   Hinweis: Auf `undone` ist die rechte Karte „Erledigt" (nicht „Termine") →
   die Beschriftung bleibt bewusst generisch („die rechte Karte").
3. **Wrap** (Geste 3). Overlay: „Am Reihenende fliegt's über alle Tabs zurück."
   Kanten-Wisch vorwärts von `undone` → **Wrap-Flug** nach **day**.
4. Overlay + Backdrop blenden aus. Ende auf **DO DAY**.

## Overlay (UI)

- Ein fester Wrapper **außerhalb von `#app`** (wie der Toast), damit Re-Renders
  ihn nicht zerstören. Enthält: halbtransparenter Backdrop + eine kleine
  Beschriftungs-Karte (oben/mittig) mit einem kurzen Satz pro Schritt.
- `pointer-events` aktiv, damit ein Tap abbricht. Sanftes Ein-/Ausblenden.
- Texte über `t()` (DE/EN) in `lang.json`: je ein Schlüssel pro Schritt.
- Stil dezent, passend zur App (Serif-Überschrift möglich); kein Daueranzeige-
  Element — nur während der Demo im DOM.

## Komponenten / Schnittstellen

- `startGestureDemo()` — Einstieg (vom Doppeltipp-Handler). Baut Overlay,
  setzt `goToView('day')`, startet den Schritt-Treiber.
- `runDemoSteps(steps)` — arbeitet die Schritt-Liste sequenziell ab (Timeouts).
- `endGestureDemo()` — Abbruch/Abschluss: Timer stoppen, Overlay entfernen,
  Vorschau abräumen.
- Doppeltipp-Erkennung im bestehenden Klick-/Tap-Handler für `switch-view`
  (data-view="undone"): Zeitstempel des letzten Taps merken.

Wiederverwendet (unverändert): `goToView`, `startEdgePreview`,
`endEdgePreview`, `switchMobileColumn`, die Trennlinien-Logik.

## Randfälle & Regeln

- **Nur Mobil/Ein-Spalten:** sonst normaler UN:DONE-Wechsel.
- **Abbruch jederzeit** (Tap) — keine hängenden Timer/Transforms.
- **Keine Daten-Mutation** — ausschließlich Navigation + Spalten-/Übergangs-
  Animationen.
- Während der Demo ausgelöste echte Wische/Taps brechen sie ab (Tap-Handler).
- Ein zweiter Doppeltipp während einer laufenden Demo startet sie nicht neu
  (Demo-aktiv-Flag).

## Tests / Verifikation

- Logik ist überwiegend DOM-/Timing-getrieben → manuelle Verifikation auf
  localhost:5173 im schmalen Layout: Doppeltipp auf „UN:DONE" → Tour läuft,
  Overlay-Texte wechseln, endet auf DO DAY; Tap bricht ab; keine neuen/
  abgehakten Objekte; Light- und Dark-Mode.
- Reine Hilfsfunktionen (z. B. Schritt-Liste/Dauerberechnung), falls
  abtrennbar, ggf. als kleine Unit-Tests.
