// Einstiegspunkt: Zustand aufbauen, Nextcloud-Daten laden, Interaktionen verdrahten.
//
// Datenfluss (optimistic UI):
//   Klick → Zustand sofort ändern + neu rendern → Speichern läuft im Hintergrund.
// Die Speicher-Warteschlange (queue) sorgt dafür, dass sich schnelle Klicks
// nicht gegenseitig überholen. Bei einem ETag-Konflikt (extern geändert)
// wird die eigene Änderung einmal erneut angewendet, danach ehrlich neu geladen.
import './style.css';
// Font Awesome (lokal gebündelt, kein CDN): liefert u. a. das Zahnrad
import '@fortawesome/fontawesome-free/css/fontawesome.css';
import '@fortawesome/fontawesome-free/css/solid.css';
import {
  ApiConflictError,
  createEvent,
  createTask,
  loadAchievements,
  loadAgenda,
  loadTagRegistry,
  saveAchievements,
  saveTagRegistry,
  toggleTask,
  updateEvent,
  updateTask,
} from './services/api';
import { normalizeText, parseTags, replaceTagPrefix } from './services/tagService';
import { applyTag, suggestTags, type TagSuggestion } from './services/tagSuggest';
import { monthRange, weekRange } from './services/selectors';
import { InMemoryTagRegistry } from './services/tagRegistry';
import { retagTask, reorderTopAreas } from './services/dragMove';
import { buildEventIcs } from './services/ics';
import { renderApp, type AppState, type ViewId } from './ui/dayView';
import { initDragDrop, type DropInfo } from './ui/dragDrop';
import { isoDate, shiftDays } from './utils/dates';
import type { Habit } from './models/types';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Element #app fehlt in index.html');
}

const state: AppState = {
  data: { events: [], tasks: [], habits: [], achievements: [] },
  registry: new InMemoryTagRegistry(),
  loading: true,
  syncError: null,
  view: 'day',
  periodOffset: 0,
  filterArea: null,
  editing: null,
  editingHabits: false,
  creatingEvent: false,
  creatingTask: false,
  editingTask: null,
  editingEvent: null,
  mobileColumn: 'main',
  collapsed: new Set(),
};

function rerender(): void {
  closeSuggest(); // ein Neuaufbau des DOM würde das Dropdown sonst verwaisen lassen
  renderApp(root!, state);
}

/* ---------- Tag-Vorschläge: Dropdown unter Titel-Feldern ---------- */

let suggestBox: HTMLUListElement | null = null;
let suggestFor: HTMLInputElement | null = null;
let suggestData: TagSuggestion | null = null;
let suggestIndex = 0;

function closeSuggest(): void {
  suggestBox?.remove();
  suggestBox = null;
  suggestFor = null;
  suggestData = null;
  suggestIndex = 0;
}

/** Aktiven Eintrag (Pfeiltasten) optisch markieren */
function markActiveSuggest(): void {
  suggestBox
    ?.querySelectorAll('.tag-suggest-item')
    .forEach((el, i) => el.classList.toggle('active', i === suggestIndex));
}

/**
 * Vorschlagsliste unter dem Eingabefeld auf- oder abbauen. Wird bei jedem
 * Tastendruck aufgerufen – jedes weitere Zeichen filtert die Treffer.
 * Die Knoten entstehen per createElement/textContent, nicht als HTML-String:
 * so können Bereichsnamen nichts einschleusen.
 */
function renderSuggest(input: HTMLInputElement): void {
  const caret = input.selectionStart ?? input.value.length;
  const paths = state.registry.all().map((entry) => entry.path);
  const suggestion = suggestTags(paths, input.value.slice(0, caret));
  if (!suggestion) {
    closeSuggest();
    return;
  }
  if (!suggestBox || suggestFor !== input) {
    closeSuggest();
    suggestBox = document.createElement('ul');
    suggestBox.className = 'tag-suggest';
    input.insertAdjacentElement('afterend', suggestBox);
    suggestFor = input;
  }
  suggestData = suggestion;
  suggestIndex = 0;
  suggestBox.replaceChildren(
    ...suggestion.matches.map((match, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `tag-suggest-item${i === 0 ? ' active' : ''}`;
      item.dataset.suggestIndex = String(i);
      // "›" signalisiert: hier geht es eine Ebene tiefer (vervollständigt bis ".")
      item.textContent = `#${match.value}${match.hasChildren ? ' ›' : ''}`;
      const li = document.createElement('li');
      li.append(item);
      return li;
    }),
  );
}

