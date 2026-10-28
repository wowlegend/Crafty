# Touch Plays the Signature (Phase 0c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a touch device the Wildheart roar and the heavy melee can be performed (press-and-hold with a radial
charge fill), a tap still does exactly what it does today, and a new player can see the roar and reach its unlock.

**Architecture:** One pure module (`src/input/touchHold.js`) owns the hold semantics (a held intent with a minimum
pulse, and the charge fraction a fill draws). `TouchControls.jsx` binds it to the roar sector and binds the action
button to a source-agnostic press/release pair that `Components.jsx` publishes to the store beside `performVerb`.
`TouchControlsSurface.jsx` draws the fills from the TRUE charge state (the transform SM's `beastCharging` store flag
and `heavyAttack`'s module state) in its existing rAF tick. The ring stops hiding locked Aspects; a locked sector
opens the Talents panel, which App owns.

**Tech Stack:** React 19 DOM pointer events, zustand 5 (transient `getState()` reads only), vitest 4 + jsdom 29 +
@testing-library/react 16, Playwright 1.64.1 (Chromium, CDP `Input.dispatchTouchEvent`).

**Spec:** the umbrella `docs/superpowers/plans/2026-10-27-crafty-masterpiece.md` (Phase 0 row 0c) and its design
inputs in `docs/superpowers/masterpiece-2026-10/`: roadmap move 3 (`roadmap-2026-10-27.json`, rank 3) and the
refute's F9 plus its move-3 verdict (`refute-2026-10-27.md`), which are binding.

## Goal frame (GF-L1 to GF-L4)

- **Goal (GF-L1).** An iPad player, starting from a fresh profile, can perform the beast form and the heavy with
  touch alone. Measurable: a held roar sector commits `beastFormActive`; a held action button throws a heavy worth
  `HEAVY_MULT` x the tap; a 120 ms tap of either does what it does today.
- **Attack (GF-L2).** Achieved perfectly, what breaks? (a) A held intent that sticks when the pointer is lost (the
  next press then has no rising edge and is eaten). (b) The light attack delayed until release. (c) The lived proof
  sets `unlockedTalents` directly, so it passes while a real touch player can never unlock the roar (see F9 below:
  that is the actual state of the code). (d) A fill that animates while the state machine refused the charge (no
  Ferocity bank). (e) A desktop regression through the Components refactor of the mouse press. (f) The always-shown
  ring changes the `mobile.png` oracle.
- **Metric (GF-L3).** Lived: `tests/e2e/touch-hold.spec.js` (below). Unit: the touch layer writes the right intent /
  calls the right seam on EVERY pointer event, including cancel, lost capture, leave and deactivation. PASS-but-wrong
  sample: a roar intent latched forever passes the hold, so the 120 ms tap CONTROL must not transform. FAIL-but-right
  sample: on a 3-5 fps CI renderer a fixed 600 ms hold may see no frame past 0.45 s, so the hold is "at least 600 ms,
  then until the form commits (cap 20 s)", the held time is reported, and frame starvation is a SETUP failure.
- **Strategy (GF-L4).** Derived from the metric: real Chromium touch input (the same CDP call Playwright's own
  `touchscreen.tap` makes) at a hit-tested point, presence asserted before every absence, the heavy measured by
  `tests/e2e/heavy-melee.spec.js`'s method (frozen world, pinned crit roll, an in-page timed half-charge control).

## Read-Before-Architect check

I have read `src/ui/TouchControls.jsx`, `src/ui/TouchControlsSurface.jsx`, `src/input/aspectWheel.js`,
`src/input/touchDevice.js`, `src/game/beastTransform.js`, `src/game/heavyAttack.js`, `src/Components.jsx:370-675`,
`src/InputManager.jsx`, `src/MenuSystem.jsx:40-100`, `src/ui/touchTray.js`, the ring/heavy/touch gates and
`tests/e2e/heavy-melee.spec.js`. They cover the touch overlay, the Aspect intents, the transform and heavy state
machines and the panel plumbing. My proposal extends them by one pure module (`src/input/touchHold.js`), two store
seams beside `performVerb` (`pressPrimary`, `releasePrimary`), two TouchControls props from App (`talentsOpen`,
`onOpenTalents`) and one pure panel helper in `touchTray.js`.

## What the code does today (verified by reading, 2026-10-27, base `0c5b269c`)

- **The roar cannot be performed on touch.** A ring sector pulses its intent on `pointerup` for `TAP_HOLD_MS`
  (`src/ui/TouchControls.jsx:244-249`; `src/input/aspectWheel.js:43`, 120 ms). The roar's charge needs the intent held
  for `ANTICIPATION_SEC` = 0.45 s (`src/game/beastTransform.js:13`) and cancels the frame it drops
  (`beastTransform.js:54`). 120 ms < 450 ms, so a touch roar always cancels.
- **The heavy cannot be performed on touch.** The action button calls `performVerb(0)` on `pointerup`
  (`TouchControls.jsx:189-192`). The charge is pressed only by the real mouse (`src/Components.jsx:531-540`, whose
  comment says so) and the T key (`Components.jsx:420-425`); `releaseHeavySwing(source)` (`Components.jsx:543-547`)
  has no touch caller.
- **A new player sees no Aspect at all (F9), and a touch player can never unlock one.** The ring opener renders only
  when `unlockedAspectVerbs(...)` is non-empty (`TouchControls.jsx:236`), by design (`aspectWheel.js:45-58`, "GATED, NOT
  GREYED"). The Talents panel, where every Aspect is unlocked, opens only from `KeyU` (`src/InputManager.jsx:227-243`)
  and a DEV test hook (`src/App.jsx:908`); the touch tray offers inventory, craft, build and magic
  (`src/ui/touchTray.js:10-15`). So on a touch-only device `unlockedTalents` can never gain a rank and the ring never
  appears. The desktop answers a locked verb key with a notice, "WILDHEART not yet unlocked — open Talents (U)"
  (`Components.jsx:391-394`, `src/game/deniedReason.js:9-10`): it lets the verb through and teaches the unlock.
- **Charge state is already observable without new per-frame state.** The transform SM's `startCharge` / `enter` /
  `cancel` set the store's transition flag `beastCharging` (`Components.jsx:648,666,671`); `heavyChargeLevel(now)`
  (`heavyAttack.js:45-49`) is the heavy's charge as module state. The surface already runs one rAF tick on touch only
  (`TouchControlsSurface.jsx:62-82`).
- **Safety nets that exist:** the frame loop cancels a heavy when input is not live or a form is active
  (`Components.jsx:952`) and on death (`:867`).

## Decision: F9, the ring shows every Aspect, a locked one opens Talents

**Decision.** The Aspect ring opener is always offered while touch play is live, and all four sectors are drawn. A
locked sector is dimmed and carries a lock glyph and an i18n'd accessible name; tapping it writes NO intent and opens
the Talents panel (closing the other panels, yielding touch focus exactly as the tray openers do). This reverses
`aspectWheel.js`'s "GATED, NOT GREYED" for touch, and the docblock there is rewritten to say why.

**Why the old rationale no longer holds.** "A sector that only ever refuses is a worse trade than no sector" assumed
the refusal was the end of the story. On desktop it is not: the key press teaches "open Talents (U)". On touch there is
no U and no other way to the panel, so hiding the sector hides the only thing that could lead a touch player to the
signature. The spell picker in the same file already took this side for the same reason ("gating touch when Digit1-4
is ungated would make touch stricter than desktop, which is the opposite of the bug", `TouchControls.jsx:254-258`).

**Consistent with the desktop notice in meaning, native in delivery.** Same trigger (a locked Aspect verb), same
purpose (teach the unlock path). The desktop says "press U"; touch takes the player to the panel, because "(U)" is
false advice on a tablet. No toast is raised on touch: the existing copy names a key the device lacks and is
English-only (`deniedReason.js`), and the opened panel is the explanation.

- **Win:** all four Aspects visible from minute one, each locked sector a door into the Talents panel, so the iPad gets
  the signature without a keyboard.
- **Compose:** move 6's prologue free roar gets a sector that exists for a new player (it only has to make the sector
  live); the hold built here is the same sector; the spell picker's ungated precedent.
- **Door:** two-way. The predicate is one pure function. The only sticky cost is a `mobile.png` re-baseline (below).
- **Rails:** touch only. Desktop (R key and its notice) is untouched. The capture rail changes `mobile.png` by one
  opener glyph. The i18n rail gains one key in en and zh-CN.
- **Threat:** a thumb on a locked sector leaves play for a panel. Mitigated: the ring is opened deliberately, the
  sector is visibly locked, and closing the panel resumes play (`MenuSystem.jsx:96-97` calls `enterPlay`, whose touch
  branch is `setActive`, `App.jsx:1037`).

**What this does NOT fix (recorded as open items):** after all four first unlocks there is no locked sector left, so a
touch player still cannot reach Talents to spend later ranks (Primal Endurance and the rest). A general touch path to
Talents (a tray entry or a ring sector) is its own milestone because it moves tray or ring geometry under gates.

## Decision: which inputs hold

- **Roar sector:** press-and-hold. `pointerdown` sets `roar`; `pointerup`, `pointercancel`, `lostpointercapture` and
  `pointerleave` release it; `setPointerCapture` keeps the hold through finger drift. A release clears the intent no
  earlier than `TAP_HOLD_MS` after the press, so a tap is exactly today's 120 ms pulse (it now starts at the press
  instead of the release). A new press cancels a pending clear. The ring stays open while held and closes on release.
  Deactivation (input not live, or the overlay unmounting) drops the hold at once.
- **Action button:** `pointerdown` calls the store seam `pressPrimary(0, 'touch')`, which is the mouse press made
  source-agnostic: `performVerb(0)`, and when that verb is `'attack'` (not voidhand-held, not in a form) `pressHeavy(now,
  'touch')`. Release events call `releasePrimary('touch')` (`releaseHeavySwing`). So the light swing fires at the
  press, never delayed; the heavy needs `HEAVY_HOLD_MS + HEAVY_CHARGE_MS` = 700 ms. The charge belongs to `'touch'`,
  so a compat `mouseup` from another finger's tap cannot end it (`releaseHeavy`'s source check, `heavyAttack.js:60`).
