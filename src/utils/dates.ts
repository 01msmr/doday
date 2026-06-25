// Datums-Helfer. Wichtig: bewusst LOKALE Zeitzone, nicht UTC –
// new Date().toISOString() würde nachts um 00:30 noch den Vortag liefern.
import type { ISODate } from '../models/types';
import { getLang } from '../i18n';

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

/** Stunde + zweistellige Minute eines Zeitstempels in LOKALER Zeit ermitteln. */
function localHourMinute(isoDateTime: string): { hour: number; minute: string } {
  if (hasZone(isoDateTime)) {
    const local = new Date(isoDateTime);
    return { hour: local.getHours(), minute: String(local.getMinutes()).padStart(2, '0') };
  }
  const [hour, minute] = isoDateTime.slice(11, 16).split(':');
  return { hour: Number(hour), minute: minute ?? '00' };
}

/**
 * ANZEIGE-Uhrzeit, real-weltlich nach Sprache:
 *   Deutsch  → 24h ohne führende Null bei der Stunde, z. B. "9:00", "13:05".
 *   Englisch → 12h mit AM/PM (US), z. B. "9:00 AM", "1:05 PM".
 * UTC-Zeitstempel aus CalDAV werden in die lokale Uhrzeit umgerechnet.
 */
export function timeOf(isoDateTime: string): string {
  const { hour, minute } = localHourMinute(isoDateTime);
  if (getLang() === 'en') {
    const period = hour < 12 ? 'AM' : 'PM';
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}:${minute} ${period}`;
  }
  return `${hour}:${minute}`;
}

/** Uhrzeit für <input type="time">: IMMER 24h, zweistellig ("09:00") – sprachunabhängig. */
export function timeInputValue(isoDateTime: string): string {
  const { hour, minute } = localHourMinute(isoDateTime);
  return `${String(hour).padStart(2, '0')}:${minute}`;
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
