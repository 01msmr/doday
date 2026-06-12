// Zentrale Datenmodelle der App.
// Wichtig: Diese Formen entsprechen dem, was später in Nextcloud liegt –
// Habit/Achievement spiegeln achievements.json, Task/CalendarEvent kommen aus CalDAV.

/** ISO-Datum ohne Uhrzeit, z. B. "2026-06-12" */
export type ISODate = string;

/** ISO-Zeitstempel, z. B. "2026-06-12T09:30:00" */
export type ISODateTime = string;

/** Gewohnheit: wird wiederholt ausgeführt, jeder erledigte Tag landet im Log. */
export interface Habit {
  id: string;
  title: string;
  /** Zeitraum, in dem die Gewohnheit fällig ist */
  schedule: 'daily' | 'weekly';
  /** Liste der Tage, an denen die Gewohnheit erledigt wurde */
  log: ISODate[];
  /** Eigene Anzeigefarbe des Habit-Kreises, z. B. "#7fa3b8" */
  color?: string;
  /** Optionales Ziel: Wiederholungen pro Zeitraum (z. B. 3× pro Woche) */
  target?: number;
}

/** Ziel mit messbarem Fortschritt, z. B. "30 Tage Journal". */
export interface Achievement {
  id: string;
  title: string;
  /** Zielwert, z. B. 30 */
  target: number;
  /** Aktueller Stand, z. B. 17 */
  progress: number;
  /** Zeitpunkt des Abschlusses – null solange offen */
  completedAt: ISODateTime | null;
  /** Balkenfarbe – sinnvollerweise die Farbe der zugehörigen Gewohnheit */
  color?: string;
  /** Verknüpfte Gewohnheit: ihr Abhaken bewegt diesen Fortschritt mit */
  habitId?: string;
}

/** Aufgabe (später: Nextcloud Tasks / VTODO). */
export interface Task {
  id: string;
  /**
   * Originaltext, wie er in Nextcloud gespeichert ist – inklusive #Tags.
   * Beispiel: "Keller entrümpeln #Zuhause.Aufräumen"
   */
  rawText: string;
  /** Anzeigetext ohne Tags (aus rawText abgeleitet) */
  title: string;
  /** Tag-Pfade ohne "#", z. B. ["Zuhause.Aufräumen"] */
  tags: string[];
  completed: boolean;
  /** Fälligkeitsdatum, falls gesetzt */
  due?: ISODate;
}

/** Termin (später: Nextcloud Kalender / VEVENT, erstmal nur lesend). */
export interface CalendarEvent {
  id: string;
  /** Originaltext inklusive #Tags, z. B. "Zahnarzt #Gesundheit" */
  rawText: string;
  /** Anzeigetext ohne Tags */
  title: string;
  tags: string[];
  start: ISODateTime;
  end: ISODateTime;
  allDay?: boolean;
}

/**
 * Eintrag in der Tag-Registry (später: /Notes/DoDay/tags.json via WebDAV).
 * Die UID erscheint NIE im Objekttext – sie gibt dem Bereich eine stabile
 * Identität, damit Umbenennen/Farben/Sortierung jede Schreibweise überleben.
 */
export interface TagEntry {
  uid: string;
  /** Aktueller Pfad in Punkt-Notation, z. B. "Zuhause.Aufräumen" */
  path: string;
  /** Frühere Namen und alternative Schreibweisen, z. B. ["Zuhause.Aufraeumen"] */
  aliases: string[];
  /** Anzeigefarbe des Bereichs, z. B. "#6b8e6b" */
  color?: string;
  /** Icon-Name, z. B. "home" */
  icon?: string;
  /** Sortierreihenfolge in der UI */
  order: number;
  /** Archiviert = in der UI ausgeblendet, aber Historie bleibt */
  archived: boolean;
}

/** Inhalt der Datei achievements.json (WebDAV) – Habits + Ziele zusammen */
export interface AchievementsFile {
  habits: Habit[];
  achievements: Achievement[];
}

/** Alle Daten der App – Aufgaben/Termine kommen ab Phase 3 aus CalDAV */
export interface AppData {
  events: CalendarEvent[];
  tasks: Task[];
  habits: Habit[];
  achievements: Achievement[];
}

/** Gesamtinhalt der Registry-Datei tags.json. */
export interface TagRegistryData {
  /** Wird bei jeder Änderung erhöht – Basis für Konflikt-Erkennung */
  version: number;
  updatedAt: ISODateTime;
  tags: TagEntry[];
}
