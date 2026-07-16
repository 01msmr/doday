# Tab-Wechsel per iPad-Wisch und Desktop-Pfeiltasten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auf dem iPad per Wisch (überall auf dem Bildschirm) und am Desktop
per Pfeiltasten links/rechts zwischen den 5 Tabs (DAY, MORROW, WEEK, MONTH,
UN:DONE) wechseln, zusätzlich zur bestehenden Klick-Navigation und der
unveränderten Telefon-Kanten-Wisch-Geste.

**Architecture:** Zwei neue, unabhängige Event-Handler-Blöcke in
`src/main.ts`, beide nutzen einen neuen kleinen Helper `neighborView()` und
rufen die vorhandene `goToView()` auf. Kein neuer Renderpfad, keine neuen
Dateien.

**Tech Stack:** Vanilla TypeScript, native Touch-Events und `keydown` (kein
neues Package).

## Global Constraints

- Reihenfolge/Bedeutung der Tabs bleibt `VIEW_ORDER` (`main.ts:74`): `['day', 'morrow', 'week', 'month', 'undone']`.
- Telefon-Kanten-Wisch (bestehender Code, `main.ts:1670-1793`) bleibt unverändert – die neue Geste ist ein eigener, unabhängiger State.
- Neue Geste nur aktiv, wenn `!singleColumn.matches` (`main.ts:1676`, Breakpoint `max-width: 40.999rem`) – reagiert überall auf dem Bildschirm, kein Kanten-Zwang.
- Kein Umlauf an den Rändern (`day` links, `undone` rechts) – dort passiert bei weiterem Wisch/Pfeil nichts.
- Pfeiltasten wechseln den Tab nicht, wenn `document.activeElement` ein `input`/`textarea`/`select` ist.
- Kein Vorschau-Mitziehen/keine Animation – sofortiger `goToView()`-Wechsel.
- Diese Änderung ist reines UI-/Interaktions-Wiring (kein `services/`-Baustein) – **keine neuen Unit-Tests**, Verifikation erfolgt manuell im Browser (wie bei der bestehenden Telefon-Geste).

---

## File Structure

- **Modify** `src/main.ts` — `neighborView()`-Helper direkt nach `goToView()` (nach Zeile 85); neuer Touch-Listener-Block + Desktop-Keydown-Listener direkt nach dem bestehenden `touchcancel`-Listener der Telefon-Geste (nach Zeile 1793, vor dem `initDragDrop(...)`-Aufruf).

---

### Task 1: iPad-Wisch + Desktop-Pfeiltasten verdrahten

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `VIEW_ORDER: ViewId[]` und `goToView(next: ViewId): void` (`main.ts:74-85`, unverändert), `state.view: ViewId` (`AppState`, `src/ui/dayView.ts`), `singleColumn: MediaQueryList` (`main.ts:1676`), `root: HTMLDivElement` (`main.ts:38`).
- Produces: `function neighborView(current: ViewId, direction: 1 | -1): ViewId | null` – lokal in `main.ts`, kein Export nötig (nur innerhalb der Datei genutzt).

- [ ] **Step 1: `neighborView()`-Helper ergänzen**

In `src/main.ts`, direkt nach der bestehenden `goToView`-Funktion (endet
Zeile 85), einfügen:

```typescript
/** Nachbar-Tab in VIEW_ORDER; null am Rand (kein Umlauf, anders als der Telefon-Kanten-Wisch). */
function neighborView(current: ViewId, direction: 1 | -1): ViewId | null {
  const index = VIEW_ORDER.indexOf(current);
  return VIEW_ORDER[index + direction] ?? null;
}
```

- [ ] **Step 2: iPad-Wisch-Listener ergänzen**

In `src/main.ts`, direkt nach dem bestehenden `root.addEventListener('touchcancel', ...)`-Block der Telefon-Geste (endet Zeile 1793) und vor dem Kommentar `// Drag & Drop: ...` (Zeile 1795), einfügen:

