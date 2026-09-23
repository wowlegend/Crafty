import { describe, it, expect, beforeAll } from 'vitest';
import { findLocalPath, clampMove, STEP_UP, GRID, CLIMBERS, gridOrigin, settleOnGround } from '../../src/game/localPath.js';
import { buildMobPayload, applyMobUpdate } from '../../src/game/mobStateSync.js';
import { carriersOf } from './_srcWalk.js';

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
 *   (review #4:) F1 plausible-wrong: gridOrigin back to round(x) - 4 (A* plans from the wall top at the face)
 *   F2 the worker maps path nodes to the column EDGE, not its centre   F3 A* cuts corners again (R5.2)
 *   F4 AIWorkerSystem frames its grid with round() again
 *   G1 settleOnGround ignores the step rule (the snap lifts any mover again)   G2 plausible-wrong: it refuses the
 *      move but still writes the wall-top y   G3 AIWorkerSystem snaps directly again (structural)
 *   R57 the blocked-stop removed (a zombie at the wall walks in place) — SURVIVED the first time: nothing
 *      asserted isMoving; the unbroken-wall case now does. R57b plausible-wrong: "stopped" = moved exactly zero
 *      (the first fix — a zombie pressed into the wall at a shallow angle creeps millimetres and kept walking)
 *
 * BLIND SPOTS: movers that never pass the worker-reply snap (SquadAISystem allies set their own y) are not
 * covered; a mob whose FIRST snap happens under an overhang still lands on the roof (no footing to return to);
 * a refused knockback renders at the illegal spot for up to one AI tick (~66 ms) before it is pulled back; and
 * whether a siege against a built wall FEELS right needs a person playing.
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

  it('no cutting a corner between two walls — the mover could not follow it (review #4, R5.2)', () => {
    // Walls at (5,4) and (4,5), the diagonal (5,5) open: stepping (4,4) -> (5,5) sweeps through a wall column.
    const p = findLocalPath(grid(50, [[5, 4], [4, 5]]), 4, 4, 6, 6);
    for (let i = 1; i < p.length; i++) {
      const [ax, az] = p[i - 1], [bx, bz] = p[i];
      if (ax !== bx && az !== bz) {
        expect([[bx, az], [ax, bz]].some(([x, z]) => (x === 5 && z === 4) || (x === 4 && z === 5)),
          `the path cut the corner (${ax},${az}) -> (${bx},${bz})`).toBe(false);
      }
    }
    expect(p[p.length - 1], 'no path around the corner at all').toEqual([6, 6]);
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
/** AIWorkerSystem's grid, built from the mob's position exactly as it builds it (gridOrigin — the mob's column). */
function gridAt(ground, e) {
  const sx = gridOrigin(e.position.x), sz = gridOrigin(e.position.z), out = [];
  for (let gz = 0; gz < 9; gz++) for (let gx = 0; gx < 9; gx++) out.push(ground(sx + gx, sz + gz));
  return out;
}
const mob = (type, over = {}) => ({
  id: `${type}-1`, passive: false, type, position: { x: 10, y: GROUND + 0.5, z: 0 },
  isAggro: true, isMoving: false, targetX: 10, targetZ: 0, lastAttackTime: 0, windupUntil: 0,
  damage: 8, moveTimer: 0, speed: 1.2, rotation: 0, health: 60, maxHealth: 60, ...over,
});

/** Drive the loop; returns the highest ground the mob ever stood on, and where it ended up. */
function chase(e, ground, { ticks = 300, dt = 0.1, player = [0, GROUND, 0], noGrid = false } = {}) {
  let now = 1000, maxGround = -Infinity, minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < ticks; i++) {
    const payload = buildMobPayload(e, { speed: e.speed, heightGrid: noGrid ? null : gridAt(ground, e) });
    posted.length = 0;
    onmessage({ data: { type: 'TICK', playerPos: player, now, delta: dt, mobs: [payload], captureSeed: null } });
    const r = posted[posted.length - 1];
    for (const u of r.updates) applyMobUpdate(e, u);
    settleOnGround(e, ground(e.position.x, e.position.z), CLIMBERS.has(e.type)); // AIWorkerSystem's ground snap
    maxGround = Math.max(maxGround, ground(e.position.x, e.position.z));
    minX = Math.min(minX, e.position.x);
    maxX = Math.max(maxX, e.position.x);
    now += dt * 1000;
  }
  return { maxGround, minX, maxX, end: { x: e.position.x, z: e.position.z } };
}

describe('settleOnGround — the snap every mover passes through refuses a climb (review #4, R5.3/R5.6)', () => {
  const at = (x, y) => ({ type: 'zombie', position: { x, y, z: 0 } });
  it('the first snap is taken as is, and remembered', () => {
    const e = at(0, 99);
    expect(settleOnGround(e, 50)).toBe(false);
    expect([e.position.y, e.footX]).toEqual([50.5, 0]);
  });
  it('a shove or a step into a column more than STEP_UP up is REFUSED: back to the last footing, y untouched', () => {
    const e = at(0, 0); settleOnGround(e, 50);
    e.position.x = 1; // knocked into the wall column
    expect(settleOnGround(e, 53)).toBe(true);
    expect([e.position.x, e.position.y]).toEqual([0, 50.5]);
  });
  it('a 1-block step up and any step down are taken; a climber takes anything', () => {
    const e = at(0, 0); settleOnGround(e, 50);
    e.position.x = 1; expect(settleOnGround(e, 51)).toBe(false);
    e.position.x = 2; expect(settleOnGround(e, 40)).toBe(false);
    expect(e.position.y).toBe(40.5);
    const s = at(0, 0); settleOnGround(s, 50, true);
    s.position.x = 1; expect(settleOnGround(s, 60, true)).toBe(false);
  });
  it('AIWorkerSystem snaps through it (weak, structural)', () => {
    expect(carriersOf(/settleOnGround\(entity, groundY, CLIMBERS\.has\(entity\.type\)\);/)).toEqual(['systems/AIWorkerSystem.jsx']);
    expect(carriersOf(/entity\.position\.y = groundY \+ 0\.5;/), 'an unchecked top-surface snap is back').toEqual([]);
  });
});

describe('ONE grid framing, everywhere that frames the grid (review #4, R5.1)', () => {
  it('the mob is always cell (4,4) of its own grid — including frac(x) in [0.5, 0.9)', () => {
    for (const x of [4.0, 4.49, 4.5, 4.6, 4.89, 4.9, -0.05, -0.6]) {
      const o = gridOrigin(x);
      expect(Math.floor(x + 0.1) - o, `x ${x}`).toBe(4);
    }
  });
  it('AIWorkerSystem builds the grid through gridOrigin, and no round()-framed grid is left anywhere (weak, structural)', () => {
    expect(carriersOf(/const startX = gridOrigin\(e\.position\.x\);/)).toEqual(['systems/AIWorkerSystem.jsx']);
    expect(carriersOf(/Math\.round\([^)]*\)\s*-\s*4\b/), 'a round()-framed 9x9 grid is back').toEqual([]);
  });
});

describe('the real worker: a wall stops a zombie, a gap lets it through, a spider climbs', () => {
  it('an unbroken 3-high wall: the zombie never stands on it, and it actually came to the wall', () => {
    const z = mob('zombie');
    const r = chase(z, world());
    expect(r.minX, 'the zombie never approached — nothing below was tested').toBeLessThan(7);
    expect(r.maxGround, `the zombie walked up the wall (ended at ${r.end.x.toFixed(2)}, ${r.end.z.toFixed(2)})`)
      .toBeLessThanOrEqual(GROUND + STEP_UP);
    // ...and it WAITS there rather than playing its walk cycle in place against the wall (review #4, R5.7).
    expect(z.isMoving, 'stopped dead at the wall but still reporting isMoving').toBe(false);
  });

  it('a gap within reach: the zombie goes THROUGH it and reaches the player\'s side', () => {
    const r = chase(mob('zombie'), world({ gapZ: [3] }));
    expect(r.maxGround).toBeLessThanOrEqual(GROUND + STEP_UP);
    expect(r.minX, 'the zombie never got past the wall through the gap').toBeLessThan(4);
  });

  it('the same gap approached from the OTHER side (+x) — A* must plan from the column the mob stands on (review #4, R5.1)', () => {
    // Mirror image: the zombie starts at x = 0, the player at x = 10. Stopped at the wall's -x face, the zombie
    // stands at x in [4.1, 4.9); A* used to start from round(x) = 5 — the wall top — and plan straight over.
    const r = chase(mob('zombie', { position: { x: 0, y: GROUND + 0.5, z: 0 }, targetX: 0 }), world({ gapZ: [3] }),
      { player: [10, GROUND, 0] });
    expect(r.maxGround).toBeLessThanOrEqual(GROUND + STEP_UP);
    expect(r.maxX, 'the zombie never got past the wall through the gap from the -x side').toBeGreaterThan(6);
  });

  it('a mob ALREADY at the wall face with frac(x) in [0.5, 0.9) still routes to the gap (review #4, R5.1)', () => {
    // x = 4.6 stands on column 4 (the ground snap probes floor(x + 0.1)) right against the wall on column 5 —
    // but round(4.6) = 5, and A* used to start from THAT cell: the wall top, from which every way is down.
    for (const x0 of [4.55, 4.6, 4.75, 4.85]) {
      const r = chase(mob('zombie', { position: { x: x0, y: GROUND + 0.5, z: 0 }, targetX: x0 }), world({ gapZ: [3] }),
        { player: [10, GROUND, 0] });
      expect(r.maxGround).toBeLessThanOrEqual(GROUND + STEP_UP);
      expect(r.maxX, `a zombie starting at the wall face (x ${x0}) never found the gap`).toBeGreaterThan(6);
    }
  });

  it('a brute\'s shoulder charge does not carry it over the wall either', () => {
    const r = chase(mob('moss_brute', { damage: 25, health: 220, maxHealth: 220 }), world());
    expect(r.minX).toBeLessThan(7);
    expect(r.maxGround).toBeLessThanOrEqual(GROUND + STEP_UP);
  });

  it('a mover with NO height grid (a wandering mob, the first aggro tick) is refused by the snap itself (review #4, R5.3)', () => {
    const r = chase(mob('zombie'), world(), { noGrid: true });
    expect(r.minX, 'the zombie never approached — nothing below was tested').toBeLessThan(7);
    expect(r.maxGround, `the grid-less zombie walked up the wall (ended at ${r.end.x.toFixed(2)})`).toBeLessThanOrEqual(GROUND + STEP_UP);
  });

  it('a spider climbs it, as spiders do', () => {
    const r = chase(mob('spider'), world());
    expect(r.minX, 'the spider was stopped by a wall it should climb').toBeLessThan(4);
  });
});
