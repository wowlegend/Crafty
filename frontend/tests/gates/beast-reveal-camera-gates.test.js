import { describe, it, expect } from 'vitest';
import { beastRevealCamera, REVEAL_OFFSETS, BEAST_HEIGHT } from '../../src/game/beastRevealCamera.js';
import { PLAYER_SPAWN, playerSpawnVec } from '../../src/game/playerSpawn.js';

/**
 * THE DEFECT THIS EXISTS TO CATCH (measured 2026-08-08, four baselines wrong for weeks):
 *
 * The reveal camera was framed from `rb.translation()` while the avatar RENDERS at the RigidBody's
 * declared transform. Under capture, physics is paused and rapier never syncs the two, so they diverged by
 * ~20 units — beast meshes at worldY 100.0-101.6 with `ndc.y ~= -3` (off the bottom of the screen), camera
 * at 121.45. Every `beast-*.png` was a distant mountain with no beast in it, and the visual gate compared
 * one empty mountain against another and passed.
 *
 * So the invariant under test is NOT "the function returns numbers" — it is that the shot actually CONTAINS
 * the beast. These assert distance from the avatar origin, which is exactly what a 20-unit divergence
 * breaks and what a source-grep could never see.
 */

const ELEMENTS = ['fire', 'ice', 'lightning', 'arcane'];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('beast reveal camera — the shot must contain the beast', () => {
  it('covers every element in the roster, and the denominator is asserted', () => {
    expect(Object.keys(REVEAL_OFFSETS).sort()).toEqual([...ELEMENTS].sort());
    expect(ELEMENTS).toHaveLength(4);
  });

  it.each(ELEMENTS)('%s: the camera sits within a portrait distance of the avatar origin', (el) => {
    const origin = playerSpawnVec();
    const { position } = beastRevealCamera(el, origin);
    const d = dist(position, [origin.x, origin.y, origin.z]);
    // A reveal portrait is metres away, not tens of metres. The live defect measured ~20.
    expect(d).toBeGreaterThan(1);
    expect(d).toBeLessThan(6);
  });

  it.each(ELEMENTS)('%s: the lookAt target lands ON the beast, not above or below it', (el) => {
    const origin = playerSpawnVec();
    const { lookAt } = beastRevealCamera(el, origin);
    // Feet at origin.y, head at origin.y + height. Allow a little slack below for the low bull framing.
    expect(lookAt[1]).toBeGreaterThan(origin.y - 0.5);
    expect(lookAt[1]).toBeLessThan(origin.y + BEAST_HEIGHT[el]);
    expect(Math.hypot(lookAt[0] - origin.x, lookAt[2] - origin.z)).toBeLessThan(1);
  });

  it('is framed RELATIVE to the origin it is given — a moved origin moves the whole shot', () => {
    // The regression was a camera anchored to one point while the avatar rendered at another. If the
    // function ignored its origin, this would fail — and so would the real fixture.
    const a = beastRevealCamera('fire', { x: 0, y: 100, z: 0 });
    const b = beastRevealCamera('fire', { x: 0, y: 120, z: 0 });
    expect(b.position[1] - a.position[1]).toBe(20);
    expect(b.lookAt[1] - a.lookAt[1]).toBe(20);
  });

  it('accepts the array form of an origin identically to the object form', () => {
    expect(beastRevealCamera('ice', PLAYER_SPAWN)).toEqual(beastRevealCamera('ice', playerSpawnVec()));
  });

  it('falls back to the LEAD (fire) framing for an unknown element rather than returning NaN', () => {
    const o = playerSpawnVec();
    expect(beastRevealCamera('banana', o)).toEqual(beastRevealCamera('fire', o));
    expect(beastRevealCamera(undefined, o).position.every(Number.isFinite)).toBe(true);
  });

  it('PLAYER_SPAWN is the single shared source — frozen, so no caller can mutate the shot', () => {
    expect(PLAYER_SPAWN).toEqual([0, 100, 0]);
    expect(Object.isFrozen(PLAYER_SPAWN)).toBe(true);
  });
});
