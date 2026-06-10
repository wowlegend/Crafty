# S2-A-M2d — InputManager `active`-gate migration (single input authority)

> ✅ SHIPPED — this milestone is merged to `main`; historical plan-of-record (see CHANGELOG/ROADMAP for the build record).

> **Status:** PLAN (2026-06-03). Branch `s2a-m2d-input-active-gate` off `main` (`bf6eb30`).
> **Method:** subagent-driven (Opus 4.8 implementer + spec-review + quality-review + adversarial); TDD red-first; NO Claude footer; fix-ups = NEW commits. Verify test state MYSELF at every boundary (subagent green AND red claims unreliable). Visual 12/12 must hold (this is an input-internals refactor — zero intended visual change).

## Goal

Collapse Crafty's **dual pointer-lock authority** into ONE source of truth. Today two `pointerlockchange` listeners run in parallel and can diverge:
- `Components.jsx:364` → `setActive(!!document.pointerLockElement)` — feeds the game-loop gate `getInput().active` (the M1 input-intent module).
- `InputManager.jsx:243-254` → `setIsPointerLocked(document.pointerLockElement !== null)` — feeds a React `useState` consumed by App's render gate + scattered optimistic writers.

Two listeners + two representations (`inputState.active` vs the `isPointerLocked` useState) of the *same* fact (`document.pointerLockElement != null`) = a divergence-bug class. M2d makes **`inputState.active` the single SoT**, gives it a `useSyncExternalStore` reactive projection for React consumers, and **deletes** InputManager's duplicate listener + its raw `document.pointerLockElement` reads.

This completes the M1 input-abstraction (M1 routed movement/verbs through `inputState`; the UI/menu layer was left on its own pointer-lock useState). It also makes the render gate semantically correct for the **future touch layer** (S3): `active` = "input is live" (touch sets it from its own focus model), which is what the click-to-play overlay actually wants — not "the mouse pointer is physically locked".

## Full consumer graph (DO NOT under-scope — this is bigger than the one-file note)

`isPointerLocked` / `setIsPointerLocked` is a **cross-component imperative API**, not an InputManager internal. Every site:

**Reactive READ of `isPointerLocked` (needs the reactive projection):**
- `App.jsx:369` — `showClickToPlay = isWorldBuilt && !isPointerLocked && ...`
- `App.jsx:402` — music-start effect `if (isPointerLocked && musicEnabled) playBackgroundMusic()`
- `HUD.jsx:299` — `{isPointerLocked && gameSystems.isAlive && isWorldBuilt && (...)}`
- `HUD.jsx:410` — `{isPointerLocked && (<crosshair/>)}`
  (HUD receives `isPointerLocked` as a **prop** from App — no HUD edit needed.)

**Imperative WRITE `setIsPointerLocked(v)` (optimistic front-runners — must route to `setActive`):**
- `App.jsx:186` — DEV test hook `start` → `setIsPointerLocked(true)` (mirrors "Start Adventure")
- `HUD.jsx:406` — click-to-play overlay button → `setIsPointerLocked(true)` (paired with requestPointerLock)
- `MenuSystem.jsx:170` — open WorldManager → `setIsPointerLocked(false)`
- `MenuSystem.jsx:281` — resume/start → `setIsPointerLocked(true)`
- `InputManager.jsx:91` — Escape-from-unlocked optimistic → `setIsPointerLocked(true)`
- `InputManager.jsx:247` — its listener (DELETED in M2d)
- `InputManager.jsx:249` — fail-locked catch (see "behavior parity" below)

**Raw `document.pointerLockElement` reads (to abstract / leave):**
- `Components.jsx:365` — the authoritative listener. **KEEP — this is the single allowed read in the React/UI/verb-gate layer** (existing gate asserts ≤1 in Components.jsx).
- `world/Terrain.jsx:253` (block-highlight `useFrame` gate) + `:556` (block-place/break click gate) — **OUT OF SCOPE for M2d, deferred to S3.** These are canvas-layer reads of the browser fact; pre-exist `main`, untouched here. See "Scope clarification" below.
- `InputManager.jsx` lines 87, 111, 160, 231 — guards before `document.exitPointerLock()`; line 246 — in the deleted listener; line 257 — death-exit guard. **All removed in M2d.**
- `App.jsx:393` — contextmenu `if (document.pointerLockElement) e.preventDefault()`. Route through `getInput().active` (de-slop the last raw read in the **React/App** layer; the world/canvas Terrain reads remain — see Scope clarification).

## Locked architecture — `inputState.active` as SoT + `useSyncExternalStore` projection

