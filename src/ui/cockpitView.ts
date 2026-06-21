// Cockpit-Ansicht für "Do Week" und "Do Month": Habits-Fortschritt, Ziele,
// Aufgaben und Termine eines Zeitraums – voll interaktiv wie die Day-Ansicht.
// Week und Month sind DIESELBE Ansicht, nur mit anderem Zeitraum.
//
// Hinweis: Der Import aus dayView.ts ist ein (unkritischer) Ringimport –
// beide Module rufen einander nur zur Laufzeit in Funktionen auf.
import type { Habit, Task } from '../models/types';
import type { InMemoryTagRegistry } from '../services/tagRegistry';
import {
  datesInRange,
  eventsByDay,
  habitDoneInRange,
  monthRange,
  tasksByDay,
  weekRange,
  withCanonicalTags,
  type DateRange,
  type DayEvents,
  type RangeTasks,
} from '../services/selectors';
import { isoDate, isoWeek, timeOf } from '../utils/dates';
import { safeColor } from '../utils/colors';
import {
  areaColor,
  dayMonthOf,
  dayNum,
  escapeHtml,
  eventPen,
  FALLBACK_COLOR,
  monthOf,
  renderAchievements,
  renderEventEditForm,
  renderEventForm,
  renderMasthead,
  renderTask,
  renderTaskForm,
  renderTaskLists,
  weekdayOf,
  yearOf,
  type AppState,
} from './dayView';
import { t, locale } from '../i18n';

/** Lokales Date-Objekt zu einem ISO-Tag – mittags, damit nichts verrutscht */
function dateAt(day: string): Date {
  return new Date(`${day}T12:00:00`);
}

/** Kopfzeile – DIESELBE wie Day/Morrow: Zeitraum-Label links, Monat + Jahr rechts,
    mittiges „Aufgaben"-Badge. Die ‹ ›-Sprungknöpfe (nie in die Zukunft) sitzen
    links beim Zeitraum-Label. */
function renderPeriodMasthead(
  kind: 'week' | 'month',
  range: DateRange,
  offset: number,
  busy: boolean,
): string {
  const start = dateAt(range.start);
  const end = dateAt(range.end);
  let label: string;
  let big: string;
  if (kind === 'week') {
    label =
      offset === 0
        ? t('thisWeek')
        : offset === -1
          ? t('lastWeek')
          : t('weekNum', { n: isoWeek(start) });
    // Englisch ohne Ordnungspunkt vor dem Bindestrich („5–14 June" statt „5.–14.")
    big =
      start.getMonth() === end.getMonth()
        ? `${dayNum(start)}&ndash;${dayMonthOf(end)}`
        : `${dayMonthOf(start)} &ndash; ${dayMonthOf(end)}`;
  } else {
    label =
      offset === 0
        ? t('thisMonth')
        : offset === -1
          ? t('lastMonth')
          : t('monthsAgo', { n: -offset });
    big = monthOf(start);
  }
  // Die ‹ › wandern in den linken Masthead-Slot, damit Monat + Jahr ganz rechts bleiben.
  const nav = `
    <span class="period-nav">
      <button type="button" class="period-btn" data-action="switch-period" data-dir="-1"
        aria-label="${t('ariaPeriodBack')}">&lsaquo;</button>
      <button type="button" class="period-btn" data-action="switch-period" data-dir="1"
        aria-label="${t('ariaPeriodFwd')}"${offset === 0 ? ' disabled' : ''}>&rsaquo;</button>
    </span>`;
  const small = `<span class="period-label">${label}</span>${nav}`;
  return renderMasthead(small, big, yearOf(end), busy, t('tasks'));
}

/** Eine Tagesgruppe der Aufgaben-Sektion */
function renderTaskGroup(
  label: string,
  tasks: Task[],
  editingId: string | null,
  variant = '',
): string {
  return `
    <div class="day-group${variant ? ` day-group--${variant}` : ''}">
      <h3 class="day-group-label">${label}</h3>
      ${renderTaskLists(tasks, editingId)}
    </div>`;
}

