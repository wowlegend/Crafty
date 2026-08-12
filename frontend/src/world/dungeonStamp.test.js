import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampChunkRadius, blueprintHalfExtent } from './dungeonStamp.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHUNK = 16;
const CENTRE = 8;

// EIGHT OF NINE ITERATIONS COULD NOT WRITE A BLOCK.
//
// `stampStructures` swept a fixed +/-1 neighbourhood of candidate dungeon chunks and then discarded any
// block whose local coordinate fell outside 0..15. The dungeon is centred at local 8 with a half-extent
// of 6, so its footprint is local 2..14 — entirely inside its own chunk. Every generated chunk paid for
// nine candidates and could only ever be written by one.
//
// The finding proposed deleting the neighbour loop. That fixes today and breaks tomorrow: a larger
// blueprint would then clip silently at the seam, which is exactly how the cave automaton walled caves
// off at every 16-block boundary for months without anything failing. So the radius is derived from the
// footprint — and these are the cases that keep the derivation honest in BOTH directions.
describe('stampChunkRadius — how far a stamp actually reaches', () => {
  it('is ZERO for the current dungeon: half-extent 6 at centre 8 fits inside its chunk', () => {
    expect(stampChunkRadius(6, CHUNK, CENTRE)).toBe(0);
    // The footprint, stated so the reasoning is visible rather than implied by the number above.
    expect(CENTRE - 6).toBeGreaterThanOrEqual(0);
    expect(CENTRE + 6).toBeLessThanOrEqual(CHUNK - 1);
  });

  it('is ZERO right up to the boundary, and ONE the moment it is crossed', () => {
    // The off-by-one is the whole risk in a derivation like this. Half-extent 7 reaches local 1..15 —
    // still inside. Half-extent 8 reaches local 0..16, and 16 is the next chunk.
    expect(stampChunkRadius(7, CHUNK, CENTRE), 'a footprint that exactly fits was reported as overflowing').toBe(0);
    expect(stampChunkRadius(8, CHUNK, CENTRE), 'a footprint that crosses the seam was reported as fitting — it would clip').toBe(1);
  });

  it('grows with the footprint rather than saturating at one', () => {
    expect(stampChunkRadius(24, CHUNK, CENTRE)).toBe(2);
    expect(stampChunkRadius(40, CHUNK, CENTRE)).toBe(3);
  });

  it('handles an OFF-CENTRE structure, where the two sides overflow unequally', () => {
    // Centred at local 2, a half-extent of 6 hangs 4 blocks into the previous chunk while staying inside
    // on the far side. The radius has to cover the worse side, and a naive `hi > chunkSize` check misses
    // the negative one entirely.
    expect(stampChunkRadius(6, CHUNK, 2)).toBe(1);
    expect(stampChunkRadius(6, CHUNK, 14)).toBe(1);
    expect(stampChunkRadius(1, CHUNK, 0)).toBe(1);
  });

  it('a degenerate stamp reaches nowhere', () => {
    expect(stampChunkRadius(0, CHUNK, CENTRE)).toBe(0);
  });

  it('the derived radius really does cover every block the stamp writes', () => {
    // The property the number stands for, checked by brute force rather than by trusting the arithmetic:
    // for each case, every block of the footprint must land in a chunk within +/-r of the origin chunk.
    for (const halfExtent of [0, 1, 6, 7, 8, 13, 24, 40]) {
      for (const centre of [0, 2, 8, 14, 15]) {
        const r = stampChunkRadius(halfExtent, CHUNK, centre);
        for (const d of [-halfExtent, halfExtent]) {
          const abs = centre + d;                       // absolute coord, origin chunk at 0
          const chunk = Math.floor(abs / CHUNK);
          expect(Math.abs(chunk),
            `half-extent ${halfExtent} at centre ${centre} reaches chunk ${chunk}, outside the derived radius ${r}`,
          ).toBeLessThanOrEqual(r);
        }
      }
    }
  });
});

describe('blueprintHalfExtent — the input the radius is derived from', () => {
  it('takes the largest of |dx| and |dz|, ignoring dy', () => {
    // dy is deliberately excluded: chunks are full-height columns, so vertical extent never crosses a
    // chunk boundary in X/Z. Including it would inflate the radius and put the wasted iterations back.
    expect(blueprintHalfExtent([[3, 99, -6, 1], [-2, 0, 1, 1]])).toBe(6);
    expect(blueprintHalfExtent([[-9, 0, 2, 1]])).toBe(9);
  });

  it('is 0 for an empty or missing blueprint, so an uninitialised stamp reaches nowhere', () => {
    expect(blueprintHalfExtent([])).toBe(0);
    expect(blueprintHalfExtent(undefined)).toBe(0);
  });
});

describe('the worker uses the derivation rather than a hardcoded neighbourhood', () => {
  it('stampStructures loops over the derived radius', () => {
    // Structural by necessity: terrain.worker.js assigns `self.onmessage` at module scope, so vitest
    // cannot import it at all — which is precisely why this loop went unexamined for so long. Anchored
    // to the loop form, so a comment mentioning the radius cannot satisfy it.
    const src = readFileSync(resolve(HERE, 'terrain.worker.js'), 'utf8');
    expect(src, 'the stamp is back to a hardcoded neighbourhood').toMatch(/for \(let dcx = cx - r; dcx <= cx \+ r; dcx\+\+\)/);
    expect(src).toMatch(/for \(let dcz = cz - r; dcz <= cz \+ r; dcz\+\+\)/);
    expect(src, 'the radius is no longer derived from the blueprint').toMatch(
      /const r = stampChunkRadius\(blueprintHalfExtent\(DUNGEON_BLUEPRINT\), CHUNK_SIZE, DUNGEON_CENTRE_OFFSET\)/,
    );
    // And the centre offset is one constant shared by the derivation and the stamp, not two literals.
    expect(src).toMatch(/const DUNGEON_CENTRE_OFFSET = 8;/);
    expect((src.match(/dcx \* CHUNK_SIZE \+ 8/g) || []), 'a raw centre literal is back beside the constant').toEqual([]);
  });
});