- **Grab, snare, imbue sectors:** unchanged (tap pulse on `pointerup`). Their state machines are edge-triggered and
  have no charge; converting them is scope this milestone does not need.
- Both hold buttons cancel `contextmenu` (defensive: a long press must not raise a platform menu over the control;
  not verified on a device).

## File structure

| File | Change | Responsibility |
|---|---|---|
| `frontend/src/input/touchHold.js` | create | PURE: `makeIntentHold`, `chargeFraction`, `chargeRingStyle` |
| `frontend/src/input/touchHold.test.js` | create | its unit tests |
| `frontend/src/input/aspectWheel.js` | modify | `aspectRing(unlockedTalents)`; the F9 docblock |
| `frontend/src/input/aspectWheel.test.js` | modify | `aspectRing` cases |
| `frontend/src/ui/touchTray.js` | modify | `openTalents(store, { setShowSpellUpgrades, setShowAchievements })` |
| `frontend/src/ui/TouchControls.jsx` | modify | roar hold, action hold, locked sectors, `talentsOpen` / `onOpenTalents` |
| `frontend/src/ui/TouchControlsSurface.jsx` | modify | all four sectors (locked look), the two charge rings |
| `frontend/src/Components.jsx` | modify | `pressPrimary` / `releasePrimary` published beside `performVerb` |
| `frontend/src/game/heavyAttack.js` | modify | docblock: `'touch'` is a source |
| `frontend/src/App.jsx` | modify | pass `talentsOpen` and `onOpenTalents` |
| `frontend/src/i18n/strings.js` | modify | `a11y.aspectLocked` in en and zh-CN |
| `frontend/tests/gates/touch-hold-gates.test.jsx` | create | behavioural gates driving the real overlay |
| `frontend/tests/gates/aspect-ring-gates.test.jsx` | modify | assertions that encoded GATED and the pointerup pulse |
| `frontend/tests/e2e/touch-hold.spec.js` | create | the lived proof (written here, run by the command session) |

