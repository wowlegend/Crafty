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

## Other traps on this path

- **Pointer-lock element mismatch.** Lock requests must target the `<canvas>` (`GameScene`'s
  `requestPointerLock`), not `document.body` — a body-lock leaves the look controller ignoring mouse
  movement.
- **`document.pointerLockElement` reads are centralized.** `Components.jsx`'s `pointerlockchange` handler
  is the one authority; it writes `setActive()`, and consumers read `getInput().active`. Do not scatter
  raw lock reads back in — a future touch layer sets `active` from its own focus model.
- **Copy is not a selector.** Use `data-testid`.
