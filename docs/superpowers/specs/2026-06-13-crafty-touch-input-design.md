# Crafty — Touch / Mobile Input — design of record

> **Status (2026-06-13): DESIGN COMMITTED (loop self-gate per charter §4/§5).** Produced by a grounded
> 3-lens design-gate workflow (`wf_1c9d17fc-f40`, 3 agents / 287k tokens / 65 tool-uses) vs LIVE code:
> Lens A = exhaustive input-seam map · Lens B = SOTA-2026 touch-control research (live-cited) · Lens C =
> adversarial pre-mortem + milestone split + device-free test strategy. The loop synthesized this spec
> from the three; the key delegated claims (the `gameStarted` latent bug, `Terrain.jsx:269` highlight
> gate, the `input-abstraction-gates` static gate) were re-verified against source before committing.
> **Parent:** charter §0 — the "web + iPad + **mobile** envelope" is a HARD mission frame *never
> overridden by taste*; CLAUDE.md names this "the biggest gap (touch/mobile unbuilt — Pointer-Lock-gated)."

## 0. Why — the §0 hard-frame gap

Crafty is **unplayable on its stated iPad/mobile target.** Verified against live code: ZERO touch handlers
(`touchstart/move/end` = 0 in `src/`); the only mobile signal is `render/quality.js:42 coarsePointer` (a
render-tier hint, not input); the game is gated entirely on the Pointer Lock API (drei `<PointerLockControls>`
for look + `document.pointerLockElement` for the active-gate), which **iOS Safari does not support**.

The fix is a NEW INPUT PRODUCER, not a rewrite. The intent architecture was **designed for exactly this** —
`input/inputState.js:13-21` docstring: *"later a virtual-joystick / touch layer writes the SAME intents …
sets active from its own focus model."* The touch layer writes the existing boolean intents through
`setIntent`, drives the existing `setActive` focus gate, and fires the existing `routeMouseVerb` triggers.
**Zero downstream consumer changes** for movement (proven below). This is a layer ON the engine.

## 1. The control scheme (SOTA-2026, Lens B)

**DUAL-ZONE floating-origin + center-crosshair** — the convergent industry default (Minecraft Bedrock's
"Joystick & aim crosshair" mode; Microsoft GDK touch-layout guidance):

- **LEFT half** = a **floating** virtual joystick — its origin spawns wherever the first left-half
  `touchstart` lands (not a fixed pad; kills the "thumb slipped off the stick" complaint), vector →
  movement intents. Nipple visual appears on touch, fades on release.
- **RIGHT half** = free **touch-drag look** → camera yaw/pitch (the same YXZ-euler math the mouse uses),
  tracked by its own `Touch.identifier`.
- **CENTER crosshair** targeting (not tap-to-place): the right-drag aims a fixed reticle; thumb buttons
  fire against whatever the reticle is over. This is the proven FPS-on-touch loop and sidesteps R3F's
  per-mesh touch-propagation quirk (it does NOT rely on per-mesh raycasts for the primary action).

**The ~15-action problem** — tier by frequency, never 15 on-screen buttons:
1. **Always-on primary thumb cluster** (bottom-right arc, ≥44px targets): Attack/Mine · Cast · Jump ·
   Interact · Dodge — combat-loop-frequency.
2. **A radial verb wheel** (one ⊕ button, right edge): the Aspect verbs (roar/grab/snare/imbue) + spell
   select 1-4 fan out; select by tap or directional swipe; auto-collapse. Radial = the SOTA answer to
   "many actions, scarce screen."
3. **A top-edge tray** (behind a grid/hamburger icon, inside the safe-area/notch): the low-frequency UI
   panels (inventory E · crafting C · build B · magic M · achievements Tab · quests Q · trade G · tame T)
   + the hotbar (tap-select / swipe-cycle, replacing the desktop mousewheel) + F3 stats.

## 2. The seam-reuse strategy (Lens A — exact, verified)

Everything REUSES an existing, verified abstraction. The touch layer is a pure PRODUCER.

