// Tests zuerst (TDD): Soll-Verhalten der Tag-Registry.
import { describe, it, expect } from 'vitest';
import { InMemoryTagRegistry } from './tagRegistry';
import type { TagRegistryData } from '../models/types';

/** Hilfsfunktion: Registry mit einem vorhandenen Eintrag (wie aus tags.json geladen) */
function seededRegistry(): InMemoryTagRegistry {
  const data: TagRegistryData = {
    version: 5,
    updatedAt: '2026-06-01T08:00:00Z',
    tags: [
      {
        uid: 't-zuhause',
        path: 'Zuhause',
        aliases: ['Heim'],
        color: '#6b8e6b',
        order: 1,
        archived: false,
      },
    ],
  };
  return new InMemoryTagRegistry(data);
}

describe('register', () => {
  it('legt einen neuen Eintrag mit UID, Reihenfolge und archived=false an', () => {
    const registry = new InMemoryTagRegistry();
    const entry = registry.register('Arbeit');
    expect(entry.uid).toMatch(/^t-/);
    expect(entry.path).toBe('Arbeit');
    expect(entry.order).toBe(1);
    expect(entry.archived).toBe(false);
  });

  it('vergibt neue Tags ans Ende der Reihenfolge', () => {
    const registry = seededRegistry();
    const entry = registry.register('Arbeit');
    expect(entry.order).toBe(2);
  });

  it('gibt bei bekanntem Pfad den vorhandenen Eintrag zurück (kein Duplikat)', () => {
    const registry = seededRegistry();
    const entry = registry.register('Zuhause');
    expect(entry.uid).toBe('t-zuhause');
    expect(registry.all()).toHaveLength(1);
  });

  it('erhöht die Version beim Anlegen', () => {
    const registry = seededRegistry();
    registry.register('Arbeit');
    expect(registry.toJSON().version).toBe(6);
  });
});

describe('resolve', () => {
  it('findet einen Eintrag über den Pfad', () => {
    const registry = seededRegistry();
    expect(registry.resolve('Zuhause')?.uid).toBe('t-zuhause');
  });

  it('findet einen Eintrag über einen Alias', () => {
    const registry = seededRegistry();
    expect(registry.resolve('Heim')?.uid).toBe('t-zuhause');
  });

  it('ignoriert Groß-/Kleinschreibung', () => {
    const registry = seededRegistry();
    expect(registry.resolve('zuhause')?.uid).toBe('t-zuhause');
  });

  it('gibt undefined für unbekannte Tags zurück', () => {
    const registry = seededRegistry();
    expect(registry.resolve('Unbekannt')).toBeUndefined();
  });
});

describe('rename', () => {
  it('ändert den Pfad, behält UID und Metadaten, alter Pfad wird Alias', () => {
    const registry = seededRegistry();
    const entry = registry.rename('t-zuhause', 'Home');
    expect(entry.uid).toBe('t-zuhause');
    expect(entry.path).toBe('Home');
    expect(entry.color).toBe('#6b8e6b'); // Metadaten überleben die Umbenennung
    expect(entry.aliases).toContain('Zuhause');
  });

  it('löst den alten Namen nach der Umbenennung weiter auf (Alias-Mechanik)', () => {
    const registry = seededRegistry();
    registry.rename('t-zuhause', 'Home');
    expect(registry.resolve('Zuhause')?.uid).toBe('t-zuhause');
    expect(registry.resolve('Home')?.uid).toBe('t-zuhause');
  });

  it('wirft einen Fehler, wenn der neue Pfad bereits vergeben ist', () => {
    const registry = seededRegistry();
    registry.register('Arbeit');
    expect(() => registry.rename('t-zuhause', 'Arbeit')).toThrow();
  });

  it('wirft einen Fehler bei unbekannter UID', () => {
    const registry = seededRegistry();
    expect(() => registry.rename('t-gibtsnicht', 'Egal')).toThrow();
  });

  it('erhöht die Version', () => {
    const registry = seededRegistry();
    registry.rename('t-zuhause', 'Home');
    expect(registry.toJSON().version).toBe(6);
  });
});

