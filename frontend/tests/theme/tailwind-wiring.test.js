import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CSS_VAR_MAP, TW_SCALES } from '../../src/theme/cssVars.js';
import twConfig from '../../tailwind.config.cjs';

const CONFIG = readFileSync(resolve(process.cwd(), 'tailwind.config.cjs'), 'utf8');

describe('tailwind ↔ tokens SoT parity', () => {
  it('every --ui-* var referenced in the config exists in CSS_VAR_MAP', () => {
    const refs = [...CONFIG.matchAll(/--ui-[a-z0-9-]+/g)].map((m) => m[0]);
    expect(refs.length).toBeGreaterThan(10);
    for (const r of new Set(refs)) expect(CSS_VAR_MAP, `dangling ${r}`).toHaveProperty(r);
  });

  it('config wires the token scales (zIndex modal, radius md, elev-md shadow)', () => {
    expect(CONFIG).toContain(`'modal': '${TW_SCALES.zIndex.modal}'`);
    expect(CONFIG).toMatch(/borderRadius/);
    expect(CONFIG).toMatch(/boxShadow/);
    expect(CONFIG).toContain('Lilita One');
  });

  it('theme.extend is non-empty (the §1 root-cause disconnect is closed)', () => {
    expect(CONFIG).not.toMatch(/extend:\s*\{\s*\}/);
  });
});

describe('tailwind ↔ tokens scalar parity (deep)', () => {
  const ext = twConfig.theme.extend;
  it('fontSize matches TW_SCALES exactly (size + per-size lineHeight)', () => {
    expect(ext.fontSize).toEqual(TW_SCALES.fontSize);
  });
  it('fontFamily matches TW_SCALES exactly', () => {
    expect(ext.fontFamily).toEqual(TW_SCALES.fontFamily);
  });
  it('zIndex matches TW_SCALES exactly (incl. dev-overlay kebab key)', () => {
    expect(ext.zIndex).toEqual(TW_SCALES.zIndex);
  });
  it('radius/borderWidth/boxShadow reference the runtime --ui-* scalar vars', () => {
    expect(ext.borderRadius.md).toBe('var(--ui-radius-md)');
    expect(ext.borderWidth.chrome).toBe('var(--ui-border-chrome)');
    expect(ext.boxShadow['elev-md']).toBe('var(--ui-elev-md)');
  });
});