## Interfaces

- `makeIntentHold({ verb, setIntent, now, minMs = TAP_HOLD_MS, schedule = setTimeout, unschedule = clearTimeout })`
  returns `{ press(): void, release(): boolean, drop(): void, isHeld(): boolean }`. `release` is idempotent and returns
  whether it ended a hold; `drop` clears at once, only if a hold or a pending clear exists.
- `chargeFraction(startedAt: number|null, now: number, durationMs: number): number|null` (null = nothing to draw;
  otherwise clamped to [0, 1]).
- `chargeRingStyle(frac: number|null): { opacity: string, background?: string }`.
- `aspectRing(unlockedTalents) -> Array<{ verb, talent, key, aspect, locked: boolean }>` in `ASPECT_VERBS` order.
- `openTalents(store, { setShowSpellUpgrades, setShowAchievements }): void` closes inventory, crafting, magic,
  building tools, settings and achievements, then opens Talents (the `KeyU` open branch, `InputManager.jsx:229-237`).
- Store seams (set by `Components.jsx`, cleared on teardown): `pressPrimary(button: 0|2, source: string) -> verb`,
  `releasePrimary(source: string) -> void`.
- `TouchControls` props: `{ isWorldBuilt, talentsOpen = false, onOpenTalents }`.
- New test ids: `touch-charge-roar`, `touch-charge-heavy` (fill elements); `data-locked` on each sector button.

