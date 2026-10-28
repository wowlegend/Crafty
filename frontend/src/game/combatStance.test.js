// combatStance.test.js — the combat stance's numbers and decisions, as pure properties.
// Plan: docs/superpowers/plans/2026-10-27-crafty-combat-stance.md (Tasks 2-4). What the REAL worker does with the
// same roster is measured in tests/gates/stance-pursuit-gates.test.js.
//
// Mutation-Proof: (scripts/dev/mutate.sh on src/game/combatStance.js unless noted, observed 2026-10-27)
//   Task 2. S2a `Math.min(...speeds)` -> `Math.max` (retreat from the spider, 5.0) -> RED. S2b the NON_PURSUERS
//   skeleton entry deleted -> RED (the pursuer count reads 7). S2d the RETREAT_FLOOR throw disabled -> RED (the slug
//   test). S2c `chaseSpeedMult(type, true)` -> `1` -> mutate.sh COULD NOT CHECK (0 collected): the module itself
//   throws "retreat 1 m/s (zombie pursues at 2) is under RETREAT_FLOOR 1.5" at load, observed by hand (cp backup,
//   cmp-verified restore), so the file fails to import. S2c2 the same call -> `1.5` (the spider's 2.0 lost, no throw)
//   -> RED (strafe 6.2). S0 identity (a comment edit) -> survived.
//   Task 2, re-run clean on the committed 90863cc6 content (the first run shared this file with a second builder's
//   mutate.sh): every verdict above reproduced. Added plausible-wrong kills: S2d2 the floor tested against the
//   pursuit speed, `lo < RETREAT_FLOOR` -> RED (the slug test); S2e strafe from the SLOWEST, `lo + STRAFE_MARGIN`
//   (3.5) -> RED; S2f `MIN_CLOSING_RATE / 2` (retreat 2.5) -> RED; S2g the margin dropped from the fastest (6.0) -> RED.
//   Task 3 (stanceVelocity; RED first with "stanceVelocity is not a function", 9 of 15). S3a the retreat clamp dropped
//   -> RED. S3b the blend weight `1 - w` -> RED. S3c the tangential axis sign-flipped -> SURVIVED, an EQUIVALENT
//   mutant (the clamp is symmetric in t), not a hole. S3d formMult ignored (absolute strafe/advance) -> RED (keeps
//   the pace). S3e the retreat scaled by formMult -> RED (form-invariant). S3f the advance clamp dropped -> RED.
//   S3g the w = 0 early return dropped -> RED (the -0 / non-finite case only: the lerp alone returns finite input).
//   S3h the no-direction cap dropped -> RED. S3i the no-direction cap at the retreat cap -> RED. S3j the walk slow
//   not applied to the retreat -> RED. S3k the negative strafe clamp dropped -> RED. S3l a quadratic blend `w * w`
//   -> RED. S3m the advance cap not scaled by formMult -> RED. S3n identity (a comment edit) -> survived.
//   Task 4 (stanceStep; RED first with "resetStance is not a function", 15 of 30). Every one RED: S4a the vertical
//   reach dropped; S4a2 a flat 4 m reach (the first draft); S4a3 the reach one-sided (a mob below passes); S4b
//   CALM_MS 0; S4s the calm halved; S4c hysteresis removed; S4c2 the switch margin on the wrong side; S4d isAggro
//   not required; S4e the NON_PURSUERS skip dropped; S4q isHostile dropped; S4f the stall rule dropped; S4g progress
//   as the fall in the mob-to-player DISTANCE (the player's motion counts); S4h STALL_PROGRESS_M 0.7; S4i the melee
//   margin dropped; S4i2 a climber's strike reach its melee range (the plan's text) instead of its leap; S4j the stall
//   clocks scoped to range (the plan's text: a flicker restarts them); S4k clocks never dropped; S4l resetStance
//   keeps the clocks; S4m the enter blend at the exit rate; S4n no zero-direction guard; S4o away negated; S4p a 3D
//   engage radius; S4r a stale threat kept out of combat. S4z identity (a comment edit) -> survived.
//   Task 5 (noteMoveTarget/readMoveTarget; RED first with "noteMoveTarget is not a function"). N1 the target slots
//   written from raw (the e2e's identity case could then never fail) -> RED; N2 the frame never written -> RED; N3 the
//   stance's w recorded instead of the one the controller passed -> RED; N4 rawZ written from rawX -> RED; N0 identity
//   -> survived. The wiring itself is proven in the running game: tests/e2e/combat-stance.spec.js.
import { describe, it, expect } from 'vitest';
import {
  STANCE_CAPS, MIN_CLOSING_RATE, NON_PURSUERS, pursuitSpeed, pursuers, deriveStanceCaps, BASE_MOVE_SPEED,
  stanceVelocity, stanceStep, getStance, resetStance, engageDyM, STALL_MS, CALM_MS, ENTER_S, EXIT_S,
  noteMoveTarget, readMoveTarget,
} from './combatStance.js';
import { MOB_TYPES } from './mobTypes.js';
import { chaseSpeedMult } from './mobMovement.js';

