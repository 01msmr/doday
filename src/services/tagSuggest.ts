// Tag-Vorschläge beim Tippen: Wer "#" in ein Titel-Feld tippt, bekommt die
// bekannten Bereiche aus der Registry angeboten; jedes weitere Zeichen
// filtert die Liste. WICHTIG (Nutzerwunsch): Vervollständigt wird immer nur
// bis zum nächsten "."-Trenner – die Hierarchie wird Ebene für Ebene erkundet.
// Pure Funktionen – das Dropdown selbst baut main.ts.

/** Vergleichsform: NFC (iOS liefert teils zerlegte Umlaute) + Kleinschreibung */
function normalizeKey(text: string): string {
  return text.normalize('NFC').toLowerCase();
}

export interface TagMatch {
  /** Name der angebotenen Ebene, z. B. "Aufräumen" */
  segment: string;
  /** Vollständiger Pfad bis zu dieser Ebene, z. B. "Zuhause.Aufräumen" */
  value: string;
  /** Gibt es Unterbereiche? Dann vervollständigt applyTag mit "." statt Leerzeichen */
  hasChildren: boolean;
}

export interface TagSuggestion {
  /** Angefangenes Token ohne "#" – leer direkt nach dem "#" */
  token: string;
  /** Position des "#" im Text (zum Ersetzen beim Übernehmen) */
  at: number;
  /** Treffer der AKTUELLEN Ebene, in Registry-Reihenfolge, ohne Duplikate */
  matches: TagMatch[];
}

/**
 * Angefangenes #Tag vor dem Cursor erkennen und die passenden Einträge der
 * aktuellen Hierarchie-Ebene liefern. Beispiel: "#Zuhause.A" zeigt die
 * Unterbereiche von "Zuhause", gefiltert auf "A".
 * null = kein Vorschlag (kein "#" begonnen, Token abgeschlossen, keine Treffer).
 */
export function suggestTags(
  paths: string[],
  textBeforeCaret: string,
  limit = 8,
): TagSuggestion | null {
  // "#" nur am Wortanfang (wie TAG_REGEX); Punkt erlaubt Unterbereiche
  const match = textBeforeCaret.match(/(?<=^|\s)#([\p{L}\p{M}\d_.]*)$/u);
  if (!match || match.index === undefined) {
    return null;
  }
  const token = match[1];
  // Token an letztem "." teilen: davor = feststehender Eltern-Pfad, dahinter = Filter
  const dotIndex = token.lastIndexOf('.');
  const parent = dotIndex >= 0 ? token.slice(0, dotIndex + 1) : ''; // inkl. "."
  const leaf = normalizeKey(dotIndex >= 0 ? token.slice(dotIndex + 1) : token);
  const parentKey = normalizeKey(parent);

  const matches: TagMatch[] = [];
  for (const path of paths) {
    const key = normalizeKey(path);
    if (parentKey && !key.startsWith(parentKey)) {
      continue; // liegt nicht unterhalb des bereits getippten Eltern-Pfads
    }
    // Segment der aktuellen Ebene (Original-Schreibweise aus der Registry)
    const segment = path.slice(parent.length).split('.')[0];
    if (!segment || !normalizeKey(segment).startsWith(leaf)) {
      continue;
    }
    const value = parent ? path.slice(0, parent.length) + segment : segment;
    if (matches.some((m) => normalizeKey(m.value) === normalizeKey(value))) {
      continue; // Ebene schon im Angebot (z. B. "Zuhause" aus zwei Pfaden)
    }
    const hasChildren = paths.some((p) =>
      normalizeKey(p).startsWith(`${normalizeKey(value)}.`),
    );
    matches.push({ segment, value, hasChildren });
    if (matches.length === limit) {
      break;
    }
  }
  if (matches.length === 0) {
    return null;
  }
  return { token, at: match.index, matches };
}

/**
 * Gewählte Ebene übernehmen: ersetzt das angefangene Token ab Position `at`
 * bis zum Cursor. Mit Unterbereichen endet die Einfügung auf "." (weiter
 * filtern!), als Blatt folgt ein Leerzeichen (vorhandenes wird genutzt).
 */
export function applyTag(
  text: string,
  caret: number,
  at: number,
  value: string,
  hasChildren: boolean,
): { text: string; caret: number } {
  const rest = text.slice(caret);
  if (hasChildren) {
    const tag = `#${value}.`;
    return { text: text.slice(0, at) + tag + rest, caret: at + tag.length };
  }
  const tag = `#${value}`;
  if (rest.startsWith(' ')) {
    return { text: text.slice(0, at) + tag + rest, caret: at + tag.length + 1 };
  }
  return { text: `${text.slice(0, at) + tag} ${rest}`, caret: at + tag.length + 1 };
}