| Concern | Existing seam (verified) | Touch wiring |
|---|---|---|
| **Movement** | `setIntent('moveF/B/L/R', bool)` (Components :342-412); consumed `?1:0` then `.normalize().multiplyScalar(speed)` at :1048-1058 — **magnitude is DISCARDED by design** | Joystick vector → **8-way quantize to the four booleans** (deadzone + dominant-octant). **ZERO consumer change.** |
| **Look** | 100% drei `<PointerLockControls>` (GameScene :833); math = `_euler('YXZ')` `.y -= dx*0.002*pointerSpeed`, `.x -= dy*0.002`, clamp `x ∈ ±(π/2−0.05)`. Player loop has a matching defensive clamp at Components :1218 | A touch-look handler mutates `camera.quaternion` on `touchmove` using the **verbatim** numbers (YXZ; 0.002 rad/px × a tunable `touchSensitivity`; same clamp). **Do NOT mount `<PointerLockControls>` on touch.** |
| **Verbs** | `routeMouseVerb(button, ctx)` (`input/verbRouter.js`, pure + node-tested) → attack/cast/mine/place/interact; `handleMouseDown` body builds ctx + dispatches (Components :420-481) | Extract :423-481 into a reusable `performVerb(button)`; touch buttons call `performVerb(0)` (primary) / `performVerb(2)` (cast). **One button covers 4 context-routed verbs.** |
| **Focus gate** | `setActive(!!document.pointerLockElement)` is the SINGLE authority (Components :486); de-dupes (inputState :91-96); React projects via `useActiveInput` | Touch calls `setActive(true/false)` from its OWN focus model (canvas-tapped-&-not-paused-&-alive), exactly like the dev start-hook (App :235, NO requestPointerLock). |
| **Start flow** | 3 surfaces call `requestPointerLock()` (MenuSystem :295, App click-to-play :647, auto-lock :110; respawn HUD :495) | Factor a single `resumeControl(state)` = `isTouch ? setActive(true) : requestPointerLockSafely(state)`; replace the ~15 relock sites with it. |
| **Aim highlight** | `Terrain.jsx:269` block-outline `useFrame` hides on `!document.pointerLockElement` → **always hidden on touch** | Change that gate to `getInput().active` (works for BOTH pointer-lock and touch; `active` is true exactly when locked on desktop). Single line, no regression. |

## 3. The trap catalog (Lens C pre-mortem — every milestone checks all six)

1. **[BLOCKING] Capture-determinism pollution.** The 17 puppeteer+pixelmatch baselines (incl. `menu.png`)
   are captured with capture mode ON; the overlay is full-screen DOM outside the Canvas. **Mitigation:**
   the overlay root's FIRST line is `if (isCaptureMode()) return null;` (covers all 17 at once); a static
   gate asserts it; the 17 baselines must stay green with the touch module compiled in.
2. **[HIGH] Desktop regression via a 2nd active-authority.** `tests/gates/input-abstraction-gates.test.js`
   asserts `document.pointerLockElement` appears **≤1×** in Components and **0×** in InputManager — the
   single-authority invariant (KEVIN-FIX C3). **Mitigation:** the touch layer NEVER reads
   `pointerLockElement`; it only calls `setActive`/`setIntent`. The `pointerlockchange` path is made inert
   on coarse-pointer (touch owns `setActive`); else KB+mouse owns it — branch at ONE site. New static gate:
   touch module imports `setActive`/`setIntent`, not `pointerLockElement`.
3. **[HIGH] Focus-lifecycle gaps with no pointer lock.** Start/pause/death/respawn are all pointer-lock-
   event-driven today; none of those transitions fire on touch. **Mitigation:** `setActive` is the touch
   lifecycle SoT — Tap-to-Play→`setActive(true)`; an explicit on-screen Pause button→`setActive(false)`;
   panel open/close toggles `setActive`; death/respawn drives off `isAlive` (already its own authority).
   **Gate the App pause-on-unlock effect (App :166-176) on `!coarsePointer`** so a touch `setActive(false)`
   doesn't auto-open Settings. (NB: that effect's guard reads `gameStarted`, which is **never set** — see §8.)
4. **[HIGH] Multi-touch identity confusion.** Simultaneous left-joystick + right-look + button taps; the
   browser fires `touchmove` with a `changedTouches` LIST. **Mitigation:** bind each gesture to its
   `Touch.identifier` at `touchstart` for its whole lifetime; partition zones (left=move, right=look,
   button hit-tests take precedence). This id→zone→delta math is PURE and the highest-value unit-test target.
5. **[MEDIUM] Analog→boolean quantization.** A continuous stick collapsed to booleans can set an opposing
   pair (moveF+moveB) on a noisy thumb or chatter at axis boundaries (per-frame KCC micro-stutter).
   **Mitigation:** deadzone + **dominant-octant** rule that GUARANTEES never both moveF&moveB / moveL&moveR.
   Pure, unit-testable. Analog speed is deferred (§6 M3) behind an OPTIONAL additive `moveVec` channel so
   the boolean keys stay the stable fallback (no INTENT_KEYS contract break).
