# Gesten-Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doppeltipp auf „UN:DONE" spielt eine kompakte Onboarding-Demo der drei Wisch-Gesten ab (jede einmal erklärt), startet und endet in DO DAY.

**Architecture:** Die Demo verwendet die vorhandene Gesten-Engine in `main.ts` wieder (`startEdgePreview`/`endEdgePreview`, `switchMobileColumn`, `goToView`), programmatisch über synthetisierten Wisch-Zustand angestoßen. Ein Schritt-Treiber (Liste + `setTimeout`) blendet ein Overlay außerhalb von `#app` ein und beschriftet jeden Schritt. Kein zweiter Animationspfad, keine Daten-Mutation.

**Tech Stack:** Vanilla TypeScript (Vite), CSS, i18n über `t()` aus `src/i18n.ts`. Verifikation überwiegend manuell (DOM/Timing), wie im Spec festgelegt.

## Global Constraints

- **Nur Ein-Spalten-Layout (mobil):** `singleColumn.matches` muss true sein; sonst verhält sich der Tipp wie ein normaler UN:DONE-Wechsel.
- **Keine Daten-Mutation:** ausschließlich Navigation + Spalten-/Übergangs-Animationen. Kein `createTask`/`toggleTask`/o. ä.
- **Läuft einmal, kein Loop.** Ein `demoActive`-Flag verhindert Neustart während des Laufs.
- **Tap irgendwo = sofortiger Abbruch** (Timer stoppen, Overlay weg, laufende Vorschau abräumen).
- **Reuse der Engine** — keine Animationen nachbauen.
- **Texte zweisprachig** über `t()` / `src/lang.json` (DE/EN).
- Spec: `docs/superpowers/specs/2026-06-26-gesten-demo-design.md`.

---

### Task 1: Overlay-Texte und -Styles

**Files:**
- Modify: `src/lang.json` (nach dem `eventSaveFailed`/`endBeforeStart`-Block)
- Modify: `src/style.css` (am Ende, bei den anderen Overlay-/Toast-Stilen)

**Interfaces:**
- Produces: i18n-Schlüssel `demoEdgeSwipe`, `demoInsideSwipe`, `demoWrap`; CSS-Klassen `.demo-overlay`, `.demo-overlay.show`, `.demo-caption`.

- [ ] **Step 1: Lang-Keys ergänzen**

In `src/lang.json` als letzte Einträge (vor der schließenden `}`), das Komma am bisher letzten Eintrag nicht vergessen:

```json
  "demoEdgeSwipe": {
    "de": "Von der Kante wischen wechselt den Tab.",
    "en": "Swipe from the edge to change tab."
  },
  "demoInsideSwipe": {
    "de": "Innen wischen schiebt die rechte Karte rein und raus.",
    "en": "Swipe inside to slide the right card in and out."
  },
  "demoWrap": {
    "de": "Am Reihenende fliegt es über alle Tabs zurück.",
    "en": "At the row’s end it flies back across all tabs."
  }
```

- [ ] **Step 2: CSS für Overlay + Beschriftung ergänzen**

Ans Ende von `src/style.css`:

```css
/* Gesten-Demo: dezenter Backdrop (lässt die Animationen durchscheinen) plus eine
   opake Beschriftungs-Karte oben. Lebt außerhalb von #app (wie der Toast). */
.demo-overlay {
  position: fixed;
  inset: 0;
  z-index: 20; /* über Navi (7), Trennlinie (6), Wisch-Layern */
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: rgb(0 0 0 / 0.18);
  opacity: 0;
  transition: opacity 0.25s ease;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
}
.demo-overlay.show {
  opacity: 1;
}
.demo-caption {
  margin-top: 22vh;
  max-width: 80%;
  padding: 0.8rem 1.1rem;
  border-radius: 0.8rem;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--serif);
  font-size: 1.05rem;
  line-height: 1.3;
  text-align: center;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.3);
}
```

