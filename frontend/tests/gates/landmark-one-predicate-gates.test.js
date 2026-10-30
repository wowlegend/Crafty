import { describe, it, expect, afterAll } from 'vitest';
import { nearestLandmark } from '../../src/world/shrines.js';
import { isLandmarkChunk } from '../../src/world/landmarks.js';
import { surfaceBlockAt, seedClimate } from '../../src/world/climate.js';

/**
 * ONE FACT, ONE PREDICATE: WHERE IS A LANDMARK? (AUDIT:ultra:ultra-player-world-6)
 *
 * Two producers answered it. The renderer (Terrain.jsx LandmarksRender) drew a hashed landmark chunk only on land: not
 * on a water column, and not below surface 32, so no tower rises from the seabed. The finder (shrines.js
 * nearestLandmark) used the bare hash. 22% of hashed chunks lie in ocean, so the cyan beam, the compass, the minimap
 * dot, the objective arrow and the Pilgrimage reach test led to a shrine nobody could see, under up to 19 blocks of water.
 *
 * This drives the finder over the whole landmark census of a 501x501 chunk window, at two seeds, and holds it against
 * the renderer's rule restated from the climate sampler alone. `standsOnLand` below is that rule as the renderer
 * applied it (Terrain.jsx: `isWater || surfaceY < 32` skips the chunk); it is spelled out here on purpose, so that
 * retuning the rule in the finder and not the renderer, or the reverse, reds this gate. The renderer's own use of the
 * shared predicate is pinned by landmarks-gates (its LandmarksRender takes landmarkAt).
 *
 * NOT CHECKED: that the tower is drawn at the right height (baseY is the sampler's surfaceY, as it always was), and the
 * view from a loaded chunk set (the renderer reads only chunks the streamer has loaded; the rule is per chunk).
 *
 * Mutation-Proof: see the commit trailer.
 */

const SEEDS = [12345, 777];
const R = 250; // chunks each side of the origin: 501 x 501, wide enough to hold chunks AT the surface-32 line at both seeds
const centre = (c) => c * 16 + 8;

const standsOnLand = (cx, cz) => {
  const s = surfaceBlockAt(centre(cx), centre(cz));
  return !s.isWater && s.surfaceY >= 32;
};

const hashed = [];
for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) if (isLandmarkChunk(cx, cz)) hashed.push([cx, cz]);

const probes = [];
for (let z = -800; z <= 800; z += 160) for (let x = -800; x <= 800; x += 160) probes.push([x, z]);

/** What the finder answers for every probe player, as a list of "cx,cz" (or "none"), at the sampler's current seed. */
function finderAnswers() {
  return probes.map(([x, z]) => {
    const r = nearestLandmark(x, z, 8);
    return r ? `${r.cx},${r.cz}` : 'none';
  });
}

afterAll(() => seedClimate(12345));

describe.each(SEEDS)('seed %i: the finder leads only to landmarks the renderer draws, and to all of them', (seed) => {
  seedClimate(seed);
  const drawn = hashed.filter(([cx, cz]) => standsOnLand(cx, cz));
  const undrawn = hashed.filter(([cx, cz]) => !standsOnLand(cx, cz));

  it('SETUP: the census has landmark chunks on land, in the sea, and either side of the surface-32 line to tell apart', () => {
    const at = (y) => hashed.filter(([cx, cz]) => surfaceBlockAt(centre(cx), centre(cz)).surfaceY === y).length;
    expect(hashed.length, 'hashed landmark chunks in the window').toBeGreaterThanOrEqual(3000);
    expect(drawn.length, 'hashed chunks on land').toBeGreaterThanOrEqual(2000);
    expect(undrawn.length, 'hashed chunks in the sea or on the beach').toBeGreaterThanOrEqual(600);
    expect(at(31), 'hashed chunks on a surfaceY 31 column (the highest undrawn)').toBeGreaterThanOrEqual(3);
    expect(at(32), 'hashed chunks on a surfaceY 32 column (the lowest drawn)').toBeGreaterThanOrEqual(3);
  });

  it('every hashed chunk: the finder, asked at its own centre, finds it exactly when it stands on land', () => {
    seedClimate(seed);
    const wrong = hashed
      .filter(([cx, cz]) => (nearestLandmark(centre(cx), centre(cz), 0) !== null) !== standsOnLand(cx, cz))
      .map(([cx, cz]) => `chunk (${cx}, ${cz}) ${standsOnLand(cx, cz) ? 'is on land but the finder skips it' : 'is not on land but the finder leads to it'}`);
    expect(wrong, `${wrong.length} of ${hashed.length} hashed chunks`).toEqual([]);
  });

  it('from every probe player: the nearest landmark is a drawn one, and the nearest drawn one', () => {
    seedClimate(seed);
    const bad = [];
    for (const [x, z] of probes) {
      const r = nearestLandmark(x, z, 8);
      const pcx = Math.floor(x / 16), pcz = Math.floor(z / 16);
      let want = Infinity;
      for (const [cx, cz] of drawn) {
        if (Math.abs(cx - pcx) > 8 || Math.abs(cz - pcz) > 8) continue;
        want = Math.min(want, Math.hypot(centre(cx) - x, centre(cz) - z));
      }
      if (want === Infinity) { if (r !== null) bad.push(`(${x}, ${z}): no drawn landmark within 8 chunks, the finder returned chunk (${r.cx}, ${r.cz})`); continue; }
      if (r === null) bad.push(`(${x}, ${z}): a drawn landmark ${want.toFixed(1)} m away, the finder returned none`);
      else if (!standsOnLand(r.cx, r.cz)) bad.push(`(${x}, ${z}): led to chunk (${r.cx}, ${r.cz}), which the renderer does not draw`);
      else if (Math.abs(r.dist - want) > 1e-6) bad.push(`(${x}, ${z}): the finder says ${r.dist.toFixed(1)} m, the nearest drawn one is ${want.toFixed(1)} m`);
    }
    expect(probes.length, 'probe players').toBe(121);
    expect(bad, `${bad.length} of ${probes.length} probes`).toEqual([]);
  });
});

describe('the sea around the spawn, as the audit walked it', () => {
  it('86 m west of the Hearth at seed 12345 the finder no longer points at the shrine under 19 blocks of water', () => {
    seedClimate(12345);
    expect(isLandmarkChunk(-10, -9), 'SETUP: chunk (-10, -9) is no longer a hashed landmark').toBe(true);
    expect(standsOnLand(-10, -9), 'SETUP: chunk (-10, -9) is no longer under the sea').toBe(false);
    const r = nearestLandmark(-80, -32);
    expect(r === null || !(r.cx === -10 && r.cz === -9), 'still leads to the undrawn shrine').toBe(true);
  });
});

describe('the finder follows the seed it is asked under', () => {
  it('another seed answers from its own sea, and returning to the first gives the first answers back', () => {
    seedClimate(12345);
    const first = finderAnswers();
    seedClimate(777);
    const other = finderAnswers();
    seedClimate(12345);
    const again = finderAnswers();
    const moved = first.filter((a, i) => a !== other[i]).length;
    expect(moved, 'probes whose answer depends on the seed (zero means the cache cannot be told from a constant)').toBeGreaterThanOrEqual(10);
    expect(again).toEqual(first);
  });
});