/** Gewählten Vorschlag ins Feld übernehmen – bei "." gleich weiterfiltern */
function pickSuggest(index: number): void {
  const match = suggestData?.matches[index];
  if (!suggestFor || !suggestData || !match) {
    return;
  }
  const input = suggestFor;
  const caret = input.selectionStart ?? input.value.length;
  const next = applyTag(input.value, caret, suggestData.at, match.value, match.hasChildren);
  input.value = next.text;
  input.setSelectionRange(next.caret, next.caret);
  input.focus();
  renderSuggest(input); // Ebene mit Unterbereichen zeigt sofort die nächste Stufe
}

/* ---------- Laden & Speichern (Nextcloud via Backend) ---------- */

let achievementsEtag: string | null = null;
let tagsEtag: string | null = null;

// Warteschlange: Speichervorgänge laufen nacheinander, nie parallel
let saveChain: Promise<void> = Promise.resolve();
function queue(task: () => Promise<void>): void {
  saveChain = saveChain.then(task).catch(() => {});
}

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

async function reloadAgenda(): Promise<void> {
  const range = agendaRange();
  const requested = `${state.view}:${state.periodOffset}`;
  const agenda = await loadAgenda(range.start, range.end);
  // Verspätete Antwort eines anderen Zeitraums? Dann nicht übernehmen.
  if (`${state.view}:${state.periodOffset}` !== requested) {
    return;
  }
  state.data.events = agenda.events;
  state.data.tasks = agenda.tasks;
}

/**
 * Agenda im Hintergrund neu laden – nach Tab- oder Zeitraumwechsel.
 * Wächter gegen Überholer: Klickt man schnell mehrfach ‹/›, laufen mehrere
 * Anfragen parallel – nur die Antwort zum NOCH aktuellen Zeitraum zählt,
 * verspätete Antworten älterer Zeiträume werden verworfen.
 */
function refreshAgenda(): void {
  const requested = `${state.view}:${state.periodOffset}`;
  const stillCurrent = (): boolean => `${state.view}:${state.periodOffset}` === requested;
  void reloadAgenda()
    .then(() => {
      if (stillCurrent()) {
        rerender();
      }
    })
    .catch(() => {
      if (stillCurrent()) {
        state.syncError = 'Kalender/Aufgaben konnten nicht geladen werden.';
        rerender();
      }
    });
}

async function boot(showLoading = true): Promise<void> {
  if (showLoading) {
    state.loading = true;
    rerender();
  }
  try {
    const [achievements, tags] = await Promise.all([loadAchievements(), loadTagRegistry()]);
    state.data.habits = achievements.data.habits ?? [];
    state.data.achievements = achievements.data.achievements ?? [];
    achievementsEtag = achievements.etag;
    state.registry = new InMemoryTagRegistry(tags.data);
    tagsEtag = tags.etag;
    state.syncError = null;
  } catch {
    state.syncError =
      'Daten konnten nicht geladen werden – läuft das Backend? (npm run dev:server)';
  }
  // Kalender getrennt laden: Fehler hier sollen Habits/Ziele nicht blockieren
  try {
    await reloadAgenda();
  } catch {
    state.syncError = 'Kalender/Aufgaben konnten nicht geladen werden.';
  }
  state.loading = false;
  rerender();
}

async function persistAchievements(): Promise<void> {
  // Stand zum Zeitpunkt des Klicks festhalten – das ist die Absicht des Nutzers
  const payload = { habits: state.data.habits, achievements: state.data.achievements };
  try {
    achievementsEtag = await saveAchievements(payload, achievementsEtag ?? undefined);
    if (state.syncError) {
      state.syncError = null;
      rerender();
    }
  } catch (error) {
    if (error instanceof ApiConflictError) {
      // Konzept: frisches ETag holen und die EIGENE Änderung erneut anwenden
      try {
        const fresh = await loadAchievements();
        achievementsEtag = await saveAchievements(payload, fresh.etag ?? undefined);
        return;
      } catch {
        // zweiter Konflikt in Folge → ehrlich neu laden
      }
      await boot(false);
      state.syncError = 'In der Nextcloud extern geändert – Daten wurden neu geladen.';
    } else {
      state.syncError = 'Speichern fehlgeschlagen – läuft das Backend?';
    }
    rerender();
  }
}

