import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CSS_VAR_MAP, TW_SCALES } from '../../src/theme/cssVars.js';

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
