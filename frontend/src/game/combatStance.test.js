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
//   Round-1 review pins (2026-10-28, 33 tests): A4 the advance capped at the retreat cap -> RED; A3 the total speed
//   also capped at the strafe cap -> RED; A1 the no-direction cap applied per world axis -> RED; A0 identity (a comment
//   edit) -> survived.
//   Round-1 review c/d, the controller's seam (stanceFrame / stanceWalk; 37 tests): C1 the ramp fed the raw move after
//   the record -> RED; C2 the target recorded as applied -> RED; C3 the form and walk multipliers swapped -> RED; C4 the
//   height measured 1.2 m under the sense point (review H-b) -> RED; C5 a copy of the stance stepped -> RED; C6 the
//   stance's output ignored -> RED; C7 the clamped target scaled by 0.9 -> RED; C0 identity -> survived. The record's
//   N1-N4 receipts above were taken on its five-argument form; the case now checks the applied slots too.
//   Round-1 review b, the F1 bound over a frame-interval sweep (39 tests). RED FIRST on the shipped code: the player's own
//   step left the husk at 2.49 m/s (S+D, 8 ms frames) up to 6.57 m/s (400 ms), against the 2.0 cap. Then, each against a
//   green baseline: B1 the stance point's x/z from the camera again -> RED; B2 the step bound dropped -> RED; B3 the
//   bound's limit without the walk slow -> RED (the heavy-charge case); B4 the tangential part not pulled in -> RED; B5
//   stanceWalk passes no gap and no dt -> RED; B6 the limit at half the retreat (a blanket slow) -> RED; B7 the gap
//   1 m long -> RED; B0 identity -> survived.
//   Round-1 review f (40 tests): T2 teleportPlayer keeps the stance -> RED; T3 it never stops the body -> RED; the save
//   load's own call is tests/store/stance-teleport.test.js.
//   Round-2 review, the bound on the velocity the body is fed (43 tests). RED FIRST on 60665da1: through strafe
//   reversals the velocity stanceWalk returned left the husk at up to 4.381 m/s (S+D / S+A every 100 ms, 8 ms frames;
//   4.626 at 150 ms) and 2.483 on a release, 27 of 48 runs over the cap; and the blend-in case read 12.5 for 9.875. Then
//   holdStepBound, each mutant against a green baseline: R1 the call dropped -> RED; R2 the bound hard at every weight
//   -> RED; R3 the bound only at w === 1 -> RED; R4 the allowed reach without the target's own (a double blend) -> RED;
//   R5 the limit without the walk slow -> RED (the heavy reversal); R6 the tangential part not pulled in -> RED; R7 the
//   record written before the bound -> RED; R8 stanceVelocity re-run on the ramped velocity (the review's suggested
//   form, which blends twice) -> RED; R9 the bound only while the stick moves -> RED; R10 the hard limit dropped -> RED;
//   R11 the weight inverted, 1 - w -> RED; R12 the limit 1.5x the retreat cap -> RED; R0 identity (a comment edit) ->
//   survived.
import { describe, it, expect } from 'vitest';
import {
  STANCE_CAPS, MIN_CLOSING_RATE, NON_PURSUERS, pursuitSpeed, pursuers, deriveStanceCaps, BASE_MOVE_SPEED,
  stanceVelocity, stanceStep, getStance, resetStance, engageDyM, STALL_MS, CALM_MS, ENTER_S, EXIT_S,
  noteMoveTarget, readMoveTarget, stanceFrame, stanceWalk, teleportPlayer, dodgeBurst,
} from './combatStance.js';
import { mobSensePoint } from './mobSenses.js';
import { moveVector } from './locomotion.js';
import { rampVelocity, ACCEL_RATE, DECEL_RATE } from './gameFeel.js';
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
  // Round-1 review (dynamic, A4): the w = 1 sweep bounds the advance from ABOVE only, so an advance capped at the 2.0
  // retreat cap passed every test. Closing on an enemy is the footwork pace, 6.5 x the form x the walk slow.
  it('a straight advance at 14 comes out at exactly the advance cap, for every form and walk slow', () => {
    const a = stanceVelocity(-14, 0, 1, 0, 1); expect(a.x).toBeCloseTo(-6.5, 12); expect(a.z).toBeCloseTo(0, 12);
    for (const m of FORMS) for (const h of HEAVY) {
      expect(stanceVelocity(-14 * m * h, 0, 1, 0, 1, m, h).x).toBeCloseTo(-STANCE_CAPS.advance * m * h, 9);
    }
  });
  // Round-1 review (dynamic, A1 and A3): every input above lies on an axis, where a per-axis clamp, a radial one and a
  // total-speed cap all agree. A diagonal separates them: engaging mid-run keeps hypot(2.0, 6.5) = 6.8 m/s (the plan's
  // FOV note), and a threat with no direction caps the TOTAL, not each world axis.
  it('a diagonal comes out at exactly (retreat, strafe) with a direction, and at the strafe cap in total without one', () => {
    const d = stanceVelocity(14 * Math.SQRT1_2, 14 * Math.SQRT1_2, 1, 0, 1);
    expect(d.x).toBeCloseTo(2.0, 12); expect(d.z).toBeCloseTo(6.5, 12);
    const n = stanceVelocity(14 * Math.SQRT1_2, 14 * Math.SQRT1_2, 0, 0, 1);
    expect(Math.hypot(n.x, n.z)).toBeCloseTo(6.5, 12);
    expect(n.x).toBeCloseTo(n.z, 12); // the direction is kept
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
  it('records raw, target and applied with the stance frame, in one live object rewritten in place', () => {
    resetStance();
    stanceStep(getStance(), [], { x: 0, y: 0, z: 0 }, 0, 1 / 60);
    const f = getStance().frame;
    noteMoveTarget(1, -2, 0.5, -0.25, 0.125, -0.0625, 0.75);
    const r = readMoveTarget();
    expect(r).toEqual({ rawX: 1, rawZ: -2, targetX: 0.5, targetZ: -0.25, appliedX: 0.125, appliedZ: -0.0625, w: 0.75, frame: f });
    stanceStep(getStance(), [], { x: 0, y: 0, z: 0 }, 16, 1 / 60);
    noteMoveTarget(3, 4, 5, 6, 7, 8, 0);
    expect(readMoveTarget()).toBe(r);
    expect(r).toEqual({ rawX: 3, rawZ: 4, targetX: 5, targetZ: 6, appliedX: 7, appliedZ: 8, w: 0, frame: f + 1 });
  });
});

