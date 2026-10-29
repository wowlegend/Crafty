import { describe, it, expect } from 'vitest';
import {
  makeZoneRegistry, spawnZone, stepZones, clearZones,
  MAX_ZONES, ZONE_DEFS, AMP_RADIUS_MULT, AMP_TTL_MULT,
  chainTargets, CHAIN_RANGE, CHAIN_MIN_DIST,
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
// nearest hostiles within CHAIN_RANGE, outside CHAIN_MIN_DIST; Conflux widens a painted zone by radiusMult.
describe('chainTargets and a widened zone', () => {
  const at = (id, x, z, extra = {}) => ({ id, position: { x, y: 1, z }, health: 10, ...extra });
  const hostile = (e) => e.health > 0 && !e.passive && !e.isAlly;
  const mobs = [at('near', 3, 0), at('mid', 0, 5), at('far', 7.9, 0), at('out', 9, 0), at('in', 1, 0),
    at('pig', 2.5, 0, { passive: true }), at('ally', 0, 3, { isAlly: true }), at('dead', 0, -3, { health: 0 })];

  it('returns the n nearest accepted mobs in range, nearest first, skipping one inside the zone it leaps from', () => {
    expect(chainTargets({ x: 0, y: 1, z: 0 }, mobs, 1, CHAIN_RANGE, hostile)).toEqual([{ x: 3, y: 1, z: 0 }]);
    expect(chainTargets({ x: 0, y: 1, z: 0 }, mobs, 2, CHAIN_RANGE, hostile)).toEqual([{ x: 3, y: 1, z: 0 }, { x: 0, y: 1, z: 5 }]);
    const all = chainTargets({ x: 0, y: 1, z: 0 }, mobs, 9, CHAIN_RANGE, hostile);
    expect(all.length, 'the leap took a passive, an ally, a corpse, one out of range or one inside the first zone').toBe(3);
    expect(all.map((p) => p.x)).toEqual([3, 0, 7.9]);
    expect(CHAIN_MIN_DIST).toBeGreaterThan(1);
  });

  it('leaps nowhere with a chain of 0 or a junk count', () => {
    for (const n of [0, -1, NaN, undefined]) expect(chainTargets({ x: 0, y: 1, z: 0 }, mobs, n, CHAIN_RANGE, hostile)).toEqual([]);
  });

  it('a radiusMult widens a new zone; none or junk leaves its kind\'s radius', () => {
    const reg = makeZoneRegistry();
    expect(spawnZone(reg, { kind: 'burning', pos: { x: 0, y: 0, z: 0 }, radiusMult: 1.5 }, 0).radius).toBeCloseTo(ZONE_DEFS.burning.radius * 1.5, 10);
    expect(spawnZone(reg, { kind: 'frozen', pos: { x: 50, y: 0, z: 0 } }, 0).radius).toBe(ZONE_DEFS.frozen.radius);
    expect(spawnZone(reg, { kind: 'conductive', pos: { x: 90, y: 0, z: 0 }, radiusMult: -2 }, 0).radius).toBe(ZONE_DEFS.conductive.radius);
  });
});
