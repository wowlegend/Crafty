import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BOSS_REST, bossCaptureReset, drainKnockback, resolveChestHeights } from '../../src/game/captureRest.js';

// A CAPTURE GUARD MUST RESET TO A DECLARED VALUE, NEVER EARLY-RETURN.
//
// Stopping an animation leaves it wherever it got to, and capture is enabled AFTER a boot whose length
// varies 1.68-10.43 s between processes — so a freeze is itself run-dependent. Two sites from the
// 2026-08-09 audit, each a different flavour of the same mistake.
describe('bossCaptureReset — the dragon holds a DECLARED pose, not the one it happened to reach', () => {
  const rig = () => ({
    mesh: new THREE.Object3D(),
    leftWing: new THREE.Object3D(),
    rightWing: new THREE.Object3D(),
  });

  it('resets ROTATION — the axis the old guard forgot', () => {
    // The whole finding. The old branch reset wings and position and left rotation alone, while the
    // flight loop writes rotation.y (turn) and rotation.x (pitch) every frame. So the captured dragon
    // faced a different way each run, from a guard whose entire purpose was to stop that.
    const r = rig();
    r.mesh.rotation.set(0.08, 2.4, 0.3); // mid-flight heading, as the loop leaves it
    bossCaptureReset(r, [10, 40, 10]);
    expect(r.mesh.rotation.x).toBe(BOSS_REST.rotation[0]);
    expect(r.mesh.rotation.y, 'heading survived the reset — the frame samples a run-dependent pose').toBe(BOSS_REST.rotation[1]);
    expect(r.mesh.rotation.z).toBe(BOSS_REST.rotation[2]);
  });

  it('resets both wings to their declared rest angles', () => {
    const r = rig();
    r.leftWing.rotation.z = 0.9;
    r.rightWing.rotation.z = -0.9;
    bossCaptureReset(r, null);
    expect(r.leftWing.rotation.z).toBe(BOSS_REST.leftWingZ);
    expect(r.rightWing.rotation.z).toBe(BOSS_REST.rightWingZ);
  });

  it('pins position to the forced spawn point when one is given, and leaves it alone when not', () => {
    const r = rig();
    r.mesh.position.set(99, 99, 99);
    bossCaptureReset(r, [1, 2, 3]);
    expect(r.mesh.position.toArray()).toEqual([1, 2, 3]);

    const r2 = rig();
    r2.mesh.position.set(5, 6, 7);
    bossCaptureReset(r2, null);
    expect(r2.mesh.position.toArray(), 'clobbered position with no spawn point to pin to').toEqual([5, 6, 7]);
  });

  it('reports HOW MANY objects it reset, so a no-op cannot read as success', () => {
    // Every assertion above is "the value equals rest". A reset that found all refs null would leave a
    // freshly-built rig at rest too, and pass. The count is what tells the two apart.
    expect(bossCaptureReset(rig(), [0, 0, 0])).toBe(3);
    expect(bossCaptureReset({ mesh: new THREE.Object3D() }, null)).toBe(1);
    expect(bossCaptureReset({}, null)).toBe(0);
    expect(bossCaptureReset(null, null)).toBe(0);
  });

  it('needs BOTH wing refs before touching either — no half-applied pose', () => {
    const r = rig();
    r.leftWing.rotation.z = 0.9;
    expect(bossCaptureReset({ mesh: r.mesh, leftWing: r.leftWing }, null)).toBe(1);
    expect(r.leftWing.rotation.z, 'set one wing while the other was missing').toBe(0.9);
  });
});

