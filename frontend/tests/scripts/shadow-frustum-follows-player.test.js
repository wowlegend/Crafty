import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapShadowCentre, sunWorldPosition, SUN_DISTANCE, SUN_OFFSET } from '../../src/render/Atmosphere.jsx';
import { TIERS } from '../../src/render/quality.js';

/**
 * THE SHADOWED REGION MUST BE WHERE THE PLAYER IS.
 *
 * THE DEFECT, 2026-09-22. `<directionalLight castShadow position={[50,100,50]}>` had no `target`, and
 * three.js aims a targetless directional light at the WORLD ORIGIN. Its ortho frustum was a hardcoded
 * +/-100 box. The world streams around the player indefinitely (CHUNK_SIZE 16, renderDistance 2/3/4, no
 * position clamp), so beyond roughly 100 units from spawn the entire world silently lost its sun shadows
 * — while the renderer still drew a 2048^2 shadow map every frame for a patch the player had left.
 *
 * Nothing could see it. The visual oracle photographs frames AT SPAWN, where shadows are present and
 * correct; the defect only appears after walking, which no gate does. The light's own docblock argued at
 * length that shadows were now gated and that "the light position is a constant" — true, and the
 * constancy WAS the bug.
 *
 * WHAT IS TESTED HERE, and why it is executable rather than grepped. `snapShadowCentre` is exported as a
 * pure function precisely so the follow-and-snap behaviour can be DRIVEN. A source assertion that
 * Atmosphere "contains playerPosition" would pass while the maths was wrong in either direction, and this
 * repo has the scar for that: a gate asserted a loop existed and stayed green when the loop was mutated
 * to read one element.
 *
 * TEXEL SNAPPING is the other half. A directional shadow map is a grid in light space; sliding its centre
 * by a fraction of a texel makes every shadow edge re-sample on a different boundary, so shadows CRAWL as
 * the player walks. On voxel geometry, where every edge is a straight line, it is glaring. The centre is
 * therefore quantised to whole-texel steps.
 *
 * Mutation-Proof: 5 mutations, denominator asserted (7/7 cases collected on every run):
 *   M1 return `pos` unsnapped                        -> snapping case RED (centre moves by sub-texel amounts)
 *   M2 snap with `Math.floor` instead of `Math.round` -> symmetry case RED (biases the centre one way, so
 *      +d and -d stop being mirror images and shadows drift as you walk back and forth)
 *   M3 `unitsPerTexel = extent / mapSize` (drop the *2) -> granularity case RED (half-texel steps, which
 *      still LOOKS like snapping and is the defect a "does it snap at all" check would pass)
 *   M4 return `{x:0,z:0}` always                     -> follow case RED (the original defect exactly)
 *   M5 `far: 400` -> `far: 120` in GameScene          -> depth case RED (the sun rides 100 units up, so a
 *      120 far plane clips the terrain it is supposed to shadow)
 * Atmosphere.jsx and GameScene.jsx restored from cp backups and diffed byte-identical after each.
 *
 * BLIND SPOT, stated: this proves the ARITHMETIC and the derived frustum. It does NOT prove the light is
 * actually re-positioned each frame — that is one assignment inside a useFrame in a component no jsdom
 * harness can mount (R3F canvas + Rapier WASM), so it is checked as source below and labelled as such.
 * Nor does it prove shadows LOOK right: the visual baseline is stale from the postprocessing 6.39.1 ->
 * 6.39.5 bump and this change alters the gated frames, so the owed re-shoot is the only thing that can.
 */
const HERE = dirname(fileURLToPath(import.meta.url));

