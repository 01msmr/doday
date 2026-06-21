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
import {
  DEFAULT_HABIT_COLOR,
  type Achievement,
  type AppData,
  type CalendarEvent,
  type Habit,
  type Task,
} from '../models/types';
import type { InMemoryTagRegistry } from '../services/tagRegistry';
import { eventsOn, filterByArea, tasksDueOn, withCanonicalTags } from '../services/selectors';
import { groupByArea, type AreaGroup, type GroupedDay } from './grouping';
import { isoDate, localDateOf, shiftDays, startOfWeek, timeOf } from '../utils/dates';
import { safeColor } from '../utils/colors';
import { renderCockpitParts } from './cockpitView';
import { t, getLang, locale } from '../i18n';

/** Die Ansichten der unteren Navigation */
export type ViewId = 'day' | 'morrow' | 'week' | 'month' | 'undone';

/** Gesamter Zustand der App – eine einzige Quelle der Wahrheit */
export interface AppState {
  data: AppData;
  registry: InMemoryTagRegistry;
  /** Erste Daten werden noch aus der Nextcloud geladen */
  loading: boolean;
  /** Letzter Lade-/Speicherfehler – null = alles in Ordnung */
  syncError: string | null;
  /** Aktive Ansicht der unteren Navigation */
  view: ViewId;
  /** Cockpit-Zeitsprung: 0 = aktuelle Woche/Monat, -1 = davor … (nie > 0) */
  periodOffset: number;
  /** "Sprung in den Bereich": nur dieser Bereich (inkl. Unterbereiche) – null = alles */
  filterArea: string | null;
  /** Bereich, dessen Name gerade umbenannt wird – null = keiner */
  editing: string | null;
  /** Zahnrad-Panel zum Bearbeiten der Gewohnheiten offen? */
  editingHabits: boolean;
  /** Formular "Termin anlegen" offen? */
  creatingEvent: boolean;
  /** Formular "Aufgabe anlegen" offen? */
  creatingTask: boolean;
  /** Aufgabe, die gerade bearbeitet wird (id) – null = keine */
  editingTask: string | null;
  /** Termin, der gerade bearbeitet wird (id) – null = keiner */
  editingEvent: string | null;
  /** Schmale Bildschirme (Hochformat): welche Spalte ist sichtbar? */
  mobileColumn: 'main' | 'side';
  /** Nur für die Wechsel-Animation: Richtung des letzten Spaltenwechsels
      (wird direkt nach dem Render wieder auf null gesetzt). */
  columnAnim?: 'to-main' | 'to-side' | null;
  /** Vom Nutzer zugeklappte Bereiche (alles andere ist offen) */
  collapsed: Set<string>;
}

/** Bereiche ohne eigene Farbe erben unten die Farbe ihres Eltern-Bereichs */
export const FALLBACK_COLOR = '#70757f';

/** Schlüssel für die "Ohne Bereich"-Gruppe im collapsed-Set */
const UNTAGGED_KEY = '__ohne-bereich__';

/**
 * HTML-Sonderzeichen entschärfen – Pflicht für ALLE dynamischen Texte,
 * sonst könnte ein Aufgabentitel wie "<script>" eigenen Code einschleusen.
 */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Bereichsfarbe: eigener Registry-Eintrag oder die des nächsten Vorfahren.
    safeColor lässt nur echte Hex-Farben ins HTML (tags.json ist Fremddaten). */
export function areaColor(registry: InMemoryTagRegistry, path: string): string {
  const segments = path.split('.');
  while (segments.length > 0) {
    const color = safeColor(registry.resolve(segments.join('.'))?.color);
    if (color) {
      return color;
    }
    segments.pop();
  }
  return FALLBACK_COLOR;
}

/* ---------- Datums-Formatierung (deutsch) ---------- */

export function weekdayOf(date: Date): string {
  return new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(date);
}

export function dayMonthOf(date: Date): string {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long' }).format(date);
}

export function monthOf(date: Date): string {
  return new Intl.DateTimeFormat(locale(), { month: 'long' }).format(date);
}

export function yearOf(date: Date): string {
  return new Intl.DateTimeFormat(locale(), { year: 'numeric' }).format(date);
}

/** Reine Tageszahl – im Deutschen mit Ordnungspunkt ("14."), im Englischen ohne ("14"). */
export function dayNum(date: Date): string {
  return getLang() === 'de' ? `${date.getDate()}.` : `${date.getDate()}`;
}

/** Kopf der Seite: EINE Zeile an der oberen Kante – Wochentag links, Datum rechts.
    Links optional ein ASCII-Spinner (|/—\\), solange Daten laden bzw. nicht ladbar sind. */
