import { describe, it, expect } from 'vitest';
import { stepDragon, dragonCtx, roarFalloff, DRAGON_MOVES, CORE_MOVES } from './dragonMoves.js';
import { createBossCombat } from './bossCombat.js';

// EVERY ATTACK HAS A TELL (DECISIONS 2026-10-30 item 123). The dragon's rules as a pure machine over the shared record
// (game/bossCombat.js): one move at a time, each with a windup on the world clock, cooldowns charged when a windup
// starts, the roar's range defined only through roarFalloff, and the moves a tier knows read from its tricks list.
//
// Mutation-Proof: via scripts/dev/mutate.sh, each observed RED, an identity mutant (a comment edit) GREEN:
//   M1 roarFalloff returns 1 past 9 m -> "roarFalloff: 1 at 0, 0.4 at 9, 0 past 9" and "misses at 11 m"
//   M2 the strike's intent ignores i-frames -> "a roar in range under i-frames does nothing, impulse included"
//   M3 windup length 0 (strike on start) -> "no strike in the first 519 ms"
//   M4 the roar marked parryable -> "only parryable moves write windupUntil"
//   M5 the stagger check removed -> "a staggered dragon starts nothing"
//   M6 ctx.tricks ignored -> "a removed trick never fires"
//   M7 the cooldown charged at the strike instead of the windup's start -> "a cancelled windup never strikes"
//   M8 the lava placed at the end of its cast -> "the lava warns once, for 750 ms"
//   M9 the Array.isArray(ctx.tricks) guard removed -> "a missing trick list throws"
//   M10 the knockdown check removed -> "a knocked-down dragon starts nothing for 3000 ms"
const TRICKS = ['fireball', 'lava', 'summon'];
/** A ctx with the player at `d` metres along +x from a dragon at the origin. */
const at = (d, over = {}) => ({ phase: 1, tricks: TRICKS, player: { x: d, y: 0, z: 0 }, playerAlive: true, invincible: false,
  groundY: 0, damage: 25, ...over });
const recAt = () => { const r = createBossCombat(); r.active = true; r.health = 300; return r; };
const strikes = (evs) => evs.filter((e) => e.type === 'strike');
/** Step `rec` every 16 ms from `t0` to `t1` with `ctx`, collecting every event. */
const run = (rec, ctx, t0, t1, step = 16) => {
  const out = [];
  for (let t = t0; t <= t1; t += step) out.push(...stepDragon(rec, ctx, t));
  return out;
};

describe('the bite', () => {
  it('the bite winds up before it lands — no strike in the first 519 ms', () => {
    const rec = recAt(); const ctx = at(3);
    expect(stepDragon(rec, ctx, 0)).toContainEqual(expect.objectContaining({ type: 'windup', move: 'bite', until: 520 }));
    expect(stepDragon(rec, ctx, 519).some((e) => e.type === 'strike')).toBe(false);
    expect(stepDragon(rec, ctx, 520)).toContainEqual(expect.objectContaining({ type: 'strike', move: 'bite', damage: 25 }));
  });
  it('a bite whose target left reach whiffs', () => {
    const rec = recAt();
    stepDragon(rec, at(3), 0);
    const evs = stepDragon(rec, at(8), 520);
    expect(strikes(evs)).toEqual([]);
    expect(evs).toContainEqual(expect.objectContaining({ type: 'whiff', move: 'bite' }));
  });
  it('a bite does not reach a player more than 3.5 m above or below the dragon', () => {
    const level = recAt();
    stepDragon(level, at(3), 0);
    expect(strikes(stepDragon(level, at(3, { player: { x: 3, y: 3.4, z: 0 } }), 520)), 'the bite missed a player 3.4 m up').toHaveLength(1);
    const high = recAt();
    stepDragon(high, at(3), 0);
    expect(strikes(stepDragon(high, at(3, { player: { x: 3, y: 3.6, z: 0 } }), 520)), 'the bite reached a player 3.6 m up').toEqual([]);
    const low = recAt();
    stepDragon(low, at(3), 0);
    expect(strikes(stepDragon(low, at(3, { player: { x: 3, y: -3.6, z: 0 } }), 520)), 'the bite reached a player 3.6 m down').toEqual([]);
  });
  it('the bite\'s windup event carries its arc: reach 5, a quarter turn, aimed at the player', () => {
    const rec = recAt();
    const [w] = stepDragon(rec, at(3), 0);
    expect(w).toMatchObject({ type: 'windup', move: 'bite', radius: DRAGON_MOVES.bite.reach, arc: Math.PI / 2 });
    expect(w.heading).toBeCloseTo(Math.atan2(3, 0), 6);
  });
});

