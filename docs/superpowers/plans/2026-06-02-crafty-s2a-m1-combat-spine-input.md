# S2-A-M1 — Combat Spine + Input Abstraction — Implementation Plan

> STATUS: ✅ COMPLETE + MERGED (2026-06-02). 360 unit · build clean · visual 12/12. Final review APPROVE_WITH_NITS.

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` to implement this plan task-by-task (Crafty convention: Opus implementer + spec-compliance + code-quality review per task; sequential where files are shared; TDD red-first; `npm run build` + `npm run test:unit` green per task; no Claude footer; subagent fix-ups = NEW commits). Steps use `- [x]` for tracking.

**Goal:** Establish the input-abstraction layer every future verb + the touch layer will gate on, let melee hit the boss (close the combat asymmetry), and fix two combat-feel bugs (dead boss music + torn weapon ribbon) — all on the existing, verified combat verbs (dodge-roll + swing-cone already exist; this is wire/fix, not rebuild).

**Architecture:** A single source-of-truth **input-intent module** (`src/input/inputState.js`) holds an imperative intent object (move/jump/dodge/attack/cast/interact + an `active` flag). One writer (the existing Components.jsx listeners) maps KB+mouse → intents + sets `active` from pointer-lock; all verb code READS intents via a transient getter (never reactive — game-loop isolation), and NO verb reads `document.pointerLockElement` directly. Melee gains a boss-cone branch mirroring the spell's existing boss path. Two surgical bug fixes complete the feel pass.

**Tech Stack:** React 19 · @react-three/fiber 9.5 · Rapier 2.2 (WASM KCC) · zustand 5 · Three 0.172 · Vitest. Run all npm from `/Users/kz/Code/Crafty/frontend`.

**Grounding (verified file:line, 2026-06-02 code-map):**
- Input: raw events + `document.pointerLockElement` gate at `Components.jsx:313-320` (mouse→melee/cast), `:435` (`isLocked` for movement), `:299-300` (dodge `ShiftLeft/Right`), `:303-305` (F-key melee). **No intent layer exists.**
- Dodge-roll: `Components.jsx:172-179` (state), `:437-471` (activate), `:476` (i-frame check), `:579-590` (movement curve). **Keep.**
- Melee cone: `Components.jsx:240-272` → `GameMethods.checkMobsInMeleeCone` (`SimplifiedNPCSystem.jsx:959-976`, iterates `mobsQuery.entities` ECS) → `GameMethods.damageMob` (`SimplifiedNPCSystem.jsx:828-947`). **Keep.**
- Boss asymmetry: boss is NOT in the ECS — it's `<BossEntity>` + refs in `AdvancedGameFeatures.jsx:281` + store `isBossActive()`/`getBossPosition()`/`damageBoss()` (`useGameStore.jsx:388-389`). Spell hits it via a SEPARATE branch `EnhancedMagicSystem.jsx:495-513`. Melee has no such branch.
- Boss-music mismatch: written as LOCAL `useState` `[bossActive,setBossActive]` (`AdvancedGameFeatures.jsx:90`, never synced) vs read from zustand `state.bossActive` (`SoundManager.jsx:40`). The store does expose `isBossActive()` (a fn, `useGameStore.jsx:388`) but there is no `bossActive` VALUE writer.
- Ribbon bug: `Components.jsx:988-995` — `indices[i*6+2]` is written TWICE; `indices[i*6+5]` stays 0 → torn 2nd triangle.

**File structure:**
- Create `src/input/inputState.js` — the intent module (pure, node-testable; no R3F import).
- Create `src/input/inputState.test.js` — unit tests for the module.
- Modify `Components.jsx` — writer (listeners → intents) + verb reads (movement/dodge/melee/cast read intents) + the melee boss-cone branch + the ribbon fix.
- Modify `SimplifiedNPCSystem.jsx` — extract a pure `isPointInCone(...)` helper (reused by the boss-cone branch) without changing `checkMobsInMeleeCone` behavior.
- Modify `AdvancedGameFeatures.jsx` — write the store `bossActive` value on boss spawn/despawn (sync the music key).
- Create `tests/gates/input-abstraction-gates.test.js` — static gate: no verb reads `document.pointerLockElement` outside the input writer; intents are read transiently.
- Modify `tests/gates/` as needed; no visual re-baseline expected (combat verbs aren't in capture states).

---

## Task 1 — Input-intent module (the abstraction layer, A8)

**Files:**
- Create: `src/input/inputState.js`
- Test: `src/input/inputState.test.js`

The module owns ONE imperative intent object + a transient getter (no React state, no reactive subscription — read in `useFrame` via the getter). Source-agnostic: KB+mouse writes it now; a future virtual-joystick/touch layer writes the same intents. `active` replaces scattered `document.pointerLockElement` checks (the writer sets it from pointer-lock today).

- [x] **Step 1 — Write the failing test** (`src/input/inputState.test.js`, `// @vitest-environment node`):
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { getInput, setIntent, setActive, resetInput, INTENT_KEYS } from './inputState.js';