export function renderMasthead(
  small: string,
  big: string,
  year: string,
  busy = false,
  center = '',
): string {
  const spinner = busy ? '<span class="load-spinner" aria-hidden="true"></span> ' : '';
  // Mit center-Label: drei Spalten (Tag links · Label mittig · Datum rechts).
  const centerEl = center ? `<p class="masthead-center">${center}</p>` : '';
  return `
    <header class="masthead${center ? ' masthead--triple' : ''}">
      <p class="weekday">${spinner}${small}</p>
      ${centerEl}
      <h1 class="day-date">${big} <span class="day-year">${year}</span></h1>
    </header>`;
}

/* ---------- Termine ---------- */

/** Formular: Termin mit #Tags anlegen → direkt in den Nextcloud-Kalender
    (synct von dort auf alle Geräte); alternativ als .ics an den Geräte-Kalender */
export function renderEventForm(dateIso: string): string {
  return `
    <form class="event-form" data-event-form>
      <input type="text" data-field="title" placeholder="${t('titleEventPh')}"
        aria-label="${t('ariaEventTitle')}" required />
      <div class="event-form-row">
        <input type="date" data-field="date" value="${dateIso}" aria-label="${t('fieldDate')}" required />
        <input type="time" data-field="start" value="09:00" aria-label="${t('fieldStart')}" required />
        <span class="event-form-sep">&ndash;</span>
        <input type="time" data-field="end" value="10:00" aria-label="${t('fieldEnd')}" required />
      </div>
      <div class="event-form-actions">
        <button type="submit" class="btn-primary">${t('save')}</button>
        <button type="button" class="btn-quiet" data-action="event-ics">${t('asIcs')}</button>
        <button type="button" class="btn-quiet" data-action="toggle-event-form">${t('cancel')}</button>
      </div>
    </form>`;
}

/** Formular: Aufgabe mit #Tags anlegen → Nextcloud Tasks (VTODO) */
export function renderTaskForm(dateIso: string): string {
  return `
    <form class="event-form" data-task-form>
      <input type="text" data-field="title" placeholder="${t('titleTaskPh')}"
        aria-label="${t('ariaTaskTitle')}" required />
      <div class="event-form-row">
        <input type="date" data-field="due" value="${dateIso}" aria-label="${t('fieldDue')}" />
      </div>
      <div class="event-form-actions">
        <button type="submit" class="btn-primary">${t('create')}</button>
        <button type="button" class="btn-quiet" data-action="toggle-task-form">${t('cancel')}</button>
      </div>
    </form>`;
}

/** Stift im kleinen Kreis: öffnet das Bearbeiten einer Aufgabe / eines Termins */
export function renderEditPen(action: string, id: string): string {
  return `
      <button type="button" class="edit-pen" data-action="${action}"
        data-id="${escapeHtml(id)}" aria-label="${t('edit')}">&#9998;</button>`;
}

/** Inline-Formular: Aufgabe bearbeiten – Titel (inkl. #Tags) und Fälligkeit */
export function renderTaskEditForm(task: Task): string {
  return `
    <form class="event-form" data-task-edit-form data-id="${escapeHtml(task.id)}">
      <input type="text" data-field="title" value="${escapeHtml(task.rawText)}"
        aria-label="${t('ariaTaskTitle')}" required />
      <div class="event-form-row">
        <input type="date" data-field="due" value="${task.due ?? ''}" aria-label="${t('fieldDue')}" />
      </div>
      <div class="event-form-actions">
        <button type="submit" class="btn-primary">${t('save')}</button>
        <button type="button" class="btn-quiet" data-action="cancel-edit">${t('cancel')}</button>
      </div>
    </form>`;
}

/** Inline-Formular: Einzeltermin bearbeiten – ganztägige nur mit Datum */
export function renderEventEditForm(event: CalendarEvent): string {
  const times = event.allDay
    ? ''
    : `<input type="time" data-field="start" value="${timeOf(event.start)}" aria-label="${t('fieldStart')}" required />
        <span class="event-form-sep">&ndash;</span>
        <input type="time" data-field="end" value="${timeOf(event.end)}" aria-label="${t('fieldEnd')}" required />`;
  return `
    <form class="event-form" data-event-edit-form data-id="${escapeHtml(event.id)}">
      <input type="text" data-field="title" value="${escapeHtml(event.rawText)}"
        aria-label="${t('ariaEventTitle')}" required />
      <div class="event-form-row">
        <input type="date" data-field="date" value="${localDateOf(event.start)}" aria-label="${t('fieldDate')}" required />
        ${times}
      </div>
      <div class="event-form-actions">
        <button type="submit" class="btn-primary">${t('save')}</button>
        <button type="button" class="btn-quiet" data-action="cancel-edit">${t('cancel')}</button>
      </div>
    </form>`;
}

