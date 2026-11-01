import { describe, it, expect } from 'vitest';
import {
  isVoidFall, resolveSpawnGround, spawnTargetY, spawnCornerGround, resumeColumnProbe, returnToSpawn, followBlindDrop,
  spawnSpot, SPAWN_FALLBACK_Y, SPAWN_PROBE_MAX_SEC, SPAWN_EYE_OFFSET, SPAWN_FREEZE_Y,
} from './spawnPlacement.js';
import { CONTROLLER_OFFSET } from './kinematicMove.js';
import { stance } from './stanceState.js';
import { BASE_CAPSULE, BEAST_FORMS } from './beasts.js';
import { DEEP_FLOOR } from '../world/oceanProfile.js';

// Pure spawn-placement branch logic extracted from the Player loop (void-fall reset + ground probe with
// bounded retry/fallback). Characterization-pinned to the old inline behavior; safety-critical (a wrong
// branch = fall-through-floor or stuck-in-sky).

// A body stands its controller's offset over a floor (Components.jsx createCharacterController(0.05)), its centre its
// reach (half-height plus radius) above that. The world's cells run from y 0 up, so the lowest floor is the top of the
// cells at y 0, at 1; under the world there is none, and a body standing on the bottom face of those cells, at 0, is out
// of it too (a body clipped into rock that runs down to y 0 falls through the hollow trimesh to there; over a cave its
// ceiling stops it first, above the line, and stuckInRock.js stands it clear: DECISIONS 2026-10-30 item 213).
// Every shape the player can have is read: the line is one height, and a form whose reach crossed it would fail here.
describe('isVoidFall: the void line lies under every floor of the world, for every shape the player can have', () => {
  const OFFSET = 0.05;
  const shapes = [['base', BASE_CAPSULE], ...Object.values(BEAST_FORMS).map((f) => [f.id, f])];
  const standing = (floor, s) => floor + OFFSET + s.halfHeight + s.radius;

  it('reads every shape: the base capsule and the four forms', () => {
    expect(shapes.map(([name]) => name).sort()).toEqual(['base', 'bull', 'comet', 'golem', 'hawk']);
  });

  it('is false for a body standing on the deep seabed, at its deepest and its shallowest, or on the last cell of a shaft', () => {
    for (const [name, s] of shapes) {
      // world/oceanProfile.js: the full-ocean seabed is DEEP_FLOOR + n * 4, n in [0, 1]
      for (const floor of [DEEP_FLOOR, DEEP_FLOOR + 4, 1]) {
        expect(isVoidFall(standing(floor, s)), `the ${name} standing on a floor at y ${floor} was called fallen`).toBe(false);
      }
    }
  });

  it('is true for a body under the world, or standing on its bottom face inside the rock, in every shape', () => {
    for (const [name, s] of shapes) {
      expect(isVoidFall(standing(0, s)), `the ${name} on the world's bottom face was not called fallen`).toBe(true);
      expect(isVoidFall(-2), `the ${name} under the world was not called fallen`).toBe(true);
    }
  });
});

