import { describe, it, expect } from 'vitest';
import {
  createBossCombat, resetBossCombat, withBossTarget, bossTargets, registerBossHeavy, bossHitByCone, bossDamage,
  BOSS_TARGET_ID, KNOCKDOWN_MS, RECOVER_IMMUNE_MS, BOSS_BODY_RADIUS,
} from './bossCombat.js';
import { applyPerfectDodge, STAGGER_MS } from './perfectDodge.js';

// THE DRAGON'S ONE COMBAT RECORD (DECISIONS 2026-10-30 items 123-125). Main chunk, duck-typed like a mob, so the perfect
// dodge, the heavy, the melee cone and every system that hits mobs reach the dragon through the same rules: the move
// machine (game/dragonMoves.js) writes it, a perfect dodge zeroes its windup, the heavy chains its stagger, and
// bossTargets hands it to hurl, the squad and the element zones beside the mobs.
//
// Mutation-Proof: via scripts/dev/mutate.sh, each observed RED, an identity mutant (a comment edit) GREEN:
//   K1 withBossTarget hands the mobs back unchanged -> "a perfect dodge in the dive-bite windup staggers the dragon"
//   K2 registerBossHeavy without the stagger refresh -> "three heavies at a 1.0 s cadence"
//   K3 the immunity after a knockdown removed -> "no stunlock"
//   K4 bossHitByCone tests only the centre -> "the cone reaches the head"
//   K5 the riposte skipped in bossDamage -> "the riposte: the player's damage only"
//   R1 resetBossCombat swaps the position object -> "reset in place keeps identity"
//   R2 bossTargets appends an airborne dragon to a ground-only list -> "zones and allies reach it only on the ground"
const live = (over = {}) => Object.assign(createBossCombat(), { active: true, health: 300, position: { x: 3, y: 0, z: 0 } }, over);
const staggeredAt = (t) => live({ staggerUntil: t + STAGGER_MS });
const origin = { x: 0, y: 0, z: 0 };

describe('the record', () => {
  it('fresh values: inactive, not passive, no move, nothing staggered, its own id and body', () => {
    const r = createBossCombat();
    expect(r).toMatchObject({ id: BOSS_TARGET_ID, active: false, passive: false, health: 0, move: null, windupUntil: 0,
      castUntil: 0, staggerUntil: 0, knockdownUntil: 0, immuneUntil: 0, heavyChain: 0, bodyRadius: BOSS_BODY_RADIUS,
      airborne: false, pinned: false });
    expect(r.hitPoints).toHaveLength(3);
    expect(r.cooldowns).toEqual({});
  });
  it('reset in place keeps identity, and a live record with a pending windup reads inactive after it', () => {
    const r = live({ move: 'bite', windupUntil: 900, castUntil: 0, cooldowns: { bite: 2000 }, staggerUntil: 50, pinned: true });
    const pos = r.position;
    const hp = r.hitPoints[0];
    resetBossCombat(r);
    expect(r.position, 'reset in place keeps identity').toBe(pos);
    expect(r.hitPoints[0]).toBe(hp);
    expect(r).toMatchObject({ active: false, move: null, windupUntil: 0, castUntil: 0, staggerUntil: 0, pinned: false });
    expect(r.cooldowns).toEqual({});
    expect(pos).toEqual({ x: 0, y: 0, z: 0 });
  });
  it('two records share no position', () => {
    const a = createBossCombat(); const b = createBossCombat();
    a.position.x = 5;
    expect(b.position.x).toBe(0);
    expect(a.hitPoints[0]).not.toBe(b.hitPoints[0]);
  });
});

describe('the perfect dodge reads the dragon as a target', () => {
  it('a perfect dodge in the dive-bite windup staggers the dragon for STAGGER_MS', () => {
    const rec = live({ windupUntil: 1000, move: 'diveBite', position: { x: 3, y: 0, z: 0 } });
    const hit = applyPerfectDodge(withBossTarget([], rec, 850), origin, 850);
    expect(hit).toEqual([rec]);
    expect(rec.staggerUntil).toBe(850 + STAGGER_MS);
    expect(rec.windupUntil).toBe(0);
  });
  it('the roar cannot be parried (its windup is a cast)', () => {
    const rec = live({ castUntil: 1000, move: 'roar' });
    expect(applyPerfectDodge(withBossTarget([], rec, 850), origin, 850)).toEqual([]);
  });
  it('an inactive or dead dragon is not a target, and the mobs pass through untouched', () => {
    const mob = { id: 1 };
    expect(withBossTarget([mob], createBossCombat(), 0)).toEqual([mob]);
    expect(withBossTarget([mob], live({ health: 0 }), 0)).toEqual([mob]);
    expect(withBossTarget([mob], live(), 0)).toHaveLength(2);
  });
  it('no stunlock: immune to stagger for RECOVER_IMMUNE_MS after a knockdown', () => {
    const rec = staggeredAt(0);
    for (const t of [1000, 2000, 3000]) registerBossHeavy(rec, t);
    const up = 3000 + KNOCKDOWN_MS;
    expect(withBossTarget([], rec, up + 1)).toEqual([]);
    expect(withBossTarget([], rec, up + RECOVER_IMMUNE_MS)).toEqual([rec]);
  });
});

