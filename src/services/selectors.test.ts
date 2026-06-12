// Tests zuerst (TDD): Tages-Auswahl – welche Aufgaben/Termine gehören zu einem Datum?
// Gebraucht für die Ansichten "Do Day" (heute) und "Do Morrow" (morgen).
import { describe, it, expect } from 'vitest';
import {
  tasksDueOn,
  eventsOn,
  withCanonicalTags,
  filterByArea,
  weekRange,
  monthRange,
  datesInRange,
  weeksInRange,
  habitDoneInRange,
  tasksByDay,
  eventsByDay,
} from './selectors';
import type { CalendarEvent, Habit, Task } from '../models/types';

function task(id: string, due?: string): Task {
  return { id, rawText: id, title: id, tags: [], completed: false, due };
}

function event(id: string, start: string, end: string): CalendarEvent {
  return { id, rawText: id, title: id, tags: [], start, end };
}

function habit(log: string[]): Habit {
  return { id: 'h1', title: 'Journal', schedule: 'daily', log };
}

describe('tasksDueOn', () => {
  it('liefert Aufgaben mit passendem Fälligkeitsdatum', () => {
    const tasks = [task('heute', '2026-06-12'), task('morgen', '2026-06-13')];
    expect(tasksDueOn(tasks, '2026-06-12', '2026-06-12').map((t) => t.id)).toEqual(['heute']);
    expect(tasksDueOn(tasks, '2026-06-13', '2026-06-12').map((t) => t.id)).toEqual(['morgen']);
  });

  it('zeigt Aufgaben OHNE Fälligkeit nur am heutigen Tag (nicht bei Do Morrow)', () => {
    const tasks = [task('ohne')];
    expect(tasksDueOn(tasks, '2026-06-12', '2026-06-12').map((t) => t.id)).toEqual(['ohne']);
    expect(tasksDueOn(tasks, '2026-06-13', '2026-06-12')).toEqual([]);
  });
});

describe('eventsOn', () => {
  it('liefert nur Termine, die an dem Tag beginnen', () => {
    const events = [
      event('heute', '2026-06-12T09:00:00', '2026-06-12T10:00:00'),
      event('morgen', '2026-06-13T09:00:00', '2026-06-13T10:00:00'),
    ];
    expect(eventsOn(events, '2026-06-12').map((e) => e.id)).toEqual(['heute']);
  });

  it('sortiert die Termine chronologisch', () => {
    const events = [
      event('spät', '2026-06-12T19:00:00', '2026-06-12T21:00:00'),
      event('früh', '2026-06-12T09:00:00', '2026-06-12T09:15:00'),
    ];
    expect(eventsOn(events, '2026-06-12').map((e) => e.id)).toEqual(['früh', 'spät']);
  });

  it('ordnet UTC-Termine (CalDAV) ihrem LOKALEN Tag zu', async () => {
    const { isoDate } = await import('../utils/dates');
    const startUtc = '2026-06-12T22:30:00Z';
    const localDay = isoDate(new Date(startUtc));
    const events = [event('abends', startUtc, '2026-06-12T23:00:00Z')];
    expect(eventsOn(events, localDay).map((e) => e.id)).toEqual(['abends']);
  });
});

describe('withCanonicalTags', () => {
  it('ersetzt Tags über den Resolver durch ihren kanonischen Pfad (Alias → neuer Name)', () => {
    const items = [{ tags: ['Zuhause', 'Unbekannt'] }];
    // Resolver simuliert die Registry: "Zuhause" wurde zu "Home" umbenannt
    const resolve = (tag: string) => (tag === 'Zuhause' ? 'Home' : undefined);
    expect(withCanonicalTags(items, resolve)[0].tags).toEqual(['Home', 'Unbekannt']);
  });

  it('verändert die Original-Objekte nicht (rawText bleibt Wahrheit)', () => {
    const items = [{ tags: ['Zuhause'] }];
    withCanonicalTags(items, () => 'Home');
    expect(items[0].tags).toEqual(['Zuhause']);
  });
});

