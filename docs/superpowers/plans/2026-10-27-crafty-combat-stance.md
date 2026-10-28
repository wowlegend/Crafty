# Close-Quarters Combat (stance, windup chevrons, light string) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a fight is joined you can no longer outwalk it. Telegraphed attacks from outside the view still show
on screen. The light attack becomes a three-step string that ends in a finisher. All of it works on iPad.

**Architecture:** Three new pure modules carry the numbers and decisions, and one existing module gains a
function. None of them touches THREE, React or the store:
- `game/combatStance.js`: the caps derived from the roster, the radial clamp, and the engage/calm state machine.
- `game/windupChevrons.js`: which windups are off screen, and where each chevron sits.
- `game/meleeString.js`: the string's timing, buffer and dodge-cancel.
- `game/mobMovement.js`: gains the chase multiplier, so the worker and the stance read ONE source.

The imperative Player controller (`src/Components.jsx`, NOT split) calls them through transient reads, once per frame
or once per press. One DOM layer, `ui/WindupChevrons.jsx`, draws the chevrons from the HUD ticker using refs and
writes only when something changed. No React state is set per frame.

**Tech Stack:** React 19, R3F 9.5, three 0.172, miniplex ECS, zustand 5, vitest 4, Playwright 1.64.

**Spec:** `docs/superpowers/plans/2026-10-27-crafty-masterpiece.md` §Phase 1 "Close-quarters combat". Its design
inputs are `docs/superpowers/masterpiece-2026-10/roadmap-2026-10-27.json` move 5 and
`docs/superpowers/masterpiece-2026-10/refute-2026-10-27.md` finding F1. Where they differ, the umbrella plan and F1
govern.

**Worktree / branch:** `.claude/worktrees/combat-stance` on `feat/combat-stance`, cut from `main` AFTER Phase 0c
(`feat/touch-hold`) and Phase 0f/0g (`feat/steady-cool`) have merged (Task 0).

---

## Why the numbers are what they are (the F1 derivation, verified against live code)

**Travel today.** The player moves at `BASE_MOVE_SPEED = 14` m/s in every direction (`frontend/src/game/locomotion.js:3`,
Kevin 2026-06-18: "travel felt slow"). The move vector is camera-relative and normalised to that speed
(`locomotion.js:15-29`). The controller builds it at `Components.jsx:1193`, then ramps it at 60 u/s² up and 90 u/s²
down (`game/gameFeel.js:7-8`).

**Chase today.** A mob's chase speed is `speed × (isAggro ? (spider ? 2.0 : 1.5) : 1.0) × (charging ? 3.0 : 1.0)`
(`frontend/src/workers/ai.worker.js:327`; `SHOULDER_CHARGE_SPEED = 3.0` at `game/mobMovement.js:48`). The base speeds
are at `game/mobTypes.js:9-20`. The approach style comes from `game/mobArchetypes.js:53-57`.

| hostile (display name) | base | chase mult | approach | **pursuit speed** (what closes on a still player) |
|---|---|---|---|---|
| zombie (Husk) | 2.0 | 1.5 | beeline | **3.0** (the slowest pursuer) |
| emberhusk | 2.3 | 1.5 | beeline | 3.45 |
| duskhound | 3.2 | 1.5 | flank (`mobMovement.js`, arcs ≤ 6 m wide) | 4.8 (its radial closing is a little lower while it arcs) |
| moss_brute | 1.2 | 1.5, then ×3.0 in the charge | shoulder: brace 450 ms, charge, winded 1.6 s | **5.4** while charging; it walks at 1.8 |
| skitterling | 3.8 | 1.5 | beeline | 5.7 |
| spider | 3.0 | 2.0 | beeline, plus a leap within 6 m | **6.0** (the fastest) |
| skeleton (Bonepicker) | 2.5 | 1.5 | **kites**: it retreats inside 8 m, shoots between 8 and 12 m, and closes in beyond 12 m (`ai.worker.js:198-218`) | not a pursuer (3.75 when closing in past 12 m); never engages the stance |

The test that makes "you cannot outwalk a fight" true is about the radial component of the player's velocity, not a
camera-relative backpedal. Assume the mob steers straight at the player's position. The gap then changes at
`(player velocity · away-unit) − chase speed`, and the tangential part does not enter at all. A camera-relative
backpedal cap is not enough: the player turns around, presses W, and walks away at the forward speed. So the stance
clamps the **away-from-threat** component of the move velocity, whatever key produced it. It also caps the
tangential (strafe) and toward (advance) components.

- **retreat cap = slowest pursuit − MIN_CLOSING_RATE = 3.0 − 1.0 = 2.0 m/s.** A husk closes at least 1 m/s on any
  retreat, and a spider closes 4 m/s. 2.0 is above the `RETREAT_FLOOR` of 1.5 m/s, so the derivation passes. If a
  slower pursuer is added later, the floor test fails rather than quietly turning the backpedal into a crawl.
- **strafe cap = advance cap = fastest pursuit + STRAFE_MARGIN = 6.0 + 0.5 = 6.5 m/s.** This is the footwork pace
  of a fight: it out-circles any chaser's turn but cannot outrun one, because circling adds nothing to the radial
  escape.
- **The walking moss brute (1.8 m/s) can be backpedalled away from, on purpose.** Its threat is the 5.4 m/s charge
  it commits to inside 14 m (`mobMovement.js:39`), and its winded 1.6 s after a charge is the punish window
  (`mobMovement.js:45`). The table records this exception by name, and a test pins it.
- **The skeleton is exempt as a non-pursuer, and the stance does not engage on it.** It retreats inside 8 m, stands
  and shoots between 8 and 12 m, and closes in at 2.5 × 1.5 = 3.75 m/s beyond 12 m (`ai.worker.js:198-211`,
  `ARCHERY_RANGE = 12` at `:59`). Counted as a threat, it would pin a player walking away at the edge of its range:
  the walk is capped at 2.0, the archer closes past 12 m, and the 2 s calm never elapses. So `stanceStep` skips every
  type in `NON_PURSUERS` (Task 4), and walking away from an archer stays the answer to an archer. Task 2's
  real-worker test re-proves the kite, so the exemption fails the day skeletons start chasing.
- **A mob that cannot reach you does not hold the stance.** Aggro is distance-only (`ai.worker.js:128`, 20 m by
  default and 28 m for the duskhound, `mobArchetypes.js:40,57`) and spreads by pack alert within 12 m (`:67-82`),
  while a non-climber cannot step up more than `STEP_UP = 1.25` blocks (`localPath.js:39`). So engagement uses the
  mob's own vertical reach (`archetypeFor(type).verticalReach`: 2.5 m, 3.2 m for the brute; `LEAP_RANGE` 6 m for a
  climber), the same reach the worker strikes with, rather than a flat 4 m. A mob outside its melee reach that has
  made less than `STALL_PROGRESS_M` (0.5 m) of its OWN progress toward the player in `STALL_MS` (1500 ms) also stops
  qualifying; the worker already parks a wall-blocked mob (`ai.worker.js:341`). A husk stranded under a ledge
  therefore releases the stance about `STALL_MS + CALM_MS` = 3.5 s after it stops gaining, instead of never. This
  answers refute F1:13 (night play "nearly always in combat"). Task 12 measures the fraction of night travel time
  with w > 0 and states it in DECISIONS.
- **The dodge is the escape.** Its burst runs 28 → 10 m/s over 0.4 s, is form-invariant, and recharges in 0.8 s
  (`game/dodge.js:9-10`, `Components.jsx:137-145`). The stance does not clamp it. Chained dodges escape at about
  10 m/s average, and dodging does not attack, so fleeing becomes a deliberate act rather than the default.
- **Out of combat the stance changes nothing.** At stance weight 0 the clamp is the identity, bit for bit, and
  Task 5 case 3 checks that at the controller: the frame's planar target equals `moveVector`'s output exactly. Travel
  stays 14 m/s in every direction, and the FOV formula (`Components.jsx:1281-1285`) still gives about 88.5° at full
  stride. The one out-of-combat movement change in this milestone is Task 9's swing slow (0.6 for 120 ms after a
  light swing, 0.4 for 220 ms after a finisher). It applies with or without a fight, as the heavy's charge slow
  does today, and it is recorded as a decision in Task 12.
- **FOV.** No FOV kick is added, because the refute found one redundant (F1). The existing formula does narrow in a
  fight, though, because it reads the achieved speed (`Components.jsx:1283`): engaging mid-run takes the target from
  88.5° to about 77.7° (hypot(2.0, 6.5) ≈ 6.8 m/s). That combat zoom is accepted as intended (the view tightens as
  the fight takes your feet) and recorded in DECISIONS. If Task 12's by-eye check reads it as a jolt, the fallback is
  to feed the FOV term the pre-clamp speed while w > 0.
- **Beast forms and walk slows keep their pace.** The caps scale with the pace multipliers instead of erasing them.
  The strafe and advance caps are multiplied by the form's `moveMult` (0.6–1.4, `game/beasts.js:29-32`) and by the
  walk multipliers (the heavy charge's 0.55, `heavyAttack.js:23`, and Task 9's swing slows). The retreat cap is
  multiplied by the walk multipliers only. So a comet strafes at 9.1, a golem at 3.9, and a human charging a heavy
  at 3.6, while every form retreats at 2.0 (1.1 while charging): no form outwalks a fight, matching the
  form-invariant dodge (`Components.jsx:1175-1178`). Absolute caps would have flattened every one of them to 6.5,
  which the first draft did.

**Slows are earned escapes, not holes.** A spell freeze or a zone slow lowers a mob's payload speed
(`systems/AIWorkerSystem.jsx:219`). A slowed husk can therefore be backpedalled away from, and that is the reward for
the spell. The derivation uses unslowed pursuit.

## Global Constraints

- **Two-level repo.** ROOT is `<repo>` (plans and docs); APP is `<repo>/frontend`, where
  npm and tests run. Use absolute paths in every delegation.
- **Game-loop isolation.** No `useState` or zustand subscription is written or read per frame. The controller reads
  `getStance()`, `readString()` and `mobsQuery.entities` transiently. The chevron layer writes DOM through refs from
  the HUD ticker.
- **`src/Components.jsx` is NOT split** (decision of record, `.agent/AGENTS.md`). It gains only call sites. Every
  number and decision lives in the pure modules.
- **`BASE_MOVE_SPEED` stays 14.** At stance weight 0 the movement target equals today's exactly (Task 3's property
  for the function, Task 5 case 3 for the controller).
- **No roster or reach change in this milestone.** Mob speeds, `meleeRange`, the 4.5 m / 90° player cone and
  `WINDUP_MS = 380` stay as they are. The roadmap's other levers (cone trim to 3.2 m, hounds and skitterlings at
  6 m/s, a per-archetype `windupMs`, windup voices) are out of scope. They change balance for an 8-year-old player
  (roadmap threat P5) and need their own measurement.
- **Capture mode is untouched.** The Player `useFrame` early-returns under capture, so the stance and the string
  never run there, and `WindupChevrons` returns `null` when `isCaptureMode()`. Zero change to the 31 baselines, and
  no `Baseline-Review:` is needed.
- **Gates.** Every new check file carries a file-local `Mutation-Proof:` receipt (`scripts/ci/killability-ledger.mjs`),
  and its commit carries the `Mutation-Proof:` trailer (`scripts/ci/mutation-proof-trailer.mjs`). Add no source-grep
  gates: the gate-shape ratchet may fall but never rise, so wiring is proven by e2e. Every e2e failure that is a
  precondition says `SETUP:` (`scripts/dev/mutate-e2e.sh` scores those COULD NOT CHECK). Every e2e batch includes an
  identity mutant.
- **e2e execution.** The browser and the e2e port are the command session's. The authoring lane writes each spec and
  its mutant list, and verdicts come from the command session's `mutate-e2e.sh` batch or from CI on the exact commit.
  Until a verdict is observed, the spec header says `Mutation-Proof: OWED`.
- **Bundle.** The `index` chunk ceiling is 760,000 B (`scripts/ci/bundle-budget.mjs:35`), and it is never raised. The
  last build in `frontend/build/assets` (2026-10-27 05:22) was 696,924 B. This milestone's share is **+9,000 B
  raw**, its own estimate's upper end, measured before and after in Task 12. The Phase 1-3 lane allowances as
  written add up to more than the 63,076 B of headroom (combat, light-colour, coast, first-minute, material, sound,
  encounters and relight alone come to about 67,600 B), so a lane that is green against its own baseline can still
  breach the ceiling once the others land. This lane's number is its share of a programme byte ledger; keeping that
  ledger, with shares that sum to within the headroom, is the command session's (Review amendments, finding 16).
- **GPU.** Zero added cost: no lights, no shaders, no draw calls, no render targets. The chevrons are 4 DOM nodes
  that animate `transform` and `opacity` only, with no `filter` or `box-shadow`.
- **UI law.** No emoji in `src/`. Chevrons carry no text (`aria-hidden="true"`). Colours come from `--ui-*` tokens
  (`src/theme/cssVars.js`).
- **Commits.** No "Generated with" or "Co-Authored-By" footer. Fix-ups are new commits, never `--amend`.
- **Edits.** AST-safe Edit only on `.js`/`.jsx`, never `sed`.
- **Review.** A fresh headless `/code-review xhigh` per change range. One `adversarial-reviewer-kz` at effort xhigh
  (never max) on the controller seam (Tasks 5 and 9). Workflow stages use `model: 'claude-opus-5-5'` and
  `effort: 'xhigh'`.

## Review Focus

The five inputs most likely to bite a player that no happy-path test exercises. Each has its pinning test in the
owning task.

1. **Two engaged mobs at nearly equal range on opposite sides.** The nearest one would flip every frame and the
   retreat axis would jitter. Expected: the current threat holds until another is at least `THREAT_SWITCH_M` (1.0 m)
   nearer. *(Task 4: `keeps its threat until another is a metre nearer`.)*
2. **The player standing on a mob's column** (distance ≈ 0, no direction). Expected: no `NaN`, and the total speed
   is capped at the strafe cap. *(Task 3: `a threat with no direction caps the total speed and makes no NaN`.)*
3. **A mob far above or below, or one that cannot reach you** (a cliff, a pillar, a cave under the path, a husk
   stranded under a ledge). Expected: a husk 40 blocks below never slows travel; engagement needs |dy| ≤ the mob's
   own vertical reach (`engageDyM(type)`), and a mob that stops gaining releases the stance after `STALL_MS`.
   *(Task 4: `ignores a hostile beyond its own vertical reach` and `a stranded mob stops qualifying after STALL_MS`.)*
4. **A steep camera pitch during a fight** (looking up while building). A windup that is horizontally ahead is then
   still off screen. Expected: the on-screen test uses the camera's projection, so it gets a chevron. *(Task 6:
   `a windup ahead but above the frustum is off screen`.)*