- [ ] **Step 3: Build prüfen**

Run: `npm run build`
Expected: „✓ built" ohne Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/lang.json src/style.css
git commit -m "Gesten-Demo: Overlay-Texte (DE/EN) und Styles"
```

---

### Task 2: `navTopY()`-Helfer extrahieren

Damit die Demo die Navi-Oberkante (= Inhalts-Unterkante) genauso bestimmt wie die Trennlinie, ohne Duplikat.

**Files:**
- Modify: `src/main.ts` (Funktion `zoneSplitY`, ~Zeile 104-110)

**Interfaces:**
- Produces: `navTopY(): number` — y-Oberkante der `.bottom-nav` bzw. `window.innerHeight`.
- `zoneSplitY()` bleibt unverändert in der Signatur, nutzt intern `navTopY()`.

- [ ] **Step 1: Helfer einführen, `zoneSplitY` umstellen**

Ersetze die bestehende `zoneSplitY`-Definition:

```ts
/** y-Oberkante der Navi-Leiste (= Inhalts-Unterkante). */
function navTopY(): number {
  return (
    (root?.querySelector('.bottom-nav') as HTMLElement | null)?.getBoundingClientRect().top ??
    window.innerHeight
  );
}

/** y der Zonengrenze (oberhalb der Navi-Leiste). */
function zoneSplitY(): number {
  return navTopY() * ZONE_SPLIT;
}
```

- [ ] **Step 2: Build + Tests prüfen (Verhalten unverändert)**

Run: `npm run build && npm test`
Expected: Build „✓ built", Tests „175 passed" (keine Verhaltensänderung — reines Refactor).

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "Gesten-Demo: navTopY() aus zoneSplitY extrahieren"
```

---

### Task 3: Demo-Treiber (Overlay-JS, Gesten-Synthese, Schritte)

**Files:**
- Modify: `src/main.ts` (neuer Block direkt VOR dem Klick-Handler, sinnvoll nach `scheduleSwipeReset`/Toast-Bereich; nutzt die schon definierten `goToView`, `startEdgePreview`, `endEdgePreview`, `switchMobileColumn`, `showSwipeDivider`, `navTopY`, Modul-Variablen `swipeEdge`/`swipeStartY`/`swipeNavTop`/`previewEl`, `state`, `singleColumn`, `t`).

**Interfaces:**
- Consumes (vorhanden): `goToView(next: ViewId)`, `startEdgePreview()`, `endEdgePreview(dx: number)`, `switchMobileColumn(next: 'main'|'side')`, `showSwipeDivider()`, `navTopY()`, `t()`.
- Produces: `startGestureDemo(): void`, `endGestureDemo(): void` (von Task 4 aufgerufen).

- [ ] **Step 1: Modul-Variablen für die Demo anlegen**

Bei den anderen Modul-`let`-Deklarationen oben in `main.ts` (z. B. neben `swipeDividerExitTimer`):

```ts
let demoActive = false;
let demoTimers: number[] = [];
let demoOverlayEl: HTMLDivElement | null = null;
let demoCaptionEl: HTMLDivElement | null = null;
```

- [ ] **Step 2: Overlay-Funktionen + Gesten-Synthese + Treiber einfügen**

Neuer Block (z. B. unmittelbar vor `root.addEventListener('click', …)`):

