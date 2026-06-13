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
import type { Achievement, AppData, CalendarEvent, Habit, Task } from '../models/types';
import type { InMemoryTagRegistry } from '../services/tagRegistry';
import { eventsOn, filterByArea, tasksDueOn, withCanonicalTags } from '../services/selectors';
import { groupByArea, type AreaGroup, type GroupedDay } from './grouping';
import { isoDate, localDateOf, shiftDays, startOfWeek, timeOf } from '../utils/dates';
import { safeColor } from '../utils/colors';
import { renderCockpit } from './cockpitView';

/** Die vier Ansichten der unteren Navigation */
export type ViewId = 'day' | 'morrow' | 'week' | 'month';

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
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(date);
}

export function dayMonthOf(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' }).format(date);
}

export function monthOf(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(date);
}

export function yearOf(date: Date): string {
  return new Intl.DateTimeFormat('de-DE', { year: 'numeric' }).format(date);
}

/** Kopf der Seite: kleine Zeile in Akzentfarbe, darunter das Datum groß in Serife.
    Das Jahr läuft mit, aber visuell zurückgenommen. */
export function renderMasthead(small: string, big: string, year: string): string {
  return `
    <header class="masthead">
      <p class="weekday">${small}</p>
      <h1 class="day-date">${big} <span class="day-year">${year}</span></h1>
    </header>`;
}

/* ---------- Termine ---------- */

/** Formular: Termin mit #Tags anlegen → direkt in den Nextcloud-Kalender
    (synct von dort auf alle Geräte); alternativ als .ics an den Geräte-Kalender */
export function renderEventForm(dateIso: string): string {
  return `
    <form class="event-form" data-event-form>
      <input type="text" data-field="title" placeholder="Titel #Tag"
        aria-label="Termintitel, #Tags erlaubt" required />
      <div class="event-form-row">
        <input type="date" data-field="date" value="${dateIso}" aria-label="Datum" required />
        <input type="time" data-field="start" value="09:00" aria-label="Beginn" required />
        <span class="event-form-sep">&ndash;</span>
        <input type="time" data-field="end" value="10:00" aria-label="Ende" required />
      </div>
      <div class="event-form-actions">
        <button type="submit" class="btn-primary">Speichern</button>
        <button type="button" class="btn-quiet" data-action="event-ics">als .ics</button>
        <button type="button" class="btn-quiet" data-action="toggle-event-form">Abbrechen</button>
      </div>
    </form>`;
}

/** Formular: Aufgabe mit #Tags anlegen → Nextcloud Tasks (VTODO) */
export function renderTaskForm(dateIso: string): string {
  return `
    <form class="event-form" data-task-form>
      <input type="text" data-field="title" placeholder="Aufgabe #Bereich"
        aria-label="Aufgabentitel, #Tags erlaubt" required />
      <div class="event-form-row">
        <input type="date" data-field="due" value="${dateIso}" aria-label="Fällig am" />
      </div>
      <div class="event-form-actions">
        <button type="submit" class="btn-primary">Anlegen</button>
        <button type="button" class="btn-quiet" data-action="toggle-task-form">Abbrechen</button>
      </div>
    </form>`;
}

/** Stift im kleinen Kreis: öffnet das Bearbeiten einer Aufgabe / eines Termins */
export function renderEditPen(action: string, id: string): string {
  return `
      <button type="button" class="edit-pen" data-action="${action}"
        data-id="${escapeHtml(id)}" aria-label="Bearbeiten">&#9998;</button>`;
}

/** Inline-Formular: Aufgabe bearbeiten – Titel (inkl. #Tags) und Fälligkeit */
export function renderTaskEditForm(task: Task): string {
  return `
    <form class="event-form" data-task-edit-form data-id="${escapeHtml(task.id)}">
      <input type="text" data-field="title" value="${escapeHtml(task.rawText)}"
        aria-label="Aufgabentitel, #Tags erlaubt" required />
      <div class="event-form-row">
        <input type="date" data-field="due" value="${task.due ?? ''}" aria-label="Fällig am" />
      </div>
      <div class="event-form-actions">
        <button type="submit" class="btn-primary">Speichern</button>
        <button type="button" class="btn-quiet" data-action="cancel-edit">Abbrechen</button>
      </div>
    </form>`;
}