describe('the heavy chain', () => {
  it('three heavies at a 1.0 s cadence knock it down; at 1.5 s the stagger lapses', () => {
    const a = staggeredAt(0);
    expect([1000, 2000, 3000].map((t) => registerBossHeavy(a, t))).toEqual(['chained', 'chained', 'knockdown']);
    expect(a.knockdownUntil).toBe(3000 + KNOCKDOWN_MS);
    expect(a.staggerUntil, 'the knockdown keeps the riposte open').toBe(a.knockdownUntil);
    expect(a.heavyChain).toBe(0);
    // 1000 refreshes the stagger to 2400; at 2500 it has lapsed, the chain resets, nothing after it counts
    const b = staggeredAt(0);
    expect([1000, 2500, 4000].map((t) => registerBossHeavy(b, t))).toEqual(['chained', 'ignored', 'ignored']);
    expect(b.knockdownUntil).toBe(0);
  });
  it('a heavy on a dragon that is not staggered is ignored, and so is one on a knocked-down dragon', () => {
    expect(registerBossHeavy(live({}), 500)).toBe('ignored');
    const k = staggeredAt(0);
    [1000, 2000, 3000].forEach((t) => registerBossHeavy(k, t));
    expect(registerBossHeavy(k, 3500)).toBe('ignored');
    expect(k.knockdownUntil).toBe(3000 + KNOCKDOWN_MS);
  });
});

describe('the melee cone and the riposte', () => {
  it('the cone reaches the head when the centre is out of range', () => {
    const rec = live({ position: { x: 7, y: 0, z: 0 }, hitPoints: [{ x: 3.5, y: 0.6, z: 0 }, { x: 7, y: 0, z: 0 }, { x: 9, y: 0, z: 0 }] });
    expect(bossHitByCone(rec, origin, { x: 1, y: 0, z: 0 }, 4.5, Math.PI / 2)).toBe(true);
    expect(bossHitByCone(rec, origin, { x: -1, y: 0, z: 0 }, 4.5, Math.PI / 2), 'facing away').toBe(false);
  });
  it('with no hit points written yet, the centre still counts', () => {
    const rec = live({ position: { x: 3, y: 0, z: 0 }, hitPoints: [] });
    expect(bossHitByCone(rec, origin, { x: 1, y: 0, z: 0 }, 4.5, Math.PI / 2)).toBe(true);
  });
  it('the riposte: the player\'s damage only, and only while it is staggered', () => {
    const rec = staggeredAt(0);
    expect(bossDamage(10, 'player', rec, 500)).toBe(15);
    expect(bossDamage(10, 'player-dot', rec, 500)).toBe(15);
    expect(bossDamage(10, 'ally', rec, 500)).toBe(10);
    expect(bossDamage(10, 'hazard', rec, 500)).toBe(10);
    expect(bossDamage(10, 'player', rec, STAGGER_MS + 1)).toBe(10);
  });
});

describe('bossTargets: the dragon beside the mobs, for the systems that hit mobs (row 25)', () => {
  it('no live fight hands the mobs back as they are; a live one appends the record, without a new array each call', () => {
    const mobs = [{ id: 1 }, { id: 2 }];
    expect(bossTargets(mobs, createBossCombat())).toBe(mobs);
    const rec = live();
    const a = bossTargets(mobs, rec);
    expect(a).toEqual([...mobs, rec]);
    const b = bossTargets(mobs, rec);
    expect(b, 'a new array per tick').toBe(a);
    expect(mobs).toHaveLength(2);
  });
  it('zones and allies reach it only on the ground; a hurled block reaches it in the air too', () => {
    const mobs = [{ id: 1 }];
    const flying = live({ airborne: true });
    expect(bossTargets(mobs, flying, { groundOnly: true })).toBe(mobs);
    expect(bossTargets(mobs, flying)).toContain(flying);
    const landed = live({ airborne: false });
    expect(bossTargets(mobs, landed, { groundOnly: true })).toContain(landed);
  });
});