describe('the stance caps, derived from the roster (Task 2)', () => {
  it('derives retreat 2.0 / strafe 6.5 / advance 6.5 from today\'s roster (husk 3.0 slowest, spider 6.0 fastest)', () => {
    expect(STANCE_CAPS).toMatchObject({ retreat: 2.0, strafe: 6.5, advance: 6.5, slowest: 'zombie', fastest: 'spider' });
  });
  it('for EVERY pursuer in the roster, the retreat cap is at least MIN_CLOSING_RATE below its pursuit speed', () => {
    const ps = pursuers();
    expect(ps.length, 'empty denominator').toBe(6); // zombie spider skitterling duskhound moss_brute emberhusk
    for (const t of ps) expect(pursuitSpeed(t) - STANCE_CAPS.retreat, t).toBeGreaterThanOrEqual(MIN_CLOSING_RATE - 1e-9);
  });
  it('every hostile is either a pursuer or a NAMED non-pursuer; passives are neither', () => {
    const entries = Object.entries(MOB_TYPES);
    expect(entries.length, 'empty denominator').toBeGreaterThan(0);
    for (const [t, d] of entries) expect(d.passive ? false : (pursuers().includes(t) || t in NON_PURSUERS), t).toBe(!d.passive);
    for (const [t, d] of entries) if (d.passive) expect(pursuers().includes(t), `passive ${t} counted as a pursuer`).toBe(false);
  });
  it('the brute pursues at its charge (5.4), and walks slower than the retreat cap — a named, intended exception', () => {
    expect(pursuitSpeed('moss_brute')).toBeCloseTo(5.4, 9);
    expect(MOB_TYPES.moss_brute.speed * chaseSpeedMult('moss_brute', true)).toBeLessThan(STANCE_CAPS.retreat);
  });
  it('a slower pursuer added later fails the floor instead of making the backpedal a crawl', () => {
    expect(() => deriveStanceCaps({ ...MOB_TYPES, slug: { speed: 1.2, passive: false } })).toThrow(/RETREAT_FLOOR/);
  });
  it('out of combat travel is untouched: BASE_MOVE_SPEED is still 14', () => expect(BASE_MOVE_SPEED).toBe(14));
});

