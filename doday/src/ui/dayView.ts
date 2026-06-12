// Haupt-Ansicht: verwandelt den App-Zustand in HTML.
// Prinzip "Zustand → HTML-String → innerHTML": wie ein Mini-React, nur ohne
// Framework. Nach jeder Interaktion wird komplett neu gerendert – bei dieser
// Datenmenge mehr als schnell genug, und der Code bleibt simpel.
// Klicks werden NICHT hier verdrahtet, sondern per Event-Delegation in main.ts.
//
// Vier Ansichten über die untere Navigation:
//   Do Day (heute) · Do Morrow (morgen) · Do Week / Do Month (folgen später)
// Layout: Aufgaben links, Termine + Gewohnheiten + Achievements rechts –
// auf schmalen Bildschirmen (iPhone) stapelt sich alles untereinander,
// mit den Terminen oben.
import type { Achievement, CalendarEvent, Habit, Task } from '../models/types';
import type { DayData } from '../services/mockData';
import type { InMemoryTagRegistry } from '../services/tagRegistry';
import { eventsOn, filterByArea, tasksDueOn, withCanonicalTags } from '../services/selectors';
import { groupByArea, type AreaGroup, type GroupedDay } from './grouping';
import { isoDate, shiftDays, startOfWeek, timeOf } from '../utils/dates';

/** Die vier Ansichten der unteren Navigation */
export type ViewId = 'day' | 'morrow' | 'week' | 'month';

/** Gesamter Zustand der App – eine einzige Quelle der Wahrheit */
export interface AppState {
  data: DayData;
  registry: InMemoryTagRegistry;
  /** Aktive Ansicht der unteren Navigation */
  view: ViewId;
  /** "Sprung in den Bereich": nur dieser Bereich (inkl. Unterbereiche) – null = alles */
  filterArea: string | null;
  /** Bereich, dessen Name gerade umbenannt wird – null = keiner */
  editing: string | null;
  /** Zahnrad-Panel zum Bearbeiten der Gewohnheiten offen? */
  editingHabits: boolean;
  /** Schmale Bildschirme (Hochformat): welche Spalte ist sichtbar? */
  mobileColumn: 'main' | 'side';
  /** Vom Nutzer zugeklappte Bereiche (alles andere ist offen) */
  collapsed: Set<string>;
  /** Einblende-Animation nur beim allerersten Rendern – Re-Renders bleiben ruhig */
  firstRender: boolean;
}

/** Bereiche ohne eigene Farbe erben unten die Farbe ihres Eltern-Bereichs */
const FALLBACK_COLOR = '#70757f';

/** Schlüssel für die "Ohne Bereich"-Gruppe im collapsed-Set */
const UNTAGGED_KEY = '__ohne-bereich__';

/**
 * HTML-Sonderzeichen entschärfen – Pflicht für ALLE dynamischen Texte,
 * sonst könnte ein Aufgabentitel wie "<script>" eigenen Code einschleusen.
 */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Bereichsfarbe: eigener Registry-Eintrag oder die des nächsten Vorfahren */
function areaColor(registry: InMemoryTagRegistry, path: string): string {
  const segments = path.split('.');
  while (segments.length > 0) {
    const color = registry.resolve(segments.join('.'))?.color;
    if (color) {
      return color;
    }
    segments.pop();
  }
  return FALLBACK_COLOR;
}

/* ---------- Datums-Formatierung (deutsch) ---------- */

function weekdayOf(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(date);
}

function dayMonthOf(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' }).format(date);
}

function monthOf(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(date);
}

function yearOf(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', { year: 'numeric' }).format(date);
}

/** Kopf der Seite: kleine Zeile in Akzentfarbe, darunter das Datum groß in Serife.
    Das Jahr läuft mit, aber visuell zurückgenommen. */
function renderMasthead(small: string, big: string, year: string): string {
  return `
    <header class="masthead">
      <p class="weekday">${small}</p>
      <h1 class="day-date">${big} <span class="day-year">${year}</span></h1>
    </header>`;
}

/* ---------- Termine ---------- */