```ts
/* ---------- Kompakte Gesten-Demo (Doppeltipp auf „UN:DONE") ---------- */

/** Halbtransparentes Overlay mit Beschriftungs-Karte; Tap bricht ab. */
function showDemoOverlay(): void {
  demoOverlayEl = document.createElement('div');
  demoOverlayEl.className = 'demo-overlay';
  demoCaptionEl = document.createElement('div');
  demoCaptionEl.className = 'demo-caption';
  demoOverlayEl.appendChild(demoCaptionEl);
  demoOverlayEl.addEventListener('pointerdown', endGestureDemo);
  document.body.appendChild(demoOverlayEl);
  requestAnimationFrame(() => demoOverlayEl?.classList.add('show'));
}

/** Einen Kanten-Wisch programmatisch auslösen (untere Zone = direkt; vorwärts =
    rechte Kante). Zeigt die Trennlinie und nutzt exakt die echte Übergangs-/
    Wrap-Animation. dx-Betrag ≥ Schwelle committet; das Vorzeichen ist egal. */
function demoEdge(forward: boolean): void {
  const navTop = navTopY();
  swipeNavTop = navTop;
  swipeStartY = navTop * 0.8; // klar in der unteren Zone → direkter Wisch
  swipeEdge = forward ? 1 : -1; // rechts = vor, links = zurück
  showSwipeDivider();
  startEdgePreview();
  endEdgePreview(100); // |100| ≥ Commit-Schwelle (48) → Tab-Wechsel
}

interface DemoStep {
  caption?: string; // nur gesetzte Texte wechseln die Beschriftung
  run: () => void;
  wait: number; // ms bis zum nächsten Schritt (≥ Animationsdauer)
}

/** Skript: Kanten-Wisch-Tour (day→…→undone), Inside-Wisch, Wrap zurück nach day. */
function buildDemoSteps(): DemoStep[] {
  const edge = 320; // Commit-Animation (~230ms) + Puffer
  const col = 480; // Spalten-Animation + Puffer
  const wrap = 780; // Wrap-Flug (~710ms) + Puffer
  return [
    { caption: t('demoEdgeSwipe'), run: () => demoEdge(true), wait: edge }, // day → morrow
    { run: () => demoEdge(true), wait: edge }, // morrow → week
    { run: () => demoEdge(true), wait: edge }, // week → month
    { run: () => demoEdge(true), wait: edge }, // month → undone
    { caption: t('demoInsideSwipe'), run: () => switchMobileColumn('side'), wait: col },
    { run: () => switchMobileColumn('main'), wait: col },
    { caption: t('demoWrap'), run: () => demoEdge(true), wait: wrap }, // undone → Wrap → day
  ];
}

/** Demo starten: nach DO DAY springen, Overlay zeigen, Schritte takten. */
function startGestureDemo(): void {
  if (demoActive || !singleColumn.matches) {
    return;
  }
  demoActive = true;
  goToView('day');
  showDemoOverlay();
  let at = 320; // kurz warten, bis „day" gerendert + Overlay sichtbar ist
  for (const step of buildDemoSteps()) {
    demoTimers.push(
      window.setTimeout(() => {
        if (step.caption && demoCaptionEl) {
          demoCaptionEl.textContent = step.caption;
        }
        step.run();
      }, at),
    );
    at += step.wait;
  }
  demoTimers.push(window.setTimeout(endGestureDemo, at + 200));
}

/** Abbruch/Abschluss: Timer stoppen, laufende Vorschau abräumen, Overlay weg. */
function endGestureDemo(): void {
  if (!demoActive) {
    return;
  }
  demoActive = false;
  demoTimers.forEach((id) => window.clearTimeout(id));
  demoTimers = [];
  if (previewEl) {
    endEdgePreview(0); // laufende Vorschau sauber zurückschnappen → teardown
  }
  const el = demoOverlayEl;
  demoOverlayEl = null;
  demoCaptionEl = null;
  el?.classList.remove('show');
  window.setTimeout(() => el?.remove(), 260);
}
```

- [ ] **Step 3: Build prüfen (Typen/Scope)**