describe('stanceVelocity — the radial clamp (Task 3)', () => {
  const FORMS = [0.6, 0.7, 1, 1.25, 1.4], HEAVY = [1, 0.55], DIRS = Array.from({ length: 360 }, (_, d) => d * Math.PI / 180);
  it('at w = 0 it is the identity, exactly, for every input (out-of-combat speed unchanged)', () => {
    let n = 0;
    for (const a of DIRS) for (const m of FORMS) {
      const vx = Math.cos(a) * 14 * m, vz = Math.sin(a) * 14 * m;
      const o = stanceVelocity(vx, vz, 0.6, 0.8, 0); expect(o.x).toBe(vx); expect(o.z).toBe(vz); n++;
    }
    expect(n, 'empty denominator').toBe(360 * 5);
  });
  // The lerp alone would ALSO return the input at w = 0 for finite input (v + (c - v) x 0 = v), so the case above
  // cannot tell the early return from a float coincidence. These can: a garbage away vector must not poison travel
  // out of combat, and a negative zero must pass through as itself.
  it('at w = 0 a non-finite away vector cannot reach the output, and -0 passes through as -0', () => {
    const o = stanceVelocity(5, -0, NaN, NaN, 0);
    expect(o.x).toBe(5); expect(Object.is(o.z, -0)).toBe(true);
    const p = stanceVelocity(-3, 4, Infinity, 0, 0);
    expect(p.x).toBe(-3); expect(p.z).toBe(4);
  });
  it('at w = 1 the AWAY component never exceeds the retreat cap — any key, any heading, any form, charging or not', () => {
    let n = 0;
    for (const a of DIRS) for (const m of FORMS) for (const h of HEAVY) for (const b of [0, 1.3, 2.9]) {
      const ax = Math.cos(b), az = Math.sin(b), s = 14 * m * h;
      const o = stanceVelocity(Math.cos(a) * s, Math.sin(a) * s, ax, az, 1, m, h);
      expect(o.x * ax + o.z * az).toBeLessThanOrEqual(STANCE_CAPS.retreat * h + 1e-9);
      expect(Math.abs(-o.x * az + o.z * ax)).toBeLessThanOrEqual(STANCE_CAPS.strafe * m * h + 1e-9);
      expect(-(o.x * ax + o.z * az)).toBeLessThanOrEqual(STANCE_CAPS.advance * m * h + 1e-9);
      n++;
    }
    expect(n, 'empty denominator').toBe(360 * 5 * 2 * 3);
  });
  it('a straight backpedal at 14 comes out at exactly the retreat cap; a pure strafe at exactly the strafe cap', () => {
    const b = stanceVelocity(14, 0, 1, 0, 1); expect(b.x).toBeCloseTo(2.0, 12); expect(b.z).toBeCloseTo(0, 12);
    const s = stanceVelocity(0, 14, 1, 0, 1); expect(s.x).toBeCloseTo(0, 12); expect(s.z).toBeCloseTo(6.5, 12);
  });
  // The bounds above are upper bounds only, so absolute caps would pass them. These pin the LOWER side: the clamp keeps
  // each form's pace and each walk slow instead of flattening them to 6.5 (review finding 5).
  it('the clamp keeps the pace: a pure strafe comes out at strafe x moveMult x walkMult for every form and walk slow', () => {
    for (const m of FORMS) for (const h of HEAVY) {
      const o = stanceVelocity(0, 14 * m * h, 1, 0, 1, m, h); expect(o.z).toBeCloseTo(STANCE_CAPS.strafe * m * h, 9);
    }
    expect(stanceVelocity(0, 14 * 0.6, 1, 0, 1, 0.6, 1).z).toBeLessThan(stanceVelocity(0, 14 * 1.4, 1, 0, 1, 1.4, 1).z); // golem < comet
  });
  it('the retreat is form-invariant and the walk slow survives it: a straight backpedal is retreat x walkMult for every form', () => {
    for (const m of FORMS) for (const h of HEAVY) expect(stanceVelocity(14 * m * h, 0, 1, 0, 1, m, h).x).toBeCloseTo(STANCE_CAPS.retreat * h, 9);
  });
  it('a threat with no direction caps the total speed and makes no NaN', () => {
    const o = stanceVelocity(14, 0, 0, 0, 1); expect(Number.isFinite(o.x) && Number.isFinite(o.z)).toBe(true);
    expect(Math.hypot(o.x, o.z)).toBeCloseTo(6.5, 9);
  });
  it('blends linearly in w', () => expect(stanceVelocity(14, 0, 1, 0, 0.5).x).toBeCloseTo(8.0, 9));
  it('writes into the `out` it is handed (allocation-free) and returns it', () => {
    const out = { x: 0, z: 0 };
    expect(stanceVelocity(14, 0, 1, 0, 1, 1, 1, STANCE_CAPS, out)).toBe(out);
    expect(out.x).toBeCloseTo(2.0, 12);
    expect(stanceVelocity(3, 4, 1, 0, 0, 1, 1, STANCE_CAPS, out)).toBe(out);
    expect(out).toEqual({ x: 3, z: 4 });
  });
});