## Global constraints

- Game-Loop Isolation: no reactive state per frame; the fills are written imperatively in the existing rAF tick from
  `getState()` and module state. Capture mode runs no tick (frames stay byte-stable).
- AST-safe edits (Edit tool) for `.js` / `.jsx`; no emoji in `src/`; every player-facing string through i18n, en and
  zh-CN; the bundle byte budget (`scripts/ci/bundle-budget.mjs`) holds.
- No new rAF loop, no new store subscription in a hot path, no new dependency.

## Review focus

1. A pointer that never delivers `pointerup` (iOS gesture steal, element unmounted under the finger): the hold must
   still end (cancel, lost capture, leave, deactivation). Pinned in Task 2.
2. A second tap within 120 ms of the first: the first tap's pending clear must not cut the second press short. Task 1.
3. A compat `mouseup` from another finger while the action button holds a charge: it must not end the touch charge.
   Task 3.
4. A fill shown when the SM refused (no bank, cooldown): the roar fill reads `beastCharging`, never the press time.
   Task 4.
5. Desktop mouse press after the refactor: unchanged behaviour (a tap swings at once, a hold charges). Task 3 keeps
   `handleMouseDown` a one-line call into the same function; the existing `heavy-melee.spec.js` is the lived proof.

---

### Task 1: the pure hold module

**Files:** create `frontend/src/input/touchHold.js`, `frontend/src/input/touchHold.test.js`.

- [ ] Step 1: write failing tests: a press sets the intent; a release after `minMs` clears at once; a release before
  `minMs` clears exactly at `pressedAt + minMs` (injected clock and scheduler); a re-press cancels the pending clear;
  `release` twice ends one hold; `drop` clears a pending clear and a held intent, and is silent when idle;
  `chargeFraction` returns null for a null start, 0 before, 0.5 half-way, 1 clamped past the end; `chargeRingStyle(null)`
  hides, a fraction draws a conic sweep of `frac * 360` degrees.