async function persistTags(): Promise<void> {
  const payload = state.registry.toJSON();
  try {
    tagsEtag = await saveTagRegistry(payload, tagsEtag ?? undefined);
  } catch (error) {
    if (error instanceof ApiConflictError) {
      try {
        const fresh = await loadTagRegistry();
        tagsEtag = await saveTagRegistry(payload, fresh.etag ?? undefined);
        return;
      } catch {
        // zweiter Konflikt in Folge → ehrlich neu laden
      }
      await boot(false);
      state.syncError = 'Bereiche wurden extern geändert – Daten wurden neu geladen.';
    } else {
      state.syncError = 'Speichern der Bereiche fehlgeschlagen.';
    }
    rerender();
  }
}

/* ---------- Aktionen ---------- */

/**
 * Bereich umbenennen – Herzstück der Registry-Idee:
 * Nur der Registry-Eintrag ändert sich (alter Name wird Alias), die
 * Objekttexte bleiben unangetastet und werden beim Anzeigen über den
 * Alias dem neuen Namen zugeordnet. Unterbereiche wandern atomar mit.
 */
function commitRename(oldPath: string, newSegment: string): void {
  state.editing = null;

  const oldSegment = oldPath.split('.').pop();
  const isValid = /^[\p{L}\p{M}\d_]+$/u.test(newSegment); // gleiche Zeichen wie im Tag-Muster
  if (!isValid || newSegment === oldSegment) {
    rerender(); // nichts zu tun bzw. ungültig → Abbruch ohne Änderung
    return;
  }

  const parent = oldPath.includes('.') ? oldPath.slice(0, oldPath.lastIndexOf('.')) : '';
  const newPath = parent ? `${parent}.${newSegment}` : newSegment;

  try {
    // Ad-hoc-Tags (nur in Objekten, noch nicht in der Registry) zuerst aufnehmen
    const entry = state.registry.resolve(oldPath) ?? state.registry.register(oldPath);
    state.registry.renameSubtree(entry.uid, newPath);

    // Sprung-Filter und Zuklapp-Zustände folgen der Umbenennung – auch in Unterpfaden
    if (state.filterArea) {
      state.filterArea = replaceTagPrefix(state.filterArea, oldPath, newPath);
    }
    state.collapsed = new Set(
      [...state.collapsed].map((path) => replaceTagPrefix(path, oldPath, newPath)),
    );
    queue(persistTags);
  } catch (error) {
    // z. B. "Der Pfad ist bereits vergeben"
    window.alert(error instanceof Error ? error.message : String(error));
  }
  rerender();
}