describe('filterByArea', () => {
  const items = [
    { id: 'a', tags: ['Zuhause'] },
    { id: 'b', tags: ['Zuhause.Aufräumen'] },
    { id: 'c', tags: ['Arbeit'] },
    { id: 'd', tags: [] },
  ];

  it('lässt ohne Filter alles durch', () => {
    expect(filterByArea(items, null)).toHaveLength(4);
  });

  it('liefert den Bereich inklusive seiner Unterbereiche', () => {
    expect(filterByArea(items, 'Zuhause').map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('verwechselt Präfixe nicht (Zuhause ≠ Zuhause2)', () => {
    const tricky = [{ id: 'x', tags: ['Zuhause2'] }];
    expect(filterByArea(tricky, 'Zuhause')).toHaveLength(0);
  });
});

describe('weekRange', () => {
  const friday = new Date('2026-06-12T12:00:00'); // ein Freitag

  it('liefert Montag bis Sonntag der aktuellen Woche (offset 0)', () => {
    expect(weekRange(0, friday)).toEqual({ start: '2026-06-08', end: '2026-06-14' });
  });

  it('offset -1 liefert die Vorwoche', () => {
    expect(weekRange(-1, friday)).toEqual({ start: '2026-06-01', end: '2026-06-07' });
  });

  it('funktioniert über den Jahreswechsel', () => {
    const newYear = new Date('2026-01-01T12:00:00'); // Donnerstag
    expect(weekRange(0, newYear)).toEqual({ start: '2025-12-29', end: '2026-01-04' });
  });
});

describe('monthRange', () => {
  const midJune = new Date('2026-06-12T12:00:00');

  it('liefert den ganzen aktuellen Monat (offset 0)', () => {
    expect(monthRange(0, midJune)).toEqual({ start: '2026-06-01', end: '2026-06-30' });
  });

  it('offset -1 liefert den Vormonat mit korrektem Monatsende', () => {
    expect(monthRange(-1, midJune)).toEqual({ start: '2026-05-01', end: '2026-05-31' });
  });

  it('funktioniert über den Jahreswechsel', () => {
    const january = new Date('2026-01-15T12:00:00');
    expect(monthRange(-1, january)).toEqual({ start: '2025-12-01', end: '2025-12-31' });
  });
});

describe('datesInRange', () => {
  it('zählt alle Tage des Zeitraums einschließlich der Grenzen auf', () => {
    expect(datesInRange({ start: '2026-06-08', end: '2026-06-10' })).toEqual([
      '2026-06-08',
      '2026-06-09',
      '2026-06-10',
    ]);
  });

  it('übersteht die Sommerzeit-Umstellung ohne Tag-Verrutschen', () => {
    // 29.3.2026: Umstellung auf Sommerzeit in Europa
    expect(datesInRange({ start: '2026-03-28', end: '2026-03-30' })).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
    ]);
  });
});

describe('weeksInRange', () => {
  it('zählt die berührten Kalenderwochen (Mo–So)', () => {
    // Juni 2026: Mo 1.6. bis Di 30.6. → 5 Kalenderwochen berührt
    expect(weeksInRange({ start: '2026-06-01', end: '2026-06-30' })).toBe(5);
    // eine einzelne Woche
    expect(weeksInRange({ start: '2026-06-08', end: '2026-06-14' })).toBe(1);
  });
});

describe('habitDoneInRange', () => {
  it('liefert nur die erledigten Tage im Zeitraum, sortiert und ohne Duplikate', () => {
    const range = { start: '2026-06-08', end: '2026-06-14' };
    const h = habit(['2026-06-10', '2026-06-09', '2026-06-10', '2026-06-01', '2026-06-15']);
    expect(habitDoneInRange(h, range)).toEqual(['2026-06-09', '2026-06-10']);
  });

  it('liefert ein leeres Array, wenn nichts im Zeitraum liegt', () => {
    expect(habitDoneInRange(habit([]), { start: '2026-06-08', end: '2026-06-14' })).toEqual([]);
  });
});

describe('tasksByDay', () => {
  const range = { start: '2026-06-08', end: '2026-06-14' };
  const today = '2026-06-12';

  it('gruppiert Aufgaben nach Fälligkeitstag – nur Tage mit Aufgaben', () => {
    const tasks = [task('mo', '2026-06-08'), task('mi', '2026-06-10'), task('mi2', '2026-06-10')];
    const result = tasksByDay(tasks, range, today);
    expect(result.days).toEqual([
      { date: '2026-06-08', tasks: [tasks[0]] },
      { date: '2026-06-10', tasks: [tasks[1], tasks[2]] },
    ]);
  });

  it('sammelt unerledigte Aufgaben von VOR dem Zeitraum als überfällig', () => {
    const old = task('alt', '2026-06-01');
    const doneOld: Task = { ...task('erledigt', '2026-06-02'), completed: true };
    const result = tasksByDay([old, doneOld], range, today);
    expect(result.overdue).toEqual([old]); // erledigte Altlasten zählen nicht
    expect(result.days).toEqual([]);
  });

  it('zeigt Aufgaben ohne Datum unter dem heutigen Tag – nur wenn heute im Zeitraum liegt', () => {
    const undated = task('ohne');
    expect(tasksByDay([undated], range, today).days).toEqual([
      { date: '2026-06-12', tasks: [undated] },
    ]);
    // Vorwoche enthält "heute" nicht → Aufgabe ohne Datum taucht nicht auf
    const lastWeek = { start: '2026-06-01', end: '2026-06-07' };
    expect(tasksByDay([undated], lastWeek, today).days).toEqual([]);
  });
});

describe('eventsByDay', () => {
  it('liefert nur Tage mit Terminen, Termine chronologisch sortiert', () => {
    const range = { start: '2026-06-08', end: '2026-06-10' };
    const events = [
      event('spät', '2026-06-08T19:00:00', '2026-06-08T20:00:00'),
      event('früh', '2026-06-08T09:00:00', '2026-06-08T10:00:00'),
      event('außerhalb', '2026-06-20T09:00:00', '2026-06-20T10:00:00'),
    ];
    const result = eventsByDay(events, range);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-06-08');
    expect(result[0].events.map((e) => e.id)).toEqual(['früh', 'spät']);
  });
});