// The void guard's reset and the respawn after a death both call it (Components.jsx); the Player's own frame against real
// Rapier is tests/gates/player-placement-gates.test.jsx.
describe('returnToSpawn: one way back to the origin spawn\'s wait', () => {
  const rig = () => {
    const calls = [];
    const body = { setTranslation: (p, wake) => calls.push(['at', p, wake]), setLinvel: (v, wake) => calls.push(['vel', v, wake]) };
    const world = { propagateModifiedBodyPositionsToColliders: () => calls.push(['collider with it']) };
    const camera = { position: { at: [300, 41, -400], set(x, y, z) { this.at = [x, y, z]; } } };
    const spawn = { placed: { current: true }, probeWait: { current: SPAWN_PROBE_MAX_SEC - 0.03 } };
    stance.engaged = true;
    stance.w = 1;
    return { calls, body, world, camera, spawn };
  };
  it('holds the body over the origin with its collider, stops it, and starts the spawn\'s wait and the camera there', () => {
    const { calls, body, world, camera, spawn } = rig();
    returnToSpawn(world, body, camera, 0.67, spawn);
    expect(calls).toEqual([['at', { x: 0, y: SPAWN_FREEZE_Y, z: 0 }, true], ['collider with it'], ['vel', { x: 0, y: 0, z: 0 }, true]]);
    expect(camera.position.at, 'the camera stayed where the player fell: chunk streaming follows it').toEqual([0, SPAWN_FREEZE_Y + 0.67, 0]);
    expect([spawn.placed.current, spawn.probeWait.current], 'the spawn branch does not run afresh').toEqual([false, 0]);
    expect([stance.engaged, stance.w], 'the fight came along').toEqual([false, 0]);
  });
  it('with no body yet, still starts the spawn\'s wait and moves the camera', () => {
    const { calls, world, camera, spawn } = rig();
    returnToSpawn(world, null, camera, 0.67, spawn);
    expect(calls).toEqual([]);
    expect(camera.position.at).toEqual([0, SPAWN_FREEZE_Y + 0.67, 0]);
    expect([spawn.placed.current, spawn.probeWait.current]).toEqual([false, 0]);
  });
});

describe('spawnTargetY', () => {
  it('places the player center one eye-offset above ground', () => {
    expect(spawnTargetY(50)).toBeCloseTo(50 + SPAWN_EYE_OFFSET, 10);
    expect(spawnTargetY(0)).toBeCloseTo(SPAWN_EYE_OFFSET, 10);
  });
});

describe('resolveSpawnGround', () => {
  it('uses a placed block-ground immediately when present (no probe, no retry)', () => {
    expect(resolveSpawnGround(64, null, 0)).toEqual({ groundY: 64, retry: false, incFails: false });
    // block ground wins even if a physics probe value also exists
    expect(resolveSpawnGround(64, 30, 5)).toEqual({ groundY: 64, retry: false, incFails: false });
  });

  it('falls back immediately (no retry) when the physics probe is unavailable', () => {
    expect(resolveSpawnGround(null, null, 0, false)).toEqual({
      groundY: SPAWN_FALLBACK_Y, retry: false, incFails: false,
    });
  });

  it('uses a valid physics ground (> probe-min)', () => {
    expect(resolveSpawnGround(null, 30, 0, true)).toEqual({ groundY: 30, retry: false, incFails: false });
  });

  it('retries (counting the frame toward the wait) on an invalid probe while the wait is under its bound', () => {
    const retry = { groundY: null, retry: true, incFails: true };
    expect(resolveSpawnGround(null, null, 0, true)).toEqual(retry); // null probe
    expect(resolveSpawnGround(null, NaN, 0, true)).toEqual(retry); // NaN probe
    expect(resolveSpawnGround(null, 15, 0, true)).toEqual(retry); // == PROBE_MIN_Y -> rejected (<=)
    expect(resolveSpawnGround(null, 10, SPAWN_PROBE_MAX_SEC - 1 / 30, true, 1 / 60)).toEqual(retry); // still under the bound
  });

  it('falls back (no more retry) once the bounded probe wait is exhausted', () => {
    // the frame whose step reaches the bound falls back, and still counts
    expect(resolveSpawnGround(null, null, SPAWN_PROBE_MAX_SEC - 1 / 60, true, 1 / 60)).toEqual({
      groundY: SPAWN_FALLBACK_Y, retry: false, incFails: true, blind: true,
    });
  });

  it('waits the same time at any frame rate: the bound is seconds, not frames', () => {
    // 120 frames was 2 s at 60 Hz and 1 s at 120 Hz; the spawn corner's last chunk is asked for 3.15 s on at the top tier
    expect(SPAWN_PROBE_MAX_SEC, 'the wait ends before the top tier streams the spawn corner').toBeGreaterThan(3.15);
    for (const hz of [60, 120, 144]) {
      let waited = 0, frames = 0;
      while (resolveSpawnGround(null, null, waited, true, 1 / hz).retry) { waited += 1 / hz; frames++; }
      expect(Math.abs(frames / hz - SPAWN_PROBE_MAX_SEC), `at ${hz} Hz the wait was ${frames} frames, ${(frames / hz).toFixed(2)} s`).toBeLessThan(2 / hz);
    }
  });

  it('accepts a probe value just above the min', () => {
    expect(resolveSpawnGround(null, 16, 0, true)).toEqual({ groundY: 16, retry: false, incFails: false });
  });
});

