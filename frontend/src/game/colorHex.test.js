import { describe, it, expect } from 'vitest';
import { srgbToLinear, linearToSrgb, linearRgbToHex } from './colorHex.js';

// Regression (2026-06-28 audit, MEDIUM): block-break debris built its hex from the LINEAR BLOCK_COLORS
// floats, but THREE.Color(hex) reads the string as sRGB -> debris rendered double-darkened. The hex
// must be linear->sRGB encoded.
const hexToLinear = (hex) => [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255));

describe('colorHex — linear<->sRGB', () => {
  it('linearToSrgb inverts srgbToLinear across the range', () => {
    for (const v of [0, 0.1, 0.25, 0.5, 0.8, 1]) expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 4);
  });

  it('linearRgbToHex round-trips an sRGB block color (not darkened)', () => {
    // grass #567C35: parse -> linear (what BLOCK_COLORS stores) -> back to hex should ~equal the original
    expect(linearRgbToHex(hexToLinear('#567C35'))).toBe('#567c35');
    expect(linearRgbToHex(hexToLinear('#FFFFFF'))).toBe('#ffffff');
    expect(linearRgbToHex(hexToLinear('#707070'))).toBe('#707070');
  });

  it('the OLD bug (treating linear as sRGB) would have darkened it', () => {
    const lin = hexToLinear('#567C35');
    const wrong = `#${lin.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
    expect(wrong).not.toBe('#567c35'); // proves the old path was wrong (darker)
  });
});