describe('input intent module', () => {
  beforeEach(() => resetInput());
  it('defaults: all intents false, inactive', () => {
    const s = getInput();
    expect(s.active).toBe(false);
    for (const k of INTENT_KEYS) expect(s[k]).toBe(false);
  });
  it('setIntent flips a single intent; getInput reflects it', () => {
    setIntent('dodge', true);
    expect(getInput().dodge).toBe(true);
    expect(getInput().attack).toBe(false);
  });
  it('setActive gates the active flag (replaces pointer-lock checks)', () => {
    setActive(true); expect(getInput().active).toBe(true);
    setActive(false); expect(getInput().active).toBe(false);
  });
  it('getInput returns a STABLE reference (transient read, no per-call alloc)', () => {
    expect(getInput()).toBe(getInput());
  });
  it('rejects unknown intent keys (typo guard)', () => {
    expect(() => setIntent('jmup', true)).toThrow();
  });
});
```
- [x] **Step 2 — Run, verify FAIL:** `npx vitest run src/input/inputState.test.js` → FAIL (module missing).
- [x] **Step 3 — Implement `src/input/inputState.js`:** a module-singleton `_state` object with keys `INTENT_KEYS = ['moveF','moveB','moveL','moveR','jump','dodge','attack','cast','interact']` + `active:false`. `getInput()` returns the same `_state` ref (transient, alloc-free). `setIntent(key,val)` validates `key ∈ INTENT_KEYS` (throw on unknown) and sets `_state[key]=!!val`. `setActive(v)`, `resetInput()`. Pure JS, no imports. Document: "READ via getInput() in useFrame (never via React state); WRITE from the input source (Components listeners now; touch later)."
- [x] **Step 4 — Run, verify PASS:** `npx vitest run src/input/inputState.test.js` → PASS.
- [x] **Step 5 — Commit:** `git add src/input/inputState.js src/input/inputState.test.js && git commit -m "feat(s2a-m1): input-intent module (the abstraction layer)"`

## Task 2 — Route the existing verbs through intents (writer + reads)

**Files:** Modify `Components.jsx` (listeners at `:299-330` write intents + `setActive` from pointer-lock; movement `:435`, dodge `:437-471`, mouse `:313-320` read `getInput()`), Create `tests/gates/input-abstraction-gates.test.js`.

Behavior must stay identical (pure refactor + the boundary). Keydown/up + mousedown listeners become the WRITER (`setIntent('dodge',true)` etc.; `setActive(!!document.pointerLockElement)` on the pointerlockchange event — the ONE place pointer-lock is read). The verb code reads `const input = getInput()` in the loop and branches on `input.active`/`input.dodge`/`input.attack`/`input.cast` instead of raw keys + `document.pointerLockElement`.

- [x] **Step 1 — Write the failing static gate** (`tests/gates/input-abstraction-gates.test.js`): assert (a) `Components.jsx` imports from `./input/inputState`; (b) `document.pointerLockElement` appears ONLY in the writer (≤1 occurrence — the `setActive` line) — i.e. it is no longer scattered across movement/mouse/dodge; (c) the verb reads use `getInput()`. Use `readFileSync` + regex counts (Crafty static-gate style; see `tests/gates/atmosphere-isolation-gates.test.js`).
- [x] **Step 2 — Run, verify FAIL** (`document.pointerLockElement` currently appears multiple times): `npx vitest run tests/gates/input-abstraction-gates.test.js` → FAIL.
- [x] **Step 3 — Implement the refactor in `Components.jsx`:** wire listeners→`setIntent`/`setActive`; replace `isLocked`/`document.pointerLockElement` verb-gates with `getInput().active`; replace `dodgeRequested.current` + raw key checks with `getInput().dodge`; mouse handler reads nothing new (it already dispatches melee/cast — keep, but gate on `getInput().active` not `document.pointerLockElement`). Preserve game-loop isolation: read `getInput()` transiently in `useFrame`, never via React state. Preserve all timings/behavior.
- [x] **Step 4 — Run gate + full unit + build:** `npx vitest run && npm run build` → PASS (gate green; 332+ tests; build clean).
- [x] **Step 5 — Manual-parity note + commit:** add a one-line comment in `inputState.js` that touch will add a 2nd writer. `git add -A && git commit -m "refactor(s2a-m1): route movement/dodge/attack/cast through input intents (touch-ready)"`

## Task 3 — Extract a pure cone test + let melee hit the boss (A2 gap)

**Files:** Modify `SimplifiedNPCSystem.jsx:959-976` (extract `isPointInCone`), Modify `Components.jsx:240-272` (add boss branch), Test: `src/combat/cone.test.js` (+ create `src/combat/cone.js` for the pure helper).

The cone math currently lives inline in `checkMobsInMeleeCone`. Extract a pure `isPointInCone(originVec, dirVec, pointVec, range, angleRad)` → boolean (2D angle dot-product + vertical cutoff, matching the current test), unit-test it, have `checkMobsInMeleeCone` call it (behavior identical), then reuse it in the melee path to test the boss position.

- [x] **Step 1 — Write the failing test** (`src/combat/cone.test.js`, node env): `isPointInCone` — point dead-ahead in range → true; behind → false; in-range but outside the 90° arc → false; beyond range → false; directly at edge angle → boundary case. (Use plain `{x,y,z}`-like vectors or THREE.Vector3; keep the helper THREE-free if cheap.)
- [x] **Step 2 — Run, verify FAIL.**
- [x] **Step 3 — Implement `src/combat/cone.js`** with the exact math currently at `SimplifiedNPCSystem.jsx:959-976` (preserve the 2D xz dot-product + vertical cutoff + range). Refactor `checkMobsInMeleeCone` to call it (no behavior change). Then in `Components.jsx triggerMeleeAttack` (after the existing mob-cone hit loop): read `store.isBossActive?.()` + `store.getBossPosition?.()`; if active + boss position is `isPointInCone(playerPos, lookDir, bossVec, range, angleRad)`, call `store.damageBoss(damage)` (mirror the spell boss path `EnhancedMagicSystem.jsx:495-513`) + the same crit shake/SFX the mob-hit path uses.
- [x] **Step 4 — Run unit + build:** `npx vitest run && npm run build` → PASS. (Behavioral check is covered by the cone unit test + the static reuse; in-engine boss-melee is verified manually by Kevin or a later capture.)
- [x] **Step 5 — Commit:** `git add -A && git commit -m "feat(s2a-m1): melee can hit the boss (pure cone helper + boss-cone branch)"`

## Task 4 — Combat-feel fix: boss-music key sync (A1)

**Files:** Modify `AdvancedGameFeatures.jsx:90` area (boss lifecycle) + ensure a store `bossActive` VALUE setter; Modify `useGameStore.jsx` if no `setBossActive` value-setter exists. Test: a store unit test.

`SoundManager.jsx:40` reads `useGameStore(s => s.bossActive)` (a value) but it's never written (only the local `useState` + the `isBossActive()` fn exist). Add/confirm a store `bossActive` boolean + `setBossActive(v)`; write `true` on boss spawn and `false` on despawn in `AdvancedGameFeatures` (alongside the existing local state).

- [x] **Step 1 — Write the failing test** (`tests/store/bossActive.test.js`): `useGameStore.getState().bossActive` defaults false; `setBossActive(true)` → `bossActive===true`; assert `isBossActive()` and `bossActive` agree after the setter (single source of truth). Verify FAIL if the value/setter is missing.
- [x] **Step 2 — Run, verify FAIL.**
- [x] **Step 3 — Implement:** add `bossActive:false` + `setBossActive:(v)=>set({bossActive:!!v})` to the store (if absent); make `isBossActive()` read the same `bossActive` value (single source). In `AdvancedGameFeatures.jsx`, call `useGameStore.getState().setBossActive(true)` when the boss spawns (`AdvancedGameFeatures.jsx:100` level≥5 trigger / line ~167 `isBossActive` publish) and `false` on death/despawn.
- [x] **Step 4 — Run unit + build → PASS.**
- [x] **Step 5 — Commit:** `git add -A && git commit -m "fix(s2a-m1): sync boss-active to the store key SoundManager reads (boss music now plays)"`

## Task 5 — Combat-feel fix: ribbon weapon-trail index (A1)

**Files:** Modify `Components.jsx:995`; Test: `src/combat/ribbonIndices.test.js` (+ extract `buildRibbonIndices(N)` to `src/combat/ribbonIndices.js`).

The loop at `Components.jsx:988-995` writes `indices[i*6+2]` twice and leaves `indices[i*6+5]` as 0. Extract the index builder to a pure fn, test it, fix the bug there, and call it from Components.

- [x] **Step 1 — Write the failing test** (`src/combat/ribbonIndices.test.js`): `buildRibbonIndices(N)` returns `6*(N-1)` indices; for each quad `i`, the two triangles are `[2i, 2i+1, 2i+2]` and `[2i+1, 2i+3, 2i+2]`; assert **no `indices[i*6+5] === 0` for i>0** (the bug) and assert the exact expected array for `N=3`.
- [x] **Step 2 — Run, verify FAIL** (current code yields `[i*6+5]=0`).
- [x] **Step 3 — Implement `src/combat/ribbonIndices.js`** with the corrected loop (`indices[i*6+5] = 2*i+3`), call it from `Components.jsx` replacing the inline loop.
- [x] **Step 4 — Run unit + build → PASS.**
- [x] **Step 5 — Commit:** `git add -A && git commit -m "fix(s2a-m1): ribbon weapon-trail index (i*6+5) — no more torn 2nd triangle"`

## Task 6 — Milestone wrap

- [x] Flip plan checkboxes; whole-branch review (spec-compliance + code-quality, Crafty convention).
- [x] `npm run test:unit` (all green, count up by the new tests) + `npm run build` clean + `npm run test:visual` (12/12 — combat verbs aren't in capture states, so no re-baseline expected; confirm).
- [x] Update the 4-piece docs (ACTIVE_PLAN resume → S2-A-M2; CHANGELOG entry; ARCHITECTURE input-layer note; ROADMAP). Merge to `main` (no Claude footer). pre-compact-flush.

---

## Self-review
- **Spec coverage:** M1 covers A8 (input abstraction, Task 1-2), A2's real gap (melee-hits-boss, Task 3), A1 (boss-music Task 4, ribbon Task 5). Dodge/swing already exist → wired through intents, not rebuilt (Task 2). A3/A4/A5/A6/A7/A9 = later milestones (out of M1 scope, by design).
- **No placeholders:** every task has files+anchors, concrete test code or exact test assertions, and the precise change (incl. the one-line ribbon + boss-music fixes).
- **Type/name consistency:** `getInput`/`setIntent`/`setActive`/`resetInput`/`INTENT_KEYS` (Task 1) are the names used in Task 2's gate; `isPointInCone` (Task 3) reused by boss branch; `buildRibbonIndices` (Task 5); `setBossActive`/`bossActive` (Task 4).
- **Game-loop isolation:** intents read transiently via `getInput()` in `useFrame`, never reactive — explicitly stated in Tasks 1-2 (CLAUDE.md hard law).
- **Risk:** Task 2 (the input refactor) is the highest-blast-radius — it touches the scattered pointer-lock gates; the static gate + full-suite + build guard it, and behavior must stay identical (pure refactor). Sequence Tasks strictly (shared file `Components.jsx`).
