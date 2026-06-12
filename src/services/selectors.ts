// Tages-Auswahl: filtert die Gesamtdaten auf einen konkreten Tag.
// "Do Day" und "Do Morrow" sind damit dieselbe Ansicht – nur mit anderem Datum.
import type { CalendarEvent, ISODate, Task } from '../models/types';
import { localDateOf } from '../utils/dates';

/**
 * Aufgaben, die an diesem Tag fällig sind.
 * Aufgaben OHNE Fälligkeit gelten als "heute dran" – sie erscheinen nur,
 * wenn der angefragte Tag der heutige ist (nicht bei Do Morrow).
 */
export function tasksDueOn(tasks: Task[], date: ISODate, today: ISODate): Task[] {
  return tasks.filter((task) => (task.due ? task.due === date : date === today));
}

/** Termine, die an diesem LOKALEN Tag beginnen (UTC wird umgerechnet) – sortiert */
export function eventsOn(events: CalendarEvent[], date: ISODate): CalendarEvent[] {
  return events
    .filter((event) => localDateOf(event.start) === date)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Tags durch ihren kanonischen Registry-Pfad ersetzen.
 * Trägt ein Objekt noch "#Zuhause", der Bereich heißt aber inzwischen "Home",
 * liefert der Resolver über den Alias den neuen Pfad – die Anzeige stimmt,
 * ohne dass der Objekttext (rawText) angefasst werden muss.
 */
export function withCanonicalTags<T extends { tags: string[] }>(
  items: T[],
  resolve: (tag: string) => string | undefined,
): T[] {
  return items.map((item) => ({
    ...item,
    tags: item.tags.map((tag) => resolve(tag) ?? tag),
  }));
}

/**
 * Auf einen Bereich filtern – Unterbereiche zählen mit ("Sprung in den Bereich").
 * Der Punkt im Vergleich verhindert Präfix-Verwechslungen (Zuhause ≠ Zuhause2).
 */
export function filterByArea<T extends { tags: string[] }>(
  items: T[],
  area: string | null,
): T[] {
  if (!area) {
    return items;
  }
  return items.filter((item) =>
    item.tags.some((tag) => tag === area || tag.startsWith(`${area}.`)),
  );
}
