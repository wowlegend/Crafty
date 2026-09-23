# Heavy Melee Implementation Plan (hold to charge)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep holding the melee button after a tap and a heavy swing winds up; release it charged and it hits for 2x,
staggers the mob (the perfect dodge's stagger, so the 1.5x riposte follows) and shoves it harder — the heavy attack
three genre leaders shipped this year, on the buttons players already use.

**Architecture:** A pure state machine `game/heavyAttack.js` (module state, read transiently — Game-Loop Isolation).
`Components.jsx` presses it where melee already fires (LMB attack verb, T), releases it on mouseup/keyup, cancels it on
dodge/death/input loss, and passes `{ heavy: true }` to `triggerMeleeAttack`, which scales damage, stamps the stagger
and scales the shove. The walk speed reads `heavyWalkMult(now)`. `render/playerRender.jsx` pulls the FPV hand back by
`chargeLevel(now)`. A `heavyReady` tick voice marks full charge.

**Tech Stack:** plain JS, R3F, vitest, Playwright (real `page.mouse.down/up` through the real listener).

**Spec:** `docs/superpowers/specs/2026-09-23-crafty-heavy-melee-design.md`

## Global Constraints

- The tap is unchanged: fired on press, today's damage and cooldown. No latency is added to any tap.
- All stagger timing on the WORLD clock (`worldNow`); charge timing on real time (`performance.now`) — the player's
  own hold is real time, and a hitstop must not stretch a charge.
- No new dependency; zero emoji in `src/`; AST-safe edits; keyMap Aspects group unchanged; any UI string in en + zh-CN.
- The heavy never fires from mining (LMB on a block) or the held-block hurl (voidhand).
- `index` chunk: 674.2 / 742.2 KB after the lazy panels — room exists, the ceiling is not raised.

## Review Focus

1. T held: OS key-repeat keydowns must not re-press (restart) the charge.
2. A release after a dodge/death/panel-open (input lost) fires nothing.
3. A heavy on the boss: 2x damage, no stagger (v1), no crash.
4. The tap still swings exactly as before when the button is released before HEAVY_HOLD_MS.
5. A beast form: the heavy is the human sword; in a form the hold does nothing extra (v1).

---

### Task 1: `game/heavyAttack.js` — the state machine, pure

**Files:** Create `frontend/src/game/heavyAttack.js`, `frontend/tests/gates/heavy-melee-gates.test.js`.

**Produces:** `HEAVY_HOLD_MS = 280`, `HEAVY_CHARGE_MS = 420`, `HEAVY_MULT = 2`, `HEAVY_STAGGER_MS = 800`,
`HEAVY_SHOVE_MULT = 2.5`, `HEAVY_WALK_MULT = 0.55`; `pressHeavy(now)`, `releaseHeavy(now) -> boolean` (true = throw the
heavy), `cancelHeavy()`, `heavyChargeLevel(now)` in [0,1] (0 until HEAVY_HOLD_MS, 1 at HOLD+CHARGE), `isHeavyReady(now)`,
`heavyWalkMult(now)` (1 unless charging).

- [x] Step 1: failing tests — tap (release at 150 ms) -> false, level 0; release at 600 ms (charging, not ready) ->
  false; release at 750 ms -> true; cancel then release -> false; a second press while held does not restart;
  walk mult 1 before HOLD, 0.55 while charging, 1 after release.
- [x] Step 2: implement; PASS; mutation (threshold ignored; release-before-ready throws; cancel ignored; re-press
  restarts).

### Task 2: the swing and the wiring

**Files:** `frontend/src/Components.jsx` (press/release/cancel wiring; `triggerMeleeAttack({ heavy })`: damage x
HEAVY_MULT, `staggerUntil = worldNow() + HEAVY_STAGGER_MS` on non-boss mobs hit, knockback x HEAVY_SHOVE_MULT; walk
speed x `heavyWalkMult`), `frontend/src/store` not touched (module state).

- [ ] Step 1: structural gates (weak, named) for each wiring line; the e2e (Task 4) is the proof.
  NOT DONE as written: a source-reading gate under `tests/gates/` joins the frozen source-grep ledger (may fall, never
  rise). The e2e kills each wiring mutation instead (J1-J4, Task 4).
- [x] Step 2: implement: press where `triggerMeleeAttack()` is called for the LMB attack verb (not voidhandHeld) and
  for T (`!e.repeat`); `mouseup` button 0 and T keyup -> `releaseHeavy` -> `triggerMeleeAttack({ heavy: true })`;
  `cancelHeavy` at the dodge start, on death, and on the input-inactive edge.

### Task 3: feel and legibility

**Files:** `frontend/src/render/playerRender.jsx` (pull-back by `heavyChargeLevel`), `frontend/src/audio/synthVoices.js`
(`heavyReady` tick, played once when ready), `frontend/src/game/keyMap.js` (LMB / T rows mention the hold),
`frontend/src/game/onboardingTips.js` (the recall tip list), `frontend/src/i18n/strings.js` if a string is added.

- [ ] Steps: implement; open one frame of the pull-back from a probe screenshot (the pose only).
  Implemented (pull-back + full-charge shake, `heavyReady` tick, keyMap rows). NOT DONE: the frame was not opened, and
  no onboarding tip was added (the tip list's test pins three; the controls overlay names the hold).

### Task 4: E2E through the real mouse

**Files:** `frontend/tests/e2e/heavy-melee.spec.js`. Spawn a zombie in front of the camera (the perfect-dodge spec's
staging: spawn protection waited out, other hostiles cleared); a real `page.mouse.down()`, wait 800 ms real time,
`page.mouse.up()` -> the zombie's health drop >= 1.8x a tap's (the tap measured first in the same spec, the control),
`staggerUntil > worldNow()`; the tap sets no stagger. Every failure message carries the zombie's distance, health and
stagger, and whether the controller saw the press.

- [x] Steps: write; run; hand mutations (HEAVY_MULT 1 -> the ratio fails; the stagger line removed -> red).
  As built: a moss brute (220 HP) not a zombie; a warm-up click; the CONTROL is a HALF-charged hold, not a tap (a tap
  releases inside the 300 ms light cooldown, so the cooldown would pass it), held in-page on the game's clock (a real
  490 ms hold read 1106 ms under load). J1-J4 RED; the full hold is the real mouse.

### Task 5: review

- [ ] `/code-review high` over the milestone's range with the lazy-panels and R7.4-R7.8 commits.
