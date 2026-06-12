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

/** Trägt der Zeitstempel eine Zeitzone (Z oder ±hh:mm)? Dann via Date umrechnen. */
function hasZone(isoDateTime: string): boolean {
  return /Z$|[+-]\d{2}:?\d{2}$/.test(isoDateTime);
}

/**
 * Uhrzeit "HH:MM" – lokale Zeitstempel werden geschnitten,
 * UTC-Zeitstempel aus CalDAV in die lokale Uhrzeit umgerechnet.
 */
export function timeOf(isoDateTime: string): string {
  if (hasZone(isoDateTime)) {
    return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(
      new Date(isoDateTime),
    );
  }
  return isoDateTime.slice(11, 16);
}

/** Lokales Datum ("YYYY-MM-DD") eines Zeitstempels – UTC wird umgerechnet */
export function localDateOf(isoDateTime: string): ISODate {
  if (hasZone(isoDateTime)) {
    return isoDate(new Date(isoDateTime));
  }
  return isoDateTime.slice(0, 10);
}

/** Neues Datum, um n Tage verschoben (negativ = zurück). Das Original bleibt unverändert. */
export function shiftDays(base: Date, days: number): Date {
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result;
}

/** Montag der Woche, in der das Datum liegt (deutsche Wochenlogik: Mo–So) */
export function startOfWeek(date: Date): Date {
  // getDay(): So=0, Mo=1 … – wir rechnen um auf Mo=0 … So=6
  const offset = (date.getDay() + 6) % 7;
  return shiftDays(date, -offset);
}

/**
 * ISO-Kalenderwoche (KW). Regel: Der DONNERSTAG einer Woche bestimmt,
 * zu welchem Jahr und welcher Nummer sie gehört (der 4. Januar liegt
 * dadurch immer in KW 1).
 */
export function isoWeek(date: Date): number {
  const thursday = shiftDays(startOfWeek(date), 3);
  const firstThursday = shiftDays(startOfWeek(new Date(thursday.getFullYear(), 0, 4)), 3);
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}
