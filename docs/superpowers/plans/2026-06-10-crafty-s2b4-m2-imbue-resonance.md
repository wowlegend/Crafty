# ELEMANCER M2 — The Imbue Latch + The Resonance Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-10-crafty-s2b4-elemancer-design.md` §2/§3 M2.

**Goal:** The pure imbue LATCH (hold-Z arms the next cast) + the NOVEL Resonance economy (banked from day BUILD verbs — building literally charges the chemistry) + the talent gate + persistence; zero render/zone wiring (M3-M5).

**Architecture:** `game/resonance.js` is the soul.js stencil EXCEPT the accrual: NO kill-bus subscription — the gains hook the mine/place EXECUTORS in Terrain.jsx (the verified accrual site at :653-713; executors never run in capture, so capture-gating is structural; day-only checked at the accrual). `game/elemancer.js` is a LATCH, not a channel: simpler than every prior SM — `decideImbue` arms on Z (bank-gated + talent-gated at the apply-site ctx), disarms on re-press/death/menu, and CONSUMES on cast.

**Tech Stack:** the kinetic/soul stencil chain (store triplet + both load sites + the progression slice + the dawn bleed + the autosave diff); the talent twins; Terrain.jsx mine (:653-678) / place (:680-713) executors.

---

### Task 1: `game/resonance.js` (TDD)

**Files:** Create `frontend/src/game/resonance.js` + `frontend/src/game/resonance.test.js`

- [ ] **Step 1: failing tests:**
```js
import { describe, it, expect } from 'vitest';
import { RESONANCE_MAX, ZONE_COST, MINE_GAIN, PLACE_GAIN, clampResonance, canIgnite } from './resonance';

describe('S2-B4-M2: the Resonance economy (the BUILD-verb meter — the novel slot)', () => {
  it('constants: 100 bank, 30 per zone, mine 1 / place 2 (design §2)', () => {
    expect(RESONANCE_MAX).toBe(100); expect(ZONE_COST).toBe(30);
    expect(MINE_GAIN).toBe(1); expect(PLACE_GAIN).toBe(2);
  });
  it('clampResonance: rounds, clamps [0,MAX], swallows non-finite', () => {
    expect(clampResonance(150)).toBe(100); expect(clampResonance(-5)).toBe(0);
    expect(clampResonance(49.6)).toBe(50); expect(clampResonance(NaN)).toBe(0);
  });
  it('canIgnite gates on ZONE_COST', () => {
    expect(canIgnite(30)).toBe(true); expect(canIgnite(29)).toBe(false);
  });
});
```
- [ ] **Step 2: red** → **Step 3:** implement (the kinetic.js copy-shape minus the PER_KILL table; docstring: "the ELEMANCER Resonance economy (pure) — the BUILD-verb meter: mining/placing by day charges the chemistry (the only untaken economy slot; design §2); spent per zone ignition; dawn-bled like every Aspect meter").
- [ ] **Step 4: green → commit** `feat(elemancer-m2): the Resonance economy — the build-verb meter (1 mine / 2 place / 30 per zone)`

### Task 2: `game/elemancer.js` — the imbue latch (TDD)

**Files:** Create `frontend/src/game/elemancer.js` + `frontend/src/game/elemancer.test.js`