describe('the roar', () => {
  const roarAt = (d, over = {}) => {
    const rec = recAt(); rec.cooldowns.bite = 1e9; // the bite is first in priority; out of the way
    const ctx = at(d, over);
    const start = stepDragon(rec, ctx, 0);
    return { rec, ctx, start };
  };
  it('roarFalloff: 1 at 0, 0.4 at 9, 0 past 9', () => {
    expect(roarFalloff(0)).toBe(1);
    expect(roarFalloff(9)).toBeCloseTo(0.4);
    expect(roarFalloff(9.01)).toBe(0);
    expect(roarFalloff(4.5)).toBeCloseTo(0.7);
  });
  it('the roar hits at 5 m and misses at 11 m', () => {
    const near = roarAt(5, { damage: 25 });
    expect(near.start).toContainEqual(expect.objectContaining({ type: 'windup', move: 'roar', until: 900, radius: 9 }));
    const [hit] = strikes(stepDragon(near.rec, near.ctx, 900));
    expect(hit.damage).toBeCloseTo(25 * 1.3 * roarFalloff(5));
    expect(Math.hypot(hit.knockback.x, hit.knockback.z)).toBeCloseTo(36 * roarFalloff(5));
    expect(hit.knockback.y).toBeCloseTo(14 * roarFalloff(5));
    const far = roarAt(11, { damage: 25 });
    expect(far.start.some((e) => e.move === 'roar'), 'it roared at a player out of range').toBe(false);
    far.rec.move = 'roar'; far.rec.castUntil = 900; // planted: a roar due while the player stands 11 m off
    expect(strikes(stepDragon(far.rec, far.ctx, 900))).toEqual([]);
  });
  it('a roar in range under i-frames does nothing, impulse included', () => {
    const r = roarAt(5);
    const evs = stepDragon(r.rec, { ...r.ctx, invincible: true }, 900);
    expect(strikes(evs)).toEqual([]);
    expect(evs).toContainEqual(expect.objectContaining({ type: 'whiff', move: 'roar' }));
    expect(evs.some((e) => e.knockback)).toBe(false);
  });
  it('no strike event while the player is dead', () => {
    const r = roarAt(5);
    const evs = stepDragon(r.rec, { ...r.ctx, playerAlive: false }, 900);
    expect(strikes(evs)).toEqual([]);
    expect(evs).toContainEqual(expect.objectContaining({ type: 'whiff', move: 'roar' }));
  });
});

describe('one move at a time, on the world clock', () => {
  it('a frozen world clock holds the bite windup', () => {
    const rec = recAt(); const ctx = at(3);
    stepDragon(rec, ctx, 0);
    for (let i = 0; i < 5; i++) expect(strikes(stepDragon(rec, ctx, 300))).toEqual([]);
    expect(strikes(stepDragon(rec, ctx, 520))).toHaveLength(1);
    expect(strikes(stepDragon(rec, ctx, 520))).toEqual([]);
  });
  it('one move at a time: during a roar windup, no bite windup even in reach', () => {
    const rec = recAt(); rec.cooldowns.bite = 1e9;
    stepDragon(rec, at(6), 0); // a roar, the bite out of reach
    rec.cooldowns.bite = 0;
    const evs = run(rec, at(3), 16, 880);
    expect(evs.filter((e) => e.type === 'windup')).toEqual([]);
  });
  it('only parryable moves write windupUntil', () => {
    const roar = recAt(); roar.cooldowns.bite = 1e9;
    stepDragon(roar, at(5), 0);
    expect([roar.move, roar.windupUntil, roar.castUntil]).toEqual(['roar', 0, 900]);
    const bite = recAt();
    stepDragon(bite, at(3), 0);
    expect([bite.move, bite.windupUntil, bite.castUntil]).toEqual(['bite', 520, 0]);
  });
  it('a cancelled windup (windupUntil zeroed by a dodge) never strikes', () => {
    // A single instant cannot see a re-armed windup: attackPhase re-arms on windupUntil 0 with intent
    // (attackTelegraph.js) and would strike again about one windup later. So step through a whole cooldown.
    const rec = recAt(); rec.cooldowns.roar = 1e9;
    const ctx = at(3);
    stepDragon(rec, ctx, 0);
    rec.windupUntil = 0;
    const evs = run(rec, ctx, 300, 300 + DRAGON_MOVES.bite.cooldownMs);
    expect(strikes(evs)).toEqual([]);
  });
  it('a staggered dragon starts nothing, and a stagger cancels the move it was winding up', () => {
    const rec = recAt(); rec.staggerUntil = 1400;
    expect(run(rec, at(3), 0, 1384)).toEqual([]);
    const busy = recAt();
    stepDragon(busy, at(3), 0);
    busy.staggerUntil = 1400;
    expect(strikes(run(busy, at(3), 16, 1384))).toEqual([]);
    expect(busy.move).toBeNull();
  });
  it('a knocked-down dragon starts nothing for 3000 ms', () => {
    const rec = recAt(); rec.knockdownUntil = 3000;
    expect(run(rec, at(3), 0, 2992)).toEqual([]);
    expect(stepDragon(rec, at(3), 3000)).toContainEqual(expect.objectContaining({ type: 'windup', move: 'bite' }));
  });
});

