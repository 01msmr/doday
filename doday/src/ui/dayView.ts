// Tagesansicht: verwandelt den App-Zustand in HTML.
// Prinzip "Zustand → HTML-String → innerHTML": wie ein Mini-React, nur ohne
// Framework. Nach jeder Interaktion wird einfach komplett neu gerendert –
// bei dieser Datenmenge ist das mehr als schnell genug und hält den Code simpel.
// Klicks werden NICHT hier verdrahtet, sondern per Event-Delegation in main.ts.
import type { Achievement, CalendarEvent, Habit, Task } from '../models/types';
import type { DayData } from '../services/mockData';
import type { InMemoryTagRegistry } from '../services/tagRegistry';
import { groupByArea, type AreaGroup, type GroupedDay } from './grouping';
import { isoDate, timeOf } from '../utils/dates';

/** Gesamter Zustand der App – eine einzige Quelle der Wahrheit */
export interface AppState {
  data: DayData;
  registry: InMemoryTagRegistry;
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

/** Kopf der Seite: Wochentag klein, Datum groß in Serife – wie eine Planerseite */
function renderMasthead(date: Date): string {
  const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(date);
  const dayMonth = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' }).format(date);
  return `
    <header class="masthead">
      <p class="wordmark">Do Day</p>
      <p class="weekday">${weekday}</p>
      <h1 class="day-date">${dayMonth}</h1>
    </header>`;
}

/** Kompakte Termin-Übersicht oben – chronologisch, mit Bereichsfarbe als Punkt */
function renderSchedule(events: CalendarEvent[], registry: InMemoryTagRegistry): string {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const rows = sorted
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
      <ol class="timeline">${rows}</ol>
    </section>`;
}

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
  return `
    <details class="area"${open} data-area="${escapeHtml(group.node.path)}">
      <summary class="area-head">
        <span class="chevron" aria-hidden="true"></span>
        <span class="area-dot" style="--c:${color}"></span>
        <span class="area-name">${escapeHtml(group.node.segment)}</span>
        <span class="area-count">${group.totalCount}</span>
      </summary>
      <div class="area-body">
        ${group.events.length > 0 ? `<ol class="group-events">${group.events.map(renderGroupEvent).join('')}</ol>` : ''}
        ${group.tasks.length > 0 ? `<ul class="task-list">${group.tasks.map(renderTask).join('')}</ul>` : ''}
        ${group.children.map((child) => renderArea(child, state)).join('')}
      </div>
    </details>`;
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
        ${tasks.length > 0 ? `<ul class="task-list">${tasks.map(renderTask).join('')}</ul>` : ''}
      </div>
    </details>`;
}

/** Aufgaben-Sektion: alle Bereiche + "Ohne Bereich" */
function renderAreas(grouped: GroupedDay, state: AppState): string {
  return `
    <section class="panel">
      <h2 class="section-label">Aufgaben</h2>
      ${grouped.groups.map((group) => renderArea(group, state)).join('')}
      ${renderUntagged(grouped, state)}
    </section>`;
}

/** Gewohnheiten als schlichte Punkte: ● erledigt / ○ offen – kein Gamification */
function renderHabits(habits: Habit[]): string {
  const today = isoDate();
  const items = habits
    .map((habit) => {
      const done = habit.log.includes(today);
      return `
      <button type="button" class="habit${done ? ' done' : ''}"
        data-action="toggle-habit" data-id="${habit.id}" aria-pressed="${done}">
        <span class="habit-dot" aria-hidden="true"></span>
        <span class="habit-name">${escapeHtml(habit.title)}</span>
      </button>`;
    })
    .join('');
  return `
    <section class="panel">
      <h2 class="section-label">Gewohnheiten</h2>
      <div class="habit-row">${items}</div>
    </section>`;
}

/** Achievements mit dezentem Fortschritt – eine Haarlinie, keine Konfetti */
function renderAchievements(achievements: Achievement[]): string {
  const items = achievements
    .map((achievement) => {
      const percent = Math.min(100, Math.round((achievement.progress / achievement.target) * 100));
      return `
      <li class="goal">
        <div class="goal-head">
          <span class="goal-title">${escapeHtml(achievement.title)}</span>
          <span class="goal-num">${achievement.progress}<span class="goal-sep">/</span>${achievement.target}</span>
        </div>
        <div class="goal-bar" role="progressbar" aria-valuenow="${achievement.progress}"
          aria-valuemin="0" aria-valuemax="${achievement.target}"
          aria-label="${escapeHtml(achievement.title)}">
          <div class="goal-fill" style="width:${percent}%"></div>
        </div>
      </li>`;
    })
    .join('');
  return `
    <section class="panel">
      <h2 class="section-label">Achievements</h2>
      <ul class="goal-list">${items}</ul>
    </section>`;
}

/** Komplette Tagesansicht rendern */
export function renderDayView(root: HTMLElement, state: AppState): void {
  const { data, registry } = state;
  // Registry-Reihenfolge bestimmt die Bereichs-Sortierung (Fallback: alphabetisch)
  const grouped = groupByArea(data.tasks, data.events, (path) => registry.resolve(path)?.order);

  // Beim ersten Rendern blenden die Sektionen sanft gestaffelt ein
  const sections = [
    renderMasthead(data.date),
    renderSchedule(data.events, registry),
    renderAreas(grouped, state),
    renderHabits(data.habits),
    renderAchievements(data.achievements),
  ];
  const reveal = (html: string, index: number): string =>
    state.firstRender
      ? `<div data-reveal style="--d:${index * 90}ms">${html}</div>`
      : `<div>${html}</div>`;

  root.innerHTML = `<main class="page">${sections.map(reveal).join('')}</main>`;
}