- [ ] **Step 1: failing tests:**
```js
import { describe, it, expect } from 'vitest';
import { makeImbueState, decideImbue } from './elemancer';

const base = { imbueEdge: false, castFired: false, active: true, alive: true, canIgnite: true };

describe('S2-B4-M2: the imbue LATCH (simpler than every prior SM — armed until cast or cancel)', () => {
  it('Z with bank+talent (ctx.canIgnite) -> arm; Z again -> disarm (a toggle)', () => {
    const armed = decideImbue(makeImbueState(), { ...base, imbueEdge: true });
    expect(armed.action).toBe('arm');
    expect(armed.sm.armed).toBe(true);
    const off = decideImbue(armed.sm, { ...base, imbueEdge: true });
    expect(off.action).toBe('disarm');
    expect(off.sm.armed).toBe(false);
  });
  it('Z without canIgnite -> none (the bank/talent gate)', () => {
    expect(decideImbue(makeImbueState(), { ...base, imbueEdge: true, canIgnite: false }).action).toBe('none');
  });
  it('cast while armed -> consume (the apply-site spends + tags the projectile) + the latch clears', () => {
    const armed = decideImbue(makeImbueState(), { ...base, imbueEdge: true }).sm;
    const used = decideImbue(armed, { ...base, castFired: true });
    expect(used.action).toBe('consume');
    expect(used.sm.armed).toBe(false);
  });
  it('cast while NOT armed -> none (normal casts unaffected)', () => {
    expect(decideImbue(makeImbueState(), { ...base, castFired: true }).action).toBe('none');
  });
  it('death/menu while armed -> disarm (no dangling latch)', () => {
    const armed = decideImbue(makeImbueState(), { ...base, imbueEdge: true }).sm;
    expect(decideImbue(armed, { ...base, alive: false }).action).toBe('disarm');
    expect(decideImbue(armed, { ...base, active: false }).action).toBe('disarm');
  });
});
```
- [ ] **Step 2: red** → **Step 3:** implement (the {armed} latch reducer; the docstring notes WHY a latch beats a channel here: imbue is a stance, not an aim-test — the skill lives in WHAT you cast at, which M5's zone spawn judges).
- [ ] **Step 4: green → commit** `feat(elemancer-m2): the imbue latch — armed until cast or cancel`

### Task 3: store + persistence + dawn + THE BUILD-VERB ACCRUAL

**Files:** Modify `frontend/src/store/useGameStore.jsx` (the soulBanked triplet's twin: resonanceBanked/setResonanceBanked/accrueResonance + BOTH load sites), `frontend/src/game/saveSchema.js` (the progression slice line), `frontend/src/AdvancedGameFeatures.jsx` (the dawn block gains `setResonanceBanked(0)` — NO accrual hook here: the economy is NOT kill-driven), `frontend/src/App.jsx` (the autosave diff), **`frontend/src/world/Terrain.jsx`** (the accrual: in the `mine` executor success path `accrueResonance(MINE_GAIN)` and the `place` success path `accrueResonance(PLACE_GAIN)`, both behind `store.isDay` — executors never run in capture, structural gating; import MINE_GAIN/PLACE_GAIN); Tests: the soulbindStore.test twin (`tests/store/elemancerStore.test.js`) + the saveSchema slice assertion

- [ ] **Step 1:** locate-then-twin EVERY `soulBanked` site (the grep list from B3-M2: store triplet, 2 load sites, slice, dawn, autosave diff) + the Terrain accrual (NEW — no precedent: keep it 2 lines per executor, commented `// S2-B4-M2: building charges the chemistry (day-only; capture never runs executors)`).
- [ ] **Step 2:** tests: the store twin (accrue clamps/spend debits/slice serializes) + one NEW shape: a resonance-accrual note in the noremesh gate? NO — Terrain.jsx is legitimately a voxel file; just the store tests.
- [ ] **Step 3: full battery → commit** `feat(elemancer-m2): resonanceBanked — store/save/dawn + the build-verb accrual at the mine/place executors`

### Task 4: the talent node + close-out

- [ ] `elemancer_imbue` { limit: 1, prereq: 'elemancer_focus' } effect-less + the talent test twins (the soulbind_snare shape) → battery → commit `feat(elemancer-m2): the elemancer_imbue talent node`.
- [ ] Spec §3 M2 row ✅ · this plan SHIPPED · ACTIVE_PLAN → M3 (the zone registry + the noremesh gate BEFORE any render).

## Self-review
- Spec coverage: M2 row = "imbue SM + resonance (build-verb accrual) + the talent node + persistence" — T2/T1+T3/T4/T3 ✓. The §2 numbers (100/30, mine 1/place 2) pinned in T1 tests ✓.
- Placeholders: none — T3 is locate-then-twin against the named B3-M2 site list + a 2-line new accrual with its exact comment.
- Type consistency: decideImbue ctx {imbueEdge, castFired, active, alive, canIgnite} consistent between tests and impl; canIgnite (the bank gate) composed with the talent at the apply-site (M5), exactly like canSnare ∧ soulbind_snare ✓.