/** Stift nur für bearbeitbare Termine: Einzeltermine mit CalDAV-Pfad (keine Serien) */
export function eventPen(event: CalendarEvent): string {
  return event.href && !event.recurring ? renderEditPen('edit-event', event.id) : '';
}

/** Kompakte Termin-Liste – chronologisch, mit Bereichsfarbe als Punkt.
    Der ＋-Kreis rechts neben der Überschrift öffnet das Termin-Formular. */
function renderSchedule(
  events: CalendarEvent[],
  registry: InMemoryTagRegistry,
  opts: { creating: boolean; dateIso: string; editing: string | null },
): string {
  const now = new Date();
  const rows = events
    .map((event) => {
      if (event.id === opts.editing) {
        return `<li>${renderEventEditForm(event)}</li>`;
      }
      // Vergangener Termin (Ende liegt zurück): wie eine abgehakte Aufgabe nach
      // rechts gerückt und gedämpft – ganztägige zählen nie als vergangen.
      const past = !event.allDay && new Date(event.end) <= now;
      return `
      <li class="timeline-row${past ? ' timeline-row--past' : ''}">
        <span class="time">${event.allDay ? t('allDayShort') : timeOf(event.start)}</span>
        <span class="area-dot" style="--c:${event.tags[0] ? areaColor(registry, event.tags[0]) : FALLBACK_COLOR}"></span>
        <span class="row-title">${escapeHtml(event.title)}</span>
        <span class="time-soft">${event.allDay ? t('allDay') : t('until', { time: timeOf(event.end) })}</span>
        ${eventPen(event)}
      </li>`;
    })
    .join('');
  return `
    <section class="panel">
      <h2 class="section-label"><span class="label-badge">${t('events')}</span>
        <button type="button" class="add-event" data-action="toggle-event-form"
          aria-expanded="${opts.creating}" aria-label="${t('ariaAddEvent')}">+</button>
      </h2>
      ${opts.creating ? renderEventForm(opts.dateIso) : ''}
      ${events.length > 0 ? `<ol class="timeline">${rows}</ol>` : `<p class="empty">${t('noEvents')}</p>`}
    </section>`;
}

/* ---------- Aufgaben & Bereiche ---------- */

/** Eine abhakbare Aufgabenzeile (Button statt Checkbox: größere Tippfläche, frei stylebar).
    Während des Bearbeitens ersetzt das Inline-Formular die Zeile.
    fromPath = Bereich, in dem die Zeile gerade steht (Quelle beim Verschieben);
    leer für "Ohne Bereich"/Cockpit – dort hängt retagTask den Tag dann an. */
export function renderTask(
  task: Task,
  editingId: string | null = null,
  fromPath = '',
  dueLabel = '',
): string {
  if (task.id === editingId) {
    return `<li>${renderTaskEditForm(task)}</li>`;
  }
  // Greifer links, GETRENNT vom Abhak-Button: Ziehen darf nicht abhaken.
  // touch-action:none (im CSS) verhindert, dass der Browser beim Ziehen scrollt.
  const grip = `<span class="drag-grip" data-drag="task" data-id="${escapeHtml(task.id)}"
        data-from="${escapeHtml(fromPath)}" aria-hidden="true" title="${t('dragToMove')}">&#10303;</span>`;
  // dueLabel nur gesetzt, wo wir es ausdrücklich wollen (Überfällig-Liste) → sonst leer.
  const due = dueLabel ? `<span class="task-due">${escapeHtml(dueLabel)}</span>` : '';
  return `
    <li class="task-row">
      ${grip}
      <button type="button" class="task${task.completed ? ' done' : ''}"
        data-action="toggle-task" data-id="${task.id}" aria-pressed="${task.completed}">
        <span class="check" aria-hidden="true"></span>
        <span class="task-title">${escapeHtml(task.title)}</span>
        ${due}
      </button>
      ${task.href ? renderEditPen('edit-task', task.id) : ''}
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
  // Kopf = Aufgaben-Ablageziel (data-drop) UND – nur auf oberster Ebene –
  // selbst greifbar zum Umsortieren (data-drag). Unterbereiche bleiben nur Ziel.
  const isTopLevel = !group.node.path.includes('.');
  // data-from am Kopf = eigener Pfad: beim Umsortieren ist das die Quelle (info.from)
  const dropAttrs = `data-drop="area" data-path="${path}"${isTopLevel ? ` data-drag="area" data-from="${path}"` : ''}`;
  // Name-Klick = Sprung (Filter auf den Bereich), ✎ = Umbenennen.
  // Während des Umbenennens ersetzt ein Eingabefeld den Namen.
  const name =
    state.editing === group.node.path
      ? `<input class="area-rename" data-path="${path}" value="${escapeHtml(group.node.segment)}"
          aria-label="${t('renameArea')}" />`
      : `<button type="button" class="area-name" data-action="filter-area" data-path="${path}"
          title="${t('onlyThisArea')}">${escapeHtml(group.node.segment)}</button>
        <button type="button" class="area-edit" data-action="edit-area" data-path="${path}"
          aria-label="${t('renameArea')}">&#9998;</button>`;
  return `
    <details class="area"${open} data-area="${path}">
      <summary class="area-head" ${dropAttrs}>
        <span class="chevron" aria-hidden="true"></span>
        <span class="area-dot" style="--c:${color}"></span>
        ${name}
        <span class="area-count">${group.totalCount}</span>
      </summary>
      <div class="area-body">
        ${group.events.length > 0 ? `<ol class="group-events">${group.events.map(renderGroupEvent).join('')}</ol>` : ''}
        ${renderTaskLists(group.tasks, state.editingTask, group.node.path)}
        ${group.children.map((child) => renderArea(child, state)).join('')}
      </div>
    </details>`;
}