// Round-1 review c and d: the controller's call sites, as a seam. Components.jsx calls stanceFrame once a frame and
// stanceWalk in the pointer-locked branch; everything between its inputs and the velocity it feeds the KCC is here.
describe('stanceFrame / stanceWalk — the controller\'s seam (round-1 review c, d)', () => {
  let nextId = 0;
  const husk = (x, z, y = 51.7) => ({ id: `s${++nextId}`, isMob: true, type: 'zombie', passive: false, isAggro: true, health: 50, position: { x, y, z } });
  const cam = (x, y, z) => ({ position: { x, y, z } });
  const MOVING = (x, z) => ({ x, z, moving: true });
  // Engaged at full weight against a husk 3 m along -x from a player at the origin: away is +x.
  const engaged = () => {
    resetStance();
    const mobs = [husk(-3, 0)];
    let st;
    for (let t = 0; t <= 400; t += 16) st = stanceFrame(mobs, { x: 0, y: 50.5, z: 0 }, cam(0, 51.7, 0), t, 1 / 60);
    expect([st.w, st.awayX, st.awayZ], 'SETUP: the stance did not engage at full weight with away +x').toEqual([1, 1, 0]);
    return st;
  };

  it('stanceFrame steps the LIVE stance and measures the height from the point the worker strikes from', () => {
    resetStance();
    const c = cam(0, 51.7, 0);
    const st = stanceFrame([], { x: 0, y: 50.5, z: 0 }, c, 0, 1 / 60);
    expect(st).toBe(getStance());
    expect(st.playerY, 'the stance measured the player from a height the AI worker does not strike from').toBe(mobSensePoint(c).y);
  });

  it('stanceWalk feeds the ramp the CLAMPED target and returns, and records, what the ramp gave', () => {
    const st = engaged();
    // Settled at the retreat cap: a held backpedal at 14 stays at exactly 2.0, it does not ramp toward 14.
    const v = stanceWalk(MOVING(14, 0), st, { moveMult: 1 }, 1, { x: 2, z: 0 }, 1 / 60);
    expect([v.x, v.z], 'the velocity handed to the KCC is not the clamped one').toEqual([2, 0]);
    const r = readMoveTarget();
    expect([r.rawX, r.targetX, r.appliedX, r.appliedZ, r.w]).toEqual([14, 2, 2, 0, 1]);
    // From rest the ramp is visible: 60 u/s² over 1/60 s is 1 m/s, toward the clamped 2.0.
    const u = stanceWalk(MOVING(14, 0), st, { moveMult: 1 }, 1, { x: 0, z: 0 }, 1 / 60);
    expect(u.x).toBeCloseTo(1, 12);
    expect(readMoveTarget().appliedX).toBe(u.x);
    expect(readMoveTarget().targetX).toBe(2);
  });

  it('stanceWalk passes the form and the walk slow in their own places: a comet retreats at 2.0, a heavy charge at 1.1', () => {
    // Full weight, away +x, and no gap, so the step bound (its own describe below) stays out of the reading.
    const st = { w: 1, awayX: 1, awayZ: 0, gap: 0 };
    const SNAP = 1; // a 1 s frame: the ramp reaches the target, so the target is read directly
    const comet = stanceWalk(MOVING(14 * 1.4, 0), st, { moveMult: 1.4 }, 1, { x: 0, z: 0 }, SNAP);
    expect(comet.x, 'a beast form outwalked the fight (the form multiplier reached the retreat cap)').toBeCloseTo(STANCE_CAPS.retreat, 12);
    const cometStrafe = stanceWalk(MOVING(0, 14 * 1.4), st, { moveMult: 1.4 }, 1, { x: 0, z: 0 }, SNAP);
    expect(cometStrafe.z, 'the form lost its pace').toBeCloseTo(STANCE_CAPS.strafe * 1.4, 12);
    const charging = stanceWalk(MOVING(14 * 0.55, 0), st, { moveMult: 1 }, 0.55, { x: 0, z: 0 }, SNAP);
    expect(charging.x, 'the heavy\'s walk slow did not reach the retreat').toBeCloseTo(STANCE_CAPS.retreat * 0.55, 12);
  });

  // Round-1 review f: the void-fall guard and a save load teleported the body and kept the stance, so the walk at the
  // new site stayed clamped against the old fight for up to 2.6 s. Both now go through teleportPlayer.
  it('teleportPlayer moves the body, stops it when asked, and leaves the fight behind', () => {
    engaged();
    const calls = [];
    const rb = { setTranslation: (p, wake) => calls.push(['at', p, wake]), setLinvel: (v, wake) => calls.push(['vel', v, wake]) };
    teleportPlayer(rb, { x: 0, y: 120, z: 0 }, true);
    expect(calls).toEqual([['at', { x: 0, y: 120, z: 0 }, true], ['vel', { x: 0, y: 0, z: 0 }, true]]);
    const s = getStance();
    expect([s.w, s.engaged, s.threatId, s.awayX, s.awayZ, s.gap], 'the stance came along on the teleport').toEqual([0, false, null, 0, 0, 0]);
    // the next frame at the new site, with no mob near: no calm carried, no clamp
    const after = stanceFrame([], { x: 0, y: 120, z: 0 }, cam(0, 121.2, 0), 1000, 1 / 60);
    expect([after.engaged, after.w]).toEqual([false, 0]);
    const v = stanceWalk(MOVING(14, 0), after, { moveMult: 1 }, 1, { x: 14, z: 0 }, 1 / 60);
    expect(v.x, 'the walk at the new site was clamped against the old fight').toBe(14);
    calls.length = 0;
    engaged();
    teleportPlayer(rb, { x: 5, y: 60, z: 5 });
    expect(calls.map((c) => c[0]), 'a teleport without stop touched the velocity').toEqual(['at']);
    expect(getStance().engaged).toBe(false);
  });

  it('out of combat stanceWalk hands the ramp moveVector\'s output exactly, and a still stick ramps to 0', () => {
    resetStance();
    const st = stanceFrame([], { x: 0, y: 50.5, z: 0 }, cam(0, 51.7, 0), 0, 1 / 60);
    expect(st.w).toBe(0);
    stanceWalk(MOVING(-9.899494936611665, 9.899494936611665), st, { moveMult: 1 }, 1, { x: 0, z: 0 }, 1 / 60);
    const r = readMoveTarget();
    expect(Object.is(r.targetX, r.rawX) && Object.is(r.targetZ, r.rawZ), 'out of combat the target is not moveVector\'s').toBe(true);
    const still = stanceWalk({ x: 0, z: 0, moving: false }, st, { moveMult: 1 }, 1, { x: 3, z: 0 }, 1 / 60);
    expect(still.x).toBeCloseTo(1.5, 12); // 90 u/s² down
    expect([readMoveTarget().targetX, readMoveTarget().targetZ]).toEqual([0, 0]);
  });
});

