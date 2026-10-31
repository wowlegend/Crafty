import { describe, it, expect } from 'vitest';
import {
  makeZoneRegistry, spawnZone, stepZones, clearZones,
  MAX_ZONES, ZONE_DEFS, AMP_RADIUS_MULT, AMP_TTL_MULT,
  spawnChain, castZone, CHAIN_RANGE, applyZoneEffects, BURN_TICK,
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
  // AUDIT:ultra:ultra-game-logic-4. The cap evicted reg.zones.shift(), the FIRST PAINTED, and a refresh keeps its place
  // in the array, so a re-imbue that renewed a zone and then overflowed the cap (spawnZone, then spawnChain, in one bridge
  // tick) evicted the zone it had just renewed while zones with seconds left survived.
  describe('the cap evicts the soonest expiry', () => {
    const fill = (r, n, burnAt = (i) => i * 10) => {
      for (let i = 0; i < n; i++) spawnZone(r, { kind: 'burning', pos: at(burnAt(i), 0) }, i); // zone i expires at i + 10
    };
    it('a refreshed zone survives the overflow and the soonest-expiring one goes', () => {
      const r = makeZoneRegistry();
      fill(r, MAX_ZONES);                                                  // x 0..70, expiring at 10..17
      const first = r.zones[0];
      const again = spawnZone(r, { kind: 'burning', pos: at(1, 0) }, 14);  // re-imbue beside the first: expires at 24
      expect(again.id, 'the re-imbue did not refresh the first zone: the setup is not the scenario').toBe(first.id);
      expect(r.zones).toHaveLength(MAX_ZONES);
      spawnZone(r, { kind: 'burning', pos: at(80, 0) }, 14.5);             // the overflow
      expect(r.zones).toHaveLength(MAX_ZONES);
      expect(r.zones.some((z) => z.id === first.id), 'the zone just refreshed was evicted').toBe(true);
      expect(r.zones.some((z) => z.pos.x === 10), 'the soonest-expiring zone (x 10, 10 s into its life) survived').toBe(false);
      expect(Math.min(...r.zones.map((z) => z.expiresAt)), 'the zones left include one that expires before the one evicted').toBeGreaterThanOrEqual(12);
    });
    it('one cast (castZone: the impact, then its chain) keeps the zone it just refreshed', () => {
      const r = makeZoneRegistry();
      fill(r, MAX_ZONES, (i) => (i === 0 ? 0 : 100 + i * 10));            // the first painted sits at x 0; the rest are far off
      const a = r.zones[0];
      const mobs = [{ position: at(5, 0) }, { position: at(0, 6) }, { position: at(-5, 0) }];
      const { zone, leaps } = castZone(r, { kind: 'burning', pos: at(0.5, 0), chain: 3 }, mobs, () => true, 14); // refreshes the first painted, to 24
      expect(zone.id, 'the re-imbue did not refresh the first zone: the setup is not the scenario').toBe(a.id);
      expect(leaps, 'the chain leapt nowhere: the setup is not the scenario').toHaveLength(3);
      expect(r.zones).toHaveLength(MAX_ZONES);
      expect(r.zones.some((z) => z.id === a.id), 'a chain leap evicted the zone the same imbue had just refreshed').toBe(true);
    });
    it('the newcomer is never the one evicted, even when it expires soonest', () => {
      const r = makeZoneRegistry();
      fill(r, MAX_ZONES);
      for (const z of r.zones) z.expiresAt = 100;                          // every older zone has more life than a conductive one
      const fresh = spawnZone(r, { kind: 'conductive', pos: at(200, 0) }, 90); // 8 s: expires at 98, the soonest of all
      expect(fresh, 'the cast returned no zone').not.toBeNull();
      expect(r.zones.some((z) => z.id === fresh.id), 'the zone just cast was evicted at birth').toBe(true);
      expect(r.zones).toHaveLength(MAX_ZONES);
    });
    it('equal expiry falls back to the first painted (the old order is the tie-break)', () => {
      const r = makeZoneRegistry();
      for (let i = 0; i < MAX_ZONES; i++) spawnZone(r, { kind: 'burning', pos: at(i * 10, 0) }, 10); // all expire at 20
      spawnZone(r, { kind: 'burning', pos: at(80, 0) }, 10);
      expect(r.zones.some((z) => z.pos.x === 0), 'a tie evicted a later zone, not the first painted').toBe(false);
      expect(r.zones.some((z) => z.pos.x === 10)).toBe(true);
    });
  });
  // A cast is the unit the cap protects: the impact's zone, a zone the impact refreshed, and every chain leap. The first
  // fix protected only the zone one spawnZone call had just painted, so the next leap of the same cast evicted it, and the
  // bridge voiced a zone that was already gone (round 1's static finding 1 and dynamic F1; AUDIT:ultra:ultra-game-logic-4
  // closes on the first block below). The layouts are the dynamic reviewer's: p-zones2 (the row's own case, four boards) and
  // p-zones1 (a conductive chain into a board of frozen zones, a burning chain into a board of long burns).
  describe('one cast never evicts a zone it painted or refreshed', () => {
    const MOBS3 = [{ position: at(5, 0) }, { position: at(0, 6) }, { position: at(-5, 0) }];
    const chain = (kind, x, n) => ({ kind, pos: at(x, 0), chain: n });
    // The row's case: A is the first painted; seven others stand far off, painted at `otherAt`; at t=14 a re-imbue
    // refreshes A (to 24) and its chain adds three leaps, which overflow the board by three.
    const rowCase = (otherKind, otherAt) => {
      const r = makeZoneRegistry();
      const A = spawnZone(r, { kind: 'burning', pos: at(0, 0) }, 0);
      for (let i = 1; i <= 7; i++) spawnZone(r, { kind: otherKind, pos: at(100 + i * 10, 0) }, otherAt);
      const { zone, leaps } = castZone(r, chain('burning', 0.5, 3), MOBS3, () => true, 14);
      return { r, A, zone, leaps, others: r.zones.filter((z) => z.pos.x >= 100) };
    };
    it.each([
      ["the builder's board: seven burns painted at 7 (they expire at 17, before A's 24)", 'burning', 7],
      ['seven burns painted at 13 (they expire at 23, before A)', 'burning', 13],
      ['seven FROZEN zones painted at 13 (they expire at 25, after A: the board the first fix still evicted A on)', 'frozen', 13],
      ['seven conductive zones painted at 13.9 (they expire at 21.9, before A: the control)', 'conductive', 13.9],
    ])('the row\'s case, %s', (_name, kind, at_) => {
      const { r, A, zone, leaps, others } = rowCase(kind, at_);
      expect(zone.id, 'the re-imbue did not refresh A: the setup is not the scenario').toBe(A.id);
      expect(A.expiresAt).toBeCloseTo(24);
      expect(leaps, 'the chain did not take its three leaps: the setup is not the scenario').toHaveLength(3);
      expect(r.zones, 'the board is not at its cap').toHaveLength(MAX_ZONES);
      expect(r.zones.includes(A), 'a chain leap evicted the zone the same cast had just refreshed').toBe(true);
      expect(leaps.every((l) => r.zones.includes(l)), 'a later leap evicted an earlier one').toBe(true);
      // The three that went are the first painted of the seven (equal expiry): the rest of the board loses the soonest, not the cast.
      expect(others.map((z) => z.pos.x).sort((a, b) => a - b)).toEqual([140, 150, 160, 170]);
    });
    it('a conductive chain into a board of fresh frozen zones keeps its impact zone and every leap (the bridge voices the impact)', () => {
      const r = makeZoneRegistry();
      for (let i = 0; i < MAX_ZONES; i++) spawnZone(r, { kind: 'frozen', pos: at(i * 20, 100) }, 0); // 12 s each: they expire at 12
      const { zone, leaps } = castZone(r, chain('conductive', 500, 3), [{ position: at(505, 0) }, { position: at(500, 6) }, { position: at(495, 0) }], () => true, 2); // 8 s: expires at 10, sooner than any frozen
      expect(leaps, 'the chain did not take its three leaps: the setup is not the scenario').toHaveLength(3);
      expect(r.zones, 'the board is not at its cap').toHaveLength(MAX_ZONES);
      expect(r.zones.includes(zone), 'the impact zone was evicted by its own chain in the same tick').toBe(true);
      expect(leaps.every((l) => r.zones.includes(l)), 'a leap was evicted by a later leap').toBe(true);
      expect(r.zones.filter((z) => z.kind === 'frozen'), 'the frozen zones that remain are not the four last painted').toHaveLength(4);
      expect(r.zones.filter((z) => z.kind === 'frozen').map((z) => z.pos.x).sort((a, b) => a - b)).toEqual([80, 100, 120, 140]);
    });
    it('a burning chain of five into a board of burns that outlast it keeps the whole cast', () => {
      const r = makeZoneRegistry();
      for (let i = 0; i < MAX_ZONES; i++) { const z = spawnZone(r, { kind: 'burning', pos: at(i * 20, 100) }, 1); z.expiresAt = 16; }
      const mobs = [5, 6, -5, -6].map((d, i) => ({ position: i % 2 ? at(500, d) : at(500 + d, 0) }));
      const { zone, leaps } = castZone(r, chain('burning', 500, 5), mobs, () => true, 2); // expires at 12, before every burn on the board
      expect(leaps.filter(Boolean), 'the chain did not take its four leaps: the setup is not the scenario').toHaveLength(4);
      expect([zone, ...leaps].every((z) => r.zones.includes(z)), 'a zone of the cast was evicted by the cast').toBe(true);
      expect(r.zones).toHaveLength(MAX_ZONES);
    });
    it('the eviction among the rest is still the soonest expiry', () => {
      const r = makeZoneRegistry();
      for (let i = 0; i < MAX_ZONES - 1; i++) spawnZone(r, { kind: 'burning', pos: at(100 + i * 10, 0) }, i); // seven burns expiring at 10..16
      const late = spawnZone(r, { kind: 'frozen', pos: at(300, 0) }, 0);   // the eighth: 12 s, expires at 12
      const { zone } = castZone(r, chain('conductive', 500, 0), [], () => true, 1);
      expect(zone).not.toBeNull();
      expect(r.zones, 'the cast did not overflow the board by one: the setup is not the scenario').toHaveLength(MAX_ZONES);
      expect(r.zones.some((z) => z.pos.x === 100), 'the soonest to expire (x 100, at 10) survived').toBe(false);
      expect(r.zones.includes(late)).toBe(true);
    });
    it('a chain longer than the board holds is cut short: the cast fills the board and never evicts itself', () => {
      const r = makeZoneRegistry();
      const ring = (n) => Array.from({ length: n }, (_, i) => ({ position: at(500 + 6 * Math.cos((i / n) * Math.PI * 2), 6 * Math.sin((i / n) * Math.PI * 2)) }));
      const { zone, leaps } = castZone(r, chain('burning', 500, 20), ring(12), () => true, 0); // twelve hostiles in reach, a chain of twenty
      expect(leaps.filter(Boolean), 'the chain should stop when every zone on the board is the cast\'s own').toHaveLength(MAX_ZONES - 1);
      expect(r.zones, 'the cast should fill the board').toHaveLength(MAX_ZONES);
      expect([zone, ...leaps].every((z) => r.zones.includes(z)), 'a zone of the cast was evicted by the cast').toBe(true);
    });
    it('a chain into a board of other zones takes the board over, a zone at a time, then stops at the cap', () => {
      const r = makeZoneRegistry();
      for (let i = 0; i < 4; i++) spawnZone(r, { kind: 'frozen', pos: at(i * 20, 100) }, 0); // four others
      const ring = Array.from({ length: 12 }, (_, i) => ({ position: at(500 + 6 * Math.cos((i / 12) * Math.PI * 2), 6 * Math.sin((i / 12) * Math.PI * 2)) }));
      const { zone, leaps } = castZone(r, chain('conductive', 500, 20), ring, () => true, 1);
      expect(leaps.filter(Boolean)).toHaveLength(MAX_ZONES - 1);
      expect(r.zones.every((z) => z === zone || leaps.includes(z)), 'a zone that is not the cast\'s is still on a board the cast filled').toBe(true);
      expect(r.zones).toHaveLength(MAX_ZONES);
    });
    it('spawnZone alone, handed a cast that already owns the whole board, still holds the cap: the newcomer stays, the soonest of the rest goes', () => {
      const r = makeZoneRegistry();
      const cast = new Set();
      for (let i = 0; i < MAX_ZONES; i++) cast.add(spawnZone(r, { kind: 'burning', pos: at(i * 10, 0) }, i, cast)); // expire at 10..17
      const fresh = spawnZone(r, { kind: 'conductive', pos: at(200, 0) }, 0, cast);                                  // expires at 8: sooner than any
      expect(r.zones, 'the cap broke').toHaveLength(MAX_ZONES);
      expect(r.zones.includes(fresh), 'the newcomer was evicted at birth').toBe(true);
      expect(r.zones.some((z) => z.pos.x === 0), 'the soonest of the others (x 0, at 10) survived').toBe(false);
    });
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