/**
 * Offene Aufgaben links; erledigte darunter als Block nach rechts gerückt –
 * der Block selbst ist in sich linksbündig (gemeinsame linke Kante).
 */
function renderTaskLists(tasks: Task[], editingId: string | null, fromPath = ''): string {
  const open = tasks.filter((task) => !task.completed);
  const done = tasks.filter((task) => task.completed);
  const row = (task: Task): string => renderTask(task, editingId, fromPath);
  return `
    ${open.length > 0 ? `<ul class="task-list">${open.map(row).join('')}</ul>` : ''}
    ${done.length > 0 ? `<ul class="task-list task-list--done">${done.map(row).join('')}</ul>` : ''}`;
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
        <span class="area-name">${t('untagged')}</span>
        <span class="area-count">${tasks.length + events.length}</span>
      </summary>
      <div class="area-body">
        ${events.length > 0 ? `<ol class="group-events">${events.map(renderGroupEvent).join('')}</ol>` : ''}
        ${renderTaskLists(tasks, state.editingTask)}
      </div>
    </details>`;
}

/** Aufgaben-Sektion: alle Bereiche + "Ohne Bereich"; ＋ legt eine neue Aufgabe an */
function renderAreas(
  grouped: GroupedDay,
  state: AppState,
  opts: { creating: boolean; dateIso: string },
): string {
  const isEmpty =
    grouped.groups.length === 0 &&
    grouped.untagged.tasks.length === 0 &&
    grouped.untagged.events.length === 0;
  return `
    <section class="panel">
      <h2 class="section-label"><span class="label-badge">${t('tasks')}</span>
        <button type="button" class="add-event" data-action="toggle-task-form"
          aria-expanded="${opts.creating}" aria-label="${t('ariaAddTask')}">+</button>
      </h2>
      ${opts.creating ? renderTaskForm(opts.dateIso) : ''}
      ${
        isEmpty
          ? `<p class="empty">${t('noTasks')}</p>`
          : grouped.groups.map((group) => renderArea(group, state)).join('') +
            // Ablagezone fürs Verschieben nach ganz unten – nur beim Bereich-Ziehen
            // greifbar (CSS), ein Strich darin = "hier ans Ende einsortieren".
            '<div class="area-drop-end" data-drop="area-end" aria-hidden="true"></div>' +
            renderUntagged(grouped, state) +
            // Aufgabe hierher ziehen entfernt ihren Bereich – nur beim Aufgabe-Ziehen sichtbar
            `<div class="untag-drop" data-drop="untag" aria-hidden="true">${t('removeFromArea')}</div>`
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
        aria-valuemin="0" aria-valuemax="${stats.total}" aria-label="${t('ariaDoneTasks')}">
        <div class="goal-fill" style="width:${percent}%"></div>
        <div class="goal-head">
          <span class="goal-title"><strong>${t('tasks')}</strong></span>
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
      // Die eigene Farbe wandert als CSS-Variable an den Button (nur echte Hex-Farben)
      const color = safeColor(habit.color);
      const colorStyle = color ? ` style="--hc:${color}"` : '';
      return `
      <button type="button" class="habit${done ? ' done' : ''}"${colorStyle}
        data-action="toggle-habit" data-id="${habit.id}" aria-pressed="${done}">
        <span class="habit-dot" aria-hidden="true"></span>
        <span class="habit-name">${escapeHtml(habit.title)}</span>
      </button>`;
    })
    .join('');
  // Zahnrad rechts in der „Gewohnheiten"-Kopfzeile (klein) öffnet den Editor.
  const gear = `
      <button type="button" class="habit-gear${editing ? ' active' : ''}"
        data-action="toggle-habit-editor" aria-expanded="${editing}"
        aria-label="${t('ariaEditHabits')}">
        <i class="fa-solid fa-gear" aria-hidden="true"></i>
      </button>`;
  // Ohne Gewohnheiten: leiser Hinweis auf das Zahnrad
  const emptyHint =
    habits.length === 0 && !editing
      ? `<p class="empty">${t('noHabits')}</p>`
      : '';
  return `
    <section class="panel">
      <h2 class="section-label section-label--gear"><span class="label-badge">${t('habits')}</span>${gear}</h2>
      <div class="habit-row">${items}</div>
      ${emptyHint}
      ${editing ? renderHabitEditor(habits) : ''}
    </section>`;
}

