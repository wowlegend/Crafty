import { describe, it, expect } from 'vitest';
import { hexToRgbChannels, CSS_VAR_MAP, applyThemeVars, TW_COLORS, TW_SCALES } from '../../src/theme/cssVars.js';
import { UI } from '../../src/theme/tokens.js';

describe('cssVars', () => {
  it('hexToRgbChannels converts to space-separated 0-255 channels', () => {
    expect(hexToRgbChannels('#0B0E14')).toBe('11 14 20');
    expect(hexToRgbChannels('#FFFFFF')).toBe('255 255 255');
  });

  it('CSS_VAR_MAP emits --ui-ink as RGB channels and a px scalar for radius', () => {
    expect(CSS_VAR_MAP['--ui-ink']).toBe('11 14 20');
    expect(CSS_VAR_MAP['--ui-radius-md']).toBe('10px');
    expect(CSS_VAR_MAP['--ui-elev-md']).toContain('var(--ui-ink)');
  });

  it('applyThemeVars writes every entry of CSS_VAR_MAP onto the root', () => {
    const written = {};
    const fakeRoot = { style: { setProperty: (k, v) => { written[k] = v; } } };
    applyThemeVars(fakeRoot);
    expect(Object.keys(written).sort()).toEqual(Object.keys(CSS_VAR_MAP).sort());
    expect(written['--ui-accent']).toBe(hexToRgbChannels(UI.color.accent));
  });

  it('TW_COLORS references the --ui-* vars with the <alpha-value> placeholder', () => {
    expect(TW_COLORS.ink).toBe('rgb(var(--ui-ink) / <alpha-value>)');
    expect(TW_COLORS.rarity.legendary).toBe('rgb(var(--ui-rarity-legendary) / <alpha-value>)');
    const names = [];
    const walk = (o) => Object.values(o).forEach((v) =>
      typeof v === 'string' ? names.push(v.match(/--ui-[a-z0-9-]+/)[0]) : walk(v));
    walk(TW_COLORS);
    for (const n of names) expect(CSS_VAR_MAP, n).toHaveProperty(n);
  });

  it('TW_SCALES exposes radius/fontSize/boxShadow/zIndex/fontFamily for the config', () => {
    expect(TW_SCALES.borderRadius.md).toBe('10px');
    expect(TW_SCALES.fontSize.base[0]).toBe('16px');
    expect(TW_SCALES.boxShadow['elev-md']).toContain('var(--ui-ink)');
    expect(TW_SCALES.zIndex.modal).toBe('300');
    expect(TW_SCALES.fontFamily.display).toContain('Lilita One');
  });
});
