# Perfect Dodge Implementation Plan (the parry role)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dodge pressed in the last 220 ms of a nearby mob's windup is a PERFECT dodge: that mob's strike never lands,
it is staggered for 1.4 s of world time and takes 1.5x damage meanwhile — the parry role the baseline found missing,
on the Shift/touch dodge players already have.

**Architecture:** One pure module, `game/perfectDodge.js`, owns the window, range, stagger and riposte numbers and the
target selection. Four seams consume it: the dodge start in `Components.jsx` (detect + stamp `staggerUntil`), the AI
worker (a staggered mob neither strikes nor moves — `staggerUntil` travels in the payload), `AIWorkerSystem` (drops an
attack already in flight from a mob that is now staggered), and `CombatSystem.damageMob` (the riposte multiplier).
Feedback reuses existing hooks (hitstop, sparks, the anvil-text float, a new procedural `parry` voice, a stagger pose).

**Tech Stack:** plain JS modules, R3F, vitest, Playwright (synthetic in-page keydown through the real listener).

**Spec:** `docs/superpowers/specs/2026-09-23-crafty-perfect-dodge-design.md`

## Global Constraints

- All stagger timing on the WORLD clock (`game/worldClock.worldNow`) — a hitstop holds it.
- No new dependency; no emoji in `src/`; no backtick inside a shader template literal; AST-safe edits.
- `keyMap` Aspects group stays exactly R/V/X/Z (tests/game/keyMap.test.js); any new UI string in en + zh-CN.
- Capture: no feedback under `isCaptureMode()` (the AI tick does not run under capture anyway).

## Review Focus

1. The dodge press lands AFTER the strike already fired in the worker (the reply is in flight): the attack must be
   dropped on arrival, not damage the player.
2. Two mobs winding up at once: both in range and window are staggered; one outside the window is not.
3. A press too EARLY (windup just started): an ordinary dodge — no stagger, no refund.
4. A staggered mob that is killed or leashes away: no stale stagger state breaks the next engagement.
5. The dodge is on cooldown: no perfect dodge (the press did nothing).

---

### Task 1: `game/perfectDodge.js` — the numbers and the selection, pure

**Files:** Create `frontend/src/game/perfectDodge.js`, `frontend/tests/gates/perfect-dodge-gates.test.js`.

**Interfaces — Produces:** `PERFECT_WINDOW_MS = 220`, `PERFECT_RANGE = 3.4`, `STAGGER_MS = 1400`, `RIPOSTE_MULT = 1.5`,
`perfectDodgeTargets(mobs, player, now) -> entity[]` (mobs with `0 < windupUntil - now <= PERFECT_WINDOW_MS`, horizontal
distance <= PERFECT_RANGE, |dy| <= VERTICAL_REACH, not passive, alive), `isStaggered(e, now) -> boolean`,
`riposteDamage(damage, e, now) -> number`.

- [x] Step 1: failing tests — in window/in range selected; 230 ms before the strike not; strike already due (<= 0) not;
  3.5 m away not; 3 m above not; passive/dead not; two mobs both selected; isStaggered boundary; riposte x1.5 only
  while staggered.
- [x] Step 2: FAIL. Step 3: implement. Step 4: PASS. (`06d3f190`)

### Task 2: the worker honours the stagger; in-flight strikes are dropped

**Files:** Modify `game/mobStateSync.js` (`staggerUntil` in `buildMobPayload`, main-thread-owned, not in
MOB_STATE_FIELDS), `workers/ai.worker.js` (while `now < staggerUntil`: no pendingAttack, windupUntil = 0, isMoving
false), `systems/AIWorkerSystem.jsx` (skip an attack whose entity `isStaggered`). Test in
`perfect-dodge-gates` through the REAL worker (the mob-charge-loop harness shape): a mob mid-windup given a
`staggerUntil` produces no strike across the whole stagger and resumes after; the in-flight filter as a pure
function `strikesToApply(attacks, entityById, now)`.

- [x] Steps: failing loop test → implement → pass → mutation (worker ignores staggerUntil; filter ignores stagger). (`06d3f190`)

### Task 3: the dodge detects it; the riposte lands; the feedback fires

**Files:** `Components.jsx` dodge start (~911-946): after the cooldown gate, `perfectDodgeTargets` over `mobsQuery`
with `worldNow()`; on any: stamp `staggerUntil`, refund the cooldown (`lastDodgeTime` back by the cooldown), heavy
hitstop, sparks at each target, `playSpatialSound('parry', …)`, a "PERFECT!" float (spawnAnvilText precedent).
`systems/CombatSystem.jsx` damageMob: `riposteDamage`. `audio/synthVoices.js`: a `parry` voice (a bright metallic
ting). `render/MobModel.jsx`: a stagger wobble while `isStaggered(entity, wnow)`. `game/keyMap.js`: the dodge row
teaches the timing; `game/onboardingTips.js`: one tip; i18n en + zh-CN for any new string.

- [x] Steps: structural gates for each wiring (weak, named), then Task 4 is the real proof. (`a8c35ad2`)

### Task 4: E2E through the real listener

**Files:** `tests/e2e/perfect-dodge.spec.js`; DEV hook `readMobs` gains `windupUntil` and `staggerUntil`.
In-page: spawn a zombie beside the player, sample per frame until `windupUntil - worldNow()` is inside the window,
dispatch `keydown`/`keyup` ShiftLeft on window → the zombie is staggered, the player's health unchanged across the
strike time; a hit on it deals 1.5x (damageMob with a known amount). Control: the same with the press 300 ms early →
no stagger. Mutation by hand: the window check removed → the early press staggers (control red).

**Done** (see the commit after `a8c35ad2`). As built, the press is made under a world FREEZE (a hitstop holds
`windupUntil - worldNow()` still across the frame that consumes it — a loaded runner renders slower than the
220 ms window), and the control also asserts the unstaggered strike DOES land. Deviation from the plan: the
worker's stagger is judged by the zombie NOT WINDING UP again, not by the player's health — the in-flight filter
drops a staggered mob's strike too, so a health-based check could not see the worker (K4 survived that draft).

### Task 5: SEE it, commit, review

- [ ] Capture A/B is not the oracle here (no mob strikes under capture); the e2e is. Open one frame of the stagger
  pose from a local probe screenshot for the pose only.
- [ ] Commit per task with call-site counts; `/code-review high` over the range.
