// Reine Verschiebe-Logik für Drag & Drop – ohne DOM, ohne Pointer-Events.
// Hier wird nur auf Text und Reihenfolgen gerechnet, damit es testbar bleibt.
// Grundregel des Projekts: der rawText ist die Wahrheit (siehe spec drag-drop-design).
import { parseTags, normalizeText } from './tagService';

/**
 * Verschiebt eine Aufgabe in einen anderen Bereich, indem im rawText der Tag
 * des Quell-Bereichs durch den Ziel-Bereich ersetzt wird.
 *
 * - Gefunden wird über den kanonischen Pfad: `resolve(tag) === fromPath`
 *   (so greift es auch bei Alias oder abweichender Schreibweise).
 * - Hat die Aufgabe keinen passenden Tag, wird der Zieltag angehängt.
 * - Andere Tags bleiben unberührt.
 * - Das Ergebnis wird normalisiert (Tags ans Ende, Whitespace geglättet).
 *
 * @param resolve Tag-Text → kanonischer Pfad, üblicherweise
 *                `(tag) => registry.resolve(tag)?.path`.
 */
export function retagTask(
  rawText: string,
  fromPath: string,
  toPath: string,
  resolve: (tag: string) => string | undefined,
): string {
  const { cleanText, tags } = parseTags(rawText);

  let replaced = false;
  const newTags = tags.map((tag) => {
    if (resolve(tag) === fromPath) {
      replaced = true;
      return toPath;
    }
    return tag;
  });
  if (!replaced) {
    newTags.push(toPath);
  }

  const rebuilt = [cleanText, ...newTags.map((tag) => `#${tag}`)].join(' ');
  return normalizeText(rebuilt);
}

/**
 * Entfernt den Bereich einer Aufgabe: löscht im `rawText` den Tag, dessen
 * kanonischer Pfad `=== fromPath` ist (über Alias/Schreibweise via `resolve`).
 * Andere Tags bleiben. Ohne passenden Tag bleibt der Text unverändert.
 * Wird beim Ziehen in "Ohne Bereich" genutzt.
 */
export function untagTask(
  rawText: string,
  fromPath: string,
  resolve: (tag: string) => string | undefined,
): string {
  const { cleanText, tags } = parseTags(rawText);
  const kept = tags.filter((tag) => resolve(tag) !== fromPath);
  const rebuilt = [cleanText, ...kept.map((tag) => `#${tag}`)].join(' ');
  return normalizeText(rebuilt);
}

/**
 * Sortiert Top-Level-Bereiche um: `moved` aus der Reihenfolge nehmen und VOR
 * `target` wieder einfügen. `target = null` hängt `moved` ans Ende an (für das
 * Verschieben nach ganz unten). Vergibt für alle neue order-Werte (`index * 10`),
 * damit später wieder Platz zum Einschieben bleibt.
 *
 * Ist `moved === target`, ändert sich nichts → leeres Ergebnis (No-Op).
 */
export function reorderTopAreas(
  orderedPaths: string[],
  moved: string,
  target: string | null,
): { path: string; order: number }[] {
  if (moved === target) {
    return [];
  }
  const without = orderedPaths.filter((path) => path !== moved);
  if (target === null) {
    without.push(moved); // ans Ende
  } else {
    without.splice(without.indexOf(target), 0, moved); // vor das Ziel
  }
  return without.map((path, index) => ({ path, order: index * 10 }));
}
