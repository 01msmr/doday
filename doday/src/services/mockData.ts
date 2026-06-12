// MockDataService: liefert realistische Beispieldaten – relativ zu HEUTE,
// damit die Tagesansicht immer gefüllt ist. In Phase 2 wird dieser Service
// durch WebDAV (achievements.json) und CalDAV (Tasks/Kalender) ersetzt;
// die UI merkt davon nichts, weil sie nur die Datenmodelle kennt.
import type { Achievement, CalendarEvent, Habit, ISODate, Task } from '../models/types';
import { parseTags } from './tagService';
import { InMemoryTagRegistry } from './tagRegistry';
import { isoDate, shiftDays } from '../utils/dates';

/** Alle App-Daten (heute + morgen) – die Ansichten filtern sich ihren Tag heraus */
export interface DayData {
  date: Date;
  events: CalendarEvent[];
  tasks: Task[];
  habits: Habit[];
  achievements: Achievement[];
}

/** n Tage vor heute als ISO-Datum */
function daysAgo(n: number): ISODate {
  return isoDate(shiftDays(new Date(), -n));
}

/** Uhrzeit als ISO-Zeitstempel, z. B. at("09:30") → heute, at("09:30", 1) → morgen */
function at(time: string, dayOffset = 0): string {
  return `${isoDate(shiftDays(new Date(), dayOffset))}T${time}:00`;
}

/** Aufgabe aus rawText bauen – title und tags werden geparst, wie später bei CalDAV */
function makeTask(
  id: string,
  rawText: string,
  opts: { completed?: boolean; due?: ISODate } = {},
): Task {
  const { cleanText, tags } = parseTags(rawText);
  return {
    id,
    rawText,
    title: cleanText,
    tags,
    completed: opts.completed ?? false,
    due: opts.due ?? isoDate(new Date()),
  };
}

/** Termin aus rawText bauen (dayOffset 0 = heute, 1 = morgen) */
function makeEvent(
  id: string,
  rawText: string,
  start: string,
  end: string,
  dayOffset = 0,
): CalendarEvent {
  const { cleanText, tags } = parseTags(rawText);
  return { id, rawText, title: cleanText, tags, start: at(start, dayOffset), end: at(end, dayOffset) };
}

/** Beispieldaten für die heutige Tagesansicht */
export function loadMockData(): DayData {
  return {
    date: new Date(),

    events: [
      // heute
      makeEvent('e1', 'Standup #Arbeit.Projekte', '09:00', '09:15'),
      makeEvent('e2', 'Zahnarzt #Gesundheit', '11:30', '12:15'),
      makeEvent('e3', 'Abendessen mit Anna', '19:00', '21:00'),
      // morgen (für die Ansicht "Do Morrow")
      makeEvent('e4', 'Physiotherapie #Gesundheit', '10:00', '10:45', 1),
    ],

    tasks: [
      // heute
      makeTask('t1', 'Keller entrümpeln #Zuhause.Aufräumen'),
      makeTask('t2', 'Garage sortieren #Zuhause.Aufräumen'),
      makeTask('t3', 'Fenster putzen #Zuhause'),
      makeTask('t4', 'Müll rausbringen #Zuhause', { completed: true }),
      makeTask('t5', 'Angebot schreiben #Arbeit'),
      makeTask('t6', 'Wochenbericht vorbereiten #Arbeit.Projekte'),
      makeTask('t7', 'Buch zurückgeben'),
      // morgen
      makeTask('t8', 'Wocheneinkauf planen #Zuhause', { due: daysAgo(-1) }),
      makeTask('t9', 'Sprint-Review vorbereiten #Arbeit.Projekte', { due: daysAgo(-1) }),
    ],

    habits: [
      {
        id: 'h1',
        title: 'Bewegung',
        schedule: 'daily',
        log: [daysAgo(2), daysAgo(1), daysAgo(0)],
        color: '#7fa3b8',
      },
      { id: 'h2', title: 'Journal', schedule: 'daily', log: [daysAgo(1)], color: '#b8a37f' },
      {
        id: 'h3',
        title: 'Lesen',
        schedule: 'weekly',
        log: [daysAgo(3), daysAgo(1)],
        color: '#a38db8',
        target: 3,
      },
    ],

    achievements: [
      // Farbe UND Fortschritt hängen an der zugehörigen Gewohnheit:
      // Habit abhaken → Balken und Zahl bewegen sich mit
      {
        id: 'a1',
        title: '30 Tage Journal',
        target: 30,
        progress: 17,
        completedAt: null,
        color: '#b8a37f',
        habitId: 'h2',
      },
      {
        id: 'a2',
        title: '100 km gehen',
        target: 100,
        progress: 64,
        completedAt: null,
        color: '#7fa3b8',
        habitId: 'h1',
      },
    ],
  };
}

/**
 * Registry mit Farben vorbefüllen – so sieht man in der UI bereits,
 * wie Bereichs-Metadaten aus tags.json wirken werden.
 */
export function createMockRegistry(): InMemoryTagRegistry {
  return new InMemoryTagRegistry({
    version: 1,
    updatedAt: new Date().toISOString(),
    tags: [
      { uid: 't-zuhause', path: 'Zuhause', aliases: [], color: '#8fae87', icon: 'home', order: 1, archived: false },
      { uid: 't-aufraeumen', path: 'Zuhause.Aufräumen', aliases: ['Zuhause.Aufraeumen'], order: 2, archived: false },
      { uid: 't-arbeit', path: 'Arbeit', aliases: [], color: '#8da3c4', icon: 'briefcase', order: 3, archived: false },
      { uid: 't-projekte', path: 'Arbeit.Projekte', aliases: [], order: 4, archived: false },
      { uid: 't-gesundheit', path: 'Gesundheit', aliases: [], color: '#c49a8d', icon: 'heart', order: 5, archived: false },
    ],
  });
}
