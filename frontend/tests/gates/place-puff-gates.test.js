import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { BLOCK_TYPES } from '../../src/world/Blocks.js';

// Block-PLACE puff (2026-06-14, next-levers #1b). Breaking a block already shatters into colored physics
// debris (worker 'block_broken' -> BlockParticleSystem), but PLACING was silent — half the build verb had no
// visual feedback. This adds a gentle colored dust puff on place (GPU sparks at the placed block's color),
// distinct from break's shatter (place = a settle poof, break = chunks fly). This gate locks the wiring.
const __dir = dirname(fileURLToPath(import.meta.url));
const terrain = readFileSync(resolve(__dir, '../../src/world/Terrain.jsx'), 'utf8');

describe('block-place puff is wired', () => {
  it('Terrain imports the BLOCK_TYPES color map', () => {
    expect(terrain).toMatch(/import \{ BLOCK_TYPES \} from '\.\/Blocks'/);
  });
  it('place() fires a GPU-spark puff at the placed block color (marked)', () => {
    expect(terrain).toMatch(/place puff/i);
    expect(terrain).toMatch(/triggerGPUSparks\?\.\(/);
    expect(terrain).toMatch(/BLOCK_TYPES\[/);
  });
  it('every BLOCK_TYPES entry has a hex color the puff can use', () => {
    for (const [name, def] of Object.entries(BLOCK_TYPES)) {
      expect(def.color, `${name} has no color`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