/** Aufgaben des Zeitraums: Überfällig zuoberst, dann Tag für Tag */
function renderRangeTasks(
  rangeTasks: RangeTasks,
  today: string,
  opts: { creating: boolean; editing: string | null },
): string {
  const groups: string[] = [];
  if (rangeTasks.overdue.length > 0) {
    // „Überfällig"-Gruppe: jede Aufgabe zeigt IHR Fälligkeitsdatum (auch die erste).
    const rows = rangeTasks.overdue
      .map((task) =>
        renderTask(task, opts.editing, '', task.due ? dayMonthOf(dateAt(task.due)) : ''),
      )
      .join('');
    groups.push(`
      <div class="day-group day-group--overdue">
        <h3 class="day-group-label day-group-label--section">${t('overdue')}</h3>
        <ul class="task-list">${rows}</ul>
      </div>`);
  }
  // Sammel-Überschrift für die anstehenden (nicht überfälligen) Aufgaben.
  if (rangeTasks.days.length > 0) {
    groups.push(
      `<h3 class="day-group-label day-group-label--section day-group-label--upcoming">${t('upcoming')}</h3>`,
    );
  }
  for (const day of rangeTasks.days) {
    const date = dateAt(day.date);
    const label =
      day.date === today
        ? `${t('today')} &middot; ${weekdayOf(date)}`
        : `${weekdayOf(date)}, ${dayMonthOf(date)}`;
    groups.push(renderTaskGroup(label, day.tasks, opts.editing));
  }
  return `
    <section class="panel">
      <h2 class="section-label"><span class="label-badge">${t('tasks')}</span>
        <button type="button" class="add-event" data-action="toggle-task-form"
          aria-expanded="${opts.creating}" aria-label="${t('ariaAddTask')}">+</button>
      </h2>
      ${opts.creating ? renderTaskForm(today) : ''}
      ${groups.length > 0 ? groups.join('') : `<p class="empty">${t('nothingDue')}</p>`}
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
    // Ziel proportional zur echten Monatslänge: target × Tage ÷ 7, gerundet.
    // So zählt eine angebrochene Woche nur anteilig (Juni: 3×30/7 ≈ 13 statt 15).
    const days = datesInRange(range).length;
    goal = Math.round(((habit.target ?? 1) * days) / 7);
    label = t('goalPerWeek', { target: habit.target ?? 1, done, goal });
  } else {
    goal = datesInRange(range).length;
    label = t('daysOfTotal', { done, goal });
  }
  const percent = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;
  const color = safeColor(habit.color);
  return `
    <li class="goal goal--bare"${color ? ` style="--gc:${color}"` : ''} role="progressbar"
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
      : `<ul class="goal-list goal-list--compact">${habits.map((habit) => renderHabitMonthRow(habit, range)).join('')}</ul>`;
  return `
    <section class="panel">
      <h2 class="section-label"><span class="label-badge">${t('habits')}</span></h2>
      ${list}
    </section>`;
}

function weekdayShortOf(date: Date): string {
  return new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(date);
}

/** Termine: eine schmale Zeile pro Tag (nur Tage mit Terminen) */
function renderRangeEvents(
  days: DayEvents[],
  registry: InMemoryTagRegistry,
  today: string,
  opts: { creating: boolean; editing: string | null },
): string {
  const now = new Date();
  // Vergangener Termin (Ende zurück): wie in der Tagesansicht gedämpft; ganztägige nie.
  const isPast = (event: DayEvents['events'][number]): boolean =>
    !event.allDay && new Date(event.end) <= now;
  const rows = days
    .map((day) => {
      const date = dateAt(day.date);
      const entries = day.events
        .map((event) =>
          event.id === opts.editing
            ? renderEventEditForm(event)
            : `<span class="day-event${isPast(event) ? ' day-event--past' : ''}"><span class="area-dot" style="--c:${
                event.tags[0] ? areaColor(registry, event.tags[0]) : FALLBACK_COLOR
              }"></span>${event.allDay ? '' : `${timeOf(event.start)}&nbsp;`}${escapeHtml(event.title)}${eventPen(event)}</span>`,
        )
        .join('<span class="done-sep"> &middot; </span>');
      // Komplett vergangener Tag → Termin-Block wie abgehakt nach rechts rücken.
      const allPast = day.events.length > 0 && day.events.every(isPast);
      return `
      <li class="day-events-row${day.date === today ? ' today' : ''}${allPast ? ' day-events-row--past' : ''}">
        <span class="day-events-date">${weekdayShortOf(date)}&nbsp;${dayNum(date)}</span>
        <div class="day-events-list">${entries}</div>
      </li>`;
    })
    .join('');
  return `
    <section class="panel">
      <h2 class="section-label"><span class="label-badge">${t('events')}</span>
        <button type="button" class="add-event" data-action="toggle-event-form"
          aria-expanded="${opts.creating}" aria-label="${t('ariaAddEvent')}">+</button>
      </h2>
      ${opts.creating ? renderEventForm(today) : ''}
      ${rows ? `<ol class="day-events">${rows}</ol>` : `<p class="empty">${t('noEvents')}</p>`}
    </section>`;
}

/**
 * Inhalt der vier Karten-Zonen für Week/Month – passend zur gemeinsamen Bühne
 * in renderApp: Aufgaben füllen den Hintergrund, Termine + Gewohnheiten + Ziele
 * die Karte. Week und Month sind dieselbe Ansicht, nur mit anderem Zeitraum.
 */
export function renderCockpitParts(
  state: AppState,
  busy: boolean,
): { masthead: string; mainZone: string; scheduleZone: string; extrasZone: string } {
  const kind = state.view === 'week' ? 'week' : 'month';
  const today = isoDate();
  const range = kind === 'week' ? weekRange(state.periodOffset) : monthRange(state.periodOffset);
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

  return {
    masthead: renderPeriodMasthead(kind, range, state.periodOffset, busy),
    mainZone: renderRangeTasks(rangeTasks, today, {
      creating: state.creatingTask,
      editing: state.editingTask,
    }),
    scheduleZone: renderRangeEvents(rangeEvents, state.registry, today, {
      creating: state.creatingEvent,
      editing: state.editingEvent,
    }),
    extrasZone: `${renderCockpitHabits(state.data.habits, range, kind, today, isCurrent)}${renderAchievements(state.data.achievements, state.data.habits, taskStats, false)}`,
  };
}
