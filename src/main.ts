// Einstiegspunkt: Zustand aufbauen, Nextcloud-Daten laden, Interaktionen verdrahten.
//
// Datenfluss (optimistic UI):
//   Klick → Zustand sofort ändern + neu rendern → Speichern läuft im Hintergrund.
// Die Speicher-Warteschlange (queue) sorgt dafür, dass sich schnelle Klicks
// nicht gegenseitig überholen. Bei einem ETag-Konflikt (extern geändert)
// wird neu geladen.
import './style.css';
// Font Awesome (lokal gebündelt, kein CDN): liefert u. a. das Zahnrad
import '@fortawesome/fontawesome-free/css/fontawesome.css';
import '@fortawesome/fontawesome-free/css/solid.css';
import {
  ApiConflictError,
  loadAchievements,
  loadTagRegistry,
  saveAchievements,
  saveTagRegistry,
} from './services/api';
import { normalizeText, parseTags, replaceTagPrefix } from './services/tagService';
import { InMemoryTagRegistry } from './services/tagRegistry';
import { buildEventIcs } from './services/ics';
import { renderApp, type AppState, type ViewId } from './ui/dayView';
import { isoDate } from './utils/dates';
import type { Habit } from './models/types';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Element #app fehlt in index.html');
}

const state: AppState = {
  // Aufgaben/Termine bleiben leer, bis Phase 3 sie aus CalDAV holt
  data: { events: [], tasks: [], habits: [], achievements: [] },
  registry: new InMemoryTagRegistry(),
  loading: true,
  syncError: null,
  view: 'day',
  filterArea: null,
  editing: null,
  editingHabits: false,
  creatingEvent: false,
  mobileColumn: 'main',
  collapsed: new Set(),
};

function rerender(): void {
  renderApp(root!, state);
}

/* ---------- Laden & Speichern (Nextcloud via Backend) ---------- */

let achievementsEtag: string | null = null;
let tagsEtag: string | null = null;

// Warteschlange: Speichervorgänge laufen nacheinander, nie parallel
let saveChain: Promise<void> = Promise.resolve();
function queue(task: () => Promise<void>): void {
  saveChain = saveChain.then(task).catch(() => {});
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
        if (state.syncError) {
          state.syncError = null;
          rerender();
        }
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
      // frisches ETag holen, eigene Änderung erneut anwenden
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
    rerender();
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
    root!.querySelector<HTMLInputElement>('.event-form [data-field="title"]')?.focus();
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
      // Persistenz folgt in Phase 3 (CalDAV)
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

// Termin-Formular: abschicken erzeugt die .ics für den Geräte-Kalender
root.addEventListener('submit', (event) => {
  const form = event.target as HTMLElement;
  if (!form.matches('[data-event-form]')) {
    return;
  }
  event.preventDefault();
  const field = (name: string): string =>
    form.querySelector<HTMLInputElement>(`[data-field="${name}"]`)?.value.trim() ?? '';

  // Kanonische Form: Tags wandern ans Ende
  const title = normalizeText(field('title'));
  const date = field('date');
  const start = field('start');
  const end = field('end');
  if (!title || !date || !start || !end) {
    return;
  }

  // Unbekannte Tags automatisch in die Registry aufnehmen (Konzept: Auto-Aufnahme)
  const tags = parseTags(title).tags;
  for (const tag of tags) {
    state.registry.register(tag);
  }
  if (tags.length > 0) {
    queue(persistTags);
  }

  downloadIcs(buildEventIcs({ title, date, start, end }), `termin-${date}.ics`);
  state.creatingEvent = false;
  rerender();
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

rerender(); // Lade-Ansicht sofort zeigen …
void boot(); // … und die echten Daten holen
