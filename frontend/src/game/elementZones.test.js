import { describe, it, expect } from 'vitest';
import {
  makeZoneRegistry, spawnZone, stepZones, clearZones,
  MAX_ZONES, ZONE_DEFS, AMP_RADIUS_MULT, AMP_TTL_MULT,
  spawnChain, CHAIN_RANGE, applyZoneEffects, BURN_TICK,
} from './elementZones';

const at = (x, z) => ({ x, y: 50, z });

describe('S2-B4-M3: the zone registry (the chemistry core)', () => {
  it('defs: the four kinds with radius+ttl (design §2 numbers)', () => {
    expect(ZONE_DEFS.burning).toEqual({ radius: 2.5, ttl: 10 });
    expect(ZONE_DEFS.frozen).toEqual({ radius: 3, ttl: 12 });
    expect(ZONE_DEFS.conductive).toEqual({ radius: 3, ttl: 8 });
    expect(ZONE_DEFS.resonant).toEqual({ radius: 2, ttl: 12 });
    expect(MAX_ZONES).toBe(8);
  });
  it('spawn adds a zone with the kind defs; ids are unique + monotonic', () => {
    const r = makeZoneRegistry();
    const a = spawnZone(r, { kind: 'burning', pos: at(0, 0) }, 10);
    const b = spawnZone(r, { kind: 'frozen', pos: at(20, 0) }, 10);
    expect(r.zones).toHaveLength(2);
    expect(a.id).not.toBe(b.id);
    expect(a.radius).toBe(2.5);
    expect(a.expiresAt).toBeCloseTo(20);
  });
  it('MAX_ZONES oldest-evict (the economy cap IS the perf cap)', () => {
    const r = makeZoneRegistry();
    for (let i = 0; i < 9; i++) spawnZone(r, { kind: 'burning', pos: at(i * 10, 0) }, 10 + i);
    expect(r.zones).toHaveLength(MAX_ZONES);
    expect(r.zones.find((z) => z.pos.x === 0)).toBeUndefined(); // the oldest gone
  });
  it('dedupe-spacing: a same-kind spawn within DEDUPE_DIST REFRESHES the existing zone (no stack-stamping)', () => {
    const r = makeZoneRegistry();
    const a = spawnZone(r, { kind: 'burning', pos: at(0, 0) }, 10);
    const b = spawnZone(r, { kind: 'burning', pos: at(1, 0) }, 14);
    expect(r.zones).toHaveLength(1);
    expect(b.id).toBe(a.id);            // the SAME zone, refreshed
    expect(b.expiresAt).toBeCloseTo(24); // ttl restarted from the new now
  });
  it('ANNIHILATION: fire onto frozen (or ice onto burning) destroys BOTH — steam, not stacking', () => {
    const r = makeZoneRegistry();
    spawnZone(r, { kind: 'frozen', pos: at(0, 0) }, 10);
    const out = spawnZone(r, { kind: 'burning', pos: at(1, 0) }, 11);
    expect(out).toBe(null);          // the new zone never forms
    expect(r.zones).toHaveLength(0); // and the old one is consumed
  });
  it('AMPLIFICATION: a spawn touching a resonant rune CONSUMES it and grows (radius+ttl x1.5)', () => {
    const r = makeZoneRegistry();
    spawnZone(r, { kind: 'resonant', pos: at(0, 0) }, 10);
    const z = spawnZone(r, { kind: 'burning', pos: at(1, 0) }, 12);
    expect(z.amplified).toBe(true);
    expect(z.radius).toBeCloseTo(2.5 * AMP_RADIUS_MULT);
    expect(z.expiresAt).toBeCloseTo(12 + 10 * AMP_TTL_MULT);
    expect(r.zones).toHaveLength(1); // the rune is gone — it spent itself
  });
  it('resonant does NOT amplify resonant (no rune chains)', () => {
    const r = makeZoneRegistry();
    spawnZone(r, { kind: 'resonant', pos: at(0, 0) }, 10);
    spawnZone(r, { kind: 'resonant', pos: at(1, 0) }, 11);
    expect(r.zones).toHaveLength(1); // dedupe-refresh, not consumption
  });
  it('stepZones expires by ttl and reports the expired (the bridge turns burning->char at M6)', () => {
    const r = makeZoneRegistry();
    spawnZone(r, { kind: 'burning', pos: at(0, 0) }, 10);
    spawnZone(r, { kind: 'frozen', pos: at(20, 0) }, 10);
    const { expired } = stepZones(r, 20.5); // burning ttl 10 -> expires at 20
    expect(expired).toHaveLength(1);
    expect(expired[0].kind).toBe('burning');
    expect(r.zones).toHaveLength(1);
  });
  it('clearZones empties (the dawn contract: zones never survive the day-flip)', () => {
    const r = makeZoneRegistry();
    spawnZone(r, { kind: 'burning', pos: at(0, 0) }, 10);
    clearZones(r);
    expect(r.zones).toHaveLength(0);
  });
});

