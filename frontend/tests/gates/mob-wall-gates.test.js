import { describe, it, expect, beforeAll } from 'vitest';
import { findLocalPath, clampMove, STEP_UP, GRID, CLIMBERS } from '../../src/game/localPath.js';
import { buildMobPayload, applyMobUpdate } from '../../src/game/mobStateSync.js';

/**
 * MOBS RESPECT WALLS (QUEUE P1; plan 2026-09-23-crafty-mob-wall-collision).
 *
 * The worker moved x, z with no height check and the main thread snapped y to the TOP surface (a ray cast
 * down from y = 255), so whenever A* found no path the mob walked straight at the player and rose onto the
 * wall — a player-built wall stopped nothing that was not already pathing around it.
 *
 * Two layers: the pure rules on synthetic 9x9 grids, then the REAL ai.worker.js driven across ticks over a
 * heightmap world, the grid rebuilt from the mob's own position every tick exactly as AIWorkerSystem builds
 * it and y snapped to the ground under it exactly as AIWorkerSystem snaps it.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   W1 no partial path (an unreachable goal returns null)   W2 plausible-wrong: STEP_UP ignored in clampMove
 *   W3 the slide removed (a blocked diagonal freezes)        W4 climbers blocked too
 *   W5 the worker bypasses clampMove (the original defect)   W6 no sub-steps (a fast move jumps a thin wall)
 *   W7 plausible-wrong: points mapped to cells by round, not by the column the ground snap probes — the bug
 *      this file's first draft of clampMove actually had (it read 5.5 as column 6 and walked onto the wall)
 *
 * BLIND SPOTS: wandering (non-aggro) mobs carry no height grid, so nothing here stops one wandering onto a wall;
 * the y = 255 ground probe still lifts a mob under an overhang onto the roof; and whether a siege against a
 * built wall FEELS right needs a person playing.
 */

// ---- the pure rules -------------------------------------------------------------------------------------

/** A flat 9x9 grid at height h, with `walls` = [[gx, gz], ...] raised by `rise`. */
function grid(h = 50, walls = [], rise = 3) {
  const g = new Array(GRID * GRID).fill(h);
  for (const [gx, gz] of walls) g[gz * GRID + gx] = h + rise;
  return g;
}
const column = (gx, from = 0, to = 8, skip = []) => {
  const out = [];
  for (let gz = from; gz <= to; gz++) if (!skip.includes(gz)) out.push([gx, gz]);
  return out;
};
const through = (path, walls) => path.some(([x, z]) => walls.some(([wx, wz]) => wx === x && wz === z));

describe('findLocalPath — around a wall when it can, as close as it can get when it cannot', () => {
  it('a gap in the wall is routed through', () => {
    const walls = column(2, 0, 8, [7]);
    const p = findLocalPath(grid(50, walls), 4, 4, 0, 4);
    expect(p[0]).toEqual([4, 4]);
    expect(p[p.length - 1]).toEqual([0, 4]);
    expect(through(p, walls), 'the path went through the wall').toBe(false);
    expect(p.some(([x, z]) => x === 2 && z === 7), 'the path did not use the gap').toBe(true);
  });

  it('an UNBROKEN wall gives the path to the reachable cell nearest the goal — not null, not over the wall', () => {
    const walls = column(2);
    const p = findLocalPath(grid(50, walls), 4, 4, 0, 4);
    expect(p, 'no path at all: the mob would beeline at the wall').not.toBeNull();
    expect(through(p, walls)).toBe(false);
    expect(p[p.length - 1], 'the partial path does not end at the wall face nearest the goal').toEqual([3, 4]);
  });

  it('a lone block straight ahead is walked around, and a 1-block step is not a wall', () => {
    const p = findLocalPath(grid(50, [[3, 4]]), 4, 4, 0, 4);
    expect(p[p.length - 1]).toEqual([0, 4]);
    expect(through(p, [[3, 4]])).toBe(false);
    const step = findLocalPath(grid(50, [[3, 4]], 1), 4, 4, 0, 4);
    expect(step.length, 'a 1-block step was treated as a wall').toBe(5);
  });

  it('boxed in on every side, there is nowhere to go: null', () => {
    const ring = [[3, 3], [4, 3], [5, 3], [3, 4], [5, 4], [3, 5], [4, 5], [5, 5]];
    expect(findLocalPath(grid(50, ring), 4, 4, 0, 4)).toBeNull();
  });
});