Run: `npm run build`
Expected: „✓ built" ohne TS-Fehler (alle genutzten Funktionen/Variablen sind in `main.ts` definiert).

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "Gesten-Demo: Treiber, Overlay und programmatische Gesten"
```

---

### Task 4: Doppeltipp-Auslöser auf „UN:DONE" + manuelle Verifikation

**Files:**
- Modify: `src/main.ts` (Klick-Handler, `if (action === 'switch-view' && view)`, ~Zeile 989)
- Modify: `src/main.ts` (Modul-`let` oben: `lastUndoneTap`)

**Interfaces:**
- Consumes: `startGestureDemo()` aus Task 3.

- [ ] **Step 1: Doppeltipp-Zeitstempel-Variable anlegen**

Bei den Demo-Variablen aus Task 3 ergänzen:

```ts
let lastUndoneTap = 0;
```

- [ ] **Step 2: Doppeltipp im switch-view-Zweig erkennen**

Ersetze:

```ts
  if (action === 'switch-view' && view) {
    goToView(view as ViewId);
  }
```

durch:

```ts
  if (action === 'switch-view' && view) {
    // Doppeltipp auf „UN:DONE" (mobil) startet die Gesten-Demo statt nur zu wechseln.
    if (view === 'undone' && singleColumn.matches) {
      const now = Date.now();
      if (now - lastUndoneTap < 350) {
        lastUndoneTap = 0;
        startGestureDemo();
        return;
      }
      lastUndoneTap = now;
    }
    goToView(view as ViewId);
  }
```

- [ ] **Step 3: Build + Tests**

Run: `npm run build && npm test`
Expected: „✓ built", „175 passed".

- [ ] **Step 4: Manuelle Verifikation (localhost:5173, schmales Layout)**

Dev-Server läuft (sonst `npm run dev` + `npm run dev:server`). Im Browser auf Handy-Breite (≤ 41rem):

Prüfen:
1. **Einzeltipp** auf „UN:DONE" → wechselt normal in die UN:DONE-Ansicht (keine Demo).
2. **Doppeltipp** auf „UN:DONE" → Ansicht springt nach DO DAY, Overlay erscheint; Tour läuft: vier Tab-Übergänge (day→morrow→week→month→undone) mit Trennlinie, dann Karte rein/raus, dann Wrap-Flug zurück nach **DO DAY**; Overlay blendet aus.
3. Die **drei Beschriftungen** erscheinen je einmal (Kanten-Wisch, Inside-Wisch, Wrap), DE und EN korrekt.
4. **Tap während der Demo** bricht sofort ab (Overlay weg, keine hängende Animation).
5. **Keine neuen/abgehakten Objekte** danach (Aufgaben/Termine unverändert).
6. **Light- und Dark-Mode** je einmal.
7. **Breitbild:** Doppeltipp verhält sich wie normaler UN:DONE-Wechsel (keine Demo).

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "Gesten-Demo: Doppeltipp auf UN:DONE startet die Demo"
```

---

## Self-Review

- **Spec-Abdeckung:** Trigger/Doppeltipp (Task 4), Start in DO DAY (Task 3 `startGestureDemo`), Reuse-Engine + Gesten-Synthese (Task 3), Overlay außerhalb #app + Texte (Task 1/3), Ablauf-Skript inkl. Wrap-Ende auf day (Task 3 `buildDemoSteps`), Abbruch per Tap (Task 3 `endGestureDemo` + Overlay-Listener), nur Mobil (Global Constraints + Task 3/4 `singleColumn`-Guards), keine Daten-Mutation (nur Navigation/Spalten), einmal/kein Loop (`demoActive`). Inside-Wisch-Beschriftung bewusst generisch („rechte Karte") — deckt undone (Erledigt-Karte) korrekt ab.
- **Platzhalter:** keine — jeder Schritt enthält vollständigen Code/Befehl.
- **Typkonsistenz:** `startGestureDemo`/`endGestureDemo`/`demoEdge`/`buildDemoSteps`/`navTopY` durchgängig gleich benannt; `DemoStep.caption` optional, nur gesetzte Texte wechseln die Beschriftung.
- **Hinweis Tests:** Verifikation ist überwiegend manuell (DOM/Timing/Animation) — im Spec so festgelegt; reine Logik ist zu dünn für sinnvolle Unit-Tests, daher bewusst keine erzwungen.
