# Do Week & Do Month (Cockpit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Platzhalter-Tabs „Do Week" und „Do Month" werden ein gemeinsames, voll interaktives Cockpit (Habits-Fortschritt, Ziele, Aufgaben, Termine) mit Sprung zu Vorwoche/Vormonat.

**Architecture:** Eine gemeinsame Ansicht `src/ui/cockpitView.ts`, parametrisiert über den Zeitraum; alle Rechenlogik als pure, TDD-getestete Funktionen in `src/services/selectors.ts` (+ `isoWeek` in `src/utils/dates.ts`). Der State bekommt `periodOffset` (0 = jetzt, −1 = davor, nie > 0); `agendaRange()` in `main.ts` lädt je nach Tab+Offset den passenden Zeitraum vom vorhandenen `/api/v1/agenda`-Endpunkt. Keine Server-Änderung.

**Tech Stack:** Vite + Vanilla TS, Vitest, Render-Muster „Zustand → HTML-String → innerHTML", Event-Delegation in `main.ts`.

**Spec:** `docs/superpowers/specs/2026-06-12-week-month-design.md`

---

## Dateiübersicht

| Datei | Änderung |
|---|---|
| `src/utils/dates.ts` | Neu: `isoWeek(date)` (ISO-Kalenderwoche) |
| `src/utils/dates.test.ts` | **Neu anlegen**: Tests für `isoWeek` |
| `src/services/selectors.ts` | Neu: `DateRange`, `weekRange`, `monthRange`, `datesInRange`, `weeksInRange`, `habitDoneInRange`, `tasksByDay`, `eventsByDay` |
| `src/services/selectors.test.ts` | Tests für alle neuen Funktionen |
| `src/ui/dayView.ts` | `AppState.periodOffset`; Helfer exportieren; Week/Month-Zweige rufen `renderCockpit`; `renderPlaceholder` löschen |
| `src/ui/cockpitView.ts` | **Neu**: die Cockpit-Ansicht |
| `src/main.ts` | `periodOffset` im State, `agendaRange()` nach Tab, `refreshAgenda()`, Aktionen `switch-view` (Reset+Reload) und `switch-period` |
| `src/style.css` | Neue Klassen (Perioden-Navigation, Wochen-Punkte, Tagesgruppen, Termin-Zeilen) |

**Hinweis Ringimport:** `dayView.ts` importiert `renderCockpit` aus `cockpitView.ts`, und `cockpitView.ts` importiert Helfer aus `dayView.ts`. Das ist bei ES-Modulen unkritisch, weil beide Seiten die Importe **nur zur Laufzeit in Funktionen** aufrufen (nichts auf Modul-Ebene auswerten). Nicht „aufräumen" – funktioniert mit Vite und Vitest.

**Testbefehl:** `npx vitest run src/services/selectors.test.ts` (bzw. die jeweilige Testdatei). Am Ende immer `npm run test` (alle) und `npm run build` (Typprüfung).

---

### Task 1: `isoWeek` – ISO-Kalenderwoche

**Files:**
- Create: `src/utils/dates.test.ts`
- Modify: `src/utils/dates.ts`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

```ts
// src/utils/dates.test.ts (neue Datei)
// Tests zuerst (TDD): Datums-Helfer für die Cockpit-Ansichten.
import { describe, it, expect } from 'vitest';
import { isoWeek } from './dates';

describe('isoWeek', () => {
  it('liefert die ISO-Kalenderwoche (Donnerstag bestimmt die Woche)', () => {
    // 2026 beginnt an einem Donnerstag → 1. Januar liegt in KW 1
    expect(isoWeek(new Date('2026-01-01T12:00:00'))).toBe(1);
    expect(isoWeek(new Date('2026-06-12T12:00:00'))).toBe(24);
  });

  it('ordnet Jahreswechsel-Tage der richtigen Woche zu', () => {
    // Mo 29.12.2025 gehört schon zur KW 1 des Jahres 2026
    expect(isoWeek(new Date('2025-12-29T12:00:00'))).toBe(1);
    // Fr 1.1.2027 gehört noch zur KW 53 des Jahres 2026
    expect(isoWeek(new Date('2027-01-01T12:00:00'))).toBe(53);
  });
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npx vitest run src/utils/dates.test.ts`
Expected: FAIL – `isoWeek` wird nicht exportiert.

- [ ] **Step 3: Implementieren**

Ans Ende von `src/utils/dates.ts` anfügen:

```ts
/**
 * ISO-Kalenderwoche (KW). Regel: Der DONNERSTAG einer Woche bestimmt,
 * zu welchem Jahr und welcher Nummer sie gehört (der 4. Januar liegt
 * dadurch immer in KW 1).
 */
export function isoWeek(date: Date): number {
  const thursday = shiftDays(startOfWeek(date), 3);
  const firstThursday = shiftDays(startOfWeek(new Date(thursday.getFullYear(), 0, 4)), 3);
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}
```

- [ ] **Step 4: Test laufen lassen – muss bestehen**