describe('the tier\'s tricks are the moves it knows', () => {
  it('a removed trick never fires', () => {
    const rec = recAt();
    const evs = run(rec, at(20, { phase: 0, tricks: ['lava', 'summon'] }), 0, 10000, 50);
    expect(evs.filter((e) => e.move === 'fireball')).toEqual([]);
    const control = recAt();
    expect(run(control, at(20, { phase: 0 }), 0, 10000, 50).filter((e) => e.type === 'launch').length).toBeGreaterThan(2);
  });
  it('a missing trick list throws', () => {
    expect(() => stepDragon(createBossCombat(), { ...at(3, { phase: 0 }), tricks: undefined }, 0)).toThrow(TypeError);
  });
  it('dragonCtx takes the tier\'s tricks: tier 0 has fireball, lava, summon', () => {
    const ctx = dragonCtx({ bossTier: 0, phase: 0, player: { x: 1, y: 2, z: 3 }, playerAlive: true, invincible: false, groundY: 4, damage: 20 });
    expect(ctx.tricks).toEqual(['fireball', 'lava', 'summon']);
    expect(ctx).toMatchObject({ phase: 0, player: { x: 1, y: 2, z: 3 }, playerAlive: true, invincible: false, groundY: 4, damage: 20 });
  });
  it('dragonCtx writes into the object it is handed, so a frame loop allocates nothing', () => {
    const out = {};
    const input = { bossTier: 0, phase: 2, player: { x: 0, y: 0, z: 0 }, playerAlive: true, invincible: false, groundY: 0, damage: 35 };
    expect(dragonCtx(input, out)).toBe(out);
    expect(dragonCtx(input, out).tricks).toBe(dragonCtx(input, {}).tricks);
  });
  it('the core moves are never tricks', () => {
    expect(CORE_MOVES).toEqual(['diveBite', 'bite', 'roar']);
  });
});

describe('the lava, the fireball, the summons', () => {
  it('the lava warns once, for 750 ms', () => {
    const rec = recAt();
    const ctx = at(20, { phase: 2 });
    const start = stepDragon(rec, ctx, 0);
    expect(start.map((e) => e.type)).toEqual(['windup', 'lava']);
    expect(start[0]).toMatchObject({ move: 'lava', until: 750 });
    expect(start[1].at).toEqual({ x: 20, z: 0 });
    // Nothing more from the lava before its cooldown: one zone, whose own 750 ms ring is the whole warning.
    const rest = run(rec, ctx, 16, DRAGON_MOVES.lava.cooldownMs - 16);
    expect(rest.filter((e) => e.type === 'lava')).toEqual([]);
    expect(rest.filter((e) => e.move === 'lava' && e.type === 'windup')).toEqual([]);
  });
  it('the fireball winds up 600 ms, then launches once', () => {
    const rec = recAt();
    const ctx = at(14, { phase: 0 });
    expect(stepDragon(rec, ctx, 0)).toContainEqual(expect.objectContaining({ type: 'windup', move: 'fireball', until: 600 }));
    expect(run(rec, ctx, 16, 592).filter((e) => e.type === 'launch')).toEqual([]);
    expect(stepDragon(rec, ctx, 600)).toEqual([expect.objectContaining({ type: 'launch', move: 'fireball' })]);
  });
  it('the summons wind up 700 ms, then raise two skeletons either side of the dragon', () => {
    const rec = recAt(); rec.cooldowns.lava = 1e9;
    const ctx = at(20, { phase: 2 });
    expect(stepDragon(rec, ctx, 0)).toContainEqual(expect.objectContaining({ type: 'windup', move: 'summon', until: 700 }));
    const [ev] = stepDragon(rec, ctx, 700);
    expect(ev.type).toBe('summon');
    expect(ev.at).toHaveLength(2);
    for (const p of ev.at) expect(Math.hypot(p.x, p.z)).toBeCloseTo(7, 6);
  });
});