// The spawn stands at x 0 z 0, where four block columns meet, and its capsule stands across all four. The probe is
// Terrain.jsx's getMobGroundLevel, which casts at x + 0.1, z + 0.1: called at (x, z) it reads column (x, z).
describe('spawnCornerGround', () => {
  const probeOf = (tops) => (x, z) => tops[`${x},${z}`];
  it('is the highest of the four columns around the corner, whichever it is', () => {
    const flat = { '-1,-1': 51, '0,-1': 51, '-1,0': 51, '0,0': 51 };
    expect(spawnCornerGround(probeOf(flat))).toBe(51);
    // A dug column (0, 0) is not the ground: the three around it still stand at 51.
    expect(spawnCornerGround(probeOf({ ...flat, '0,0': 48 }))).toBe(51);
    for (const k of Object.keys(flat)) {
      expect(spawnCornerGround(probeOf({ ...flat, [k]: 54 })), `column ${k} standing higher was not the ground`).toBe(54);
    }
  });
  it('asks the four columns the corner touches, and no other', () => {
    const asked = [];
    spawnCornerGround((x, z) => { asked.push(`${x},${z}`); return 51; });
    expect(asked.sort()).toEqual(['-1,-1', '-1,0', '0,-1', '0,0']);
  });
  it('is null until every column answers above the probe floor', () => {
    const flat = { '-1,-1': 51, '0,-1': 51, '-1,0': 51, '0,0': 51 };
    for (const k of Object.keys(flat)) {
      for (const bad of [null, undefined, NaN, 15, 3]) {
        expect(spawnCornerGround(probeOf({ ...flat, [k]: bad })), `column ${k} reading ${bad} gave a ground`).toBeNull();
      }
    }
    expect(spawnCornerGround(probeOf({ ...flat, '0,0': 16 })), 'a column just over the floor is an answer').toBe(51);
  });
});

