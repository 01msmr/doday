// Tages-Auswahl: filtert die Gesamtdaten auf einen konkreten Tag.
// "Do Day" und "Do Morrow" sind damit dieselbe Ansicht – nur mit anderem Datum.
import type { CalendarEvent, ISODate, Task } from '../models/types';
import { isoDate, localDateOf, shiftDays, startOfWeek } from '../utils/dates';

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
