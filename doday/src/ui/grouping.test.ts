// Tests zuerst (TDD): Wie Aufgaben & Termine in Bereichs-Gruppen einsortiert werden.
import { describe, it, expect } from 'vitest';
import { groupByArea } from './grouping';
import type { CalendarEvent, Task } from '../models/types';

/** Kurze Helfer, damit die Tests lesbar bleiben */
function task(id: string, tags: string[]): Task {
  return { id, rawText: id, title: id, tags, completed: false };
}

function event(id: string, tags: string[]): CalendarEvent {
  return {
    id,
    rawText: id,
    title: id,
    tags,
    start: '2026-06-12T09:00:00',
    end: '2026-06-12T10:00:00',
  };
}

describe('groupByArea', () => {
  it('sortiert Aufgaben in ihre Top-Level-Bereiche, ohne Tag → untagged', () => {
    const result = groupByArea([task('a', ['Zuhause']), task('b', [])], []);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].node.path).toBe('Zuhause');
    expect(result.groups[0].tasks.map((t) => t.id)).toEqual(['a']);
    expect(result.untagged.tasks.map((t) => t.id)).toEqual(['b']);
  });

  it('legt Unterbereiche als Kind-Gruppen an; Eltern zählen Unterbereiche mit', () => {
    // Spiegelt die Konzept-Skizze: Zuhause (3) mit 1 direkter Aufgabe + 2 in Aufräumen
    const result = groupByArea(
      [
        task('fenster', ['Zuhause']),
        task('keller', ['Zuhause.Aufräumen']),
        task('garage', ['Zuhause.Aufräumen']),
      ],
      [],
    );
    const zuhause = result.groups[0];
    expect(zuhause.node.path).toBe('Zuhause');
    expect(zuhause.tasks.map((t) => t.id)).toEqual(['fenster']);
    expect(zuhause.children).toHaveLength(1);
    expect(zuhause.children[0].tasks.map((t) => t.id)).toEqual(['keller', 'garage']);
    expect(zuhause.totalCount).toBe(3);
    expect(zuhause.children[0].totalCount).toBe(2);
  });

  it('legt fehlende Eltern-Gruppen implizit an', () => {
    const result = groupByArea([task('bericht', ['Arbeit.Projekte'])], []);
    expect(result.groups[0].node.path).toBe('Arbeit');
    expect(result.groups[0].tasks).toHaveLength(0);
    expect(result.groups[0].children[0].tasks.map((t) => t.id)).toEqual(['bericht']);
  });

  it('hält Termine und Aufgaben innerhalb eines Bereichs getrennt', () => {
    const result = groupByArea([task('aufgabe', ['Arbeit'])], [event('standup', ['Arbeit'])]);
    const arbeit = result.groups[0];
    expect(arbeit.tasks.map((t) => t.id)).toEqual(['aufgabe']);
    expect(arbeit.events.map((e) => e.id)).toEqual(['standup']);
    expect(arbeit.totalCount).toBe(2);
  });

  it('zeigt Objekte mit mehreren Tags in jedem ihrer Bereiche', () => {
    const result = groupByArea([task('x', ['Zuhause', 'Arbeit'])], []);
    const paths = result.groups.map((g) => g.node.path).sort();
    expect(paths).toEqual(['Arbeit', 'Zuhause']);
    expect(result.groups.every((g) => g.tasks.length === 1)).toBe(true);
  });

  it('sortiert Geschwister-Gruppen nach orderOf (Registry-Reihenfolge), sonst alphabetisch', () => {
    const order: Record<string, number> = { Zuhause: 1, Arbeit: 3 };
    const result = groupByArea(
      [task('a', ['Arbeit']), task('z', ['Zuhause']), task('g', ['Garten'])],
      [],
      (path) => order[path],
    );
    // Zuhause (1) vor Arbeit (3); Garten ohne order kommt alphabetisch dahinter
    expect(result.groups.map((g) => g.node.path)).toEqual(['Zuhause', 'Arbeit', 'Garten']);
  });
});
