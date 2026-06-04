import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TIERS } from '../../src/render/quality.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

// S2-A-M4a: the tier perf levers (renderDistance, weather) were DEAD (zero consumers
// outside quality.js); onIncline tier-recovery was ABSENT (one-way ratchet to `low`).
// These gates lock the wiring + the symmetric recovery. They are STATIC (source-text)
// gates because the chunk loader / weather system / PerformanceMonitor live inside R3F
// component closures that are not unit-mountable without a GL context.

describe('S2-A-M4a T1: renderDistance tier lever is WIRED', () => {
  // Capture-safety contract: capture forces `high`, and the chunk loader historically
  // hardcoded a radius of 4 which equals TIERS.high.renderDistance, so the forced-high
  // baselines are byte-identical with NO TIERS adjustment. If a future edit lowers
  // high.renderDistance below 4 this fails (it would shrink the high-tier capture world).
  it('TIERS.high.renderDistance equals the legacy hardcoded chunk radius (4) -> high unchanged', () => {
    expect(TIERS.high.renderDistance).toBe(4);
  });

  it('low/med renderDistance are the smaller perf-saving values (low < med < high)', () => {
    expect(TIERS.low.renderDistance).toBeLessThan(TIERS.med.renderDistance);
    expect(TIERS.med.renderDistance).toBeLessThan(TIERS.high.renderDistance);
  });

  it('Terrain chunk loader DERIVES its radius from TIERS[...].renderDistance (no hardcoded 4)', () => {
    const src = read('src/world/Terrain.jsx');
    // The render-distance gate must read the tier lever transiently from the store, not
    // a hardcoded constant. Lock that it indexes TIERS by tier AND reads .renderDistance
    // (the actual code is `(TIERS[tier] || TIERS.low).renderDistance` -> a fallback-safe
    // derivation, so assert the two facts separately rather than one brittle adjacency).
    expect(src).toMatch(/TIERS\[\s*tier\s*\]/);
    expect(src).toMatch(/\.renderDistance/);
    // And it must read the tier transiently from the store (Game-Loop-Isolation: a
    // getState read inside the setTimeout chunk loop, NOT a reactive subscription).
    expect(src).toMatch(/useGameStore\.getState\(\)\.qualityTier/);
    // Regression guard: the loop must NOT reintroduce a literal `RENDER_DISTANCE = 4`.
    expect(src).not.toMatch(/RENDER_DISTANCE\s*=\s*4/);
  });
});
