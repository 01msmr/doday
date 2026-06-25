// Zentrale Übersetzung: ein Schlüssel → beide Sprachversionen aus lang.json.
// Die UI ruft nur noch t('schluessel') auf; die aktive Sprache steht hier.
import strings from './lang.json';

export type Lang = 'de' | 'en';

const STORAGE_KEY = 'doday-lang';

// localStorage gibt es nur im Browser (Tests laufen in node) → defensiv abfragen.
function readStored(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'de' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

let current: Lang = readStored() ?? 'de';

export function getLang(): Lang {
  return current;
}

/** Die jeweils ANDERE Sprache – Beschriftung des Umschalt-Buttons. */
export function otherLang(): Lang {
  return current === 'de' ? 'en' : 'de';
}

/** Intl-Locale zur aktiven Sprache – steuert Monats-/Wochentagsnamen und Datumsreihenfolge.
    Reale Schreibweise: de-DE (Tag vor Monat), en-US (Monat vor Tag, „June 22").
    Uhrzeiten formatiert timeOf passend dazu: de 24h, en 12h mit AM/PM. */
export function locale(): string {
  return current === 'de' ? 'de-DE' : 'en-US';
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* kein Speicher (z. B. privater Modus) – Sprache gilt dann nur für die Sitzung */
  }
}

/** DE ⇆ EN umschalten. */
export function toggleLang(): void {
  setLang(otherLang());
}

/** Übersetzten Text holen; {name}-Platzhalter werden aus vars ersetzt. */
export function t(key: keyof typeof strings, vars?: Record<string, string | number>): string {
  const entry = strings[key] as { de: string; en: string } | undefined;
  let text = entry ? (entry[current] ?? entry.de) : String(key);
  if (vars) {
    for (const name of Object.keys(vars)) {
      text = text.replace(`{${name}}`, String(vars[name]));
    }
  }
  return text;
}