/** Inline-Formular: Einzeltermin bearbeiten – ganztägige nur mit Datum */
export function renderEventEditForm(event: CalendarEvent): string {
  const times = event.allDay
    ? ''
    : `<input type="time" data-field="start" value="${timeOf(event.start)}" aria-label="Beginn" required />
        <span class="event-form-sep">&ndash;</span>
        <input type="time" data-field="end" value="${timeOf(event.end)}" aria-label="Ende" required />`;
  return `
    <form class="event-form" data-event-edit-form data-id="${escapeHtml(event.id)}">
      <input type="text" data-field="title" value="${escapeHtml(event.rawText)}"
        aria-label="Termintitel, #Tags erlaubt" required />
      <div class="event-form-row">
        <input type="date" data-field="date" value="${localDateOf(event.start)}" aria-label="Datum" required />
        ${times}
      </div>
      <div class="event-form-actions">
        <button type="submit" class="btn-primary">Speichern</button>
        <button type="button" class="btn-quiet" data-action="cancel-edit">Abbrechen</button>
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
  const rows = events
    .map((event) =>
      event.id === opts.editing
        ? `<li>${renderEventEditForm(event)}</li>`
        : `
      <li class="timeline-row">
        <span class="time">${event.allDay ? 'Tag' : timeOf(event.start)}</span>
        <span class="area-dot" style="--c:${event.tags[0] ? areaColor(registry, event.tags[0]) : FALLBACK_COLOR}"></span>
        <span class="row-title">${escapeHtml(event.title)}</span>
        <span class="time-soft">${event.allDay ? 'ganztägig' : `bis ${timeOf(event.end)}`}</span>
        ${eventPen(event)}
      </li>`,
    )
    .join('');
  return `
    <section class="panel">
      <h2 class="section-label">Termine
        <button type="button" class="add-event" data-action="toggle-event-form"
          aria-expanded="${opts.creating}" aria-label="Termin anlegen">+</button>
      </h2>
      ${opts.creating ? renderEventForm(opts.dateIso) : ''}
      ${events.length > 0 ? `<ol class="timeline">${rows}</ol>` : '<p class="empty">Keine Termine.</p>'}
    </section>`;
}

/* ---------- Aufgaben & Bereiche ---------- */

/** Eine abhakbare Aufgabenzeile (Button statt Checkbox: größere Tippfläche, frei stylebar).
    Während des Bearbeitens ersetzt das Inline-Formular die Zeile.
    fromPath = Bereich, in dem die Zeile gerade steht (Quelle beim Verschieben);
    leer für "Ohne Bereich"/Cockpit – dort hängt retagTask den Tag dann an. */
export function renderTask(task: Task, editingId: string | null = null, fromPath = ''): string {
  if (task.id === editingId) {
    return `<li>${renderTaskEditForm(task)}</li>`;
  }
  // Greifer links, GETRENNT vom Abhak-Button: Ziehen darf nicht abhaken.
  // touch-action:none (im CSS) verhindert, dass der Browser beim Ziehen scrollt.
  const grip = `<span class="drag-grip" data-drag="task" data-id="${escapeHtml(task.id)}"
        data-from="${escapeHtml(fromPath)}" aria-hidden="true" title="Zum Verschieben ziehen">&#10303;</span>`;
  return `
    <li class="task-row">
      ${grip}
      <button type="button" class="task${task.completed ? ' done' : ''}"
        data-action="toggle-task" data-id="${task.id}" aria-pressed="${task.completed}">
        <span class="check" aria-hidden="true"></span>
        <span class="task-title">${escapeHtml(task.title)}</span>
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
          aria-label="Bereich umbenennen – Enter speichert, Escape bricht ab" />`
      : `<button type="button" class="area-name" data-action="filter-area" data-path="${path}"
          title="Nur diesen Bereich anzeigen">${escapeHtml(group.node.segment)}</button>
        <button type="button" class="area-edit" data-action="edit-area" data-path="${path}"
          aria-label="Bereich umbenennen">&#9998;</button>`;
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
        <span class="area-name">Ohne Bereich</span>
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
      <h2 class="section-label">Aufgaben
        <button type="button" class="add-event" data-action="toggle-task-form"
          aria-expanded="${opts.creating}" aria-label="Aufgabe anlegen">+</button>
      </h2>
      ${opts.creating ? renderTaskForm(opts.dateIso) : ''}
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
          <span class="goal-title"><strong>Aufgaben</strong></span>
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
  // Zahnrad am Ende der Reihe öffnet den Editor (Name, Farbe, Zeitraum, Ziel).
  // Font-Awesome-Icon, per Schriftgröße auf 65 % der Kreishöhe skaliert.
  const gear = `
      <button type="button" class="habit-gear${editing ? ' active' : ''}"
        data-action="toggle-habit-editor" aria-expanded="${editing}"
        aria-label="Gewohnheiten bearbeiten">
        <i class="fa-solid fa-gear" aria-hidden="true"></i>
      </button>`;
  // Ohne Gewohnheiten: leiser Hinweis auf das Zahnrad
  const emptyHint =
    habits.length === 0 && !editing
      ? '<p class="empty">Noch keine Gewohnheiten – über das Zahnrad anlegen.</p>'
      : '';
  return `
    <section class="panel">
      <h2 class="section-label">Gewohnheiten</h2>
      <div class="habit-row">${items}${gear}</div>
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
        <button type="button" class="habit-delete" data-action="delete-habit" data-id="${habit.id}"
          aria-label="${escapeHtml(habit.title)} löschen">&times;</button>
      </div>`,
    )
    .join('');
  return `
    <div class="habit-editor">
      ${rows}
      <button type="button" class="btn-quiet habit-add" data-action="add-habit">
        + Gewohnheit hinzufügen
      </button>
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
): string {
  // Habits, deren Fortschritt nicht schon über ein einmaliges Ziel abgebildet ist
  const unlinkedHabits = habits.filter(
    (habit) => !achievements.some((achievement) => achievement.habitId === habit.id),
  );
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

/** Komplette App rendern */
export function renderApp(root: HTMLElement, state: AppState): void {
  const orderOf = (path: string): number | undefined => state.registry.resolve(path)?.order;
  const today = new Date();

  // Beim Start: erst die Nextcloud-Daten abwarten
  if (state.loading) {
    root.innerHTML = `
      <main class="page">
        ${renderMasthead(weekdayOf(today), dayMonthOf(today), yearOf(today))}
        <p class="empty">Lade deine Daten aus der Nextcloud &hellip;</p>
      </main>
      ${renderNav(state.view)}`;
    return;
  }

  const syncNote = state.syncError
    ? `<p class="sync-note">&#9888; ${escapeHtml(state.syncError)}</p>`
    : '';
  let content: string;

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

    const small =
      state.view === 'day' ? weekdayOf(date) : `Morgen · ${weekdayOf(date)}`;
    // Gewohnheiten/Achievements gehören zum Heute – morgen gibt es nichts abzuhaken
    const taskStats = {
      done: dayTasks.filter((task) => task.completed).length,
      total: dayTasks.length,
    };
    const extras =
      state.view === 'day'
        ? `<div class="col-extras">${renderHabits(state.data.habits, state.editingHabits)}${renderAchievements(state.data.achievements, state.data.habits, taskStats)}</div>`
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
      ${renderMasthead(small, dayMonthOf(date), yearOf(date))}
      ${syncNote}
      ${state.view === 'day' ? renderDoneLine(dayTasks, dayEvents) : ''}
      ${renderFilterChip(state)}
      <div class="columns" data-mobile="${state.mobileColumn}">
        <div class="col-schedule">${renderSchedule(events, state.registry, { creating: state.creatingEvent, dateIso, editing: state.editingEvent })}</div>
        <div class="col-main">${renderAreas(grouped, state, { creating: state.creatingTask, dateIso })}</div>
        ${extras}
      </div>
      ${switcher}`;
  } else {
    content = renderCockpit(state, syncNote);
  }

  root.innerHTML = `<main class="page">${content}</main>${renderNav(state.view)}`;
}