5. **Input dies mid-string** (pointer lock lost, a panel opened, death, a beast form entered) with a press buffered.
   Expected: nothing fires when play resumes. *(Task 8: `endString drops a buffered press`; Task 9 wires `endString`
   beside `cancelHeavy` at the death site `Components.jsx:867` and the lost-input/form site `:952`.)*

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `frontend/src/game/mobMovement.js` | modify | + `chaseSpeedMult(type, isAggro)`, the ONE chase multiplier |
| `frontend/src/workers/ai.worker.js` | modify `:327` | reads `chaseSpeedMult` instead of the inline literals |
| `frontend/src/game/combatStance.js` | create | caps derivation, radial clamp, engage/reach/stall/calm state, live `getStance()`, the DEV move-target note |
| `frontend/src/game/combatStance.test.js` | create | property tests (pure) |
| `frontend/tests/gates/stance-pursuit-gates.test.js` | create | the real worker's measured closing speed per hostile against the derived caps |
| `frontend/src/game/windupChevrons.js` | create | off-screen windup selection plus inset-rectangle placement |
| `frontend/src/game/windupChevrons.test.js` | create | pure tests |
| `frontend/src/ui/WindupChevrons.jsx` | create | the DOM layer: a 4-node pool, a HUD-ticker subscriber, write-on-change |
| `frontend/tests/gates/windup-chevrons-gates.test.jsx` | create | jsdom: a tick writes the right node, and no re-render per tick |
| `frontend/src/game/meleeString.js` | create | the string state machine, buffer, dodge-cancel, walk mult, swing shapes, hand sweep |
| `frontend/src/game/meleeString.test.js` | create | pure tests |
| `frontend/src/Components.jsx` | modify | call sites only (Tasks 5 and 9) |
| `frontend/src/render/playerRender.jsx` | modify `:343-360` | the hand reads `slashSweep(step)` |
| `frontend/src/HUD.jsx` | modify `:645`, `:501` | mounts `<WindupChevrons />` beside `<DamageDirection />`; `data-testid="hud-compass"` on the compass frame |
| `frontend/src/App.jsx` | modify `:329-362` | DEV hooks `readStance`, `readMoveTarget`, `readString` |
| `frontend/tests/e2e/combat-stance.spec.js` | create | real held keys: the stance engages; a husk catches a held S, a held W with it behind, and a held D; the target is the identity at w = 0 |
| `frontend/tests/e2e/windup-chevron.spec.js` | create | a chevron for a windup behind the player, none for one ahead |
| `frontend/tests/e2e/melee-string.spec.js` | create | real clicks: the third hit is a finisher; window, buffer, dodge-cancel |
| `frontend/tests/e2e/combat-touch.spec.js` | create | emulated iPad: joystick backpedal caught, three-tap finisher, chevrons clear of every touch control |

**Shared-file seams with sibling Phase 1 lanes:** `HUD.jsx` (one line), `App.jsx` (two hooks) and `playerRender.jsx`
(the swing branch). Rebase on whichever lane lands first. The light-colour lane owns lights and colour, not these
lines.

---

### Task 0: Preconditions (no code)

- [x] **Step 1: Phase 0c and 0f/0g are on main**

Run: `cd <repo> && git grep -n "pressPrimary" main -- frontend/src/Components.jsx && git grep -n "export function subscribeHudTick" main -- frontend/src/ui/hudTicker.js`
Expected: both print a match. If `pressPrimary` is missing, Task 11's touch finisher cannot run: build Tasks 1-10
and hold Task 11. If `hudTicker.js` is missing, hold Task 7 only. A held task holds the MERGE too (Task 12 Step 8):
this lane never lands the stance without its chevrons, or without its touch proof.

> **Done 2026-10-27, with a deviation.** Neither had reached `main` (cut at `a8ce0dd1`), so the lane MERGED the two
> branches instead: `feat/steady-cool` (a fast-forward to `ed8e51d7`, carrying `hudTicker.js`), then
> `feat/touch-hold` (`f78644b9`, carrying `pressPrimary`; the one conflict was the generated MEASURED block in
> `.agent/AGENTS.md`, regenerated with `measure.mjs --write` and `gate-table.mjs --write`). Both greps match on the
> branch: `Components.jsx:550,560,584` and `hudTicker.js:31`. This lane therefore cannot land before both of those
> branches land on `main`.

- [x] **Step 2: Cut the worktree and record the bundle baseline**

Run: `cd <repo> && orca worktree create combat-stance --branch feat/combat-stance` (or `git worktree add .claude/worktrees/combat-stance -b feat/combat-stance main`)
Then: `cd <repo>/.claude/worktrees/combat-stance/frontend && npm ci && npm run build && ls -l build/assets/index-*.js`
Expected: one `index-*.js`. Write its byte count into this plan's Task 12 step 3 as `BASELINE_INDEX_BYTES`.

---

### Task 1: One reader for the chase multiplier

The stance derives from the chase multiplier. Today it is a literal inside the worker (`ai.worker.js:327`), so a
derivation in another file would be a second copy that drifts.

**Files:**
- Modify: `frontend/src/game/mobMovement.js` (append an export)
- Modify: `frontend/src/workers/ai.worker.js:25,327`
- Create: `frontend/src/game/mobMovement.test.js`, which does not exist yet (`tests/gates/mob-movement-gates.test.js`
  covers `movementGoal` and is left alone), and `frontend/tests/gates/stance-pursuit-gates.test.js`

**Interfaces:**
- Produces: `chaseSpeedMult(type: string, isAggro: boolean) -> number`. It returns 1.0 un-aggro'd, 2.0 for an
  aggro'd `'spider'` and 1.5 for any other aggro'd type. The charge multiplier stays `SHOULDER_CHARGE_SPEED`, applied
  by the worker as today.

- [x] **Step 1: Write the failing tests**

```js
// frontend/src/game/mobMovement.test.js
import { chaseSpeedMult } from './mobMovement.js';
it('chaseSpeedMult is the worker\'s chase multiplier: 1.0 calm, 2.0 aggro spider, 1.5 any other aggro', () => {
  expect(chaseSpeedMult('zombie', false)).toBe(1.0);
  expect(chaseSpeedMult('spider', false)).toBe(1.0);
  expect(chaseSpeedMult('spider', true)).toBe(2.0);
  for (const t of ['zombie', 'skeleton', 'skitterling', 'duskhound', 'moss_brute', 'emberhusk']) expect(chaseSpeedMult(t, true)).toBe(1.5);
});
```