6. **[MEDIUM] Perf / Game-Loop-Isolation.** `touchmove` is high-frequency. **Mitigation:** handlers write
   straight to `setIntent`/refs (imperative knob transform), **NEVER `setState` per move** — state changes
   only on the rare active/pause transition (the safe `useActiveInput` subscription pattern). Frame-cost
   story: O(1) DOM, zero per-frame React renders, zero new Canvas draws. Static gate: no `useState` write
   inside a `touchmove` handler. (`selectTier` already forces `low` for coarsePointer.)

## 4. iOS Safari / iPadOS gotcha checklist (Lens B — apply in M1/M2)

- `touch-action: none` on the canvas AND overlay root (kills scroll/pan/pinch/double-tap-zoom); expose an
  a11y escape toggle since it defeats pinch-zoom.
- Every cancelling touch listener registered `{passive:false}` (else `preventDefault` silently no-ops).
- `overscroll-behavior:none` + `position:fixed; inset:0; overflow:hidden` on body (kills pull-to-refresh +
  rubber-band).
- `touch-action: manipulation` (or none) removes the 300ms tap delay; drive ALL input from touch/pointer
  events with `preventDefault` to suppress synthetic mouse double-fire; **do NOT mix React `onClick` with
  touch handlers on the same target.**
- Size the game root with **`100dvh`** (or `window.visualViewport`), **never `100vh`** (Safari dynamic-
  toolbar overflow); re-anchor the bottom thumb cluster on `visualViewport` resize/scroll.
- No Fullscreen API on iPhone (iPad only ≥16.4, flaky) — detect before calling, fall back; recommend a PWA
  `standalone` manifest for chrome-less.
- `-webkit-touch-callout:none; -webkit-user-select:none; user-select:none` on the game root (kills the
  long-press callout / selection magnifier during drags).