Run: `npx vitest run src/utils/dates.test.ts`
Expected: PASS (2 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/dates.ts src/utils/dates.test.ts
git commit -m "feat: isoWeek – ISO-Kalenderwoche für die Cockpit-Überschrift"
```

---

### Task 2: Zeitraum-Funktionen `weekRange`, `monthRange`, `datesInRange`, `weeksInRange`

**Files:**
- Modify: `src/services/selectors.ts`
- Test: `src/services/selectors.test.ts`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

In `src/services/selectors.test.ts` den Import erweitern und die describe-Blöcke ans Ende anfügen:

```ts
// Import-Zeile oben ersetzen durch:
import {
  tasksDueOn,
  eventsOn,
  withCanonicalTags,
  filterByArea,
  weekRange,
  monthRange,
  datesInRange,
  weeksInRange,
} from './selectors';
```

```ts
describe('weekRange', () => {
  const friday = new Date('2026-06-12T12:00:00'); // ein Freitag

  it('liefert Montag bis Sonntag der aktuellen Woche (offset 0)', () => {
    expect(weekRange(0, friday)).toEqual({ start: '2026-06-08', end: '2026-06-14' });
  });

  it('offset -1 liefert die Vorwoche', () => {
    expect(weekRange(-1, friday)).toEqual({ start: '2026-06-01', end: '2026-06-07' });
  });

  it('funktioniert über den Jahreswechsel', () => {
    const newYear = new Date('2026-01-01T12:00:00'); // Donnerstag
    expect(weekRange(0, newYear)).toEqual({ start: '2025-12-29', end: '2026-01-04' });
  });
});

describe('monthRange', () => {
  const midJune = new Date('2026-06-12T12:00:00');

  it('liefert den ganzen aktuellen Monat (offset 0)', () => {
    expect(monthRange(0, midJune)).toEqual({ start: '2026-06-01', end: '2026-06-30' });
  });

  it('offset -1 liefert den Vormonat mit korrektem Monatsende', () => {
    expect(monthRange(-1, midJune)).toEqual({ start: '2026-05-01', end: '2026-05-31' });
  });

  it('funktioniert über den Jahreswechsel', () => {
    const january = new Date('2026-01-15T12:00:00');
    expect(monthRange(-1, january)).toEqual({ start: '2025-12-01', end: '2025-12-31' });
  });
});

describe('datesInRange', () => {
  it('zählt alle Tage des Zeitraums einschließlich der Grenzen auf', () => {
    expect(datesInRange({ start: '2026-06-08', end: '2026-06-10' })).toEqual([
      '2026-06-08',
      '2026-06-09',
      '2026-06-10',
    ]);
  });

  it('übersteht die Sommerzeit-Umstellung ohne Tag-Verrutschen', () => {
    // 29.3.2026: Umstellung auf Sommerzeit in Europa
    expect(datesInRange({ start: '2026-03-28', end: '2026-03-30' })).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
    ]);
  });
});

describe('weeksInRange', () => {
  it('zählt die berührten Kalenderwochen (Mo–So)', () => {
    // Juni 2026: Mo 1.6. bis Di 30.6. → 5 Kalenderwochen berührt
    expect(weeksInRange({ start: '2026-06-01', end: '2026-06-30' })).toBe(5);
    // eine einzelne Woche
    expect(weeksInRange({ start: '2026-06-08', end: '2026-06-14' })).toBe(1);
  });
});
```

- [ ] **Step 2: Tests laufen lassen – müssen fehlschlagen**

Run: `npx vitest run src/services/selectors.test.ts`
Expected: FAIL – `weekRange` usw. werden nicht exportiert.

- [ ] **Step 3: Implementieren**

In `src/services/selectors.ts` die Imports oben ersetzen durch:

```ts
import type { CalendarEvent, Habit, ISODate, Task } from '../models/types';
import { isoDate, localDateOf, shiftDays, startOfWeek } from '../utils/dates';
```

Ans Dateiende anfügen:

```ts
/* ---------- Zeiträume für die Cockpit-Ansichten (Do Week / Do Month) ---------- */

/** Zeitraum aus zwei lokalen ISO-Daten – beide Tage einschließlich */
export interface DateRange {
  start: ISODate;
  end: ISODate;
}

/** Woche Mo–So, um `offset` Wochen verschoben (0 = aktuelle, -1 = Vorwoche) */
export function weekRange(offset: number, today: Date = new Date()): DateRange {
  const monday = startOfWeek(shiftDays(today, offset * 7));
  return { start: isoDate(monday), end: isoDate(shiftDays(monday, 6)) };
}

/** Monat 1.–Letzter, um `offset` Monate verschoben (0 = aktueller, -1 = Vormonat) */
export function monthRange(offset: number, today: Date = new Date()): DateRange {
  const first = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  // Tag 0 des Folgemonats = letzter Tag dieses Monats
  const last = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
  return { start: isoDate(first), end: isoDate(last) };
}

/** Alle Tage des Zeitraums als ISO-Daten, chronologisch */
export function datesInRange(range: DateRange): ISODate[] {
  const days: ISODate[] = [];
  // Mittags starten: so kann die Sommerzeit-Umstellung keinen Tag verrutschen
  let cursor = new Date(`${range.start}T12:00:00`);
  while (isoDate(cursor) <= range.end) {
    days.push(isoDate(cursor));
    cursor = shiftDays(cursor, 1);
  }
  return days;
}