```js
// frontend/tests/gates/stance-pursuit-gates.test.js — the worker harness of tests/gates/perfect-dodge-gates.test.js:104-108
// (globalThis.self stub, then import '../../src/workers/ai.worker.js'), heightGrid null, player still at the origin.
// stepOnce(type, x): one TICK, delta 0.1, the mob aggro'd at (x, 50.5, 0); returns metres moved toward the player.
// The expected values are LITERALS on purpose. Computed from chaseSpeedMult, they would move with a mutant of it,
// and K1 below could never go RED (review finding 7).
it('the real worker steps an aggro\'d mob by speed x the chase multiplier x delta (the multiplier is READ, not copied)', () => {
  expect(stepOnce('zombie', 10)).toBeCloseTo(0.3, 6);  // 2.0 x 1.5 x 0.1
  expect(stepOnce('spider', 10)).toBeCloseTo(0.6, 6);  // 3.0 x 2.0 x 0.1
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `cd <repo>/frontend && npx vitest run src/game/mobMovement.test.js tests/gates/stance-pursuit-gates.test.js`
Expected: FAIL, "chaseSpeedMult is not a function / not exported".

- [x] **Step 3: Implement `chaseSpeedMult` in `mobMovement.js`, and in `ai.worker.js:327` replace the literal ternary with `chaseSpeedMult(type, isAggro)`** (add it to the existing import at `:25`). The behaviour is byte-identical.

- [x] **Step 4: Run them, then the whole unit suite**

Run: `npx vitest run src/game/mobMovement.test.js tests/gates/stance-pursuit-gates.test.js && npm run test:unit`
Expected: PASS, and the suite total equals the pre-task total plus 2.

- [x] **Step 5: Mutation receipt.** Run `sh scripts/dev/mutate.sh src/game/mobMovement.js tests/gates/stance-pursuit-gates.test.js 1 K1 "? 2.0 :" "? 1.5 :"`.
Expected: RED. The worker then steps the spider 3.0 × 1.5 × 0.1 = 0.45 against the literal 0.6, which proves the
worker reads the shared function: a worker that still held its own `2.0` literal would step 0.6 and the mutant would
SURVIVE. Put the observed line into the gate file's header as `Mutation-Proof:`.

- [x] **Step 6: Commit**

```bash
git add frontend/src/game/mobMovement.js frontend/src/game/mobMovement.test.js frontend/src/workers/ai.worker.js frontend/tests/gates/stance-pursuit-gates.test.js
git commit -m "refactor(ai): one chase multiplier, read by the worker and (next) by the combat stance" -m "Mutation-Proof: K1 spider 2.0->1.5 in chaseSpeedMult -> stance-pursuit-gates RED, 0.45 vs the literal 0.6 (the worker reads it)"
```

---

### Task 2: The stance caps, derived from the roster

**Files:**
- Create: `frontend/src/game/combatStance.js`, `frontend/src/game/combatStance.test.js`
- Modify: `frontend/tests/gates/stance-pursuit-gates.test.js`

**Interfaces:**
- Consumes: `MOB_TYPES` (`game/mobTypes.js`), `archetypeFor` (`game/mobArchetypes.js`), `chaseSpeedMult` and
  `SHOULDER_CHARGE_SPEED` (`game/mobMovement.js`).
- Produces:
  - `MIN_CLOSING_RATE = 1.0`, `RETREAT_FLOOR = 1.5`, `STRAFE_MARGIN = 0.5`
  - `NON_PURSUERS = Object.freeze({ skeleton: 'kites: retreats inside 8 m, shoots from 8-12 m, closes beyond 12 m (ai.worker.js:198-211)' })`.
    Task 4's `stanceStep` skips these types too, so the exemption covers engagement and not only the derivation.
  - `pursuitSpeed(type, roster = MOB_TYPES) -> number`, meaning `roster[type].speed × chaseSpeedMult(type, true) × (archetypeFor(type).movement === 'shoulder' ? SHOULDER_CHARGE_SPEED : 1)`
  - `pursuers(roster = MOB_TYPES) -> string[]`: hostile (`!passive`) and not in `NON_PURSUERS`
  - `deriveStanceCaps(roster = MOB_TYPES) -> { retreat, strafe, advance, slowest, fastest }`. It throws if
    `retreat < RETREAT_FLOOR`.
  - `STANCE_CAPS`, frozen: `deriveStanceCaps()` evaluated once at load.

- [x] **Step 1: Write the failing property tests**

```js
// combatStance.test.js
it('derives retreat 2.0 / strafe 6.5 / advance 6.5 from today\'s roster (husk 3.0 slowest, spider 6.0 fastest)', () => {
  expect(STANCE_CAPS).toMatchObject({ retreat: 2.0, strafe: 6.5, advance: 6.5, slowest: 'zombie', fastest: 'spider' });
});
it('for EVERY pursuer in the roster, the retreat cap is at least MIN_CLOSING_RATE below its pursuit speed', () => {
  const ps = pursuers();
  expect(ps.length, 'empty denominator').toBe(6); // zombie spider skitterling duskhound moss_brute emberhusk
  for (const t of ps) expect(pursuitSpeed(t) - STANCE_CAPS.retreat, t).toBeGreaterThanOrEqual(MIN_CLOSING_RATE - 1e-9);
});
it('every hostile is either a pursuer or a NAMED non-pursuer; passives are neither', () => {
  for (const [t, d] of Object.entries(MOB_TYPES)) expect(d.passive ? false : (pursuers().includes(t) || t in NON_PURSUERS), t).toBe(!d.passive);
});
it('the brute pursues at its charge (5.4), and walks slower than the retreat cap — a named, intended exception', () => {
  expect(pursuitSpeed('moss_brute')).toBeCloseTo(5.4, 9);
  expect(MOB_TYPES.moss_brute.speed * chaseSpeedMult('moss_brute', true)).toBeLessThan(STANCE_CAPS.retreat);
});
it('a slower pursuer added later fails the floor instead of making the backpedal a crawl', () => {
  expect(() => deriveStanceCaps({ ...MOB_TYPES, slug: { speed: 1.2, passive: false } })).toThrow(/RETREAT_FLOOR/);
});
it('out of combat travel is untouched: BASE_MOVE_SPEED is still 14', () => expect(BASE_MOVE_SPEED).toBe(14));
```

```js
// stance-pursuit-gates.test.js — the derivation checked against what the REAL worker does, not the formula.
// closingOver(type, fromX, ticks): ticks at delta 0.1 from (fromX,50.5,0); returns mean metres/second of radial
// closing over the ticks in which it moved (the brute's brace ticks have isMoving false and are excluded). 10 ticks
// from 10 m, so even the spider (6 m in 1 s) is still closing at the last tick and no arrival tick dilutes the mean.
// It THROWS 'empty denominator' when no tick moved: a mob that never moved has no closing speed, and a NaN mean
// must not reach an assertion as if it were a measurement.
it('every pursuer\'s MEASURED closing speed exceeds the retreat cap by at least MIN_CLOSING_RATE', () => {
  for (const t of pursuers()) expect(closingOver(t, 10, 10) - STANCE_CAPS.retreat, t).toBeGreaterThanOrEqual(MIN_CLOSING_RATE - 0.05);
});
it('the skeleton exemption holds: inside 8 m it retreats, so it never closes', () => {
  expect(closingOver('skeleton', 5, 10)).toBeLessThan(0);
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/game/combatStance.test.js tests/gates/stance-pursuit-gates.test.js`
Expected: FAIL, "Cannot find module './combatStance.js'".

- [x] **Step 3: Implement the Produces block in `combatStance.js`.** Pure; imports only the four modules above and
  `BASE_MOVE_SPEED` (re-exported for the test). `retreat = pursuitSpeed(slowest) − MIN_CLOSING_RATE`;
  `strafe = advance = pursuitSpeed(fastest) + STRAFE_MARGIN`. Round only in the test (`toBeCloseTo`) where floats
  demand it.

- [x] **Step 4: Run them to verify they pass.** The same command; expected PASS.

- [x] **Step 5: Mutation receipts.** Apply each with `scripts/dev/mutate.sh`, each RED:
  - S2a: `Math.min` → `Math.max` in the slowest-pursuer pick (the retreat derived from the spider gives 5.0).
  - S2b: the `NON_PURSUERS` entry deleted. It goes RED through the pursuer count (`toBe(6)` sees 7) and through
    `closingOver('skeleton', 10, 10)`, where the skeleton stands and shoots in its 8-12 m band and throws 'empty
    denominator'. The skeleton does NOT become the slowest pursuer: its formula speed is 2.5 × 1.5 = 3.75, above the
    husk's 3.0. Record the receipt with this mechanism.
  - S2d: the `RETREAT_FLOOR` throw removed. RED on `a slower pursuer added later fails the floor` (the slug pursues
    at 1.8, so the retreat would be 0.8). This is the mutant that exercises a pursuer slower than the husk, which is
    what the first draft's S2b text claimed to do.
  - S2c: `chaseSpeedMult(type, true)` → `1` in `pursuitSpeed`.

  Record the receipts in both files.

- [x] **Step 6: Commit** with the title "feat(combat): stance caps derived from the roster — a backpedal 1 m/s under the slowest pursuer, strafe 0.5 over the fastest (F1)" and a `Mutation-Proof:` trailer.

---

### Task 3: The radial clamp (the stance's velocity)

**Files:** Modify `frontend/src/game/combatStance.js`; test in `combatStance.test.js`.

**Interfaces:**
- Produces: `stanceVelocity(vx, vz, awayX, awayZ, w, formMult = 1, walkMult = 1, caps = STANCE_CAPS, out = {x:0,z:0}) -> out`.
  - `(vx, vz)` is the desired planar velocity: `moveVector` at `speed = moveSpeed(loco) × walkMult`, exactly as the
    controller computes it today, so it already carries the form and walk multipliers.
  - `formMult` is the form's `loco.moveMult`; `walkMult` is the product of the walk slows (`heavyWalkMult(now)`, and
    from Task 9 `stringWalkMult(now)`).
  - `(awayX, awayZ)` is the unit vector from the threat to the player, or `(0, 0)` when the threat has no direction.
  - `w ∈ [0,1]` is the stance weight.
  - The effective caps are `retreat = caps.retreat × walkMult`, `strafe = caps.strafe × formMult × walkMult` and
    `advance = caps.advance × formMult × walkMult`. A clamp is positively homogeneous, so scaling the caps by the walk
    multiplier is the same as applying the walk slow AFTER the clamp, while the input path stays exactly today's
    (which keeps the w = 0 identity exact rather than a reordered float product).
  - Decompose into radial `r = v·away` and tangential `t = v·tan`, where `tan = (−awayZ, awayX)`. Clamp `r` to
    `[−advance, retreat]` and `t` to `[−strafe, strafe]`. With no direction, scale `v` down to magnitude ≤ `strafe`
    instead.
  - Recompose, then output `lerp(v, clamped, w)`. Allocation-free: write into `out`.
  - `w === 0` returns `(vx, vz)` untouched (an early return), so the identity is exact rather than a float
    coincidence.

- [x] **Step 1: Write the failing property tests**

```js
const FORMS = [0.6, 0.7, 1, 1.25, 1.4], HEAVY = [1, 0.55], DIRS = Array.from({ length: 360 }, (_, d) => d * Math.PI / 180);
it('at w = 0 it is the identity, exactly, for every input (out-of-combat speed unchanged)', () => {
  for (const a of DIRS) for (const m of FORMS) { const vx = Math.cos(a) * 14 * m, vz = Math.sin(a) * 14 * m;
    const o = stanceVelocity(vx, vz, 0.6, 0.8, 0); expect(o.x).toBe(vx); expect(o.z).toBe(vz); }
});
it('at w = 1 the AWAY component never exceeds the retreat cap — any key, any heading, any form, charging or not', () => {
  for (const a of DIRS) for (const m of FORMS) for (const h of HEAVY) for (const b of [0, 1.3, 2.9]) {
    const ax = Math.cos(b), az = Math.sin(b), s = 14 * m * h;
    const o = stanceVelocity(Math.cos(a) * s, Math.sin(a) * s, ax, az, 1, m, h);
    expect(o.x * ax + o.z * az).toBeLessThanOrEqual(STANCE_CAPS.retreat * h + 1e-9);
    expect(Math.abs(-o.x * az + o.z * ax)).toBeLessThanOrEqual(STANCE_CAPS.strafe * m * h + 1e-9);
    expect(-(o.x * ax + o.z * az)).toBeLessThanOrEqual(STANCE_CAPS.advance * m * h + 1e-9);
  }
});
it('a straight backpedal at 14 comes out at exactly the retreat cap; a pure strafe at exactly the strafe cap', () => {
  const b = stanceVelocity(14, 0, 1, 0, 1); expect(b.x).toBeCloseTo(2.0, 12); expect(b.z).toBeCloseTo(0, 12);
  const s = stanceVelocity(0, 14, 1, 0, 1); expect(s.x).toBeCloseTo(0, 12); expect(s.z).toBeCloseTo(6.5, 12);
});
// The bounds above are upper bounds only, so absolute caps would pass them. These pin the LOWER side: the clamp keeps
// each form's pace and each walk slow instead of flattening them to 6.5 (review finding 5).
it('the clamp keeps the pace: a pure strafe comes out at strafe x moveMult x walkMult for every form and walk slow', () => {
  for (const m of FORMS) for (const h of HEAVY) {
    const o = stanceVelocity(0, 14 * m * h, 1, 0, 1, m, h); expect(o.z).toBeCloseTo(STANCE_CAPS.strafe * m * h, 9);
  }
  expect(stanceVelocity(0, 14 * 0.6, 1, 0, 1, 0.6, 1).z).toBeLessThan(stanceVelocity(0, 14 * 1.4, 1, 0, 1, 1.4, 1).z); // golem < comet
});
it('the retreat is form-invariant and the walk slow survives it: a straight backpedal is retreat x walkMult for every form', () => {
  for (const m of FORMS) for (const h of HEAVY) expect(stanceVelocity(14 * m * h, 0, 1, 0, 1, m, h).x).toBeCloseTo(STANCE_CAPS.retreat * h, 9);
});
it('a threat with no direction caps the total speed and makes no NaN', () => {
  const o = stanceVelocity(14, 0, 0, 0, 1); expect(Number.isFinite(o.x) && Number.isFinite(o.z)).toBe(true);
  expect(Math.hypot(o.x, o.z)).toBeCloseTo(6.5, 9);
});
it('blends linearly in w', () => expect(stanceVelocity(14, 0, 1, 0, 0.5).x).toBeCloseTo(8.0, 9));
```

- [x] **Step 2: Run and verify FAIL** ("stanceVelocity is not a function").
- [x] **Step 3: Implement `stanceVelocity`** to the Interfaces block.
- [x] **Step 4: Run and verify PASS.**
- [x] **Step 5: Mutation receipts, each RED:**
  - S3a: the retreat clamp dropped. Only the strafe clamp remains, which is the camera-relative-backpedal design the
    derivation section rules out.
  - S3b: `lerp` weight inverted (`1 − w`).
  - S3c: the tangential axis computed as `(awayZ, −awayX)` with the sign flipped. Expected SURVIVED. The clamp is
    symmetric, so this mutant is equivalent: record it as an equivalent mutant, not a hole.
  - S3d: `formMult` ignored (absolute strafe and advance caps, the first draft's design). RED on `the clamp keeps
    the pace`.
  - S3e: the retreat cap also scaled by `formMult` (a comet retreats at 2.8). RED on `the retreat is form-invariant`.
- [x] **Step 6: Commit** with the title "feat(combat): the stance clamps the away-from-threat component, not the S key" and a trailer.

> **Done 2026-10-27.** Built by a forked duplicate builder that died before committing; reviewed as a stranger's work, kept unchanged, and re-proven here: RED first (9 of 15 with "stanceVelocity is not a function"), then green. Two tests beyond the list above: the w = 0 early return is pinned by a non-finite away vector and a `-0` (the lerp alone returns finite input unchanged, so the identity case cannot tell the two apart), and `out` is written and returned. Receipts (mutate.sh): S3a, S3b, S3d, S3e RED; S3c SURVIVED as the equivalent mutant; added S3f (advance clamp dropped), S3g (early return dropped), S3h/S3i (no-direction cap dropped / at the retreat cap), S3j (walk slow off the retreat), S3k (one-sided strafe clamp), S3l (`w * w` blend), S3m (advance not scaled by the form), all RED; identity survived. Task 2's receipts were re-run clean on the committed `90863cc6` content first (its first run shared the file with another builder's mutate.sh): all reproduced, see the commit body.

---

### Task 4: Engage, calm, blend: the stance state machine

**Files:** Modify `frontend/src/game/combatStance.js`; test in `combatStance.test.js`.

**Interfaces:**
- Consumes: `isHostile(e)` (`frontend/src/combat/targeting.js:39`), which already excludes questgivers, passives and
  corpses; `archetypeFor` (`game/mobArchetypes.js`) for `verticalReach` and `meleeRange`; `CLIMBERS`
  (`game/localPath.js:41`) and `LEAP_RANGE` (`game/mobSenses.js:34`); `NON_PURSUERS` (Task 2).
- Produces:
  - Constants: `ENGAGE_RADIUS_M = 12` (horizontal), `CALM_MS = 2000`, `ENTER_S = 0.2`, `EXIT_S = 0.6`,
    `THREAT_SWITCH_M = 1.0`, `STALL_MS = 1500`, `STALL_PROGRESS_M = 0.5`, `MELEE_MARGIN_M = 1.0`.
  - `engageDyM(type) -> number`: `LEAP_RANGE` (6) for a climber, else `archetypeFor(type).verticalReach` (2.5; 3.2
    for the brute). It replaces the first draft's flat `ENGAGE_DY_M = 4`: the vertical bound is the mob's own reach,
    the one the worker strikes with (`ai.worker.js:226-254`).
  - `stanceStep(state, mobs, player, nowMs, dtS) -> state`. It mutates and returns `state`, shaped
    `{ w, engaged, threatId, awayX, awayZ, lastEngagedAt, threatX, threatZ, playerX, playerZ, frame }`. The four
    positions are the raw planar inputs of the current threat and the player, written before `away` is derived, and
    `frame` counts calls (Task 5's spec reads them).
    - **Qualifies** this frame: some `m` with `isHostile(m) && m.isAggro`, its type not in `NON_PURSUERS`,
      horizontal distance ≤ `ENGAGE_RADIUS_M`, `|m.position.y − player.y| ≤ engageDyM(m.type)`, and **not stalled**.
    - **Stalled:** outside `archetypeFor(m.type).meleeRange + MELEE_MARGIN_M` horizontally, and the mob's OWN
      displacement toward the player has stayed under `STALL_PROGRESS_M` for `STALL_MS`. Own progress is measured from
      a per-mob anchor: `p = (mobNow − anchor) · unit(player − mobNow)`. When `p ≥ STALL_PROGRESS_M`, the anchor moves to
      the mob's position and its time to `nowMs`. The player's own motion never counts: a player walking toward a
      stranded husk does not make the husk "progress". A mob within its melee reach is never stalled, because it can
      hit you standing still. The anchors live in a module-level `Map(id → {ax, az, at})`: an entry is created when a
      mob first comes within range, entries not seen this frame are deleted, and `resetStance()` clears it.
      Allocation-free in steady state (one small object per newly engaged mob).
    - **Engaged** this frame: some mob qualifies.
    - **Threat:** the current `threatId` while it still qualifies, unless another qualifier is more than
      `THREAT_SWITCH_M` nearer; otherwise the nearest qualifier. `away` is the unit vector from the threat to the
      player, and `(0,0)` under 1e-3 m.
    - **Calm:** `state.engaged` stays true until `CALM_MS` after `lastEngagedAt`.
    - **Blend:** `w` moves toward `engaged ? 1 : 0` at `1/ENTER_S` or `1/EXIT_S` per second, clamped to [0,1].
      `nowMs` is `performance.now()`: the stance is the player's real-time feel, like `heavyAttack.js`.
  - `getStance() -> state`, the live singleton the controller passes to `stanceStep`. It is read transiently and
    never subscribed.
  - `resetStance()`, called on death.

> **Deviation (command session decision, 2026-10-27): the height reference is the point the worker strikes from.**
> This plan passed the rigid-body translation as `player` (Task 5 Step 3: `currentTrans`). The worker measures every
> sense and reach test from the `playerPos` that `AIWorkerSystem` posts, and that is `camera.position`
> (`systems/AIWorkerSystem.jsx:226`). The camera rides `translation.y + 1.2` plus bob, shake and kick
> (`Components.jsx:1410`; the brief's `:886` is the death-branch copy of the same offset). The human capsule's centre
> is 0.9 m above its feet (`beasts.js` `BASE_CAPSULE`) and a mob's `y` is 0.5 m above its floor (`localPath.js`
> `settleOnGround`), so on one floor the worker reads dy 1.6 and the translation 0.4. Measured from the translation, the
> stance would engage on a husk on the floor one or two blocks below the player's ledge, which the worker never lets
> swing (dy 2.6 to 3.6 from the eye, over its 2.5), and would miss a husk three or four blocks up, which it does. So
> `player` is the point mobs measure the player from, read from ONE function, `mobSensePoint(camera)` in
> `game/mobSenses.js`: `AIWorkerSystem` posts it, and the controller hands it to `stanceStep` (Task 5). The horizontal
> reads move with it (camera x/z is the translation plus shake and kick, centimetres), so the away vector is measured
> from the same point, and `readStance` gains `playerY`. Task 4's dy tests are written against `player.y` as that
> point. The agreement is gated in Task 5's e2e (case 0): the stance's recorded `playerX/Y/Z` must equal the last
> `playerPos` the page posted to the AI worker, observed by wrapping `Worker.prototype.postMessage`, so a stance fed the
> translation reads 1.2 m off and goes RED, and so does a worker fed the body centre.

- [x] **Step 1: Write the failing tests.** Use a fake mob factory `mob({ x, y=0, z=0, aggro=true, passive=false, health=50 })` and player `{x:0,y:0,z:0}`:
  - `engages on an aggro'd hostile at 11.9 m and not at 12.1 m`
  - `ignores a hostile beyond its own vertical reach` (a husk at dy 2.6 does not engage and at dy 2.4 does; a brute
    engages at dy 3.1; a spider engages at dy 5.9 and not at dy 6.1)
  - `ignores passive, un-aggro'd, dead and dying (dyingUntil) mobs`
  - `a skeleton never engages` (an aggro'd skeleton at 10 m and at 5 m, alone: `engaged` stays false)
  - `a stranded mob stops qualifying after STALL_MS`: an aggro'd husk held still at 8 m, stepping `nowMs` from 0;
    it qualifies at 1499 ms and not at 1501 ms, and `engaged` then leaves `CALM_MS` later
  - `a mob closing by its own steps keeps qualifying` (the husk moved 0.6 m toward the player every 1000 ms stays
    qualified across 5000 ms)
  - `the player's own approach is not the mob's progress` (the husk held still at 8 m while the player walks 3 m toward
    it over 1600 ms: it stops qualifying)
  - `a mob inside its melee reach qualifies while standing still` (a husk at 2.0 m held still for 5000 ms)
  - `stays engaged for CALM_MS after the last engaged frame, then leaves` (stepping `nowMs` across 1999 and 2001 ms)
  - `w reaches 1 after ENTER_S and returns to 0 after EXIT_S` (stepping dt 1/60)
  - `keeps its threat until another is a metre nearer`: an east mob at 5.0 m alone first, so the threat is east.
    A west mob then appears at 4.5 m and the threat holds east; the west mob moves to 3.9 m and it switches.
  - `away points from the threat to the player, unit length`
  - `resetStance zeroes w and engaged`

- [x] **Step 2: Run and verify FAIL.**
- [x] **Step 3: Implement** to the Interfaces block. Allocation-free per call: no arrays or objects created.
- [x] **Step 4: Run and verify PASS.**
- [x] **Step 5: Mutation receipts, each RED:**
  - S4a: the vertical-reach check dropped.
  - S4b: `CALM_MS` → 0.
  - S4c: hysteresis removed (always the nearest).
  - S4d: `isAggro` not required.
  - S4e: the `NON_PURSUERS` skip dropped. RED on `a skeleton never engages`.
  - S4f: the stall rule dropped. RED on `a stranded mob stops qualifying`.
  - S4g: progress measured as the fall in the mob-to-player DISTANCE (plausible-wrong: the player's motion counts).
    RED on `the player's own approach is not the mob's progress`.
- [x] **Step 6: Commit** with the title "feat(combat): the stance engages on an aggro'd pursuer that can reach you, within 12 m, and leaves 2 s after the last" and a trailer.

> **Done 2026-10-27, with three deviations from the Interfaces block** (each pinned by a test and a mutant that
> restores the plan's text). (1) **The stall clocks are kept for every aggro'd hostile pursuer, not only those in
> range**, and dropped when the mob stops being one. Scoped to range, a clock restarts each time a stranded mob
> flickers across the 12 m radius or its reach bound (the eye the stance now measures from bobs a few centimetres a
> step), so a mob that never gains could hold the stance forever, which is review claim 4's failure. Test `a
> stranded mob flickering across the engage radius still stalls`, mutant S4j. (2) **A climber's strike reach is its
> leap** (`LEAP_RANGE` across, as `engageDyM` already used it up): the worker's spider leaps from 6 m
> (`canReach(dx, dy, dz, LEAP_RANGE, LEAP_RANGE)`), so a spider standing at 5.5 m can hit a still player and must not
> stall out. Mutant S4i2. (3) **With no qualifier this frame the last threat's position is kept**, so the calm and the
> exit blend clamp against where the fight was rather than against no direction (which would free a 6.5 m/s walk the
> moment a threat dropped out of range); `threatId` clears once `w` is back to 0. Mutant S4r. Also: `stanceStep`
> records `playerY` (the height-reference deviation above), and `archetypeFor` is read once per type into a cache,
> because it builds a fresh object per call. Receipts: 24 mutants RED (S4a-S4g as listed, plus S4a2, S4a3, S4c2, S4h,
> S4i, S4i2, S4j, S4k, S4l, S4m, S4n, S4o, S4p, S4q, S4r, S4s), the identity mutant survived.

---

### Task 5: The stance in the running game, with its lived proof

**Files:**
- Modify: `frontend/src/Components.jsx`
  - near `:879-881`: call `stanceStep` before the WASD branch;
  - `:1193-1196`: pass `mv` through `stanceVelocity` before `rampVelocity`, then `noteMoveTarget(...)`;
  - `:864-874`: `resetStance()` on death.
- Modify: `frontend/src/game/combatStance.js`: + `noteMoveTarget(rawX, rawZ, targetX, targetZ, w)` and
  `readMoveTarget()`. Four number writes into one module-level object per frame; no allocation.
- Modify: `frontend/src/App.jsx` (beside `readMobs`, `:335`): `registerTestHook('readStance', () => ({ ...getStance() }))`
  and `registerTestHook('readMoveTarget', () => ({ ...readMoveTarget() }))`.
- Create: `frontend/tests/e2e/combat-stance.spec.js`

**Interfaces:**
- Consumes: `stanceStep`, `stanceVelocity`, `getStance`, `resetStance`, `STANCE_CAPS` (Tasks 2-4), and
  `mobsQuery.entities` (already used at `Components.jsx:998`).
- Produces:
  - the DEV hook `readStance` → `{ w, engaged, threatId, awayX, awayZ, threatX, threatZ, playerX, playerZ, frame }`.
    `stanceStep` records the threat's and the player's planar positions as it read them, before deriving `away`, so a
    spec can rebuild the direction without trusting the derivation;
  - the DEV hook `readMoveTarget` → `{ rawX, rawZ, targetX, targetZ, w, frame }`: `raw` is `moveVector`'s output
    and `target` is what the controller hands `rampVelocity` on that frame. It is the controller's own record, so it
    sees a wrong away vector, a key-gated call or a blanket scale wherever it sits between the two. It runs at any
    frame rate, which the chase measurement does not.

- [ ] **Step 0: Measure CI's frame rate before relying on a chase.** `App.jsx:340-342` records that a loaded CI
  runner "draws a frame every few hundred" ms, and `DECISIONS.md:25-26` records local runs at 0.5 fps. The chase
  cases (2, 2b, 2c) need ≥ 4 fps. The spec logs `median frame interval: N ms (M samples)` on every run, so the first
  CI run of the spec measures it. If it is above 250 ms, the chase sub-assertions report SETUP there (never a
  verdict), and the frame-rate-independent assertions below carry the verdict. Record the measured number in Task 12;
  if CI never reaches 4 fps, a deterministic stepping hook (AI and player advanced by a fixed dt) is the follow-up,
  named in DECISIONS rather than assumed.

- [x] **Step 1: Write the failing e2e** (`combat-stance.spec.js`). Use the `perfect-dodge.spec.js` staging pattern:
  `bootDev`, `startPlayActive`, `setTimeOfDay(0.5)`, every hostile within 40 m killed, the camera yaw set directly
  through `window.__threeCamera.rotation.y` (pointerLook keeps no yaw of its own, `input/pointerLook.js:15-17`), and
  pitch 0.

  **SETUPs**, each a fail message beginning `SETUP:`:
  - **A flat strip.** Probe `getMobFloor` along the line from 14 m behind to 6 m ahead, and along the lateral line
    25 m to the right, and require a height variation ≤ 1 block on both. Try 8 headings 45° apart; if none
    qualifies, SETUP.
  - **Frame rate ≥ 4 fps** (median frame interval ≤ 250 ms) for the CHASE sub-assertions only. Below that,
    `AIWorkerSystem.jsx:206` caps the AI tick at 0.25 s, mobs move slower than their speed, and a chase cannot be
    judged. The target assertions (`readMoveTarget`) do not depend on frame rate and always give a verdict.

  **Why the geometry varies.** With the husk dead ahead, a held S is away-from-threat AND camera-backward, so a
  wrong away vector (the camera's backward axis) or a key-gated call (`input.moveB` only) would pass every S case.
  Cases 2b and 2c separate those (review finding 1).

  Then these cases in one test, in this order:
  1. **Engages.** Spawn a zombie 5 m ahead on the strip. Within 3 s, `readStance()` must show `engaged === true` and
     `w === 1`. The fail message is "the stance never engaged with an aggro'd husk 5 m ahead" plus a trace.
  2. **Caught (S, threat ahead).** Dispatch `keydown KeyS` through the real window listener. Sample every frame the
     horizontal gap zombie↔camera, the player's displacement and `readMoveTarget()`, for up to 8 s or until the gap is
     ≤ 2.6 m.
     - Target, every sampled frame with `w === 1`: the target's away-from-threat component is ≤ `2.0 + 1e-6`.
       Message: "a held S's target left the husk at N m/s". The yardstick is independent of the subject twice over.
       The away direction is computed by the spec from the raw positions that frame used (`readStance().threatX/Z`
       and `playerX/Z`, recorded before any direction is derived, and checked to be the same `frame` as
       `readMoveTarget()`), never from `readStance().awayX/Z`: T5 negates that too and would agree with itself. A
       direction rebuilt from `readMobs()` and the camera instead would be read at a different moment, and at CI's
       frame rate a 3 m/s husk at 5 m moves enough per frame to put about 1 m/s of error on a 6.5 m/s target, which
       no tight tolerance survives. The caps are LITERALS (2.0, 6.5), never read from `STANCE_CAPS`: T2 would move
       them with the subject (the Task 1 lesson).
     - Chase (≥ 4 fps only): the gap reached ≤ 2.6 m, with "a held S outran an aggro'd husk" and the per-frame trace
       `[ms, gap, playerSpeed, w]`; and the achieved retreat speed is ≤ 2.3 m/s.
     - SETUP if the player moved < 0.5 m (blocked by terrain).

     Release S. Re-stage: kill the zombie, wait for `w === 0`, and spawn a fresh one for each case below.
  2b. **Caught (W, threat behind).** Set the camera yaw to face away from a zombie spawned 5 m BEHIND, and hold
     `KeyW`. The same target and chase assertions as case 2, with "a held W walked away from an aggro'd husk behind".
  2c. **Caught (D, threat ahead: a pure strafe).** A zombie 5 m ahead, hold `KeyD`. The target's away component stays
     ≤ `2.0 + 1e-6` and its tangential component ≤ `6.5 + 1e-6` on every `w === 1` frame; chase (≥ 4 fps only): the
     gap still reaches ≤ 2.6 m within 8 s ("a strafe outran an aggro'd husk"). The camera is fixed, so the strafe is a
     straight world line and its away component grows as the player passes the husk: this is the case that kills a
     decomposition along the camera's axes instead of the threat's.
  3. **Leaves, and travel returns** (the control). Kill the zombie and wait `CALM_MS + EXIT_S·1000 + 300` ms. Then
     assert `readStance().w === 0`. Hold S for 1.5 s.
     - Identity, every sampled frame (at least 10): `targetX === rawX && targetZ === rawZ` (`Object.is`). Message:
       "out of combat the controller's target is not moveVector's".
     - Achieved: over the last 1.0 s the speed is ≥ 12 m/s (≥ 4 fps only; the coarse lived check). SETUP if the
       player moved < 3 m.

  The header carries `Mutation-Proof: OWED` and the batch below.

- [x] **Step 2: Run it to verify it fails.** In the command session or CI:
  `cd <repo>/.claude/worktrees/combat-stance/frontend && npx playwright test tests/e2e/combat-stance.spec.js`
  Expected: FAIL at case 1. The `readStance` hook is absent, so the call returns `undefined` and the message reads
  "the stance never engaged".

- [x] **Step 3: Wire it.** At `Components.jsx:881`, read `now = performance.now()` once and compute
  `walkMult = heavyWalkMult(now)`; `speed = moveSpeed(loco) * walkMult` (today's value, reordered into a named
  factor; Task 9 multiplies in `stringWalkMult(now)`). At `:882`, after `const currentTrans =
  rigidBodyRef.current.translation()`, add `const st = stanceStep(getStance(), mobsQuery.entities, currentTrans, now,
  delta)`. Then in the WASD branch, `stanceVelocity(mv.x, mv.z, st.awayX, st.awayZ, st.w, loco.moveMult, walkMult,
  STANCE_CAPS, stanceOutRef.current)` replaces the raw `mv.x / mv.z` targets when `mv.moving`, and
  `noteMoveTarget(mv.x, mv.z, targetX, targetZ, st.w)` records the pair. `stanceOutRef` is a `useRef({x:0,z:0})`.
  In the death branch at `:867`, call `resetStance()` beside `cancelHeavy()`. In `App.jsx`, add the two hooks.

- [x] **Step 4: Run it to verify it passes,** then run `npm run test:unit` and `npm run lint`. Expected: green, with
  the trace printing about 2.0 m/s retreat and the gap closing at ≥ 0.8 m/s.

- [x] **Step 5: Mutation batch** with `sh scripts/dev/mutate-e2e.sh <subject> tests/e2e/combat-stance.spec.js <label> <old> <new>`.
  Each must be RED unless marked:

  | label | subject | mutation | expected catch |
  |---|---|---|---|
  | T1 | `src/Components.jsx` | the raw `mv.x / mv.z` used (the `stanceVelocity` call bypassed) | case 2 target: "a held S's target left the husk" |
  | T2 | `src/game/combatStance.js` | the slowest pursuer picked with `Math.max` (retreat 5.0) | case 2 target |
  | T3 | `src/game/combatStance.js` | `ENGAGE_RADIUS_M = 0` | "never engaged" |
  | T4 | `src/game/combatStance.js` | `engaged` forced true | case 3 (w never returns to 0) |
  | T5 | `src/game/combatStance.js` | `away` negated (points at the threat) | case 2 target |
  | T6 | `src/Components.jsx` | the planar camera-BACKWARD vector passed as `(awayX, awayZ)` | case 2b: "a held W walked away from an aggro'd husk behind" |
  | T7 | `src/Components.jsx` | `stanceVelocity` called only when `input.moveB` | case 2b |
  | T8 | `src/Components.jsx` | the call passes `Math.max(st.w, 0.1)` (a w floor) | case 3 identity |
  | T9 | `src/Components.jsx` | the target scaled by 0.9 after the stance call | case 3 identity |
  | T0 | `src/game/combatStance.js` | a comment edit (`--identity`) | must SURVIVE |

  T6-T9 are the mutants the first draft's all-S, threat-ahead geometry could not see (review findings 1 and 6). Replace
  OWED with the observed verdicts. Sweep with `sh scripts/dev/kill-test-procs.sh`.

- [x] **Step 6: Commit** with the title "feat(combat): you cannot outwalk a fight — the stance in the Player loop; travel keeps 14 m/s" and the `Mutation-Proof:` trailer listing T0-T9.

> **Done 2026-10-27, with deviations; the chase verdicts and CI's frame rate are OWED TO CI.**
> - **The height reference** (the command session's decision, recorded under Task 4): `stanceStep` receives
>   `mobSensePoint(camera)` (new in `game/mobSenses.js`), not `currentTrans`, and `AIWorkerSystem` posts the same
>   function's point as the worker's `playerPos`. `readStance` gains `playerY`. The agreement is gated by a new case 0:
>   the spec wraps `Worker.prototype.postMessage` and compares the stance's recorded point with the last TICK's
>   (H1 and H2 RED at 1.200 m apart; H3, the point moved for both readers, survives by design;
>   `src/game/mobSenses.test.js` pins the point itself). The controller's local is named `stance`, not `st` (the frame
>   already has block-scoped `st`s for the store).
> - **Staging.** No heading of 8 has the plan's flat strip at the spawn: the hearth platform (floor 52, 15 x 15 m) sits
>   in rolling ground at 45-61 (measured on the first local run), so the plan's SETUP would have fired on every run.
>   Every case is staged from the platform (the body put back on its stand point, as `context-loss.spec.js` does), with
>   a per-case heading that keeps the husk on the player's level; a flat walked path gates only that case's CHASE, as
>   the frame rate does. The stage's "wait for w === 0" is a verdict, not a SETUP, so T4 is killable there.
> - **The strafe chase needs a faster frame** (measured): within a frame the player moves in a straight line, so a
>   tangential step grows the gap by about L²/2g, a leak of 6.5² · Δ / 2g. At Δ = 247 ms the strafe case's gap grew
>   3.2 to 6.05 m while every frame's target held the caps. Its chase is judged only at Δ ≤ 61 ms (the leak at the
>   2.6 m catch gap at most half the 1 m/s margin). Case 3's travel speed is judged over the flat first 8 m past the
>   walk ramp, because no heading has a flat 22 m path from the hearth.
> - **Proof.** RED first against the Task 4 tree (no hook, no call). Green locally under the identity mutant, three
>   times (median frame interval 214, 255 and 387 ms): case 0 median 0.000 m over 12 frames; the targets at exactly the 2.0 cap;
>   the chases of cases 2 and 2b judged and held at 214 ms (retreat 1.86 and 1.91 m/s, caught at 2.55 and 2.48 m).
>   Mutation batch T1-T9, H1, H2 all RED, H3 and the identity mutant SURVIVED: run by hand on a throwaway config (port
>   4297) and scored by `mutate-e2e.sh`'s own rules, because `mutate-e2e.sh` serves 4179 and sweeps with
>   `kill-test-procs.sh`, which the authoring lane may not run. **Owed to CI:** the chase sub-assertions at CI's frame
>   rate, and Step 0's CI median frame interval (the spec logs it on every run).

---

### Task 6: Which windups are off screen, and where their chevrons sit

**Files:** Create `frontend/src/game/windupChevrons.js` and `windupChevrons.test.js`.

**Interfaces:**
- Consumes:
  - `hitDirection(playerPos, sourcePos, cameraYaw)` (`game/damageDirection.js:10`): 0 is ahead/top, ±π behind.
  - `windupRamp`, `WINDUP_MS` (`game/attackTelegraph.js:9,25`).
  - `isStaggered` (`game/perfectDodge.js:67`), `isHostile` (`combat/targeting.js:39`).
  - `ENGAGE_RADIUS_M` (Task 4).
- Produces:
  - Constants: `CHEVRON_MAX = 4`, `CHEVRON_RANGE_M = ENGAGE_RADIUS_M` (12), `ON_SCREEN_MARGIN = 0.06` (NDC),
    `TOP_INSET_PX = 120`, `SIDE_INSET_PX = 96`, `BOTTOM_INSET_DESKTOP_PX = 140`,
    `touchBottomInsetPx(h) = Math.round(0.11 * h) + 170`.
  - `offscreenWindups(mobs, player, yaw, project, worldNowMs, out) -> count`.
    - `project(pos) -> {x, y, z}` returns NDC; the HUD passes the camera's projection, tests pass a fake.
    - It fills `out[0..count)` with `{ id, angle, ramp }` for each `m` that satisfies all of: `isHostile(m)`,
      `m.windupUntil > worldNowMs`, not staggered, and 3D distance ≤ `CHEVRON_RANGE_M`.
    - The mob must also be **off screen**: `z > 1 || |x| > 1 − ON_SCREEN_MARGIN || |y| > 1 − ON_SCREEN_MARGIN`.
    - Results are sorted by soonest `windupUntil`, capped at `CHEVRON_MAX`.
    - `angle = hitDirection(...)`; `ramp = windupRamp(worldNowMs, m.windupUntil, WINDUP_MS)`.
  - `chevronPlacement(angle, w, h, bottomInsetPx) -> { left, top, rotDeg }`, in px inside the safe-area container.
    It intersects the ray from the container's centre at screen angle `angle` with the inset rectangle
    `[SIDE, w−SIDE] × [TOP, h−bottomInset]`. `rotDeg = angle·180/π`, so the chevron points outward toward the mob.

- [x] **Step 1: Write the failing tests:**
  - `a windup behind the player is off screen, at angle ±π`
  - `a windup dead ahead and in the frustum is not listed`
  - `a windup ahead but above the frustum is off screen` (the fake projector returns `y = 1.4`; Review Focus 4)
  - `not winding up, staggered, passive, dead or beyond 12 m: not listed`
  - `sorted by soonest strike, at most 4`
  - `ramp rises from 0 to 1 across the windup`
  - `placement stays inside the inset rectangle for 360 angles at 1280x800, 1194x834 and 834x1194`: every
    `(left, top)` is within `[SIDE, w−SIDE] × [TOP, h−bottomInset]` ± 0.5 px, and at least one point lies on each of
    the four edges.
  - `placement at angle 0 is top-centre, π/2 right-centre, π bottom-centre`

- [x] **Step 2: Run and verify FAIL.**
- [x] **Step 3: Implement** to the Interfaces block. Allocation-free: `out` holds 4 preallocated objects.
- [x] **Step 4: Run and verify PASS.**
- [x] **Step 5: Mutation receipts, each RED:**
  - C6a: the off-screen predicate negated.
  - C6b: the `|y|` term dropped, which kills the steep-pitch test.
  - C6c: `out` not sorted.
  - C6d: the bottom inset ignored.
- [x] **Step 6: Commit** with the title "feat(combat): the windups a player cannot see, and an edge frame clear of the HUD to show them on" and a trailer.

> **Done 2026-10-27 (`6f1b1c51`).** 11 tests, RED first (the module did not exist). Receipts: C6a-C6d as listed plus
> C6e-C6r (14 plausible-wrong mutants: the range flat or strict, the margin, the stagger, the windup edge, the ramp,
> the sort reversed, the cap keeping the latest four, the ray from the frame's centre, rotDeg negated, the yaw
> ignored, screen y flipped, the far boundary, the hostile check), all RED; the identity mutant survived. Deviations:
> `chevronPlacement` takes an optional preallocated `out`, and each slot carries the `until` it was sorted by.

---

### Task 7: The chevron layer in the HUD, with its lived proof

**Files:**
- Create: `frontend/src/ui/WindupChevrons.jsx`, `frontend/tests/gates/windup-chevrons-gates.test.jsx`,
  `frontend/tests/e2e/windup-chevron.spec.js`
- Modify: `frontend/src/HUD.jsx:645`, adding `<WindupChevrons />` after `<DamageDirection />`.

**Interfaces:**
- Consumes:
  - `subscribeHudTick` (`ui/hudTicker.js`, Phase 0g).
  - `offscreenWindups`, `chevronPlacement`, `touchBottomInsetPx`, `BOTTOM_INSET_DESKTOP_PX` (Task 6).
  - `worldNow` (`game/worldClock.js:38`): `windupUntil` is stamped on the world clock (`AIWorkerSystem.jsx:190`).
  - `mobsQuery` (`ecs/world`), `isTouchDevice` (`input/touchDevice.js`), and `useGameStore.getState().gameCamera`.
- Produces: a fixed container `data-testid="windup-chevrons"`, inset by `env(safe-area-inset-*)`,
  `pointer-events:none`, `zIndex: 38` (the same as DamageDirection), holding `CHEVRON_MAX` children
  `data-testid="windup-chevron"`. Each child carries `data-on="0|1"`, `data-angle` (whole degrees) and
  `data-mob` (id). The chevron is an inline SVG filled with `rgb(var(--ui-danger))` (`theme/cssVars.js:35`); its
  opacity is `0.55 + 0.45·ramp`. In `HUD.jsx:501` the compass FRAME (the `w-[320px] h-[34px]` panel; `:505` is the
  inner marker track, and `:500` the `pointer-events-none` outer wrapper) gains `data-testid="hud-compass"` (one attribute)
  so the e2e can test for overlap with it.

- [x] **Step 1: Write the failing jsdom gate** (`windup-chevrons-gates.test.jsx`). Stub `subscribeHudTick` to capture
  the tick, a store with a fake `gameCamera` (a `project` behind the camera returns `z > 1`), and `mobsQuery` with
  one hostile winding up behind. Render once, call the captured tick:
  - `one chevron is on, at about 180 degrees, the other three off`
  - `a second tick with nothing changed writes nothing` (a `MutationObserver` on the container, `attributes:true,
    subtree:true`, records 0 mutations across it; style writes are attribute mutations)
  - `the component renders once across 30 ticks` (a render counter: Game-Loop isolation)
  - `under capture mode it renders nothing`

- [x] **Step 2: Run and verify FAIL** ("Cannot find module '../../src/ui/WindupChevrons.jsx'").

- [x] **Step 3: Implement `WindupChevrons`.**
  - The tick runs on every HUD frame. It reads the camera, the player position (`camera.position`) and `worldNow()`,
    calls `offscreenWindups`, and places each node.
  - It writes `style.transform`, `style.opacity` and the `data-*` attributes only when the quantised values change:
    angle to 2°, ramp to 0.1, position to whole px.
  - The tick is **not** throttled to 15 Hz, deliberately. A 380 ms windup with a 15 Hz reader loses up to 66 ms (17%)
    of the reaction budget, while the scan is O(mobs) plus ≤ 4 projections, about microseconds; write-on-change
    already bounds the DOM cost.
  - Wire it into `HUD.jsx`.

- [x] **Step 4: Run the gate (PASS), then write the e2e** (`windup-chevron.spec.js`, desktop 1280×800). Stage as in
  Task 5. Freeze the world (`triggerHitstop(60000)`), wait 3 s real time, so `performance.now() − worldNow() > 2000`,
  which is what makes C4 below killable.
  1. Spawn a zombie 2 m **behind** (`camera − forward·2`), wait 3 frames, `plantWindup(id, 2000)`. Within 10 frames,
     exactly one `[data-testid="windup-chevron"][data-on="1"]` with `|data-angle| ≥ 160`. Its rect lies inside the
     viewport, and its `getBoundingClientRect()` intersects the rect of no `[data-hotbar-block]`,
     `[data-hud-interactive]` or `[data-testid="hud-compass"]` element. Rect intersection, not `elementsFromPoint`:
     the compass sits inside a `pointer-events-none` wrapper (`HUD.jsx:500`), and hit-testing skips such layers
     (`TouchControls.jsx:66-71`), so a point test could never see the compass and the assertion could not fail.
  2. A control with the same zombie and **no** windup: no chevron on after 10 frames.
  3. A control with a zombie 2.5 m **ahead** with a planted windup: no chevron on after 10 frames. SETUP if its
     projection is not on screen.
  4. **The top inset, tested** (Review Focus 4 at the controller). A zombie 2.5 m dead ahead with a planted windup,
     and the camera pitched UP until its projection leaves the frustum (SETUP if it never does). Exactly one chevron is
     on, with `|data-angle| ≤ 20` (top-centre), and its rect intersects neither the compass frame nor the viewport
     edge. Case 1's chevron sits bottom-centre, far from the compass, so without this case the compass check could
     not fail.

  Then end the freeze (`hitstopUntil = performance.now()`).

- [ ] **Step 5: Run the e2e (PASS), then the mutation batch** with `mutate-e2e.sh`. Each must be RED unless marked:

  | label | subject | mutation | catch |
  |---|---|---|---|
  | C1 | `src/HUD.jsx` | `<WindupChevrons />` removed | case 1 |
  | C2 | `src/game/windupChevrons.js` | the off-screen predicate negated | case 1 and case 3 |
  | C3 | `src/game/windupChevrons.js` | always off screen | case 3 (the in-view control) |
  | C4 | `src/ui/WindupChevrons.jsx` | `worldNow()` → `performance.now()` (plausible-wrong clock) | case 1: the planted windup reads expired |
  | C5 | `src/ui/WindupChevrons.jsx` | the `windupUntil > now` test dropped | case 2 |
  | C6 | `src/game/windupChevrons.js` | `TOP_INSET_PX = 40` (the chevron climbs into the compass) | case 4 |
  | C0 | `src/ui/WindupChevrons.jsx` | a comment edit (`--identity`) | must SURVIVE |

- [x] **Step 6: Commit** with the title "feat(hud): a chevron at the screen edge for a windup you cannot see — on the HUD ticker, refs only" and a trailer.

> **Done 2026-10-27, with its e2e OWED (`dcd31b3b`, then `d0f67eed`).** The jsdom gate (8 tests) drives the REAL
> HUD ticker (claimHudTick + emitHudTick) instead of a stubbed subscribeHudTick, and declares the device class per
> test, because jsdom answers isTouchDevice() as touch. Receipts: J1-J13 RED (12 mutants), the identity mutant survived,
> and J1b (the transform's write-on-change guard dropped) survived as an EQUIVALENT mutant: a same-value style write
> makes no mutation record. The compass frame is HUD.jsx:528 and the mount :673 (the plan's :501/:645 had moved). C5's
> subject is `game/windupChevrons.js`, where the windupUntil test lives. The e2e runs case 2 (no windup) BEFORE case 1
> on the same zombie: a windup cannot be un-planted in a frozen world without leaving an expired one the worker would
> strike with when the freeze ends. **Step 5 is OWED**: the machine's load average was 77-161 on 14 cores, so the e2e
> and its C0-C6 batch were not run. Its header says `Mutation-Proof: OWED`. Task 12 then moved the layer behind a
> `React.lazy` boundary for the byte share (see Task 12 Step 3).

---

### Task 8: The light string (pure)

**Files:** Create `frontend/src/game/meleeString.js` and `meleeString.test.js`.

**Interfaces:**
- Consumes: `HITSTOP` (`game/trauma.js:10`).
- Produces. The state is module-level, the `heavyAttack.js` pattern. Times are `performance.now()` ms, real time,
  so a hitstop does not stretch a string.
  - Constants:
    - `STRING_STEPS = 3`
    - `SWING_COOLDOWN_MS = 300` (today's `MELEE_COOLDOWN`, `Components.jsx:150`)
    - `STRING_WINDOW_MS = 650`: the next swing must start within this of the previous one, else step 1.
    - `BUFFER_MS = 200`: a press with ≤ 200 ms left on the cooldown is buffered.
    - `FINISHER_RECOVERY_MS = 500`
    - `FINISHER_MULT = 1.5`
    - `FINISHER_ARC_RAD = 140·π/180`
    - `FINISHER_SHOVE_MULT = 2.0`
    - `SWING_WALK_MULT = 0.6`, `SWING_WALK_MS = 120`
    - `FINISHER_WALK_MULT = 0.4`, `FINISHER_WALK_MS = 220`
  - `pressSwing(now) -> { action: 'fire' | 'buffer' | 'drop', step: 0|1|2|3 }`:
    - `'fire'` records the swing. The step is `last + 1` if `now ≤ windowEndsAt && last < 3`, else 1. Then
      `readyAt = now + (step === 3 ? FINISHER_RECOVERY_MS : SWING_COOLDOWN_MS)`, `windowEndsAt = now + STRING_WINDOW_MS`,
      and after a finisher `last = 0`.
    - `'buffer'` happens when `readyAt − now ∈ (0, BUFFER_MS]` and nothing is buffered yet.
    - `'drop'` covers everything else, including a second press while one is buffered.
  - `takeBufferedSwing(now) -> 0 | 1 | 2 | 3`. When a press is buffered and `now ≥ readyAt`, it records it as a fire
    and returns its step; otherwise 0.
  - `cancelIntoDodge(now)`: drops the buffer and the walk slow. While the window is still open (`now ≤ windowEndsAt`)
    it also restarts it (`windowEndsAt = now + STRING_WINDOW_MS`) and the step is KEPT. After the window has lapsed
    it restarts nothing: a dodge must not revive a string that already ended (without this guard, a dodge seconds
    after step 2 would make the next click a finisher).
  - `endString(now = 0)`: the next swing is step 1 and the buffer is dropped (lost input, a beast form, death). With
    `now > 0` it also sets `readyAt = max(readyAt, now + SWING_COOLDOWN_MS)`: that is the call made when a HEAVY is
    thrown (Task 9 wires it in `releaseHeavySwing`), so no light swing lands within the old 300 ms of a heavy.
    A heavy DOES need this call. The first draft argued that a hold of at least `HEAVY_HOLD_MS + HEAVY_CHARGE_MS` =
    700 ms outlasts the 650 ms window, but a buffered press breaks that: `handleMouseDown` runs `performVerb` and then
    `pressHeavy` (`Components.jsx:536-540`), so a press buffered at 150 ms starts the hold at 150, its swing fires at
    300 as step 2 and opens the window to 950, the heavy is ready at 850, and a click at 860 would be the step 3
    finisher on the mob the heavy just staggered (2× then 2.25×, 10 ms apart; today `Components.jsx:230` refuses
    that click). The inequality that would have been needed is 700 > 650 + `BUFFER_MS` = 850, which is false.
  - `peekStep(now) -> 0 | 1 | 2 | 3`: the step a press now WOULD fire or buffer as, with no side effect (0 for a press
    that would drop). The verb router reads it (Task 9).
  - `stringWalkMult(now) -> number`
  - `swingShape(step) -> { arcRad, damageMult, shoveMult, finisher }`. Steps 1-2 give `π/2, 1, 1, false`; step 3
    gives `FINISHER_ARC_RAD, FINISHER_MULT, FINISHER_SHOVE_MULT, true`.
  - `slashSweep(step) -> { dir, durationS, widthMult }`. Step 1 gives `+1, 0.2, 1`; step 2 gives `−1, 0.2, 1` (the arc
    alternates); step 3 gives `+1, 0.28, 1.5`.
  - `readString() -> { last, readyAt, windowEndsAt, buffered, lastSwingAt, lastSwingStep, cancelAt }` for the DEV
    hook and the hand. `lastSwingStep` is the step of the most recent swing fired, and stays 3 after a finisher even
    though `last` resets to 0. `cancelAt` is the `now` of the last `cancelIntoDodge` call (Task 9 case 4 judges
    against it).
  - `_resetStringForTest()`

- [x] **Step 1: Write the failing tests** (each calls `_resetStringForTest()` first):
  - `three presses 350 ms apart are steps 1, 2, 3, and the fourth starts again at 1`
  - `a press after STRING_WINDOW_MS restarts at step 1` (presses at 0, 700 give steps 1, 1)
  - `a press inside the cooldown with more than BUFFER_MS left is dropped` (0, 50 gives drop)
  - `a press with <= BUFFER_MS left is buffered and fires at readyAt as the next step` (0, 150 gives buffer; take at 299 gives 0; take at 300 gives 2)
  - `a second press while one is buffered is dropped`
  - `after a finisher the next swing waits FINISHER_RECOVERY_MS and is step 1`
  - `cancelIntoDodge keeps the step, restarts the window, drops the buffer` (presses at 0, 350, dodge at 800, press at 1200 gives step 3; without the dodge the window would have ended at 1000)
  - `cancelIntoDodge after the window has lapsed revives nothing` (presses at 0, 350, dodge at 3000, press at 3100 gives step 1)
  - `endString drops a buffered press` (Review Focus 5)
  - `a press buffered into a held heavy cannot finish on the heavy's heels`: press 0 fires step 1; press 150 buffers;
    take at 300 gives step 2; `endString(850)` (the heavy thrown); press 860 drops; press 1060 buffers and its take at
    1150 gives step 1, not 3
  - `peekStep reports the step a press would make, and changes nothing` (after presses at 0 and 350, `peekStep(700)`
    is 3 and `readString()` is unchanged; `peekStep(1100)` is 1; `peekStep(400)` is 0)
  - `walk mult: 0.6 for 120 ms after a light swing, 0.4 for 220 ms after a finisher, 1 after cancelIntoDodge`
  - `swingShape and slashSweep return the table values; the finisher's arc is wider than 120 degrees` (60° off-axis needs a full arc above 120°)
  - `SWING_COOLDOWN_MS equals the 300 ms the controller used` (a literal pin)
  - (The first draft's `a heavy's minimum hold outlasts the string window` test is deleted. It pinned 700 > 650, an
    inequality that does not carry the claim; `endString(now)` on the heavy's release carries it now.)

- [x] **Step 2: Run and verify FAIL.**
- [x] **Step 3: Implement** to the Interfaces block.
- [x] **Step 4: Run and verify PASS.**
- [x] **Step 5: Mutation receipts, each RED:**
  - S8a: the window check dropped (every third swing finishes).
  - S8b: `cancelIntoDodge` resets the step.
  - S8c: `BUFFER_MS` → 0.
  - S8d: the finisher does not reset `last`.
  - S8e: `cancelIntoDodge`'s open-window guard dropped. RED on `after the window has lapsed revives nothing`.
  - S8f: `endString(now)` ignores `now` (no cooldown after a heavy). RED on `cannot finish on the heavy's heels`.
  - S8g: `peekStep` records the press (a side effect). RED on `changes nothing`.
- [x] **Step 6: Commit** with the title "feat(combat): a three-step light string — window, buffer, finisher, cancel into dodge (pure)" and a trailer.

> **Done 2026-10-27 (`34bc39f7`).** 15 tests (the plan's 14 plus Task 10's `slashSweep alternates`), RED first. S8a-S8g
> RED, plus S8h-S8r and S8u (12 more plausible-wrong mutants), all RED; the identity mutant survived. S8s/S8t (a
> buffered press's step read at the press, not at readyAt) SURVIVED and are EQUIVALENT in every reachable state: a
> fire sets the window 650 ms past a cooldown of at most 500 ms, and only endString pushes readyAt past the window,
> which zeroes `last`. pressSwing returns shared frozen results; readString returns the live state object (the DEV
> hook copies it).

---

### Task 9: The string in the running game, with its lived proof

**Files:**
- Modify: `frontend/src/Components.jsx`
  - `:150`: `MELEE_COOLDOWN = SWING_COOLDOWN_MS`.
  - `:218-319`, `triggerMeleeAttack`: a human light swing asks the string. The cone arc and multiplier come from
    `swingShape(step)`. The finisher shove, hitstop and sound are added.
  - `:238-239`: the swing flag's timeout is `slashSweep(step).durationS × 1000` for a string swing (280 ms for the
    finisher), 200 ms otherwise, so the hand is not cut off at 0.2 s (Task 10).
  - `:485`: the verb router's `meleeHit` uses `FINISHER_ARC_RAD` when `peekStep(performance.now()) === 3` and the
    press is a human light swing, else `Math.PI / 2` as today.
  - `:546`: in `releaseHeavySwing`, `if (releaseHeavy(now, source)) { endString(now); triggerMeleeAttack({ heavy: true }); }`.
  - `:881`: the walk multiplier.
  - `:952`: `endString()` beside `cancelHeavy()` on lost input or a form.
  - `:867`: `endString()` on death.
  - `:974`: `cancelIntoDodge(performance.now())` at the dodge start.
  - In `useFrame`, after the dodge block, the buffered swing fires.
- Modify: `frontend/src/App.jsx`, adding `registerTestHook('readString', () => ({ ...readString() }))`.
- Create: `frontend/tests/e2e/melee-string.spec.js`

**Interfaces:**
- Consumes: Task 8's exports; `HITSTOP.heavy`; `store.triggerHitstop`; `store.playSpatialSound('slam', …)` (an
  existing voice, `Components.jsx:726`).
- Produces: `triggerMeleeAttack(opts?: { heavy?: boolean, bufferedStep?: 1|2|3 })`.
  - **Human light path** (`!heavy && !beastEl`): with `bufferedStep`, use it; skip the `isHeavyHeld` refusal (the
    buffered press IS that hold's tap) and skip `pressSwing`. Otherwise keep the `isHeavyHeld` refusal and call
    `pressSwing(now)`; anything but `'fire'` returns. A fired light swing still sets `lastAttackTime.current = now`,
    as today, so the heavy path's cooldown sees it. The light path does NOT also check `lastAttackTime`: a 300 ms
    check in front of `pressSwing` would refuse every press inside the cooldown before it could buffer, which deletes
    the buffer. The gap after a heavy that `Components.jsx:230` enforces today is kept by `endString(now)` on the
    heavy's release instead, which pushes `readyAt` to the heavy + 300 ms.
  - **Heavy path and beast-form path:** today's `lastAttackTime` cooldown, unchanged. The string is the human
    sword's, like the heavy (R9.2).
  - **Finisher:** `swing = Math.round(dealt × FINISHER_MULT)`, cone `FINISHER_ARC_RAD`, every hit mob's knockback ×
    `FINISHER_SHOVE_MULT`. If anything was hit, one `triggerHitstop(HITSTOP.heavy × juice)` and `'slam'` at the
    player. The riposte still stacks inside `damageMob` (`CombatSystem.jsx:40`), so a finisher on a perfectly dodged
    mob deals 2.25×. That is intended: reading a telegraph is the best answer.

- [x] **Step 1: Write the failing e2e** (`melee-string.spec.js`, desktop). Stage as in `heavy-melee.spec.js`: a frozen
  world (`triggerHitstop(60000)`), `Math.random` pinned high (no crit).
  - A **moss brute** 2.2 m dead ahead.
  - A **zombie** 2.0 m at **60° off-axis**: outside the 90° cone, inside the 140° finisher.
  - Presses go through the real window listener: `window.dispatchEvent(new MouseEvent('mousedown'|'mouseup', { button: 0 }))`,
    each stamped on the page clock by a capture listener.
  - **Timing is judged against MEASURED times, never intended ones.** Each case states the semantic interval its
    intent needs, computed from the module's own rules (fire or buffer from `readyAt − BUFFER_MS`, window to
    `+ STRING_WINDOW_MS`), and a measured gap outside it is SETUP, never a verdict. The first draft's flat ±80 ms band
    was wider than the margins of cases 3 and 4: a correct build could read as broken under load (review finding 8).
    Each design below keeps ≥ 150 ms between its intended gap and the nearest semantic edge.
  - **A buffered fire is judged by state, not by a delay.** `takeBufferedSwing` runs in `useFrame`, so on a runner
    that draws a frame every few hundred ms the fire is late by up to a frame. The spec polls `readString()` until
    `lastSwingStep` and `lastSwingAt` show the fire, with a deadline of `readyAt + max(300, 3 × median frame interval)`.

  Cases. `d(id)` is the health drop of a mob between two reads.
  1. **Finisher.** Clicks at 0, 350, 700. Semantic: click 2 − click 1 ∈ [100, 650]; click 3 − (step 2's
     `lastSwingAt`) ∈ [100, 650]. Assert:
     - brute drops `d1 === d2 > 0`, and `d3 === Math.round(d1 × FINISHER_MULT)`;
     - the zombie drops 0 after clicks 1-2 and > 0 after click 3 ("the finisher's 140 degree sweep missed the mob 60 degrees off-axis");
     - `readString().last === 0` after the finisher.
  2. **Window control.** Wait `FINISHER_RECOVERY_MS + STRING_WINDOW_MS`. Clicks at 0, 800, 1600 (semantic: each gap
     > 650): `d3 === d1`, and the zombie drops 0.
  3. **Buffer.** Wait the window out. Clicks at 0 and 200. Semantic: the gap ∈ [100, 300), a press with ≤ 200 ms of
     cooldown left. Inside the same `page.evaluate` as click 2, `readString().buffered === true`. Then, by the state
     poll above, `readString().last === 2` and the brute has dropped twice. Control: clicks at 0 and 20 (semantic:
     gap ∈ (0, 100)): `buffered === false` straight after click 2, and at the same deadline the brute has dropped once.
  4. **Cancel into dodge.** Wait the window out. Click at 0, click at 350, Shift at 600 (keydown/keyup, the
     `perfect-dodge.spec.js` way). Wait until the controller has consumed the Shift, then read the dodge start's
     time from `readString().cancelAt`, which the dodge site stamps. SETUP if `cancelAt` > click 2 + 650: the dodge
     started after the window had lapsed, because of load. Click 3 at `max(cancelAt + 400, click 2 + 700)`, so it
     lies past the undodged window and inside the dodged one by construction. Then `d3 === Math.round(d1 × FINISHER_MULT)`.
  5. **A heavy ends the string.** Wait the window out. Click at 0; at 150, a mousedown that is HELD (it buffers, its
     swing fires as step 2, and the hold starts). Release at hold start + 750 (semantic: ≥ `HEAVY_HOLD_MS +
     HEAVY_CHARGE_MS`, else SETUP); the heavy lands. Click 10 ms after the release: at the poll deadline the brute has
     taken nothing beyond the heavy, and `readString().lastSwingStep !== 3` ("a finisher landed on the heavy's
     heels"). A click 400 ms after the heavy deals `d1` (step 1).
  6. **The finisher click routes to attack.** Kill the brute; only the zombie at 60° off-axis remains. Clicks 1 and 2
     at level pitch (SETUP unless both advance `readString().last`, i.e. routed to 'attack'). Then pitch the camera
     down until the crosshair meets ground within reach, and click 3: the zombie drops > 0 ("the finisher click mined
     a block instead of sweeping the off-axis husk"). Without the router change the 90° `meleeHit` misses the zombie,
     ground is nearer than any aimed mob, and `routeMouseVerb` returns 'mine' (`verbRouter.js:40-51`).

  Header: `Mutation-Proof: OWED`.

- [ ] **Step 2: Run it to verify it fails.** Expected: FAIL at case 1, with `d3 === d1` (no finisher yet).

- [x] **Step 3: Wire it** per the Files and Interfaces blocks. In `useFrame`, right after the dodge block
  (`:1010`), add `const bs = takeBufferedSwing(performance.now()); if (bs) triggerMeleeAttack({ bufferedStep: bs });`.
  Task 5's `walkMult` at `:881` becomes `heavyWalkMult(now) * stringWalkMult(now)`, with `now` read once; it feeds
  both `speed` and `stanceVelocity`'s `walkMult`, so the swing slow survives the clamp. The swing slow applies out of
  combat too, as the heavy's charge slow does today: Task 12 records it as a decision.

- [ ] **Step 4: Run it to verify it passes,** then `npm run test:unit` (the existing heavy-melee and perfect-dodge
  gates must stay green), then `npm run lint`.

- [ ] **Step 5: Mutation batch** (`mutate-e2e.sh`):

  | label | subject | mutation | catch |
  |---|---|---|---|
  | S1 | `src/Components.jsx` | `swingShape(step)` → `swingShape(1)` (the string never reaches the finisher) | case 1 ratio |
  | S2 | `src/game/meleeString.js` | the window check dropped | case 2 control |
  | S3 | `src/Components.jsx` | the cone arc fixed at `Math.PI / 2` | case 1 off-axis zombie |
  | S4 | `src/Components.jsx` | `cancelIntoDodge` → `endString` at the dodge start (plausible-wrong) | case 4 |
  | S5 | `src/Components.jsx` | the `takeBufferedSwing` line removed | case 3 |
  | S6 | `src/Components.jsx` | `endString(now)` removed from `releaseHeavySwing` | case 5 |
  | S7 | `src/Components.jsx` | the router's `meleeHit` arc fixed at `Math.PI / 2` | case 6 |
  | S0 | `src/game/meleeString.js` | a comment edit (`--identity`) | must SURVIVE |

  Also re-run `tests/e2e/heavy-melee.spec.js` and `tests/e2e/perfect-dodge.spec.js` unmutated on this branch. Both
  must stay green: the light swing's path changed under them.

- [x] **Step 6: Commit** with the title "feat(combat): the light string in play — the third hit sweeps 140 degrees for 1.5x with a heavy-tier hitstop; a dodge keeps it alive" and a trailer.

> **Done 2026-10-27, with its e2e OWED (`e05e1a30`).** Deviations: `releaseHeavySwing` no longer throws the heavy
> itself (since the touch-hold lane it is `input/primaryInput.js` releasePrimary -> throwHeavy -> triggerMeleeAttack
> `{ heavy: true }`), so `endString(now)` sits in triggerMeleeAttack's heavy branch, which every thrown heavy passes;
> S6 is "that line removed". Case 4 stamps the dodge start from the 'swing' sound the dodge site plays, because S4
> would never stamp `cancelAt`. Case 5 judges by `lastSwingStep`, not damage, because the heavy's stagger holds in a
> frozen world and the riposte multiplies the next hit. **Steps 2, 4 (the e2e half) and 5 are OWED**: no e2e ran (load
> above 115). That covers the red-first run, the green run, S0-S7, and the unmutated heavy-melee and perfect-dodge
> re-runs. Unit: the 25 gate files that read Components.jsx (213 tests) and the full suite are green. Read from the code,
> not observed: touch-hold's and heavy-melee's measured presses stay at steps 1-2.

---

### Task 10: The finisher reads in the hand

**Files:** Modify `frontend/src/render/playerRender.jsx:335-360`.

**Interfaces:** Consumes `readString()` and `slashSweep(step)` (Task 8), read transiently inside the existing `useFrame`.

- [x] **Step 1: Write the failing test.** In `meleeString.test.js`: `slashSweep alternates dir for steps 1 and 2 and
  widens the finisher` (already in Task 8). The hand's wiring has no unit seam. Its proof is a by-eye frame-step in a
  dev session, stated in the commit, and it is NOT claimed as e2e-proven. A swing never appears in the 31 capture
  frames (capture runs no input).

- [x] **Step 2: Implement.**
  - Read `const s = readString()` once. The swing in progress is a STRING swing only when
    `performance.now() − s.lastSwingAt ≤ 1000 × slashSweep(s.lastSwingStep).durationS`; then
    `sw = slashSweep(s.lastSwingStep)`. Otherwise (a heavy, a beast-form swing, or no recent light swing)
    `sw = slashSweep(1)`, today's right-to-left 0.2 s sweep. A heavy lands at least 500 ms after any light swing it
    follows (its hold is ≥ 700 ms from a press whose buffered fire is ≤ 200 ms after it), so a heavy never inherits
    step 2's left-to-right sweep, which reading `lastSwingStep` alone would have given it.
  - `isSwingingMelee` uses `sw.durationS` instead of `0.2`.
  - The sweep term `- ease * 0.72` becomes `- ease * 0.72 * sw.dir * sw.widthMult`, and the roll term is mirrored by
    `sw.dir`.
  - `attackType` is React state that `triggerMeleeAttack` clears with a fixed `setTimeout(..., 200)`
    (`Components.jsx:238-239`), so on its own it would cut the finisher's 0.28 s sweep at 0.2 s (71% of its arc).
    Task 9 derives that timeout from `slashSweep(step).durationS` for string swings. No new React state:
    `attackType` stays the swing-rate signal it is today, only held 80 ms longer for a finisher.

- [ ] **Step 3: Verify.** Run `npm run test:unit && npm run lint && npm run build`. Then, in a dev session, three
  swings must show right-to-left, left-to-right, then a wide sweep. Record "by eye, dev, <date>" in the commit body.

- [x] **Step 4: Commit** with the title "feat(fpv): the string reads — the arc alternates and the finisher sweeps wide".

> **Done 2026-10-27 (`49513058`), NOT checked by eye.** The yaw term and the slash crescent are mirrored by `sw.dir`
> too, and the crescent runs over `sw.durationS`. **Step 3's by-eye frame-step is OWED** to the command session or
> Kevin: this lane has no browser for it, and the load ruled out a dev session. The unit suite, lint and build are green.

---

### Task 11: Performable on iPad (touch proofs)

**Files:** Create `frontend/tests/e2e/combat-touch.spec.js`.

**Interfaces:**
- Consumes:
  - Phase 0c's held action button. A touch press calls `store.pressPrimary(0, 'touch')`, which reaches
    `triggerMeleeAttack`, so the string needs no touch-specific code.
  - The joystick, which writes the same boolean intents as WASD (`input/touchMath.js:18`, 8-way). That is why no
    analog magnitude mapping exists or is needed: the stance clamps the resulting vector the same way.
  - The CDP touch helpers and `aimAt` hit-test of `tests/e2e/touch-hold.spec.js` (copy the two helpers; do not
    import a spec).

- [x] **Step 1: Write the spec** with `devices['iPad Pro 11 landscape']`, `deviceScaleFactor: 1` and chromium, as the
  touch-hold spec does. Its header says this is not WebKit; real Safari is Kevin's device.
  1. **Joystick backpedal is caught.** Same staging as Task 5. CDP `touchStart` at (15% w, 70% h), then `touchMove`
     60 px down (moveB), held. A zombie 5 m ahead: `readStance().w === 1`, the `readMoveTarget()` away component is
     ≤ 2.0 + 1e-6 on every `w === 1` frame (direction and cap built as in Task 5), and, at ≥ 4 fps, the gap closes to
     ≤ 2.6 m within 8 s.
  1b. **Joystick forward with the threat behind.** A zombie 5 m BEHIND the camera, the stick pushed 60 px UP (moveF):
     the same assertions. As on desktop, a down-stick against a threat ahead cannot tell the away-from-threat clamp
     from a camera-backward or a moveB-gated one (review finding 1).
  2. **Three taps make a finisher.** Same staging as Task 9, case 1. Each tap is `aimAt('touch-action')`, then
     `touchStart`/`touchEnd`, at 0, 350 and 700 ms on the page clock: `d3 === Math.round(d1 × FINISHER_MULT)` and the
     off-axis zombie is hit only by the third.
  3. **Chevrons clear every touch control,** in landscape and then portrait (`page.setViewportSize({ width: 834, height: 1194 })`).
     Freeze the world. For 8 bearings (0°, 45°, …, 315°) **outside the frustum**, spawn a zombie 2 m at that bearing
     and plant a windup. Bearings inside the view are skipped and counted; the spec prints `checked N/8`, and N must
     be ≥ 5. The chevron that turns on must not overlap any `[data-touch-btn]` rect, the tray openers included (open
     the tray first), and must lie inside the viewport.

  Header: `Mutation-Proof: OWED`.

  **WebKit, by eye (local only).** Kevin's report is about WebKit on iPad, and this spec runs Chromium emulation. The
  repo's WebKit instrument, `scripts/visual/ipad-probe.mjs`, serves the PRODUCTION bundle, where the DEV bridge (and
  so `plantWindup`) does not exist, so it cannot stage a windup. Instead, case 3 also runs in a `test.describe` with
  `browserName: 'webkit'`, tagged `@local-only` (excluded in CI), in the command session, which already has
  Playwright's WebKit for the probe. It saves one screenshot per orientation with a planted windup behind the
  player, and those frames are opened by eye and recorded in the commit body. A WebKit run on macOS is not iPadOS
  (the probe's own blind-spot note), and it runs the DEV server; the chevron is DOM, so the dev/prod difference does
  not touch its layout.

- [ ] **Step 2: Run** (in the command session or CI). Expected: PASS once Tasks 5, 7 and 9 have landed. Before then
  it fails at the first case, which is the red-first check for this task.

- [ ] **Step 3: Mutation batch:**

  | label | subject | mutation | catch |
  |---|---|---|---|
  | U1 | `src/game/windupChevrons.js` | `touchBottomInsetPx` returns 0 | case 3, an overlap with the action or jump button |
  | U2 | `src/Components.jsx` | the string advanced in `handleMouseDown` instead of `triggerMeleeAttack` (plausible-wrong: desktop-only) | case 2 |
  | U3 | `src/game/windupChevrons.js` | `SIDE_INSET_PX = 8` | case 3, portrait, the tray column |
  | U4 | `src/Components.jsx` | `stanceVelocity` called only when `input.moveB` | case 1b |
  | U0 | `src/game/windupChevrons.js` | a comment edit (`--identity`) | must SURVIVE |

- [x] **Step 4: Commit** with the title "test(e2e): close-quarters combat on an emulated iPad — joystick backpedal, three-tap finisher, chevrons clear of every control" and a trailer.

> **Done 2026-10-27, run OWED (`c2c93ec1`).** The WebKit look is its own file, `tests/e2e/combat-touch-webkit.spec.js`
> (@local-only), because Playwright refuses `browserName` inside a describe group. U2 is rewritten: the plan's
> handleMouseDown no longer exists (mouse and touch share pressPrimary), so a desktop-only string is the light-path
> guard gaining `&& !navigator.maxTouchPoints`. On touch only the target is judged, not the chase. **Steps 2 and 3 are
> OWED**: no run, no U0-U4 batch, no WebKit frames (load above 115). Both headers say `Mutation-Proof: OWED`.

---

### Task 12: Verification gates and records

- [ ] **Step 1: The local pipeline.** Run `cd <repo>/.claude/worktrees/combat-stance && bash ci/pipeline.sh --tier=push`
  (the pre-push tier, `ci/pipeline.sh:16`).
  Expected: all 14 pre-push gates green. `killability-ledger` must not rise, so every new check file carries its
  receipt. `gate-shape` must not rise, since no source-grep was added.

- [x] **Step 2: The suite and lint.** Run `npm run test:unit && npm run lint`. Expected: green, with the total equal
  to the pre-milestone total plus the new tests (state both numbers in the commit).

- [x] **Step 3: Bytes.** Run `npm run build && node scripts/ci/bundle-budget.mjs && ls -l build/assets/index-*.js`.
  Expected: `bundle-budget` green, and the index delta vs `BASELINE_INDEX_BYTES` (Task 0) ≤ **+9,000 B**, this
  lane's share (Global Constraints). The estimate is +6 to +9 KB raw: three pure modules of about 1.5-2.5 KB minified
  each, one DOM component of about 2 KB, and the call sites. Record the measured delta in the CHANGELOG, together
  with the ABSOLUTE `index` size on a build of this branch rebased on current `main` and the headroom it leaves, so
  the programme byte ledger can be checked against the lanes that land after. If it is over, move `WindupChevrons`
  behind a `React.lazy` boundary first; never raise the ceiling.

  **`BASELINE_INDEX_BYTES = 719,428`** (Task 0 Step 2, measured 2026-10-27 on `f78644b9`, i.e. `main` `a8ce0dd1` plus
  `feat/steady-cool` and `feat/touch-hold`: `build/assets/index-BCztZMl7.js`; `bundle-budget` printed
  `index: 702.6KB / 742.2KB`). The headroom under the 760,000 B ceiling is therefore **40,572 B**, not the 63,076 B
  the Global Constraints computed from the 696,924 B build: the two Phase 0 branches this lane sits on already spend
  about 22.5 KB of it. That is a fact for the command session's programme byte ledger (Review amendments, finding 16).

- [ ] **Step 4: GPU and frame cost, stated and spot-checked.** Added GPU cost is zero: no light, shader, draw call
  or render target.

  The CPU cost per frame:
  - the stance scan, O(mobs), about 40 entities at the spawn cap: `SpawnerSystem`;
  - the chevron scan, O(mobs) plus ≤ 4 `Vector3.project`;
  - DOM writes only on change.

  Spot-check in a dev session with a 30 s `requestAnimationFrame` frame-time sample from the console, standing in a
  6-mob fight: the frame time p50 does not move by more than 0.3 ms against the same scene with the stance and
  chevrons stubbed out. Record the numbers, or record "not measured" — never "no cost".

  In the same dev session, two feel measurements:
  - **Night travel under the stance** (refute F1:13). Walk 3 minutes across hostile ground at night, sampling
    `readStance().w` every frame, and record the fraction of travel time with w > 0, and how many of those engaged
    spans ended by `STALL_MS` (a mob that could not reach you). If the fraction is high enough that night travel reads
    as "always slow", that is a DECISIONS question for the loop, not a silent retune.
  - **The combat zoom.** Engage mid-run and watch the FOV narrow from about 88.5° to about 77.7°. Record whether it
    reads as intended or as a jolt; on a jolt, apply the named fallback (the FOV term reads the pre-clamp speed while
    w > 0) as a new commit.

- [ ] **Step 5: e2e on CI.** Push `feat/combat-stance` and run `gh workflow run ci.yml --ref feat/combat-stance`.
  Expected: every e2e shard is green, including the four new specs. All mutation batches (Tasks 5, 7, 9, 11) have
  observed verdicts written into each spec header, OWED replaced. Record the median frame interval each new spec
  logged on CI (Task 5 Step 0), and say which chase sub-assertions ran and which reported SETUP.

  `killability-ledger` counts any file containing `Mutation-Proof:` as receipted (`killability-ledger.mjs:50,94`),
  so a header still reading `Mutation-Proof: OWED` passes it. It has to: the push that fetches the CI verdict runs
  that gate. So the merge check is separate. Run `git grep -n "Mutation-Proof: OWED" feat/combat-stance --
  frontend/tests` and expect NO output; any line it prints blocks Step 8.

- [ ] **Step 6: Review.**
  - A fresh headless `/code-review xhigh` on `main..feat/combat-stance`.
  - One `adversarial-reviewer-kz` at effort xhigh, as a Workflow stage with `model: 'claude-opus-5-5'`, briefed to
    REFUTE four claims:
    1. "a radial clamp keeps every pursuer closing, whatever key or stick direction produced the motion";
    2. "no per-frame React state was added";
    3. "at stance weight 0 the controller's movement target equals `moveVector`'s exactly; the string's swing slow is
       the only out-of-combat movement change";
    4. "a mob that cannot reach the player releases the stance within `STALL_MS + CALM_MS`".
  - Fix rounds are new commits.

- [x] **Step 7: Records.**
  - **DECISIONS.md:** a `[LOOP]` entry for the stance constants and the decisions an encounter or boss tuner will
    balance against:
    - retreat 2.0 / strafe 6.5 / advance 6.5, derived; strafe and advance scale with the form's `moveMult`, and all
      three with the walk slows;
    - engage 12 m and the mob's own vertical reach, a stall release after 1.5 s without its own progress, calm 2 s;
    - the moss-brute and skeleton exceptions (the skeleton never engages the stance);
    - the boss and the dragon are NOT in the stance: it scans `mobsQuery.entities`, and the boss is not an ECS mob
      (`Components.jsx:285-287`). A dragon fight with no adds keeps the 14 m/s walk;
    - the combat zoom (FOV about 88.5° to about 77.7° on engaging mid-run), and Task 12's by-eye verdict on it;
    - the swing slow applies out of combat, as the heavy's charge slow does;
    - the night-travel fraction with w > 0 (Step 4), stated against refute F1:13;
    - the string's numbers, and that a heavy ends the string with a 300 ms cooldown;
    - "the string is the human sword's, not a form's";
    - Kevin's 14 m/s kept for travel.

    Cite only paths that exist (`doc-currency`).
  - **The rest:** a `memory/CHANGELOG.md` entry with the measured bytes, an ACTIVE_PLAN cursor update, and a
    one-line FYI for Kevin in `docs/superpowers/KEVIN-REVIEW-BATCH.md` (constants, not a question).
  - **Tell the dragon lane.** `2026-10-27-crafty-shadow-dragon.md` plans to "re-tune after move 5 lands" because
    "move 5's combat stance changes" its fight. It does not, unless ECS adds are within 12 m. Send the command session
    one line saying so; whether the dragon joins the stance (through its own `withBossTarget`-style seam and a
    pursuit speed for a flier) is that lane's decision.

- [ ] **Step 8: PR and merge** on the session's own gates (DECISIONS 2026-10-27 mandate). REFUSE to merge while
  Task 7 or Task 11 is held (Task 0): the stance without its chevrons, or without any touch proof, is a broken
  intermediate. REFUSE while the Step 5 `OWED` grep prints anything. Report the PR number so Kevin can run
  `/code-review ultra <PR#>`.

> **Task 12 as run, 2026-10-28, by the authoring lane** (which may not push, open a PR or edit the main checkout):
> - **Step 1 RUN, RED on two range gates that are not this lane's code** (`bash ci/pipeline.sh --tier=push` at
>   `f3e6bb49`). 12 of 14 green: the offline core (4084 tests, the build, bundle-budget, killability-ledger and
>   gate-shape not rising) and queue-ledger. Red (1): `artifact-currency`, because the three published pages are 75
>   commits behind (`1a1bee68`). Main scoped that cap to main-moving pushes in `d5375ac1`, which this branch does not
>   carry. Red (2): `e2e-freshness`, because the push BASE's e2e is RED on CI. main `43d766e6`, run 40642071917, shard
>   7/8 failed three times at `touch-hold.spec.js:303`: "SETUP: the world freeze ran out by the late press". And this
>   tree has no green e2e receipt. The trailer gates the hook runs pass over `81d0ab89..HEAD`.
> - **Step 2 DONE.** 4014 unit tests before the milestone, 4084 after (+70: combatStance 31, meleeString 15,
>   windupChevrons 11, windup-chevrons-gates 8, stance-pursuit-gates 3, mobMovement 1, mobSenses +1), all green; lint
>   clean; knip clean.
> - **Step 3 DONE, with the plan's remedy.** The first build of the finished lane measured index 728,452 B, **+9,024 B**:
>   24 B over the share. So `WindupChevrons` moved behind a `React.lazy` boundary (`d0f67eed`). After that the index is
>   **725,739 B, +6,311 B**, with `WindupChevrons-*.js` at 3,174 B; bundle-budget PASSED. Headroom on this branch is
>   34,261 B. The absolute size on a build rebased on current `main` was NOT measured: this lane may not rebase, and
>   main was 33 commits ahead.
> - **Step 4 STATED, NOT SPOT-CHECKED.** Added GPU cost is zero by construction: no light, shader, draw call or render
>   target; the chevrons are four DOM nodes writing transform and opacity. The 30 s frame-time p50 A/B, the night-travel
>   fraction and the combat-zoom verdict were **not measured**. They need a dev session the machine's load ruled out.
> - **Step 5 NOT RUN** (no push from this lane). `git grep -n "Mutation-Proof: OWED" HEAD -- frontend/tests` prints the
>   four new specs, so Step 8 is blocked.
> - **Step 6 NOT RUN.** A review from the authoring context would be a self-review. The fresh `/code-review xhigh` on
>   `main..feat/combat-stance` and the adversarial reviewer on the controller seam (Tasks 5 and 9) are the command
>   session's.
> - **Step 7 DONE**: `DECISIONS.md`, `memory/CHANGELOG.md`, the ACTIVE_PLAN row T18 and a `KEVIN-REVIEW-BATCH.md` FYI.
>   The dragon-lane note goes to the command session in the lane's report.
> - **Step 8 REFUSED, as the plan requires**: the OWED grep prints lines, CI has not run, and the reviews have not run.
>   Tasks 7 and 11 are not held, since both preconditions were met in Task 0.

---

## Out of scope (named, so their absence is a decision and not an omission)

These are the roadmap move-5 levers not taken, and why:
- **The cone trim from 4.5 to 3.2 m.** It changes `verbRouter`'s `meleeHit` and every verb's reach.
- **Hounds and skitterlings at about 6 m/s, and a per-archetype `windupMs` passed through `attackPhase`.** These are
  roster balance for a young player.
- **Spatial windup voices.** They belong to Phase 2 sound.
- **The +4° FOV kick.** It is redundant (F1).
- **The string in beast forms.** v1 is the human sword's, matching the heavy.
- **The boss's windups.** `BossEntity` keeps its own timers; that is Phase 3, the dragon.
- **The boss in the stance.** `stanceStep` scans `mobsQuery.entities`, and the boss is not an ECS mob
  (`Components.jsx:285-287`), so a boss or dragon fight with no adds keeps the 14 m/s walk. A flying, orbiting boss
  has no pursuit speed in this derivation, and putting it in would re-balance the climax the dragon lane is tuning.
  Recorded in DECISIONS, and the dragon lane is told (Task 12 Step 7).

Each can follow as its own milestone once this one has been played.

---

## Review amendments (2026-10-27)

The adversarial review returned "REFUTED IN PART": the arithmetic held (husk 3.0, spider 6.0, brute charge 5.4; the
radial bound against a mob steering straight at the player), and 17 findings. Each was re-verified against the live
code on `main` at `f0e84766` before anything changed. Tally: **17 applied, 0 rejected**; findings 2, 9, 14, 15 and 16
were applied in an adapted form, with the reason given below.

1. **HIGH: the e2e could not see the away-from-threat change.** Applied. Re-verified from the plan text: every
   desktop and touch chase case held S, or the stick down, with the husk dead ahead, so a camera-backward away vector
   or a `moveB`-gated call passed all of them. Task 5 gains case 2b (threat behind, W held) and case 2c (a pure D
   strafe), Task 11 gains case 1b (stick up, threat behind), and the batches gain T6, T7 and U4. While re-verifying I
   found two more ways the yardstick could move with the subject, and closed both: the spec rebuilds the away
   direction from the raw positions the frame used (`readStance().threatX/Z`, `playerX/Z`), never from
   `readStance().awayX/Z`, which mutant T5 negates too; and the caps in every e2e assertion are literals (2.0, 6.5),
   never `STANCE_CAPS`, which mutant T2 moves.
2. **MED: a buffered press could finish on a heavy's heels.** Applied, adapted. The scenario reproduces against
   `Components.jsx:536-540` (`performVerb`, then `pressHeavy`) and `:230`; the needed inequality, 700 > 850, is
   false. `endString(now)` is now called when `releaseHeavy` throws (Components `:546`), and it pushes `readyAt` to the
   heavy + 300 ms. The reviewer's other half, "keep the `lastAttackTime` check on the light path", is NOT taken as
   written: a 300 ms check in front of `pressSwing` refuses every press inside the cooldown before it can buffer, so
   it would delete the buffer. `endString(now)` restores the same post-heavy gap through the string's own cooldown.
   The 700 > 650 test is deleted. Task 8 gains the pure case, Task 9 gains e2e case 5, and the batches gain S8f and
   S6.
3. **MED: the skeleton pinned a walking player.** Applied. Re-verified: `ARCHERY_RANGE = 12` (`ai.worker.js:59`) and
   the close-in branch at `:207-211` (3.75 m/s) equal `ENGAGE_RADIUS_M`. `stanceStep` now skips `NON_PURSUERS`, the
   derivation text and the table row say the skeleton closes beyond 12 m, and the batch gains test S4e.
4. **MED: "engaged" had no reachability.** Applied. Re-verified: aggro is distance-only (`ai.worker.js:128`), the
   pack alert spreads it within 12 m (`:67-82`), and `STEP_UP = 1.25` (`localPath.js:39`). No main-thread path or
   line-of-sight query exists, and the worker's update payload has no "unreachable" field (`:354-357`). So
   engagement uses the mob's own vertical reach (`engageDyM`) plus a stall release: a mob outside melee reach with
   less than 0.5 m of its own progress in 1.5 s stops qualifying. The night-travel fraction with w > 0 is measured
   in Task 12 and stated against F1:13. Test mutants S4f and S4g are added. **Named gap:** no e2e stages a stranded
   mob; the stall rule is unit-proven only.
5. **MED: absolute caps erased form pace and the walk slows.** Applied. Re-verified: golem 14 × 0.6 = 8.4, heavy
   14 × 0.55 = 7.7, swing 14 × 0.6 = 8.4, all above 6.5. `stanceVelocity` gains `formMult` and `walkMult`. The
   caps scale with them, and the retreat cap scales with the walk slows only. A clamp is positively homogeneous, so
   this equals "apply the walk slow after the clamp" and keeps the w = 0 path exactly today's. The false "a comet
   strafes faster" claim is corrected. Lower-bound tests and test mutants S3d and S3e are added.
6. **MED: "w = 0 is the identity" was not checked at the controller.** Applied. The 12 m/s threshold tolerated the
   w-floor mutant (12.8). The new `readMoveTarget` DEV hook records the controller's raw and final targets, case 3
   asserts they are equal on every frame, and T8 (the w floor) and T9 (×0.9) are added. The swing slow out of combat
   is recorded as a decision rather than hidden. Review claim 3 is reworded to match.
7. **MED: K1's receipt was inverted.** Applied. Re-verified: the gate's expected value was computed from
   `chaseSpeedMult`, so K1 moved both sides, and `mutate.sh:89-91` would print SURVIVED. The gate now asserts
   literals (0.3, 0.6).
8. **MED: the ±80 ms band was wider than the case margins.** Applied, and redesigned rather than narrowed. Verdicts
   are judged against measured gaps and each case's semantic interval. Buffered fires are judged by `readString()`
   state, with a deadline set by the frame interval. Case 3 now buffers at 200 ms with a control at 20 ms, and
   `buffered` is read in the same evaluate as the click. Case 4 now judges against the dodge's own stamped start
   (`cancelAt`), so a dodge consumed late under load is SETUP and not a false verdict. While re-verifying case 4, I
   found that `cancelIntoDodge` as specified would revive a string whose window had already lapsed (a dodge seconds
   after step 2 made the next click a finisher). It now restarts the window only while the window is open (test
   S8e).
9. **MED: the boss never engages the stance.** Applied, as the "name the exclusion" option. Re-verified at
   `Components.jsx:285-287` and in the dragon plan (`:64-65`, `:909-910`). A flying, orbiting boss has no pursuit
   speed in this derivation, so the exclusion is named in Out of scope and in DECISIONS, and Task 12 tells the dragon
   lane, whose "re-tune after move 5" assumption it changes. Feeding the boss in through a `withBossTarget`-style seam
   is left to that lane.
10. **MED: the lived proofs may not run on CI, and OWED counts as a receipt.** Applied. Re-verified: `RECEIPT_TOKEN =
    'Mutation-Proof:'` and `src.includes` (`killability-ledger.mjs:50,94`). The spec logs its median frame interval
    (Task 5 Step 0). The verdict-carrying target assertions do not depend on frame rate; only the chase
    sub-assertions SETUP below 4 fps. A `git grep "Mutation-Proof: OWED"` merge check is added (Task 12 Steps 5 and
    8). OWED stays readable as a receipt on purpose, because the push that fetches the CI verdict runs the ledger.
11. **LOW: the finisher's sweep was cut at 0.2 s.** Applied. Re-verified at `Components.jsx:238-239` and
    `playerRender.jsx:335`. The timeout now derives from `slashSweep(step).durationS`. The hand uses the string sweep
    only while `lastSwingAt` is within the sweep's duration, so heavies keep today's sweep.
12. **LOW: the finisher click could route to 'mine'.** Applied. Re-verified at `Components.jsx:485` and
    `verbRouter.js:40-51`. The new pure `peekStep(now)` widens the router's `meleeHit` arc to `FINISHER_ARC_RAD` when
    the press would be a finisher. Task 9 gains e2e case 6 and mutant S7, and Task 8 gains test mutant S8g.
13. **LOW: the compass overlap check could not fail.** Applied. Re-verified: the compass wrapper is
    `pointer-events-none` (`HUD.jsx:500`), `:505` is the marker track, and the frame is at `:501`. Overlap is now a
    `getBoundingClientRect` intersection, the testid moves to `:501`, case 4 (top-centre, pitched up) is added, and
    so is mutant C6. The `elementsFromPoint` repro probe was not run: the rect test is correct whichever way Chromium
    hit-tests.
14. **LOW: the stance narrows the FOV by about 11°.** Applied, adapted: stated as an intended "combat zoom" instead of
    being suppressed. Re-verified: `targetFov = 75 + (horizontalSpeed − 5) × 1.5` gives 88.5° at 14 m/s and about
    77.7° at 6.8 m/s. The false "no FOV change" wording is corrected, the decision is recorded, Task 12 adds a by-eye
    check, and the pre-clamp-speed fallback is named.
15. **LOW: a broken intermediate could merge, and there was no WebKit look.** Applied, adapted. Task 12 Step 8
    refuses to merge while Task 7 or 11 is held. The reviewer's `ipad-probe.mjs` frame cannot stage a windup: the
    probe serves the production bundle, where the DEV bridge and `plantWindup` do not exist (`ipad-probe.mjs:24`,
    `:117`). So chevron case 3 also runs locally under Playwright WebKit (`@local-only`, which CI excludes,
    `ci.yml:113`), at both orientations, with frames opened by eye.
16. **LOW: the lane allowances overrun the shared headroom.** Applied to this file. Re-verified from the sibling
    plans: combat 10,000, light 10,000, coast 8,000, first-minute 6,000, material 8,000, sound 3,000, encounters
    14,000 and relight about 8,600 make about 67,600 B against 63,076 B, and the umbrella plan (`:107-108`) keeps no
    ledger. This lane's share drops to its estimate's top, +9,000 B, and Task 12 records the absolute `index` size
    after rebasing on `main`. **Owed by the command session, outside this file:** one programme byte ledger whose
    lane shares sum to within the headroom.
17. **LOW: S2b's stated mechanism was false.** Applied. Re-verified: the skeleton's formula speed is 3.75, above the
    husk's 3.0. The receipt now names the real kills: the pursuer count, and `closingOver` throwing "empty
    denominator" on a skeleton that never moved, a throw added so that a NaN mean cannot pass as a measurement. S2d
    (the `RETREAT_FLOOR` throw removed) is the mutant that actually exercises a slower pursuer.
