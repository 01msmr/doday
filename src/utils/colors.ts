// Farb-Validierung: Werte aus tags.json/achievements.json landen in
// style-Attributen – deshalb kommt nur durch, was wirklich eine Hex-Farbe ist.
// Alles andere (auch gültiges CSS wie "red") wird abgewiesen: streng = sicher.
const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;

export function safeColor(color: string | undefined): string | undefined {
  return color && HEX_COLOR.test(color) ? color : undefined;
}

/** HSV → Hex (h in 0–360, s/v in 0–1) – für den Farbvorschlags-Randomizer. */
export function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