- [ ] Step 2: `npx vitest run src/input/touchHold.test.js`: FAIL (module missing).
- [ ] Step 3: implement.
- [ ] Step 4: same command: PASS. Mutants via `scripts/dev/mutate.sh`: `minMs` ignored (plausible-wrong: a quick tap
  clears before a frame can see it), the re-press not cancelling the pending clear, `chargeFraction` unclamped, and one
  identity mutant (a comment edit) that must SURVIVE.
- [ ] Step 5: commit with the `Mutation-Proof:` trailer.

### Task 2: the roar sector holds; F9's ring

**Files:** modify `aspectWheel.js` (+ test), `TouchControls.jsx`, `touchTray.js`, `App.jsx`, `strings.js`,
`aspect-ring-gates.test.jsx`; create `tests/gates/touch-hold-gates.test.jsx`.

- [ ] Step 1: failing gates (jsdom, the real `TouchControls`, fake timers): pointerdown on the roar sector sets
  `getInput().roar` and it is STILL true 600 ms later (the old pulse cleared at 120); pointerup clears it; a 30 ms tap
  stays true until 120 ms and is false after; each of pointercancel, lostpointercapture and pointerleave releases;
  `setPointerCapture` is called with the event's `pointerId`; deactivation mid-hold clears; the ring stays open while
  held and closes on release. F9: with no talents the opener exists, all four sectors render, the roar sector has
  `data-locked="true"` and the locked a11y name; tapping it calls `onOpenTalents`, lowers `active`, writes no intent;
  tap-to-play is not offered while `talentsOpen`. `aspectRing` and `openTalents` unit cases.
- [ ] Step 2: run them: FAIL for the right reasons (the pulse clears at 120 ms; the opener is absent).
- [ ] Step 3: implement. Rewrite the three `aspect-ring-gates` assertions that encoded GATED / the pointerup pulse.
- [ ] Step 4: PASS. Mutants: the sector pulses on pointerdown as before (plausible-wrong), `onPointerCancel` removed,
  the capture call removed, the deactivation drop removed, the ring gated again, `!talentsOpen` dropped from
  tap-to-play, identity.
- [ ] Step 5: commit.

### Task 3: the action button holds the heavy

**Files:** modify `Components.jsx:531-549,583`, `heavyAttack.js` docblock, `TouchControls.jsx`; extend
`touch-hold-gates.test.jsx`.

- [ ] Step 1: failing gates: pointerdown on `touch-action` calls `store.pressPrimary(0, 'touch')` once and before any
  release; pointerup, pointercancel, lostpointercapture and pointerleave each call `store.releasePrimary('touch')`; a
  tap never calls `performVerb(0)` on pointerup (the old wiring); a `'touch'` charge survives a `'mouse'` release and is
  thrown by the `'touch'` release (`heavyAttack`).
- [ ] Step 2: FAIL (the button still dispatches on pointerup).
- [ ] Step 3: implement `pressPrimary(button, source)` in Components (`handleMouseDown` becomes
  `pressPrimary(e.button, 'mouse')`), publish `pressPrimary` and `releasePrimary: releaseHeavySwing`, null both on
  teardown; rewire the button.
- [ ] Step 4: PASS. Mutants: the button reverts to `onPointerUp={() => dispatch(0)}`, the release omits pointercancel,
  the source is passed as `'mouse'` (plausible-wrong: a compat mouseup could end it), identity.
- [ ] Step 5: commit.

### Task 4: the radial charge fills

**Files:** modify `TouchControlsSurface.jsx`; extend `touch-hold-gates.test.jsx`.