describe('S2-B4-M4: applyZoneEffects (chemistry acts on combat)', () => {
  const mob = (id, x, z, extra = {}) => ({ id, position: { x, y: 50, z }, health: 100, ...extra });
  const zone = (kind, x, z, radius) => ({ kind, pos: { x, y: 50, z }, radius });

  it("burning ticks damageFn with 'hazard' on in-zone mobs only", async () => {
    const { applyZoneEffects, BURN_TICK } = await import('./elementZones');
    const hits = [];
    const mobs = [mob(1, 0, 0), mob(2, 50, 0)];
    applyZoneEffects([zone('burning', 0, 0, 2.5)], mobs, (...a) => hits.push(a));
    expect(hits).toEqual([[1, BURN_TICK, 'fireball', 'hazard']]);
  });
  it('a mob inside two zones of one element takes its tick once; one inside fire and charge takes each', async () => {
    const { applyZoneEffects, BURN_TICK, SHOCK_TICK } = await import('./elementZones');
    const hits = [];
    const overlap = mob(1, 2, 0);
    const lone = mob(2, -2, 0);
    applyZoneEffects([zone('burning', 0, 0, 2.5), zone('burning', 3, 0, 2.5), zone('conductive', 2, 1, 3)], [overlap, lone], (...a) => hits.push(a));
    expect(hits, 'overlapping zones of one element stacked their ticks on one body').toEqual([
      [1, BURN_TICK, 'fireball', 'hazard'], [1, SHOCK_TICK, 'lightning', 'hazard'], [2, BURN_TICK, 'fireball', 'hazard'],
    ]);
    // A burn that kills leaves nothing for the charge to strike.
    const dying = mob(3, 2, 0, { health: 1 });
    const after = [];
    applyZoneEffects([zone('burning', 0, 0, 2.5), zone('conductive', 2, 1, 3)], [dying], (id, dmg, type) => { after.push(type); dying.health -= dmg; });
    expect(after, 'a mob the burn killed was struck again').toEqual(['fireball']);
  });
  it('frozen: TWO zones — a mob inside only zone B stays slowed (the two-pass membership fix)', async () => {
    const { applyZoneEffects, SLOW_MULT } = await import('./elementZones');
    const inB = mob(1, 100, 0);
    applyZoneEffects([zone('frozen', 0, 0, 3), zone('frozen', 100, 0, 3)], [inB], () => {});
    expect(inB.zoneSlowMult).toBe(SLOW_MULT);
  });
  it('frozen: a mob that LEFT every frozen zone resets to 1', async () => {
    const { applyZoneEffects } = await import('./elementZones');
    const left = mob(1, 50, 0, { zoneSlowMult: 0.4 });
    applyZoneEffects([zone('frozen', 0, 0, 3)], [left], () => {});
    expect(left.zoneSlowMult).toBe(1);
  });
  it('conductive pulses every in-zone mob (the zone IS the chain)', async () => {
    const { applyZoneEffects, SHOCK_TICK } = await import('./elementZones');
    const hits = [];
    applyZoneEffects([zone('conductive', 0, 0, 3)], [mob(1, 1, 0), mob(2, -1, 1)], (...a) => hits.push(a));
    expect(hits).toHaveLength(2);
    expect(hits[0][1]).toBe(SHOCK_TICK);
    expect(hits[0][3]).toBe('hazard');
  });
  it('resonant sets isAggro in-radius (the mote-lure); dead + out-of-zone mobs untouched', async () => {
    const { applyZoneEffects } = await import('./elementZones');
    const lured = mob(1, 1, 0, { isAggro: false });
    const far = mob(2, 50, 0, { isAggro: false });
    const dead = mob(3, 0, 0, { isAggro: false, health: 0 });
    applyZoneEffects([zone('resonant', 0, 0, 2)], [lured, far, dead], () => {});
    expect(lured.isAggro).toBe(true);
    expect(far.isAggro).toBe(false);
    expect(dead.isAggro).toBe(false);
  });
});