/** Kompakte Termin-Liste – chronologisch, mit Bereichsfarbe als Punkt */
function renderSchedule(events: CalendarEvent[], registry: InMemoryTagRegistry): string {
  const rows = events
    .map(
      (event) => `
      <li class="timeline-row">
        <span class="time">${timeOf(event.start)}</span>
        <span class="area-dot" style="--c:${event.tags[0] ? areaColor(registry, event.tags[0]) : FALLBACK_COLOR}"></span>
        <span class="row-title">${escapeHtml(event.title)}</span>
        <span class="time-soft">bis ${timeOf(event.end)}</span>
      </li>`,
    )
    .join('');
  return `
    <section class="panel">
      <h2 class="section-label">Termine</h2>
      ${events.length > 0 ? `<ol class="timeline">${rows}</ol>` : '<p class="empty">Keine Termine.</p>'}
    </section>`;
}

/* ---------- Aufgaben & Bereiche ---------- */

/** Eine abhakbare Aufgabenzeile (Button statt Checkbox: größere Tippfläche, frei stylebar) */
function renderTask(task: Task): string {
  return `
    <li>
      <button type="button" class="task${task.completed ? ' done' : ''}"
        data-action="toggle-task" data-id="${task.id}" aria-pressed="${task.completed}">
        <span class="check" aria-hidden="true"></span>
        <span class="task-title">${escapeHtml(task.title)}</span>
      </button>
    </li>`;
}

/** Termin innerhalb einer Bereichs-Gruppe (getrennt von den Aufgaben) */
function renderGroupEvent(event: CalendarEvent): string {
  return `
    <li class="group-event">
      <span class="time">${timeOf(event.start)}</span>
      <span>${escapeHtml(event.title)}</span>
    </li>`;
}

/** Ein Bereich als auf-/zuklappbare Gruppe; Unterbereiche stecken rekursiv darin */
function renderArea(group: AreaGroup, state: AppState): string {
  const open = state.collapsed.has(group.node.path) ? '' : ' open';
  const color = areaColor(state.registry, group.node.path);
  const path = escapeHtml(group.node.path);
  // Name-Klick = Sprung (Filter auf den Bereich), ✎ = Umbenennen.
  // Während des Umbenennens ersetzt ein Eingabefeld den Namen.
  const name =
    state.editing === group.node.path
      ? `<input class="area-rename" data-path="${path}" value="${escapeHtml(group.node.segment)}"
          aria-label="Bereich umbenennen – Enter speichert, Escape bricht ab" />`
      : `<button type="button" class="area-name" data-action="filter-area" data-path="${path}"
          title="Nur diesen Bereich anzeigen">${escapeHtml(group.node.segment)}</button>
        <button type="button" class="area-edit" data-action="edit-area" data-path="${path}"
          aria-label="Bereich umbenennen">&#9998;</button>`;
  return `
    <details class="area"${open} data-area="${path}">
      <summary class="area-head">
        <span class="chevron" aria-hidden="true"></span>
        <span class="area-dot" style="--c:${color}"></span>
        ${name}
        <span class="area-count">${group.totalCount}</span>
      </summary>
      <div class="area-body">
        ${group.events.length > 0 ? `<ol class="group-events">${group.events.map(renderGroupEvent).join('')}</ol>` : ''}
        ${renderTaskLists(group.tasks)}
        ${group.children.map((child) => renderArea(child, state)).join('')}
      </div>
    </details>`;
}

/**
 * Offene Aufgaben links; erledigte darunter als Block nach rechts gerückt –
 * der Block selbst ist in sich linksbündig (gemeinsame linke Kante).
 */
function renderTaskLists(tasks: Task[]): string {
  const open = tasks.filter((task) => !task.completed);
  const done = tasks.filter((task) => task.completed);
  return `
    ${open.length > 0 ? `<ul class="task-list">${open.map(renderTask).join('')}</ul>` : ''}
    ${done.length > 0 ? `<ul class="task-list task-list--done">${done.map(renderTask).join('')}</ul>` : ''}`;
}