// Round-1 review b: F1's derivation assumed the tangential part "does not enter at all", which holds for a continuous,
// fresh line to the threat. The controller is discrete: within a frame the body moves in a straight line, so a
// tangential step L at gap g grows the gap by about L²/2g, and the away vector was built from the camera, which trails
// the body by about 1.2 frames, so strafe leaked into retreat at about 1.7 t² dt / g. The F1 bound is that the player's
// OWN step never takes the body further from the threat than retreat x dt. This drives the controller's frame as
// Components.jsx runs it: stanceFrame with this frame's body and the camera as the follow leaves it (lerped 0.85 toward
// the PRE-move body, + 1.2), moveVector in a view kept on (or turned from) the husk, stanceWalk, then the body steps by
// the applied velocity. The husk chases at its pursuit speed straight at the body AFTER the player's step, so it keeps
// qualifying; the bound is read across the player's step alone.
// WHAT THIS PROVES IS THE PLAYER'S HALF OF F1 ONLY, AT FULL STANCE WEIGHT: the player's own step never leaves the husk
// faster than the retreat cap on a frame judged at w = 1, outside a dodge's decay. The enter and exit blends (w < 1)
// are judged only by the blend cases at the end. F1 also needs the husk to close, and that is NOT MODELLED here: the husk moves at its full
// pursuit speed every frame, while the real AI worker caps a tick at 0.25 s (AIWorkerSystem.jsx), so above 250 ms
// frames a husk covers speed x 0.25 / dt per second and above 375 ms a 3.0 m/s husk cannot close on a 2.0 backpedal at
// all; and its aim is refreshed at 15 Hz on octile A* cell centres, which lowers its closing speed further. The mob's
// side is tests/gates/stance-pursuit-gates.test.js (the real worker). NOR THE KCC: the body steps by the applied
// velocity unobstructed, and the character controller's slide along a wall can raise a step's away part (round-2 review,
// unmeasured), so the bound is on the velocity FED to the KCC, not on the movement it returns.
describe('the F1 bound on the player\'s own step, at every frame interval (round-1 review b, round-2)', () => {
  const DTS = [1 / 120, 1 / 60, 1 / 30, 0.05, 0.1, 0.2, 0.3, 0.4];
  const CASES = [
    { name: 'S+D, view on the husk', keys: { moveB: true, moveR: true }, face: 1 },
    { name: 'D, view on the husk', keys: { moveR: true }, face: 1 },
    { name: 'S, view on the husk', keys: { moveB: true }, face: 1 },
    { name: 'W+D, view turned from the husk', keys: { moveF: true, moveR: true }, face: -1 },
    { name: 'S+D charging a heavy', keys: { moveB: true, moveR: true }, face: 1, walk: 0.55 },
  ];
  const SETTLE_S = 0.3;
  // A dodge's burst at its last frame (dodgeSpeed near the end of its 0.4 s at 60 fps), straight away from the husk.
  const DODGE_END = 10.75;
  // `keys` is a key set, or a function (frame, dt) -> key set for a sequence that changes them. `form` is a beast form's
  // pace (its moveMult), `turn` turns the view at that many rad/s, and `dodgeAtS` ends a dodge at that time: that frame
  // starts from the burst the controller leaves in planarVel.
  function run(dt, { keys, face, walk = 1, form = 1, turn = 0, dodgeAtS = null }) {
    resetStance();
    const mob = { id: 'f1', isMob: true, type: 'zombie', passive: false, isAggro: true, health: 50, position: { x: 0, y: 50.5, z: -3 } };
    const body = { x: 0, y: 50.5, z: 0 };
    const camera = { position: { x: 0, y: 51.7, z: 0 } };
    const chase = pursuitSpeed('zombie');
    let vel = { x: 0, z: 0 }, now = 10000, worst = -Infinity, worstV = -Infinity, judged = 0, gapMax = 0;
    // non-vacuity, read on the judged frames: how often the keys changed, how often the applied strafe changed side,
    // the slowest applied speed, and how many frames the record disagreed with what stanceWalk returned
    let keyFlips = 0, tanFlips = 0, minSpeed = Infinity, recordOff = 0, lastKeys = null, lastTan = 0;
    // The bound's shape, on the judged frames: how often it changed what the ramp gave, and how often the step it left
    // did not end on the ray from the threat through the ramp's own step end (the pull-in is radial).
    let engaged = 0, offRay = 0;
    // A dodge's decay, against this test's own reading of it: the burst is spent once the slower ramp rate has taken
    // its largest axis, or once the ramp reaches its target, whichever is first. Until then the walk must be exactly
    // the plain ramp (carryOff counts the frames that were not); after, it is judged like any other walk.
    // A frame that starts within 1e-9 s of the window's end is judged by neither rule: the seam counts the window down
    // by subtraction, and the two readings may round apart there.
    let dodgeAt = -1, windowS = 0, carrying = false, carryFrames = 0, carryOff = 0, carryPeak = -Infinity;
    const frames = Math.ceil(3 / dt);
    for (let f = 0; f < frames; f++) {
      const k = typeof keys === 'function' ? keys(f, dt) : keys;
      const st = stanceFrame([mob], body, camera, now, dt);
      const lx = mob.position.x - camera.position.x, lz = mob.position.z - camera.position.z;
      const c = Math.cos(turn * f * dt), s = Math.sin(turn * f * dt);
      const mv = moveVector(face * (lx * c - lz * s), face * (lx * s + lz * c), k, BASE_MOVE_SPEED * form * walk);
      const px = body.x - mob.position.x, pz = body.z - mob.position.z;
      const g0 = Math.hypot(px, pz);
      // the away direction THIS test rebuilds from the raw positions the frame's step starts from, never st.awayX/Z
      const ux = px / g0, uz = pz / g0;
      if (dodgeAtS !== null && dodgeAt < 0 && f * dt >= dodgeAtS) {
        vel = dodgeBurst(ux * DODGE_END, uz * DODGE_END);
        dodgeAt = f; carrying = true;
        windowS = (DODGE_END * Math.max(Math.abs(ux), Math.abs(uz))) / Math.min(ACCEL_RATE, DECEL_RATE);
      }
      const edge = carrying && Math.abs((f - dodgeAt) * dt - windowS) < 1e-9;
      if (carrying && (f - dodgeAt) * dt >= windowS - 1e-9) carrying = false;
      const prev = vel;
      vel = stanceWalk(mv, st, { moveMult: form }, walk, vel, dt);
      const r = readMoveTarget();
      const plain = rampVelocity(prev, { x: r.targetX, z: r.targetZ }, dt);
      const carried = carrying || edge;
      if (carrying) {
        carryFrames++;
        if (vel.x !== plain.x || vel.z !== plain.z) carryOff++;
        carryPeak = Math.max(carryPeak, vel.x * ux + vel.z * uz);
        if (plain.x === r.targetX && plain.z === r.targetZ) carrying = false;
      }
      // the follow: Components.jsx lerps the camera toward the body translation read BEFORE this frame's step lands
      camera.position.x += (body.x - camera.position.x) * 0.85;
      camera.position.z += (body.z - camera.position.z) * 0.85;
      body.x += vel.x * dt; body.z += vel.z * dt;
      const g1 = Math.hypot(body.x - mob.position.x, body.z - mob.position.z);
      if (st.w === 1 && f * dt >= SETTLE_S && !carried) {
        worst = Math.max(worst, (g1 - g0) / dt);
        worstV = Math.max(worstV, vel.x * ux + vel.z * uz);
        judged++;
        if (lastKeys !== null && k !== lastKeys) keyFlips++;
        const tan = -vel.x * uz + vel.z * ux;
        if (Math.abs(tan) > 0.5) { if (lastTan !== 0 && Math.sign(tan) !== lastTan) tanFlips++; lastTan = Math.sign(tan); }
        minSpeed = Math.min(minSpeed, Math.hypot(vel.x, vel.z));
        if (r.appliedX !== vel.x || r.appliedZ !== vel.z) recordOff++;
        lastKeys = k;
        if (vel.x !== plain.x || vel.z !== plain.z) {
          engaged++;
          const ex = px + plain.x * dt, ez = pz + plain.z * dt, fx = px + vel.x * dt, fz = pz + vel.z * dt;
          if (Math.abs(ex * fz - ez * fx) > 1e-9 * Math.hypot(ex, ez) * Math.hypot(fx, fz) || ex * fx + ez * fz <= 0) offRay++;
        }
      }
      // the husk closes straight on the body, and stops at 1 m
      const step = Math.min(chase * dt, Math.max(0, g1 - 1));
      mob.position.x += ((body.x - mob.position.x) / g1) * step; mob.position.z += ((body.z - mob.position.z) / g1) * step;
      gapMax = Math.max(gapMax, g1);
      now += dt * 1000;
    }
    return {
      worst, worstV, judged, gapMax, frames, keyFlips, tanFlips, minSpeed, recordOff, engaged, offRay, carryFrames, carryOff, carryPeak,
      dodged: dodgeAt >= 0, cap: STANCE_CAPS.retreat * walk,
    };
  }

  it('the player\'s own step never leaves the husk faster than the retreat cap, from 8 ms to 400 ms frames, any keys', () => {
    const rows = [];
    for (const c of CASES) for (const dt of DTS) rows.push({ c, dt, ...run(dt, c) });
    const table = rows.map((r) => `${r.c.name} @${Math.round(r.dt * 1000)} ms: ${r.worst.toFixed(3)} m/s`).join('; ');
    console.info(`[stance F1] ${rows.length} (keys x frame interval) runs, worst away rate of the player's own step: ${table}`);
    expect(rows.length, 'the sweep shrank').toBe(CASES.length * DTS.length);
    for (const r of rows) {
      const at = `${r.c.name} at a ${Math.round(r.dt * 1000)} ms frame`;
      expect(r.judged, `SETUP: ${at}: no frame at full weight was judged`).toBeGreaterThan(0);
      expect(r.gapMax, `SETUP: ${at}: the husk left the engage radius`).toBeLessThan(12);
    }
    const over = rows.filter((r) => r.worst > r.cap + 1e-9);
    expect(over.map((r) => `${r.c.name} @${Math.round(r.dt * 1000)} ms ${r.worst.toFixed(3)} (cap ${r.cap})`), `the body left the husk faster than the retreat cap — ${table}`).toEqual([]);
  });

  it('a held pure backpedal still retreats at the full cap at every frame interval (the bound is not a blanket slow)', () => {
    for (const dt of DTS) {
      const r = run(dt, CASES[2]);
      expect(r.worst, `S at ${Math.round(dt * 1000)} ms`).toBeGreaterThan(STANCE_CAPS.retreat - 1e-6);
    }
  });

  // rampVelocity runs per WORLD axis after the stance's clamp, so when the target turns (the strafe changes side, the
  // keys are released mid-strafe, the view turns) the two axes ramp at different rates and the velocity the body is fed
  // leans away from the threat, or overshoots sideways at close range so the step ends further out while the velocity
  // itself points across or in. These sequences change the keys every `period` (at least every frame, so a long frame
  // still sees them change) and judge what stanceWalk RETURNS, the velocity the controller feeds the KCC: its away
  // component, and the away rate of the step it makes. The form rows run at the form's pace, because the retreat cap is
  // form-invariant while the strafe it ramps out of is not.
  const every = (period, a, b) => (f, dt) => (Math.floor(f / Math.max(1, Math.round(period / dt))) % 2 === 0 ? a : b);
  const SD = { moveB: true, moveR: true }, SA = { moveB: true, moveL: true };
  const WD = { moveF: true, moveR: true }, WA = { moveF: true, moveL: true };
  const REVERSALS = [
    { name: 'S+D / S+A every 100 ms, view on the husk', keys: every(0.1, SD, SA), face: 1, follows: 'reverse' },
    { name: 'S+D / S+A every 150 ms, view on the husk', keys: every(0.15, SD, SA), face: 1, follows: 'reverse' },
    { name: 'D / A every 100 ms, view on the husk', keys: every(0.1, { moveR: true }, { moveL: true }), face: 1, follows: 'reverse' },
    { name: 'W+D / W+A every 100 ms, view turned from the husk', keys: every(0.1, WD, WA), face: -1, follows: 'reverse' },
    { name: 'S+D / released every 100 ms, view on the husk', keys: every(0.1, SD, {}), face: 1, follows: 'release' },
    { name: 'S+D / S+A every 100 ms charging a heavy', keys: every(0.1, SD, SA), face: 1, walk: 0.55, follows: 'reverse' },
    { name: 'S+D / S+A every 100 ms, view turned from the husk', keys: every(0.1, SD, SA), face: -1, follows: 'reverse' },
    { name: 'W+D / W+A every 100 ms, view on the husk', keys: every(0.1, WD, WA), face: 1, follows: 'reverse' },
    { name: 'S held, the view turning at 6 rad/s', keys: { moveB: true }, face: 1, turn: 6, follows: 'turn' },
    { name: 'S+D / S+A every 100 ms as the comet (1.4)', keys: every(0.1, SD, SA), face: 1, form: 1.4, follows: 'reverse' },
    { name: 'S+D / S+A every 100 ms as the hawk (1.25)', keys: every(0.1, SD, SA), face: 1, form: 1.25, follows: 'reverse' },
    { name: 'S+D / S+A every 100 ms as the bull (0.7)', keys: every(0.1, SD, SA), face: 1, form: 0.7, follows: 'reverse' },
    { name: 'S+D / S+A every 100 ms as the golem (0.6)', keys: every(0.1, SD, SA), face: 1, form: 0.6, follows: 'reverse' },
  ];

  it('the velocity fed to the body holds the bound through strafe reversals, releases, a turning view and a reversal in each beast form, from 8 ms to 400 ms frames', () => {
    const rows = [];
    for (const c of REVERSALS) for (const dt of DTS) rows.push({ c, dt, ...run(dt, c) });
    const table = rows.map((r) => `${r.c.name} @${Math.round(r.dt * 1000)} ms: step ${r.worst.toFixed(3)}, velocity ${r.worstV.toFixed(3)} m/s`).join('; ');
    console.info(`[stance F1 reversals] ${rows.length} (sequence x frame interval) runs, worst away rate: ${table}`);
    expect(rows.length, 'the sweep shrank').toBe(REVERSALS.length * DTS.length);
    for (const r of rows) {
      const at = `${r.c.name} at a ${Math.round(r.dt * 1000)} ms frame`;
      expect(r.judged, `SETUP: ${at}: no frame at full weight was judged`).toBeGreaterThan(0);
      expect(r.gapMax, `SETUP: ${at}: the husk left the engage radius`).toBeLessThan(12);
      if (r.c.follows === 'turn') expect(r.judged * r.dt * r.c.turn, `SETUP: ${at}: the view did not turn a full circle while frames were judged`).toBeGreaterThanOrEqual(2 * Math.PI);
      else expect(r.keyFlips, `SETUP: ${at}: the keys never changed while frames were judged`).toBeGreaterThanOrEqual(2);
      // The applied velocity followed the keys or the view, so a bound that froze or killed the walk cannot pass.
      if (r.c.follows === 'release') expect(r.minSpeed, `${at}: the applied velocity never slowed when the keys were released`).toBeLessThan(1);
      else expect(r.tanFlips, `${at}: the applied strafe never changed side with the keys or the view`).toBeGreaterThanOrEqual(2);
      expect(r.recordOff, `${at}: readMoveTarget's applied is not what stanceWalk returned (the e2e reads the record)`).toBe(0);
      // The bound pulls the step's end in toward the threat along its own ray, so it never turns the strafe around.
      expect(r.offRay, `${at}: ${r.offRay} of ${r.engaged} bounded steps did not end on the ray from the threat through the ramp's own step end`).toBe(0);
    }
    for (const c of REVERSALS) {
      const engaged = rows.filter((r) => r.c === c).reduce((n, r) => n + r.engaged, 0);
      expect(engaged, `SETUP: ${c.name}: the bound never engaged at any frame interval, so this row cannot judge it`).toBeGreaterThan(0);
    }
    const over = rows.filter((r) => r.worst > r.cap + 1e-9 || r.worstV > r.cap + 1e-9);
    expect(over.map((r) => `${r.c.name} @${Math.round(r.dt * 1000)} ms step ${r.worst.toFixed(3)} velocity ${r.worstV.toFixed(3)} (cap ${r.cap})`), `the velocity fed to the body left the husk faster than the retreat cap — ${table}`).toEqual([]);
  });

  // The dodge is the deliberate escape: its burst decays through the walk ramp exactly as it does out of a fight, and
  // the walk after it is bounded again. Each row ends a dodge straight away from the husk at 1 s, at full weight.
  const DODGES = [
    { name: 'S held', keys: { moveB: true }, face: 1, dodgeAtS: 1 },
    { name: 'nothing held', keys: {}, face: 1, dodgeAtS: 1 },
    { name: 'S+D / S+A every 100 ms', keys: every(0.1, SD, SA), face: 1, dodgeAtS: 1 },
    { name: 'S+D / S+A every frame', keys: (f) => (f % 2 === 0 ? SD : SA), face: 1, dodgeAtS: 1 },
  ];

  it('a dodge away from the husk decays as the plain ramp decays it, and the walk after it holds the bound, from 8 ms to 400 ms frames', () => {
    const rows = [];
    for (const c of DODGES) for (const dt of DTS) rows.push({ c, dt, ...run(dt, c) });
    expect(rows.length, 'the sweep shrank').toBe(DODGES.length * DTS.length);
    for (const r of rows) {
      const at = `${r.c.name} at a ${Math.round(r.dt * 1000)} ms frame`;
      expect(r.dodged && r.carryFrames, `SETUP: ${at}: no frame decayed a dodge`).toBeGreaterThan(0);
      expect(r.judged, `SETUP: ${at}: no frame at full weight was judged after the decay`).toBeGreaterThan(0);
      expect(r.carryOff, `${at}: ${r.carryOff} of ${r.carryFrames} frames of the decay were not the plain ramp from the burst`).toBe(0);
      expect(r.offRay, `${at}: a bounded step did not end on the ramp's own ray`).toBe(0);
    }
    for (const c of DODGES) {
      const peak = Math.max(...rows.filter((r) => r.c === c).map((r) => r.carryPeak));
      expect(peak, `${c.name}: no frame of the decay left faster than the cap, at any frame interval: the burst was cut`).toBeGreaterThan(STANCE_CAPS.retreat + 1);
    }
    const over = rows.filter((r) => r.worst > r.cap + 1e-9 || r.worstV > r.cap + 1e-9);
    expect(over.map((r) => `${r.c.name} @${Math.round(r.dt * 1000)} ms step ${r.worst.toFixed(3)} velocity ${r.worstV.toFixed(3)} (cap ${r.cap})`), 'after the dodge\'s decay the walk left the husk faster than the retreat cap').toEqual([]);
  });

  // The bound after the ramp must not change the stance's blend. A bound that re-ran stanceVelocity on the ramped
  // velocity would blend twice: its settled speed at a held weight would depend on the frame interval (3.0 m/s at
  // 60 fps, 5.0 at 400 ms, for w = 0.5), not the single linear blend lerp(raw, cap, w) the enter and exit blends are.
  const MOVING = (x, z) => ({ x, z, moving: true });
  it('at a held weight the settled velocity is still the one linear blend, at every frame interval', () => {
    for (const dt of DTS) {
      for (const w of [0.25, 0.5, 0.75]) {
        const st = { w, awayX: 1, awayZ: 0, gap: 3 };
        let back = { x: 14, z: 0 };
        for (let i = 0; i < Math.ceil(2 / dt); i++) back = stanceWalk(MOVING(14, 0), st, { moveMult: 1 }, 1, back, dt);
        expect(back.x, `a held backpedal at w ${w}, ${Math.round(dt * 1000)} ms frames`).toBeCloseTo(14 + (STANCE_CAPS.retreat - 14) * w, 9);
        const diag = MOVING(14 * Math.SQRT1_2, 14 * Math.SQRT1_2);
        let v = { x: diag.x, z: diag.z };
        for (let i = 0; i < Math.ceil(2 / dt); i++) v = stanceWalk(diag, st, { moveMult: 1 }, 1, v, dt);
        const want = stanceVelocity(diag.x, diag.z, 1, 0, w, 1, 1, STANCE_CAPS, { x: 0, z: 0 }, 3, dt);
        expect(v.x, `a held diagonal at w ${w}, ${Math.round(dt * 1000)} ms frames: x is not the stance's own target`).toBeCloseTo(want.x, 9);
        expect(v.z, `a held diagonal at w ${w}, ${Math.round(dt * 1000)} ms frames: z is not the stance's own target`).toBeCloseTo(want.z, 9);
      }
    }
  });

  // And it comes in with the weight: identity at w = 0, the hard bound at w = 1, and in between the step's end is pulled
  // in by w of its excess, so the last frames of the exit blend cannot jump. A released backpedal at 14 (the ramp alone
  // decelerates it to 12.5 in a 60 Hz frame) has an excess of 10.5 m/s over the 2.0 cap.
  it('the bound after the ramp blends in with the weight: a released backpedal is pulled in by w of its excess', () => {
    const dt = 1 / 60;
    const plain = 14 - 90 * dt;
    for (const w of [0, 0.25, 0.5, 1]) {
      const v = stanceWalk({ x: 0, z: 0, moving: false }, { w, awayX: 1, awayZ: 0, gap: 3 }, { moveMult: 1 }, 1, { x: 14, z: 0 }, dt);
      expect(v.x, `w ${w}`).toBeCloseTo(plain - w * (plain - STANCE_CAPS.retreat), 9);
      expect(v.z, `w ${w}`).toBeCloseTo(0, 12);
    }
  });

  it('a dodge\'s burst decays at the ramp\'s own 90 u/s², where a walk at the same speed is pulled in to the cap at once', () => {
    const st = { w: 1, awayX: 1, awayZ: 0, gap: 3 }, dt = 1 / 60, loco = { moveMult: 1 };
    const still = { x: 0, z: 0, moving: false };
    const decay = (mv, start) => {
      const xs = [];
      let v = start;
      for (let i = 0; i < 8; i++) { v = stanceWalk(mv, st, loco, 1, v, dt); xs.push(Math.round(v.x * 1e9) / 1e9); }
      return xs;
    };
    expect(decay(still, dodgeBurst(10, 0)), 'nothing held: the burst was cut instead of decaying').toEqual([8.5, 7, 5.5, 4, 2.5, 1, 0, 0]);
    expect(decay(MOVING(14, 0), dodgeBurst(10, 0)), 'S held: the burst was cut instead of decaying to the retreat cap').toEqual([8.5, 7, 5.5, 4, 2.5, 2, 2, 2]);
    expect(decay(still, { x: 10, z: 0 })[0], 'a walk at 10 m/s was let through as if it were a dodge').toBeCloseTo(STANCE_CAPS.retreat, 9);
  });

  // Away is diagonal to the world axes, so the per-axis ramp can lean a turning strafe away from the threat. A dodge
  // away decays onto a held S in 5 frames, and its burst window is 8 frames long: S+D pressed on frame 6 is a walk.
  it('a dodge\'s carry ends when the ramp reaches its target: a strafe pressed after that, inside the burst\'s window, is bounded', () => {
    const ax = 0.6, az = 0.8, st = { w: 1, awayX: ax, awayZ: az, gap: 3 }, dt = 1 / 60, loco = { moveMult: 1 };
    const away = (u) => u.x * ax + u.z * az;
    let v = dodgeBurst(10 * ax, 10 * az);
    expect(6 * dt, 'SETUP: the strafe frame is not inside the burst\'s window').toBeLessThan(v.carryS);
    for (let i = 0; i < 5; i++) v = stanceWalk(MOVING(14 * ax, 14 * az), st, loco, 1, v, dt);
    expect([v.x, v.z].map((n) => +n.toFixed(9)), 'SETUP: the decay did not settle on the held backpedal').toEqual([1.2, 1.6]);
    const k = 14 * Math.SQRT1_2, sd = MOVING(k * (ax - az), k * (az + ax)); // S+D: away plus the tangential axis
    const prev = v;
    v = stanceWalk(sd, st, loco, 1, v, dt);
    const r = readMoveTarget();
    const plain = rampVelocity(prev, { x: r.targetX, z: r.targetZ }, dt);
    expect(away(plain), 'SETUP: the plain ramp does not leave faster than the cap here, so this frame cannot judge the bound').toBeGreaterThan(STANCE_CAPS.retreat + 0.1);
    expect(away(v), 'the strafe after the settled decay was let through unbounded').toBeLessThanOrEqual(STANCE_CAPS.retreat + 1e-9);
  });

  // A 10.5 m/s burst whose largest axis is 8.4 m/s is spent in 8.4 frames at 60 u/s² (frames 0-8). S+D held from the
  // dodge keeps the ramp turning past that (one axis reverses 10 m/s at 1 m/s per frame), and S+A on frame 9 is the
  // reversal the per-axis ramp leans out of.
  it('a dodge\'s carry ends with its window even while the ramp is still turning: a strafe reversed after it is bounded', () => {
    const ax = 0.6, az = 0.8, st = { w: 1, awayX: ax, awayZ: az, gap: 3 }, dt = 1 / 60, loco = { moveMult: 1 };
    const away = (u) => u.x * ax + u.z * az;
    const k = 14 * Math.SQRT1_2;
    const sd = MOVING(k * (ax - az), k * (az + ax)), sa = MOVING(k * (ax + az), k * (az - ax)); // away -/+ the tangent
    let v = dodgeBurst(10.5 * ax, 10.5 * az);
    const frames = Math.floor(v.carryS / dt);
    expect([frames, v.carryS / dt - frames > 0.1], 'SETUP: the burst window is not 8 frames and a part').toEqual([8, true]);
    for (let i = 0; i <= frames; i++) v = stanceWalk(sd, st, loco, 1, v, dt);
    const r0 = readMoveTarget();
    expect(v.x === r0.targetX && v.z === r0.targetZ, 'SETUP: the ramp reached its target inside the window, so this cannot tell a window from a settle').toBe(false);
    const prev = v;
    v = stanceWalk(sa, st, loco, 1, v, dt);
    const r = readMoveTarget();
    const plain = rampVelocity(prev, { x: r.targetX, z: r.targetZ }, dt);
    expect(away(plain), 'SETUP: the plain ramp does not leave faster than the cap here, so this frame cannot judge the bound').toBeGreaterThan(STANCE_CAPS.retreat + 0.1);
    expect(away(v), 'the reversal after the burst\'s window was let through unbounded').toBeLessThanOrEqual(STANCE_CAPS.retreat + 1e-9);
  });
});

describe('the stance\'s game clock: where each frame\'s step starts in game time, for the e2e\'s speed', () => {
  it('atS is the sum of the steps before this frame and stepS this frame\'s step', () => {
    const st = getStance();
    const base = st.atS + st.stepS;
    stanceStep(st, [], { x: 0, y: 0, z: 0 }, 1e6, 0.1);
    expect(st.atS).toBeCloseTo(base, 12);
    expect(st.stepS).toBe(0.1);
    stanceStep(st, [], { x: 1.4, y: 0, z: 0 }, 1e6 + 100, 0.25);
    expect(st.atS).toBeCloseTo(base + 0.1, 12);
    stanceStep(st, [], { x: 4.9, y: 0, z: 0 }, 1e6 + 350, 0.05);
    expect(st.atS).toBeCloseTo(base + 0.35, 12);
    expect(st.stepS).toBe(0.05);
    stanceStep(st, [], { x: 5.6, y: 0, z: 0 }, 1e6 + 400, NaN);
    expect(st.atS).toBeCloseTo(base + 0.4, 12);
    expect(st.stepS).toBe(0);
  });
});