describe('Unicode-Normalisierung (NFC)', () => {
  it('findet Einträge auch mit zerlegten Umlauten (NFD aus macOS/iOS)', () => {
    const registry = new InMemoryTagRegistry();
    registry.register('Aufr\u00e4umen'); // NFC
    // dieselbe Zeichenfolge mit zerlegtem ae (a + U+0308, NFD)
    expect(registry.resolve('Aufra\u0308umen')?.path).toBe('Aufr\u00e4umen');
  });

  it('speichert neue Pfade immer in NFC-Form', () => {
    const registry = new InMemoryTagRegistry();
    const entry = registry.register('Aufra\u0308umen'); // NFD herein, NFC heraus
    expect(entry.path).toBe('Aufr\u00e4umen');
    expect(registry.all()).toHaveLength(1);
  });
});

describe('renameSubtree', () => {
  function registryWithSubtree(): InMemoryTagRegistry {
    const registry = new InMemoryTagRegistry();
    registry.register('Zuhause');
    registry.register('Zuhause.Aufräumen');
    registry.register('Zuhause.Garten');
    return registry;
  }

  it('benennt den Bereich samt aller Unterbereiche um (Aliase bleiben)', () => {
    const registry = registryWithSubtree();
    const uid = registry.resolve('Zuhause')!.uid;
    registry.renameSubtree(uid, 'Home');
    expect(registry.resolve('Home')?.uid).toBe(uid);
    expect(registry.resolve('Home.Aufräumen')).toBeDefined();
    expect(registry.resolve('Home.Garten')).toBeDefined();
    // alte Namen lösen weiter auf (Alias-Mechanik)
    expect(registry.resolve('Zuhause.Aufräumen')?.path).toBe('Home.Aufräumen');
  });

  it('ist atomar: bei einem Konflikt ändert sich GAR nichts', () => {
    const registry = registryWithSubtree();
    registry.register('Home.Garten'); // blockiert das Kaskaden-Ziel
    const uid = registry.resolve('Zuhause')!.uid;
    const versionBefore = registry.toJSON().version;

    expect(() => registry.renameSubtree(uid, 'Home')).toThrow();
    // kompletter Rollback: Eltern UND Kinder unverändert
    expect(registry.resolve('Zuhause')?.path).toBe('Zuhause');
    expect(registry.resolve('Zuhause.Aufräumen')?.path).toBe('Zuhause.Aufräumen');
    expect(registry.toJSON().version).toBe(versionBefore);
  });

  it('wirft bei unbekannter UID', () => {
    const registry = registryWithSubtree();
    expect(() => registry.renameSubtree('t-gibtsnicht', 'Egal')).toThrow();
  });
});

describe('archive und all', () => {
  it('blendet archivierte Einträge aus all() aus', () => {
    const registry = seededRegistry();
    registry.archive('t-zuhause');
    expect(registry.all()).toHaveLength(0);
    expect(registry.all(true)).toHaveLength(1); // mit includeArchived sichtbar
  });

  it('löst archivierte Tags weiterhin auf (Objekte können den Tag noch tragen)', () => {
    const registry = seededRegistry();
    registry.archive('t-zuhause');
    expect(registry.resolve('Zuhause')?.uid).toBe('t-zuhause');
  });

  it('liefert all() nach order sortiert', () => {
    const registry = new InMemoryTagRegistry();
    registry.register('Banane');
    registry.register('Apfel');
    // Reihenfolge = Anlage-Reihenfolge (order), nicht alphabetisch
    expect(registry.all().map((t) => t.path)).toEqual(['Banane', 'Apfel']);
  });
});

describe('setOrder', () => {
  it('setzt die Reihenfolge eines vorhandenen Eintrags', () => {
    const registry = seededRegistry();
    registry.setOrder('Zuhause', 30);
    expect(registry.resolve('Zuhause')?.order).toBe(30);
  });

  it('findet den Eintrag auch über einen Alias', () => {
    const registry = seededRegistry();
    registry.setOrder('Heim', 30);
    expect(registry.resolve('Zuhause')?.order).toBe(30);
  });

  it('zählt die Version hoch (Basis für Konflikt-Erkennung)', () => {
    const registry = seededRegistry();
    const before = registry.toJSON().version;
    registry.setOrder('Zuhause', 30);
    expect(registry.toJSON().version).toBe(before + 1);
  });

  it('wirft bei unbekanntem Pfad', () => {
    const registry = seededRegistry();
    expect(() => registry.setOrder('GibtsNicht', 10)).toThrow();
  });
});
