import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Locomotion-audio interleave: footsteps must be WIRED (they were silent), surface-keyed via the
// climate sampler, throttled by a stride ref (not every frame), with a landing edge.
describe('Locomotion audio gate (interleave)', () => {
  const comp = strip(read('Components.jsx'));
  it('footsteps are wired + surface-keyed (climate.footstepTypeAt) + throttled by a stride ref', () => {
    expect(comp).toMatch(/from '\.\/world\/climate\.js'/);
    expect(comp).toMatch(/footstepTypeAt\(/);
    expect(comp).toMatch(/playSpatialSound\?\.\('footstep'/);
    expect(comp).toMatch(/lastStepRef/);
  });
  it('a landing edge uses a prev-grounded ref (one thud per touchdown, not every frame)', () => {
    expect(comp).toMatch(/prevGroundedRef/);
  });
  it('a jump cue fires at the grounded jump', () => {
    expect(comp).toMatch(/playSpatialSound\?\.\('jump'/);
  });
  it('climate.js stays deterministic (no Math.random in the sampler)', () => {
    expect(read('world/climate.js')).not.toMatch(/Math\.random/);
  });
});
