# ELEMANCER M4 — The Zone Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-10-crafty-s2b4-elemancer-design.md` §2/§3 M4.
> **A design simplification found at plan time:** `applyChainLightning` is a useCallback closure inside
> EnhancedMagicSystem (:148) — unreachable from the bridge without new registration. UNNEEDED: the
> conductive ZONE already defines the chain area, so the v1 pulse simply hits every in-zone mob — the
> zone IS the chain. Honest, simpler, no new coupling.

**Goal:** Chemistry acts on combat: burning zones tick DoT, frozen zones slow, conductive zones pulse, resonant runes lure — all main-thread, 15Hz-bridged, attribution-safe ('hazard'), capture-gated; the dead `mobSlowEffects` plumbing is deleted and replaced by the unit-locked `zoneSlowMult` consumer.

**Architecture:** `world/ElementZoneSystem.jsx` owns the LIVE registry (module instance) + the 15Hz accumulator (the SquadAISystem stencil): consume `elemancerChannel` requests → `spawnZone`; `stepZones` per tick; zone effects at an inner ≤4Hz FX cadence (the React-thrash damper — load-bearing). Effects per kind: burning = `damageMob(id, BURN_TICK, 'fireball', 'hazard')` per in-radius mob · frozen = `e.zoneSlowMult = SLOW_MULT` in-zone / reset 1 out (consumed at the ONE mobsData speed line :874) · conductive = `damageMob(id, SHOCK_TICK, 'lightning', 'hazard')` per pulse · resonant = `e.isAggro = true` in-radius (the lure — persists through the worker, the M5-squad precedent). Dawn: a prevIsDay ref — on the night→day flip, `clearZones`. The dead `mobSlowEffects` writes + store fields are DELETED (justification: written dead at ship — zero readers, the workflow-verified fact; `zoneSlowMult` is its working replacement, unit-locked at the consumer).

**Tech Stack:** the M3 registry/channel; the SquadAISystem accumulator (AI_TICK_SEC 1/15, capture-gated); the mobsData speed line (SimplifiedNPCSystem:874); the 'hazard' source (M1).

---

### Task 1: the bridge system

**Files:** Create `frontend/src/world/ElementZoneSystem.jsx`; extend `frontend/tests/gates/elemancer-noremesh-gates.test.js` GATED += the new file

- [ ] **Step 1:** the system (the SquadAISystem shape; constants at top, all Kevin-tunable):
```jsx
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/useGameStore';
import { GameMethods } from '../GameMethods';
import { mobsQuery } from '../ecs/world';
import { isCaptureMode } from '../devtest/captureMode';
import { makeZoneRegistry, spawnZone, stepZones, clearZones } from '../game/elementZones';
import { consumeZoneRequest } from '../game/elemancerChannel';

const AI_TICK_SEC = 1 / 15;   // the bridge cadence (the SquadAISystem stencil)
const FX_TICK_SEC = 0.3;      // zone effects at ~3.3Hz — the React-thrash damper (<=4Hz, load-bearing)
const BURN_TICK = 4;          // burning DoT per FX tick (~13 dps in-zone)
const SHOCK_TICK = 6;         // conductive pulse per FX tick
const SLOW_MULT = 0.4;        // frozen: mobs crawl at 40% (consumed at the mobsData speed line)

// the LIVE registry — owned here (M6's render reads it transiently; tests own their own instances)
const liveZones = makeZoneRegistry();
export function getLiveZones() { return liveZones; }

/**
 * ElementZoneSystem — S2-B4-M4: chemistry acts on combat. Main-thread only (the v1 stance:
 * zero worker traffic — gated); effects cadence-damped so damage numbers/shockwaves can't
 * thrash React. Attribution: every zone hit is source 'hazard' (banks nothing — M1).
 * The resonant lure sets isAggro (persists through the worker — the proven squad precedent).
 */
export function ElementZoneSystem() {
  const accumRef = useRef(0);
  const fxAccumRef = useRef(0);
  const prevIsDayRef = useRef(true);

  useFrame((state, delta) => {
    if (isCaptureMode()) return;
    const store = useGameStore.getState();

    // the dawn contract: zones never survive the night->day flip
    if (store.isDay && !prevIsDayRef.current) clearZones(liveZones);
    prevIsDayRef.current = store.isDay;

    accumRef.current += delta;
    if (accumRef.current < AI_TICK_SEC) return;
    accumRef.current = 0;

    const now = state.clock.getElapsedTime();
    const req = consumeZoneRequest();
    if (req) spawnZone(liveZones, req, now);
    stepZones(liveZones, now); // (M6 consumes .expired for char decals)

    if (liveZones.zones.length === 0) return;

    fxAccumRef.current += AI_TICK_SEC;
    if (fxAccumRef.current < FX_TICK_SEC) return;
    fxAccumRef.current = 0;

    for (const z of liveZones.zones) {
      const r2 = z.radius * z.radius;
      for (const e of mobsQuery.entities) {
        if (!e || e.health <= 0) continue;
        const dx = e.position.x - z.pos.x, dz = e.position.z - z.pos.z;
        const inside = dx * dx + dz * dz <= r2;
        if (z.kind === 'frozen') {
          if (inside) e.zoneSlowMult = SLOW_MULT;
          else if (e.zoneSlowMult !== undefined && e.zoneSlowMult !== 1) e.zoneSlowMult = 1;
        } else if (!inside) {
          continue;
        } else if (z.kind === 'burning') {
          if (GameMethods.damageMob) GameMethods.damageMob(e.id, BURN_TICK, 'fireball', 'hazard');
        } else if (z.kind === 'conductive') {
          if (GameMethods.damageMob) GameMethods.damageMob(e.id, SHOCK_TICK, 'lightning', 'hazard');
        } else if (z.kind === 'resonant') {
          e.isAggro = true; // the mote-lure: the siege turns toward the rune
        }
      }
    }
  });
  return null;
}
```
  NOTE the frozen reset semantics: a mob leaving ALL frozen zones resets to 1 — the per-zone loop above resets only vs THIS zone; with multiple frozen zones a mob inside zone B but outside zone A must NOT be reset by A's pass. FIX in implementation: compute frozen membership in a FIRST pass (a Set of slowed ids), then assign mults in a second pass. Write the test for exactly this (two frozen zones, a mob in one).
