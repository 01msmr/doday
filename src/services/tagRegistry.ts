// TagRegistry: stabile Identität + Metadaten für Bereiche.
//
// Arbeitsteilung: Der Klartext im Objekt ("#Zuhause") sagt, WOZU etwas gehört.
// Die Registry sagt, WAS dieser Bereich ist (UID, Farbe, Reihenfolge, frühere Namen).
// Die UID erscheint nie im Objekttext – sie macht Umbenennungen billig:
// nur "path" ändert sich, der alte Name wird Alias, alle Objekte bleiben zugeordnet.
//
// Diese In-Memory-Variante arbeitet auf einem TagRegistryData-Objekt –
// in Phase 2 wird dasselbe Objekt per WebDAV aus tags.json geladen/geschrieben.
import type { TagEntry, TagRegistryData } from '../models/types';

/** Vergleichsschlüssel: NFC-normalisiert + kleingeschrieben */
function normalizeKey(text: string): string {
  return text.normalize('NFC').toLowerCase();
}

export class InMemoryTagRegistry {
  private data: TagRegistryData;

  constructor(initial?: TagRegistryData) {
    this.data = initial ?? {
      version: 0,
      updatedAt: new Date().toISOString(),
      tags: [],
    };
  }

  /** Alle Einträge, nach order sortiert. Archivierte sind standardmäßig ausgeblendet. */
  all(includeArchived = false): TagEntry[] {
    return this.data.tags
      .filter((entry) => includeArchived || !entry.archived)
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Findet den Eintrag zu einem Tag-Text – über path ODER alias,
   * ohne Beachtung von Groß-/Kleinschreibung. Archivierte Einträge werden
   * bewusst mitgefunden: Objekte können den Tag ja weiterhin tragen.
   */
  resolve(tagText: string): TagEntry | undefined {
    // NFC + Kleinschreibung: findet "Aufräumen" auch als zerlegtes "Aufräumen" oder "aufräumen"
    const needle = normalizeKey(tagText);
    return this.data.tags.find(
      (entry) =>
        normalizeKey(entry.path) === needle ||
        entry.aliases.some((alias) => normalizeKey(alias) === needle),
    );
  }

  /**
   * Legt einen Tag an, falls unbekannt – sonst kommt der vorhandene Eintrag zurück.
   * So werden Tags aus Objekten automatisch in die Registry aufgenommen.
   */
  register(path: string): TagEntry {
    const existing = this.resolve(path);
    if (existing) {
      return existing;
    }
    const entry: TagEntry = {
      uid: `t-${crypto.randomUUID()}`,
      path: path.normalize('NFC'), // immer die zusammengesetzte Unicode-Form speichern
      aliases: [],
      order: this.nextOrder(),
      archived: false,
    };
    this.data.tags.push(entry);
    this.touch();
    return entry;
  }

  /**
   * Benennt einen Bereich um. Der alte Pfad wandert in die Aliase,
   * damit Objekte mit dem alten Tag weiterhin zugeordnet werden.
   * UID und Metadaten (Farbe, Icon, Reihenfolge) bleiben unverändert.
   */
  rename(uid: string, newPath: string): TagEntry {
    const entry = this.data.tags.find((tag) => tag.uid === uid);
    if (!entry) {
      throw new Error(`Tag mit UID "${uid}" existiert nicht`);
    }
    const target = newPath.normalize('NFC');
    const conflict = this.resolve(target);
    if (conflict && conflict.uid !== uid) {
      throw new Error(`Der Pfad "${target}" ist bereits vergeben`);
    }
    this.applyRename(entry, target);
    this.touch();
    return entry;
  }

  /**
   * Bereich SAMT Unterbereichen umbenennen – atomar: Erst werden alle
   * Zielpfade auf Konflikte geprüft, dann wird angewendet. Schlägt die
   * Prüfung fehl, bleibt die Registry komplett unverändert.
   */
  renameSubtree(uid: string, newPath: string): TagEntry {
    const entry = this.data.tags.find((tag) => tag.uid === uid);
    if (!entry) {
      throw new Error(`Tag mit UID "${uid}" existiert nicht`);
    }
    const target = newPath.normalize('NFC');
    const oldPath = entry.path;
    const affected = [
      { entry, target },
      ...this.data.tags
        .filter((tag) => tag !== entry && tag.path.startsWith(`${oldPath}.`))
        .map((tag) => ({ entry: tag, target: target + tag.path.slice(oldPath.length) })),
    ];
    const movingUids = new Set(affected.map((move) => move.entry.uid));

    // Konfliktprüfung KOMPLETT vor der ersten Änderung
    for (const move of affected) {
      const conflict = this.resolve(move.target);
      if (conflict && !movingUids.has(conflict.uid)) {
        throw new Error(`Der Pfad "${move.target}" ist bereits vergeben`);
      }
    }
    for (const move of affected) {
      this.applyRename(move.entry, move.target);
    }
    this.touch();
    return entry;
  }

  /** Gemeinsame Umbenennen-Mechanik: alter Pfad wird Alias, neuer Pfad gesetzt */
  private applyRename(entry: TagEntry, newPath: string): void {
    if (!entry.aliases.includes(entry.path)) {
      entry.aliases.push(entry.path);
    }
    // Falls der neue Name vorher ein Alias dieses Eintrags war: aus den Aliasen entfernen
    entry.aliases = entry.aliases.filter((alias) => normalizeKey(alias) !== normalizeKey(newPath));
    entry.path = newPath;
  }

  /** Blendet einen Bereich aus der UI aus – Historie und Zuordnung bleiben erhalten. */
  archive(uid: string): void {
    const entry = this.data.tags.find((tag) => tag.uid === uid);
    if (!entry) {
      throw new Error(`Tag mit UID "${uid}" existiert nicht`);
    }
    entry.archived = true;
    this.touch();
  }

  /** Aktueller Zustand – in Phase 2 wird genau das nach tags.json geschrieben. */
  toJSON(): TagRegistryData {
    return this.data;
  }

  /** Neue Tags landen ans Ende der Sortierung */
  private nextOrder(): number {
    return Math.max(0, ...this.data.tags.map((tag) => tag.order)) + 1;
  }

  /** Jede Änderung zählt die Version hoch – Basis für Konflikt-Erkennung in Phase 2 */
  private touch(): void {
    this.data.version += 1;
    this.data.updatedAt = new Date().toISOString();
  }
}
