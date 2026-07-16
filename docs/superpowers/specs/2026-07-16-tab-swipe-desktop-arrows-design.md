# Tab-Wechsel per iPad-Wisch und Desktop-Pfeiltasten

## Ziel

Auf dem iPad soll ein horizontaler Wisch (überall auf dem Bildschirm) zwischen
den 5 Tabs (DAY, MORROW, WEEK, MONTH, UN:DONE) wechseln. Am Desktop sollen die
Pfeiltasten links/rechts dasselbe leisten. Beide Wege ergänzen die bestehende
Klick-Navigation (`renderNav`) und die bereits vorhandene Kanten-Wisch-Geste
fürs Telefon (bleibt unverändert).

## Architektur

Zwei unabhängige, neue Blöcke in `src/main.ts`, beide rufen die vorhandene
`goToView(next: ViewId)` (`main.ts:77`) auf – kein neuer Renderpfad nötig.
Die Reihenfolge bleibt die bestehende `VIEW_ORDER` (`main.ts:74`):
`['day', 'morrow', 'week', 'month', 'undone']`.

### 1. iPad-Wisch (neuer, einfacher Touch-Handler)

Aktiv, wenn `!singleColumn.matches` (`main.ts:1676`, derselbe Breakpoint wie
die bestehende Telefon-Geste: `max-width: 40.999rem`) – also im zwei- oder
mehrspaltigen Layout, das iPad-Breiten immer erreichen. Reagiert überall auf
dem Bildschirm (keine Kanten-Zone wie beim Telefon), weil es dort keine
konkurrierende Spalten-Wisch-Geste gibt.

- Eigene `touchstart`/`touchmove`/`touchend`/`touchcancel`-Listener auf `root`
  (analog zum bestehenden Block bei `main.ts:1686-1793`, aber eigener
  Zustand – kein gemeinsamer State mit der Telefon-Geste, um deren Verhalten
  nicht zu beeinflussen).
- Gleicher Ausschluss wie beim Telefon: `target.closest('[data-drag], input,
  textarea, select')` bricht die Verfolgung ab (Drag-Greifer, Formulare
  bleiben unangetastet).
- Achsen-Sperre wie beim Telefon: `AXIS_LOCK = 8` (`main.ts:1678`) – erst ab
  überwiegend waagerechter Bewegung wird der Wisch beansprucht
  (`event.preventDefault()`), sonst scrollt die Seite normal weiter.
- Mindest-Distanz wie beim Telefon: `SWIPE_MIN_X = 36` (`main.ts:1679`).
- **Kein Vorschau-Mitziehen/keine Animation** (Nutzerentscheidung): Bei
  `touchend`, wenn Achse `h` und `|dx| >= SWIPE_MIN_X`, sofort
  `goToView(...)` mit dem Nachbar-Tab in `VIEW_ORDER` – `dx < 0` (Wisch nach
  links) → nächster Tab, `dx > 0` (Wisch nach rechts) → vorheriger Tab.
- An den Rändern (`day` ganz links, `undone` ganz rechts) passiert bei einem
  Wisch über den Rand hinaus nichts (kein Umlauf, anders als die bestehende
  Kanten-Wisch-Vorschau fürs Telefon).

### 2. Desktop-Pfeiltasten

Ein `keydown`-Listener auf `document` (nicht auf `root`, damit er auch
greift, wenn der Fokus außerhalb von `#app` liegt, z. B. auf `body`):

- `ArrowRight` → nächster Tab, `ArrowLeft` → vorheriger Tab in `VIEW_ORDER`,
  jeweils via `goToView(...)`.
- Kein Wechsel, wenn `document.activeElement` ein `input`, `textarea` oder
  `select` ist (normales Cursor-Verhalten in Formularen bleibt unangetastet).
- Am Rand (`day`/`undone`) passiert nichts weiter.

## Fehlerbehandlung

Kein eigener Fehlerfall: Achsen-Sperre und Mindest-Distanz verhindern, dass
vertikales Scrollen oder ein normaler Tap fälschlich als Wisch gilt. Ein
Pfeildruck in einem Formularfeld bewegt wie gewohnt den Cursor. Ein Wisch/Pfeil
über den Rand hinaus (vor `day` bzw. nach `undone`) bleibt wirkungslos.

## Testing

Wie die bestehende Wisch-Geste ist das reines UI-/Interaktions-Wiring in
`src/main.ts`, kein `services/`-Baustein – bleibt daher ungetestet im
Vitest-Sinn (kein sinnvoller Unit-Test für Touch-/Keydown-Wiring). Manuelle
Verifikation: iPad (Simulator oder echtes Gerät, Portrait + Landscape) sowie
Desktop-Browser mit Tastatur – Golden Path (alle 5 Tabs in beide Richtungen)
und Ränder (kein Wechsel vor `day`/nach `undone`), außerdem: Wisch/Pfeil
während ein Formular offen ist bzw. ein Eingabefeld fokussiert ist (darf nicht
den Tab wechseln bzw. den Cursor normal bewegen).