/** .ics-Datei zum Download anstoßen – das Gerät bietet den Kalender-Import an */
function downloadIcs(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Tags eines Titels in die Registry aufnehmen (Auto-Aufnahme) + speichern */
function registerTitleTags(title: string): void {
  const tags = parseTags(title).tags;
  for (const tag of tags) {
    state.registry.register(tag);
  }
  if (tags.length > 0) {
    queue(persistTags);
  }
}

/* ---------- Drag & Drop (optimistisch, bestehende Muster) ---------- */

/**
 * Aufgabe per Ziehen in einen anderen Bereich: im rawText den Quell-Tag durch
 * den Ziel-Tag ersetzen (retagTask). Sofort sichtbar, dann im Hintergrund nach
 * Nextcloud. Der rawText bleibt die Wahrheit – title/tags leiten wir neu ab.
 */
function moveTaskToArea(info: DropInfo): void {
  const task = state.data.tasks.find((t) => t.id === info.id);
  if (!task || info.path === undefined) {
    return;
  }
  const resolve = (tag: string): string | undefined => state.registry.resolve(tag)?.path;
  const newRaw = retagTask(task.rawText, info.from ?? '', info.path, resolve);
  if (newRaw === task.rawText) {
    return; // No-Op: Drop auf denselben Bereich
  }

  // Optimistisch: Zustand + Anzeige sofort aktualisieren
  const parsed = parseTags(newRaw);
  task.rawText = newRaw;
  task.title = parsed.cleanText;
  task.tags = parsed.tags;
  registerTitleTags(newRaw); // Ziel-Tag in die Registry aufnehmen (+ queue persistTags)
  rerender();

  // Aufgabe ohne href (sollte real nicht vorkommen): nur lokal, kein Schreiben
  const href = task.href;
  if (!href) {
    return;
  }
  const due = task.due;
  queue(async () => {
    try {
      await updateTask(href, newRaw, due || undefined);
    } catch {
      // Konflikt/Fehler: ehrlichen Stand aus der Nextcloud holen
      try {
        await reloadAgenda();
      } catch {
        /* Agenda nicht erreichbar – Hinweis reicht */
      }
      state.syncError = 'Verschieben konnte nicht gespeichert werden.';
      rerender();
    }
  });
}

/**
 * Top-Level-Bereiche umsortieren: gezogenen Bereich (info.from) vor das Ziel
 * (info.path) einfügen, neue order-Werte vergeben (reorderTopAreas), in die
 * Registry schreiben (setOrder) und persistieren.
 */
function moveArea(info: DropInfo): void {
  const moved = info.from;
  const target = info.path;
  if (!moved || !target || moved === target) {
    return;
  }
  // Nur oberste Ebene – ein Unterbereich als Quelle/Ziel löst kein Reorder aus
  if (moved.includes('.') || target.includes('.')) {
    return;
  }
  // Beide sicher in der Registry (setOrder braucht einen Eintrag)
  state.registry.register(moved);
  state.registry.register(target);
  const orderedPaths = state.registry
    .all()
    .map((entry) => entry.path)
    .filter((path) => !path.includes('.'));
  const updates = reorderTopAreas(orderedPaths, moved, target);
  if (updates.length === 0) {
    return;
  }
  for (const update of updates) {
    state.registry.setOrder(update.path, update.order);
  }
  rerender();
  queue(persistTags);
}

/** Felder des Termin-Formulars auslesen */
function readForm(form: HTMLElement, names: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of names) {
    values[name] =
      form.querySelector<HTMLInputElement>(`[data-field="${name}"]`)?.value.trim() ?? '';
  }
  return values;
}

/** Termin in den Nextcloud-Kalender schreiben */
async function submitEventForm(form: HTMLElement): Promise<void> {
  const { date, start, end } = readForm(form, ['date', 'start', 'end']);
  const title = normalizeText(readForm(form, ['title']).title);
  if (!title || !date || !start || !end) {
    return;
  }
  registerTitleTags(title);
  try {
    const result = await createEvent(
      title,
      new Date(`${date}T${start}:00`).getTime(),
      new Date(`${date}T${end}:00`).getTime(),
    );
    state.data.events.push(result.event);
    state.data.events.sort((a, b) => a.start.localeCompare(b.start));
    state.creatingEvent = false;
    state.syncError = null;
  } catch {
    state.syncError = 'Termin konnte nicht angelegt werden.';
  }
  rerender();
}

/** Bearbeitete Aufgabe in die Nextcloud zurückschreiben (Titel + Fälligkeit) */
async function submitTaskEditForm(form: HTMLElement): Promise<void> {
  const task = state.data.tasks.find((t) => t.id === form.dataset.id);
  const title = normalizeText(readForm(form, ['title']).title);
  if (!task?.href || !title) {
    return;
  }
  const { due } = readForm(form, ['due']);
  registerTitleTags(title);
  try {
    const result = await updateTask(task.href, title, due || undefined);
    Object.assign(task, result.task);
    // Gelöschtes Datum kommt in der Antwort als FEHLENDES Feld an –
    // Object.assign würde das alte stehen lassen, deshalb explizit setzen
    task.due = result.task.due;
    state.editingTask = null;
    state.syncError = null;
  } catch (error) {
    state.syncError =
      error instanceof ApiConflictError
        ? 'Aufgabe wurde extern geändert – bitte neu laden und erneut bearbeiten.'
        : 'Aufgabe konnte nicht gespeichert werden.';
  }
  rerender();
}

