import { describe, it, expect } from 'vitest';
import { Mesh, MeshBasicMaterial, RingGeometry, CircleGeometry, DoubleSide, Raycaster, Vector3 } from 'three';
import { decalFor, decalOpacity, decalSpin, placeDecal, DECAL_GEOMETRY } from './dragonTelegraphs.js';
import { stepDragon, dragonYaw, launchFireball, stepFireball, DRAGON_MOVES, FIREBALL_BURST_UP } from '../game/dragonMoves.js';
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
// The decal-covers-the-move cases (below) were proven with the defect's shape restored, each RED, an identity mutant GREEN:
//   A1 the bite's strike back to reach only, any bearing -> "the bite and the dive-bite land exactly where ..."
//   A2 the dive-bite's arc a third of a turn while the drawn sector stays the bite's -> the same case
//   A3 the dragon faces the player through a windup -> "through the windup the dragon faces its mark"
//   F1 the launch aimed where the player stands at the launch -> "the fireball bursts on the disc ..."
//   F2 the fireball's hit radius 2.4 m while its disc stays 1.6 -> the same case
//   F3 the fireball bursts on contact with the player on its way -> the same case
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
  it('the bite\'s is a sector of its reach in the dragon\'s heading', () => {
    const rec = recAt(0, 0);
    const ev = windupOf(rec, ctx(0, 3));
    const d = decalFor(ev, rec.position);
    expect(d).toMatchObject({ shape: 'arc', x: 0, z: 0, radius: DRAGON_MOVES.bite.reach });
    expect(d.heading).toBeCloseTo(0, 6);
    expect(DECAL_GEOMETRY.arc[3]).toBeCloseTo(ev.arc, 9);
  });
  it('the fireball\'s is a disc of the radius it hits within, where it aims; the summons\' a ring of 7 m on the dragon', () => {
    const fire = recAt(0, 0);
    const f = decalFor(windupOf(fire, ctx(14, 2, { phase: 0 })), fire.position);
    expect(f).toEqual({ shape: 'disc', x: 14, z: 2, radius: DRAGON_MOVES.fireball.radius });
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
      const m = new Mesh(new CircleGeometry(...DECAL_GEOMETRY.arc));
      m.rotation.set(-Math.PI / 2, 0, decalSpin(heading));
      m.updateMatrixWorld();
      const mid = new Vector3(1, 0, 0).applyMatrix4(m.matrixWorld);
      expect(mid.x, `heading ${heading}`).toBeCloseTo(Math.sin(heading), 6);
      expect(mid.z, `heading ${heading}`).toBeCloseTo(Math.cos(heading), 6);
      expect(mid.y).toBeCloseTo(0, 6);
    }
  });
});

// EACH DECAL COVERS EXACTLY THE GROUND ITS MOVE LANDS ON. The decal is the player's read of where the move lands; the
// machine's resolution is where it does. Both are driven here from the machine's own events: the decal is the real
// geometry laid by the real placeDecal, a ray straight down at a place says whether it is drawn there, and the move is
// resolved with the player standing at that place. A band 5 cm either side of each drawn edge is left out (the edge is
// a polygon of the true curve); everything else must agree.
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const geometryOf = (shape) => (shape === 'ring' ? new RingGeometry(...DECAL_GEOMETRY.ring) : new CircleGeometry(...DECAL_GEOMETRY[shape]));
/** Whether decal `d`, laid as the dragon lays it, is drawn over the ground at (x, z). */
function drawnAt(d) {
  const mesh = new Mesh(geometryOf(d.shape), new MeshBasicMaterial({ side: DoubleSide }));
  placeDecal(mesh, d, 0);
  mesh.updateMatrixWorld(true);
  const ray = new Raycaster();
  const from = new Vector3();
  const down = new Vector3(0, -1, 0);
  return (x, z) => { ray.set(from.set(x, 5, z), down); return ray.intersectObject(mesh).length > 0; };
}