- [ ] Step 1: failing gates (fake rAF and clock): with `beastCharging` true the roar fill shows and grows with time
  toward `ANTICIPATION_SEC`; with `beastCharging` false it is hidden even while the roar intent is held (the SM refused);
  the heavy fill follows `heavyChargeLevel` (hidden on a tap, full when ready); locked sectors draw the lock and no
  cooldown sweep.
- [ ] Step 2: FAIL. Step 3: implement inside the existing tick, writing styles only on change.
- [ ] Step 4: PASS. Mutants: the roar fill keyed to the touch press instead of `beastCharging` (plausible-wrong),
  the heavy fill ignoring the hold threshold, identity. Step 5: commit.

### Task 5: the lived proof (written, not run here)

**Files:** create `frontend/tests/e2e/touch-hold.spec.js`.

iPad Pro 11 landscape emulation (viewport 1194x834, its user agent, `isMobile`, `hasTouch`), with `deviceScaleFactor`
1 instead of the device's 2: CI renders on SwiftShader, `heavy-melee.spec.js` measured 3-5 fps at 1 Mpx, and the
roar needs frames inside its hold. Real input is CDP `Input.dispatchTouchEvent` (`touchStart` with one point, then
`touchEnd` with none), the call Playwright's own Chromium `tap` makes; each target is hit-tested with
`elementFromPoint` before it is pressed.

1. **Roar.** Full Ferocity bank, the roar talent, the ring opened by a real tap. CONTROL: a 120 ms tap on the roar
   sector; presence first (the pointerdown landed on the sector and the SM started a charge), then no
   `beastFormActive` 2 s later. HOLD: at least 600 ms, then until the form commits (cap 20 s); the form commits while
   still held and at least `ANTICIPATION_SEC` after the press.
2. **Heavy.** `heavy-melee.spec.js`'s setup (moss brute 2.5 m ahead, world frozen, crit pinned). A warm-up tap; a
   half-charged CONTROL held in the page by synthetic pointer events on the button (press = a tap, release = 0); a
   real held touch of 900 ms (press = the tap, release = `HEAVY_MULT` x the tap, the brute staggered).
3. **F9.** No roar talent: the opener is offered, the roar sector is `data-locked`, a real tap on it opens
   `progression-panel` and writes no roar intent.

The receipt line in the file says OWED and lists the mutants; the command session runs them with
`scripts/dev/mutate-e2e.sh` and replaces OWED with verdicts.

## Verification gates

- Per task: `npx vitest run <the files above>` from `frontend/`.
- Every commit: the pre-commit offline pipeline (lint, gate-shape, killability-ledger, cli-guard, unit suite, build,
  bundle budget, doc-currency, opsec).
- Lived: `npx playwright test tests/e2e/touch-hold.spec.js` and `tests/e2e/heavy-melee.spec.js` (the desktop mouse
  path after the refactor), run by the command session.

## Heat cost

None measurable. No new rAF loop: the two fills are written in `TouchControlsSurface`'s existing touch-only tick, and
only when their value changes (an idle tick writes nothing new). DOM pointer handlers only. No GPU work.

## Risks

- **`mobile.png` changes:** the always-offered opener adds one glyph to that capture frame. The re-baseline must be its
  own `Baseline-Review:` commit after the programme's 0e re-baseline; it is not in this branch.
- **iOS gesture handling** can swallow `pointerup`; cancel, lost capture, leave and deactivation all release, and the
  frame loop's own cancels remain. Real-device feel is Kevin's.
- **Compat mouse events.** A touch tap that is not `preventDefault`ed also fires `mousedown`/`mouseup` at `window`,
  which `Components.jsx`'s mouse listeners handle. This is pre-existing (today's `pointerup` dispatch has the same
  pairing) and unverified here; the heavy's source check keeps it from ending a touch charge.
- **Desktop regression** in the press refactor: `handleMouseDown` stays a direct call into the same body.
