// Tests zuerst (TDD): Soll-Verhalten der reinen Verschiebe-Logik.
// Diese Funktionen kennen kein DOM und keine Pointer-Events – sie rechnen nur
// auf Text und Reihenfolgen. Genau das macht sie testbar.
import { describe, it, expect } from 'vitest';
import { retagTask, reorderTopAreas } from './dragMove';

/**
 * Fake-resolve wie es die Registry liefern würde: Tag-Text → kanonischer Pfad.
 * Bildet Alias ("Heim" → "Zuhause") und Schreibweise (Groß/Klein) ab.
 */
const resolve = (tag: string): string | undefined => {
  const map: Record<string, string> = {
    zuhause: 'Zuhause',
    heim: 'Zuhause',
    arbeit: 'Arbeit',
    wichtig: 'Wichtig',
  };
  return map[tag.toLowerCase()];
};

describe('retagTask', () => {
  it('ersetzt den Quelltag bei exaktem Pfad', () => {
    const result = retagTask('Keller entrümpeln #Zuhause', 'Zuhause', 'Arbeit', resolve);
    expect(result).toBe('Keller entrümpeln #Arbeit');
  });

  it('erkennt den Quelltag auch über einen Alias', () => {
    const result = retagTask('Keller entrümpeln #Heim', 'Zuhause', 'Arbeit', resolve);
    expect(result).toBe('Keller entrümpeln #Arbeit');
  });

  it('erkennt den Quelltag unabhängig von der Schreibweise', () => {
    const result = retagTask('Keller entrümpeln #zuhause', 'Zuhause', 'Arbeit', resolve);
    expect(result).toBe('Keller entrümpeln #Arbeit');
  });

  it('tauscht bei mehreren Tags nur den Quelltag', () => {
    const result = retagTask('Angebot schreiben #Arbeit #Wichtig', 'Arbeit', 'Zuhause', resolve);
    expect(result).toBe('Angebot schreiben #Zuhause #Wichtig');
  });

  it('hängt den Zieltag an, wenn die Aufgabe keinen passenden Tag hat', () => {
    const result = retagTask('Einkaufen', 'Zuhause', 'Arbeit', resolve);
    expect(result).toBe('Einkaufen #Arbeit');
  });

  it('normalisiert das Ergebnis – Tags wandern ans Ende', () => {
    const result = retagTask('#Zuhause Keller räumen', 'Zuhause', 'Arbeit', resolve);
    expect(result).toBe('Keller räumen #Arbeit');
  });
});

describe('reorderTopAreas', () => {
  const order = ['Arbeit', 'Zuhause', 'Garten', 'Büro'];

  it('verschiebt einen Bereich nach oben (vor das Ziel)', () => {
    const result = reorderTopAreas(order, 'Büro', 'Zuhause');
    expect(result).toEqual([
      { path: 'Arbeit', order: 0 },
      { path: 'Büro', order: 10 },
      { path: 'Zuhause', order: 20 },
      { path: 'Garten', order: 30 },
    ]);
  });

  it('verschiebt einen Bereich nach unten (vor das Ziel)', () => {
    const result = reorderTopAreas(order, 'Arbeit', 'Büro');
    expect(result).toEqual([
      { path: 'Zuhause', order: 0 },
      { path: 'Garten', order: 10 },
      { path: 'Arbeit', order: 20 },
      { path: 'Büro', order: 30 },
    ]);
  });

  it('verschiebt einen Bereich an den Anfang', () => {
    const result = reorderTopAreas(order, 'Garten', 'Arbeit');
    expect(result).toEqual([
      { path: 'Garten', order: 0 },
      { path: 'Arbeit', order: 10 },
      { path: 'Zuhause', order: 20 },
      { path: 'Büro', order: 30 },
    ]);
  });

  it('ist ein No-Op, wenn Ziel und bewegter Bereich gleich sind', () => {
    const result = reorderTopAreas(order, 'Zuhause', 'Zuhause');
    expect(result).toEqual([]);
  });
});
