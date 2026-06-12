// Datums-Helfer. Wichtig: bewusst LOKALE Zeitzone, nicht UTC –
// new Date().toISOString() würde nachts um 00:30 noch den Vortag liefern.
import type { ISODate } from '../models/types';

/** Datum als ISO-String in lokaler Zeit, z. B. "2026-06-12" */
export function isoDate(date: Date = new Date()): ISODate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Uhrzeit "HH:MM" aus einem ISO-Zeitstempel wie "2026-06-12T09:30:00" */
export function timeOf(isoDateTime: string): string {
  return isoDateTime.slice(11, 16);
}

/** Neues Datum, um n Tage verschoben (negativ = zurück). Das Original bleibt unverändert. */
export function shiftDays(base: Date, days: number): Date {
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result;
}
