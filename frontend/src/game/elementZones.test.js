import { describe, it, expect } from 'vitest';
import {
  makeZoneRegistry, spawnZone, stepZones, clearZones,
  MAX_ZONES, ZONE_DEFS, AMP_RADIUS_MULT, AMP_TTL_MULT,
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