/** Editor-Panel: pro Gewohnheit Farbe, Name, Zeitraum, Ziel – plus Anlegen/Löschen */
function renderHabitEditor(habits: Habit[]): string {
  const rows = habits
    .map(
      (habit) => `
      <div class="habit-editor-row">
        <input type="color" value="${escapeHtml(habit.color ?? DEFAULT_HABIT_COLOR)}"
          data-edit="color" data-id="${habit.id}"
          aria-label="${t('ariaColorOf', { name: escapeHtml(habit.title) })}" />
        <input type="text" value="${escapeHtml(habit.title)}"
          data-edit="title" data-id="${habit.id}" aria-label="${t('habitName')}" />
        <select data-edit="schedule" data-id="${habit.id}" aria-label="${t('period')}">
          <option value="daily"${habit.schedule === 'daily' ? ' selected' : ''}>${t('daily')}</option>
          <option value="weekly"${habit.schedule === 'weekly' ? ' selected' : ''}>${t('weekly')}</option>
        </select>
        <input type="number" min="1" max="99" value="${habit.target ?? ''}" placeholder="${t('target')}"
          data-edit="target" data-id="${habit.id}" aria-label="${t('ariaTargetField')}" />
        <button type="button" class="habit-delete" data-action="delete-habit" data-id="${habit.id}"
          aria-label="${t('ariaDeleteHabit', { name: escapeHtml(habit.title) })}">&times;</button>
      </div>`,
    )
    .join('');
  return `
    <div class="habit-editor">
      ${rows}
      <button type="button" class="btn-quiet habit-add" data-action="add-habit">
        ${t('addHabitBtn')}
      </button>
      <p class="habit-editor-hint">${t('targetHint')}</p>
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
    periodLabel = t('periodWeek');
  } else {
    done = habit.log.includes(today) ? 1 : 0;
    periodLabel = t('periodToday');
  }
  const total = habit.target ?? 1;
  const percent = Math.min(100, Math.round((done / total) * 100));
  const color = safeColor(habit.color);
  const colorStyle = color ? ` style="--gc:${color}"` : '';
  return `
      <li class="goal"${colorStyle} role="progressbar" aria-valuenow="${done}"
        aria-valuemin="0" aria-valuemax="${total}" aria-label="${escapeHtml(habit.title)}">
        <div class="goal-fill" style="width:${percent}%"></div>
        <div class="goal-head">
          <span class="goal-title"><span class="goal-recur" aria-hidden="true">&#8634;</span>${emphasizeAction(habit.title)}</span>
          <span class="goal-period">${periodLabel}</span>
        </div>
        ${renderRing(done, total)}
      </li>`;
}

/**
 * Hebt die Aktion eines Ziel-Titels hervor: das letzte Wort ist die Tätigkeit
 * ("30 Tage Journal", "100 km Gehen", "Lesen") und wird fett gesetzt.
 */
function emphasizeAction(title: string): string {
  const words = title.trim().split(' ');
  const action = words.pop() ?? '';
  if (words.length === 0) {
    return `<strong>${escapeHtml(action)}</strong>`;
  }
  return `${escapeHtml(words.join(' '))} <strong>${escapeHtml(action)}</strong>`;
}

/**
 * Ziele als zeilenhohe Farbflächen (Text IM Balken), in zwei Gruppen:
 * - "Einmalig":    kumulative Meilensteine mit Ziellinie (z. B. 30 Tage Journal)
 * - "Regelmäßig":  zyklische Ziele, die sich pro Tag/Woche zurücksetzen
 *                  (Habits ohne Meilenstein + der Aufgaben-Fortschritt)
 */
export function renderAchievements(
  achievements: Achievement[],
  habits: Habit[],
  taskStats: { done: number; total: number },
  // Day zeigt Gewohnheiten oben nur als Kreise → hier zusätzlich als Balken (true).
  // Week/Month zeigen Gewohnheiten oben bereits als Balken → hier NICHT doppeln (false).
  showRecurring = true,
): string {
  // Habits, deren Fortschritt nicht schon über ein einmaliges Ziel abgebildet ist
  const unlinkedHabits = showRecurring
    ? habits.filter(
        (habit) => !achievements.some((achievement) => achievement.habitId === habit.id),
      )
    : [];
  const items = achievements
    .map((achievement) => {
      const percent = Math.min(100, Math.round((achievement.progress / achievement.target) * 100));
      const color = safeColor(achievement.color);
      const colorStyle = color ? ` style="--gc:${color}"` : '';
      return `
      <li class="goal"${colorStyle} role="progressbar" aria-valuenow="${achievement.progress}"
        aria-valuemin="0" aria-valuemax="${achievement.target}"
        aria-label="${escapeHtml(achievement.title)}">
        <div class="goal-fill" style="width:${percent}%"></div>
        <div class="goal-head">
          <span class="goal-title">${emphasizeAction(achievement.title)}</span>
        </div>
        ${renderRing(achievement.progress, achievement.target)}
      </li>`;
    })
    .join('');
  const recurring = unlinkedHabits.map(renderHabitBar).join('');
  const taskBar = renderTaskProgress(taskStats);
  // Nichts anzuzeigen? Dann auch keine leere „Ziele"-Überschrift rendern.
  if (!items && !recurring && !taskBar) {
    return '';
  }
  return `
    <section class="panel">
      <h2 class="section-label"><span class="label-badge">${t('goals')}</span></h2>
      ${items ? `<ul class="goal-list" aria-label="${t('ariaOnceGoals')}">${items}</ul>` : ''}
      ${
        recurring
          ? `<p class="goal-group-label">${t('recurring')}</p>
             <ul class="goal-list" aria-label="${t('ariaRecurringGoals')}">${recurring}</ul>`
          : ''
      }
      ${
        taskBar
          ? `<p class="goal-group-label">${t('tasks')}</p>
             <ul class="goal-list" aria-label="${t('ariaTaskProgress')}">${taskBar}</ul>`
          : ''
      }
    </section>`;
}

/** Eine Zeile mit allem, was heute schon geschafft ist: Aufgaben + vergangene Termine */
function renderDoneLine(tasks: Task[], events: CalendarEvent[]): string {
  const now = new Date();
  const doneTitles = [
    ...tasks.filter((task) => task.completed).map((task) => task.title),
    // Vergangene Termine: Date-Vergleich versteht UTC (CalDAV) wie lokale Stempel
    ...events
      .filter((event) => !event.allDay && new Date(event.end) <= now)
      .map((event) => event.title),
  ];
  if (doneTitles.length === 0) {
    return '';
  }
  const items = doneTitles
    .map((title) => `<span class="done-item">${escapeHtml(title)}</span>`)
    .join('<span class="done-sep"> · </span>');
  return `<p class="done-line"><span class="done-label">${t('done')}</span> ${items}</p>`;
}

/* ---------- Untere Navigation ---------- */

const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'morrow', label: 'Morrow' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

/** Feste Navigation am unteren Rand: Do Day · Do Morrow · Do Week · Do Month · UN DONE */
function renderNav(active: ViewId): string {
  const items = VIEWS.map(
    (view) => `
    <button type="button" class="nav-item${view.id === active ? ' active' : ''}"
      data-action="switch-view" data-view="${view.id}"${view.id === active ? ' aria-current="page"' : ''}>
      <span class="nav-do" aria-hidden="true">Do</span>
      <span class="nav-label">${view.label}</span>
    </button>`,
  ).join('');
  // „UN DONE": gleiches Tasten-Layout (großes Wort oben, kleines unten), aber
  // RAHMENLOS (kein Keycap). Das „:" aus „UN:DONE" wird bewusst nicht gezeigt.
  const undoneBtn = `
    <button type="button" class="nav-item nav-item--plain${active === 'undone' ? ' active' : ''}"
      data-action="switch-view" data-view="undone"${active === 'undone' ? ' aria-current="page"' : ''}>
      <span class="nav-do" aria-hidden="true">UN</span>
      <span class="nav-label">DONE</span>
    </button>`;
  // Unsichtbarer Platzhalter links in GLEICHER Breite wie „UN DONE" rechts →
  // die vier Tabs dazwischen bleiben exakt mittig.
  const spacer = `<span class="nav-item nav-item--plain nav-spacer" aria-hidden="true"></span>`;
  // Sprach-Umschalter unten rechts: zeigt die AKTUELLE Sprache (Tipp wechselt)
  const langBtn = `
    <button type="button" class="lang-toggle" data-action="toggle-lang"
      aria-label="Sprache wechseln">${getLang().toUpperCase()}</button>`;
  return `<nav class="bottom-nav" aria-label="Ansichten">${spacer}${items}${undoneBtn}${langBtn}</nav>`;
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

/** Komplette App rendern */
export function renderApp(root: HTMLElement, state: AppState): void {
  const orderOf = (path: string): number | undefined => state.registry.resolve(path)?.order;
  const today = new Date();

  // Beim Start: erst die Nextcloud-Daten abwarten
  if (state.loading) {
    root.innerHTML = `
      <main class="page page--staged">
        ${renderMasthead(weekdayOf(today), dayMonthOf(today), yearOf(today), true)}
        <p class="empty">${t('loading')}</p>
      </main>
      ${renderNav(state.view)}`;
    return;
  }

  // Der Fehlertext wird nicht mehr inline gezeigt, sondern als kurzes Overlay
  // (Toast in main.ts). Der Lade-Spinner im Kopf signalisiert den Zustand dauerhaft.
  const busy = state.loading || Boolean(state.syncError);

  // ALLE Ansichten teilen sich jetzt dieselbe Karten-Bühne: Aufgaben als
  // Hintergrund, Termine + Gewohnheiten + Ziele als Karte darüber. Day/Morrow und
  // Week/Month füllen nur die vier Zonen mit unterschiedlichem Inhalt.
  let mastheadHtml: string;
  let mainHtml: string; // Hintergrund: Aufgaben
  let scheduleHtml: string; // Karte: Termine
  let extrasHtml: string; // Karte: Gewohnheiten + Ziele
  let doneLine = '';
  let filterChip = '';

  if (state.view === 'day' || state.view === 'morrow') {
    // "Do Day" und "Do Morrow" sind dieselbe Ansicht mit anderem Datum
    const date = state.view === 'day' ? today : shiftDays(today, 1);
    const dateIso = isoDate(date);

    // 1. Tag filtern  2. Tags kanonisieren (Alias → aktueller Registry-Name)
    // 3. ggf. Bereichs-Filter ("Sprung") anwenden
    const canonical = (tag: string): string | undefined => state.registry.resolve(tag)?.path;
    const dayTasks = withCanonicalTags(
      tasksDueOn(state.data.tasks, dateIso, isoDate(today)),
      canonical,
    );
    const dayEvents = withCanonicalTags(eventsOn(state.data.events, dateIso), canonical);
    // Der Bereichs-Filter ("Sprung") wirkt auf die Listen – nicht auf die Erledigt-Zeile
    const tasks = filterByArea(dayTasks, state.filterArea);
    const events = filterByArea(dayEvents, state.filterArea);
    const grouped = groupByArea(tasks, events, orderOf);

    // Day wie Morrow zeigen den Wochentag des jeweiligen Datums (Morrow also z. B. „Montag").
    const small = weekdayOf(date);
    // Gewohnheiten/Achievements gehören zum Heute – morgen gibt es nichts abzuhaken
    const taskStats = {
      done: dayTasks.filter((task) => task.completed).length,
      total: dayTasks.length,
    };

    mastheadHtml = renderMasthead(small, dayMonthOf(date), yearOf(date), busy, t('tasks'));
    doneLine = state.view === 'day' ? renderDoneLine(dayTasks, dayEvents) : '';
    filterChip = renderFilterChip(state);
    mainHtml = renderAreas(grouped, state, { creating: state.creatingTask, dateIso });
    scheduleHtml = renderSchedule(events, state.registry, {
      creating: state.creatingEvent,
      dateIso,
      editing: state.editingEvent,
    });
    extrasHtml =
      state.view === 'day'
        ? `${renderHabits(state.data.habits, state.editingHabits)}${renderAchievements(state.data.achievements, state.data.habits, taskStats)}`
        : '';
  } else if (state.view === 'undone') {
    // „UN DONE": GLEICHES Karten-Gerüst wie Tabs 1–4 – offene Aufgaben im
    // Hintergrund (col-main, normales Design), erledigte in der Karte (col-side,
    // invertiert/dunkel). Abhaken nutzt toggle-task → wandert in die andere Spalte.
    const undone = state.data.tasks.filter((task) => !task.completed);
    const done = state.data.tasks.filter((task) => task.completed);
    const list = (tasks: Task[]): string =>
      tasks.length > 0
        ? `<ul class="task-list">${tasks.map((task) => renderTask(task)).join('')}</ul>`
        : `<p class="empty">–</p>`;
    // Top-Bar wie die anderen: „UN" links, „DONE" rechts, „OFFEN"-Badge mittig
    // (= col-main-Label, das auf Mobil in den Kopf wandert).
    mastheadHtml = renderMasthead('UN', 'DONE', '', busy, t('open'));
    mainHtml = `
      <section class="panel">
        <h2 class="section-label"><span class="label-badge">${t('open')}</span></h2>
        ${list(undone)}
      </section>`;
    scheduleHtml = `
      <section class="panel">
        <h2 class="section-label"><span class="label-badge">${t('done')}</span></h2>
        ${list(done)}
      </section>`;
    extrasHtml = '';
  } else {
    // Week/Month: gleiche Zonen, nur mit Zeitraum-Inhalt gefüllt
    const parts = renderCockpitParts(state, busy);
    mastheadHtml = parts.masthead;
    mainHtml = parts.mainZone;
    scheduleHtml = parts.scheduleZone;
    extrasHtml = parts.extrasZone;
  }

  const isUndone = state.view === 'undone';
  const onMain = state.mobileColumn === 'main';
  // Animationsklasse nur beim tatsächlichen Wechsel (sonst zappelt es bei jedem Render)
  const animClass = state.columnAnim ? ` ${state.columnAnim}` : '';

  // Karten-Icon links in der Oberleiste (lugt im geparkten Zustand heraus):
  // Kalender für die Termine-Karte, Häkchen für die „Erledigt"-Karte (UN DONE).
  const calIcon = `
      <svg class="card-cal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
        <path d="M3 9h18M8 2.5v4M16 2.5v4" />
      </svg>`;
  const checkIcon = `
      <svg class="card-cal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>`;
  const cardIcon = isUndone ? checkIcon : calIcon;
  const cardLabel = isUndone ? t('done') : t('events');

  // Die Karte liegt als Blatt über dem Hintergrund. Ihre Oberleiste ist zugleich
  // der Griff zum Umschalten: Icon links, Label mittig.
  const cardHandle = `
      <button type="button" class="card-handle" data-action="switch-column"
        aria-label="${onMain ? cardLabel : t('tasks')}">
        ${cardIcon}
        <span class="card-handle-label">${cardLabel}</span>
      </button>`;

  // Untere Aktions-Pillen nur in den Planungs-Tabs (Day/Morrow/Week/Month).
  // UN DONE ist eine reine Übersicht → keine „+"-Pillen.
  const cardAction = isUndone
    ? ''
    : `
      <div class="card-action">
        <button type="button" class="add-pill add-pill--event"
          data-action="toggle-event-form">${t('addEvent')}</button>
      </div>`;
  const hgAction = isUndone
    ? ''
    : `
      <div class="hg-action">
        <button type="button" class="add-pill add-pill--task"
          data-action="toggle-task-form">${t('addTask')}</button>
      </div>`;

  const extrasWrap = extrasHtml ? `<div class="col-extras">${extrasHtml}</div>` : '';

  const content = `
      ${mastheadHtml}
      ${doneLine}
      ${filterChip}
      <div class="columns${animClass}${isUndone ? ' columns--undone' : ''}" data-mobile="${state.mobileColumn}">
        <div class="col-main">${mainHtml}${hgAction}</div>
        <div class="col-side">
          ${cardHandle}
          <div class="col-side-body">
            <div class="col-schedule">${scheduleHtml}</div>
            ${extrasWrap}
          </div>
          ${cardAction}
        </div>
      </div>`;

  // Alle Ansichten nutzen dieselbe Karten-Bühne (page--staged); UN:DONE bekommt
  // zusätzlich page--undone (u. a. ganzseitig weiß auf Mobil).
  const pageClass = `page page--staged${isUndone ? ' page--undone' : ''}`;
  root.innerHTML = `<main class="${pageClass}">${content}</main>${renderNav(state.view)}`;
}
