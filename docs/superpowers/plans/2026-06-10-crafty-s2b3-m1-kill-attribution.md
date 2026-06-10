# SOULBIND M1 — Kill-Bus Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-10-crafty-s2b3-soulbind-design.md` §3 M1.
> The EXPLOIT-CLOSER milestone: ships BEFORE any ally exists, so the moment one can kill, nothing farms.

**Goal:** Every mob kill carries WHO killed it; ally kills bank nothing (no ferocity/kinetic/quest credit/XP orbs) and ally hits don't judder the player (no hitstop/camera-shake).

**Architecture:** Additive, back-compatible: `emitMobKill(type, pos, source='player')` + `damageMob(id, dmg, type, source='player')`. Subscribers filter `source === 'player'`; the death branch gates XP orbs and threads source into the emit; the hitstop+shake block early-exits for non-player sources. Defaults keep every existing caller green untouched.

**Tech Stack:** the existing `mobKillBus` singleton (has `_resetMobKillBus` test helper); damageMob at SimplifiedNPCSystem.jsx:896 (hitstop :909, shake :918-920, death branch :988-1014); subscribers: `useFerocityAccrual`/`useKineticAccrual` (AdvancedGameFeatures.jsx:22,30) + QuestSystem `onMobKill` (:335).

---

### Task 1: the bus carries source (TDD)

**Files:** Modify `frontend/src/game/mobKillBus.js`; Test: extend/create `frontend/src/game/mobKillBus.test.js`

- [ ] **Step 1: failing tests** (create the test file if absent; use `_resetMobKillBus` in beforeEach):
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { subscribeMobKill, emitMobKill, _resetMobKillBus } from './mobKillBus';

beforeEach(() => _resetMobKillBus());

describe('S2-B3-M1: kill attribution', () => {
  it('passes source through to subscribers', () => {
    const seen = [];
    subscribeMobKill((type, pos, source) => seen.push(source));
    emitMobKill('zombie', [0, 0, 0], 'ally');
    expect(seen).toEqual(['ally']);
  });
  it("defaults source to 'player' (back-compat for every existing emit)", () => {
    const seen = [];
    subscribeMobKill((type, pos, source) => seen.push(source));
    emitMobKill('zombie', [0, 0, 0]);
    expect(seen).toEqual(['player']);
  });
});
```
- [ ] **Step 2: red** → **Step 3:** `export function emitMobKill(mobType, position, source = 'player') { ... cb(mobType, position, source) ... }` (+ docstring update: cb receives `(mobType, position[], source)`; source ∈ 'player'|'ally').
- [ ] **Step 4: green** → **Step 5: commit** `feat(soulbind-m1): the kill bus carries killer attribution (additive, default player)`

### Task 2: subscribers filter + damageMob source

**Files:** Modify `frontend/src/AdvancedGameFeatures.jsx` (:22,:30), `frontend/src/QuestSystem.jsx` (the onMobKill handler), `frontend/src/SimplifiedNPCSystem.jsx` (damageMob)

- [ ] **Step 1:** ferocity + kinetic accruals gain the filter (both hooks):
```js
    useEffect(() => subscribeMobKill((mobType, _pos, source) => {
        const s = useGameStore.getState();
        if (source === 'player' && s.isDay && !isCaptureMode()) s.accrueFerocity(ferocityForKill(mobType));
    }), []);
```
  (kinetic identical with accrueKinetic/kineticForKill.)
- [ ] **Step 2:** QuestSystem: the `onMobKill` callback ignores non-player kills (read the handler first; add `if (source !== 'player') return;` as its first line, threading the 3rd arg — quest credit = YOUR kills, recorded design decision).
- [ ] **Step 3:** damageMob: `const damageMob = (id, damage = 25, type = 'physical', source = 'player') => {` · wrap the hitstop line + the cameraShake block in `if (source === 'player') { ... }` (comment: ally hits must not judder the player — the B3 design's load-bearing param) · in the death branch: wrap the XP-orb for-loop in `if (source === 'player') { ... }` and thread `emitMobKill(entity.type, [...], source)`.
- [ ] **Step 4:** unit-level exploit tests (extend `tests/store/` or a new `tests/integration/killAttribution.test.js` if the store harness can't reach damageMob — damageMob is component-closure-scoped, so test VIA THE BUS: subscribe a ferocity-style filtered handler, emit with 'ally', assert no accrual; the damageMob-side wiring is locked by a STATIC gate instead):
```js
// tests/gates/kill-attribution-gates.test.js
// (read-file gate) SimplifiedNPCSystem.jsx must: have the 4-arg damageMob signature; gate hitstop,
// cameraShake, and the XP-orb loop on source === 'player'; thread source into emitMobKill.
expect(npc).toMatch(/damageMob = \(id, damage = 25, type = 'physical', source = 'player'\)/);
expect(npc).toMatch(/emitMobKill\(entity\.type, \[[^\]]+\], source\)/);
```
  (+ regexes for the two `source === 'player'` guards; exact patterns written at build time against the real lines.)
- [ ] **Step 5: full battery** (suite grows; build; visual 13/13 — no render changes) → **commit** `feat(soulbind-m1): ally kills bank nothing — subscriber filters + damageMob source gating (exploit-closed)`

### Task 3: close-out
- [ ] Spec §3 M1 row ✅ + this plan ✅ SHIPPED + ACTIVE_PLAN (next = M2 SM+meter). No CHANGELOG until the Aspect milestones aggregate (M1 is small; fold into the next milestone-grade entry).

## Self-review
- Spec coverage: the M1 row's three clauses (additive bus arg ✓T1; subscribers filter ✓T2.1-2; ally deaths never emit→ CORRECTED: they DO emit with source='ally' so future subscribers CAN react (e.g. squad UI), they just bank nothing — the design doc's "never emit" was imprecise, the exploit-relevant truth is "bank nothing"; recorded) + the damageMob source param (hitstop/shake/XP) ✓T2.3.
- Placeholders: the T2.4 gate regexes are explicitly deferred-to-build against real lines (not TBD — the shape is given).
- Type consistency: `(mobType, position, source)` ordering everywhere ✓.