/** Objekte ohne Tag – bewusst ganz unten und zurückhaltend gestaltet */
function renderUntagged(grouped: GroupedDay, state: AppState): string {
  const { tasks, events } = grouped.untagged;
  if (tasks.length === 0 && events.length === 0) {
    return '';
  }
  const open = state.collapsed.has(UNTAGGED_KEY) ? '' : ' open';
  return `
    <details class="area area--untagged"${open} data-area="${UNTAGGED_KEY}">
      <summary class="area-head">
        <span class="chevron" aria-hidden="true"></span>
        <span class="area-name">Ohne Bereich</span>
        <span class="area-count">${tasks.length + events.length}</span>
      </summary>
      <div class="area-body">
        ${events.length > 0 ? `<ol class="group-events">${events.map(renderGroupEvent).join('')}</ol>` : ''}
        ${renderTaskLists(tasks)}
      </div>
    </details>`;
}

/** Aufgaben-Sektion: alle Bereiche + "Ohne Bereich" */
function renderAreas(grouped: GroupedDay, state: AppState): string {
  const isEmpty =
    grouped.groups.length === 0 &&
    grouped.untagged.tasks.length === 0 &&
    grouped.untagged.events.length === 0;
  return `
    <section class="panel">
      <h2 class="section-label">Aufgaben</h2>
      ${
        isEmpty
          ? '<p class="empty">Keine Aufgaben für diesen Tag.</p>'
          : grouped.groups.map((group) => renderArea(group, state)).join('') +
            renderUntagged(grouped, state)
      }
    </section>`;
}

/* ---------- Gewohnheiten & Achievements ---------- */

/**
 * Kreisring mit "X/Y" im Zentrum – sitzt rechts in jedem Balken.
 * Der Ring übernimmt die Balkenfarbe (--gc) und schließt sich mit dem
 * Fortschritt (Kreis voll = geschafft).
 */
function renderRing(done: number, total: number): string {
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const share = total > 0 ? Math.min(1, done / total) : 0;
  // stroke-dashoffset steuert, wie viel vom Ring sichtbar ist
  const offset = circumference * (1 - share);
  return `
        <span class="ring" aria-hidden="true">
          <svg viewBox="0 0 44 44">
            <circle class="ring-track" cx="22" cy="22" r="${radius}"></circle>
            <circle class="ring-fill" cx="22" cy="22" r="${radius}"
              stroke-dasharray="${circumference.toFixed(2)}"
              stroke-dashoffset="${offset.toFixed(2)}"></circle>
          </svg>
          <span class="ring-num">
            <span class="ring-top">${done}</span>
            <span class="ring-bottom">${total}</span>
          </span>
        </span>`;
}

/** Tages-Fortschritt der Aufgaben: schwarzer Balken mit Kreisring rechts */
function renderTaskProgress(stats: { done: number; total: number }): string {
  if (stats.total === 0) {
    return '';
  }
  const percent = Math.round((stats.done / stats.total) * 100);
  return `
      <li class="goal task-progress" role="progressbar" aria-valuenow="${stats.done}"
        aria-valuemin="0" aria-valuemax="${stats.total}" aria-label="Heute erledigte Aufgaben">
        <div class="goal-fill" style="width:${percent}%"></div>
        <div class="goal-head">
          <span class="goal-title">Aufgaben</span>
        </div>
        ${renderRing(stats.done, stats.total)}
      </li>`;
}

/** Gewohnheiten als schlichte Kreise – erledigt = gefüllt mit Haken, jede in eigener Farbe */
function renderHabits(habits: Habit[], editing: boolean): string {
  const today = isoDate();
  const items = habits
    .map((habit) => {
      const done = habit.log.includes(today);
      // Die eigene Farbe wandert als CSS-Variable an den Button
      const colorStyle = habit.color ? ` style="--hc:${escapeHtml(habit.color)}"` : '';
      return `
      <button type="button" class="habit${done ? ' done' : ''}"${colorStyle}
        data-action="toggle-habit" data-id="${habit.id}" aria-pressed="${done}">
        <span class="habit-dot" aria-hidden="true"></span>
        <span class="habit-name">${escapeHtml(habit.title)}</span>
      </button>`;
    })
    .join('');
  // Zahnrad am Ende der Reihe öffnet den Editor (Name, Farbe, Zeitraum, Ziel)
  const gear = `
      <button type="button" class="habit-gear${editing ? ' active' : ''}"
        data-action="toggle-habit-editor" aria-expanded="${editing}"
        aria-label="Gewohnheiten bearbeiten">&#9881;</button>`;
  return `
    <section class="panel">
      <h2 class="section-label">Gewohnheiten</h2>
      <div class="habit-row">${items}${gear}</div>
      ${editing ? renderHabitEditor(habits) : ''}
    </section>`;
}