describe('clampMove — no step up a wall, slide along it, any step down', () => {
  // The mob stands at world (0,0): the grid origin is (-4,-4), so cell gx = 5 is world column x in [1, 2), and a
  // point stands on the column the ground snap probes, floor(x + 0.1) — the wall starts at x = 0.9.
  const g = grid(50, column(5)); // a wall one column to the +x side
  const onWall = (m) => Math.floor(m.x + 0.1) >= 1;
  it('refuses a move into a cell more than STEP_UP above the mob\'s own', () => {
    expect(STEP_UP).toBe(1.25);
    const m = clampMove(g, 0, 0, 0.9, 0);
    expect(m.blocked).toBe(true);
    expect(onWall(m), `stepped onto the wall column at x ${m.x}`).toBe(false);
    expect(m.x, 'it did not even advance up to the wall').toBeGreaterThan(0.4);
  });

  it('slides along the free axis instead of freezing', () => {
    const m = clampMove(g, 0, 0, 0.9, 0.6);
    expect(onWall(m), `stepped onto the wall column at x ${m.x}`).toBe(false);
    expect(m.z, 'a blocked diagonal froze instead of sliding').toBeCloseTo(0.6, 6);
  });

  it('a FAST move (a charge, a long tick) cannot jump a one-column wall to the open ground beyond it', () => {
    const m = clampMove(g, 0, 0, 2.4, 0); // column 1 is the wall, column 2 is open ground again
    expect(m.blocked).toBe(true);
    expect(m.x, `the move jumped the wall to x ${m.x}`).toBeLessThan(0.9);
  });

  it('any step DOWN is allowed, and a climber goes anywhere', () => {
    const high = grid(55); high[4 * GRID + 4] = 55;
    const low = grid(50); low[4 * GRID + 4] = 55; // mob on a pillar
    expect(clampMove(low, 0, 0, 0.9, 0).blocked).toBe(false);
    expect(clampMove(g, 0, 0, 0.9, 0, true).blocked).toBe(false);
    expect(clampMove(high, 0, 0, 0.9, 0).blocked).toBe(false);
    expect(CLIMBERS.has('spider')).toBe(true);
    expect(CLIMBERS.has('zombie')).toBe(false);
  });
});

// ---- the REAL worker, across ticks ----------------------------------------------------------------------

const posted = [];
let onmessage;
beforeAll(async () => {
  globalThis.self = { postMessage: (m) => posted.push(m), set onmessage(fn) { onmessage = fn; }, get onmessage() { return onmessage; } };
  await import('../../src/workers/ai.worker.js');
});

const GROUND = 50;
/** A world: flat ground, a wall 3 blocks high on the column x in [5, 6), for z in [zFrom, zTo], minus `gapZ`. */
const world = ({ zFrom = -40, zTo = 40, gapZ = [] } = {}) => (x, z) => {
  const cx = Math.floor(x + 0.1), cz = Math.floor(z + 0.1); // the probe's +0.1 seam jitter
  return cx === 5 && cz >= zFrom && cz <= zTo && !gapZ.includes(cz) ? GROUND + 3 : GROUND;
};
/** AIWorkerSystem's grid, built from the mob's position: cell (gx, gz) = world (round(x) - 4 + gx, ...). */
function gridAt(ground, e) {
  const sx = Math.round(e.position.x) - 4, sz = Math.round(e.position.z) - 4, out = [];
  for (let gz = 0; gz < 9; gz++) for (let gx = 0; gx < 9; gx++) out.push(ground(sx + gx, sz + gz));
  return out;
}
const mob = (type, over = {}) => ({
  id: `${type}-1`, passive: false, type, position: { x: 10, y: GROUND + 0.5, z: 0 },
  isAggro: true, isMoving: false, targetX: 10, targetZ: 0, lastAttackTime: 0, windupUntil: 0,
  damage: 8, moveTimer: 0, speed: 1.2, rotation: 0, health: 60, maxHealth: 60, ...over,
});

/** Drive the loop; returns the highest ground the mob ever stood on, and where it ended up. */
function chase(e, ground, { ticks = 300, dt = 0.1, player = [0, GROUND, 0] } = {}) {
  let now = 1000, maxGround = -Infinity, minX = Infinity;
  for (let i = 0; i < ticks; i++) {
    const payload = buildMobPayload(e, { speed: e.speed, heightGrid: gridAt(ground, e) });
    posted.length = 0;
    onmessage({ data: { type: 'TICK', playerPos: player, now, delta: dt, mobs: [payload], captureSeed: null } });
    const r = posted[posted.length - 1];
    for (const u of r.updates) applyMobUpdate(e, u);
    e.position.y = ground(e.position.x, e.position.z) + 0.5; // AIWorkerSystem's ground snap
    maxGround = Math.max(maxGround, ground(e.position.x, e.position.z));
    minX = Math.min(minX, e.position.x);
    now += dt * 1000;
  }
  return { maxGround, minX, end: { x: e.position.x, z: e.position.z } };
}

describe('the real worker: a wall stops a zombie, a gap lets it through, a spider climbs', () => {
  it('an unbroken 3-high wall: the zombie never stands on it, and it actually came to the wall', () => {
    const r = chase(mob('zombie'), world());
    expect(r.minX, 'the zombie never approached — nothing below was tested').toBeLessThan(7);
    expect(r.maxGround, `the zombie walked up the wall (ended at ${r.end.x.toFixed(2)}, ${r.end.z.toFixed(2)})`)
      .toBeLessThanOrEqual(GROUND + STEP_UP);
  });

  it('a gap within reach: the zombie goes THROUGH it and reaches the player\'s side', () => {
    const r = chase(mob('zombie'), world({ gapZ: [3] }));
    expect(r.maxGround).toBeLessThanOrEqual(GROUND + STEP_UP);
    expect(r.minX, 'the zombie never got past the wall through the gap').toBeLessThan(4);
  });

  it('a brute\'s shoulder charge does not carry it over the wall either', () => {
    const r = chase(mob('moss_brute', { damage: 25, health: 220, maxHealth: 220 }), world());
    expect(r.minX).toBeLessThan(7);
    expect(r.maxGround).toBeLessThanOrEqual(GROUND + STEP_UP);
  });

  it('a spider climbs it, as spiders do', () => {
    const r = chase(mob('spider'), world());
    expect(r.minX, 'the spider was stopped by a wall it should climb').toBeLessThan(4);
  });
});
