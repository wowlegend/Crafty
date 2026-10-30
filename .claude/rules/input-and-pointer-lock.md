---
paths:
  - "frontend/src/InputManager.jsx"
  - "frontend/src/MenuSystem.jsx"
  - "frontend/src/ui/panelState.js"
  - "frontend/src/input/**"
  - "frontend/src/GameScene.jsx"
---
# Input, pointer lock, and the way the player gets stranded

Fires when you edit the input/menu/lock path. It replaces the pointer-lock half of the old
`r3f-pointer-lock-voxel-meshing.md`, which was **actively harmful**: it reasoned about drei's
`PointerLockControls` (gone — `src/input/pointerLook.js` replaces it) and prescribed routing fallback
locks through a wrapper, which is precisely the optimistic-relock pattern that froze the player to death.

## The rule that cost a player their life

**A relock issued immediately after the user's own ESC is GUARANTEED to be refused.** ESC is the browser's
default unlock gesture, and per MDN calling `requestPointerLock()` right after it "will fail, even if a
transient activation is available".

So the relock-on-close that every panel performs (KEVIN-FIX C4) is not racy on that path — it *always*
fails. When it did, `pointerlockerror` set a flag that was already set: nothing changed, nothing
re-rendered, no transition fired. The player was left with no panel, no input (movement gates on
`getInput().active`), and no menu — while mobs, which gate on none of it, kept swinging. Only a reload
escaped. Kevin hit this and was killed by it (`8e68425`).

**No retry fixes this.** The browser demands a fresh user gesture by design, so a page cannot silently
re-trap the cursor. **Only a clickable surface recovers.**

## What to do instead

- The recovery surface is **DERIVED FROM STATE**, not opened by an event handler:
  `shouldShowResumeOverlay()` in `src/ui/panelState.js`. The original defect was never in one branch — it
  was that no branch owned the refusal case. A predicate over state cannot be bypassed by a path nobody
  thought of, including the next panel someone adds with an optimistic relock in its `onClose`.
- The exhaustive invariant is gated: over lock × gameStarted × isAlive × every panel, input-dead-and-alive
  must imply some surface offers a way back. Keep it exhaustive, not sampled.
- App opens the pause panel in a **`useLayoutEffect`** — between the unlock and the panel there is one
  committed render matching the overlay's own predicate, so a post-paint effect flashes the overlay for a
  frame.
- **Input is live only while nothing covers the game, whatever opened the surface.** `isInputLive(state, active)` in
  `src/input/inputLive.js` is the one answer: the gate is open, the player is alive, and no surface is up (every
  PANEL_FLAG, VICTORY, the lost-context panel: `coveringSurfaceUp` in `src/ui/panelState.js`; and the death screen).
  The world clock's pause, every verb seam and the Player loop read it. Openers used to be trusted to drop `active`,
  and two did not: a chest opened from the world on touch (no lock to lose; the world ran on behind it) and VICTORY
  under a held lock. A covering surface takes the pointer back itself (InputManager), and `requestGameLock` refuses
  while any surface is up, so it must be handed `useGameStore.getState()` read after the caller's own writes.
  Gated over device x surface x opener in `frontend/tests/gates/input-live-gates.test.jsx`.

## Two routers, two different questions — do not merge them

`src/input/verbRouter.js` answers **"what does a CLICK mean HERE"** — it depends on aim, targets and
distance, and its whole job is the target-priority ladder. `src/input/expressVerbs.js` answers **"which
verb does this KEY fire"** — a fixed table (F = cast, T = melee, Kevin 2026-06-28) with a liveness
precondition. Same shape, unrelated inputs; keeping them separate is deliberate.

**The liveness gate lives INSIDE the router, not at the call site.** `routeExpressVerb` returns `null`
when input is not live (`isInputLive`: inactive, dead, or a surface up), rather than returning the verb and
trusting the caller to check. A second call site is how a liveness gate gets forgotten, and being input-dead while mobs keep
swinging is the failure this whole file exists for.

**verbRouter's two final returns look dead and are not.** `return 'attack'` / `return 'cast'` at the
bottom of each ladder are unreachable across all **392** finite/Infinity input combinations — measured
exhaustively, not argued — but reachable when a distance arrives as `NaN`, where every comparison is
false and each guard falls through. Deleting them makes the router return `undefined`, which downstream
reads as no verb: a dead mouse button while the player keeps clicking. They are NaN fallbacks, they are
gated as such, and the fallback is deliberately a COMBAT verb — never one that edits the world.

**A key moved into a router table becomes invisible to `keyMap.test.js`.** That suite parses
`x.code === 'KeyF'` out of the handler files to prove every advertised key has a live handler; moving
dispatch into `EXPRESS_VERBS` made F and T look advertised-but-dead. It now imports the table and unions
it in — teach that gate about a new dispatch mechanism rather than loosening it.

## Other traps on this path

- **Pointer-lock element mismatch.** Lock requests must target the `<canvas>` (`GameScene`'s
  `requestPointerLock`), not `document.body` — a body-lock leaves the look controller ignoring mouse
  movement.
- **`document.pointerLockElement` reads are centralized.** `Components.jsx`'s `pointerlockchange` handler
  is the one authority; it writes `setActive()`, and consumers read `isInputLive(state, getInput().active)`.
  Do not scatter raw lock reads back in — the touch layer sets `active` from its own focus model.
- **Copy is not a selector.** Use `data-testid`.