/** Editor-Panel: pro Gewohnheit Farbe, Name, Zeitraum und optionales Ziel */
function renderHabitEditor(habits: Habit[]): string {
  const rows = habits
    .map(
      (habit) => `
      <div class="habit-editor-row">
        <input type="color" value="${escapeHtml(habit.color ?? '#8fae87')}"
          data-edit="color" data-id="${habit.id}"
          aria-label="Farbe von ${escapeHtml(habit.title)}" />
        <input type="text" value="${escapeHtml(habit.title)}"
          data-edit="title" data-id="${habit.id}" aria-label="Name der Gewohnheit" />
        <select data-edit="schedule" data-id="${habit.id}" aria-label="Zeitraum">
          <option value="daily"${habit.schedule === 'daily' ? ' selected' : ''}>täglich</option>
          <option value="weekly"${habit.schedule === 'weekly' ? ' selected' : ''}>wöchentlich</option>
        </select>
        <input type="number" min="1" max="99" value="${habit.target ?? ''}" placeholder="Ziel"
          data-edit="target" data-id="${habit.id}" aria-label="Ziel: Wiederholungen pro Zeitraum" />
      </div>`,
    )
    .join('');
  return `
    <div class="habit-editor">
      ${rows}
      <p class="habit-editor-hint">Ziel = Wiederholungen pro Zeitraum (optional)</p>
    </div>`;
}

/**
 * Eigener Balken für Gewohnheiten OHNE verknüpftes Achievement (z. B. "Lesen"):
 * täglich = heute 0/1, wöchentlich = Stand dieser Woche gegen das Ziel.
 * Klick auf den Habit-Kreis bewegt Zahl und Füllstand sofort mit.
 */
function renderHabitBar(habit: Habit): string {
  const today = isoDate();
  let done: number;
  let periodLabel: string;
  if (habit.schedule === 'weekly') {
    const monday = isoDate(startOfWeek(new Date()));
    done = habit.log.filter((day) => day >= monday && day <= today).length;
    periodLabel = 'Woche';
  } else {
    done = habit.log.includes(today) ? 1 : 0;
    periodLabel = 'heute';
  }
  const total = habit.target ?? 1;
  const percent = Math.min(100, Math.round((done / total) * 100));
  const colorStyle = habit.color ? ` style="--gc:${escapeHtml(habit.color)}"` : '';
  return `
      <li class="goal"${colorStyle} role="progressbar" aria-valuenow="${done}"
        aria-valuemin="0" aria-valuemax="${total}" aria-label="${escapeHtml(habit.title)}">
        <div class="goal-fill" style="width:${percent}%"></div>
        <div class="goal-head">
          <span class="goal-title"><span class="goal-recur" aria-hidden="true">&#8634;</span>${escapeHtml(habit.title)}</span>
          <span class="goal-period">${periodLabel}</span>
        </div>
        ${renderRing(done, total)}
      </li>`;
}

/**
 * Ziele als zeilenhohe Farbflächen (Text IM Balken), in zwei Gruppen:
 * - "Einmalig":    kumulative Meilensteine mit Ziellinie (z. B. 30 Tage Journal)
 * - "Regelmäßig":  zyklische Ziele, die sich pro Tag/Woche zurücksetzen
 *                  (Habits ohne Meilenstein + der Aufgaben-Fortschritt)
 */
