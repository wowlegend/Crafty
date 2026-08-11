import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CSS_VAR_MAP, TW_SCALES, TW_COLORS } from '../../src/theme/cssVars.js';
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

// THE PARITY TEST THE DESIGN DOC SAID KEPT THIS HONEST WAS NEVER WRITTEN FOR COLORS.
//
// tailwind.config.cjs is CJS and cannot import the ESM token module, so it HAND-DUPLICATES every colour.
// The S1-C plan records that duplication as deliberate and justifies it as "kept honest by the parity test
// above" -- and for colours no such test existed. The gate that did exist walked CONFIG -> CSS_VAR_MAP, a
// direction in which a var present in the token module and ABSENT from the config can never fail, and its
// deep-parity block compared only fontSize, fontFamily and zIndex.
//
// The drift this predicts has already happened once: TW_COLORS silently lost the four Aspect colours
// (HOLISTIC-REVIEW-2026-07-21 §461), closed with the weaker fix while the stronger one -- this test -- was
// skipped. So this is the second time the same gap has been reported.
const flatten = (obj, prefix = '') =>
  Object.entries(obj).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') Object.assign(acc, flatten(v, key));
    else acc[key] = v;
    return acc;
  }, {});

describe('tailwind ↔ TW_COLORS deep parity', () => {
  const cfg = flatten(twConfig.theme.extend.colors || {});
  const src = flatten(TW_COLORS);

  it('enumerates a real palette — an empty one would make every assertion below vacuous', () => {
    expect(Object.keys(src).length).toBeGreaterThan(20);
    expect(Object.keys(cfg).length).toBeGreaterThan(20);
  });

  it('every token colour reaches the config — the direction the old gate could not fail in', () => {
    const missing = Object.keys(src).filter((k) => !(k in cfg));
    expect(missing, 'defined in TW_COLORS and absent from tailwind.config.cjs, so no class generates').toEqual([]);
  });

  it('every config colour exists in the token module — no colour invented in the config', () => {
    const extra = Object.keys(cfg).filter((k) => !(k in src));
    expect(extra, 'in the config with no token behind it — the SoT chain is broken at the far end').toEqual([]);
  });

  it('and they RESOLVE to the same var, not merely to the same key', () => {
    // Same keys with different vars is the silent form: the class exists, the colour is wrong.
    const mismatched = Object.keys(src).filter((k) => src[k] !== cfg[k]);
    expect(mismatched, 'same key, different CSS var — the class generates and paints the wrong colour').toEqual([]);
  });
});