/** Bearbeiteten Einzeltermin zurückschreiben (Titel + Datum/Zeiten) */
async function submitEventEditForm(form: HTMLElement): Promise<void> {
  const index = state.data.events.findIndex((e) => e.id === form.dataset.id);
  const event = state.data.events[index];
  const title = normalizeText(readForm(form, ['title']).title);
  const { date, start, end } = readForm(form, ['date', 'start', 'end']);
  if (!event?.href || !title || !date || (!event.allDay && (!start || !end))) {
    return;
  }
  registerTitleTags(title);
  try {
    // Ganztägige bleiben ganztägig (nur Datum), getimte bekommen neue Zeiten
    const times = event.allDay
      ? { date }
      : {
          start: new Date(`${date}T${start}:00`).getTime(),
          end: new Date(`${date}T${end}:00`).getTime(),
        };
    const result = await updateEvent(event.href, title, times);
    state.data.events[index] = result.event;
    state.data.events.sort((a, b) => a.start.localeCompare(b.start));
    state.editingEvent = null;
    state.syncError = null;
  } catch (error) {
    state.syncError =
      error instanceof ApiConflictError
        ? 'Termin wurde extern geändert – bitte neu laden und erneut bearbeiten.'
        : 'Termin konnte nicht gespeichert werden.';
  }
  rerender();
}

/** Aufgabe in Nextcloud Tasks anlegen */
async function submitTaskForm(form: HTMLElement): Promise<void> {
  const { due } = readForm(form, ['due']);
  const title = normalizeText(readForm(form, ['title']).title);
  if (!title) {
    return;
  }
  registerTitleTags(title);
  try {
    const result = await createTask(title, due || undefined);
    state.data.tasks.push(result.task);
    state.creatingTask = false;
    state.syncError = null;
  } catch {
    state.syncError = 'Aufgabe konnte nicht angelegt werden.';
  }
  rerender();
}