function renderAchievements(
  achievements: Achievement[],
  habits: Habit[],
  taskStats: { done: number; total: number },
): string {
  // Habits, deren Fortschritt nicht schon über ein einmaliges Ziel abgebildet ist
  const unlinkedHabits = habits.filter(
    (habit) => !achievements.some((achievement) => achievement.habitId === habit.id),
  );
  const items = achievements
    .map((achievement) => {
      const percent = Math.min(100, Math.round((achievement.progress / achievement.target) * 100));
      const colorStyle = achievement.color ? ` style="--gc:${escapeHtml(achievement.color)}"` : '';
      return `
      <li class="goal"${colorStyle} role="progressbar" aria-valuenow="${achievement.progress}"
        aria-valuemin="0" aria-valuemax="${achievement.target}"
        aria-label="${escapeHtml(achievement.title)}">
        <div class="goal-fill" style="width:${percent}%"></div>
        <div class="goal-head">
          <span class="goal-title">${escapeHtml(achievement.title)}</span>
        </div>
        ${renderRing(achievement.progress, achievement.target)}
      </li>`;
    })
    .join('');
  const recurring = unlinkedHabits.map(renderHabitBar).join('');
  const taskBar = renderTaskProgress(taskStats);
  return `
    <section class="panel">
      <h2 class="section-label">Ziele</h2>
      ${items ? `<ul class="goal-list" aria-label="Einmalige Ziele">${items}</ul>` : ''}
      ${
        recurring
          ? `<p class="goal-group-label">Regelmäßig</p>
             <ul class="goal-list" aria-label="Regelmäßige Ziele">${recurring}</ul>`
          : ''
      }
      ${
        taskBar
          ? `<p class="goal-group-label">Aufgaben</p>
             <ul class="goal-list" aria-label="Aufgaben-Fortschritt">${taskBar}</ul>`
          : ''
      }
    </section>`;
}

/** Eine Zeile mit allem, was heute schon geschafft ist: Aufgaben + vergangene Termine */
function renderDoneLine(tasks: Task[], events: CalendarEvent[]): string {
  const now = new Date();
  const nowIso = `${isoDate(now)}T${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes(),
  ).padStart(2, '0')}:00`;
  const doneTitles = [
    ...tasks.filter((task) => task.completed).map((task) => task.title),
    ...events.filter((event) => event.end <= nowIso).map((event) => event.title),
  ];
  if (doneTitles.length === 0) {
    return '';
  }
  const items = doneTitles
    .map((title) => `<span class="done-item">${escapeHtml(title)}</span>`)
    .join('<span class="done-sep"> · </span>');
  return `<p class="done-line"><span class="done-label">Erledigt</span> ${items}</p>`;
}

/* ---------- Untere Navigation ---------- */

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'morrow', label: 'Morrow' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

/** Feste Navigation am unteren Rand: Do Day · Do Morrow · Do Week · Do Month */
function renderNav(active: ViewId): string {
  const items = VIEWS.map(
    (view) => `
    <button type="button" class="nav-item${view.id === active ? ' active' : ''}"
      data-action="switch-view" data-view="${view.id}"${view.id === active ? ' aria-current="page"' : ''}>
      <span class="nav-do" aria-hidden="true">Do</span>
      <span class="nav-label">${view.label}</span>
    </button>`,
  ).join('');
  return `<nav class="bottom-nav" aria-label="Ansichten">${items}</nav>`;
}

/** Aktiver Bereichs-Filter als Chip – das × hebt den Sprung wieder auf */
function renderFilterChip(state: AppState): string {
  if (!state.filterArea) {
    return '';
  }
  const color = areaColor(state.registry, state.filterArea);
  return `
    <div class="filter-chip">
      <span class="area-dot" style="--c:${color}"></span>
      <span>Nur <strong>${escapeHtml(state.filterArea)}</strong></span>
      <button type="button" class="chip-clear" data-action="clear-filter"
        aria-label="Bereichs-Filter entfernen">&times;</button>
    </div>`;
}

/* ---------- Zusammenbau der Ansichten ---------- */

