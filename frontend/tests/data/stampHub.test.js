import { describe, it, expect } from 'vitest';
import { stampHub, HUB_PAD, HEARTH_Y } from '../../src/world/homeAnchor.js';
import { HUB_BUILDINGS } from '../../src/world/hubLayout.js';

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 256;
const STONE = 3;
const idx = (x, y, z) => x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;

// The cabin sits at world [12,9] -> chunk (0,0), local (12,9): an in-patch cell we can assert on.
const cabin = HUB_BUILDINGS.find((b) => b.kind === 'cabin');

describe('stampHub flattens a flush terrace under each hub building', () => {
  it('caps the building footprint with stone at HEARTH_Y and clears everything above', () => {
    const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT); // all air
    stampHub(blocks, 0, 0);
    const lx = cabin.pos[0]; // 12 (baseX 0)
    const lz = cabin.pos[1]; // 9
    expect(blocks[idx(lx, HEARTH_Y, lz)]).toBe(STONE);     // clean foundation cap
    expect(blocks[idx(lx, HEARTH_Y - 5, lz)]).toBe(STONE); // filled solid below (no float)
    expect(blocks[idx(lx, HEARTH_Y + 1, lz)]).toBe(0);     // cleared above (no buried roofs)
  });
  it('leaves cells OUTSIDE every building patch untouched (per-building, not a bald plaza)', () => {
    const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    stampHub(blocks, 0, 0);
    // world origin (0,0) is on the plinth core, >HUB_PAD from any building -> stampHub must not touch it
    const far = Math.min(...HUB_BUILDINGS.map((b) => Math.hypot(b.pos[0], b.pos[1])));
    expect(far).toBeGreaterThan(HUB_PAD + 1); // sanity: buildings are well off origin
    expect(blocks[idx(0, HEARTH_Y, 0)]).toBe(0); // origin still air after stampHub (only stampHomeAnchor caps it)
  });
  it('is a no-op on non-hearth chunks', () => {
    const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    stampHub(blocks, 5, 5);
    expect(blocks.every((b) => b === 0)).toBe(true);
  });
});