- Track gestures by `Touch.identifier` (or Pointer Events `pointerId`, which integrates with R3F's model).

## 5. Detection (Lens B)

Decide overlay visibility on **capability**, 3-tier (Patrick Lauke's pattern), default-show-then-defer-to-intent:
```
if (window.PointerEvent && 'maxTouchPoints' in navigator) coarse = navigator.maxTouchPoints > 0;
else coarse = matchMedia('(any-pointer:coarse)').matches || 'ontouchstart' in window;
```
Use **`any-pointer:coarse`** (not `pointer:coarse`) so a hybrid iPad-with-trackpad still registers its
touchscreen (modern iPadOS Safari reports desktop-class UA + `pointer:fine` when a trackpad is attached —
`any-pointer:coarse` + `maxTouchPoints>0` is the reliable iPad signal). Keep BOTH paths live on hybrids;
optionally auto-hide on first mouse/keyboard event, re-show on first touch (last-used-input wins; listen via
`matchMedia(...).addEventListener('change')`). **Always expose a runtime toggle in Settings: Touch controls
= Auto / On / Off** (detection identifies capability, never intent). Tie BOTH the overlay mount AND the
MenuSystem start-branch (`setActive` vs `requestPointerLock`) to this detector.

## 6. The milestone ladder (lowest-risk-first; each green-able WITHOUT a device)

| # | Milestone | Scope | Device-free verification |
|---|---|---|---|
| **M0 ✅ SHIPPED** (iter 128) | **Pure touch→intent math** | `src/input/touchMath.js` — joystick vec→`{moveF,moveB,moveL,moveR}` (deadzone + dominant-octant, never an opposing pair); look-delta→`{yaw,pitch}` with the shared `MAX_PITCH=π/2−0.05` clamp; multi-touch id→zone partition + per-id delta. NO React/DOM/Three (same purity as `inputState.js`). | Vitest: synthetic vectors (deadzone, octant boundaries, no-opposing-pair invariant), look-clamp saturation, a 3-finger `Touch.identifier` fixture proving a look-drag id never mutates the move vector. Zero GPU. **Charter characterization-first — the pure module is the lowest-risk first cut, mirrors every Aspect-era `game/*.js` pull.** |
| **M1 ✅ SHIPPED** (iters 130-133, review-clean) | **Producer wiring (capture-safe, desktop-inert)** | A touch-overlay component (DOM, mounted in App next to `<HUD>`) consuming M0 → calls existing `setIntent`/`setActive`/`performVerb`; look writes `camera.quaternion`; mounts ONLY when `coarsePointer` AND returns `null` under `isCaptureMode()`; touch owns `setActive` (pointerlockchange inert on coarse); `touchmove` writes refs/intents (no per-move setState). Extract `performVerb(button)` from `handleMouseDown`. Flip `Terrain.jsx:269` gate to `getInput().active`. | Static source gates (GPU-free): (a) touch module imports `setActive`/`setIntent`, not `pointerLockElement`; (b) Components `pointerLockElement` count stays ≤1; (c) overlay early-returns null under capture; (d) no `useState` in a `touchmove` handler. PLUS the existing 17 baselines stay green (proves zero capture pollution). |
| **M2a ✅ SHIPPED** (iter 137) · M2b queued | **MVP playable surface + `mobile` visual fixture** | Render the MVP thumb cluster (joystick · look-zone affordance · jump · primary action · place/break · cast · Tap-to-Play · Pause), S1-C bold-flat styled (game-icon glyphs), safe-area-inset aware, `100dvh`. Lifecycle: Tap-to-Play→`setActive(true)`; Pause→`setActive(false)`; gate App pause-on-unlock on `!coarsePointer`; panel toggles route `setActive`. Apply the §4 iOS CSS. | A NEW `mobile` puppeteer state (coarse-pointer + small viewport, capture-frozen) → `mobile.png` baseline at the 6% gate. Focus state-machine unit tests (Tap-to-Play / Pause / death / panel toggles drive `setActive` correctly, no `requestPointerLock` dependency). **FEEL (sensitivity, FPS) parked for the human.** |
| **M3** | **Verb-sprawl resolution + analog channel** | The radial Aspect-verb wheel (roar/grab/snare/imbue gated on `unlockedTalents`); spell-select + hotbar inside existing panels; social/utility verbs (G/T/Q) as in-range context buttons; dodge gesture; the OPTIONAL additive `getInput().moveVec` analog channel (non-breaking — boolean keys still written). | Unit tests: tray gating vs `unlockedTalents`; analog math with boolean fallback unchanged when `moveVec` absent. Static gate: analog is additive (INTENT_KEYS still present + written). Optional 2nd visual fixture for the expanded tray. |

**Standing rule (charter):** each milestone gets its own `superpowers:writing-plans` plan doc; the full
battery runs per commit; a milestone that can't reach green reverts or parks.

## 7. Test strategy (the device-free contract)

- **Unit-testable (the bulk):** joystick→boolean mapping + the no-opposing-pair invariant; look-delta→
  yaw/pitch + clamp saturation; deadzone chatter suppression; multi-touch id→zone binding; the focus
  state-machine (Tap-to-Play/Pause/death/panel → `setActive`); `routeMouseVerb` ctx shape parity
  (touch buttons feed the same ctx as the desktop mouse path).
- **Visual fixture:** the new `mobile.png` (overlay rendered, capture-frozen, 6% gate); the 17 existing
  baselines as the no-pollution regression guard; source-text gates in `tests/gates/`.
- **Kevin-parked (real device only):** sustained FPS on a real iPad / mid-phone under siege load (CI uses
  swiftshader); drag-sensitivity / deadzone FEEL tuning; thumb reachability across device sizes; real
  multi-touch hardware (palm rejection, simultaneity limits); live iOS quirks (address-bar resize,
  orientation-lock, audio-unlock-on-first-gesture).

## 8. Kevin batch (decisions self-gated + proceeding; reversal paths logged)

These go to `KEVIN-REVIEW-BATCH.md`; the loop proceeds on the recorded defaults (charter §5):

1. **LATENT BUG (verified): `gameStarted` is never set.** Read 5× (MenuSystem :193/216/226, App :164/:171)
   but grep finds NO setter anywhere in `src/` — it is always `undefined`. So those
   `gameStarted && requestPointerLock()` branches are dead AND the App pause-on-unlock guard
   (`s.isAlive && s.gameStarted && …`, App :171) can never be true. **The touch focus model will NOT rely
   on `gameStarted`** (it uses `isWorldBuilt` + `active` + `isAlive`). Flagged for Kevin — likely a desktop
   pause-menu bug independent of touch; a separate fix (introduce/set the flag or drop the dead guards).
2. **Touch pause UX:** an explicit on-screen Pause button (NOT routing through the lock-transition effect),
   since that effect auto-opens Settings on every active false-transition. Default chosen: explicit button.
3. **Sensitivity default:** `touchSensitivity ≈ 1.0–1.5×` the 0.002 rad/px base + optional invert-Y, exposed
   in SettingsPanel (M2). Real value is a human-on-glass judgment (parked).
4. **Zone split + tap/drag threshold:** left half = move, right half = look, buttons overlaid bottom-right;
   a tap-vs-drag time/distance threshold on the right zone so a quick tap = action and a slide = look.
   Default chosen; revisit on real-device feel.