/** Platzhalter für Ansichten, die in späteren Phasen entstehen */
function renderPlaceholder(label: string): string {
  return `
    <section class="panel">
      <h2 class="section-label">${label}</h2>
      <p class="empty">Diese Ansicht entsteht in einer späteren Phase.</p>
    </section>`;
}

/** Komplette App rendern */
export function renderApp(root: HTMLElement, state: AppState): void {
  // Beim ersten Rendern blenden die Blöcke sanft gestaffelt ein
  let revealIndex = 0;
  const reveal = (html: string): string =>
    state.firstRender
      ? `<div data-reveal style="--d:${revealIndex++ * 90}ms">${html}</div>`
      : `<div>${html}</div>`;

  const orderOf = (path: string): number | undefined => state.registry.resolve(path)?.order;
  const today = new Date();
  let content: string;

  if (state.view === 'day' || state.view === 'morrow') {
    // "Do Day" und "Do Morrow" sind dieselbe Ansicht mit anderem Datum
    const date = state.view === 'day' ? today : shiftDays(today, 1);
    const dateIso = isoDate(date);

    // 1. Tag filtern  2. Tags kanonisieren (Alias → aktueller Registry-Name)
    // 3. ggf. Bereichs-Filter ("Sprung") anwenden
    const canonical = (tag: string): string | undefined => state.registry.resolve(tag)?.path;
    const dayTasks = withCanonicalTags(tasksDueOn(state.data.tasks, dateIso), canonical);
    const dayEvents = withCanonicalTags(eventsOn(state.data.events, dateIso), canonical);
    // Der Bereichs-Filter ("Sprung") wirkt auf die Listen – nicht auf die Erledigt-Zeile
    const tasks = filterByArea(dayTasks, state.filterArea);
    const events = filterByArea(dayEvents, state.filterArea);
    const grouped = groupByArea(tasks, events, orderOf);

    const small =
      state.view === 'day' ? weekdayOf(date) : `Morgen · ${weekdayOf(date)}`;
    // Gewohnheiten/Achievements gehören zum Heute – morgen gibt es nichts abzuhaken
    const taskStats = {
      done: dayTasks.filter((task) => task.completed).length,
      total: dayTasks.length,
    };
    const extras =
      state.view === 'day'
        ? `<div class="col-extras">${reveal(renderHabits(state.data.habits, state.editingHabits))}${reveal(renderAchievements(state.data.achievements, state.data.habits, taskStats))}</div>`
        : '';

    // Hochformat: Umschalter am Bildschirmrand wechselt zwischen den Spalten
    const onMain = state.mobileColumn === 'main';
    const switcher = `
      <button type="button" class="col-switch ${onMain ? 'col-switch--right' : 'col-switch--left'}"
        data-action="switch-column"
        aria-label="${onMain ? 'Termine und Gewohnheiten zeigen' : 'Aufgaben zeigen'}">
        <span class="col-switch-label">${onMain ? 'Termine' : 'Aufgaben'}</span>
        <span class="col-switch-arrow" aria-hidden="true">${onMain ? '&rsaquo;' : '&lsaquo;'}</span>
      </button>`;

    content = `
      ${reveal(renderMasthead(small, dayMonthOf(date), yearOf(date)))}
      ${state.view === 'day' ? renderDoneLine(dayTasks, dayEvents) : ''}
      ${renderFilterChip(state)}
      <div class="columns" data-mobile="${state.mobileColumn}">
        <div class="col-schedule">${reveal(renderSchedule(events, state.registry))}</div>
        <div class="col-main">${reveal(renderAreas(grouped, state))}</div>
        ${extras}
      </div>
      ${switcher}`;
  } else if (state.view === 'week') {
    content = `
      ${reveal(renderMasthead('Diese Woche', dayMonthOf(today), yearOf(today)))}
      ${reveal(renderPlaceholder('Wochenansicht'))}`;
  } else {
    content = `
      ${reveal(renderMasthead('Dieser Monat', monthOf(today), yearOf(today)))}
      ${reveal(renderPlaceholder('Monatsansicht'))}`;
  }

  root.innerHTML = `<main class="page">${content}</main>${renderNav(state.view)}`;
}
