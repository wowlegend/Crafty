# Kevin Live-Playtest Fixes — Respawn Lock-Up + The Pointer-Lock/Menu State Machine

> **✅ SHIPPED.** Kevin live-playtest fixes — respawn lock-up + the pointer-lock/menu state machine. Completed early-loop. See CHANGELOG.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** source = Kevin's 2026-06-10 live feedback + the 2-lens diagnostic workflow wf_1a0b03d0-b93
> (both lenses HIGH-confidence, code-traced; the full state map + 11 root causes in the workflow output).
> **The two-sentence diagnosis:** Respawn teleports the BODY to (0,120,0) but never the CAMERA — and chunk
> streaming keys on the camera, so dying >~64-96u from origin leaves the origin chunks unloaded, the ground
> probe nulls forever, and the player useFrame early-returns before movement code every frame (frozen +
> WASD-dead) while the window-level fire path (gated only on the optimistically-set `active`) keeps working.
> Around it: TWO parallel lock-state systems with FIVE `active` writers (three optimistic, no rollback, zero
> `pointerlockerror` handling), drei's hidden document-wide click→lock (no `selector` prop — EVERY menu click
> re-locks), ESC wired to a keydown the locked state never delivers, the title menu mounting OVER the
> DeathScreen, and three panels that never re-lock on close.

**Goal:** One coherent lock/menu state machine: `active` has ONE authoritative writer + an error channel; respawn always lands and restores control; fire and movement share gates; ESC means pause; menus never steal the lock; the death screen is unoccluded.

**Architecture:** Six commits by logical system (Anti-Execution-Tunneling): C1 respawn deadlock · C2 verb gates · C3 lock-state truth · C4 drei + relock coverage · C5 ESC semantics + title-menu gate (incl. the 4 React-local panel flags → store, the panelState TODO — needed so the unlock-transition handler can see ALL panels) · C6 input hygiene. The capture harness's optimistic `start` hook (App.jsx:209) is deliberately KEPT (headless runs have no real pointer lock).

**Reproduction note (the risks list):** the respawn freeze needs death >100u from origin — a near-spawn test falsely passes. The regression test asserts the bounded-probe fallback fires.

---

### C1 — the respawn deadlock (the highest-leverage line)
**Files:** `frontend/src/Components.jsx` (:281-290 the respawn coordinator; :842-881 spawn placement)
- [ ] The coordinator ALSO snaps the camera to the respawn column (`camera.position.set(0, 121.2, 0)`) — feeding the camera-keyed chunk streamer so origin chunks load and the probe can resolve.
- [ ] Bound the probe wait: a failed-frames ref; after ~120 frames fall through to the existing groundY=60 fallback instead of returning forever. Remove the `physicsY > 90` upper-band rejection (permanently freezes mountain spawns); keep the `<= 15` floor (water/void rejection).
- [ ] Test: a unit/characterization test on the placement logic if extractable; else the battery + the KRB repro protocol (die >100u out, respawn, move).
- [ ] Commit `fix(respawn): the spawn-placement deadlock — snap the camera with the body + bound the probe wait`

### C2 — the verb gates (fire/movement symmetry)
**Files:** `frontend/src/Components.jsx` (:473 handleMouseDown, :435 KeyF), `frontend/src/EnhancedMagicSystem.jsx` (castSpell ~:262)
- [ ] handleMouseDown: `if (!useGameStore.getState().isAlive) return;` at the top. KeyF: gate on `getInput().active` + alive. castSpell: early-return when dead (defense in depth — the F-held cast path).
- [ ] Commit `fix(input): fire shares movement's gates — no firing while dead or control-starved`

