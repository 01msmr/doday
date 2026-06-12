// MockDataService: liefert realistische Beispieldaten – relativ zu HEUTE,
// damit die Tagesansicht immer gefüllt ist. In Phase 2 wird dieser Service
// durch WebDAV (achievements.json) und CalDAV (Tasks/Kalender) ersetzt;
// die UI merkt davon nichts, weil sie nur die Datenmodelle kennt.
import type { Achievement, CalendarEvent, Habit, ISODate, Task } from '../models/types';
import { parseTags } from './tagService';
import { InMemoryTagRegistry } from './tagRegistry';
import { isoDate } from '../utils/dates';

/** Alles, was die Tagesansicht braucht */
export interface DayData {
  date: Date;
  events: CalendarEvent[];
  tasks: Task[];
  habits: Habit[];
  achievements: Achievement[];
}

/** n Tage vor heute als ISO-Datum */
function daysAgo(n: number): ISODate {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return isoDate(date);
}

/** Uhrzeit heute als ISO-Zeitstempel, z. B. at("09:30") → "2026-06-12T09:30:00" */
function at(time: string): string {
  return `${isoDate(new Date())}T${time}:00`;
}

/** Aufgabe aus rawText bauen – title und tags werden geparst, wie später bei CalDAV */
function makeTask(id: string, rawText: string, completed = false): Task {
  const { cleanText, tags } = parseTags(rawText);
  return { id, rawText, title: cleanText, tags, completed, due: isoDate(new Date()) };
}

/** Termin aus rawText bauen */
function makeEvent(id: string, rawText: string, start: string, end: string): CalendarEvent {
  const { cleanText, tags } = parseTags(rawText);
  return { id, rawText, title: cleanText, tags, start: at(start), end: at(end) };
}

/** Beispieldaten für die heutige Tagesansicht */
export function loadMockData(): DayData {
  return {
    date: new Date(),

    events: [
      makeEvent('e1', 'Standup #Arbeit.Projekte', '09:00', '09:15'),
      makeEvent('e2', 'Zahnarzt #Gesundheit', '11:30', '12:15'),
      makeEvent('e3', 'Abendessen mit Anna', '19:00', '21:00'),
    ],

    tasks: [
      makeTask('t1', 'Keller entrümpeln #Zuhause.Aufräumen'),
      makeTask('t2', 'Garage sortieren #Zuhause.Aufräumen'),
      makeTask('t3', 'Fenster putzen #Zuhause'),
      makeTask('t4', 'Müll rausbringen #Zuhause', true),
      makeTask('t5', 'Angebot schreiben #Arbeit'),
      makeTask('t6', 'Wochenbericht vorbereiten #Arbeit.Projekte'),
      makeTask('t7', 'Buch zurückgeben'),
    ],

    habits: [
      { id: 'h1', title: 'Bewegung', schedule: 'daily', log: [daysAgo(2), daysAgo(1), daysAgo(0)] },
      { id: 'h2', title: 'Journal', schedule: 'daily', log: [daysAgo(1)] },
      { id: 'h3', title: 'Lesen', schedule: 'daily', log: [daysAgo(3), daysAgo(1)] },
    ],

    achievements: [
      { id: 'a1', title: '30 Tage Journal', target: 30, progress: 17, completedAt: null },
      { id: 'a2', title: '100 km gehen', target: 100, progress: 64, completedAt: null },
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