// An imbue that chains (DECISIONS 2026-10-28 W1-H item 6; Chain Imbue, Wildfire, Prism Shard): the zone leaps to the n
// nearest hostiles within CHAIN_RANGE that no zone of its kind covers, the impact's own and the chain's earlier leaps
// included, so no hostile takes one element's ticks twice. Conflux widens a painted zone by radiusMult, and the zone meets
// its neighbours at that size.
describe('spawnChain and a widened zone', () => {
  const at = (id, x, z, extra = {}) => ({ id, position: { x, y: 1, z }, health: 10, ...extra });
  const hostile = (e) => e.health > 0 && !e.passive && !e.isAlly;
  const ORIGIN = { x: 0, y: 1, z: 0 };
  // 'edge' stands 2.3 m from the impact: past any fixed 2 m floor, inside the burning zone's 2.5 m.
  const mobs = [at('near', 3, 0), at('mid', 0, 5), at('far', 7.9, 0), at('out', 9, 0), at('in', 1, 0), at('edge', 0, -2.3),
    at('pig', 2.5, 0, { passive: true }), at('ally', 0, 3, { isAlly: true }), at('dead', 0, -3, { health: 0 })];
  const impact = (req, list = mobs) => {
    const reg = makeZoneRegistry();
    spawnZone(reg, req, 0);
    const leaps = spawnChain(reg, req, list, hostile, 0);
    return { reg, leaps, spots: leaps.map((z) => [z.pos.x, z.pos.z]) };
  };
  const ticksPerMob = (reg, list) => {
    const hits = {};
    applyZoneEffects(reg.zones, list, (id) => { hits[id] = (hits[id] || 0) + 1; });
    return hits;
  };

  it('leaps to the nearest hostiles in range, nearest first, and never onto one inside the impact\'s zone', () => {
    expect(CHAIN_RANGE, 'the leap range is not the 8 m the trees state ("far" stands at 7.9 m, "out" at 9 m)').toBe(8);
    expect(impact({ kind: 'burning', pos: ORIGIN, chain: 1 }).spots).toEqual([[3, 0]]);
    const all = impact({ kind: 'burning', pos: ORIGIN, chain: 9 });
    expect(all.spots, 'the leap took a passive, an ally, a corpse, one out of range or one inside the first zone').toEqual([[3, 0], [0, 5], [7.9, 0]]);
    expect(all.reg.zones).toHaveLength(4);
    const ticks = ticksPerMob(all.reg, mobs.filter(hostile));
    expect(ticks.edge, 'a hostile inside the impact\'s zone took a second zone\'s ticks').toBe(1);
    expect(ticks.in).toBe(1);
  });

  it('two hostiles closer than a zone\'s radius get one zone between them, and each takes one tick', () => {
    const pair = [at('a', 4, 0), at('b', 6, 0), at('c', 0, 7)];
    const { reg, spots } = impact({ kind: 'burning', pos: ORIGIN, chain: 2 }, pair);
    expect(spots, 'the second leap stacked a zone on a hostile the first leap\'s zone already covers').toEqual([[4, 0], [0, 7]]);
    expect(ticksPerMob(reg, pair)).toEqual({ a: 1, b: 1, c: 1 });
    expect(BURN_TICK).toBeGreaterThan(0);
  });

  it('a hostile already standing in a zone of the element is passed over; a zone of another element does not cover it', () => {
    const reg = makeZoneRegistry();
    spawnZone(reg, { kind: 'burning', pos: { x: 3, y: 1, z: 0 } }, 0); // an earlier cast's fire around 'near'
    spawnZone(reg, { kind: 'conductive', pos: { x: 0, y: 1, z: 5 } }, 0);
    spawnZone(reg, { kind: 'burning', pos: ORIGIN }, 0);
    const leaps = spawnChain(reg, { kind: 'burning', pos: ORIGIN, chain: 2 }, mobs, hostile, 0);
    expect(leaps.map((z) => [z.pos.x, z.pos.z])).toEqual([[0, 5], [7.9, 0]]);
  });

  it('an impact that turned to steam still leaps from outside its own width', () => {
    const reg = makeZoneRegistry();
    spawnZone(reg, { kind: 'frozen', pos: { x: -4, y: 1, z: 0 } }, 0);
    const req = { kind: 'burning', pos: ORIGIN, chain: 2, radiusMult: 1.5 }; // 3.75 m: 'in', 'edge' and 'near' are inside
    expect(spawnZone(reg, req, 0), 'SETUP: fire touching ice did not annihilate').toBe(null);
    expect(spawnChain(reg, req, mobs, hostile, 0).map((z) => [z.pos.x, z.pos.z]), 'a leap landed inside the steam').toEqual([[0, 5], [7.9, 0]]);
  });

  it('a wider zone (Conflux) keeps its leaps outside its own width', () => {
    const wide = impact({ kind: 'burning', pos: ORIGIN, chain: 1, radiusMult: 1.5 }); // 3.75 m: 'near' at 3 m is inside
    expect(wide.reg.zones[0].radius).toBeCloseTo(ZONE_DEFS.burning.radius * 1.5, 10);
    expect(wide.spots).toEqual([[0, 5]]);
    expect(wide.leaps[0].radius, 'a leap was not painted at the chain\'s width').toBeCloseTo(ZONE_DEFS.burning.radius * 1.5, 10);
  });

  it('leaps nowhere with a chain of 0 or a junk count', () => {
    for (const chain of [0, -1, NaN, undefined]) {
      const { reg, leaps } = impact({ kind: 'burning', pos: ORIGIN, chain });
      expect(leaps).toEqual([]);
      expect(reg.zones).toHaveLength(1);
    }
  });

  it('a radiusMult widens a new zone; none or junk leaves its kind\'s radius', () => {
    const reg = makeZoneRegistry();
    expect(spawnZone(reg, { kind: 'burning', pos: { x: 0, y: 0, z: 0 }, radiusMult: 1.5 }, 0).radius).toBeCloseTo(ZONE_DEFS.burning.radius * 1.5, 10);
    expect(spawnZone(reg, { kind: 'frozen', pos: { x: 50, y: 0, z: 0 } }, 0).radius).toBe(ZONE_DEFS.frozen.radius);
    expect(spawnZone(reg, { kind: 'conductive', pos: { x: 90, y: 0, z: 0 }, radiusMult: -2 }, 0).radius).toBe(ZONE_DEFS.conductive.radius);
  });

  it('a widened zone annihilates and consumes a rune at the size it is drawn, and a wider re-imbue widens the zone it refreshes', () => {
    // Fire at 3.75 m and ice at 3 m, 6 m apart, overlap (6.75 > 6); at the unscaled 2.5 m they would not (5.5 < 6).
    const steam = makeZoneRegistry();
    spawnZone(steam, { kind: 'frozen', pos: { x: 6, y: 0, z: 0 } }, 0);
    expect(spawnZone(steam, { kind: 'burning', pos: { x: 0, y: 0, z: 0 }, radiusMult: 1.5 }, 0), 'overlapping fire and ice did not annihilate').toBe(null);
    expect(steam.zones).toHaveLength(0);
    const plain = makeZoneRegistry();
    spawnZone(plain, { kind: 'frozen', pos: { x: 6, y: 0, z: 0 } }, 0);
    expect(spawnZone(plain, { kind: 'burning', pos: { x: 0, y: 0, z: 0 } }, 0), 'SETUP: an unwidened fire 6 m from ice annihilated').not.toBe(null);
    // A rune (2 m) 5 m from a widened fire (3.75 m) touches it; the unscaled fire (2.5 m) would not.
    const rune = makeZoneRegistry();
    spawnZone(rune, { kind: 'resonant', pos: { x: 5, y: 0, z: 0 } }, 0);
    const amped = spawnZone(rune, { kind: 'burning', pos: { x: 0, y: 0, z: 0 }, radiusMult: 1.5 }, 0);
    expect(amped.amplified, 'a widened zone touching a rune did not consume it').toBe(true);
    expect(amped.radius).toBeCloseTo(ZONE_DEFS.burning.radius * 1.5 * AMP_RADIUS_MULT, 10);
    // Refresh: a Conflux re-imbue on a plain zone widens it; a plain re-imbue on a wide zone keeps it wide.
    const re = makeZoneRegistry();
    const z = spawnZone(re, { kind: 'burning', pos: { x: 0, y: 0, z: 0 } }, 0);
    expect(spawnZone(re, { kind: 'burning', pos: { x: 1, y: 0, z: 0 }, radiusMult: 1.5 }, 1)).toBe(z);
    expect(z.radius, 'a wider re-imbue refreshed the zone at its old size').toBeCloseTo(ZONE_DEFS.burning.radius * 1.5, 10);
    spawnZone(re, { kind: 'burning', pos: { x: 1, y: 0, z: 0 } }, 2);
    expect(z.radius, 'a plain re-imbue shrank a widened zone').toBeCloseTo(ZONE_DEFS.burning.radius * 1.5, 10);
  });
});