// Task 4. `player` is the point mobs measure the player from (mobSensePoint, the camera: the plan's height-reference
// deviation), so every dy below is measured the way the worker measures it. stanceStep's state is a module singleton,
// so every case starts from resetStance(). "Qualified THIS frame" is read as `lastEngagedAt === now`: `engaged` alone
// cannot show it, because the calm holds `engaged` for CALM_MS after the last qualifying frame.
describe('stanceStep — engage, calm, blend (Task 4)', () => {
  let nextId = 0;
  const mob = ({ x, y = 0, z = 0, aggro = true, passive = false, health = 50, type = 'zombie', dyingUntil } = {}) => ({
    id: `m${++nextId}`, isMob: true, type, passive, isAggro: aggro, health, dyingUntil, position: { x, y, z },
  });
  const P = Object.freeze({ x: 0, y: 0, z: 0 });
  const step = (mobs, now, player = P, dt = 1 / 60) => stanceStep(getStance(), mobs, player, now, dt);
  const qualifies = (mobs, now, player = P) => step(mobs, now, player).lastEngagedAt === now;
  const once = (m) => { resetStance(); return step([m], 0).engaged; };

  it('engages on an aggro\'d hostile at 11.9 m and not at 12.1 m (horizontal distance)', () => {
    expect(once(mob({ x: 11.9 }))).toBe(true);
    expect(once(mob({ x: 12.1 }))).toBe(false);
    expect(once(mob({ x: 8.4, z: 8.4 }))).toBe(true); // 11.88 m on a diagonal
    expect(once(mob({ x: 11.9, y: 2 }))).toBe(true); // 3D 12.07 m: a 3D radius would refuse it
  });

  it('ignores a hostile beyond its own vertical reach — the reach the worker strikes with', () => {
    const at = (type, y) => once(mob({ x: 5, y, type }));
    expect(at('zombie', 2.4)).toBe(true); expect(at('zombie', 2.6)).toBe(false);
    expect(at('zombie', -2.4)).toBe(true); expect(at('zombie', -2.6)).toBe(false); // above the player, too
    expect(at('moss_brute', 3.1)).toBe(true); expect(at('moss_brute', 3.3)).toBe(false);
    expect(at('spider', 5.9)).toBe(true); expect(at('spider', 6.1)).toBe(false);
    expect(at('skitterling', 2.6)).toBe(false);
    expect([engageDyM('zombie'), engageDyM('moss_brute'), engageDyM('spider')]).toEqual([2.5, 3.2, 6]);
  });

  it('ignores passive, un-aggro\'d, dead and dying (dyingUntil) mobs', () => {
    expect(once(mob({ x: 5 })), 'control: the same factory, hostile and aggro\'d').toBe(true);
    expect(once(mob({ x: 5, passive: true }))).toBe(false);
    expect(once(mob({ x: 5, aggro: false }))).toBe(false);
    expect(once(mob({ x: 5, health: 0 }))).toBe(false);
    expect(once(mob({ x: 5, dyingUntil: 123 }))).toBe(false);
  });

  it('a skeleton never engages', () => {
    for (const x of [10, 5]) {
      resetStance();
      expect(once(mob({ x })), `control: a husk at ${x} m`).toBe(true);
      resetStance();
      const s = mob({ x, type: 'skeleton' });
      for (let f = 0; f <= 120; f++) step([s], f * 1000 / 60);
      expect(getStance().engaged, `skeleton at ${x} m`).toBe(false);
      expect(getStance().w).toBe(0);
    }
  });

  it('a stranded mob stops qualifying after STALL_MS, and engaged leaves CALM_MS later', () => {
    resetStance();
    const h = [mob({ x: 8 })]; // outside the husk's melee reach + margin (3.5 m), never moving
    for (const t of [0, 500, 1000, 1499]) expect(qualifies(h, t), `t=${t}`).toBe(true);
    expect(qualifies(h, 1501)).toBe(false);
    expect(step(h, 3498).engaged).toBe(true);
    expect(step(h, 3500).engaged).toBe(false);
    expect(STALL_MS).toBe(1500);
  });

  it('a mob closing by its own steps keeps qualifying', () => {
    resetStance();
    const m = mob({ x: 11 });
    for (let t = 0; t <= 5000; t += 100) {
      m.position.x = 11 - 0.6 * Math.floor(t / 1000); // 0.6 m toward the player every 1000 ms
      expect(qualifies([m], t), `t=${t}`).toBe(true);
    }
  });

  it('the player\'s own approach is not the mob\'s progress', () => {
    resetStance();
    const h = [mob({ x: 8 })];
    let last = null;
    for (let t = 0; t <= 1600; t += 100) last = qualifies(h, t, { x: 3 * t / 1600, y: 0, z: 0 }); // 3 m toward it
    expect(last, 'the husk never moved, so the player walking up to 5 m of it must not keep it qualified').toBe(false);
  });

  it('a mob inside its melee reach qualifies while standing still (the brute\'s own reach; a spider\'s leap)', () => {
    for (const [type, x] of [['zombie', 2.0], ['zombie', 3.4], ['moss_brute', 4.1], ['spider', 5.5]]) {
      resetStance();
      const h = [mob({ x, type })];
      for (let t = 0; t <= 5000; t += 100) expect(qualifies(h, t), `${type} at ${x} m, t=${t}`).toBe(true);
    }
    resetStance();
    const out = [mob({ x: 3.6 })]; // just outside the husk's 2.5 + 1.0
    for (let t = 0; t < 1500; t += 100) step(out, t);
    expect(qualifies(out, 1600), 'control: a husk at 3.6 m does stall').toBe(false);
  });

  it('a stranded mob flickering across the engage radius still stalls (its clock is not restarted)', () => {
    resetStance();
    const h = [mob({ x: 12.05 })];
    for (let t = 0, i = 0; t <= 3600; t += 50, i++) step(h, t, { x: i % 2 ? 0.2 : 0, y: 0, z: 0 }); // 11.85 / 12.05 m
    expect(getStance().lastEngagedAt).toBeLessThan(1500);
    expect(getStance().engaged, 'released within STALL_MS + CALM_MS').toBe(false);
  });

  it('a mob that stops being an aggro\'d hostile loses its stall clock', () => {
    resetStance();
    const m = mob({ x: 8 });
    for (let t = 0; t <= 1400; t += 100) step([m], t);
    m.isAggro = false; step([m], 1450);
    m.isAggro = true;
    for (let t = 1500; t <= 2900; t += 100) expect(qualifies([m], t), `t=${t}`).toBe(true);
  });

  it('stays engaged for CALM_MS after the last engaged frame, then leaves', () => {
    resetStance();
    expect(step([mob({ x: 5 })], 0).engaged).toBe(true);
    expect(step([], 1999).engaged).toBe(true);
    expect(step([], 2001).engaged).toBe(false);
    expect(CALM_MS).toBe(2000);
  });

  it('w reaches 1 after ENTER_S and returns to 0 after EXIT_S (dt 1/60)', () => {
    resetStance();
    const h = [mob({ x: 5 })];
    let f = 0;
    const tick = (mobs) => step(mobs, (f++) * 1000 / 60);
    for (let i = 0; i < 11; i++) tick(h);
    expect(getStance().w).toBeGreaterThan(0.9); expect(getStance().w).toBeLessThan(1);
    tick(h); tick(h);
    expect(getStance().w).toBe(1);
    while (tick([]).engaged) expect(getStance().w).toBe(1); // the calm holds the stance at full weight
    for (let i = 1; i < 35; i++) tick([]);
    expect(getStance().w).toBeGreaterThan(0); expect(getStance().w).toBeLessThan(0.1);
    tick([]); tick([]); tick([]);
    expect(getStance().w).toBe(0);
    expect([getStance().threatId, getStance().awayX, getStance().awayZ], 'out of combat, no threat is kept').toEqual([null, 0, 0]);
    expect([ENTER_S, EXIT_S]).toEqual([0.2, 0.6]);
  });

  it('keeps its threat until another is a metre nearer', () => {
    resetStance();
    const east = mob({ x: 5 }), west = mob({ x: -4.5 });
    expect(step([east], 0).threatId).toBe(east.id);
    expect(step([east, west], 16).threatId, 'west at 4.5 m is only 0.5 m nearer').toBe(east.id);
    expect(getStance().awayX).toBeCloseTo(-1, 12);
    west.position.x = -3.9;
    expect(step([east, west], 33).threatId, 'west at 3.9 m is 1.1 m nearer').toBe(west.id);
    expect(getStance().awayX).toBeCloseTo(1, 12);
    expect(step([east], 50).threatId, 'the threat no longer qualifies: the nearest takes over at once').toBe(east.id);
  });

  it('away points from the threat to the player, unit length, from the positions it records', () => {
    resetStance();
    const player = { x: 1, y: 7, z: 1 };
    const s = step([mob({ x: 3, y: 7, z: 4 })], 0, player);
    expect(s.awayX).toBeCloseTo(-2 / Math.sqrt(13), 12); expect(s.awayZ).toBeCloseTo(-3 / Math.sqrt(13), 12);
    expect(Math.hypot(s.awayX, s.awayZ)).toBeCloseTo(1, 12);
    expect([s.threatX, s.threatZ, s.playerX, s.playerY, s.playerZ]).toEqual([3, 4, 1, 7, 1]);
    resetStance();
    const o = step([mob({ x: 0.0005 })], 0); // on the player's column: no direction
    expect(o.engaged).toBe(true);
    expect([o.awayX, o.awayZ]).toEqual([0, 0]);
  });

  it('stanceStep returns the live singleton, counts frames, and resetStance zeroes w and engaged', () => {
    resetStance();
    const s = getStance();
    const f0 = s.frame;
    for (let f = 0; f < 15; f++) expect(step([mob({ x: 5 })], f * 1000 / 60)).toBe(s);
    expect(s.frame - f0).toBe(15);
    expect(s.w).toBe(1); expect(s.engaged).toBe(true);
    resetStance();
    expect(getStance()).toBe(s);
    expect([s.w, s.engaged, s.threatId, s.awayX, s.awayZ]).toEqual([0, false, null, 0, 0]);
    expect(step([], 300).engaged, 'no calm carried across a reset').toBe(false);
    const h = [mob({ x: 8 })];
    for (let t = 1000; t <= 2600; t += 100) step(h, t); // stalled by now
    resetStance();
    expect(qualifies(h, 2700), 'the reset clears the stall clocks too').toBe(true);
  });
});

// Task 5: the controller's own record of what it commanded, read by the e2e (readMoveTarget). The e2e's identity case
// compares rawX/Z with targetX/Z by Object.is, so a field written to the wrong slot would make it lie.
describe('noteMoveTarget / readMoveTarget — the controller\'s move-target record (Task 5)', () => {
  it('records raw and final targets with the stance frame, in one live object rewritten in place', () => {
    resetStance();
    stanceStep(getStance(), [], { x: 0, y: 0, z: 0 }, 0, 1 / 60);
    const f = getStance().frame;
    noteMoveTarget(1, -2, 0.5, -0.25, 0.75);
    const r = readMoveTarget();
    expect(r).toEqual({ rawX: 1, rawZ: -2, targetX: 0.5, targetZ: -0.25, w: 0.75, frame: f });
    stanceStep(getStance(), [], { x: 0, y: 0, z: 0 }, 16, 1 / 60);
    noteMoveTarget(3, 4, 5, 6, 0);
    expect(readMoveTarget()).toBe(r);
    expect(r).toEqual({ rawX: 3, rawZ: 4, targetX: 5, targetZ: 6, w: 0, frame: f + 1 });
  });
});
