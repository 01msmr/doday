// Tests zuerst (TDD): Tag-Vorschläge beim Tippen von "#" in Titel-Feldern.
// WICHTIG (Nutzerwunsch): Es wird immer nur bis zum nächsten "."-Trenner
// vervollständigt – die Hierarchie wird Ebene für Ebene erkundet.
import { describe, it, expect } from 'vitest';
import { applyTag, suggestTags } from './tagSuggest';

const PATHS = ['Zuhause.Aufräumen', 'Arbeit', 'Gesundheit', 'Zuhause'];

describe('suggestTags', () => {
  it('zeigt nach einem frischen "#" die oberste Ebene – ohne Duplikate', () => {
    const result = suggestTags(PATHS, 'Keller #');
    expect(result?.token).toBe('');
    expect(result?.at).toBe(7); // Position des "#"
    expect(result?.matches).toEqual([
      { segment: 'Zuhause', value: 'Zuhause', hasChildren: true },
      { segment: 'Arbeit', value: 'Arbeit', hasChildren: false },
      { segment: 'Gesundheit', value: 'Gesundheit', hasChildren: false },
    ]);
  });

  it('filtert die aktuelle Ebene mit jedem weiteren Zeichen', () => {
    expect(suggestTags(PATHS, 'Keller #zu')?.matches).toEqual([
      { segment: 'Zuhause', value: 'Zuhause', hasChildren: true },
    ]);
    expect(suggestTags(PATHS, '#ges')?.matches).toEqual([
      { segment: 'Gesundheit', value: 'Gesundheit', hasChildren: false },
    ]);
  });

  it('zeigt nach einem "." die Unterbereiche der nächsten Ebene', () => {
    expect(suggestTags(PATHS, '#Zuhause.')?.matches).toEqual([
      { segment: 'Aufräumen', value: 'Zuhause.Aufräumen', hasChildren: false },
    ]);
    expect(suggestTags(PATHS, '#Zuhause.A')?.matches).toEqual([
      { segment: 'Aufräumen', value: 'Zuhause.Aufräumen', hasChildren: false },
    ]);
  });

  it('liefert null ohne angefangenes Tag, mitten im Wort oder ohne Treffer', () => {
    expect(suggestTags(PATHS, 'Keller aufräumen')).toBeNull();
    expect(suggestTags(PATHS, 'a#b')).toBeNull(); // "#" klebt am Wort – kein Tag-Anfang
    expect(suggestTags(PATHS, 'Keller #x ')).toBeNull(); // Token bereits abgeschlossen
    expect(suggestTags(PATHS, '#qqq')).toBeNull();
    expect(suggestTags(PATHS, '#Arbeit.')).toBeNull(); // Arbeit hat keine Unterbereiche
  });

  it('begrenzt die Trefferzahl auf 8', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Tag${i}`);
    expect(suggestTags(many, '#tag')?.matches).toHaveLength(8);
  });

  it('ignoriert Groß-/Kleinschreibung und zerlegte Umlaute (NFD)', () => {
    // "aufräum" mit zerlegtem Umlaut (a + Combining Diaeresis), wie von iOS geliefert
    expect(suggestTags(PATHS, '#Zuhause.aufräum')?.matches).toEqual([
      { segment: 'Aufräumen', value: 'Zuhause.Aufräumen', hasChildren: false },
    ]);
  });
});

describe('applyTag', () => {
  it('vervollständigt eine Ebene MIT Unterbereichen nur bis zum "."', () => {
    const result = applyTag('Keller #zu', 10, 7, 'Zuhause', true);
    expect(result.text).toBe('Keller #Zuhause.');
    expect(result.caret).toBe(16); // direkt hinter dem Punkt – weiterfiltern möglich
  });

  it('schließt ein Blatt (keine Unterbereiche) mit Leerzeichen ab', () => {
    const result = applyTag('Keller #Zuhause.A', 17, 7, 'Zuhause.Aufräumen', false);
    expect(result.text).toBe('Keller #Zuhause.Aufräumen ');
    expect(result.caret).toBe(26);
  });

  it('nutzt ein bereits vorhandenes Leerzeichen hinter dem Token', () => {
    const result = applyTag('Keller #zu leeren', 10, 7, 'Zuhause', false);
    expect(result.text).toBe('Keller #Zuhause leeren');
    expect(result.caret).toBe(16); // hinter dem vorhandenen Leerzeichen
  });
});