// THE DRAGON ON THE ONE DAMAGE PATH (reset plan row 25; DECISIONS 2026-10-30 item 126): a zone reaches a body with a
// bodyRadius (the dragon's record, game/bossCombat.js) at its edge; a mob, with none, only at its centre as before.
// Mutation-Proof: via scripts/dev/mutate.sh, each observed RED, an identity mutant GREEN: Z1 the burn ignores bodyRadius;
// Z2 the frost ignores bodyRadius.
describe('a zone reaches a big body at its edge (row 25)', () => {
  it('a burning zone 3.5 m from the dragon\'s centre burns it; the same distance from a mob does not', () => {
    const hits = [];
    const dmg = (id, n) => hits.push([id, n]);
    const zones = [{ kind: 'burning', pos: at(0, 0), radius: 2.5 }];
    applyZoneEffects(zones, [{ id: 'shadow-dragon', health: 300, bodyRadius: 1.6, position: at(3.5, 0) }], dmg);
    applyZoneEffects(zones, [{ id: 9, health: 30, position: at(3.5, 0) }], dmg);
    expect(hits).toEqual([['shadow-dragon', BURN_TICK]]);
  });
  it('a frozen zone slows the dragon\'s edge too', () => {
    const d = { id: 'shadow-dragon', health: 300, bodyRadius: 1.6, position: at(3.5, 0) };
    applyZoneEffects([{ kind: 'frozen', pos: at(0, 0), radius: 2.5 }], [d], () => {});
    expect(d.zoneSlowMult).toBeLessThan(1);
  });
});
