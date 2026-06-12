// Cockpit-Ansicht für "Do Week" und "Do Month": Habits-Fortschritt, Ziele,
// Aufgaben und Termine eines Zeitraums – voll interaktiv wie die Day-Ansicht.
// Week und Month sind DIESELBE Ansicht, nur mit anderem Zeitraum.
//
// Hinweis: Der Import aus dayView.ts ist ein (unkritischer) Ringimport –
// beide Module rufen einander nur zur Laufzeit in Funktionen auf.
import type { Habit, Task } from '../models/types';
import {
  datesInRange,
  habitDoneInRange,
  monthRange,
  tasksByDay,
  weekRange,
  weeksInRange,
  withCanonicalTags,
  type DateRange,
  type RangeTasks,
} from '../services/selectors';
import { isoDate, isoWeek } from '../utils/dates';
import { safeColor } from '../utils/colors';
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
  const rangeTasks = tasksByDay(tasks, range, today);

  return `
    ${renderPeriodMasthead(kind, range, state.periodOffset)}
    ${syncNote}
    ${renderCockpitHabits(state.data.habits, range, kind, today, isCurrent)}
    ${renderRangeTasks(rangeTasks, today, { creating: state.creatingTask })}`;
}