```typescript
// Tab-Wechsel per Wisch, unabhängig von der Telefon-Kanten-Wisch-Geste oben:
// aktiv außerhalb des einspaltigen Layouts (iPad & Desktop-Touch), reagiert
// überall auf dem Bildschirm (dort gibt es keine konkurrierende Spalten-Geste),
// kein Vorschau-Mitziehen, kein Umlauf an den Rändern.
const TAB_AXIS_LOCK = 8; // px, wie AXIS_LOCK oben
const TAB_SWIPE_MIN_X = 36; // px, wie SWIPE_MIN_X oben
let tabSwipeTracking = false;
let tabSwipeStartX = 0;
let tabSwipeStartY = 0;
let tabSwipeAxis: 'none' | 'h' | 'v' = 'none';

root.addEventListener(
  'touchstart',
  (event) => {
    const target = event.target as HTMLElement;
    if (
      event.touches.length !== 1 ||
      singleColumn.matches ||
      target.closest('[data-drag], input, textarea, select')
    ) {
      tabSwipeTracking = false;
      return;
    }
    const touch = event.touches[0];
    tabSwipeTracking = true;
    tabSwipeAxis = 'none';
    tabSwipeStartX = touch.clientX;
    tabSwipeStartY = touch.clientY;
  },
  { passive: true },
);

root.addEventListener(
  'touchmove',
  (event) => {
    if (!tabSwipeTracking) {
      return;
    }
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    const dx = touch.clientX - tabSwipeStartX;
    const dy = touch.clientY - tabSwipeStartY;
    if (tabSwipeAxis === 'none') {
      if (Math.abs(dx) < TAB_AXIS_LOCK && Math.abs(dy) < TAB_AXIS_LOCK) {
        return;
      }
      tabSwipeAxis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (tabSwipeAxis === 'v') {
        tabSwipeTracking = false; // senkrecht → normales Scrollen der Liste
        return;
      }
    }
    if (tabSwipeAxis === 'h') {
      event.preventDefault(); // waagerecht → der Wisch gehört uns, nicht dem Scroll
    }
  },
  { passive: false },
);

root.addEventListener(
  'touchend',
  (event) => {
    if (!tabSwipeTracking || tabSwipeAxis !== 'h') {
      tabSwipeTracking = false;
      return;
    }
    tabSwipeTracking = false;
    const dx = (event.changedTouches[0]?.clientX ?? tabSwipeStartX) - tabSwipeStartX;
    if (Math.abs(dx) < TAB_SWIPE_MIN_X) {
      return;
    }
    const next = neighborView(state.view, dx < 0 ? 1 : -1);
    if (next) {
      goToView(next);
    }
  },
  { passive: true },
);

root.addEventListener('touchcancel', () => {
  tabSwipeTracking = false;
});

// Desktop-Pfeiltasten: auf document statt root, damit es auch ohne vorherigen
// Klick in die App greift (ohne Fokus liegt der Bubbling-Ursprung auf <body>,
// das kein Vorfahre von #app ist – root bekäme das Event sonst nicht).
document.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return;
  }
  const active = document.activeElement;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
    return;
  }
  const next = neighborView(state.view, event.key === 'ArrowRight' ? 1 : -1);
  if (next) {
    goToView(next);
  }
});
```

- [ ] **Step 3: Typprüfung**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Bestehende Testsuite laufen lassen (Regressionscheck)**

Run: `npm test`
Expected: weiterhin alle Tests grün (diese Änderung fügt keine neuen Tests hinzu, s. Global Constraints).

- [ ] **Step 5: Manuelle Verifikation im Browser**

```bash
npm run dev:server   # Terminal 1
npm run dev          # Terminal 2
```

http://localhost:5173 öffnen, Browser-DevTools auf ein iPad-Viewport stellen
(z. B. Chrome „Responsive Design Mode" mit Touch-Simulation, Breite ≥ 657px
damit `!singleColumn.matches` gilt):

- Wisch nach links irgendwo auf dem Bildschirm (nicht nur am Rand) → springt
  zum nächsten Tab in der Reihenfolge DAY→MORROW→WEEK→MONTH→UN:DONE.
- Wisch nach rechts → zum vorherigen Tab.
- Auf UN:DONE weiter nach links wischen → nichts passiert (kein Umlauf).
- Auf DAY weiter nach rechts wischen → nichts passiert.
- Vertikales Scrollen einer langen Liste funktioniert weiterhin normal (kein
  versehentlicher Tab-Wechsel).
- Wisch, der auf einem Drag-Greifer beginnt (`[data-drag]`), löst keinen
  Tab-Wechsel aus.

Danach normale Desktop-Breite (Browserfenster, kein Touch nötig):

- Pfeil rechts/links (ohne vorherigen Klick in die Seite) wechselt den Tab
  in beiden Richtungen, stoppt an den Rändern.
- Ein Aufgaben-/Termin-Formular öffnen, in ein Textfeld klicken, Pfeil
  links/rechts drücken → bewegt den Cursor im Textfeld, wechselt NICHT den
  Tab.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "Tab-Wechsel per iPad-Wisch und Desktop-Pfeiltasten"
```
