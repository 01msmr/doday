// TagService: Parsen, Normalisieren und Hierarchie-Aufbau für #Tags.
// Tags bleiben Klartext im Objekttext (Kompatibilität mit Nextcloud, iOS, Obsidian) –
// dieser Service ist die einzige Stelle, die das Tag-Format kennt.

/**
 * Tag-Muster: #Wort, optional gefolgt von .Unterwort-Ketten (Umlaute erlaubt).
 * Der Lookbehind (?<=^|\s) verlangt eine Wortgrenze davor –
 * "C#Projekt" oder "ABC#123" sind dadurch KEINE Tags.
 */
// \p{M} erlaubt Kombinationszeichen: macOS liefert "ä" oft als a + ̈ (NFD)
export const TAG_REGEX = /(?<=^|\s)#[\p{L}\p{M}\d_]+(?:\.[\p{L}\p{M}\d_]+)*/gu;

/** Ergebnis des Parsens: Text ohne Tags + die gefundenen Tag-Pfade */
export interface ParsedText {
  cleanText: string;
  tags: string[];
}

/** Knoten im Bereichs-Baum, z. B. segment "Aufräumen", path "Zuhause.Aufräumen" */
export interface TagNode {
  segment: string;
  path: string;
  children: TagNode[];
}

/**
 * Zerlegt einen Text in sauberen Anzeigetext und Tag-Liste.
 * "Keller #Zuhause entrümpeln" → { cleanText: "Keller entrümpeln", tags: ["Zuhause"] }
 */
export function parseTags(text: string): ParsedText {
  const tags: string[] = [];
  // matchAll arbeitet auf einer Kopie des Regex – der globale TAG_REGEX bleibt zustandsfrei
  for (const match of text.matchAll(TAG_REGEX)) {
    // führendes "#" entfernen; NFC: macOS/iOS liefern Umlaute oft zerlegt (a + ̈),
    // wir speichern immer die zusammengesetzte Form
    const tag = match[0].slice(1).normalize('NFC');
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }
  const cleanText = text
    .replaceAll(TAG_REGEX, '')
    .replace(/\s+/g, ' ') // Lücken schließen, wo Tags entfernt wurden
    .trim();
  return { cleanText, tags };
}

/**
 * Kanonische Form: Tags ans Ende verschieben.
 * Wird beim Speichern angewendet, damit in Nextcloud immer
 * "Text #Tag1 #Tag2" steht – egal wie der Nutzer getippt hat.
 */
export function normalizeText(text: string): string {
  const { cleanText, tags } = parseTags(text);
  if (tags.length === 0) {
    return cleanText;
  }
  return [cleanText, ...tags.map((tag) => `#${tag}`)].join(' ').trim();
}

/**
 * Baut aus flachen Tag-Pfaden den Bereichs-Baum für die UI.
 * Fehlende Eltern werden implizit angelegt: ["Arbeit.Projekte.NC"]
 * erzeugt Arbeit → Projekte → NC. Sortierung: alphabetisch (deutsch).
 */
/**
 * Pfad-Präfix sicher ersetzen: "Zuhause.Aufräumen" folgt der Umbenennung
 * von "Zuhause" zu "Home". Der Punkt im Vergleich verhindert,
 * dass "Zuhause2" fälschlich mitwandert.
 */
export function replaceTagPrefix(tag: string, oldPath: string, newPath: string): string {
  if (tag === oldPath) {
    return newPath;
  }
  if (tag.startsWith(`${oldPath}.`)) {
    return newPath + tag.slice(oldPath.length);
  }
  return tag;
}

export function buildHierarchy(tagPaths: string[]): TagNode[] {
  const roots: TagNode[] = [];
  const nodesByPath = new Map<string, TagNode>();

  // Sortierte, eindeutige Pfade → Kinder landen automatisch in alphabetischer Reihenfolge
  const uniqueSorted = [...new Set(tagPaths)].sort((a, b) => a.localeCompare(b, 'de'));

  for (const path of uniqueSorted) {
    let currentPath = '';
    let siblings = roots;
    for (const segment of path.split('.')) {
      currentPath = currentPath === '' ? segment : `${currentPath}.${segment}`;
      let node = nodesByPath.get(currentPath);
      if (!node) {
        node = { segment, path: currentPath, children: [] };
        nodesByPath.set(currentPath, node);
        siblings.push(node);
      }
      siblings = node.children;
    }
  }

  return roots;
}
