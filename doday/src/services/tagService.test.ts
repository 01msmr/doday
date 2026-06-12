// Tests zuerst (TDD): Sie beschreiben, wie sich der TagService verhalten SOLL.
import { describe, it, expect } from 'vitest';
import { parseTags, normalizeText, buildHierarchy } from './tagService';

describe('parseTags', () => {
  it('extrahiert einen Tag am Textende', () => {
    const result = parseTags('Keller entrümpeln #Zuhause.Aufräumen');
    expect(result.cleanText).toBe('Keller entrümpeln');
    expect(result.tags).toEqual(['Zuhause.Aufräumen']);
  });

  it('extrahiert einen Tag mitten im Text', () => {
    const result = parseTags('Keller #Zuhause entrümpeln');
    expect(result.cleanText).toBe('Keller entrümpeln');
    expect(result.tags).toEqual(['Zuhause']);
  });

  it('extrahiert mehrere Tags in Reihenfolge ihres Auftretens', () => {
    const result = parseTags('Einkaufen planen #Zuhause #Wichtig');
    expect(result.cleanText).toBe('Einkaufen planen');
    expect(result.tags).toEqual(['Zuhause', 'Wichtig']);
  });

  it('entfernt doppelte Tags', () => {
    const result = parseTags('#Arbeit Angebot schreiben #Arbeit');
    expect(result.tags).toEqual(['Arbeit']);
  });

  it('versteht Umlaute, Ziffern und Unterstriche in Tags', () => {
    const result = parseTags('Ablage #Büro_2026');
    expect(result.tags).toEqual(['Büro_2026']);
  });

  it('lässt Text ohne Tags unverändert', () => {
    const result = parseTags('Buch zurückgeben');
    expect(result.cleanText).toBe('Buch zurückgeben');
    expect(result.tags).toEqual([]);
  });

  it('wertet ein einzelnes # nicht als Tag', () => {
    const result = parseTags('Preis in # angeben');
    expect(result.cleanText).toBe('Preis in # angeben');
    expect(result.tags).toEqual([]);
  });
});

describe('normalizeText', () => {
  it('verschiebt einen Tag aus der Textmitte ans Ende', () => {
    expect(normalizeText('Keller #Zuhause entrümpeln')).toBe('Keller entrümpeln #Zuhause');
  });

  it('ist idempotent: kanonische Form bleibt unverändert', () => {
    const canonical = 'Keller entrümpeln #Zuhause.Aufräumen';
    expect(normalizeText(canonical)).toBe(canonical);
  });

  it('lässt Text ohne Tags unverändert', () => {
    expect(normalizeText('Buch zurückgeben')).toBe('Buch zurückgeben');
  });

  it('sammelt mehrere verstreute Tags am Ende (Reihenfolge des Auftretens)', () => {
    expect(normalizeText('#Wichtig Einkaufen #Zuhause planen')).toBe(
      'Einkaufen planen #Wichtig #Zuhause',
    );
  });
});

describe('buildHierarchy', () => {
  it('baut flache Tags als sortierte Wurzelknoten', () => {
    const nodes = buildHierarchy(['Zuhause', 'Arbeit']);
    expect(nodes.map((n) => n.path)).toEqual(['Arbeit', 'Zuhause']);
    expect(nodes[0].children).toEqual([]);
  });

  it('hängt Punkt-Notation als Kindknoten unter den Eltern-Bereich', () => {
    const nodes = buildHierarchy(['Zuhause', 'Zuhause.Aufräumen']);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].path).toBe('Zuhause');
    expect(nodes[0].children.map((c) => c.path)).toEqual(['Zuhause.Aufräumen']);
    expect(nodes[0].children[0].segment).toBe('Aufräumen');
  });

  it('legt fehlende Eltern-Bereiche implizit an (beliebig tief)', () => {
    const nodes = buildHierarchy(['Arbeit.Projekte.NC']);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].path).toBe('Arbeit');
    expect(nodes[0].children[0].path).toBe('Arbeit.Projekte');
    expect(nodes[0].children[0].children[0].path).toBe('Arbeit.Projekte.NC');
  });

  it('ignoriert doppelte Pfade', () => {
    const nodes = buildHierarchy(['Zuhause', 'Zuhause']);
    expect(nodes).toHaveLength(1);
  });
});