// When the spawn's wait runs out over a corner that answers nothing, the body is stood on the nearest column whose ground
// answers. The capsule is the body's as it is: a beast form outlives the void guard's reset (returnToSpawn ends none), and
// the bull's radius (0.62 m) and the golem's (0.5 m) with the controller's offset reach past a column's 0.5 m half-width
// into the columns round it. Each block is read against the capsule's segment, so a spot inside a column it overhangs fails.
describe('spawnSpot: the wait run out, the nearest ground that answers, and every column the capsule reaches', () => {
  const CORNER = ['-1,-1', '0,-1', '-1,0', '0,0'];
  // The land at 30 for 8 m round the corner, the corner's four columns dug out (they answer nothing), and `tops` over it.
  const land = (tops = {}) => (x, z) => (`${x},${z}` in tops ? tops[`${x},${z}`] : CORNER.includes(`${x},${z}`) ? null : 30);
  const SHAPES = { base: BASE_CAPSULE, ...Object.fromEntries(Object.values(BEAST_FORMS).map((f) => [f.id, f])) };
  /** The capsule's least gap to the column (x, z)'s blocks, which run from its ground down: negative when inside them. */
  const gapTo = (at, shape, x, z, top) => {
    const dx = Math.max(x - at.x, 0, at.x - (x + 1)), dz = Math.max(z - at.z, 0, at.z - (z + 1));
    const dy = Math.max(0, (at.y - shape.halfHeight) - top);
    return Math.hypot(dx, dy, dz) - shape.radius;
  };
  /** The least gap to any column within two of the spot, and which column it is. */
  const nearestBlock = (at, shape, probe) => {
    let worst = { gap: Infinity, column: null };
    for (let x = Math.floor(at.x) - 2; x <= Math.floor(at.x) + 2; x++) for (let z = Math.floor(at.z) - 2; z <= Math.floor(at.z) + 2; z++) {
      const top = probe(x, z);
      if (top == null) continue;
      const gap = gapTo(at, shape, x, z, top);
      if (gap < worst.gap) worst = { gap: +gap.toFixed(4), column: `${x},${z}` };
    }
    return worst;
  };

  it('stands the body over the middle of the nearest column whose ground answers above the probe floor', () => {
    const probe = (x, z) => ({ '-2,-1': 15, '1,0': 41, '3,3': 30 })[`${x},${z}`] ?? null;
    // (-2, -1) and (1, 0) are equally near the corner; the first reads 15, the probe's floor, which is no answer.
    expect(spawnSpot({ blind: true, groundY: SPAWN_FALLBACK_Y }, probe)).toEqual({ x: 1.5, y: spawnTargetY(41), z: 0.5, blind: false });
  });
  it('stands every shape the player can have its controller\'s offset clear of every column, beside one a block higher', () => {
    // The land round the dug corner with the column west of the nearest one, (-2, -1), a block higher; then, on ground
    // that answers only there, a column a block higher on each side of the one stood on ((-2, -1), or (1, -1) for its
    // east side, which at (-2, -1) is the dug corner).
    const cases = [
      { name: 'land, west', probe: land({ '-3,-1': 31 }), stand: [-2, -1] },
      ...[[[-2, -1], [-3, -1]], [[-2, -1], [-2, -2]], [[-2, -1], [-2, 0]], [[1, -1], [2, -1]]].map(([c, n]) => ({
        name: `${n} beside ${c}`, stand: c, probe: (x, z) => ({ [`${c}`]: 30, [`${n}`]: 31 })[`${x},${z}`] ?? null,
      })),
    ];
    const out = {};
    for (const { name, probe, stand } of cases) {
      for (const [form, shape] of Object.entries(SHAPES)) {
        const at = spawnSpot({ blind: true, groundY: SPAWN_FALLBACK_Y }, probe, shape);
        out[`${name}: ${form}`] = { at: { x: at.x, y: at.y, z: at.z }, over: at.x === stand[0] + 0.5 && at.z === stand[1] + 0.5, ...nearestBlock(at, shape, probe) };
      }
    }
    expect(Object.keys(out).length, 'SETUP: the cases and shapes read').toBe(25);
    expect(Object.entries(out).filter(([, v]) => !v.over), 'SETUP: a spawn did not stand over the nearest column').toEqual([]);
    const close = Object.entries(out).filter(([, v]) => !(v.gap >= CONTROLLER_OFFSET - 1e-9));
    expect(close, `a spawn stood a capsule closer than the controller's offset to a block ${JSON.stringify(out)}`).toEqual([]);
    // The base capsule stands on its own column as before: it reaches no other.
    const base = Object.entries(out).filter(([k]) => k.endsWith(': base'));
    expect(base.filter(([, v]) => v.at.y !== spawnTargetY(30)), 'the base capsule was not stood on its own column').toEqual([]);
    expect(base.length, 'SETUP: the base capsule\'s cases').toBe(5);
  });
  it('reads a column the capsule overhangs only where it answers, and keeps the corner and the blind drop as they were', () => {
    const bull = BEAST_FORMS.ice;
    // The column beside it dug out too (null) or not streamed in: nothing stands there, and the spot is the column's own.
    expect(spawnSpot({ blind: true, groundY: SPAWN_FALLBACK_Y }, land({ '-3,-1': null }), bull)).toEqual({ x: -1.5, y: spawnTargetY(30), z: -0.5, blind: false });
    // A corner whose four columns answer: stood over the corner on resolveSpawnGround's ground, whatever the shape.
    expect(spawnSpot({ groundY: 51 }, () => 51, bull)).toEqual({ x: 0, y: spawnTargetY(51), z: 0, blind: false });
    // Nothing answers within reach, or there is no probe: the blind drop over the corner.
    expect(spawnSpot({ blind: true, groundY: SPAWN_FALLBACK_Y }, () => null, bull)).toEqual({ x: 0, y: spawnTargetY(SPAWN_FALLBACK_Y), z: 0, blind: true });
    expect(spawnSpot({ blind: true, groundY: SPAWN_FALLBACK_Y }, null, bull)).toEqual({ x: 0, y: spawnTargetY(SPAWN_FALLBACK_Y), z: 0, blind: true });
  });
});

