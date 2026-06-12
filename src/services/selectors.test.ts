// Tests zuerst (TDD): Tages-Auswahl – welche Aufgaben/Termine gehören zu einem Datum?
// Gebraucht für die Ansichten "Do Day" (heute) und "Do Morrow" (morgen).
import { describe, it, expect } from 'vitest';
import { tasksDueOn, eventsOn, withCanonicalTags, filterByArea } from './selectors';
import type { CalendarEvent, Task } from '../models/types';

function task(id: string, due?: string): Task {
  return { id, rawText: id, title: id, tags: [], completed: false, due };
}

function event(id: string, start: string, end: string): CalendarEvent {
  return { id, rawText: id, title: id, tags: [], start, end };
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
