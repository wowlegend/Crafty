import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// World-M5a: the water depth-tint. A world-Y varying carries depth to the fragment; the tint mixes
// toward deep-navy by (SEA_LEVEL - vWorldY), water-gated, and is STATIC (no time -> capture-stable).
describe('Ocean depth-tint gate (World-M5a)', () => {
  const t = read('world/Terrain.jsx');
  it('a world-Y varying is declared (vertex + fragment) and written in the vertex', () => {
    expect((t.match(/varying float vWorldY;/g) || []).length).toBeGreaterThanOrEqual(2); // both shaders
    expect(t).toMatch(/vWorldY\s*=\s*\(modelMatrix \* vec4\(position, 1\.0\)\)\.y;/);
  });
  it('the depth-tint reads vWorldY + SEA_LEVEL (compile-time const from oceanProfile) and is water-gated', () => {
    expect(t).toMatch(/from '\.\/oceanProfile\.js'/);
    expect(t).toMatch(/isWaterPixel\)/);
    expect(t).toMatch(/vWorldY/);
  });
  it('the depth-tint is capture-stable (the labeled M5a block introduces no `time` term)', () => {
    const m = t.match(/\/\/ M5a depth-tint[\s\S]{0,400}/);
    expect(m, 'a labeled M5a depth-tint block exists').not.toBe(null);
    expect(m[0]).not.toMatch(/\btime\b/);
  });
});
