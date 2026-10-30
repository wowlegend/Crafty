import { describe, it, expect } from 'vitest';
import { Mesh, RingGeometry, Vector3 } from 'three';
import { decalFor, decalOpacity, decalSpin, BITE_DECAL_ARC, FIREBALL_DECAL_R } from './dragonTelegraphs.js';
import { stepDragon, DRAGON_MOVES } from '../game/dragonMoves.js';
import { createBossCombat } from '../game/bossCombat.js';
import { STRINGS } from '../i18n/strings.js';

// THE DRAGON'S ATTACKS ARE READ FROM THE GROUND (DECISIONS 2026-10-30 item 124). Each windup the move machine starts
// gets one ground decal from the dragon's own pool (render/BossEntity.jsx): the bite an arc of its reach in the
// dragon's heading, the roar a ring of its radius on the dragon, the fireball a disc where it aims, the summons a ring
// where the skeletons rise; the lava keeps its own forming ring, so it is never drawn twice. The decal brightens as the
// windup closes. Driven from the machine's own events, so a retuned move moves its decal with it.
//
// Mutation-Proof: via scripts/dev/mutate.sh, each observed RED, an identity mutant (a comment edit) GREEN:
//   T1 decalFor returns null for the roar -> "the roar's decal is a ring of radius 9 on the dragon"
//   T2 a zh-CN phase line copied from en -> "the phase lines read in both languages"
//   T3 the opacity inverted -> "brightens as the windup closes"
//   T5 the arc's spin ignores the heading -> "the bite's arc points where the dragon bites"
const recAt = (x = 0, z = 0) => { const r = createBossCombat(); r.active = true; r.health = 300; r.position.x = x; r.position.z = z; return r; };
const ctx = (px, pz, over = {}) => ({ phase: 1, tricks: ['fireball', 'lava', 'summon'], player: { x: px, y: 0, z: pz },
  playerAlive: true, invincible: false, groundY: 0, damage: 25, ...over });
const windupOf = (rec, c) => stepDragon(rec, c, 0).find((e) => e.type === 'windup');

describe('one decal per windup, from the machine\'s own events', () => {
  it('the roar\'s decal is a ring of radius 9 on the dragon', () => {
    const rec = recAt(10, 20); rec.cooldowns.bite = 1e9;
    const ev = windupOf(rec, ctx(15, 20));
    expect(ev.move).toBe('roar');
    expect(decalFor(ev, rec.position)).toEqual({ shape: 'ring', x: 10, z: 20, radius: DRAGON_MOVES.roar.radius });
  });
  it('the bite\'s is an arc of its reach in the dragon\'s heading', () => {
    const rec = recAt(0, 0);
    const ev = windupOf(rec, ctx(0, 3));
    const d = decalFor(ev, rec.position);
    expect(d).toMatchObject({ shape: 'arc', x: 0, z: 0, radius: DRAGON_MOVES.bite.reach });
    expect(d.heading).toBeCloseTo(0, 6);
    expect(BITE_DECAL_ARC).toBeCloseTo(ev.arc, 9);
  });
  it('the fireball\'s is a disc where it aims; the summons\' a ring of 7 m on the dragon', () => {
    const fire = recAt(0, 0);
    const f = decalFor(windupOf(fire, ctx(14, 2, { phase: 0 })), fire.position);
    expect(f).toEqual({ shape: 'disc', x: 14, z: 2, radius: FIREBALL_DECAL_R });
    const sum = recAt(5, 5); sum.cooldowns.lava = 1e9;
    expect(decalFor(windupOf(sum, ctx(25, 5, { phase: 2 })), sum.position)).toEqual({ shape: 'ring', x: 5, z: 5, radius: 7 });
  });
  it('the lava keeps its own forming ring: no second decal', () => {
    const rec = recAt();
    const ev = windupOf(rec, ctx(20, 0, { phase: 2 }));
    expect(ev.move).toBe('lava');
    expect(decalFor(ev, rec.position)).toBeNull();
  });
  it('brightens as the windup closes: 0.25 at its start, 0.75 at the strike, never darker on the way', () => {
    const ms = 900;
    let prev = -1;
    for (let t = 0; t <= ms; t += 30) {
      const o = decalOpacity(t, ms, ms);
      expect(o, `at ${t} ms`).toBeGreaterThanOrEqual(prev);
      prev = o;
    }
    expect(decalOpacity(0, ms, ms)).toBeCloseTo(0.25);
    expect(decalOpacity(ms, ms, ms)).toBeCloseTo(0.75);
  });
  it('the bite\'s arc points where the dragon bites: the flat ring sector\'s middle, spun, lies along the heading', () => {
    for (const heading of [0, 0.7, Math.PI / 2, 2.5, -1.2]) {
      const g = new RingGeometry(0.2, 1, 8, 1, -BITE_DECAL_ARC / 2, BITE_DECAL_ARC);
      const m = new Mesh(g);
      m.rotation.set(-Math.PI / 2, 0, decalSpin(heading));
      m.updateMatrixWorld();
      const mid = new Vector3(1, 0, 0).applyMatrix4(m.matrixWorld);
      expect(mid.x, `heading ${heading}`).toBeCloseTo(Math.sin(heading), 6);
      expect(mid.z, `heading ${heading}`).toBeCloseTo(Math.cos(heading), 6);
      expect(mid.y).toBeCloseTo(0, 6);
    }
  });
});

describe('the dragon\'s lines read the fight in both languages', () => {
  const KEYS = ['notice.bossPhase2', 'notice.bossPhase3'];
  it('the phase lines read in both languages, and the Chinese has no Latin letter', () => {
    for (const k of KEYS) {
      expect(STRINGS.en[k], k).toEqual(expect.any(String));
      expect(STRINGS['zh-CN'][k], `${k} has no zh-CN line`).toEqual(expect.any(String));
      expect(STRINGS['zh-CN'][k], `${k} in zh-CN is the English line`).not.toBe(STRINGS.en[k]);
      expect(STRINGS['zh-CN'][k], `${k} in zh-CN carries Latin letters`).not.toMatch(/[A-Za-z]/);
    }
  });
  it('the attack calls are gone: their keys are in neither dictionary', () => {
    for (const k of ['notice.bossFireball', 'notice.bossRoar', 'notice.bossLava', 'notice.bossSummon']) {
      expect(STRINGS.en[k], k).toBeUndefined();
      expect(STRINGS['zh-CN'][k], k).toBeUndefined();
    }
  });
});