describe('each decal covers exactly the ground its move lands on', () => {
  it('the bite and the dive-bite land exactly where their sector is drawn, at every heading, wherever the player stands at the strike', () => {
    const bx = 3, bz = -2;
    let checked = 0, struck = 0, missed = 0;
    const bad = [];
    for (const move of ['bite', 'diveBite']) {
      const m = DRAGON_MOVES[move];
      const phase = move === 'bite' ? 1 : 0;
      for (let k = 0; k < 12; k++) {
        const h = -Math.PI + (k + 0.37) * (Math.PI / 6);
        const start = ctx(bx + 3 * Math.sin(h), bz + 3 * Math.cos(h), { phase });
        const probe = recAt(bx, bz);
        const ev = windupOf(probe, start);
        expect(ev.move, `SETUP: the ${move} did not start at heading ${h}`).toBe(move);
        expect(ev.heading).toBeCloseTo(h, 9);
        const drawn = drawnAt(decalFor(ev, probe.position));
        for (let x = -7; x <= 7; x += 0.5) {
          for (let z = -7; z <= 7; z += 0.5) {
            const px = bx + x + 0.013, pz = bz + z + 0.029;
            const d = Math.hypot(px - bx, pz - bz);
            const edge = Math.abs(Math.abs(wrap(Math.atan2(px - bx, pz - bz) - h)) - m.arc / 2) * d;
            if (d < 0.05 || Math.abs(d - m.reach) < 0.05 || edge < 0.05) continue;
            const rec = recAt(bx, bz);
            windupOf(rec, start);
            const lands = stepDragon(rec, ctx(px, pz, { phase }), ev.until).some((e) => e.type === 'strike');
            const shown = drawn(px, pz);
            checked += 1;
            if (lands) struck += 1; else missed += 1;
            if (lands !== shown && bad.length < 6) bad.push({ move, h: +h.toFixed(3), at: [+(px - bx).toFixed(2), +(pz - bz).toFixed(2)], lands, shown });
          }
        }
      }
    }
    expect(bad, `the bite landed where its sector is not drawn, or missed where it is: ${JSON.stringify(bad)}`).toEqual([]);
    expect(checked, 'SETUP: too few places checked').toBeGreaterThan(18000);
    expect(struck, 'SETUP: no place where the bite lands').toBeGreaterThan(1000);
    expect(missed, 'SETUP: no place where the bite misses').toBeGreaterThan(1000);
  });

  it('through the windup the dragon faces its mark, not the player who moved, so its head points along its decal', () => {
    const rec = recAt(3, -2);
    const ev = windupOf(rec, ctx(3 + 3 * Math.sin(1.1), -2 + 3 * Math.cos(1.1)));
    expect(ev.move).toBe('bite');
    // The player has run round behind the dragon; the flight path points elsewhere again.
    expect(dragonYaw(rec, -4, -1, 2, 2)).toBeCloseTo(ev.heading, 9);
    stepDragon(rec, ctx(-1, -3), ev.until);
    expect(rec.move, 'SETUP: the bite did not resolve').toBeNull();
    expect(dragonYaw(rec, -4, -1, 2, 2), 'a free dragon faces its path again').toBeCloseTo(Math.atan2(2, 2), 9);
  });

  it('the fireball bursts on the disc its windup showed, and hits exactly the players standing on that disc', () => {
    const mouth = { x: 0, y: 14.2, z: 1.5 };
    let checked = 0, hits = 0, misses = 0;
    const bad = [];
    for (const aim of [{ x: 9, z: 4 }, { x: -6, z: 11 }, { x: 2.5, z: -13 }]) {
      const rec = recAt(0, 0); rec.position.y = 13;
      const ev = windupOf(rec, ctx(aim.x, aim.z, { phase: 0 }));
      expect(ev.move, 'SETUP: the high dragon did not start a fireball').toBe('fireball');
      const disc = decalFor(ev, rec.position);
      const drawn = drawnAt(disc);
      // The player runs 4 m off the mark during the windup: the launch still goes to the mark.
      const [launch] = stepDragon(rec, ctx(aim.x + 4, aim.z - 1, { phase: 0 }), ev.until);
      expect(launch, 'the fireball launched at somewhere other than its mark').toMatchObject({ type: 'launch', at: { x: aim.x, y: 0, z: aim.z } });
      for (let x = -3; x <= 3; x += 0.25) {
        for (let z = -3; z <= 3; z += 0.25) {
          const px = aim.x + x + 0.011, pz = aim.z + z + 0.023;
          if (Math.abs(Math.hypot(px - disc.x, pz - disc.z) - disc.radius) < 0.05) continue;
          const f = launchFireball(mouth, launch.at);
          let outcome = 'flying';
          for (let i = 0; outcome === 'flying' && i < 600; i++) outcome = stepFireball(f, 1 / 60, { x: px, y: 0, z: pz });
          expect(outcome, 'the fireball never arrived').not.toBe('flying');
          expect([f.x, f.y, f.z]).toEqual([expect.closeTo(aim.x, 6), expect.closeTo(FIREBALL_BURST_UP, 6), expect.closeTo(aim.z, 6)]);
          const shown = drawn(px, pz);
          checked += 1;
          if (outcome === 'hit') hits += 1; else misses += 1;
          if ((outcome === 'hit') !== shown && bad.length < 6) bad.push({ aim, at: [+(px - aim.x).toFixed(2), +(pz - aim.z).toFixed(2)], outcome, shown });
        }
      }
    }
    expect(bad, `the fireball hit where its disc is not drawn, or missed where it is: ${JSON.stringify(bad)}`).toEqual([]);
    expect(checked, 'SETUP: too few places checked').toBeGreaterThan(1800);
    expect(hits, 'SETUP: no place the fireball hits').toBeGreaterThan(50);
    expect(misses, 'SETUP: no place the fireball misses').toBeGreaterThan(500);
  });

  it('a player on the mark is hit through a jump, and clear of it on a pillar 3 m up', () => {
    const at = { x: 4, y: 10, z: 4 };
    const burst = (y) => {
      const f = launchFireball({ x: 0, y: 25, z: 0 }, at);
      let outcome = 'flying';
      for (let i = 0; outcome === 'flying' && i < 600; i++) outcome = stepFireball(f, 1 / 60, { x: 4.3, y, z: 3.8 });
      return outcome;
    };
    expect(burst(10)).toBe('hit');
    expect(burst(11.2)).toBe('hit');
    expect(burst(13)).toBe('miss');
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