root.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;

  // Klick ins Umbenennen-Feld darf den Bereich nicht zuklappen
  if (target.closest('input.area-rename')) {
    event.preventDefault();
    return;
  }

  const trigger = target.closest<HTMLElement>('[data-action]');
  if (!trigger) {
    return;
  }
  const { action, id, view, path } = trigger.dataset;

  if (action === 'switch-view' && view && view !== state.view) {
    state.view = view as ViewId;
    state.periodOffset = 0; // Tab-Wechsel landet immer im Jetzt
    rerender(); // sofort zeigen – die frischen Daten folgen gleich
    refreshAgenda(); // Zeitfenster hat sich geändert → passende Daten holen
  }

  if (action === 'switch-period' && trigger.dataset.dir) {
    // ‹ = -1 (zurück), › = +1 (Richtung heute) – nie über das Jetzt hinaus
    const next = Math.min(0, state.periodOffset + Number(trigger.dataset.dir));
    if (next !== state.periodOffset) {
      state.periodOffset = next;
      rerender();
      refreshAgenda();
    }
  }

  if (action === 'filter-area' && path) {
    // "Sprung in den Bereich": nur dieser Bereich inkl. Unterbereiche.
    // preventDefault, damit der Klick das <details> nicht zuklappt.
    event.preventDefault();
    state.filterArea = state.filterArea === path ? null : path; // zweiter Klick hebt auf
    rerender();
  }

  if (action === 'edit-area' && path) {
    event.preventDefault();
    state.editing = path;
    rerender();
    const input = root!.querySelector<HTMLInputElement>('input.area-rename');
    input?.focus();
    input?.select();
  }

  if (action === 'clear-filter') {
    state.filterArea = null;
    rerender();
  }

  if (action === 'toggle-habit-editor') {
    state.editingHabits = !state.editingHabits;
    rerender();
  }

  if (action === 'toggle-event-form') {
    state.creatingEvent = !state.creatingEvent;
    rerender();
    root!.querySelector<HTMLInputElement>('[data-event-form] [data-field="title"]')?.focus();
  }

  if (action === 'toggle-task-form') {
    state.creatingTask = !state.creatingTask;
    rerender();
    root!.querySelector<HTMLInputElement>('[data-task-form] [data-field="title"]')?.focus();
  }

  if (action === 'edit-task' && id) {
    // Stift öffnet das Inline-Formular – zweiter Klick schließt es wieder
    state.editingTask = state.editingTask === id ? null : id;
    state.editingEvent = null;
    rerender();
    root!.querySelector<HTMLInputElement>('[data-task-edit-form] [data-field="title"]')?.focus();
  }

  if (action === 'edit-event' && id) {
    state.editingEvent = state.editingEvent === id ? null : id;
    state.editingTask = null;
    rerender();
    root!.querySelector<HTMLInputElement>('[data-event-edit-form] [data-field="title"]')?.focus();
  }

  if (action === 'cancel-edit') {
    state.editingTask = null;
    state.editingEvent = null;
    rerender();
  }

  if (action === 'event-ics') {
    // Alternative zum NC-Speichern: .ics herunterladen → Geräte-Kalender importiert
    const form = trigger.closest<HTMLElement>('[data-event-form]');
    if (form) {
      const { date, start, end } = readForm(form, ['date', 'start', 'end']);
      const title = normalizeText(readForm(form, ['title']).title);
      if (title && date && start && end) {
        registerTitleTags(title);
        downloadIcs(buildEventIcs({ title, date, start, end }), `termin-${date}.ics`);
        state.creatingEvent = false;
        rerender();
      }
    }
  }

  if (action === 'switch-column') {
    state.mobileColumn = state.mobileColumn === 'main' ? 'side' : 'main';
    rerender();
  }

  if (action === 'add-habit') {
    const habit: Habit = {
      id: `h-${crypto.randomUUID()}`,
      title: 'Neue Gewohnheit',
      schedule: 'daily',
      log: [],
      color: '#8fae87',
    };
    state.data.habits.push(habit);
    rerender();
    // Titel direkt zum Überschreiben markieren
    const titleInputs = root!.querySelectorAll<HTMLInputElement>(
      '.habit-editor input[data-edit="title"]',
    );
    const lastInput = titleInputs[titleInputs.length - 1];
    lastInput?.focus();
    lastInput?.select();
    queue(persistAchievements);
  }

  if (action === 'delete-habit' && id) {
    const habit = state.data.habits.find((h) => h.id === id);
    if (habit && window.confirm(`Gewohnheit "${habit.title}" löschen?`)) {
      state.data.habits = state.data.habits.filter((h) => h.id !== id);
      rerender();
      queue(persistAchievements);
    }
  }

  if (action === 'toggle-task') {
    const task = state.data.tasks.find((t) => t.id === id);
    if (task) {
      task.completed = !task.completed;
      rerender();
      // In Nextcloud Tasks zurückschreiben (VTODO via CalDAV)
      const href = task.href;
      const desired = task.completed;
      if (href) {
        queue(async () => {
          try {
            await toggleTask(href, desired);
          } catch {
            // Konflikt oder Fehler: ehrlichen Stand aus der Nextcloud holen
            try {
              await reloadAgenda();
            } catch {
              /* Agenda nicht erreichbar – Hinweis reicht */
            }
            state.syncError = 'Abhaken konnte nicht gespeichert werden.';
            rerender();
          }
        });
      }
    }
  }

  if (action === 'toggle-habit') {
    const habit = state.data.habits.find((h) => h.id === id);
    if (habit) {
      const today = isoDate();
      const wasDone = habit.log.includes(today);
      // Heute abhaken bzw. das Abhaken zurücknehmen
      habit.log = wasDone
        ? habit.log.filter((day) => day !== today)
        : [...habit.log, today];
      // Verknüpfte Fortschrittsbalken reagieren mit: Zahl und Füllstand
      for (const achievement of state.data.achievements) {
        if (achievement.habitId === habit.id) {
          const delta = wasDone ? -1 : 1;
          achievement.progress = Math.min(
            achievement.target,
            Math.max(0, achievement.progress + delta),
          );
        }
      }
      rerender();
      queue(persistAchievements);
    }
  }
});

// Formulare: Termin → Nextcloud-Kalender, Aufgabe → Nextcloud Tasks
root.addEventListener('submit', (event) => {
  const form = event.target as HTMLElement;
  if (form.matches('[data-event-form]')) {
    event.preventDefault();
    void submitEventForm(form);
  }
  if (form.matches('[data-task-form]')) {
    event.preventDefault();
    void submitTaskForm(form);
  }
  if (form.matches('[data-task-edit-form]')) {
    event.preventDefault();
    void submitTaskEditForm(form);
  }
  if (form.matches('[data-event-edit-form]')) {
    event.preventDefault();
    void submitEventEditForm(form);
  }
});