`inputState.js` already owns `active` for the loop's transient `getInput().active` reads (M1). We add a subscribe/notify bridge so React reads the SAME SoT reactively. `active` changes only on pointer-lock enter/exit (a rare user gesture) → it is transition-state, NOT per-frame → a reactive subscription on it is SAFE under Game-Loop Isolation (the per-frame `moveF/B/L/R` intents stay transient `getInput()` reads — NEVER subscribed).

Why not the zustand store? The input contract is deliberately a separate alloc-free non-React module (so the loop reads intents without React). `active` is part of that contract (`getInput().active`). Splitting `active` into the store would fracture the input SoT across two homes. Keep it in `inputState`; project to React via `useSyncExternalStore`.

## TDD task breakdown

### T1 — inputState subscribe/notify API + `useActiveInput` hook (ADDITIVE, non-breaking)

`src/input/inputState.js` (keep PURE — no React import):
- Module-level `const _subs = new Set();`
- `setActive(v)`: coerce to bool; **only if changed**, mutate `_state.active` AND notify (`for (const cb of _subs) cb();`). The changed-check prevents redundant React renders on optimistic-then-authoritative same-value writes.
- `export function subscribeActive(cb) { _subs.add(cb); return () => _subs.delete(cb); }`
- `export function getActiveSnapshot() { return _state.active; }` (primitive bool → stable for `useSyncExternalStore`'s `Object.is` snapshot check).
- `resetInput()` already sets `active=false` — it should notify too (route through the same notify path) so test/teardown consumers stay consistent.

`src/input/useActiveInput.js` (NEW — the React projection):
```js
import { useSyncExternalStore } from 'react';
import { subscribeActive, getActiveSnapshot } from './inputState';
export function useActiveInput() {
  return useSyncExternalStore(subscribeActive, getActiveSnapshot, getActiveSnapshot);
}
```
(3rd arg = server snapshot, harmless for SSR-less Vite; keeps the signature explicit.)

**RED test** (`src/input/inputState.test.js`, extend): subscribeActive callback fires when setActive flips the value; does NOT fire on a no-op same-value setActive; unsubscribe stops further callbacks; getActiveSnapshot reflects the current value; resetInput notifies + clears.

**Green gate:** `npm run test:unit` — all prior 443 + new still green (nothing else changed yet). **Commit 1** (additive infra).

### T2 — migrate InputManager + App onto the SoT (COUPLED — one commit)

**`src/input/inputState.js`** — done in T1.

**`src/InputManager.jsx`:**
- Add imports: `import { getInput, setActive } from './input/inputState';`
- DELETE the `isPointerLocked` useState (line 19) + `setIsPointerLocked`.
- DELETE the `pointerlockchange` listener effect (lines 243-254) entirely.
- Remove `isPointerLocked` from `localRefs` (53,55) + from the destructures (27, 61) + from the return object (262-267). (`showStats/showAchievements/showSpellUpgrades` stay — out of scope.)
- Replace every internal `isPointerLocked` gate read with `getInput().active` (lines 33, 85, 97, 125, 132, 150, 167, 199, 220 — read at handler entry: `const active = getInput().active;` once, reuse).
- Line 91 Escape optimistic: `setIsPointerLocked(true)` → `setActive(true)`.
- Drop the 4 `if (... && document.pointerLockElement) document.exitPointerLock()` guards (87, 111, 160, 231) → call `document.exitPointerLock()` directly (safe no-op when unlocked, per spec). Line 257 death-exit: `if (gameSystems && !gameSystems.isAlive) document.exitPointerLock();`.
- Result: InputManager has **0** `document.pointerLockElement` reads and **no** `pointerlockchange` listener.

**`src/App.jsx`:**
- Imports: `import { setActive, getInput } from './input/inputState';` + `import { useActiveInput } from './input/useActiveInput';`
- `const isPointerLocked = useActiveInput();` (place near the other hooks).
- Remove `isPointerLocked, setIsPointerLocked` from the `useInputManager(...)` destructure (128) — keep `showStats/showAchievements/showSpellUpgrades`.
- Pass `setIsPointerLocked={setActive}` to `<HUD>` (533) and `<MenuSystem>` (544). **Prop name kept** → HUD/MenuSystem unchanged (behavior parity, minimal churn; the optimistic writes now hit the SoT). Add a one-line comment: the prop is the optimistic `active` writer; the authoritative writer is Components.jsx's pointerlock listener.
- Line 186 test hook `start`: `setIsPointerLocked(true)` → `setActive(true)`.
- Line 393 contextmenu: `if (document.pointerLockElement)` → `if (getInput().active)`.

**`src/Components.jsx`:** NO change — it remains the sole authoritative `pointerlockchange` listener (the one allowed `document.pointerLockElement` read).

**`src/HUD.jsx`, `src/MenuSystem.jsx`:** NO internal change (they receive props from App; `setIsPointerLocked` prop is now wired to `setActive`).

**RED gate** (`tests/gates/input-abstraction-gates.test.js`, extend with an InputManager block):
- InputManager.jsx has **0** `document.pointerLockElement` matches.
- InputManager.jsx has **no** `pointerlockchange` listener (`/pointerlockchange/` absent).
- InputManager.jsx imports `getInput`/`setActive` from `./input/inputState`.
- (Keep the existing 5 Components.jsx assertions unchanged.)

**Green gate:** `npm run test:unit` (all green) + `npm run build` (clean) + `npm run test:visual` (**12/12** — input internals don't touch capture frames). **Commit 2** (migration).

## Behavior-parity ledger (conscious, not mechanical)

- **Optimistic-set PRESERVED:** every `setIsPointerLocked(true/false)` becomes `setActive(true/false)` — same optimistic front-run of the async `pointerlockchange`. `setActive`'s changed-check + notify flips the render gate instantly (overlay hides on click), identical to today.
- **Optimistic-true-on-lock-failure:** today, if `requestPointerLock` fails the browser fires `pointerlockerror` (not `pointerlockchange`), so the optimistic `true` stands (stale). M2d preserves this exactly (NOT in scope to fix). Documented for the future touch/robustness pass.
- **fail-locked catch (InputManager:248-250) CONSCIOUSLY DROPPED:** the deleted listener's `try/catch → setIsPointerLocked(true)` was dead defensive code — reading `document.pointerLockElement` cannot throw (spec: simple Document property), and the SURVIVING authoritative listener (Components.jsx:364, shipping since M1) never had a catch. Parity is measured against Components' listener, which is the SoT writer. Net behavior unchanged.
- **`active === isPointerLocked` today:** both were `document.pointerLockElement != null`. Collapsing them is value-identical for the web KB+mouse path (the only path that exists pre-S3).

## Risks + mitigations

- **`useSyncExternalStore` infinite loop** if `getSnapshot` returns a new ref each call → mitigated: snapshot is a primitive bool.
- **Redundant renders** from optimistic+authoritative same-value writes → mitigated: `setActive` changed-check.
- **Mount-order:** App's `useActiveInput` reads `false` initially; Components mounts inside the canvas and calls `handlePointerLockChange()` on mount → `setActive` → App re-renders. Same as today's useState path.
- **Under-scoping** (the headline risk): the consumer graph above is exhaustive — grep `setIsPointerLocked`/`isPointerLocked` across `src/` after the change to confirm zero stragglers.

## Definition of done

- `inputState.active` is the single pointer-lock/active representation **for the React UI/menu/verb-gate + InputManager layer**; InputManager holds no input state + no listener. (World-layer `Terrain.jsx` block-interaction reads are deferred to S3 — see Scope clarification.)
- `npm run test:unit` green (443 + new) · `npm run build` clean · `npm run test:visual` **12/12**.
- Existing 5 Components gates + new InputManager gates green.
- Adversarial review (spec/quality/architecture) → no BLOCKING findings unaddressed.
- 4-piece updated (ACTIVE_PLAN resume → M3); merged to `main`.

## Scope clarification (post-review, 2026-06-03)

The 4 adversarial reviewers (spec APPROVE · quality APPROVE · architecture MINOR · parity APPROVE) flagged that this plan's original "exhaustive consumer graph" / "single SoT" / "last scattered raw read" framing was **over-claimed**. Corrected, accurate scope:

- **`inputState.active` is the single SoT for the React UI/menu/verb-gate + InputManager layer.** ONE authoritative `pointerlockchange` listener (Components.jsx) and ONE allowed `document.pointerLockElement` read (Components.jsx:365). InputManager: 0 reads, no listener. Verified by exhaustive `grep` across `src/`.
- **NOT covered (deferred to S3 touch):** `world/Terrain.jsx:253` (block-highlight `useFrame` visibility gate) + `:556` (block place/break click gate) still read `document.pointerLockElement` directly. They **pre-exist `main`** (M2d's diff does not touch Terrain) → **not a regression, not a divergence** introduced here. But they mean block-interaction is gated on the raw browser fact, not `active` — so they will NOT honor a future touch-layer `active` state. Migrating them to `getInput().active` is **S3 (touch) work**, NOT a parity-preserving M2d refactor, because the block-place CLICK gate interacts with the optimistic-`setActive(true)`-before-browser-lock window (needs its own analysis + test). Logged to ROADMAP S3.
- **Prop-name nit (deferred):** the optimistic-writer prop is named `setIsPointerLocked` but wired to `setActive` (name kept to avoid churn in HUD/MenuSystem; documented inline). Rename the whole chain to `setInputActive` coherently in the S3 touch pass (when Terrain migrates), not piecemeal now.
