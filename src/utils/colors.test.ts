// Tests zuerst (TDD): Farbwerte aus der Registry/JSON dürfen nur dann ins
// HTML, wenn sie wirklich wie eine Hex-Farbe aussehen (Schutz vor Injection).
import { describe, it, expect } from 'vitest';
import { safeColor } from './colors';

describe('safeColor', () => {
  it('lässt gültige Hex-Farben durch', () => {
    expect(safeColor('#6b8e6b')).toBe('#6b8e6b');
    expect(safeColor('#ABC')).toBe('#ABC');
    expect(safeColor('#11223344')).toBe('#11223344');
  });

  it('weist alles andere ab', () => {
    expect(safeColor('red')).toBeUndefined();
    expect(safeColor('#12')).toBeUndefined();
    expect(safeColor(undefined)).toBeUndefined();
  });

  it('blockt Injection-Versuche', () => {
    expect(safeColor('#fff" onmouseover="alert(1)')).toBeUndefined();
    expect(safeColor('#fff;background:url(x)')).toBeUndefined();
  });
});