// Habit-Editor: Änderungen an Farbe/Name/Zeitraum/Ziel übernehmen.
// "change" feuert erst beim Verlassen des Felds bzw. nach der Auswahl –
// so zerstört das Re-Rendering nicht den Fokus beim Tippen.
root.addEventListener('change', (event) => {
  const field = event.target as HTMLElement;
  const { edit, id } = field.dataset;
  if (!edit) {
    return;
  }
  const habit = state.data.habits.find((h) => h.id === id);
  if (!habit) {
    return;
  }
  if (edit === 'color' && field instanceof HTMLInputElement) {
    habit.color = field.value;
  }
  if (edit === 'title' && field instanceof HTMLInputElement && field.value.trim()) {
    habit.title = field.value.trim();
  }
  if (edit === 'schedule' && field instanceof HTMLSelectElement) {
    habit.schedule = field.value as 'daily' | 'weekly';
  }
  if (edit === 'target' && field instanceof HTMLInputElement) {
    habit.target = field.value ? Number(field.value) : undefined;
  }
  rerender();
  queue(persistAchievements);
});

// Umbenennen: Enter speichert, Escape bricht ab
root.addEventListener('keydown', (event) => {
  const input = (event.target as HTMLElement).closest?.('input.area-rename');
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  if (event.key === 'Escape') {
    state.editing = null;
    rerender();
  }
  if (event.key === 'Enter' && input.dataset.path) {
    commitRename(input.dataset.path, input.value.trim());
  }
});

// Fokus verlassen ohne Enter = Abbruch (blur blubbert nicht → Capture-Phase)
root.addEventListener(
  'blur',
  (event) => {
    const input = event.target as HTMLElement;
    if (input instanceof HTMLInputElement && input.classList.contains('area-rename')) {
      if (state.editing === input.dataset.path) {
        state.editing = null;
        rerender();
      }
    }
  },
  true,
);

// Auf-/Zugeklappt-Zustand der Bereiche merken, damit er Re-Renderings übersteht.
// Das toggle-Event blubbert nicht nach oben – deshalb die Capture-Phase (true).
root.addEventListener(
  'toggle',
  (event) => {
    const details = event.target as HTMLDetailsElement;
    const area = details.dataset.area;
    if (!area) {
      return;
    }
    if (details.open) {
      state.collapsed.delete(area);
    } else {
      state.collapsed.add(area);
    }
  },
  true,
);

// Tag-Vorschläge: jedes Zeichen in einem Titel-Feld aktualisiert das Dropdown
root.addEventListener('input', (event) => {
  const input = event.target as HTMLElement;
  if (input instanceof HTMLInputElement && input.dataset.field === 'title') {
    renderSuggest(input);
  }
});

// Tastatur im offenen Dropdown: ↑/↓ wählt, Enter übernimmt (statt Formular
// abzuschicken!), Escape schließt nur die Liste
root.addEventListener('keydown', (event) => {
  if (!suggestData || event.target !== suggestFor) {
    return;
  }
  const count = suggestData.matches.length;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    suggestIndex = (suggestIndex + (event.key === 'ArrowDown' ? 1 : count - 1)) % count;
    markActiveSuggest();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    pickSuggest(suggestIndex);
  } else if (event.key === 'Escape') {
    closeSuggest();
  }
});

// Klick/Tipp auf einen Vorschlag – mousedown statt click, damit das
// Eingabefeld den Fokus behält (blur würde die Liste vorher schließen)
root.addEventListener('mousedown', (event) => {
  const item = (event.target as HTMLElement).closest<HTMLElement>('[data-suggest-index]');
  if (item) {
    event.preventDefault();
    pickSuggest(Number(item.dataset.suggestIndex));
  }
});

// Feld verlassen = Liste schließen (Capture-Phase: blur blubbert nicht)
root.addEventListener(
  'focusout',
  (event) => {
    if (event.target === suggestFor) {
      closeSuggest();
    }
  },
  true,
);

// Drag & Drop: Greifer/Ziele erkennt die Engine selbst, wir verarbeiten nur das Ergebnis
initDragDrop(root, (info) => {
  if (info.dragKind === 'task') {
    moveTaskToArea(info);
  } else if (info.dragKind === 'area') {
    moveArea(info);
  }
});

rerender(); // Lade-Ansicht sofort zeigen …
void boot(); // … und die echten Daten holen