/** Anzahl der Kalenderwochen (Mo–So), die der Zeitraum berührt */
export function weeksInRange(range: DateRange): number {
  const mondays = new Set(
    datesInRange(range).map((day) => isoDate(startOfWeek(new Date(`${day}T12:00:00`)))),
  );
  return mondays.size;
}
```

(Der Typ `Habit` wird erst in Task 3 benutzt – der Import jetzt schon vorbereitet. Falls ESLint „unused" meldet, den `Habit`-Import erst in Task 3 ergänzen.)

- [ ] **Step 4: Tests laufen lassen – müssen bestehen**

Run: `npx vitest run src/services/selectors.test.ts`
Expected: PASS (alle, auch die bestehenden)

- [ ] **Step 5: Commit**

```bash
git add src/services/selectors.ts src/services/selectors.test.ts
git commit -m "feat: Zeitraum-Selektoren weekRange/monthRange/datesInRange/weeksInRange"
```

---

### Task 3: `habitDoneInRange`

**Files:**
- Modify: `src/services/selectors.ts`
- Test: `src/services/selectors.test.ts`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

In `src/services/selectors.test.ts`: `habitDoneInRange` zum Import ergänzen, oben bei den Helfern anfügen:

```ts
import type { Habit } from '../models/types';

function habit(log: string[]): Habit {
  return { id: 'h1', title: 'Journal', schedule: 'daily', log };
}
```

Describe-Block ans Ende:

```ts
describe('habitDoneInRange', () => {
  it('liefert nur die erledigten Tage im Zeitraum, sortiert und ohne Duplikate', () => {
    const range = { start: '2026-06-08', end: '2026-06-14' };
    const h = habit(['2026-06-10', '2026-06-09', '2026-06-10', '2026-06-01', '2026-06-15']);
    expect(habitDoneInRange(h, range)).toEqual(['2026-06-09', '2026-06-10']);
  });

  it('liefert ein leeres Array, wenn nichts im Zeitraum liegt', () => {
    expect(habitDoneInRange(habit([]), { start: '2026-06-08', end: '2026-06-14' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npx vitest run src/services/selectors.test.ts`
Expected: FAIL – `habitDoneInRange` nicht exportiert.

- [ ] **Step 3: Implementieren**

Ans Ende von `src/services/selectors.ts`:

```ts
/** Erledigte Tage einer Gewohnheit im Zeitraum – ohne Duplikate, sortiert */
export function habitDoneInRange(habit: Habit, range: DateRange): ISODate[] {
  return [...new Set(habit.log)]
    .filter((day) => day >= range.start && day <= range.end)
    .sort();
}
```

- [ ] **Step 4: Test laufen lassen – muss bestehen**

Run: `npx vitest run src/services/selectors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/selectors.ts src/services/selectors.test.ts
git commit -m "feat: habitDoneInRange – Habit-Fortschritt je Zeitraum"
```

---

### Task 4: `tasksByDay` (inkl. Überfällig-Gruppe)

**Files:**
- Modify: `src/services/selectors.ts`
- Test: `src/services/selectors.test.ts`

- [ ] **Step 1: Fehlschlagende Tests schreiben**

`tasksByDay` zum Import ergänzen. Der vorhandene Helfer `task(id, due?)` erzeugt unerledigte Aufgaben; für erledigte braucht es eine Variante. Describe-Block ans Ende:

```ts
describe('tasksByDay', () => {
  const range = { start: '2026-06-08', end: '2026-06-14' };
  const today = '2026-06-12';

  it('gruppiert Aufgaben nach Fälligkeitstag – nur Tage mit Aufgaben', () => {
    const tasks = [task('mo', '2026-06-08'), task('mi', '2026-06-10'), task('mi2', '2026-06-10')];
    const result = tasksByDay(tasks, range, today);
    expect(result.days).toEqual([
      { date: '2026-06-08', tasks: [tasks[0]] },
      { date: '2026-06-10', tasks: [tasks[1], tasks[2]] },
    ]);
  });

  it('sammelt unerledigte Aufgaben von VOR dem Zeitraum als überfällig', () => {
    const old = task('alt', '2026-06-01');
    const doneOld: Task = { ...task('erledigt', '2026-06-02'), completed: true };
    const result = tasksByDay([old, doneOld], range, today);
    expect(result.overdue).toEqual([old]); // erledigte Altlasten zählen nicht
    expect(result.days).toEqual([]);
  });

  it('zeigt Aufgaben ohne Datum unter dem heutigen Tag – nur wenn heute im Zeitraum liegt', () => {
    const undated = task('ohne');
    expect(tasksByDay([undated], range, today).days).toEqual([
      { date: '2026-06-12', tasks: [undated] },
    ]);
    // Vorwoche enthält "heute" nicht → Aufgabe ohne Datum taucht nicht auf
    const lastWeek = { start: '2026-06-01', end: '2026-06-07' };
    expect(tasksByDay([undated], lastWeek, today).days).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npx vitest run src/services/selectors.test.ts`
Expected: FAIL – `tasksByDay` nicht exportiert.

- [ ] **Step 3: Implementieren**

Ans Ende von `src/services/selectors.ts`:

```ts
export interface DayTasks {
  date: ISODate;
  tasks: Task[];
}

export interface RangeTasks {
  /** Vor dem Zeitraum fällig und unerledigt – „Altlasten" */
  overdue: Task[];
  /** Nur Tage MIT Aufgaben, chronologisch */
  days: DayTasks[];
}

/**
 * Aufgaben eines Zeitraums, nach Tagen gruppiert. Aufgaben ohne Fälligkeit
 * gelten als „heute dran" (gleiche Regel wie tasksDueOn) und erscheinen
 * nur, wenn der Zeitraum den heutigen Tag enthält.
 */
export function tasksByDay(tasks: Task[], range: DateRange, today: ISODate): RangeTasks {
  const overdue = tasks.filter(
    (task) => !task.completed && !!task.due && task.due < range.start,
  );
  const days = datesInRange(range)
    .map((date) => ({ date, tasks: tasksDueOn(tasks, date, today) }))
    .filter((day) => day.tasks.length > 0);
  return { overdue, days };
}
```

- [ ] **Step 4: Test laufen lassen – muss bestehen**

Run: `npx vitest run src/services/selectors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/selectors.ts src/services/selectors.test.ts
git commit -m "feat: tasksByDay – Aufgaben je Tag inkl. Überfällig-Gruppe"
```

---

### Task 5: `eventsByDay`

**Files:**
- Modify: `src/services/selectors.ts`
- Test: `src/services/selectors.test.ts`

- [ ] **Step 1: Fehlschlagenden Test schreiben**

`eventsByDay` zum Import ergänzen, describe-Block ans Ende:

```ts
describe('eventsByDay', () => {
  it('liefert nur Tage mit Terminen, Termine chronologisch sortiert', () => {
    const range = { start: '2026-06-08', end: '2026-06-10' };
    const events = [
      event('spät', '2026-06-08T19:00:00', '2026-06-08T20:00:00'),
      event('früh', '2026-06-08T09:00:00', '2026-06-08T10:00:00'),
      event('außerhalb', '2026-06-20T09:00:00', '2026-06-20T10:00:00'),
    ];
    const result = eventsByDay(events, range);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-06-08');
    expect(result[0].events.map((e) => e.id)).toEqual(['früh', 'spät']);
  });
});
```

- [ ] **Step 2: Test laufen lassen – muss fehlschlagen**

Run: `npx vitest run src/services/selectors.test.ts`
Expected: FAIL – `eventsByDay` nicht exportiert.

- [ ] **Step 3: Implementieren**

Ans Ende von `src/services/selectors.ts`:

```ts
export interface DayEvents {
  date: ISODate;
  events: CalendarEvent[];
}

/** Termine eines Zeitraums, nach Tagen gruppiert – nur Tage mit Terminen */
export function eventsByDay(events: CalendarEvent[], range: DateRange): DayEvents[] {
  return datesInRange(range)
    .map((date) => ({ date, events: eventsOn(events, date) }))
    .filter((day) => day.events.length > 0);
}
```

- [ ] **Step 4: Tests laufen lassen – ALLE müssen bestehen**

Run: `npm run test`
Expected: PASS (alle Testdateien)

- [ ] **Step 5: Commit**

```bash
git add src/services/selectors.ts src/services/selectors.test.ts
git commit -m "feat: eventsByDay – Termine je Tag für die Cockpits"
```

---

### Task 6: State & Aktionen (periodOffset, agendaRange, switch-period)

**Files:**
- Modify: `src/ui/dayView.ts` (nur AppState)
- Modify: `src/main.ts`

- [ ] **Step 1: AppState erweitern**

In `src/ui/dayView.ts` im Interface `AppState` nach dem Feld `view: ViewId;` einfügen:

```ts
  /** Cockpit-Zeitsprung: 0 = aktuelle Woche/Monat, -1 = davor … (nie > 0) */
  periodOffset: number;
```

- [ ] **Step 2: main.ts anpassen**

a) Import ergänzen (bei den service-Imports):

```ts
import { monthRange, weekRange } from './services/selectors';
```

b) Im `state`-Objekt nach `view: 'day',` einfügen:

```ts
  periodOffset: 0,
```

c) Die Funktion `agendaRange()` komplett ersetzen durch:

```ts
/** Zeitfenster der Agenda – Day/Morrow: heute + 2 Tage, Cockpits: ganze Woche/Monat */
function agendaRange(): { start: Date; end: Date } {
  if (state.view === 'week' || state.view === 'month') {
    const range =
      state.view === 'week' ? weekRange(state.periodOffset) : monthRange(state.periodOffset);
    return {
      start: new Date(`${range.start}T00:00:00`),
      // der letzte Tag zählt ganz mit – also bis 24 Uhr laden
      end: shiftDays(new Date(`${range.end}T00:00:00`), 1),
    };
  }
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return { start, end: shiftDays(start, 3) };
}
```

d) Direkt nach `reloadAgenda()` neue Funktion einfügen:

```ts
/** Agenda im Hintergrund neu laden – nach Tab- oder Zeitraumwechsel */
function refreshAgenda(): void {
  void reloadAgenda()
    .then(() => rerender())
    .catch(() => {
      state.syncError = 'Kalender/Aufgaben konnten nicht geladen werden.';
      rerender();
    });
}
```

e) Den `switch-view`-Block im Klick-Handler ersetzen durch:

```ts
  if (action === 'switch-view' && view && view !== state.view) {
    state.view = view as ViewId;
    state.periodOffset = 0; // Tab-Wechsel landet immer im Jetzt
    rerender(); // sofort zeigen – die frischen Daten folgen gleich
    refreshAgenda(); // Zeitfenster hat sich geändert → passende Daten holen
  }
```

f) Direkt dahinter den neuen Aktions-Block einfügen:

```ts
  if (action === 'switch-period' && trigger.dataset.dir) {
    // ‹ = -1 (zurück), › = +1 (Richtung heute) – nie über das Jetzt hinaus
    const next = Math.min(0, state.periodOffset + Number(trigger.dataset.dir));
    if (next !== state.periodOffset) {
      state.periodOffset = next;
      rerender();
      refreshAgenda();
    }
  }
```

- [ ] **Step 3: Typprüfung**

Run: `npm run build`
Expected: PASS (keine TS-Fehler; die Buttons mit `switch-period` entstehen in Task 7)

- [ ] **Step 4: Commit**

```bash
git add src/ui/dayView.ts src/main.ts
git commit -m "feat: periodOffset im State, agendaRange je Ansicht, switch-period-Aktion"
```

---

### Task 7: Cockpit-Gerüst – Masthead mit ‹ ›, Aufgaben-Sektion, Einbindung

**Files:**
- Modify: `src/ui/dayView.ts` (Exporte, Week/Month-Zweige, renderPlaceholder löschen)
- Create: `src/ui/cockpitView.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Helfer in dayView.ts exportieren**

In `src/ui/dayView.ts` bei diesen bestehenden Deklarationen das Schlüsselwort `export` ergänzen (sonst nichts ändern):

```ts
export const FALLBACK_COLOR = '#70757f';
export function escapeHtml(text: string): string { … }
export function areaColor(registry: InMemoryTagRegistry, path: string): string { … }
export function weekdayOf(date: Date): string { … }
export function dayMonthOf(date: Date): string { … }
export function monthOf(date: Date): string { … }
export function yearOf(date: Date): string { … }
export function renderMasthead(small: string, big: string, year: string): string { … }
export function renderEventForm(dateIso: string): string { … }
export function renderTaskForm(dateIso: string): string { … }
export function renderTask(task: Task): string { … }
export function renderAchievements(…): string { … }
```

- [ ] **Step 2: cockpitView.ts anlegen (Gerüst + Aufgaben)**

```ts
// src/ui/cockpitView.ts
// Cockpit-Ansicht für "Do Week" und "Do Month": Habits-Fortschritt, Ziele,
// Aufgaben und Termine eines Zeitraums – voll interaktiv wie die Day-Ansicht.
// Week und Month sind DIESELBE Ansicht, nur mit anderem Zeitraum.
//
// Hinweis: Der Import aus dayView.ts ist ein (unkritischer) Ringimport –
// beide Module rufen einander nur zur Laufzeit in Funktionen auf.
import type { Task } from '../models/types';
import {
  monthRange,
  tasksByDay,
  weekRange,
  withCanonicalTags,
  type DateRange,
  type RangeTasks,
} from '../services/selectors';
import { isoDate, isoWeek } from '../utils/dates';
import {
  dayMonthOf,
  escapeHtml,
  monthOf,
  renderMasthead,
  renderTask,
  renderTaskForm,
  weekdayOf,
  yearOf,
  type AppState,
} from './dayView';

/** Lokales Date-Objekt zu einem ISO-Tag – mittags, damit nichts verrutscht */
function dateAt(day: string): Date {
  return new Date(`${day}T12:00:00`);
}

/** Kopfzeile: Masthead plus ‹ ›-Sprungknöpfe (nie in die Zukunft) */
function renderPeriodMasthead(
  kind: 'week' | 'month',
  range: DateRange,
  offset: number,
): string {
  const start = dateAt(range.start);
  const end = dateAt(range.end);
  let small: string;
  let big: string;
  if (kind === 'week') {
    small = offset === 0 ? 'Diese Woche' : offset === -1 ? 'Vorwoche' : `KW ${isoWeek(start)}`;
    big =
      start.getMonth() === end.getMonth()
        ? `${start.getDate()}.&ndash;${dayMonthOf(end)}`
        : `${dayMonthOf(start)} &ndash; ${dayMonthOf(end)}`;
  } else {
    small = offset === 0 ? 'Dieser Monat' : offset === -1 ? 'Vormonat' : `Vor ${-offset} Monaten`;
    big = monthOf(start);
  }
  return `
    <div class="masthead-row">
      ${renderMasthead(small, big, yearOf(end))}
      <div class="period-nav">
        <button type="button" class="period-btn" data-action="switch-period" data-dir="-1"
          aria-label="Zeitraum zurück">&lsaquo;</button>
        <button type="button" class="period-btn" data-action="switch-period" data-dir="1"
          aria-label="Zeitraum vor"${offset === 0 ? ' disabled' : ''}>&rsaquo;</button>
      </div>
    </div>`;
}

/** Eine Tagesgruppe der Aufgaben-Sektion */
function renderTaskGroup(label: string, tasks: Task[], variant = ''): string {
  return `
    <div class="day-group${variant ? ` day-group--${variant}` : ''}">
      <h3 class="day-group-label">${label}</h3>
      <ul class="task-list">${tasks.map(renderTask).join('')}</ul>
    </div>`;
}

/** Aufgaben des Zeitraums: Überfällig zuoberst, dann Tag für Tag */
function renderRangeTasks(
  rangeTasks: RangeTasks,
  today: string,
  opts: { creating: boolean },
): string {
  const groups: string[] = [];
  if (rangeTasks.overdue.length > 0) {
    groups.push(renderTaskGroup('Überfällig', rangeTasks.overdue, 'overdue'));
  }
  for (const day of rangeTasks.days) {
    const date = dateAt(day.date);
    const label =
      day.date === today
        ? `Heute &middot; ${weekdayOf(date)}`
        : `${weekdayOf(date)}, ${dayMonthOf(date)}`;
    groups.push(renderTaskGroup(label, day.tasks));
  }
  return `
    <section class="panel">
      <h2 class="section-label">Aufgaben
        <button type="button" class="add-event" data-action="toggle-task-form"
          aria-expanded="${opts.creating}" aria-label="Aufgabe anlegen">+</button>
      </h2>
      ${opts.creating ? renderTaskForm(today) : ''}
      ${groups.length > 0 ? groups.join('') : '<p class="empty">Nichts fällig in diesem Zeitraum.</p>'}
    </section>`;
}

/** Komplette Cockpit-Ansicht (Inhalt der Seite, ohne untere Navigation) */
export function renderCockpit(state: AppState, syncNote: string): string {
  const kind = state.view === 'week' ? 'week' : 'month';
  const today = isoDate();
  const range =
    kind === 'week' ? weekRange(state.periodOffset) : monthRange(state.periodOffset);

  // Tags kanonisieren (Alias → aktueller Registry-Name) – wie in der Day-Ansicht
  const canonical = (tag: string): string | undefined => state.registry.resolve(tag)?.path;
  const tasks = withCanonicalTags(state.data.tasks, canonical);
  const rangeTasks = tasksByDay(tasks, range, today);

  return `
    ${renderPeriodMasthead(kind, range, state.periodOffset)}
    ${syncNote}
    ${renderRangeTasks(rangeTasks, today, { creating: state.creatingTask })}`;
}
```

(`escapeHtml` wird ab Task 9 für die Termin-Zeilen gebraucht – falls ESLint „unused" meldet, den Import erst in Task 9 ergänzen.)

- [ ] **Step 3: dayView.ts – Platzhalter durch Cockpit ersetzen**

a) Import oben ergänzen:

```ts
import { renderCockpit } from './cockpitView';
```

b) Die Funktion `renderPlaceholder` (Zeilen um 562–569) ersatzlos LÖSCHEN.

c) Die beiden Zweige `} else if (state.view === 'week') { … } else { … }` am Ende von `renderApp` ersetzen durch:

```ts
  } else {
    content = renderCockpit(state, syncNote);
  }
```

- [ ] **Step 4: CSS ergänzen**

Ans Ende von `src/style.css`:

```css
/* ---------- Cockpit (Do Week / Do Month) ---------- */

.masthead-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}

.period-nav {
  display: flex;
  gap: 0.4rem;
  padding-bottom: 1rem;
}

.period-btn {
  width: 2.2rem;
  height: 2.2rem;
  border: 1px solid var(--hairline);
  border-radius: 50%;
  background: none;
  color: var(--ink-soft);
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
}

.period-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.day-group {
  margin: 0.9rem 0;
}

.day-group-label {
  margin: 0 0 0.35rem;
  font-family: var(--sans);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.day-group--overdue .day-group-label {
  color: #b3543e;
}
```

- [ ] **Step 5: Prüfen**

Run: `npm run build && npm run test`
Expected: beide PASS

Manuell (`npm run dev` + `npm run dev:server`): Do Week zeigt Masthead „Diese Woche · 8.–14. Juni", `‹` springt zur Vorwoche (Termine/Aufgaben laden nach), `›` ist bei „jetzt" ausgegraut; Aufgaben erscheinen nach Tagen gruppiert; ＋ öffnet das Formular mit Datumsfeld; Abhaken funktioniert.

- [ ] **Step 6: Commit**

```bash
git add src/ui/dayView.ts src/ui/cockpitView.ts src/style.css
git commit -m "feat: Cockpit-Gerüst für Do Week/Do Month – Zeitsprung + Aufgaben je Tag"
```

---

### Task 8: Habits-Sektion (Woche: 7 Punkte, Monat: Balken)

**Files:**
- Modify: `src/ui/cockpitView.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Habit-Renderer ergänzen**

In `src/ui/cockpitView.ts`:

a) Imports erweitern – aus `../models/types` zusätzlich `Habit`, aus `../services/selectors` zusätzlich `datesInRange`, `habitDoneInRange`, `weeksInRange`, aus `../utils/colors` neu:

```ts
import type { Habit, Task } from '../models/types';
import { safeColor } from '../utils/colors';
```

b) Vor `renderCockpit` einfügen:

```ts
/** Wochen-Zeile: Name, 7 Punkte (Mo–So), Zähler. Klick hakt HEUTE ab. */
function renderHabitWeekRow(
  habit: Habit,
  range: DateRange,
  today: string,
  isCurrent: boolean,
): string {
  const done = new Set(habitDoneInRange(habit, range));
  const dots = datesInRange(range)
    .map(
      (day) =>
        `<span class="week-dot${done.has(day) ? ' filled' : ''}${day === today ? ' today' : ''}" aria-hidden="true"></span>`,
    )
    .join('');
  const goal = habit.schedule === 'weekly' ? (habit.target ?? 1) : 7;
  const color = safeColor(habit.color);
  // Nur im aktuellen Zeitraum klickbar – Vergangenheit bleibt, wie sie war
  const attrs = isCurrent
    ? ` data-action="toggle-habit" data-id="${habit.id}" aria-pressed="${done.has(today)}"`
    : ' disabled';
  return `
    <li>
      <button type="button" class="cockpit-habit"${color ? ` style="--hc:${color}"` : ''}${attrs}>
        <span class="habit-name">${escapeHtml(habit.title)}</span>
        <span class="week-dots">${dots}</span>
        <span class="habit-count">${done.size}/${goal}</span>
      </button>
    </li>`;
}

/** Monats-Zeile: Pillen-Balken mit Bilanz-Text */
function renderHabitMonthRow(habit: Habit, range: DateRange): string {
  const done = habitDoneInRange(habit, range).length;
  let goal: number;
  let label: string;
  if (habit.schedule === 'weekly') {
    goal = (habit.target ?? 1) * weeksInRange(range);
    label = `Ziel ${habit.target ?? 1}&times;/Woche: ${done} von ${goal}`;
  } else {
    goal = datesInRange(range).length;
    label = `${done} von ${goal} Tagen`;
  }
  const percent = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;
  const color = safeColor(habit.color);
  return `
    <li class="goal"${color ? ` style="--gc:${color}"` : ''} role="progressbar"
      aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${goal}"
      aria-label="${escapeHtml(habit.title)}">
      <div class="goal-fill" style="width:${percent}%"></div>
      <div class="goal-head">
        <span class="goal-title"><strong>${escapeHtml(habit.title)}</strong></span>
        <span class="goal-period">${label}</span>
      </div>
    </li>`;
}

/** Gewohnheiten-Sektion – Woche und Monat unterscheiden sich nur in der Zeile */
function renderCockpitHabits(
  habits: Habit[],
  range: DateRange,
  kind: 'week' | 'month',
  today: string,
  isCurrent: boolean,
): string {
  if (habits.length === 0) {
    return '';
  }
  const list =
    kind === 'week'
      ? `<ul class="cockpit-habits">${habits
          .map((habit) => renderHabitWeekRow(habit, range, today, isCurrent))
          .join('')}</ul>`
      : `<ul class="goal-list">${habits.map((habit) => renderHabitMonthRow(habit, range)).join('')}</ul>`;
  return `
    <section class="panel">
      <h2 class="section-label">Gewohnheiten</h2>
      ${list}
    </section>`;
}
```

c) In `renderCockpit` das `return` ersetzen durch:

```ts
  const isCurrent = state.periodOffset === 0;
  return `
    ${renderPeriodMasthead(kind, range, state.periodOffset)}
    ${syncNote}
    ${renderCockpitHabits(state.data.habits, range, kind, today, isCurrent)}
    ${renderRangeTasks(rangeTasks, today, { creating: state.creatingTask })}`;
```

- [ ] **Step 2: CSS ergänzen**

Ans Ende von `src/style.css`:

```css
.cockpit-habits {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.cockpit-habit {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.35rem 0.1rem;
  background: none;
  border: 0;
  cursor: pointer;
  font: inherit;
  color: var(--ink);
  text-align: left;
}

.cockpit-habit:disabled {
  cursor: default;
}

.week-dots {
  display: flex;
  gap: 0.3rem;
  margin-left: auto;
}

.week-dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 50%;
  border: 1.5px solid var(--hc, var(--accent));
}

.week-dot.filled {
  background: var(--hc, var(--accent));
}

.week-dot.today {
  box-shadow: 0 0 0 2px var(--halo);
}

.habit-count {
  min-width: 2.4rem;
  text-align: right;
  font-family: var(--sans);
  font-size: 0.85rem;
  color: var(--ink-soft);
}
```

- [ ] **Step 3: Prüfen**

Run: `npm run build && npm run test`
Expected: beide PASS

Manuell: Do Week zeigt pro Gewohnheit 7 Punkte in Habit-Farbe (heute mit Schein), Klick hakt heute ab und füllt den Punkt; in der Vorwoche sind die Zeilen nicht klickbar. Do Month zeigt Pillen-Balken mit „n von m Tagen".

- [ ] **Step 4: Commit**

```bash
git add src/ui/cockpitView.ts src/style.css
git commit -m "feat: Habits im Cockpit – Wochen-Punkte und Monats-Bilanz"
```

---

### Task 9: Ziele-Block + Termin-Zeilen

**Files:**
- Modify: `src/ui/cockpitView.ts`
- Modify: `src/style.css`

- [ ] **Step 1: Ziele und Termine ergänzen**

In `src/ui/cockpitView.ts`:

a) Imports erweitern – aus `./dayView` zusätzlich `areaColor`, `FALLBACK_COLOR`, `renderAchievements`, `renderEventForm`; aus `../services/selectors` zusätzlich `eventsByDay` und `type DayEvents`; aus `../services/tagRegistry`:

```ts
import type { InMemoryTagRegistry } from '../services/tagRegistry';
import { timeOf } from '../utils/dates'; // isoDate/isoWeek stehen schon im Import
```

b) Vor `renderCockpit` einfügen:

```ts
function weekdayShortOf(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short' }).format(date);
}

/** Termine: eine schmale Zeile pro Tag (nur Tage mit Terminen) */
function renderRangeEvents(
  days: DayEvents[],
  registry: InMemoryTagRegistry,
  today: string,
  opts: { creating: boolean },
): string {
  const rows = days
    .map((day) => {
      const date = dateAt(day.date);
      const entries = day.events
        .map(
          (event) =>
            `<span class="day-event"><span class="area-dot" style="--c:${
              event.tags[0] ? areaColor(registry, event.tags[0]) : FALLBACK_COLOR
            }"></span>${event.allDay ? '' : `${timeOf(event.start)}&nbsp;`}${escapeHtml(event.title)}</span>`,
        )
        .join('<span class="done-sep"> &middot; </span>');
      return `
      <li class="day-events-row${day.date === today ? ' today' : ''}">
        <span class="day-events-date">${weekdayShortOf(date)}&nbsp;${date.getDate()}.</span>
        <span class="day-events-list">${entries}</span>
      </li>`;
    })
    .join('');
  return `
    <section class="panel">
      <h2 class="section-label">Termine
        <button type="button" class="add-event" data-action="toggle-event-form"
          aria-expanded="${opts.creating}" aria-label="Termin anlegen">+</button>
      </h2>
      ${opts.creating ? renderEventForm(today) : ''}
      ${rows ? `<ol class="day-events">${rows}</ol>` : '<p class="empty">Keine Termine.</p>'}
    </section>`;
}
```

c) `renderCockpit` final ersetzen durch:

```ts
/** Komplette Cockpit-Ansicht (Inhalt der Seite, ohne untere Navigation) */
export function renderCockpit(state: AppState, syncNote: string): string {
  const kind = state.view === 'week' ? 'week' : 'month';
  const today = isoDate();
  const range =
    kind === 'week' ? weekRange(state.periodOffset) : monthRange(state.periodOffset);
  const isCurrent = state.periodOffset === 0;

  // Tags kanonisieren (Alias → aktueller Registry-Name) – wie in der Day-Ansicht
  const canonical = (tag: string): string | undefined => state.registry.resolve(tag)?.path;
  const tasks = withCanonicalTags(state.data.tasks, canonical);
  const events = withCanonicalTags(state.data.events, canonical);
  const rangeTasks = tasksByDay(tasks, range, today);
  const rangeEvents = eventsByDay(events, range);

  // Aufgaben-Bilanz des Zeitraums für den Ziele-Block (Überfällige zählen nicht)
  const periodTasks = rangeTasks.days.flatMap((day) => day.tasks);
  const taskStats = {
    done: periodTasks.filter((task) => task.completed).length,
    total: periodTasks.length,
  };

  return `
    ${renderPeriodMasthead(kind, range, state.periodOffset)}
    ${syncNote}
    ${renderCockpitHabits(state.data.habits, range, kind, today, isCurrent)}
    ${renderAchievements(state.data.achievements, state.data.habits, taskStats)}
    ${renderRangeTasks(rangeTasks, today, { creating: state.creatingTask })}
    ${renderRangeEvents(rangeEvents, state.registry, today, { creating: state.creatingEvent })}`;
}
```

- [ ] **Step 2: CSS ergänzen**

Ans Ende von `src/style.css`:

```css
.day-events {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.day-events-row {
  display: flex;
  gap: 0.7rem;
  align-items: baseline;
}

.day-events-row.today .day-events-date {
  color: var(--accent);
}

.day-events-date {
  flex: 0 0 3.4rem;
  font-family: var(--sans);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ink-soft);
}

.day-event {
  white-space: nowrap;
}

.day-event .area-dot {
  margin-right: 0.25rem;
}
```

- [ ] **Step 3: Prüfen**

Run: `npm run build && npm run test`
Expected: beide PASS

Manuell: Ziele-Sektion erscheint zwischen Habits und Aufgaben (Aufgaben-Balken zählt die Zeitraum-Aufgaben); Termine als Zeilen `Fr 12.  9:00 Zahnarzt · 14:00 SPD`; ＋ legt Termin mit Datum an, er erscheint sofort in seiner Tageszeile.

- [ ] **Step 4: Commit**

```bash
git add src/ui/cockpitView.ts src/style.css
git commit -m "feat: Cockpit komplett – Ziele-Block und Termin-Zeilen je Tag"
```

---

### Task 10: Endkontrolle & Deploy

**Files:** keine neuen Änderungen (nur Prüfen, ggf. Lint-Fixes)

- [ ] **Step 1: Lint, Tests, Build**

Run: `npm run lint && npm run test && npm run build`
Expected: alles PASS (Lint-Funde, falls vorhanden, beheben und committen)

- [ ] **Step 2: Manueller Durchgang (Uli)**

1. Do Week: aktuelle Woche, `‹` ×2 → zwei Wochen zurück („KW n"), `›` zurück bis ausgegraut.
2. Aufgabe im Cockpit anlegen (Datum Mittwoch) → erscheint unter Mittwoch und in Nextcloud.
3. Überfällige Aufgabe abhaken → verschwindet nach Reload aus „Überfällig".
4. Habit-Klick in Do Week → Punkt von heute füllt sich, Day-Ansicht zeigt dasselbe.
5. Do Month: Monats-Bilanz pro Habit, Vormonat per `‹`.
6. Tab-Wechsel Week → Day → Month: keine veralteten Daten, kein Fehler.

- [ ] **Step 3: Push & Deploy**

```bash
git push
```

Auf dem Server (`ssh ucloud.fritz.box`):

```bash
cd /srv/doday && git pull && cd ..
sudo docker-compose up -d --build doday
```

Erwartung: https://do.msmr.co zeigt die neuen Tabs.