- [ ] **Step 2:** the gate list += 'world/ElementZoneSystem.jsx'. A pure-logic test for the two-pass frozen semantics? The bridge is a component — test the EXTRACTED helper: pull the per-tick effect application into an exported pure `applyZoneEffects(zones, mobs, damageFn)` (returns nothing; mutates mobs' zoneSlowMult + calls damageFn) so the two-frozen-zones case is unit-testable. The component body shrinks to plumbing.
- [ ] **Step 3: red-first on the helper's tests** (burning ticks via damageFn with 'hazard'; frozen two-zone membership; conductive pulses; resonant aggro; out-of-zone untouched) → implement → **battery → commit** `feat(elemancer-m4): the zone bridge — chemistry acts on combat (DoT/slow/pulse/lure, hazard-attributed, cadence-damped)`

### Task 2: the zoneSlowMult consumer + the dead-plumbing deletion

**Files:** Modify `frontend/src/SimplifiedNPCSystem.jsx` (:874), `frontend/src/EnhancedMagicSystem.jsx` (the dead writes), `frontend/src/store/useGameStore.jsx` (:341-342); extend the elemancer gate file with the consumer lock

- [ ] **Step 1:** the consumer: `speed: e.speed,` → `speed: e.speed * (e.zoneSlowMult || 1), // S2-B4-M4: frozen zones slow (the ONE consumer — gate-locked)`.
- [ ] **Step 2:** DELETE the `mobSlowEffects`/`mobStunEffects` writes in EnhancedMagicSystem (:121-146 — the iceball secondary keeps its damage, loses the dead state writes) + the store fields (:341-343). **The written justification (for the commit body):** these writes shipped DEAD — zero readers anywhere in src (the B4 design workflow verified by grep; the proven unwiring failure mode) — and `zoneSlowMult` is the working, consumer-locked replacement.
- [ ] **Step 3:** the consumer lock in the elemancer gate file: `expect(read('SimplifiedNPCSystem.jsx')).toMatch(/e\.speed \* \(e\.zoneSlowMult \|\| 1\)/)` + `expect(read('EnhancedMagicSystem.jsx')).not.toMatch(/mobSlowEffects/)` (the dead plumbing stays dead).
- [ ] **Step 4: battery → commit** `feat(elemancer-m4): zoneSlowMult consumed at the mobsData speed line; the dead mobSlowEffects plumbing deleted (justified)`

### Task 3: mount + close-out
- [ ] Mount `<ElementZoneSystem />` beside `<SquadAISystem />` in Components. Battery. Spec §3 M4 row ✅ · this plan SHIPPED · ACTIVE_PLAN → M5 (IMBUE end-to-end: the KeyZ intent + the armed reticle + the surfaceHint + the zone spawn at impact — the verb becomes playable).

## Self-review
- Spec coverage: the M4 row's four clauses (the bridge ✓T1, zoneSlowMult-replaces-dead ✓T2, the heightGrid hazard-bias — DEFERRED honestly: the design listed it for M4 but it touches the worker-input build; fold into M7's balance pass IF playtest shows mobs ignoring fire looks wrong; recorded as a deliberate reduction) + cadence-damping ✓T1.
- Placeholders: none — the system is fully coded; the two-pass frozen fix is an explicit in-implementation instruction WITH its test named.
- Type consistency: applyZoneEffects(zones, mobs, damageFn) extracted for testability; 'hazard' everywhere; getLiveZones() exported for M6.
