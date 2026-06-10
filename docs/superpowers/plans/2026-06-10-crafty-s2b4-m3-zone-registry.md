# ELEMANCER M3 — The Zone Registry Implementation Plan

> **✅ SHIPPED (2026-06-10, loop iter 68):** T1 (the registry, 9/9 chemistry contracts) + T2 (the channel + the gate). 814 unit (99 files) · build · visual 13/13.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-10-crafty-s2b4-elemancer-design.md` §2/§3 M3.
> **THE GATE JOINS HERE — before any render exists.** The FORBIDDEN regex matches the literal string
> `postMessage` even inside comments (the recorded trap): none of the elemancer files may contain
> the word in any form.

**Goal:** The pure chemistry core: a zone registry whose OVERLAP RULES make the four elements combinatorial (fire+ice annihilate; arcane amplifies whatever touches it), plus the request channel and the no-re-mesh gate — zero render, zero store, zero worker.

**Architecture:** `game/elementZones.js` exports pure functions over a caller-owned registry object `{ zones: [] }` (tests own instances; the M4 bridge owns the live one — NOT module-global state, unlike the single-slot channels). Spawn-time resolution: dedupe-spacing refreshes same-kind neighbors; opposing kinds annihilate; a resonant rune is CONSUMED by the next non-resonant spawn touching it (amplifying it). `game/elemancerChannel.js` is the hurlChannel twin (single-slot request transient). The gate file clones the voidhand FORBIDDEN regex over the four elemancer modules.

**Tech Stack:** vitest colocated; the hurlChannel/snareChannel single-slot pattern; tests/gates/voidhand-noremesh-gates.test.js as the gate stencil.

---

### Task 1: `game/elementZones.js` — the registry + the overlap rules (TDD; the rules ARE the design)

**Files:** Create `frontend/src/game/elementZones.js` + `frontend/src/game/elementZones.test.js`

- [x] **Step 1: failing tests:**
```js
import { describe, it, expect } from 'vitest';
import {
  makeZoneRegistry, spawnZone, stepZones, clearZones,
  MAX_ZONES, ZONE_DEFS, DEDUPE_DIST, AMP_RADIUS_MULT, AMP_TTL_MULT,
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
```
- [x] **Step 2: red** → **Step 3: implement:**
```js
/**
 * elementZones.js — S2-B4-M3: the ELEMANCER chemistry core (pure). A caller-owned registry
 * of element ZONES — stateful, time-acting surface effects (never voxel edits; the no-re-mesh
 * gate gates this file from birth). THE OVERLAP RULES ARE THE DESIGN (combinatorial chemistry):
 * same-kind nearby = REFRESH (no stack-stamping) · fire<->ice = ANNIHILATE both (steam) ·
 * a resonant rune is CONSUMED by the next non-resonant spawn touching it, AMPLIFYING it
 * (arcane bends, never reacts — the catalyst identity, design §2). MAX_ZONES oldest-evict:
 * the economy cap IS the perf cap. The M4 bridge owns the live registry + the tick; M6 owns
 * the look. All numbers Kevin-tunable.
 */
export const MAX_ZONES = 8;
export const DEDUPE_DIST = 2;       // same-kind within this = refresh, not respawn
export const AMP_RADIUS_MULT = 1.5; // the rune's gift
export const AMP_TTL_MULT = 1.5;

export const ZONE_DEFS = {
  burning:    { radius: 2.5, ttl: 10 },
  frozen:     { radius: 3,   ttl: 12 },
  conductive: { radius: 3,   ttl: 8  },
  resonant:   { radius: 2,   ttl: 12 },
};

const OPPOSED = { burning: 'frozen', frozen: 'burning' };

const d2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

export function makeZoneRegistry() {
  return { zones: [], nextId: 1 };
}

/** spawnZone(reg, {kind, pos}, now) -> the live zone (new or refreshed) | null (annihilated). */
export function spawnZone(reg, spec, now) {
  const def = ZONE_DEFS[spec.kind];
  if (!def) return null;

  // ANNIHILATION: the new spawn touching an opposed zone consumes BOTH (steam, not stacking).
  const enemyKind = OPPOSED[spec.kind];
  if (enemyKind) {
    const enemy = reg.zones.find((z) => z.kind === enemyKind && d2(z.pos, spec.pos) <= (z.radius + def.radius) ** 2);
    if (enemy) {
      reg.zones = reg.zones.filter((z) => z !== enemy);
      return null;
    }
  }

  // DEDUPE: a same-kind neighbor refreshes instead of stamping a twin.
  const near = reg.zones.find((z) => z.kind === spec.kind && d2(z.pos, spec.pos) <= DEDUPE_DIST ** 2);
  if (near) {
    near.expiresAt = now + (near.amplified ? def.ttl * AMP_TTL_MULT : def.ttl);
    return near;
  }

  // AMPLIFICATION: a non-resonant spawn touching a rune consumes it and grows.
  let amplified = false;
  if (spec.kind !== 'resonant') {
    const rune = reg.zones.find((z) => z.kind === 'resonant' && d2(z.pos, spec.pos) <= (z.radius + def.radius) ** 2);
    if (rune) {
      reg.zones = reg.zones.filter((z) => z !== rune);
      amplified = true;
    }
  }

  const zone = {
    id: reg.nextId++,
    kind: spec.kind,
    pos: { x: spec.pos.x, y: spec.pos.y, z: spec.pos.z },
    radius: def.radius * (amplified ? AMP_RADIUS_MULT : 1),
    expiresAt: now + def.ttl * (amplified ? AMP_TTL_MULT : 1),
    amplified,
  };
  reg.zones.push(zone);
  if (reg.zones.length > MAX_ZONES) reg.zones.shift(); // oldest-evict
  return zone;
}

/** stepZones(reg, now) -> { expired } — the bridge ticks this at 15Hz (M4). */
export function stepZones(reg, now) {
  const expired = reg.zones.filter((z) => now >= z.expiresAt);
  if (expired.length) reg.zones = reg.zones.filter((z) => now < z.expiresAt);
  return { expired };
}

/** clearZones(reg) — the dawn contract: zones never survive the day-flip. */
export function clearZones(reg) {
  reg.zones = [];
}
```
- [x] **Step 4: green → commit** `feat(elemancer-m3): the zone registry — annihilation, amplification, dedupe, the 8-cap`

### Task 2: `game/elemancerChannel.js` + the gate

**Files:** Create `frontend/src/game/elemancerChannel.js` + colocated test; Create `frontend/tests/gates/elemancer-noremesh-gates.test.js`

- [x] **Step 1:** the channel (the hurlChannel twin): `requestZone({kind, pos})` / `consumeZoneRequest()` single-slot + a 2-test roundtrip suite (the snareChannel test shape).
- [x] **Step 2:** the gate — clone the voidhand gate file shape: FORBIDDEN = the same regex; GATED = ['game/elemancer.js', 'game/resonance.js', 'game/elementZones.js', 'game/elemancerChannel.js'] (extend at M4/M6 as world/ files appear). NOTE: write every comment in these files without the literal forbidden words.
- [x] **Step 3: full battery → commit** `feat(elemancer-m3): the zone request channel + the elemancer no-re-mesh gate (gated from birth)`

### Task 3: close-out — spec §3 M3 row ✅ · this plan SHIPPED · ACTIVE_PLAN → M4 (the zone bridge: the 15Hz accumulator applying DoT/slow/chain/lure + zoneSlowMult replacing the dead mobSlowEffects + the AI heightGrid bias).

## Self-review
- Spec coverage: the M3 row's four clauses (registry+rules ✓T1, channel ✓T2, the gate-joins-here ✓T2, "before any render" ✓ — no world/ file exists yet) ✓.
- Placeholders: none — both modules fully coded; the gate is a clone-with-list instruction against a named stencil.
- Type consistency: spawnZone returns zone|null (annihilation = null — M5's apply-site treats null as "the cast still spent, the steam IS the effect"; recorded for M5); stepZones' expired array feeds M6's char decals ✓.