describe('the shadow frustum follows the player', () => {
  it('centres on the player, not the world origin (the original defect)', () => {
    const far = snapShadowCentre({ x: 500, z: -300 }, 72, 2048);
    expect(far.x).toBeGreaterThan(400);
    expect(far.z).toBeLessThan(-200);
  });

  it('snaps to whole texels rather than tracking the player continuously', () => {
    const extent = 72, mapSize = 2048;
    const unitsPerTexel = (extent * 2) / mapSize; // ~0.0703
    // A nudge of a tenth of a texel must not move the centre at all.
    const a = snapShadowCentre({ x: 100, z: 100 }, extent, mapSize);
    const b = snapShadowCentre({ x: 100 + unitsPerTexel * 0.1, z: 100 }, extent, mapSize);
    expect(b.x).toBe(a.x);
    // A full texel must.
    const c = snapShadowCentre({ x: 100 + unitsPerTexel, z: 100 }, extent, mapSize);
    expect(c.x).not.toBe(a.x);
    expect(Math.abs(c.x - a.x)).toBeCloseTo(unitsPerTexel, 10);
  });

  it('every returned centre lies exactly on the texel lattice', () => {
    const extent = 72, mapSize = 1024;
    const unitsPerTexel = (extent * 2) / mapSize;
    for (const x of [0, 0.01, -7.3, 133.7, -999.9]) {
      const { x: sx } = snapShadowCentre({ x, z: 0 }, extent, mapSize);
      expect(Math.abs(sx / unitsPerTexel - Math.round(sx / unitsPerTexel))).toBeLessThan(1e-9);
    }
  });

  it('snaps symmetrically, so walking out and back returns the same centre', () => {
    // Math.floor would bias one direction: +d and -d must be mirror images or shadows drift on a round trip.
    const p = snapShadowCentre({ x: 12.3456, z: 0 }, 72, 2048);
    const n = snapShadowCentre({ x: -12.3456, z: 0 }, 72, 2048);
    expect(n.x).toBeCloseTo(-p.x, 10);
  });

  it('is safe on a missing or non-finite player position (boot, or a NaN leak)', () => {
    for (const bad of [null, undefined, {}, { x: NaN, z: 0 }, { x: 0, z: Infinity }]) {
      const r = snapShadowCentre(bad, 72, 2048);
      expect(Number.isFinite(r.x) && Number.isFinite(r.z)).toBe(true);
    }
  });

  it('GameScene DERIVES the extent from renderDistance rather than hardcoding one', () => {
    // Found by a surviving mutant: replacing the derivation with `const extent = 100;` left the case
    // below green, because that case computes the expected extent from TIERS and never looks at what
    // GameScene actually uses. A formula asserted in the abstract is not the formula the app runs — the
    // producer/consumer split (gates-and-probes 4c), with the producer untested.
    const scene = readFileSync(resolve(HERE, '../../src/GameScene.jsx'), 'utf8');
    const start = scene.indexOf('const shadowConfig');
    const end = scene.indexOf('}, [q.shadowMapSize', start);
    expect(end).toBeGreaterThan(start);
    const block = scene.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(block).toMatch(/const\s+extent\s*=\s*\(q\.renderDistance\s*\+\s*0\.5\)\s*\*\s*CHUNK/);
    // ...and the dependency list must include it, or the memo never recomputes on a tier change.
    expect(scene).toMatch(/\}, \[q\.shadowMapSize, q\.renderDistance\]\)/);
  });

  it('the derived extent actually covers the loaded chunks at every tier', () => {
    const CHUNK = 16;
    const tiers = Object.keys(TIERS);
    expect(tiers.length).toBeGreaterThan(0); // R3a — else this loop is vacuous
    for (const t of tiers) {
      const extent = (TIERS[t].renderDistance + 0.5) * CHUNK;
      // Must reach at least the far edge of the furthest loaded chunk, or that geometry casts nothing.
      expect(extent, `tier ${t}`).toBeGreaterThanOrEqual(TIERS[t].renderDistance * CHUNK);
      // And must not sprawl far beyond it, which is what spent the shadow map's pixels on empty space.
      expect(extent, `tier ${t}`).toBeLessThanOrEqual((TIERS[t].renderDistance + 1) * CHUNK);
    }
  });

  it('the sun position has exactly ONE writer (two silently cancelled the first version of this fix)', () => {
    // THE REGRESSION THIS CASE EXISTS FOR. The first version of this change wrote
    // `sunRef.current.position` near the top of the useFrame to follow the player, while the mood block
    // below already wrote `position.set(m.sunPos)` every frame. The later write won, so the follow was
    // DEAD — and because the TARGET still moved, the light-to-target vector rotated as the player walked,
    // swinging every shadow's direction. Worse than the pinned frustum it replaced.
    //
    // No assertion in this file caught it: they drove a pure function and grepped for the target write.
    // A second writer is invisible to both. Comment-stripped so the account above cannot satisfy it.
    const atmos = readFileSync(resolve(HERE, '../../src/render/Atmosphere.jsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const writes = atmos.match(/sunRef\.current\.position\.set\(/g) || [];
    expect(writes.length).toBe(1);
  });

  it('mood owns the DIRECTION and the player owns the CENTRE — both, from one function', () => {
    const centre = { x: 300, z: -120 };
    const moodSun = [-55, 48, -52];
    const p = sunWorldPosition(centre, moodSun);

    // The centre follows: x/z sit near the player, not near the world origin.
    expect(Math.abs(p.x - centre.x)).toBeLessThanOrEqual(SUN_DISTANCE);
    expect(Math.abs(p.z - centre.z)).toBeLessThanOrEqual(SUN_DISTANCE);
    expect(p.x).toBeGreaterThan(100); // decisively player-side, not origin-side

    // The DIRECTION is the mood's: the light-to-target vector must be parallel to moodSun, because that
    // vector IS the shadow direction. If the centre leaked into it, shadows would swing as you walk.
    const dir = { x: p.x - centre.x, y: p.y - 0, z: p.z - centre.z };
    const len = Math.hypot(dir.x, dir.y, dir.z);
    const mlen = Math.hypot(...moodSun);
    for (const [i, k] of [[0, 'x'], [1, 'y'], [2, 'z']]) {
      expect(dir[k] / len).toBeCloseTo(moodSun[i] / mlen, 6);
    }
  });

  it('the shadow DIRECTION is invariant to where the player stands', () => {
    // The property the regression broke, stated directly: walking must not rotate the sun.
    const moodSun = [-55, 48, -52];
    const unit = (c) => {
      const p = sunWorldPosition(c, moodSun);
      const d = { x: p.x - c.x, y: p.y, z: p.z - c.z };
      const l = Math.hypot(d.x, d.y, d.z);
      return [d.x / l, d.y / l, d.z / l];
    };
    const a = unit({ x: 0, z: 0 });
    const b = unit({ x: 900, z: -700 });
    for (let i = 0; i < 3; i++) expect(b[i]).toBeCloseTo(a[i], 9);
  });

  it('falls back to the historical bearing when a mood supplies no sunPos', () => {
    for (const bad of [null, undefined, [1, 2], [NaN, 1, 2]]) {
      const p = sunWorldPosition({ x: 0, z: 0 }, bad);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
      expect(p.y).toBeGreaterThan(0); // the sun is above the world in every fallback
    }
    const l = Math.hypot(SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z);
    const p = sunWorldPosition({ x: 0, z: 0 }, null);
    expect(p.y).toBeCloseTo((SUN_OFFSET.y / l) * SUN_DISTANCE, 6);
  });

  it('the far plane clears the sun offset (source — one assignment inside an unmountable useFrame)', () => {
    // Un-executable here: GameScene needs an R3F canvas and Rapier WASM. The light rides SUN_OFFSET.y
    // above the frustum centre, so `far` must exceed that plus the world depth below, or the terrain the
    // sun is meant to shadow is clipped out of the shadow camera entirely.
    const scene = readFileSync(resolve(HERE, '../../src/GameScene.jsx'), 'utf8');
    // SLICE, NOT A FILE-WIDE MATCH. `/far:\s*(\d+),/` over the whole file matched the <Canvas> CAMERA's
    // `far: 500` — a different frustum entirely — so this case was passing for the wrong reason and a
    // mutation of the SHADOW far plane left it green. Bound the search to the shadowConfig block, which
    // is what the assertion is about. (gates-and-probes 4b: anchor to a slice between unique landmarks,
    // never to the whole file.)
    const start = scene.indexOf('const shadowConfig');
    expect(start).toBeGreaterThan(-1);
    const end = scene.indexOf('}, [q.shadowMapSize', start);
    expect(end).toBeGreaterThan(start); // the landmark must exist, or the slice is the whole file again
    const block = scene.slice(start, end);
    const far = Number(block.match(/far:\s*(\d+),/)?.[1]);
    expect(Number.isFinite(far)).toBe(true);
    expect(far).toBeGreaterThan(SUN_OFFSET.y);
    // and the light must be told to follow, at all
    expect(readFileSync(resolve(HERE, '../../src/render/Atmosphere.jsx'), 'utf8'))
      .toMatch(/sunTarget\.position\.set\(/);
  });
});