describe('drainKnockback — under capture the impulse is CLEARED, not left pending', () => {
  const mob = (kb) => ({ health: 10, isStatic: false, knockback: kb, position: { x: 0, y: 0, z: 0 } });

  it('applies the impulse in normal play — the positive control', () => {
    // Without this, every "did not move" below is indistinguishable from a drain that skipped everything.
    const m = mob([10, 0, 4]);
    expect(drainKnockback([m], 1 / 60, false)).toBe(1);
    expect(m.position.x).toBeCloseTo((10 * 4) / 60, 10);
    expect(m.position.z).toBeCloseTo((4 * 4) / 60, 10);
    expect(m.snapSync).toBe(true);
    expect(m.knockback).toBeNull();
  });

  it('under capture: does NOT move the mob, and still CLEARS the impulse', () => {
    // The defect. The old code returned before this loop, and this loop is the impulse's only reader —
    // so one stamped in the instant before the flag flipped survived the entire capture session and
    // fired on the way out. Whether any mob carries one at capture time is a race, which is exactly the
    // run-dependence the guard was supposed to remove.
    const m = mob([10, 0, 4]);
    expect(drainKnockback([m], 1 / 60, true)).toBe(1);
    expect(m.position.x, 'the mob moved under capture').toBe(0);
    expect(m.position.z, 'the mob moved under capture').toBe(0);
    expect(m.knockback, 'the impulse survived capture and will fire on exit').toBeNull();
    expect(m.snapSync, 'flagged a snap for a shove that never happened').toBeUndefined();
  });

  it('skips dead and static entities, and reports the DENOMINATOR it actually saw', () => {
    const live = mob([1, 0, 1]);
    const dead = { ...mob([1, 0, 1]), health: 0 };
    const npc = { ...mob([1, 0, 1]), isStatic: true };
    const idle = mob(null);
    expect(drainKnockback([live, dead, npc, idle], 1 / 60, true)).toBe(1);
    expect(dead.knockback, 'drained a corpse').not.toBeNull();
    expect(npc.knockback, 'shoved a static hub NPC off its post').not.toBeNull();
  });

  it('survives an empty or missing list rather than throwing', () => {
    expect(drainKnockback([], 1 / 60, true)).toBe(0);
    expect(drainKnockback(null, 1 / 60, true)).toBe(0);
    expect(drainKnockback([null, undefined], 1 / 60, false)).toBe(0);
  });
});

describe('resolveChestHeights — a no-op tick must not allocate a new array', () => {
  const chest = (y, resolved = false) => ({ id: 1, position: [4, y, 8], resolved });

  it('returns the SAME reference when nothing resolved — the whole point', () => {
    // `prev.map(...)` on a 3s interval always allocates, so every tick produced a new React state value
    // and re-rendered every consumer, forever, whether or not a chest had moved.
    const list = [chest(60, true), chest(61, true)];
    const r = resolveChestHeights(list, () => 64);
    expect(r.changed).toBe(0);
    expect(r.chests, 'allocated a new array for a tick that changed nothing').toBe(list);
  });

  it('resolves an unresolved chest onto the ground, and says how many — the positive control', () => {
    const list = [chest(15), chest(60, true)];
    const r = resolveChestHeights(list, () => 64);
    expect(r.changed, 'nothing resolved — every "same reference" assertion above is then vacuous').toBe(1);
    expect(r.chests).not.toBe(list);
    expect(r.chests[0].position).toEqual([4, 65, 8]);
    expect(r.chests[0].resolved).toBe(true);
    expect(r.chests[1], 'rebuilt an untouched chest').toBe(list[1]);
  });

  it('treats a null, NaN or non-positive ground level as unresolved rather than teleporting the chest', () => {
    for (const bad of [null, NaN, 0, -3, undefined, '64']) {
      const list = [chest(15)];
      const r = resolveChestHeights(list, () => bad);
      expect(r.changed, `accepted ${String(bad)} as a ground level`).toBe(0);
      expect(r.chests).toBe(list);
    }
  });

  it('survives a missing list or resolver instead of throwing', () => {
    expect(resolveChestHeights(null, () => 64).changed).toBe(0);
    expect(resolveChestHeights([chest(15)], null).changed).toBe(0);
    expect(resolveChestHeights([null, chest(15)], () => 64).changed).toBe(1);
  });
});

describe('treasureChestsList is DECLARED in the store', () => {
  it('exists as an array from the start, so no selector needs an allocating fallback', async () => {
    // Terrain read it as `state => state.treasureChestsList || []`. The key was never declared, so on
    // every evaluation before QuestSystem first wrote it, the selector returned a BRAND NEW array —
    // a new reference each time, which defeats zustand's reference equality and re-renders the chest
    // renderer on every unrelated store change.
    const { useGameStore } = await import('../../src/store/useGameStore.jsx');
    const s = useGameStore.getState();
    expect(s, 'treasureChestsList is undeclared — the reader must invent a fallback').toHaveProperty('treasureChestsList');
    expect(Array.isArray(s.treasureChestsList)).toBe(true);
  });
});
