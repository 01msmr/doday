// Farb-Validierung: Werte aus tags.json/achievements.json landen in
// style-Attributen – deshalb kommt nur durch, was wirklich eine Hex-Farbe ist.
// Alles andere (auch gültiges CSS wie "red") wird abgewiesen: streng = sicher.
const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;

export function safeColor(color: string | undefined): string | undefined {
  return color && HEX_COLOR.test(color) ? color : undefined;
}