// A loaded save's column counts as in only once every chunk the load fit reads (a metre round the saved centre) has
// answered: the probe is asked at the four corners of that square, each a column, and at the saved column itself.
// After the blind drop the corner is read again each frame; a body whose lowest point is under its ground once it answers
// is stood on it (the Player's loop, Components.jsx; tests/gates/stuck-in-rock-gates.test.jsx drives it there).
describe('followBlindDrop', () => {
  const REACH = BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius;
  it('waits, counting down, while the corner has not answered, and ends when the time is spent', () => {
    const follow = { left: SPAWN_PROBE_MAX_SEC };
    expect(followBlindDrop(follow, null, { x: 0, y: 40, z: 0 }, REACH, 1 / 60)).toBeNull();
    expect(follow.left).toBeCloseTo(SPAWN_PROBE_MAX_SEC - 1 / 60, 9);
    follow.left = 1 / 120;
    expect(followBlindDrop(follow, null, { x: 0, y: 40, z: 0 }, REACH, 1 / 60)).toBeNull();
    expect(follow.left).toBe(0);
  });
  it('stands a body whose lowest point is under the answered ground on it, over the corner, and ends', () => {
    for (const y of [40, 52.5, 52.9 - 0.001]) { // in the rock; the centre over the top but the feet under it
      const follow = { left: 3 };
      expect(followBlindDrop(follow, 52, { x: 0.02, y, z: -0.01 }, REACH, 1 / 60), `centre at ${y}`).toBe(spawnTargetY(52));
      expect(follow.left, `centre at ${y}`).toBe(0);
    }
  });
  it('leaves a body standing on the ground or falling over it, and ends', () => {
    for (const y of [52 + 0.05 + REACH, 58]) {
      const follow = { left: 3 };
      expect(followBlindDrop(follow, 52, { x: 0, y, z: 0 }, REACH, 1 / 60), `centre at ${y}`).toBeNull();
      expect(follow.left, `centre at ${y}`).toBe(0);
    }
  });
  it('lets go of a body that has walked off the corner, whatever the corner says', () => {
    const follow = { left: 3 };
    expect(followBlindDrop(follow, 52, { x: 1.2, y: 40, z: 0 }, REACH, 1 / 60)).toBeNull();
    expect(follow.left).toBe(0);
  });
});

describe('resumeColumnProbe', () => {
  it('is the saved column\'s ground once all four corners answer, and asks each corner\'s column', () => {
    const asked = [];
    const probe = (x, z) => { asked.push([x, z]); return 51; };
    expect(resumeColumnProbe(probe, { x: 15.95, y: 52, z: 0.5 })).toBe(51);
    // 1 m either way of 15.95 is 14.95 and 16.95: columns 14 and 16, across the chunk border at 16; 0.5 gives -1 and 1.
    expect(asked.slice(0, 4).map(([x, z]) => [Math.floor(x), Math.floor(z)]).sort()).toEqual([[14, -1], [14, 1], [16, -1], [16, 1]]);
    expect(asked[4]).toEqual([15.95, 0.5]);
  });
  it('is null while any corner has not answered, whatever the saved column says', () => {
    for (let k = 0; k < 4; k++) {
      let n = 0;
      const probe = () => (n++ === k ? null : 51);
      expect(resumeColumnProbe(probe, { x: 15.95, y: 52, z: 0.5 }), `corner ${k} unanswered`).toBeNull();
    }
    expect(resumeColumnProbe(() => NaN, { x: 0.5, y: 52, z: 0.5 })).toBeNull();
  });
});