### C3 — lock-state truth (ONE authoritative writer + the error channel)
**Files:** `frontend/src/Components.jsx` (:534-541), `frontend/src/HUD.jsx` (:487), `frontend/src/MenuSystem.jsx` (:286, :176), `frontend/src/InputManager.jsx` (:86)
- [ ] `pointerlockerror` listener beside pointerlockchange → `setActive(false)` (a failed lock can never strand active=true; neutralizes Chrome's post-ESC cooldown trap).
- [ ] DELETE the optimistic writes: HUD respawn `setIsPointerLocked(true)`; MenuSystem Start-Adventure; InputManager ESC-branch; MenuSystem :176 `setIsPointerLocked(false)`. KEEP App.jsx:209 (the capture-harness hook — baselines depend on it). Recovery surface after a failed lock = the click-to-play overlay (already keyed on !active).
- [ ] Commit `fix(input): pointerlockchange is the ONE active-writer + a pointerlockerror channel`

### C4 — drei's hidden click→lock + relock coverage + the death screen
**Files:** `frontend/src/GameScene.jsx` (:826-832), `frontend/src/MenuSystem.jsx` (:190, :208-212, :217), `frontend/src/GameSystems.jsx` (~:225)
- [ ] `<PointerLockControls selector="#lock-target-none" ...>` (verified in installed drei: a non-matching selector attaches ZERO document click handlers — kills the menu/death-screen lock-steal everywhere at once; every legitimate lock entry already has an explicit requestPointerLock site).
- [ ] Remove `enabled={gameState.isAlive}` (always-connected PLC keeps its own listeners attached — no stale internal isLocked across the death boundary; mouse-look-while-dead is prevented by the death camera lerp, and C2 gates the verbs).
- [ ] Add the missing relock-on-close to TradingInterface/WorldManager/AuthModal onClose (the 8 other panels' precedent).
- [ ] Remove the Respawn button's `delay: 1` fade-in (impatient dead-clicks hit the button, not the backdrop).
- [ ] Commit `fix(menus): kill drei's document-wide click->lock + complete relock-on-close coverage`

### C5 — ESC = pause, the title menu never occludes death, panels into the store
**Files:** `frontend/src/Components.jsx` (the pointerlockchange handler), `frontend/src/InputManager.jsx` (:82-84), `frontend/src/ui/panelState.js` (:39-42 + the :8-10 TODO), `frontend/src/MenuSystem.jsx` (:89), the 4 local-flag owners (App/GameSystems per the TODO)
- [ ] Move the 4 React-local panel flags (showSpellUpgrades/showAchievements/showStats/showAuthModal) into the store (panelState's own TODO) so `isAnyPanelOpen` is ONE selector — required for the next step to be correct.
- [ ] In handlePointerLockChange, on the locked→unlocked TRANSITION with `isAlive && gameStarted && !isAnyPanelOpen` → `setShowSettings(true)` (the only cross-browser ESC response — the keydown is consumed while locked). Delete the unreachable InputManager ESC-else branch.
- [ ] Gate titleMenuVisible on `isAlive !== false` (the z-9999 title menu can never occlude the DeathScreen again).
- [ ] Commit `fix(menus): ESC means pause — unlock-transition-driven settings; the title menu yields to death; panel flags unified in the store`

### C6 — input hygiene
**Files:** `frontend/src/store/useGameStore.jsx` (the death edge ~:693) or the Components isAlive effect
- [ ] `resetInput()` on the death edge — held intents can't persist through death into respawn.
- [ ] Commit `fix(input): intents reset on death`

### Close-out
- [ ] Full battery after EVERY commit (the 13 baselines exercise menu/title/death surfaces — C3/C4/C5 are exactly where regressions would show).
- [ ] KRB: the repro protocol (die >100u from origin → respawn → move; ESC in-game → settings; open/close every panel → lock restored; die → death screen unoccluded, respawn immediate) + the follow-ups flagged (real pause via `<Physics paused>`; the Aspect-UX unit is SEPARATE and next).
- [ ] ACTIVE_PLAN → the Aspect-UX design unit (Kevin item 3), then M6 T2-T4 resume.

## Self-review
- Coverage vs the 11 diagnosed root causes: RC1✓C1, RC2/fire-asymmetry✓C2, RC3✓C3, RC4/drei✓C4, RC5/title-over-death✓C5, ESC-unreachable✓C5, relock gaps✓C4, KeyF✓C2, hygiene✓C6. Deferred + flagged: real world-pause; the lock()-on-disconnected-control race is mooted by C4's always-connected PLC.
- The one risky interaction (drei selector kills accidental auto-relocks) is covered by C4's explicit relock completion + click-to-play as the universal recovery surface.
- Order matters: C3 before C5 (the transition handler relies on truthful active); C4's selector before trusting relock paths.
