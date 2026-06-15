import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

// Anti-drift gate: the surface-height formula must live in EXACTLY ONE place (world/heightAt.js).
// climate.js silently went stale once (kept 30+n*40 while the worker moved to 40+n*18+highland^2*120)
// because the formula was hand-copied; the "characterization test pins it" claim was false. This gate
// makes a re-copy structurally detectable: both consumers must import computeHeight, and no inline
// baseHeight formula may exist outside heightAt.js.
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const worker = read('../../src/world/terrain.worker.js');
const climate = read('../../src/world/climate.js');
const heightAt = read('../../src/world/heightAt.js');

describe('heightAt single-source (anti-drift gate)', () => {
  it('the canonical formula lives in heightAt.js', () => {
    expect(heightAt).toContain('40 + n * 18');
    expect(heightAt).toContain('export function computeHeight');
  });

  it('both the worker and the climate sampler import computeHeight', () => {
    expect(worker).toContain('computeHeight');
    expect(worker).toContain('heightAt');
    expect(climate).toContain('computeHeight');
    expect(climate).toContain('heightAt');
  });

  it('no inline baseHeight formula survives outside heightAt.js', () => {
    expect(worker).not.toMatch(/baseHeight\s*=\s*40\s*\+\s*n/);
    expect(climate).not.toMatch(/baseHeight\s*=\s*30\s*\+\s*n/);
    expect(climate).not.toMatch(/n\s*\*\s*40/);
  });
});
