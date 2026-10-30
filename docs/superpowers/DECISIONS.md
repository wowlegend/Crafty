# Crafty — Decision Record

> **What this is.** The answer to a defect the 2026-07-27 audit found in the process itself:
> `KEVIN-REVIEW-BATCH.md` had grown to ~146 entries over eight weeks with exactly 6 marked resolved, all
> dated 2026-06-02/03/13. Nothing in the preceding six weeks was ever marked answered, so there was no way
> to tell what had been decided from what had merely not been read. A queue with no exit is a backlog that
> looks like a decision process.
>
> **The protocol.** KEVIN-REVIEW-BATCH stays the INBOX — the loop appends there. This file is the OUTBOX:
> every decision, who made it, when, why, and what shipped. An entry here is the closing record; the batch
> entry it answers is marked `→ DECIDED (see DECISIONS.md)`. A decision is never silently reversed — a
> reversal is a NEW dated entry that names the one it supersedes.
>
> **Authority.** Kevin's standing grant (2026-06-10, expanded 2026-07-20, and his 2026-10-27 mandate to the command
> session, below) lets the session decide anything, within the bright lines and rules `CLAUDE.md` states (the loop
> charter that held them until 2026-10-28 is retired). Entries marked **[LOOP]** were decided under that grant;
> **[KEVIN]** entries were decided by the owner directly. What `CLAUDE.md` reserves for Kevin (money, account
> sign-ins, an external send beyond the repo's own public face) stays his.

---

## 2026-10-30 — [LOOP] L11: one fact, one predicate: the sea line, the landmark, the sight line, the kill's tier, the cooldown and the move basis

**Decided by the L11 builder under the standing grant** (DECISIONS 2026-10-28 item 14), as lane L11 of the 2026-10-30 deep
audit (`docs/superpowers/audits/2026-10-30-deep-audit.md`, section 4). Each stands while it earns its place. Six facts had
two producers that could disagree; each now has one predicate or constant, and a consistency gate that drives both
producers and reds when either moves alone. Every gate was run red against 1a3910e7's code before its fix (a scratch copy;
the pre-commit hook refuses a red commit), and mutation-proven with `scripts/dev/mutate.sh` (the numbers are in each
commit's `Mutation-Proof:` trailer).

180. **The sea has one predicate: `oceanProfile.seaFillsCell(y, surfaceY)`.** (AUDIT:ultra:ultra-player-world-9) The terrain
   worker fills water into the cells above a column's surface up to SEA_LEVEL; `climate.surfaceBlockAt` said `isWater` for
   `surfaceY <= SEA_LEVEL`. A surfaceY 28 column is dry sand with nothing above it, so the two disagreed on exactly the
   last dry shoreline column: the wind bed turned to the muffled underwater sound there, and the far-field ring drew the
   strip as sea one column inland. The worker now fills with `seaFillsCell`; `isSeaColumn` is derived from it and is what
   `isWater` returns. The worker has no exports and cannot be imported under vitest, so the gate reads its voxels through
   its message handler (an `update_block` to air answers `block_broken` with the id it replaced), once per column since the
   read replaces the block. On 1a3910e7, 8 of 24 columns disagreed at each of seeds 12345 and 777, every one surfaceY 28.
   The verifier's 18.2% residue on those columns is SoundManager sampling a float position, which this does not touch.
   One more reader of the strip's old meaning was found by CI, not by search (run 41132117834, shard 6/8 red on all three
   attempts): `tests/e2e/place-clear-of-player.spec.js` picked its shore columns by `isWater` on a neighbour, so the dry
   strip counted as the sea and, with the strict predicate, no column qualified ("no beach column one block over the sea
   within 80 m"). It now names the sea line itself (a neighbour at or below SEA_LEVEL) and picks the same columns: the same
   4 candidates, and the same 16 within 80 m of Kevin's spot, checked offline against the old rule.

181. **A landmark exists in one place: `shrines.landmarkAt(cx, cz)`.** (AUDIT:ultra:ultra-player-world-6) A hashed chunk
   holds a landmark only on land (not a water column, surface at least 32). Terrain.jsx drew by that rule; `nearestLandmark`
   used the bare hash, so the cyan beam, the compass, the minimap dot, the HUD objective and the Pilgrimage reach test led
   to a shrine nobody could see. In a 501 x 501 chunk window 824 of 3,508 hashed chunks at seed 12345 (744 at seed 777)
   were not drawn, and 21 and 24 of 121 probe players had one as their nearest. The finder now scans `landmarkAt`, and
   LandmarksRender takes each loaded chunk's landmark from it with no filter of its own. When no drawn landmark lies within
   the radius the finder returns null, as it always could, and the HUD falls back to the Blight Heart. The answer is
   memoised per chunk and cleared when the climate sampler changes seed (`climate.getClimateSeed`), because FarBeacon asks
   for a 33 x 33 chunk window every frame and a climate sample allocates. The gate restates the renderer's rule from the
   sampler alone (so retuning the rule in one place reds it), covers chunks on surface 31 and 32, the line, and a re-seed
   round trip. The renderer's use of `landmarkAt` is pinned by `landmarks-gates`, sliced to the component body; Terrain.jsx
   builds a worker at module top and cannot be rendered under vitest, so that half is structural.

182. **Line of sight reads the true column tops, as a second grid.** (AUDIT:ultra:ultra-game-logic-3) `heightGridAt` writes
   Infinity for a column a mob cannot stand in, and `hasLineOfSight` compares a column with the higher of its two ends plus
   1.2, so a player on a pillar 5 or more blocks above the mob's feet made an Infinity end and nothing blocked. The hunter's
   finite stand-in gives the same sight and loosens `clampMove` (it reads the floor grid); the lane brief said the same.
   `localPath.sightGridAt` replaces each Infinity cell with the column's top (the store's `getMobGroundLevel`), and
   `mobGridsAt` returns both grids, which AIWorkerSystem sends; the worker's cover search reads `sightGrid || heightGrid`
   for line of sight and nothing else changes. A finite floor stays the floor (a roof over open room is not a wall to
   sight). Cost, by reading and not measured on a device: at most one extra top cast per wall cell, 81 at the very most
   per aggro mob per 15 Hz tick, beside the floor probe's multi-cast walk that already runs for all 81; none when no cell
   is a wall. The gate is the verifier's scene on the real parts (real mesher, real Rapier world, real probes, the real
   `ai.worker.js` tick): pillars of 5, 6 and 8 blocks fail on 1a3910e7, 1, 3 and 4 pass, and with no wall there is no cover
   to take. `AUDIT:combat:skeleton-arrows-ignore-terrain` can read the same grid for an archer's sight; this lane does not.

183. **A kill's position is the bus's array.** (AUDIT:numeric:kill-loot-tier-always-zero) `mobKillBus` documents and
   CombatSystem emits `[x, y, z]`; the loot roll read `.x` and `.z`, so every kill rolled at tier 0 and S7's "farther is
   rarer" never applied to a mob kill. It reads `position[0]` and `position[2]`. The gate emits real kills on the real bus
   into the real `useQuestSystem` and reads a zombie's epic Iron Nugget (0.3 x (1 + 0.25 x tier)) with the roll just under
   and just over the chance of the kill's own tier, at five positions that put a large or small y beside x and z. Tiers 1
   to 4 fail on 1a3910e7. The nuggets have no use today (`REVIEW:w2f:forge-orphan-loot`); the row serves only as the
   probe. The emitter's array shape stays pinned by `kill-attribution-gates` (CombatSystem's death path is closure-scoped).

184. **The ability bar's cooldown durations are the machines' constants.** (AUDIT:ultra:ultra-game-logic-6)
   `cooldownMirror.js` imports `GRAB_COOLDOWN_SEC`, `SNARE_COOLDOWN_SEC` and beastTransform's `COOLDOWN_SEC` in place of
   0.6, 1.5 and 1.5. The gate names no number: it drives each real machine through the transition that arms its cooldown
   and holds that, on that frame, the mirror's remaining time is the whole of its duration. On the old mirror, retuning
   each constant (0.9, 2.0, 2.0) reds the matching slot; on the new one the same retunes leave it green, which is the
   point. It also asks that every machine-backed slot the mirror carries be driven, so a fourth cannot ship undriven. Not
   mirrored, and said in the gate: the dodge (its duration is the Player loop's own `cooldown`, handed in) and the imbue
   (no cooldown).

185. **A walk and a dodge read one planar basis, and an in-code deferral is a gate.** (AUDIT:ultra:ultra-game-logic-7)
   `locomotion.moveVector` calls `dodge.planarBasis`; the inline copy and its "unify later" comment are gone. The gate
   drives `moveVector` and `dodgeDirection` over 9 camera lengths (either side of the 0.001 line and the camera looking
   straight up) x 16 angles x 8 key directions and holds that they go the same way; it names no threshold, so moving the
   shared line moves both and stays green, while moving either old copy alone reds it. The row's note also asked for a
   sweep against deferral comments: `tests/scripts/no-deferral-comments.test.js` is a property check over every non-test
   file of `src/` (TODO, FIXME, "unify later" inside a comment), the detector shown first to see each form, sited in
   `tests/scripts/` because its subject is source content. It was red on exactly the one comment this lane removed.

**Not covered:** a lived run (there is no local browser in this lane; CI is the arbiter, `ci ok` on the exact head); the
sight grid's frame cost on an iPad-class device (item 182, by reading only); the Terrain.jsx renderer drawing
`landmarkAt`'s chunks (structural, item 181); the dodge and imbue slots of the mirror (item 184); and the enemy-arrow terrain
test (its own row).

**CI on the lane's head 973bce38** (run 41134824441): `ci ok`, with two first-attempt retries that are not this lane's:
mob-floor.spec.js:227 fails its first attempt in all four recent runs on three branches, two of which touch no mob or
terrain code (`REVIEW:e2e-flakes:mob-floor-roof-floor-infinity`), and hud-at-rest.spec.js:354 failed once, where the run
before it, on identical `src/`, passed it first time (`REVIEW:e2e-flakes:hud-at-rest-tracker-tap-canvas`).

## 2026-10-30 — [LOOP] L1: a death on iOS shows YOU DIED, the lock goes on the canvas only, Show Stats and the juice dial, and every button over the game answers a finger

**Decided by the L1 builder under the standing grant** (DECISIONS 2026-10-28 item 14), as lane L1 of the 2026-10-30 deep
audit (`docs/superpowers/audits/2026-10-30-deep-audit.md`, section 4). PR #62. Each stands while it earns its place.

160. **One way to the Pointer Lock API: `src/input/pointerLock.js`.** iOS and iPadOS WebKit define none of it (MDN
   browser-compat-data: `Document.exitPointerLock`, `Document.pointerLockElement` and `Element.requestPointerLock` are
   `safari_ios` `version_added: false`; `chrome_android` from 144). InputManager's death effect called
   `document.exitPointerLock()` bare, and React sent the TypeError from that passive effect to the root error boundary: on
   every iOS browser every death showed the crash page instead of YOU DIED, and the autosave pending then never fired
   (AUDIT:input:ios-death-crash). `releasePointerLock()` calls the API only where the browser has it; `requestGameLock()`
   asks GameScene's requester, which locks the canvas, and locks nothing when there is none. Every call site goes through
   them (InputManager, MenuSystem, App's world-ready lock, HUD's Respawn, the DEV start hook, Terrain's chest open); the
   five `document.body` fallbacks are gone, and with them a `.catch` on a value older engines return as undefined, which
   threw before the touch bridge (AUDIT:ultra:ultra-state-saves-input-10). `contextRecovery.js` keeps its own check,
   which was already guarded.
   - **Departure from the brief.** The audit asked for a release "only when locked and the API exists". The release does
     not ask whether the pointer is locked: `pointerLockElement` is null while a lock request is still pending (MDN), so
     that check skips the release in exactly the window a request is in flight, and on every engine with the API the
     call stays the one it was. The mutant that adds the check survives the gates (they hold no pending request); that
     is the gates' stated limit, not a claim.
   - **The static half.** ESLint (`src`, not tests) errors on any `document.exitPointerLock` member and on
     `document.body.requestPointerLock`: 17 matches in 10 call sites at b48ec9f1, none now. A source rule is not a gate on its own
     (gate-shape); it stops a new bare call before the behavioural gates below would have to.
161. **Owed, and Kevin's: the lived proof on an iPhone and an iPad.** In Safari on each: die once (a mob, or a fall),
   see YOU DIED and not "Something went wrong", tap Respawn and play on; then tap the HUD Settings gear and see Settings
   open. CI shows what Chromium can: `tests/e2e/death-pointer-lock.spec.js` deletes the three API members before the app
   loads and dies on an emulated iPad (red on b48ec9f1's game code, c132513b in run 41117858710, all three attempts:
   `TypeError: document.exitPointerLock is not a function` at InputManager.jsx:138), and its desktop case dies holding a
   stand-in lock and must release it once. Chromium is not WebKit, and the touch emulation is not a finger.
162. **Show Stats is not a panel on touch either.** App passed `otherPanelOpen={showAchievements || showStats}` to
   TouchControls, which refuses action and roar presses while a panel is open, so on touch Show Stats silently disabled
   attack, mining, the heavy and the roar until it was toggled off (AUDIT:softlocks:touch-show-stats-kills-action). It
   passes `showAchievements` only, as `ui/panelState.js` already says of Show Stats.
163. **The hydrate restores the juice choice.** `settingsPersist.js` persists `juiceIntensityChoice` but hydrated only
   `juiceIntensity`, so the first save of any other dial in a later session wrote the default 1 over a saved 40% or over
   the in-game Reduced Motion's 0 (AUDIT:ultra:ultra-game-logic-1, since c832ca56). It restores both.
164. **Every button and modal surface over the live game owns its touch.** Lead AUDIT:input:touch-settings-gear-unreachable
   was decided on CI before any fix: run 41117858710 tapped the HUD Settings gear on an emulated phone (Playwright's
   touchscreen tap after its hit-target check, input live) and Settings never opened, on all three attempts. TouchControls
   cancels the touchstart and touchend of any touch that does not land on a surface it counts as a control, and in
   Chromium a cancelled touch fires no click (this run, and touch-probe's X3 hotbar record, also Chromium). WebKit is
   untested here and is part of item 161; commit 9b89e569's message says the X3 record was Safari on an iPad, which is
   wrong. The same cancel held for every plain button over the live game (read in jsdom; the browser half is the gear's):
   the gear (touch's only way to Settings, How to Play, Manage Worlds and Load), Respawn (play stays live on touch at a
   death, so a touch player was held on the death screen, which no iOS player reached before item 160), Keep exploring
   at the first dragon kill, and the context-loss panel, the way back when iOS drops the WebGL context. The brief proposed marking the gear `data-hud-interactive`; marking surfaces one by one is the hand-kept list
   that missed the other three, so `input/touchOwnership.js` now names ownership by kind: `button, [role="button"],
   [aria-modal="true"], [data-hud-interactive]`. A touch on the world (the canvas, a scrim) is still the router's.
   Registry: REVIEW:l1:touch-overlay-buttons-cancelled records the three beyond the lead, closed.

**Gates**, each red first on b48ec9f1's code (a scratch copy with the gate dropped in) and mutation-proven with
`scripts/dev/mutate.sh` (the numbers are in each commit's `Mutation-Proof:` trailer):
- `tests/gates/pointer-lock-guard-gates.test.jsx`: a death with no Pointer Lock API keeps the game and fires the
  autosave; a death holding a lock releases it once; Tab, J, H and B open their panels and throw nothing with no API and
  release a held lock with one; the real App on touch shows the death screen at a death. 3 of 5 red at b48ec9f1 (the two
  held-lock cases are the controls); 7 real mutants red, 2 identities green, the locked-check mutant surviving (item 160).
- `tests/gates/touch-entry-gate.test.js`: the two cases that pinned the body fallback now assert that Start with no lock
  method locks nothing, and on touch still fires the touch bridge and starts the run when the engine's lock returns
  undefined. Both red at b48ec9f1.
- `tests/gates/touch-show-stats-gates.test.jsx`: the audit verifier's full-App probe: with the readout on, three presses
  and a roar reach the game. Red at b48ec9f1 ([0, 0, 0]).
- `tests/gates/settings-juice-persist-gates.test.js`: three sessions through the real store. 4 of 5 red at b48ec9f1.
- `tests/gates/touch-owned-controls-gates.test.jsx`: the real App on touch; the gear, Keep exploring, the context-loss
  panel and Respawn (after a real death, play still live) keep their touches, while a touch on a canvas is cancelled before
  and after. All four cancelled on the lane's tree before item 164; 4 real mutants red, the identity green. jsdom
  synthesizes no click; the e2e taps (the gear in `touch-controls.spec.js`, Respawn in `death-pointer-lock.spec.js`) are the
  click on CI.

**Not covered:** a real iPhone or iPad (item 161); a tap on Keep exploring or the context-loss panel in a browser (jsdom
only); the release while a lock request is pending (item 160).

## 2026-10-30 — [LOOP] W2-L: every animated element renders `m`, under one strict LazyMotion provider

**Decided by the W2-L builder under the standing grant** (DECISIONS 2026-10-28 item 14), as the rest of reset item 14: the
index chunk stops carrying framer-motion features the game never uses. Each stands while it earns its place.

140. **`motion.X` is `m.X` in the 12 modules that animate; `src/ui/MotionProvider.jsx` is the one provider, App's outermost
   element, with `features={domAnimation}` and `strict`.** The inventory (33 elements, 13 `AnimatePresence` blocks) uses
   only `initial`, `animate`, `exit`, `transition`, `style`, `onClick` and `onAnimationComplete`: no `layout`, `layoutId`,
   `drag`, `Reorder`, hover/tap props or motion hooks anywhere, so `domMax` is not needed and `domAnimation` is all that
   is loaded. `src/index.jsx` has the only `createRoot`; the R3F canvases and drei's `<Html>` bubble render no `m`, so one
   provider covers it, and the lazy panel chunk renders inside the same root and context. The features are passed as a
   bundle, not a loader: a loader (`features={() => import(...)}`) was built and measured as an option and not shipped.
   **Measured on the same tree** (`npm run build`, minified bytes): index chunk **681,632 B to 634,075 B, -47,557 B
   (-7.0%)**; gzip 229,012 B to 215,162 B, -13,850 B. The loader variant reads index 597,267 B (-84,365 B, gzip 202,566 B)
   plus a 38,030 B features chunk. The plan's "about 124 KB" was a lens-reported figure for the whole framer-motion share.
   The round-1 dynamic review measured that share by splitting framer-motion into its own chunk (`manualChunks`) on both
   trees: **137,650 B at base and 90,050 B left at head**. What leaves with a synchronous `domAnimation` is drag, layout
   and projection, which nothing here used: 47,557 B. Of the 90,050 B that stays, the loader variant defers about 37 KB
   (its features chunk is 38,030 B), and `domMin`, which drops the gesture features, would take 5,631 B. **Why not the loader's extra
   36.8 KB:** the title overlay is the first thing a player sees and fades in from
   `initial` (opacity 0), so a loader shows an empty title until a second request resolves, and a request that fails leaves
   every panel at opacity 0 for good with nothing thrown; `render/dragonLoader.js` needed a retry and a give-up path for
   exactly this. **Door:** swapping to the loader is one line in `MotionProvider.jsx` plus a `modulepreload` in
   `vite.config.js` (as `preloadGameIcons` does) and a retry, recorded as a new dated entry that names this one; nothing
   else in the 12 modules changes. It is an open registry row (`REVIEW:w2l:loader-door`), as is the smaller `domMin` door
   (`REVIEW:w2l:domin-door`, 5,631 B, which would turn a future gesture prop into a silent no-op).
141. **The index ceiling falls with the chunk: 700,000 B to 652,500 B** (`scripts/ci/bundle-budget.mjs`, `actualAtWrite`
   634,075 B). The headroom kept over the measured size is the 18,368 B the old ceiling left over the old measured size, so
   the lanes still in flight keep exactly the room they had and nothing else gets the 47,557 B freed. Mutants run through
   `npm run build` and the gate: the full `motion` component put back in an index-carried module (`ui/GameHud.jsx`) reads
   682,123 B, RED; `domMax` in the provider reads 682,104 B, RED; the identity edit (a comment) reads 634,075 B, green; the
   full `motion` in a module only the lazy panel chunk carries (`ui/panels/ForgePanel.jsx`) reads 636,434 B, GREEN, so the
   ceiling does not see that case; the strict unit gate does (item 142), and so do the full-motion markers (item 145),
   which read every chunk of the build and name `panelBundle`. The ceiling holds the modules the index chunk carries.
142. **Three gates and an e2e hold it.** `tests/gates/lazy-motion-strict-gates.test.jsx` mounts one real component from each
   of the 12 modules (18 components) under `MotionProvider` and nothing else: a `motion.*` left in any of them throws, and
   two controls show the instrument sees both ways (a `motion.div` under the provider throws; an `m.div` under it draws a
   value strictly between its start and end). `tests/gates/app-motion-provider-gates.test.jsx` renders the real App (the
   two 3D scenes stubbed) and watches the title overlay fade from opacity 0 to 1, which fails when App renders no
   provider; the strict gate cannot see that, because it imports the provider itself.
   `tests/e2e/lazy-motion.spec.js` opens the Talents page by Tab and a real click and samples the card's scale and y and
   the dialog's opacity on the frames the page draws (`tests/e2e/_motionSample.js`), with the page's clock (`performance.now`,
   which framer-motion's frame loop reads) slowed to a fiftieth from the panel's insertion until the sampler is done. Two CI
   runs, each at the spec's first attempt, are why. At normal pace the world drew a frame every 130 to 620 ms and a 350 ms
   spring fit between two of them (scale 0.9 at 921 ms, 1 at 1539 ms): the spring runs against the clock, and the clamp on the
   frame loop's step does not apply to an animation's own clock. Slowing the document timeline through CDP
   `Animation.setPlaybackRate` instead, to stretch the fade, left the fade at opacity 0.012 after 6765 frames. Slowing the
   clock stretches the springs' crossing of their ends to 6 s, ten frames at the slowest cadence seen. Each of the first two heads
   passed on its retry. The third passed at its FIRST attempt (CI run 41072281889, shard 5: 30 samples, strictly between
   the ends on scale 8, y 8, opacity 1): one run that did not flake, with the mechanism above as the reason it should not.
   No flake rate was measured, before or after.
   `tests/gates/motion-sample-gates.test.jsx` runs the sampler on the real panel in jsdom with the thread blocked so that
   frames land 600 ms apart (a jump at normal pace, the first CI failure reproduced; an animation at the slowed clock) and
   the verdict on series known by construction. Mutants, each RED on the test named and each run
   against a green baseline by `scripts/dev/mutate.sh`: `motion` back in each of the 12 modules (12 of 12), the provider
   without `strict`, the provider whose features never load (strict gate and App gate), App with a pass-through provider,
   and twenty-five verdict, sampler and clock mutants; the identity edits stayed green. The e2e itself was not run locally: CI is
   its arbiter, and its mutants are argued in the spec.
143. **What is not proven.** `strict` is dev and test only (framer-motion 12.43 skips the check in a production build), so
   the shipped artifact is held by the bundle budget: the index ceiling for modules the boot chunk carries, and the two
   full-motion markers (item 145) for every chunk. A second React root that
   renders `m` outside the provider would render it frozen and nothing would report it; today there is one `createRoot`.
   The component tests elsewhere (HUD, MenuSystem, QuestSystem and the rest) render `m` without a provider and so without
   animations: they pass, and they never exercised the animation. The Chromium e2e reads the transition at a fiftieth of its
   speed (the page's clock is slowed from the panel's insertion), so it says the transition is there and ends, not how fast it
   plays. No frame of it was looked at on a screen; the feel is Kevin's.
144. **The CI e2e's numeric sample stands in for the plan's "one clip".** The plan row for W2-L
   (`docs/superpowers/plans/2026-10-28-crafty-sota-reset.md`, "Acceptance on the live game") asks for "Live: panel
   transitions still animate (one clip)". What exists is `tests/e2e/lazy-motion.spec.js`: the real Talents panel in
   Chromium, sampled on the frames the page draws (CI run 41072281889, shard 5, first attempt: **30 drawn-frame samples,
   values strictly between the ends on scale 8, y 8 and opacity 1, the end reached**). The reasons it stands in: the
   question the clip answers for this change is whether a transition still moves, or sits frozen at `initial`, and the
   sample reads exactly that, with a denominator and a verdict, where a clip is a person's look; a clip of the world at
   the normal clock on the CI runner (frames 130 to 620 ms apart) shows the 350 ms spring as a jump, the artifact that
   failed the first two heads; and the lane ran no local browser (`CLAUDE.md`, SSD-light lanes: no local e2e unless a look
   question needs a real GPU, and whether a transition exists is not one), so the CI run is the live game here. What a clip would add and the sample cannot is how the transition looks and how fast it
   plays, and that stays Kevin's (item 143). The plan's text is unchanged; registry row `ACTIVE_PLAN:T21` stays closed
   on this reading.
145. **Two more gates, and the two unit cases that read a tween run on a slowed clock** (round-1 reviews). (a)
   `scripts/ci/bundle-budget.mjs` reads every built chunk for `isProjectionDirty` and `dragElastic`, strings that occur
   only in motion-dom's projection node and framer-motion's drag in 12.43 and that no chunk of the lazy build carries; the
   full `motion` component put back in `ui/panels/ForgePanel.jsx` (index 636,434 B, under the ceiling) puts both in
   `panelBundle` and reds the gate, and in `ui/GameHud.jsx` puts both in the index chunk. Controls: `animationState` and
   `whileHover`, which `domAnimation`'s own code carries, must be found in some chunk, so a minifier change fails the
   gate instead of passing it. (b) `tests/gates/lazy-motion-exit-gates.test.jsx` closes the real Talents panel inside
   `AnimatePresence` under `MotionProvider`: the node must still be in the DOM on the first read, the dialog's opacity
   strictly between 1 and 0 on some read, and the node gone at the end; features without `exit`, without `animation`, or
   with the renderer alone each red it, and the same panel with no provider is the control. (c) The `m.div` control in the
   strict gate and the sampler case that finds the card and the dialog now run at a tenth of real time (`slowPageClock`,
   `clockFactor`), because framer-motion clamps only the frame loop's delta (motion-dom `batcher.mjs`, `maxElapsed` 40) and
   reads every animation's own elapsed time from `performance.now()`, so one stalled frame can step over a whole tween;
   the comment that said otherwise is corrected. (d) The strict gate's population case now says it counts its own table.
   Not done: an ESLint `no-restricted-imports` rule on `motion`, the static review's suggestion; the markers read the
   shipped artifact, which a lint rule does not. One dragon-fight e2e case failed its first attempt on all three CI runs of
   this branch since 30cde21c (41072281889, 41082219534, 41085691344), each time with `calls: []` on the zone or the
   burn, and passed on a retry (the lane touches no dragon, zone or damage code, and its base rate on main is unknown):
   registry row `REVIEW:e2e-flakes:dragon-fight-burning-zone-never-reached`. A mob-floor SETUP failure on run
   41082219534's first attempt is `REVIEW:e2e-flakes:mob-floor-roof-no-heading`.

---

## 2026-10-30 (round 3) — [LOOP] fix/invisible-box round 3: a chunk's first trimesh is cut where its body is

**Decided by the command session** on round 2's reviews of PR #59. The dynamic review said land. The static review's
finding 1 was confirmed by the command session's run of its repro R1, so it blocks.

136. **A chunk's first trimesh is put where its body is before the cut reads it.**
   - **The defect.** @react-three/rapier 2.2 makes a chunk's body with no translation. The TrimeshCollider's effect
     makes the trimesh on it, and only then does the RigidBody's own effect move the body (`setTranslation(position,
     false)`). Rapier carries a body's move to its colliders at a step or a propagation. So until the next step, a
     first-mounted chunk's trimesh lay in chunk-local coordinates over chunk 0_0, where the player spawns, and item
     133's cut swept the player against it there. That happened on any frame that took no step while chunks streamed
     in.
   - **R1.** Before the step the trimesh sat at x 0 and the cast hit it (toi 0.29997). After the step it sat at x 48
     and the cast missed. With `world.propagateModifiedBodyPositionsToColliders()` before the cast, it sat at x 48 and
     the cast missed.
   - **Where.** `landed()` in `world/placedCellColliders.js` propagates when it lists a trimesh. ChunkMesh's effect runs
     after the RigidBody's, so the body has moved by then.
   - **What else it moves.** Measured in node against rapier3d-compat 0.19.2 with this tree's `moveKinematic`:
     - a pending kinematic move is left alone: the player's collider, `translation()` and `nextTranslation()` are
       unchanged, and the KCC returns the same movement;
     - after a teleport, the player's collider moves to `translation()`, where the next step would put it, so the guard
       and the KCC read the body where it is;
     - the broad phase still misses the trimesh until the step, so the cut stays.
   - **Why not in the cut.** There it would run on every no-step frame with an unindexed collider, in the Player loop.
   - **Cost.** One propagation per chunk landing, over the bodies moved since the last step.

Also in this round:
- **The placement numbering lives beside the worker.** `createEditSeq()` is made at module scope in `Terrain.jsx`, next
  to the worker, and handed to each registry. So a remounted world numbers past the worker's last seq, and an older
  mesh never retires a new cell's stand-in (round 2's static finding 3; the world mounts once in production).
- **Corrected above.** Items 132 to 134 say that a no-step frame happens at any rate, what the cut allocates, and that
  the pending move matters at 60 Hz.

**Gates.**
- **The node gate's harness** now mounts a chunk the first time as @react-three/rapier does, in React's effect order.
  The new case runs one scene three ways, holding W:
  - no chunk event (the control);
  - a far chunk's land laid over the origin, handed to the cut (it must cut the walk: the instrument sees a cut);
  - the far chunk's real first mount (it must walk what the control walks).
- **Red on `c7972f38`:** the trimesh was at x 0 when the sweep ran, and the walk was cut to 0.000 of 0.228 m.
- **Mutants** (`scripts/dev/mutate.sh`):
  - no propagation: RED;
  - propagation moved to after the step: RED;
  - each registry numbering from 1: RED;
  - the numbering copied, not shared: RED;
  - two identity mutants: GREEN.
- **The shore e2e** now asserts that each placing click held a stand-in at the click, and that the count was back to 0
  within the watch's 30 frames.
  - **Red on CI.** The branch `mut/invisible-box-echo-ec42c85e` is `ec42c85e` plus one change: the worker drops the
    click's seq, so every mesh echoes 0. Its dispatched run 41070477369 failed on that spec alone (shard 6: 1 failed,
    11 passed). The first attempt and both retries failed at the new assertion: "the stand-ins after the placing click
    at -100_30_-25 were not back to 0 within 30 drawn frames (held [1, ... 30 times]; ray solid at 1, mesh set at 1)".
    The unit, lint, knip and build job passed on the mutant, because no unit test can see the echo.
  - **Green on the head.** `ec42c85e`, run 41070432988, passed on its first attempt with no retries. Each of the three
    placing clicks held 1 stand-in at the click, and the counts after it read [0,0,0,0].
- **Not gated:**
  - that `Terrain.jsx` hands the module-scope numbering;
  - the Player loop's argument to `moveKinematic`, which carries the cut;
  - `castCollider`'s `stopAtPenetration` (a surviving mutant, registry
    `REVIEW:fix-invisible-box:cut-penetration-unpinned`).

## 2026-10-30 (later) — [LOOP] fix/invisible-box round 2: a placed cell is solid from the click

**Decided by the command session** on round 1's two reviews of PR #59. The dynamic review ran a seeded chaotic clicker
against real Rapier and the real mesher with the placed cell's trimesh landing late: 3 of 10 runs ended held at 2 frames
late, 7 of 10 at 4 (one with the eye inside the block, Kevin's invisible shape), 8 of 10 at 8. The live delay was
unmeasured and is longer on iPad-class devices. So the timing path is closed in code in this PR, not left as a MED row.
These items supersede item 131's "Left open" note.

132. **A placed cell is solid to the player from the click.** `world/placeAtHit.js` asks
   `world/placedCellColliders.js` for a fixed 1 m cuboid at each cell it places. The cuboid stays until the chunk's
   trimesh holding that edit is in Rapier's broad phase, retired by sequence:
   - `update_block` carries `seq`, and `terrain.worker.js` stamps every `chunk_mesh` with the last seq it has applied;
   - ChunkMesh's effect, which runs after its TrimeshCollider's own, marks its chunk's cuboids up to that seq;
   - they go after the next world step, so a mesh made for an earlier message still in flight never retires a later cell.
   They go after the step, not at once, because rapier3d-compat 0.19.2 adds a collider to the broad phase only on a
   step. Measured in node: a cuboid made between steps was missed by `computeColliderMovement` and `castRay` until the
   next step, and the API has no call that refreshes the broad phase. A cuboid also goes when its chunk unmounts and when
   a world load wipes the terrain. Cost: at most `MAX_CELLS` (64) cuboids a click, each alive from the click until one
   step past its chunk's re-mesh. The cut (item 133) allocates on a frame with unindexed colliders: each
   `castCollider` call makes two velocity vectors in Rapier's JS binding (freed in the call) and a hit object when it
   hits. A frame with none allocates nothing for this.
133. **The controller's sweep is cut at colliders made since the last step.** That covers a fresh cuboid and a chunk
   trimesh just mounted or rebuilt. `game/kinematicMove.js` casts the capsule against each one pairwise and stops the
   move the KCC's 0.05 m offset short. @react-three/rapier's stepper subscribes before the Player loop and steps first,
   so in the game only the sweep of a frame that takes no step runs blind. That is every other frame at 120 Hz, and at
   any rate a frame whose accumulator is still under 1/60 s, which frame jitter makes at 60 Hz too.
   - **Why the trimesh too.** Rapier gives a collider made between steps the slot, and the broad-phase leaf, of the
     collider freed last. A lone chunk rebuilt in place gets its own leaf back. Two chunks rebuilt in one React commit
     (every passive cleanup runs before any setup) swap leaves, and a sweep before the step finds neither. In the node
     gate, a player holding W against a two-high step walked through it (x 3.45 to 1.56 at 60 Hz, to -1.57 at 30 Hz).
   - **Cost and limit.** One pairwise cast per such collider, on a frame that has any; every chunk mount and rebuild
     makes one, not only a placement (the allocation is in item 132). The cut is a straight line, so on that frame an
     autostep onto that chunk can be cut short; the next frame climbs. Round 3 found it also swept a first-mounted
     chunk's trimesh over the world origin (item 136).
134. **The placement guard also tests where the body is going.** It tests the capsule at the collider's position and
   offset by `nextTranslation() - translation()`. The world steps before the Player loop moves the body, so between
   frames, where a click is handled, the frame's move is pending at any frame rate, not only above 60 Hz, and the next
   step puts the body there (`kinematicMove.js`). Round 2's dynamic review ran the clicker in the game's order (step,
   then move) with the trimesh at lag 0: on `e177b5b8`'s code, whose guard tested only the stepped position, 4 of 10
   runs ended held at 60 Hz; on round 2's, 0 of 10.
135. **The from-inside left click asks the body's eye, not the camera.** This supersedes item 131's "the camera's own
   cell". `mineTarget` now reads the body from the store and takes its steady eye (`combat/swingOrigin.js`). The camera
   carries the walk bob, the screen shake (2.43 m off the body in a dodge's first frame) and, for the 1.2 s roar, a pose
   4.5 m behind and 2.2 m above the body. Asked of the camera, a roar inside the player's own walls took the wall block
   the camera sat in. The node gate's roar case is red when `mineTarget` takes the ray's origin as the eye, which was `e177b5b8`'s semantics.

**Gates.** All are in `tests/integration/place-clear-of-player-rapier.test.jsx`:
- the static review's late wall at trimesh lags of 2, 4 and 8 frames, with frames of 1/60 and 1/30 s, each swept before
  its step (the worst order);
- an earlier mesh still in flight;
- a ray at the cell between the landing and the step;
- the stand-ins' lifetimes, and two chunks rebuilt in one commit;
- a seeded chaotic clicker at lags of 2, 4 and 8, which counts every frame the capsule reaches into any solid cell.

On `e177b5b8`'s `placeAtHit.js`, `kinematicMove.js` and `buildTarget.js`, all 16 new stand-in and cut cases are red: at 4 and
8 frames late the wall held the player with the eye inside the cell. Mutants (`scripts/dev/mutate.sh`):
- 22 of 22 real mutants red, across the guard, the stand-in module, the cut and `mineTarget`. The cut's offset and
  nearest-hit mutants each survived the first run and got a case.
- Five identity mutants stayed green.

The e2e logs, and does not assert, the live frames from a click to a solid cell, to the chunk's new mesh and to the
stand-in's retirement. The worker's seq echo and Terrain.jsx's wiring are proven by the build and that log, not by a
unit gate. Landed in `9353690a` (items 132-134), `112b8b3e` (item 135, and the gate's bull swapped as the game swaps
it) and `111ca09c` (the e2e log).

## 2026-10-30 — [LOOP] fix/invisible-box: a placement never fills the player's own body

**Decided by the fix lane under the standing grant** (DECISIONS 2026-10-28 item 14), from Kevin's live report of
2026-10-30 against `4a01607b`: "seems to get stuck in an invisible box when travelling near the oceans, or caused by
digging some blocks or something, i was left click / right clicking chaotically." Two independent diagnoses reproduced
the cause in node against real Rapier (one on Kevin's own column, -78, -4) and refuted the others: the collider is built
from the drawn arrays and rebuilt on every edit, so the two never disagree in geometry; a chunk seam cannot open a hole;
water has no faces and no collider, and the ocean was where he stood, not the mechanism.

130. **A right-click never fills a cell the player's body fills.** `world/placeAtHit.js` wrote whatever cell the build
   ray named. Pressed against a step, a level right-click at its face names the cell the camera is in; looking down, the
   feet's cell. The chunk's trimesh collider then held the capsule from inside (0 m walked and 0 m risen over 16 tries),
   and with the eye in the cell every face of the block points away from it, so the FrontSide material drew nothing.
   Now every footprint cell that overlaps a live collider of the player's body is dropped, the rest place and are paid
   for, and the player is told "No room: you're standing there". **The live collider**, so a beast form's wider capsule
   counts. **The capsule itself, not the KCC's 0.05 m offset around it:** a cell inside that band but clear of the
   capsule did not hold the player at gaps of 0 to 0.1 m, and refusing it would refuse a block laid against the
   player's side. Landed in `2fb8c72c`. Gate: `tests/integration/place-clear-of-player-rapier.test.jsx` (5 of 7 red on
   `4a01607b`'s placeAtHit; seven mutants red, an identity mutant green).
131. **From inside a placed block, a left click takes that block.** The build ray from inside meets the block's own
   inner face, so the step past the hit landed in the cell beyond, and the left click mined a neighbour while the box
   stayed: a save written before item 130 can still hold the player that way. `world/buildTarget.js` `mineTarget` now
   returns the camera's own cell when a placed block (`store.worldBlocks`) fills it; the click and the white outline
   share it, so the outline frames the cell the click takes. Generated terrain is the worker's and is not consulted.
   Landed in `c3af8e82`. Gate: the same file's old-save case (red on the extracted old targeting: the three clicks took
   3,31,8, 4,31,9 and 4,30,8 beside the box at 4,31,8; three mutants red, an identity green).

**Lived proof:** `tests/e2e/place-clear-of-player.spec.js`, on a beach column near Kevin's spot: nine real clicks aimed
on their own mousedowns (a pillar ahead, a level right-click at its face, one straight down, the pillar mined, a block
placed and mined behind), then real W, A, S and D; then a block written around the camera as a load writes one, a real
left click, and the walk out. Its red half is the CI run on `14058415` (the burst on the unfixed placement).
**Left open:** a block whose collider lands after a moving player has walked into its cell still holds them; a block
at the feet can be mined by looking down, one at the eye only by item 131
(registry `REVIEW:fix-invisible-box:collider-lands-late`).

## 2026-10-30 — [LOOP] W3-B PR B: every dragon attack has a tell, the skill answers reach it, and so do the Aspect kits

**Decided by the W3-B dragon lane under the standing grant** (DECISIONS 2026-10-28 item 14), building Units 2, 3 and 4 of
`docs/superpowers/plans/2026-10-27-crafty-shadow-dragon.md` and reset-plan row 25 by the task script
`docs/superpowers/plans/2026-10-30-crafty-w3b-dragon.md`. Each stands while it earns its place.

123. **The dragon's rules are a pure move machine over one shared record.** `game/dragonMoves.js` (in the dragon's lazy
   chunk) mutates `game/bossCombat.js`'s record (in the boot chunk, so the dodge start, the cone, `damageBoss` and the
   systems that hit mobs read it before the dragon has loaded) and returns events `render/BossEntity.jsx` applies. One
   move at a time, each with a windup on the world clock: bite 520 ms and dive-bite 520 ms (parryable), fireball 600 ms,
   roar 900 ms with a 9 m radius and a falloff from 1 to 0.4 (its range defined only through `roarFalloff`), the lava
   placed when its move starts (its zone's 750 ms ring is the one warning), the summons 700 ms. Cooldowns are charged when
   a windup starts. A roll's i-frames make the roar a whiff, impulse included. Every tier carries `tricks` (fireball,
   lava, summon), the one list the machine reads for its non-core moves. **Why:** the fight bit with no warning and roared
   the player across the map from anywhere; a tell for every attack is what makes it a fight (the contract's goal).
124. **The attacks are read from the ground, and their toasts go (amends item 92).** Each windup shows one decal from a
   fixed pool of three meshes in the dragon's own frame loop: the bite a sector of its reach about its heading, the roar
   a ring of 9 m, the fireball a disc of 1.6 m on its mark, the summons a ring of 7 m; the lava keeps its own ring. The
   head's glow climbs to the danger red through the windup (the interim tell on today's model). **Each decal covers
   exactly the ground its move lands on:** a windup commits its aim (the player's feet when it starts, and the heading
   to them); the dragon faces that heading through the windup; the bite lands only inside its quarter-turn sector, and
   the fireball flies to its mark and bursts there, hitting only a player on the disc, which stays on the ground (one
   disc per fireball in flight, capped by its cooldown) until the burst. Why the sector and not a full disc: a bite with
   a front is dodged by stepping aside or behind, which is the read the arc was drawn to teach. `bossAttackCall`, the `attack` class
   in `ui/notifications.js` and the four attack keys are deleted, with the gate that simulated the line through a fight
   (its subject is gone) and the e2e's attack-call states. The phase calls now say what to read. **Why:** an attack
   announced by a toast after it has landed teaches nothing; the ground is where the player looks. One decal costs one
   transparent draw during a windup and none at rest.
125. **The perfect dodge, the heavy and the riposte reach the dragon.** The dodge start appends the record to its targets
   while the dragon fights and is not immune (`withBossTarget`); its bite and dive-bite are parryable, its casts are not.
   A heavy on a staggered dragon refreshes the 1400 ms stagger, the third knocks it down for 3000 ms, then 4000 ms of
   immunity (`registerBossHeavy`): three heavies cannot fit one 1400 ms stagger, since a heavy is ready 700 ms after its
   press, so the chain keeps every roadmap number and makes the knockdown reachable at about one heavy a second.
   `damageBoss(amount, source)` applies the 1.5x riposte to the player's damage only. The melee cone tests the head, chest
   and hips. In phase 0 the dragon dives to the player's feet + 1.2 m when its dive-bite is ready (the first dive one
   6 s cooldown after it wakes, so a fight opens with it circling), and a staggered dragon lands. **Why:** the game's two newest skills did nothing to its last enemy.
126. **One damage path for the dragon (reset-plan row 25).** `bossTargets(mobs)` hands hurl and its slam, the element
   zones and the squad the mobs with the dragon appended while it fights (zones and allies only while it is not
   airborne: they paint and fight on the ground); `CombatSystem.damageMob` routes the dragon's id to `damageBoss` with the
   source; a burning spell starts its burn on the dragon's id; the pure hit tests add an entity's `bodyRadius` (0 for a
   mob). **Why:** three Aspect kits did nothing in the climax fight. The full move of the boss into the ECS stays a later
   step, on its own merits (the reset plan's row 25 wording).

## 2026-10-30 — [LOOP] W3-B PR A: the dragon is a lazy chunk, and the lookbook can hold it

**Decided by the W3-B dragon lane under the standing grant** (DECISIONS 2026-10-28 item 14), building Units 1 and 10 of
`docs/superpowers/plans/2026-10-27-crafty-shadow-dragon.md` by the task script
`docs/superpowers/plans/2026-10-30-crafty-w3b-dragon.md`. Each stands while it earns its place.

120. **The dragon's Units 1-4 go before move 11's surfaces.** The refute ordered the dragon "after 11"
   (`refute-2026-10-27.md:104`), and the dragon plan's review amendments made move 11's U1 a precondition for its Units 3
   and 5. Move 11's edge telegraph, HDR gain and decal pools are not on main and the reset plan moved them to W3-A
   (`sota-reset.md:539`), which runs beside this lane. **Why:** the tells are the fight's rules ("rules first",
   `upside-2026-10-27.md:52`) and need no shared surface: the decals are the dragon's own fixed pool of three meshes driven
   from `render/BossEntity.jsx`'s one frame loop, which W3-A's telegraph can absorb. Unit 5 (the rig) still waits for
   W3-A's edge telegraph and HDR gain; Units 6-9 are registry rows.
121. **The dragon is its own chunk, and a chunk that never loads suspends the fight.** `render/dragonLoader.js`
   `LazyDragon` replaces GameScene's static mount (index 682,746 -> 676,277 B on the build of that commit; the dragon's
   chunk 8,969 B); `world/bossSystem.js` preloads it when the player qualifies and at mount for a restored fight. The
   lazy dragon sits in its own `<Suspense>`, because React 19 hides every sibling of a lazy that suspends in a revealed
   boundary on a non-transition update and runs their layout-effect cleanups, where R3F's `useFrame` unsubscribes. A
   failed chunk is tried again three times, 5 s apart, then the encounter is SUSPENDED through the store's
   `suspendBossEncounter`: the bar, music and mood end, the HP and tier stay in the save, and the lair re-arms once the
   player has walked out of it: a player still standing there is left in a quiet lair, the chunk is fetched again only
   on a new arrival (three retries per arrival, never on a timer), and the resumed fight plays no second entrance.
   **Why the store:** GameScene's props come from `App.jsx`, which the W2-G lane holds. **Why the walk-out:** re-armed
   at once, a player at the lair woke the fight on the next poll and replayed the entrance and the failing retries
   about every 17 s.
122. **The production build can wake the dragon, only on a `?lookbook=1` page.** `world/bossSystem.js` installs
   `lookbookSpawnDragon` only when the URL carries the exact parameter; the seam's `dragon({ pose, position })`
   (`render/lookbookSeam.js`) reaches it and holds the dragon still (`lookbookDragonHold()`, read per frame by
   `BossEntity`). `scripts/visual/lookbook.mjs --sets dragon` shoots the dragon arena: the dragon over the Blight Heart
   lair, framed from the way a player walks in. **Why:** the fight's looks are judged on real-GPU frames of the shipped
   bundle (W1-H item 1), and the only spawn was DEV-only. A player who types the parameter gets the seam and nothing else
   until a script calls it.

## 2026-10-30 — [LOOP] W2-G: one event bus, a world seed, the DEV bridge out of App, autosave from PERSISTED_KEYS, production knip

**Decided by the W2-G platform lane under the standing grant** (DECISIONS 2026-10-28 item 14), building reset-plan rows
26, 27 and 41 by the task script `docs/superpowers/plans/2026-10-30-crafty-w2g-platform.md`. Row 25 is the dragon
lane's. Each stands while it earns its place.

110. **One typed event bus, `game/eventBus.js`.** A closed set of names (mobKill, levelUp, reward, victory); a name
   outside it throws at subscribe and at emit, so a typo fails where it is written. Positional payloads and
   copy-on-write subscriber arrays, so an emit allocates nothing. An array, where the kill bus had a Set: a callback
   subscribed twice is called twice per emit, and one unsubscribe removes both. Nothing subscribes one callback twice
   (each kill consumer mounts once, with its own). `game/mobKillBus.js` keeps the kill event's two helpers on it
   because `systems/CombatSystem.jsx`, which the dragon lane holds, imports them (registry
   `REVIEW:w2g:mobkillbus-fold`).
111. **The sound layer subscribes; the `window.play*` globals are gone.** The level-up, reward and victory emitters
   emit; `SoundProvider` subscribes through `audio/soundEvents.js`, the one event-to-voice table. `useGameSounds` loses
   its three reward verbs. `window.playSpellCastSound` was never assigned, so it never sounded, and the cast already
   plays `magicCast` at the muzzle: its call is deleted and no cast event replaces it (it would play twice).
   `reward-audio-gates` and `victory-audio-gate`, which read window globals and source text, are deleted;
   `event-sound-gates` drives the real emitters, bus and provider instead.
112. **A world records its seed in `game_state.worldSeed`; New World writes 12345.** In `game_state` so the tombstone
   carries it through a build that does not know it. An absent or unusable seed is 12345, the seed every earlier save
   was played on. `world/worldNoise.js` builds the noise for the terrain worker and the climate sampler alike; a load
   sends the seed on `load_modifications` and re-seeds the sampler. New World keeps 12345 because no new seed is shown to
   give a valid spawn: the Hearth, the shrines, the Blight Heart and the landmarks are placed for 12345's terrain
   (registry `REVIEW:w2g:real-world-seeds`).
113. **The autosave triggers on `PERSISTED_KEYS`, and a change joins a pending save.** `saveSchema.js` declares the keys a
   save records (traced against `buildSaveData` by `autosave-trigger-gates`); `game/autosave.js` `installAutosave`
   triggers on them, so `worldSeed` and `_tombstone`, which App's hand list lacked, now save. The clock writes `gameTime`
   every second, so the old restart-on-change debounce never fired during play; now a save lands 5 s after the first
   unsaved change, mid-combat included. Measured in node on the M3 Max: building and serializing a save takes 0.06,
   0.28 and 1.17 ms at 500, 5,000 and 20,000 block edits. That is not the write a player waits on: in the page,
   `writeWorld` also parses the world list and calls `localStorage.setItem`, synchronously on the main thread, and
   neither is measured, on this machine or an iPad. So the figure does not say whether the autosave can stall a frame
   (registry `REVIEW:w2g:autosave-cost`).
114. **The DEV bridge is `devtest/devBridge.js`, imported inside `if (import.meta.env.DEV)`.** `bundle-budget.mjs`
   checks every CI build: no name `src` registers through `registerTestHook` (59) is the quoted first argument of a
   call in any chunk, and no chunk sets `window.__craftyTest`. It matches the call, not the word, because some hook
   names are ordinary words in the bundle ("start" in react-dom, "viewmodel" a scene name, and store actions such as
   `setTimeOfDay`). One registration, `readCompatMouse` in `Components.jsx`, has no DEV guard; the build drops it only
   because no shipped code reads the registry, and removing one other hook's guard ships it with four more (mutant H3
   of the check's proof). The message of `a1b7fabe` miscounts:
   36 hooks moved (it says 39), and App lost 30 imported names on 18 lines (it says 27 imports).
115. **Production knip runs in CI beside knip.** `.knip.json` marks the shipped entries with `!` and leaves four src
   modules the game never imports out of the production project (`brand.js`, `i18n/keyReachability.js`,
   `theme/contrast.js`, `world/detile.js`). The 51 exports only tests or tooling reach carry `@internal` with the reason
   in the tag: 5 test seams, 12 shader twins or gate oracles, 16 constants and lists their tests enumerate, 5 inputs of a
   script or the tailwind parity test, and 13 no game code calls (registry `REVIEW:w2g:test-only-exports`). The message
   of `377dcec6` says 15 and 15 for the second and third; the counts are 12 and 16. The `start` script duplicated `dev`
   and nothing ran it, so it is deleted.
116. **`atmosphere-isolation-gates` reads one hook's own body.** Its fixed 700-character window after `exitCapture`
   reached `openModal`'s reset, so deleting `exitCapture`'s stayed green; the slice now runs from a hook's registration
   to the next, comments stripped.

## 2026-10-30 — commit `faa65ee1` carries the WRONG message. Read this instead.

`faa65ee1` on `feat/w2d-hud` is titled "fix(render): Show Stats no longer paces the game it measures", another lane's
message. Its author wrote the message to a fixed file name in a scratchpad that sibling agents of the same session
share; the shell refused to overwrite the sibling's file of that name, the next command was not chained on the write,
and `git commit -F` committed the staged work under the sibling's text. The rule kept: a commit is never amended, so
this entry and the next commit's body carry the real message. **What `faa65ee1` contains:** the dragon's attack calls
rank below every other notice in the phone's one line, and its one-off calls still take it at once (item 92, as amended
that day): `world/bossSystem.js` `bossAttackCall` (marked `attack`), `ui/notifications.js` `lineNotification` (one-off
call, then plain notice, then attack call), `render/BossEntity.jsx` raising its four attack calls through it, the gate
`tests/gates/boss-attack-line-gates.test.js` (REMOVED with the attack calls, item 124; a plain notice held 0-800 ms of 4 s at the fireball's 2.4 s before, its
whole 4 s after, over 11,520 simulated fights), the e2e attack-call states, and registry
`REVIEW:w2d:boss-attack-calls-unread`. Its mutation proof is in the next commit's body. The Show Stats change the title
names is not in it.

## 2026-10-29 — [LOOP] W2-D PR B: warm charcoal, three panels, the controls panel, automatic claims

**Decided by the W2-D HUD lane under the standing grant** (DECISIONS 2026-10-28 item 14), building W1-H item 2(c) and
reset-plan row 12 by the task script `docs/superpowers/plans/2026-10-29-crafty-w2d-hud.md`, stacked on PR A (items 90-94).
Each stands while it earns its place.

95. **The chrome is warm charcoal.** The whole navy ladder moves (panel #2A2420, panelRaise #38302A, panelFrame #302924,
   panelInset #181411, and well, slot, control and track, which carried the same navy), the ink to #120E0B, textMuted
   to #A8A096 and the common rarity tile with them; the public face (theme-color, the no-JavaScript page, the manifest,
   the app icons) follows its ground. **Why:** the world's palette is ember and gold, and the navy read as a second,
   cold palette laid over it (the visuals lens). `tests/theme/tokens.test.js` holds every surface step warmer than it is
   blue; the contrast gate holds every text pair at its floor. The README hero and the og card are frames of the
   production build and still show the navy until the media pipeline (W2-H) re-shoots them (registry
   `REVIEW:w2d:media-after-rekey`).
96. **Three panels where there were seven, a controls panel on H, and quests that claim themselves.** Supersedes the
   E, M, U, L and Q bindings and the Tab achievements panel. Character (Tab: gear, spells, talents) and Journal (J:
   quests, achievements; feats when item 97's work lands) are groups of the panels that were there, each tab opened by its own flag, with a strip of tabs above
   the open panel; Build stays on B; the touch tray offers Character, Talk, Build and Journal. H opens a controls panel
   generated from KEY_MAP (every row's label now a key in both dictionaries) in place of the sheet that faded after 8
   seconds (STATUS C1/c). **A first session (the command session's call):** a desktop player who has not opened the
   panel sees the controls card at rest until they press H or have played 30 s with the card on screen (time paused or
   in a panel does not count); the card is one bare line above the hotbar, six essential keys drawn as the hint is (WASD,
   LMB, RMB, Tab, J, H, each a KEY_MAP key), because the whole list in a panel read 8.47% of a 1280x800 frame at rest by
   the footprint; it then folds to the one-line "H Controls" hint, which stays, on a keyboard only, until H opens the
   panel once. **Measured at rest on this branch's committed head** (lookbook eye set, footprint, real GPU, 2026-10-30
   04:19-04:28Z, at `1791b3d5`, clean tree, after PR A's round 4; the commits after it on this branch changed the e2e spec
   and these records only (`git diff --stat` to `688d3f03`), and then, with PR A's rounds 5 and 6, where a notice shows
   and how wide a keyboard's stack stands beside the boss bar (item 92), which no frame at rest draws (no lookbook frame
   raises the dragon), so these numbers stand for the build; the player has ember and coins, a frame with a nameplate up counts, and each frame
   is shot again with one raised, item 94): a returning player at most 6.58% on Chromium 1280x800 (6.79% with a nameplate), 7.55% on WebKit
   1180x820 (7.76%) and 7.56% on WebKit 820x1180 (7.77%); a first session, with ember and coins as well (an upper bound
   for a new player), at most 7.30% with the card up (7.51% with the card and a nameplate) and 6.70% once it folds (the
   card shows on a keyboard only, so the iPads read as for a returning player: 7.55% and 7.56%); frames
   `evidence/w2d/b-r3-*` (round 3's, of the same HUD on these three targets)
   (`tests/gates/controls-panel-gates.test.jsx`: the fold at 30 s, the clock
   paused off screen, the fold remembered, the hint never on touch). **Seen per browser profile, not per save:**
   `crafty_controls_seen` and `crafty_controls_card_done` sit beside `crafty_onboarded` in localStorage because they
   belong to the person at the browser, so no save field is added and
   the one-way door the brief names (deleted panels' UI state in saves) is not opened: no panel's open state was ever
   saved (`game/saveSchema.js`). Quests claim on completion through `reduceClaim`, the only payer
   (`tests/gates/quest-autoclaim-gates.test.jsx`). **Proof that nothing promised depends on the deleted keys:**
   `tests/e2e/panels.spec.js` reaches every panel the old keys opened through Tab, J and their tabs, by real keys and
   taps; `talents.spec.js` and `canvas-pace-panels.spec.js` reach the talents and the feats the same way; all run by CI.
97. **The feats are not built in this lane.** Reset-plan row 24's feats need a counter for each verb (dodge, heavy,
   perfect dodge, the four Aspects) at the seams in the Player loop (`Components.jsx`) and the Aspect verbs, which this
   lane could not change and prove in a browser in the time it had; the Journal's second tab is labelled Achievements
   and shows the existing panel meanwhile, and "Survivor" stays. Registry `REVIEW:w2d:feats` carries it whole.
98. **Every key the game teaches is a key it binds.** The panel footers (Character's gear and spells, Build, Settings,
   the Journal's quests), the locked-Aspect denial, the respec notice and the villagers' lines named E, M, L, Q and U
   after item 96 removed them; they now name Tab, J, B and Esc, through t() in both locales. The Build panel's "Press 1"
   to "Press 5" under its five tools are deleted: no handler ever bound them (the digits pick a spell, and only with no
   panel open), and so is the title strip's "Q Claim Quest" ("Q 领取任务"), the last place Q was taught.
   `tests/gates/taught-keys-gates.test.jsx` reads every dictionary string, the rendered panels and card, every denial,
   the villagers' lines, the Aspect guide and the talent trees in en and zh-CN, and fails on a key that KEY_MAP does not
   bind when it is named after "press", in parentheses, after 按 or 按住, after "hold", in brackets, or as a keycap
   before its verb (a key before a capitalised word, a key no English word shares before any word, a key before Han);
   an article, a pronoun, a count or a version is not read as a key. Before the strip's hint was deleted that scan read
   red on it, and on nothing else, in both locales.

## 2026-10-29 — [LOOP] W2-D PR A: the HUD at rest, the compass, one notification channel, and no mob mirror

**Decided by the W2-D HUD lane under the standing grant** (DECISIONS 2026-10-28 item 14), building W1-H item 2(c) and
reset-plan rows 9 (its rest) and 12 by the task script `docs/superpowers/plans/2026-10-29-crafty-w2d-hud.md`. Numbered
from 90 (41-79 are taken; the W2-E follow-up lane holds 80-89). PR B (the re-key, the panels, the feats) records its own
items. Each stands while it earns its place.

90. **The desktop rail is deleted, the level card folds into the hotbar, and quests rest on one line.** The rail's three
   buttons (Inventory, Magic, Building) opened panels that keep their keys (E, M, B; `keyMap.test.js` holds each key to a
   live handler) and their touch-tray buttons (`tests/gates/hud-at-rest-gates.test.jsx` holds the tray rows); the level
   card at `bottom-32` and the touch level readout become one 4 px XP edge above the hotbar with the level beside it;
   the quest tracker rests as the lead quest's line. **Where its list opens:** on touch, a tap on the line (the tracker
   is `data-hud-interactive`, so the touch layer leaves it its taps); on desktop the HUD shows only under pointer lock,
   where no click or hover reaches it, so the full list is the quest log's (L; the Journal on J once item 96 lands).
   **Where things sit at rest** (`ui/hudLayout.js`): nothing covers a 48 px box at the screen's centre, where the
   crosshair is. On desktop the vitals keep the bottom-left corner, lifted above the hotbar's XP edge under 808 px wide
   (the hotbar's 408 px plus, on each side, the stack's 176 px, its 16 px margin and an 8 px gap;
   `tests/gates/hud-at-rest-gates.test.jsx` recomputes it from the classes the two render). Touch has three layouts,
   one per screen shape. **Tall** (640 px wide or more and 720 px tall or more: an iPad either way up): the joystick and
   the action buttons hold both bottom corners and the tray opens down the left edge, so the vitals sit at the top left
   under the quest line and the objective line, and the coin count under the minimap, clear of Pause. **Phone** (upright
   and narrower than 640 px, or upright and under 720 px tall): the nameplate, the boss bar and the toast stack are one
   column under the objective line (144 px down), so none meets another; the dial, the minimap at 60% (without its
   coordinates) and the coin count run down the right edge beside it; the vitals sit on the left edge beside the
   crosshair, 128 px wide so they clear it; and the hotbar sits 8 px from the bottom, where its XP edge clears the cast
   button (9% up, which reaches it under 711 px tall). The tall layout's encounter under the right column put the boss
   bar on the crosshair at 390x844, and under 720 px tall (390x664, Playwright's iPhone 14 with Safari's toolbars) the
   tall layout's tray opener meets the vitals, its coin count the spell row and its XP edge the cast button.
   **Short** (wider than tall and under 720 px: a phone on its side) gives the right edge to the thumb cluster's fans,
   which reach within 73 px of the top at 390 px: the compass stays in the top band at 200 px, the coin count, the
   minimap (at three quarters, without its coordinates) and the dial sit in the top band beside the Pause, the vitals
   sit on the left edge between the tray's opener and the joystick, and the hotbar scales as a phone's. Its middle has
   57 px above the crosshair and 91 under it, so the nameplate sits under the top band (96 px down) and the boss bar
   (compact) and the toast stack in a column under the crosshair. Elsewhere the nameplate and the boss bar are one
   centred column under the top centre's lines (96 px down on a wide screen, 144 px under 900 px wide). The boss bar is
   450 px where there is room, else it leaves a 216 px column clear on each side (88 px on a phone, 82 px in a narrow
   keyboard window), and never under 160 px; on a phone and a short screen it drops its phase line and numbers.
   **Why:** about a fifth of a 1280x800 frame was interface (survey-2026-10-27 finding 11); the acceptance is the chrome
   footprint on lookbook frames (item 94). **Proof that nothing promised depends on the rail, and that nothing
   collides:** `tests/e2e/hud-at-rest.spec.js` (no rail button on screen in a browser; a real grant moves the XP edge;
   with ember and coins banked, at 1280x800, 1180x820, 820x1180, 390x844, 390x664, 375x667 and 844x390, at rest, at rest
   with a notice, with a target's nameplate up, with the nameplate and a notice, with the nameplate and the boss bar,
   and with the boss bar alone, no two of the HUD's rects, the box at the centre and, on touch, the joystick's ring and
   the eight touch buttons a player sees at rest intersect; the toast stack lies inside every viewport and on the
   phones every touch target does; at 820x1180 a finger's tap opens the quest list), run by CI on the PR's head;
   `tests/gates/hud-layout-gates.test.js` pins which layout each of the seven gets and that every touch screen gets
   exactly one. Not measured: other viewports, two toasts at once or a toast with the boss bar up, an upright phone
   under 617 px tall (where the XP edge reaches the cast button again), and a touch screen under 338 px tall, where the
   short layout's vitals reach the joystick (registry `REVIEW:w2d:hud-unmeasured-viewports`,
   `REVIEW:w2d:toast-with-encounter`).
91. **The compass is a component, and its capture guards are not carried over.** `ui/Compass.jsx` renders a fixed pool
   of marker slots once; the HUD ticker writes each slot's transform and text only on change; `ui/compassLayout.js`
   places labels in priority order (boss, HOME, shrine, Blight Heart, NPC, chest, cardinal) and a later label that
   would come within 4 px of a placed one yields, its pip staying. Every label is a `compass.*` key (en, zh-CN); an NPC
   shows its short name. **The guards:** the old block suppressed HOME, shrine, Blight Heart and chests and stopped
   ticking under capture, to keep the retired capture baselines byte-stable (W1-H item 1); the rule says a guard leaves
   when its subject next moves (reset plan row 48), so the component has none. Three source-grep gates that read the
   old strings (shrine-marker, blight-marker, compass-hearth's wiring half) are replaced by
   `tests/gates/compass-markers-gates.test.js`, which drives the real marker builder; the source-grep ledger falls 101
   to 98.
92. **One notification channel: a key renders through t() when shown, and the same key inside 4 s shows once.**
   `addNotification(message, type, { key, vars })` takes a dictionary key or a plain string; `ui/notifications.js`
   decides what it says and whether it shows; a name inside a notice (a dawn's loot, the dragon) is itself a key in
   `vars`, translated when shown. **Every notice the game raises in the stack goes through it:** the dusk warning (`notice.dusk`, once
   per dusk, below the dial it covered), the numbered siege notice at nightfall and the dawn notice
   (`world/survivalSystem.js`; the `SurvivalWarning` banner is deleted), the dragon's five calls
   (`world/bossSystem.js`; its own banner, its state and `bossNotifTimers.js` are deleted, since a toast clears itself)
   and an Aspect's first unlock (`ui/AspectHintToast.jsx` hands the hint to the channel once play is live again, so it
   is not lost behind the Talents panel where it was earned), and the dragon's four attack calls (`render/BossEntity.jsx`:
   the fireball, the roar, the lava and the summons, which were English sentences). **Where the stack stands:** at the
   right edge on its own on a keyboard (under the dial, every notice up; while the boss bar is up, only as wide as the
   room the bar leaves on its right: `ui/hudLayout.js` `toastMaxWidth`, 263 px at 1024 px wide and 192 px from 640 to
   882 px, because at its full 320 px the stack met the 450 px bar in any window under 1,138 px, at 1024x768 the bar at
   x 287-737 and the stack at x 688-1008 from y 164; `tests/gates/hud-layout-gates.test.js` sweeps every keyboard width
   from 640 to 1,920 px and the e2e reads 1024x768; a window under 640 px leaves 58 px and keeps the full stack, registry
   `REVIEW:w2d:toast-narrow-keyboard`) and on a tall touch screen (under the coin count,
   the newest toasts that fit above the touch controls under it, each clamped to three lines: `ui/hudLayout.js`
   `tallToastPlace`). On its side the stack stands left of the right fans' column and stops above the jump, two toasts on
   a 1180x820 iPad, where at the edge two toasts or a three-line call reached the spell opener; upright it keeps the edge
   and stops above the spell opener, four on an 820x1180 iPad. On a phone and a phone on its side the notices join the
   encounter column (item 90), the one band those screens leave clear across the middle (at 844x390 the stack stood 372
   px down, off the screen), and **the column holds one notice at a time** (`ui/notifications.js` `lineNotification`),
   in this order: the newest of the dragon's one-off calls (its arrival, return, phase changes and defeat:
   `world/bossSystem.js` `bossCall`, marked `boss`), else the newest plain notice, else the newest of its attack calls
   (`render/BossEntity.jsx` through `bossAttackCall`, marked `attack`). **Why the attack calls come last:** they repeat
   all fight (the fireball every 2.4 s, the roar every 4.2 s, the lava every 5.2 s, the summons every 8.5 s) and each
   lives 4 s, so one is up almost the whole time; ranked with the one-off calls they left a notice raised in the fight (a
   drop, a quest, a denial a repeated press must answer) at most 0.8 s of its 4 s in the first phase and 0.2 s in the
   second. So an attack call never displaces a live plain notice and yields to one raised while it shows, and a plain
   notice holds the line for its whole life unless a one-off call arrives, which takes the line at once
   (`tests/gates/boss-attack-line-gates.test.js`, REMOVED with the attack calls by item 124: a plain notice at every 10 ms offset over two periods of each cadence,
   11,520 simulated fights, each held 4,000 ms). While the boss bar is up the line shows inside the bar's own line, in
   the name's place beside the dragon's icon, clamped to three lines on a phone and one on a phone on its side, where 14
   px separate the bar from the hotbar's XP edge (`bossCallLines`); with the bar down it is the one toast, four lines at
   most. **Why one at a time in the bar's line, and not held until the bar is down:** a fight lasts minutes, and a notice
   held until the dragon falls arrives after the moment it describes (a denial says why the press just made was refused;
   a drop or a quest belongs to the kill that raised it), and every held notice would arrive at once on top of the
   dragon's defeat. In the line each keeps its own 4 s: a notice behind a one-off call, or an attack call behind a notice,
   shows if it outlives what stands in front of it and is lost if it does not, the cost of a band sized for one line. The stack under the boss bar had no room there: when
   the dragon raised its arrival with the bar up it covered the crosshair's box and the vitals for 4 s at 390x664 and
   375x667 and the hotbar at 844x390, and two toasts reached the vitals with no boss at all. Proof:
   `tests/e2e/hud-at-rest.spec.js` (at every viewport: two notices at once, the arrival with the bar up, the real phase
   call, an attack call alone, a notice raised while it shows, and an attack call raised while a notice shows),
   `tests/gates/hud-notices-gates.test.jsx`, and `tests/gates/hud-layout-gates.test.js` (a full tall stack against
   every touch control at 4,604 tall touch viewports). The boss bar's name, phase line and numbers read through t() in
   both dictionaries. **On touch the stack is the only view of the list:** the
   combat log drew the same live list (each line leaves with its toast), and on touch it sat on the joystick on both
   iPads and on the vitals and the tray's opener on a phone on its side, so it is drawn on a keyboard only
   (`ui/CombatLog.jsx`). Proof nothing is lost: `tests/gates/combat-log-gates.test.js` (the feed that draws 8 lines on a
   keyboard draws none on touch) and `tests/e2e/hud-at-rest.spec.js` (each staged notice's toast on screen at every touch
   viewport with no log, and the log beside it on desktop). The level-up banner is the one transient drawn apart: a
   celebration at the screen's centre (`SimpleExperienceSystem.jsx`), not a notice, so it stays out of the stack, and
   its two lines are dictionary keys (`hud.levelUp`, `hud.levelReached`), read in zh-CN by
   `tests/gates/hud-zh-gates.test.jsx`. **Plain text is not deduped:** the denial notices
   (`ui/denyToast.js`) are plain strings that answer each press, and a first build that dropped a repeated one inside
   4 s made `tests/e2e/ember.spec.js` read a refused roar as "refused in silence". Keyed, the dragon's attack calls are
   deduped like every key: the fireball, raised every 2.4 s in the first phase, shows once in each 4 s. The other English
   notification literals (weather, loot, talk, quest, store) still pass plain strings (registry
   `REVIEW:w2d:notifications-english-literals`).
93. **The 250 ms mob mirror is deleted** (reset plan row 9; arch A17). The minimap and the compass read `mobsQuery` and
   `alliesQuery` on their own clocks; the lookbook hold reads the seam's `mobs()` (with ids) and falls back to the mirror
   only for an older build. `activeHostilesCount` stays, because the music subscribes to it, and is now written on
   change by SpawnerSystem's 1 s pass (it was 4 Hz): the soundtrack can start up to a second after the first hostile
   instead of a quarter second.
94. **The chrome share is the chrome's footprint, read on a held page.** The acceptance number (8% or less of an
   eye-level frame at rest) counts the pixels the HUD's own elements change: the lookbook holds the page's animation
   frames (the canvas keeps one rendered frame), shoots the frame, a twin with the HUD's elements hidden and the canvas
   and touch layer shown, a twin with the canvas alone and the frame again, and counts the pixels where the first two
   differ by more than 2 in any channel, if the first and last agree. The touch layer (its scrim, ring and buttons) is
   reported apart, as the pixels where the two twins differ; the colour count (pixels within 3 of the page's own
   `--ui-*` surface colours) stays as a second column. A frame with a toast in the stack is not at rest and is set aside
   by rule (`scripts/visual/_lookbook.mjs` `atRest`), the siege notice included; a frame with a target's nameplate up
   counts, since that is the HUD while the player looks at a mob, and each frame is shot once more with a nameplate
   raised on the held page (the nameplate twin), whose footprint the run reports beside the frame's. The eye set's
   player has ember banked and coins, so the ember bar and the coin count are drawn. **Why:** a count of surface colours
   reads the palette in both directions: a warm stone texture within 3 of the warm ladder counted as chrome (7.46% on a
   world with none) and a translucent panel whose blend misses every token did not count at all. The footprint reads no
   palette (`tests/gates/lookbook-chrome-gates.test.js`: a warm stone world with no chrome reads 0, a 10% panel over a
   world unlike it reads 10% on either ladder, a panel at alpha 0.6 still counts, the scrim is its own class).
   **Blind spot:** it reads change, so a surface that changes the world under it by 2 or less in every channel is not
   counted: an opaque surface over world pixels of its own colour reads short of its area, and a faint translucent one
   over a world near its colour reads nothing. Warm chrome over a warm world is where that happens: the gate's
   warm-on-warm fixture reads a 10% warm panel over warm stone at 8.28%, and the same panel at alpha 0.15 at 0%.
99. **The HUD at rest is flat and smaller, because the footprint said where the screen went.** With the slim hotbar
   the footprint read 9.91% of a Chromium 1280x800 frame at rest and 10.21% of WebKit 820x1180, over the budget, and
   gave each surface its share: the hotbar 3.4%, the minimap 1.6%, the compass 1.3%, the quest line 1.3%, the vitals
   0.7%, the dial 0.6%, the objective line 0.6%, the XP edge 0.4%. So the hotbar is nine slots with nothing behind them
   (40 px on a keyboard, 48 px on touch, where each is a tap target); the HUD's own surfaces at rest drop the hard offset
   shadow the panels keep (the quest line, the compass, the minimap, the dial, the coin count); the minimap is 112 px
   (was 132), the compass 288 px (was 320), the dial's ring 36 px (was 44), the quest line at most 280 px on a keyboard
   (was 320). **Measured after** (lookbook eye set, every valid frame at rest, real GPU, 2026-10-29 23:22Z): Chromium
   1280x800 at most 6.69%, WebKit 1180x820 7.69%, WebKit 820x1180 7.69%; main before this lane read 22.14% and 11.87%
   at 1280x800 and 820x1180. **A returning player** (round 3): that player had no ember and no coins, so the ember bar and
   the coin count were never drawn. With both banked and each frame shot again with a target's nameplate raised (item
   94), the same HUD read 7.39% on Chromium, 8.44% on both iPads, and 8.34% and 9.44% with the nameplate: over the
   budget. So the vitals are slim 14 px rows (a 10 px track with no offset shadow, the label and value beside it), the
   coin count and the nameplate sit on the world with no panel (WebKit 1180x820: the vitals 1.10% to 0.50%, the coin
   count 0.38% to 0.05%, the nameplate 1.00% to 0.19%), and type on the world carries a one-pixel ink outline
   (`ui/onWorldText.js`), because over a white sky the shadow alone washed the numbers out. **Measured after, on a
   committed head** (lookbook eye set, a returning player with ember and coins, ten valid frames at rest per target and
   each shot again with a nameplate raised, real GPU, 2026-10-30 04:11-04:15Z, at `391bc20b`, clean tree): Chromium
   1280x800 at most 6.58% (6.79% with a nameplate), WebKit
   1180x820 7.55% (7.76%), WebKit 820x1180 7.56% (7.77%). Round 3 read the same numbers on an uncommitted tree; these
   replace them. After `391bc20b` PR A's branch changed this record and the e2e spec only (`git diff --stat` to
   `8cca4468`), and then where a notice shows (item 92: the tall touch stack's place and count, the encounter column's
   one notice, the boss bar's line and its keyed words), which no frame at rest draws (a frame with a toast is set aside
   by item 94's rule, the boss bar shows only in a fight, and an empty stack is 0 px tall), so the numbers stand for the
   build; they were not shot again. The frames `evidence/w2d/a-r3-*` show the same HUD on these three targets, which round 4's phone and
   short layouts do not move. **Why:** the brief's acceptance is the
   share of the screen at rest; the hard shadow is the
   panels' elevation, and a HUD that sits on the world reads as one plane without it.

## 2026-10-29 — [LOOP] W2-J phase 3: closed records behind the tag `records/2026-10-29`, and a generated CHANGELOG

**Decided by the command session** (SOTA reset rows 32 and 57; task script
`docs/superpowers/plans/2026-10-29-crafty-w2j-phase3.md`). Each stands while it earns its place.

100. **Closed records leave HEAD; the annotated tag `records/2026-10-29` keeps them.** It points at main `e900de6b`,
   the tree before the removal. Read one: `git show records/2026-10-29:<path>`; list them:
   `git ls-tree -r --name-only records/2026-10-29 -- docs memory`. 143 files (10.98 MB) went: the 2026-Q2 plan archive
   but two, LOOP-PROGRESS, the inbox's old page KEVIN-REVIEW.html, six of seven dated audits, four dated reviews
   (AUDIT-2026-08-09, CODE-REVIEW-2026-06-20, GOVERNANCE-REVIEW-2026-08-07, LOOP-DOC-SOTA-PLAN-2026-07-27), 38 shipped
   plans, 12 shipped specs with their two reference comps, one research note, the 2026-09 overnight brief and plan with ten of sixteen frames, the
   superseded cursor archive and one perf report. A record stays while a doc-currency canonical doc, a rule file,
   `CLAUDE.md`, a gate, script, test, CI step, a plan dated 2026-10-27 or later, a published page or the inbox names it
   (`docs/superpowers/INDEX.md` lists what stays and why). Four records left although something named them, each only
   as history, and all four are at the tag: `sota-2026-09/OVERNIGHT.md` (the published pages `sota-audit.html` and
   `era-review.html` quote it as the source of dated claims), and `KEVIN-REVIEW.html`,
   `LOOP-PROGRESS-2026-10-28.html` (from `docs/archive/`) and `sota-2026-09/PLAN.md` (the 2026-10-27 harness-sota plan names them as
   units that moved or bannered them). None is a link or a path anyone follows. This supersedes item 13(a)'s in-tree
   `docs/archive/` (2026-10-28): a retired record goes to a dated tag, not a directory. Proof nothing live depended on
   them: each of the 143 file names was grepped over every tracked file. No source file, test, script, gate, rule file,
   `CLAUDE.md` or canonical doc names one as a file to open (`cameraKick.js` names its plan as
   `git show records/2026-10-29:<path>`; ACTIVE_PLAN T15 names OVERNIGHT.md to say it left); what remains are history
   citations in kept records, listed in the registry row `W2J:kept-records-point-at-removed`. The unit suite and the
   build do not prove it: they read no record.
101. **`memory/CHANGELOG.md` is generated** by `frontend/scripts/ci/changelog.mjs --write` (one line per landing:
   a merged PR's title and number, or a landing git proves), at session close. `--check` stays as a manual command and
   no commit hook or CI step runs it. Why: a lane that regenerates in its merge commit writes a stale file, because
   `--write` reads HEAD before that commit exists (it now refuses while a merge is in progress); and a PR's CI checks
   GitHub's synthetic merge (main's first parents) while main's push run checks the lane tip (the lane's first parents),
   which are different landings, so a green PR can turn main red. A freshness check on a changelog is not worth landing
   friction and a red main. Not checked: PR titles against GitHub, and a landing no later commit took in. The
   hand-written history: `git show records/2026-10-29:memory/CHANGELOG.md`.
102. **The root loses its one-file `scripts/`:** the compaction hook is `.claude/hooks/session-start-compact.sh`.

**Door:** two-way. Every removed file is in the tag and in history; the generator and the hook move are reverts, and
the freshness check returns by adding its step to `ci/pipeline.sh`.

## 2026-10-29 — [LOOP] W2-E follow: the beast in first person, the cast, mobs that sense the body, the hands by the fire

**Decided by the W2-E follow lane under the standing grant** (item 14), by its task script
`docs/superpowers/plans/2026-10-29-crafty-w2e-follow.md`, and its review's fix round (PR #52). Items 80-88 (41-69 are
taken and the Cut lane holds 70-79).
Frames: `docs/superpowers/masterpiece-2026-10/evidence/w2e-follow/` (`index.md` there), shot by the lookbook's new
`self` set on production builds, Chromium on ANGLE-Metal at 1280x800 and WebKit at 820x1180.

80. **In first person the player's own beast draws nothing but its shadow; its light stays.** Supersedes item 39 for
   first person (its 0.25 m clearance still holds away from the eye). The before frames: the dragon's wings fill the
   upper corners as two flat orange slabs at noon and midnight, and the bull's halo washes a cyan band behind the hotbar;
   the golem's halo tints the bottom edge; with the head hidden (item 39) the hawk's beak and the dragon's head would float
   on their own. The boxes are shaped to read from the reveal's 4.5 m (`beast-reveal-after.jpg`), not from inside, so
   in first person no part writes colour or depth, the glow spheres and the entrance's burst included, and every box
   still casts its shadow. First person is the follow placing the camera, marked by the Player's loop each frame
   (`render/followView.js`), not the drawn camera standing near the eye: a crit's shake (weight 1.6, trauma 0.8) puts
   the follow's target a median 1.5 m off the eye and, after the follow's 0.85 lerp, the camera outside 1 m on three
   crits in four (2000 seeds), and a rule of 1 m from the eye let the boxes flash back in during fights. When another
   branch placed the camera (the reveal's ends, an eye pose), it is first person within 1 m of the
   steady eye (`beastAvatarParts.js FIRST_PERSON_M`; the reveal leaves it in its first fifth), measured in world space,
   and the clearance is in metres: on a form's first frames the entrance draws the avatar at half scale. The eye stays
   at body + `EYE_HEIGHT_M` in every form: a per-form eye would put the dragon's 2.15 m up, inside the ceiling of a
   two-block passage its 1.44 m capsule fits, and pop at the reveal's handover. What it costs, that nothing on screen
   says which form the player is in, item 87 answers on the gauntlets. The core's light is kept off the hands
   (`lightsHands={false}`, item 82): 0.6 m from them it bleached the gauntlets yellow and salmon.
   Gated by `tests/gates/beast-self-view-gates.test.jsx` (the bob, a kick, a crit's shake and a stack of hits in the
   follow, the form's first frame, the reveal's depth writes) and `player-view-hold-gates.test.jsx` (the real Player and
   Rapier: the follow's mark under a crit, through the reveal, dead and under a lookbook pose). It stands while it earns
   its place.
81. **The cast pushes the wand toward the target, on the cast's own clock, and the fireball cone is gone**
   (`frontend/src/render/handPose.js castPose`). Seen at its apex for the first time, the cast bobbed the wand hand 4 cm
   on the session's wall clock, so it pulled back as often as it pushed, and the fireball's translucent red cone drew as
   a flat shard beside the wand (no outline, no toon, spun per frame). Now the hand pushes 0.12 m, lifts and tips the wand
   forward, peaking halfway through the 150 ms cast; the off hand lifts its orb. The swings and the heavy charge read as
   authored at their apex and near their end on 16:10 and in iPad portrait (no hand through the camera, no impossible
   wrist, the fist inside the frame) and are unchanged; the swing, cast and charge poses allocate nothing per call
   (`chargePose` reads its offset by index: destructuring it built about 184 bytes a call). Gated by
   `tests/gates/hand-pose-gates.test.jsx` and, for the allocation, `hot-path-alloc-gates.test.js` (item 88). It stands
   while it earns its place.
82. **The hands take the world's point lights: the three that put the most light on the eye, mirrored into view
   space** (`render/viewmodel.js mirrorPointLights`, `HAND_POINT_LIGHTS` 3, a fixed count so no hand shader relinks).
   The brazier's light is not pooled, so "the pool's nearest" would have missed the light the row named; every world
   point light now registers (`render/lightPool.jsx`: the pool's lights and `WorldPointLight`, used by the Hearth's
   brazier, the danger fill and the phantom block). Ranked by three's own falloff (cut-off window and decay), by an
   insertion into fixed arrays, no allocation per frame. Beside the brazier at midnight the gauntlets' faces toward the
   fire now warm (`hands-brazier-midnight-before-after.jpg`). Supersedes the "fill and point lights not mirrored" clause of
   item 38. Gated by `tests/gates/viewmodel-gates.test.js` and `viewmodel-layer-gates.test.jsx`, which mounts the pool
   with a pooled light and the layer and reads the pool's own lights registered and the pooled light on the hands. It
   stands while it earns its place.
83. **Mobs, their arrows, the combat stance and the player's blows take the player's place from the body, not the
   camera.** Supersedes the sense point of item 36 (its ledge table, built from `steadyEye`, is unchanged).
   `game/mobSenses.js mobSensePoint` is the body's steady eye (centre + `EYE_HEIGHT_M`), taken from the body sample the
   Player's loop hands `stanceFrame` every live frame (`systems/playerSensePoint.js`; the rigid body's `translation()`
   builds a wasm vector and an object per call in rapier3d-compat 0.19.2; the camera only before the first sample). The
   AI tick, an arrow's aim and its hit test, the leap's direction, `stanceFrame` and the blow's knockback, flinch, spark
   cone and shake bias (`systems/CombatSystem.jsx`) read it, so the roar's reveal, the shake and the kicks move no mob's
   reach and knock no mob the wrong way. Every other reader of the camera as the player's place, from a search for
   `gameCamera`, `playerPosition` (which `systems/PositionTracker.jsx` mirrors from the camera every 200 ms),
   `camera.position` and `getWorldPosition` in `frontend/src`, and whether the camera is right there:
   - **Right (the view's own).** Chunk streaming and centring, the far field, the shadow map's centre, the weather
     (`Terrain.jsx`, `FarField.jsx`, `Atmosphere.jsx`, `WeatherSystem.jsx`): the world is built around what is seen,
     and a lookbook hero pose depends on it. The occlusion rays, the sky dome and sun, the ocean, the light motes, the
     shrine and blight beacons (`Terrain.jsx`), nametag fade (`Nametags.jsx`), the windup chevrons and the quest and
     waypoint markers (`ui/WindupChevrons.jsx`, `HUD.jsx`): they are drawn for the view. The listener and the sounds the
     player's own verbs make at it: spatial audio, biome ambience, thunder, the cast, slam, jump, footstep, roar and grab
     sounds (`SpatialAudioController.jsx`, `SoundManager.jsx`, `LightningDriver.jsx`, `EnhancedMagicSystem.jsx:222`,
     `Components.jsx`). A spell's start (`EnhancedMagicSystem.jsx:230`) and the snare tether's (`Components.jsx`): they
     leave along the crosshair, which is the view's. The light pool's ranking and the hands' light (`render/lightPool.jsx`,
     `render/viewmodel.js`), the touch look, the lookbook's own reads, the debug overlay and the perf probe.
   - **Wrong (the body's).** Fixed here: the AI, the arrows, the leap, the stance and the blow. Left, as registry rows:
     the boss (`render/BossEntity.jsx`, `REVIEW:w2e-follow:boss-senses-camera`); XP orbs and loot
     (`XPOrbSystem.jsx`, `LootSystem.jsx`, `REVIEW:w2e-follow:pickups-at-camera`); and, in
     `REVIEW:w2e-follow:player-place-at-camera`, the chest and shrine reach and the other quest proximity checks
     (`QuestSystem.jsx`, the HUD lane's file), the villager greeting (`render/MobModel.jsx`), the lair trigger
     (`world/bossSystem.js`), the ally squads' follow point (`world/SquadAISystem.jsx`), the grass bend source
     (`OptimizedGrassSystem.jsx`), the fuse pair search and the footstep surface (`Components.jsx`), the manual save's
     position (`WorldManager.jsx`; `App.jsx` and `game/contextRecovery.js` already save the body), the minimap's
     centre (`ui/RadialMinimap.jsx`) and the hit-direction cue's origin (`store/useGameStore.jsx`), the last two in the
     HUD lane's files. Each is off whenever the camera is off the body's eye: the 1.2 s reveal, a lookbook hero pose,
     and every frame the follow carries the shake or a verb kick (`Components.jsx:1503-1505`; a crit's shake puts the
     follow's target a median 1.5 m off the eye, item 80), which the footstep surface (`Components.jsx:1430`) reads
     from the camera the frame before placed. The talk target (`input/talk.js`) and the spawner's ring
     (`SpawnerSystem.jsx`) stay on the camera: in play it stands within the bob of the eye but for the shake and the
     kicks, and spawning around the view is safe.
   Gated by `tests/gates/mob-sense-body-gates.test.jsx` (the tick, an arrow's aim and its hit test, the leap and the
   blow, each with the reveal staged) and, for the allocation, `hot-path-alloc-gates.test.js`. It stands while it earns
   its place.
84. **The beast's hidden parts are judged as the frame draws** (`render/BeastAvatar.jsx`): each part decides in its
   `onBeforeRender`, which three r172 calls with the drawing camera after every frame callback, the Player's loop
   included, has run, so it reads the follow mark and the camera this frame placed (item 80), and the reveal handing
   back to the eye hides the beast on that same frame; the shadow pass calls `onBeforeShadow`, so the boxes still
   cast. It stands while it earns its place.
85. **The first-person follow is gated at the eye within the walk bob** (`tests/e2e/ember.spec.js backAtHead`): the
   camera must come back to body + `EYE_HEIGHT_M` within `EYE_BOB_M`, not 0.6 m. On CI run 40921754876 (a dispatched
   run of branch `mut/w2e-follow-eye`, the follow at + 1.2 m) it went red on all three attempts, and so did
   `talents.spec.js`'s head check, already at `EYE_BOB_M`. The same tightening in `heavy-melee.spec.js` let the mutant
   through (its wait is met by the reveal's closing frames, which stand at the eye by `transformCam.js` itself) and was
   not kept. It stands while it earns its place.
86. **The lookbook has a `self` set** (`scripts/visual/lookbook.mjs shootSelf`): each beast form at the steady eye and
   from the reveal's hold, the light string, the cast and the full charge held at their apex by the seam
   (`render/lookbookSeam.js` `form`, `handPose`, an eye pose with `hands: true`), and the hands beside the brazier at
   midnight. What a still changes against play: no bob, no FOV kick, and the body rests where the human capsule rests,
   so in a form the world sits up to 0.3 m off where that form's capsule would put it (the beast against the eye is
   exact). It stands while it earns its place.
87. **The gauntlets take the beast form's colour while it is on** (`render/viewmodel.js stepFormTint`, `FORM_TINT`,
   driven per frame by `render/playerRender.jsx`): as the beast is a dark ink body with an element rim, the gauntlets'
   ink outlines take the form's colour (`FORM_TINT.colour`: the beast's own rim, `beastAvatarParts.js ELEMENT_COLOR`, for
   the bull, the hawk and the golem), and so does the ember core in each, at the core's HDR gain, eased in by the end of
   the form's 0.55 s entrance and out after it, the fading form keeping its colour until it has gone; the held item's
   outline stays ink. It answers item 80's loss: in first person the beast draws nothing, and now the hands say which
   form is on. Fire takes a crimson, `#D4142C`, on the hands only: the beast's orange `#FF6A2C` stands 24 degrees of OKLCH
   hue and 0.04 of lightness off the plates (`#E8963A`) and 21 degrees and 0.07 off the ember core (`#FF9A2E`), and in the
   frames its rim was a 1-2 px orange-red line on orange and its core sat in the plates' orange; the crimson stands 41
   degrees and 0.19 under the plates and 38 degrees and 0.22 under the ember core (authored), and against the lit plate
   as rendered (`#D26B00`) the rim moved from OKLab 0.065 off to 0.131 and the core from 0.091 to 0.133
   (`gauntlet-fire-colour-before-after.jpg`). Frames (`evidence/w2e-follow/gauntlet-form-colour-*.jpg`, 0.30): the rims
   read crimson, cyan, yellow and violet round both gauntlets. As displayed, the hawk's core stands 0.04 to 0.07 (OKLab) off
   the ember core (both go yellow-white through the core's HDR gain and NEUTRAL), so its rim carries it. Two arms were shot and
   dropped: 0.35 of the glow on the plates read salmon for the bull and pink for the golem on their ember gold
   (`gauntlet-plate-glow-rejected.jpg`), and the core alone shows only a sliver at rest, which read for the bull and the
   golem and not for the hawk or the dragon. Also passed over: a beast viewmodel (claws in place
   of the gauntlets: four new hand models) and the core's own light on the hands (it bleached them at 0.6 m). drei's
   Outlines writes the ink back whenever the hands re-render (an attack starting does it); the tint writes the colour
   again every frame callback, ahead of that frame's draw (not measured in a browser). Gated by
   `tests/gates/form-gauntlet-gates.test.jsx`, with drei's real Outlines, and each form's outline and core standing 0.15
   (OKLab) off the plate as displayed at 0.30 and 0.75 (the fire rim that did not read stood 0.10 to 0.11 off, the hawk's
   that did 0.15), fire 30 degrees of hue and 0.1 of lightness off the plates and the ember core. It stands while it
   earns its place.
88. **Per-frame code is gated for allocation by a young-generation heap probe** (`tests/gates/_youngGrowth.js`,
   `tests/gates/hot-path-alloc-gates.test.js`): new-space growth over runs of 5000 calls that no collection interrupted
   (`node:v8` GCProfiler), with no fixed warm-up: runs continue until the median of the last five kept runs is under
   8 bytes a call or 3 s have passed, and that median is returned, so the runs before the optimiser installs its code
   are outlasted and a call whose compiled code allocates reads high to the end of its budget. Under 8 bytes a call
   passes, beside a control that takes its first five runs (a real Rapier `translation()`, 172 to 189 bytes a call on
   Node 24.13.0, the first probe the highest) and shows the probe sees an allocation. It measures what V8's optimiser leaves: an object it elides (a literal passed to an inlined
   call, a `new THREE.Color()` that does not escape) reads as none, and is none in that process. It covers the hand
   poses, the mobs' sense point and the gauntlets' form tint. Left allocating, as a registry row
   (`REVIEW:w2e-follow:per-frame-alloc-untouched`): the snare search's two vectors and its `translation()` every frame
   in play, and the box distance's rotation read at every draw away from the eye. It stands while it earns its place.

## 2026-10-29 — [LOOP] W2-F step 7: quests name the creatures on screen

**Decided by the W2-F quest-text lane under the standing grant** (DECISIONS 2026-10-28 item 14), building the
quest-text half of reset-plan row 24 by the task script `docs/superpowers/plans/2026-10-29-crafty-w2f-hunger-quests.md`.
Stacks on step 6 (items 70-74). Each stands while it earns its place.

75. **A hunt's text comes from its creature's display name.** A quest with a `mobType` (five: Zombie Slayer, Spider
   Hunter, Ember Hunter, Undead Destroyer, Brute Breaker) renders its title from `quest.<id>.title` and its objective
   from `quest.defeatType` ("Defeat {count} {mob}") through `t()` (`frontend/src/game/questText.js`). The noun is the
   locale's `mob.<type>.<one|other>`, the form picked by `Intl.PluralRules` for the count; the English nouns are
   generated in `frontend/src/i18n/strings.js` from `MOB_TYPES[type].displayName`, plus "s" except where English does
   not (Ox to Oxen), so in English the nametag and every quest share one word. The zh-CN nouns are written by hand
   (item 77) and the nametag shows the English `displayName` in every locale, so in zh-CN a quest and a nametag can
   name one creature in two words (registry `REVIEW:w2f:quest-text-zh-rest-english`). The zombie quest reads "Husk
   Slayer", "Defeat 10 Husks"; one Husk reads "Defeat 1 Husk". Undead Destroyer keeps its title, which names no one
   creature. Every other quest renders the text it was authored with. **Why:** a quest that says "zombies" beside a
   nametag that says Husk tells the player two names for one creature (reset plan row 24).
76. **No save key moves; the key map is the identity.** A saved quest is found by its id, a hunt counts its
   `mobType`, and `stats.kills_by_type` is keyed by the same MOB_TYPES key, so renaming `zombie_slayer` or `zombie`
   would need a migration and buy the player nothing. The map is frozen as literals in
   `frontend/tests/store/questKeyMap.test.js`, where a pre-change save's hunt at 7 of 10 loads, reads "Defeat 10
   Husks", and three Husk kills finish it under `kills_by_type.zombie`. A hunt's text is never read from the save; a
   load also takes each quest's English title from `QUEST_LIST` (`withCurrentAsk`), so the save and the completion
   notice, which stays English, say "Husk Slayer". **A rollback is half-covered:** a build from before this change
   keeps the saved title and rewrites the objective from its own list (`withCurrentAsk` at `QuestSystem.jsx:122` of
   `1882bd5b`, the list's `'Defeat 10 zombies'` at `:36`), so it shows "Husk Slayer" over "Defeat 10 zombies".
77. **zh-CN names every creature** (Boar 野猪, Ox 牛, Husk 尸傀, Bonepicker 拾骨者, Frontier Spider 边境蜘蛛, Settler 定居者,
   Skitterling 窜蛛, Duskhound 暮犬, Moss Brute 苔藓蛮兽, Ember Husk 余烬尸傀) and the hunts ("击败 10 个尸傀", "尸傀杀手");
   the coverage test makes a new creature name itself in both. The rest of the quest text (the other quests, their
   lore and givers, the notices, the tracker's chrome) stays English in zh-CN (registry
   `REVIEW:w2f:quest-text-zh-rest-english`); the names were chosen here and no native reader has seen them yet. They
   are the quests' words, not the nametags': the nametag stays English in every locale (`nametagFor` reads
   `displayName`), so a zh-CN player reads 尸傀 in the tracker over a nametag that says Husk, and the two would
   disagree again if a nametag were ever translated differently.
78. **The tracker is not restyled** (W2-D collapses it to one line): the HUD tracker and the quest log swap only the
   source of their two text lines. **Not proven, and owed:** the e2e's browser mutants
   (`REVIEW:w2f:quest-text-e2e-mutants-unrun`) and the quest log in a browser (jsdom only).

## 2026-10-29 — [LOOP] W2-F step 6: hunger and the food leave the game

**Decided by the W2-F hunger lane under the standing grant** (DECISIONS 2026-10-28 item 14), finishing reset-plan row
8 by the task script `docs/superpowers/plans/2026-10-29-crafty-w2f-hunger-quests.md`. Numbered from 70 (41-69 are
taken). Each stands while it earns its place.

70. **Hunger is deleted, not hidden.** W1-B deleted the drain and step 2 (`00c0a8d4`) the HUD bar; what was left goes:
   the store's `hunger`, `setHunger`, `consumeHunger` (the game's only `'starvation'` damage) and `feedPlayer`, the
   respawn's refill, the `GameSystems.jsx` context's copies, the inventory's `feed` effect, the StatBar's `hunger`
   kind, and the showcase's hunger bar (it shows the ember bar, as the HUD does). **Why:** a meter nothing drains and
   no bar shows is a field every reader must still reason about, and its one damage path was one interval away from
   killing players unseen again.
71. **The five foods go with it:** Raw Porkchop, Raw Beef, Cooked Porkchop, Cooked Beef and Rotten Flesh, from the item
   registry, the consumable registry, the loot tables (pig, cow, zombie, duskhound) and the icon set (`meat`, `food`
   and the baked glyph). Their one effect was `feed` (the cooked two also healed 10), so each would have been a Use
   button that spends the item for nothing. No quest, recipe, tutorial, help line or i18n key named one. **The loot
   tables gain nothing in their place:** another drop with no use is the class `REVIEW:w2f:forge-orphan-loot` already
   tracks. The XP a pickup paid moves with them; the expected XP of a kill near spawn (mob XP plus each row's chance
   times its XP) falls for the pig 14.6 to 10.6, the cow 20.9 to 16.9, the zombie 30.75 to 28.65 and the duskhound
   34.7 to 33.2. `tests/gates/retired-items-no-source-gates.test.js` holds that no loot row, reward, starting bag,
   Forge offer or registry hands the player a retired key, and that no consumable feeds.
72. **Old saves.** No build ever wrote hunger into a save (`buildSaveData` never held the key), so a save holding
   `hunger` under `progression` or `game_state` holds an unknown key: the store never reads it and the tombstone writes
   it back for one SAVE_VERSION. The five foods join `RETIRED_INVENTORY_KEYS`: they leave every bag and every chest on
   load and ride the tombstone back into the same container. **Dropped, not credited:** raw meat and rotten flesh only
   fed a meter that drained nothing since W1-B; cooked meat also healed 10, and its one source, the grid, left in step
   5, while the merchant and chests still sell and drop Health Potions (30); and a credit would come back doubled on a
   rollback, which finds the meat as well. The crystals, the wand and the pickaxe set the precedent (items 46, 66). The
   rule is stated and run in `tests/store/hungerCut.test.js`; the pre-cut fixture with food planted keeps level 5 and
   deals finite damage.
73. **The proof nothing still promised depends on what was cut.** `tests/e2e/the-cut.spec.js` boots a fresh profile
   under Playwright's page clock (installed before boot, so every game timer is the fake clock's), reads the HUD's stat
   stack (health, mana, ember, nothing else), then pauses the clock and moves it ten minutes in 120 jumps of 5 s, the
   deleted interval's period, sweeping hostiles after each: health must not fall, while the provider's mana regen
   refills an emptied bar, the day clock advances and frames are drawn; a staged hit after the window shows the reading
   is live; a real left click hurts a staged zombie; the autosave's blob holds no hunger and no food. Its fixture case
   loads a save holding hunger and Raw Beef through the browser. The unit suite was green with the cut (562 files,
   4881 tests). `tests/e2e/hunger-starvation.spec.js` is REMOVED with its subject (last on main at `ddd4fe78`).
74. **Not proven, and owed:** the e2e's browser mutants (CI runs the spec; no local browser run was allowed), and a
   timer faster than 5 s at its real rate across ten minutes (the jumps fire it once each; the unit gate
   `pause-holds-timers-gates` runs the provider's timers at their real rate for 84 minutes in jsdom).

## 2026-10-29 — [LOOP] Vercel deploys main only

**Decided by the command session under the standing grant** (DECISIONS 2026-10-28 item 14). Item 58; the W2-H media
lane holds 50-57 and the Forge lane 60 on.

58. **Only main deploys; previews are off** (`frontend/vercel.json` `git.deploymentEnabled`: `"**": false`,
   `"main": true`). Supersedes the dependabot-only `ignoreCommand` of 2026-07. Why: the Hobby plan allows 100
   deployments per rolling 24 h, and the 24 h to 10:10Z held 136 (105 Preview, 31 Production, read from the GitHub
   deployments API), so PR #46's preview was refused at 09:30Z ("Deployment rate limited — retry in 24 hours") and the
   next production deploy of main would be refused the same way. No check reads a preview: CI runs the suites and
   prod-smoke on the exact sha, and `ci ok` is the only required check. An `ignoreCommand` cannot fix it, because a
   build it cancels still counts toward the quota (Vercel's Ignored Build Step docs); `git.deploymentEnabled` creates
   no deployment, and a branch that matches several keys deploys when any of them is true (Vercel's git-configuration
   docs), so main deploys and every other branch does not. `tests/scripts/supply-chain.test.js` evaluates that rule
   over main, lane, land and dependabot branches. Not proven until observed: a lane push creating no Vercel deployment,
   and the first main push after the quota window drains deploying (registry `DECISIONS:2026-10-29:58`).

## 2026-10-29 — [LOOP] W2-H: one media pipeline; the README hero and the og card are frames of the production build

**Decided by the W2-H lane under the standing grant** (item 14), by its task script
`docs/superpowers/plans/2026-10-29-crafty-w2h-media.md`, whose metric was written before any frame was shot. Items 50-57
and 59 are this lane's (W2-F talents 41-49, 58 another change's, the Forge from 60). The shot table, its budgets and its checks are in
`frontend/scripts/visual/_media.mjs`; the record of what was shot is `docs/media/media.json`.

50. **No shot shows the HUD, and a frame is judged as a stranger sees it.** W2-D will re-key the HUD soon, and a frame
   shown to people who have not played sells the world, not the readout; a HUD-free frame outlives the re-key, so no
   shot is owed a re-shoot when W2-D lands. The HUD is hidden with the store's own switch (`setHudHidden(true)`, the one
   `App.jsx` reads), not by editing the page, and only after the run has seen its vitals stack on screen: a renamed
   test id fails the run instead of passing every frame (`mediaShotVerdict` `hudSeenOn`). Eye shots keep the
   first-person hands, which are the player's own view. **What makes a frame acceptable**, declared before the second
   shoot and judged by opening every frame at full size: (a) it sells the game to someone who has never played: the
   light of the day script (a low golden sun, blue hour, a fire), the Hearth and its people, or the world beyond, with
   one clear subject; (b) the hero and the og card carry no first-person hands, which fill a third of an eye frame;
   (c) nothing reads as a mistake: the subject, every nameplate and every mob whole inside the frame, no edge of the
   world, no flat band of sky or haze over a third of the frame. Tolerated, since the committed frames carry them and
   none of them hides the subject: a secondary building cut at a side edge (the healer's cabin at the hero's right
   edge), a roof tip of a few pixels at the bottom edge (the watchtower's, in the hero, the og card and the social
   preview), trees cut by any edge, the og card's subtitle crossing Bram's stall, and small fixed objects on the pad.
   The two small green tiles on the Hearth's pad in the three poses are its two leaf planters: 0.6 m cubes in leaf
   green (`#3E7D32`) that `HomeAnchorRender` in `frontend/src/world/Terrain.jsx` sets either side of the lodge, at
   (-2.5, 1.4) and (2.7, -1.4); projected through the hero's pose (fov 75) each lands within about 12 px of a tile, and
   from above a cube that small reads as a flat tile (registry `REVIEW:w2h:pad-slabs`). (d) the og card's left third,
   under the wordmark, carries no subject. A frame that fails one is re-shot once with a new recipe or dropped from
   the table. It stands while it earns its place.
51. **ImageMagick encodes, at shoot time only.** The browser shoots each frame as a lossless PNG master at device scale
   2; `magick` downsamples it (Lanczos) and encodes each JPEG to its byte target with `jpeg:extent`, and the og card to
   an 8-bit palette PNG (a photograph as a truecolour PNG is about 1 MB against the card's 400 KB ceiling). No npm
   dependency: `magick` is already on the shooting Mac, as `ffmpeg` is for the lookbook clips, and the gates read the
   committed files, so CI installs nothing. Budgets, 1 KB = 1000 bytes: each JPEG 350 KB, the og card 400 KB, all of
   `docs/media` 3 MB, and the table's own byte targets must fit them (`shotTableProblems`); each committed file is held
   to its shot's target as its ceiling (`mediaProblems`). It stands while it earns its place.
52. **The og card is composed, not cropped:** the og frame under an ink scrim from the left, dark only behind the words
   and clear from the middle on so the frame's own colour carries the rest, the wordmark in the game's own Lilita One in
   the brand gold, and the brand title's subtitle, drawn in the same browser from `ogCardHtml` with the font files the
   game ships; the run checks that the frame loaded as its master before it takes the card. No buttons and no controls
   text (reset plan section 6). `BRAND.ogImageAlt` describes the
   new card, so the head's og and twitter alt text follow it (`public-face.mjs --write`). It stands while it earns its
   place.
53. **`make-og-image.mjs` and the capture baseline `menu.png` are deleted** (REMOVED 2026-10-29), the last
   file of the retired capture oracle with them. Nothing reads either now: the generator's centre-crop tests go with
   it, and `frontend/tests/scripts/social-preview.test.js` checks that the shipped card has the bytes and size
   media.json recorded for the `og` shot. Both files are kept in history at `3e138271`; the baseline, REMOVED from the
   tree, is `git show 3e138271:frontend/tests/visual/baseline/menu.png` (REMOVED 2026-10-29).
54. **The night fight is optional, and this shoot has none.** The seam cannot spawn a mob, so `night-fight` waits up to
   90 s at blue hour for the night's own hostiles, turns to the nearest one 4 to 14 m out and casts with the real F key;
   when none comes it is left out and named. The first shoot of the first table staged one (a skitterling 11.2 m out
   after 7 s). Both shoots of the second table found none within 14 m (the nearest 32 to 63 m). The fight is the first
   of the night shots, so their own clears come after it, but the golden-hour poses before it had already cleared the
   hostiles within 60 m of their cameras, a radius that takes in the Hearth; that this is why none came is the likely
   reading, not a measurement (no run has shot the fight before the poses). The old frame, from another build, is
   deleted rather than kept beside this run's. It stands while it earns its place.
55. **The lookbook's page helpers are shared** (`frontend/scripts/visual/_lookbookPage.mjs`): launching a Chromium that
   gives the game a hardware renderer, entering play and reading the seam, moved out of `lookbook.mjs` unchanged in body.
   The media are shot through the lookbook's own path, not a second one, at the same four times, which the light script
   names (`frontend/src/render/colourScript.js` `LOOK_TIMES`) and both read. A golden hour outside the window the gate
   pins fails (`media-plan-gates`): the setting branch between the sunset key and the day key, nearer the sunset key,
   which is cycle fractions from about 0.4557 (halfway to the day key, s = 0.275) to 0.4841 (the sunset key at
   s = 0.10 is f = 0.5 - asin(0.10)/2pi = 0.4841), both ends excluded; 0.48 sits inside it. The afternoon (0.30) sits
   between the same two keys at the day key, so the bracket alone does not tell the two names apart. It stands while it
   earns its place.
56. **Any mob within 3 m of the camera refuses a frame, a passive animal and a named NPC too, and a mob feed that
   cannot be the world's refuses it as COULD NOT CHECK.** The first shoot passed all nine shots with an ox at arm's
   length in the blue-hour still, because the seam counted hostiles only. The verdict reads every live mob from the ECS
   through the seam's read-only `mobs()` (`frontend/src/render/lookbookSeam.js` `mobList`), not the store's minimap
   mirror, which the HUD lane removes, and it holds every kind of shot to the rule, the poses included. The Hearth's
   four named NPCs cannot be hurt and are always in the world, so a list missing any of them is a dead feed
   (`mobFeed`): the frame fails as COULD NOT CHECK and the run exits 3, never "no mob near". The night fight's target
   search reads the same feed (`fightTarget`), and a search that could not read it leaves the fight COULD NOT CHECK in
   the verdict itself (`mediaShotVerdict` `search`). A pose clears the hostiles within 60 m of its camera
   (`POSE_CLEAR_M`), since from above they show as specks. The clear runs once, before the seam's `play()` and the
   frame's 1.2 s settle, so a hostile that spawns or walks in after it can be in the frame: forest-edge's entry records
   a skeleton 45.2 m from the camera. It stands while it earns its place.
57. **The GitHub social preview is Kevin's one upload.** GitHub has no API for it; `docs/media/social-preview.jpg`
   (1280x640) waits in the repo, and its registry row closes when `usesCustomOpenGraphImage` reads true.
59. **`media.mjs` builds the bundle it shoots, and stamps a commit only on that bundle.** The first version stamped HEAD
   with `dirty: false` on whatever `build/` held, so a stale build was recorded as HEAD. Now the run refuses a tree
   dirty outside its own outputs, builds the production bundle itself into a scratch folder, serves that folder, and
   records per file the commit, the index chunk, the bundle's content identity and the file's own sha256. The identity
   (`buildIdentity`) is a sha256 over every file the bundle serves but the run's own outputs (`BUNDLE_OUTPUTS`): the og
   card, which vite copies from `frontend/public` into the bundle, is written by the run, exempt from the tree check and
   drawn in no frame, so a bundle built from the stamped commit names the same identity whichever card the tree held.
   The tree check reads both sides of a rename (`R  old -> new`), so a file renamed out of the source counts even when
   its new path is an output. `runProvenance` decides the stamp: HEAD only when the tree was clean and
   HEAD held still through the build; a bundle handed in with `--build-dir` (for trying a recipe) is stamped with no
   sha and an unknown tree. `mediaProblems` refuses any file without that provenance, and holds each file to the table
   as well as to media.json: its format, byte target, purpose and time, and its sha256, with every file under
   `docs/media` counted, dotfiles too. It stands while it earns its place.

**What was shot:** every committed frame comes from one run of `media.mjs`, 2026-10-29 10:55-11:00Z, on the bundle it
built from `073a8f0d` (index chunk `index-C8iDePj3.js`, build identity `b63642a016b0d648...`), Chromium in its new
headless mode on ANGLE-Metal (Apple M3 Max), tier high, dpr 1.62 to 1.75, under the lane's GPU lock with the 1-minute
load at 4.6 at the start and 5.9 at the end. The run before it, on `0f0ce44b`, was rejected by item 50's rules: the
watchtower's roof cut by the bottom edge of the hero and the social preview, the forge cut under the og card's
subtitle, a slab at the foot of golden-forest, and no fight. Item 50, judged on the six frames of the second run: the
hero, the og card and the social preview look across the Hearth from above, into the low sun or under blue hour;
golden-forest and blue-hour keep the hands, the sun or the brazier at their centre; forest-edge is the lookbook's place
in a clear afternoon. Accepted with these residuals named: the healer's cabin is cut at the hero's right edge, the
watchtower's roof tip shows at the bottom centre of the hero, the og card and the social preview (a few pixels), the og
card's subtitle crosses Bram's stall, and the Hearth's two leaf planters read as small flat green tiles on the pad in
the three poses (item 50). Six files: JPEG quality 88 to 96 under the targets, the og card at 256 colours, 282,950
bytes; `docs/media` is 1,204,138 bytes of its 3,000,000. The coast and snow-terrace stills are dropped: both read as a
flat band of haze over the top third in either light.

**The build identity was recomputed after the run, not written by it.** The run recorded `0ca68d7c...`, a hash over
every file it served, the og card included; the card in `frontend/public` then was the rejected run's, left there
because the tree check exempts the run's outputs, so that identity named no bundle a build of `073a8f0d` gives. With
the run's outputs left out (item 59), the bundle the run served, kept in the session scratch folder, hashes to
`b63642a016b0d6480438247b3e27ffaecf63ca7ca5754d4f4be12c869d97029e`, and so does a fresh `vite build` of
`git archive 073a8f0d`: 28 files each, identical but for `og-image.png`. media.json's six `buildId` fields carry that
value; no frame was re-shot.

**Door:** two-way; the deleted files are in git history, and a re-shoot is one command
(`node frontend/scripts/visual/media.mjs --only <names>`) on a clean tree and a fresh build.

## 2026-10-29 — [LOOP] W2-F step 5: Mara's Forge replaces the crafting grid

**Decided by the W2-F Forge lane under the standing grant** (DECISIONS 2026-10-28 item 14), building W1-H items 7 and 8
by the task script `docs/superpowers/plans/2026-10-29-crafty-w2f-forge.md`. Numbered from 60 (41-49 are the talents
lane's, 50-59 the media lane's). Item 64 amends W1-H item 7's list of three offers. Each stands while it earns its place.

60. **The Forge is one card on Mara, on G** (`frontend/src/game/forge.js`, `frontend/src/ui/panels/ForgePanel.jsx`). It
   lists what she can make for the player now: the weapon line's next blade, the worn relic's next tier, and three
   goods, each price in mined blocks and coins beside what the player holds, a short part marked. `buy` charges the
   price listed under the offer's id (never one carried on the object passed in) or refuses and returns the same
   state; a relic tier bought or outgrown, and a blade held in hand or in a bag, is no longer listed, so it cannot be
   bought twice (a blade stored in a chest is not read: registry `REVIEW:w2f:forge-chest-blade-resold`; the goods stay
   listed, to be bought as often as the player pays). A press the player cannot pay for stays pressable and says what
   is short ("Not enough: 80 coins (have 0)"), so the button is never dead. **Why:** one place that shows every price,
   in place of recipe shapes nobody can see (W1-H item 7).
61. **Starting prices** (`forge.js`): Stone Sword 4 stone and 10 coins, Iron Sword 4 iron and 30, Diamond Sword 4
   diamond and 80; a relic's tier II 3 gold and 40, tier III 3 diamond and 100. A fresh profile's 4 iron pays the Iron
   Sword's blocks, so its first reforge waits only on coins (a night survived pays 10 a night number, a quest 0.4 a
   point of XP). Untested by play: registry `REVIEW:w2f:forge-prices-unplaytested`.
62. **The weapon line reforges the best blade held** (`WEAPON_LINE`: sword 10, Stone Sword 12, Iron Sword 20, Diamond
   Sword 35, damage unchanged in `frontend/src/game/equipment.js`), in hand or in any bag, into the next one: the price
   names that blade and the purchase takes it, adds the next and puts it in hand (what the hand held before goes back
   to the bag). A player with no blade is sold the sword for 4 wood. **Why:** an upgrade, not a second sword in the bag,
   and the hand always ends above every blade held in hand or in a bag (one stored in a chest is not counted: registry
   `REVIEW:w2f:forge-chest-blade-resold`), so the purchase is never a sidegrade. The pickaxe (damage 8, below the
   sword every profile holds) leaves the game: the registry, the weapon slot, the loadout, the held model.
63. **The relic line tempers the worn relic** to tier II and III (`RELIC_MAX_TIER` 3, `frontend/src/game/relics.js`):
   its modifier counts once per tier in `foldVerbMods`, so a tier-III Ember Fang adds 12 s to the roar. The tier
   belongs to the relic, not the slot (`relicTiers`, a persisted progression field and an autosave trigger), so a
   relic swapped out keeps it. A top-tier Lodestone gives a grab five throws, so the hurl pool's bound, derived in
   `hurl.test.js` from the trees and the relics at their top tier, rises and `MAX_FLIGHTS` goes from 6 to 10 (idle
   meshes are hidden). Ember's prices and the talents' numbers do not move. The inventory's inspector reads a relic's
   change at its own tier, and the temper offer says what the next tier does (`frontend/src/ui/relicText.js`, from
   `foldVerbMods`, through the locale), so a tempered relic never reads as tier I.
64. **Goods, and what the grid made that nothing replaces.** The grid was the only source of the storage chest and of
   cobblestone and the renewable one of glass, and the hotbar gate (every hotbar block obtainable) went red without
   them, so the card sells them at the grid's rates and no coins: a Wooden Chest for 8 wood, 4 cobblestone for 4 stone,
   4 glass for 4 sand. This adds a third line to W1-H item 7's list and leaves its lantern for item 67. Cut with no
   successor: every shield and most armour (the grid made them; two quests still give an Iron Helmet, Miner, and an
   Iron Chestplate, Pilgrimage, `frontend/src/QuestSystem.jsx`; the Golden Crown stays chest loot; registry
   `REVIEW:w2f:forge-armour-no-source`), the Health Potion recipe
   (the merchant and chest loot still give potions), cooked meat (step 6 deletes meat), and the ingredient uses of
   Leather, Iron Nugget, Spider Eye and Emerald (registry `REVIEW:w2f:forge-orphan-loot`). **The proof nothing still
   promised depends on the grid:** the hotbar gate now walks each good's price down to the starting loadout or an ore
   drop (`tests/gates/place-executor-gates.test.jsx`), `tests/gates/forge-output-gates.test.js` buys every offer the
   Forge can list and checks it gives a thing the game uses, the full unit suite was green with the grid deleted (557
   files, 4825 tests), and `tests/e2e/forge.spec.js` walks to Mara and buys on CI.
65. **Talking is one verb** (`frontend/src/input/talk.js`): G and the touch tray's Talk button (in the Craft button's
   place) find the nearest living villager within 4 m in the ECS (`mobsQuery`), not the store's 250 ms mirror, and
   route by role as before, the smith now to the Forge; with no villager and no chest in reach a notice says so. The
   tray yields control only when talking opened a panel. Touch had no way to talk to a villager before. The C key and
   the HUD rail's hammer go, the controls panel and the README teach G, and `showCrafting` becomes `showForge`.
66. **Old saves:** a pickaxe in any bag or chest is dropped (`pickaxe` joins `RETIRED_INVENTORY_KEYS`, so it rides the
   tombstone back for one SAVE_VERSION), and one in hand becomes the sword (`saveSchema.js` `liveEquipment`), so no
   hand gets weaker (8 to 10). **Dropped, not credited:** every profile holds one beside a better sword, so a credit
   would be a free tier for everyone. The grid kept no saved state (its escrow lived in React state and went back to the
   bag on close and on pagehide), so nothing else needs a rule. The pre-cut fixture loads at level 5 with its Stone
   Sword in hand and no pickaxe (`tests/store/forge.test.js`).
67. **No lantern offer yet.** Block id 16 does not exist (`frontend/src/world/blockIds.js` ends at 15), and the Forge
   sells nothing that does nothing; W3-A adds the offer with the block, at the lantern brief's price, in the same
   release (registry `MASTERPIECE:the-lantern-and-a-baked/a`).
68. **Not proven, and owed:** the prices' feel (no playtest); the card on touch outside jsdom and on an iPad
   (`REVIEW:w2f:forge-touch-unproven`); the e2e's browser mutants (`REVIEW:w2f:forge-e2e-mutants-unrun`); the relic line
   and the goods in a browser (proven at the store and the card in jsdom); whether a five-throw grab is too strong.
69. **A double press buys one thing** (`ForgePanel.jsx` `BUY_REPEAT_MS`; review of PR #47). A bought blade or relic
   tier is replaced in place by the line's next offer, so the second click of a double press bought that too. After a
   purchase the row's Buy rests for 500 ms, disabled where the player sees it: the two clicks of a double press fall
   inside the system's double-click time, 500 ms by default on Windows (`SetDoubleClickTime`, learn.microsoft.com),
   and no longer a rest leaves repeat purchases of goods unhurried. Each row is keyed by its offer, so a bought tier's
   button leaves the card and a button that held focus cannot buy what replaced it; a pointer press does not focus Buy,
   so Space or Enter pressed for the game cannot fire the last Buy clicked. Keyboard focus does not reach a Buy in the
   game: `InputManager.jsx` catches Tab on the window while a panel is open and closes the Forge. The gate shows a
   focused Buy keeps its keys if a later build lets focus reach it. Proven in jsdom
   (`tests/gates/forge-panel-gates.test.jsx`); a real browser's double click is not.

## 2026-10-29 — [LOOP] W2-F step 4: talents that change verbs, loot relics, and damage from level

**Decided by the W2-F talents lane under the standing grant** (DECISIONS 2026-10-28 item 14), building W1-H item 6 by
the task script `docs/superpowers/plans/2026-10-29-crafty-w2f-talents.md`. Numbered on from W2-E's entry (the hands,
PR #43, which landed first; its last is 40). Each stands while it earns its place.

41. **Damage, health and mana scale with level alone.** The player's own strength, agility and intellect are 10 each at
   level 1 and gain +2, +1 and +2 a level (`frontend/src/game/progression.js` `levelAttributes`): the five points a level
   paid, placed by rule. Gear folds on top; no talent adds a stat; the solvers and `deriveMaxStats` are unchanged. **The
   band, stated before the change** (`frontend/tests/game/levelDamage.test.js`): at level 1 every attack deals what it
   dealt; at 5, 10 and 20 each attack's expected damage sits between today's unspent and focused builds and within 10%
   of the even build (five points a level shared three ways). Measured: +1% to +8% over even (spells +1% to +4%, melee
   +3% to +8%), every hostile's hits to kill between the two bounds; the level's own stats are pinned as literals beside
   the band, which is wide enough to hold a split with no agility growth. **Why:** with allocation gone, a level must
   still be worth its old five points, and the even build is the one a player who spread points had. **What the band
   leaves out:** its builds hold no talent ranks, and before the Cut 20 of the 26 talent nodes added a stat. A level-10
   player with the even build and nine points in intellect nodes (Elemental Focus 3, Cataclysm 2, Conflux, Soul Bond 3:
   +35) cast a non-crit Fireball III for 264; that level casts 187 now (-29%). The four armour nodes (up to 59 armour,
   which takes armor / (armor + 100) off a hit) have no successor, and armour is outside the band. Whether a stat build
   is owed anything is registry `REVIEW:w2f:talents-stat-build-loss`.
42. **Spells scale with level:** a spell casts at the tier its caster's level reached (`frontend/src/game/spellTiers.js`:
   II at level 2 for fireball and iceball, 3 for lightning and arcane, III at 5), the levels the free mastery click
   allowed, with the same damage and mana table. No player loses a tier the click would have bought.
43. **The refund rule for a save from before the Cut**, recorded once as `talents.cut` (`frontend/src/game/saveSchema.js`):
   a save whose progression holds `attributes` gets floor(P / 5) talent points, P being its unspent attribute points
   plus every point it allocated, and every talent rank back as a point, since every node's meaning changed. The pre-cut
   fixture loads at level 5 with 8 points (20 / 5 = 4, plus 3 unspent and 1 rank) and no ranks; a post-Cut save is never
   respecced. **Why five to one:** a level paid five attribute points beside its talent point, so a normal save converts
   to one point per level gained; the stats those points bought now come from the level, so the player gets both back.
   **Doors:** `attributes` and `spellLevels` ride the progression tombstone, and `crystals` and `wand` a new `blocks`
   bag written back under the live inventory, each for one SAVE_VERSION.
44. **The trees** (`frontend/src/game/talentTree.js`): each root unlocks its verb and needs no prerequisite (a level-2
   player can take one); every other node is one modifier in `frontend/src/game/verbMods.js`'s vocabulary. Wildheart:
   Primal Endurance (+3 s roar, 3 ranks), then Apex Predator (the form's swing +25%) or Untamed (+8 s). Voidhand: Twin
   Grasp (a grab holds two blocks), Long Hold (+4 s, 2 ranks), then Singularity (slam +1.5 m) or Event Horizon (+8 s
   hold). Soulbind: Wide Snare (the aim cone doubles), Pack Warden (+1 slot), then Communion (binds at half health) or
   Warden Bulwark (+1 slot). Elemancer: Chain Imbue (the zone leaps to one more hostile within 8 m, 2 ranks), then
   Conflux (zones 50% wider) or Wildfire (+2 leaps). Exclusivity and respec keep their code; a loaded rank whose node is
   gone, over its limit, behind a missing prerequisite, or beside its rival comes back as a point. Ember's prices do not
   move. A kept grab's next block goes on the next click, hurl or slam, beside the first in the air (item 48).
45. **Relics:** one slot (`equipment.relic`, through the existing equip actions), four relics in the same vocabulary
   (`frontend/src/game/relics.js`): Ember Fang (+4 s roar) from emberhusks and duskhounds, Lodestone (+1 grab throw) from
   moss brutes, Snare Knot (the snare cone doubles) from spiders and skitterlings, Prism Shard (+1 leap) from skeletons,
   each at 4-6%, `epic`, so the zone tier raises them far from spawn. A relic and a talent on one key add up.
46. **Crystals and the wand go whole,** with the wand's mana discount, the four ore-to-crystal trades, the wand trade, the
   starting 8 crystals and wand, and the Magic Crystal recipe row (so a level-1 Fireball costs 15 mana, which was 14
   with the starting wand's 6%). The merchant sells potions for coins; mined blocks wait for the Forge (W1-H item 7).
   `affixes.js` went with them (no importer).
47. **Not proven, and owed.** The feel of the trees and the relic drop rates (no playtest); the Talents page fitting one
   screen; the grab's second throw, the wider snare, the chained imbue, Apex Predator, the slam radius and the relics in
   the running game (proven at their reducers and pure helpers, not by a browser); the e2e's browser mutants; WebKit and
   touch for the Talents page. Each has a registry row.
48. **Review round 1 changed four rules** (each fix commit carries its mutation receipt):
   - **The hurl system flies up to six blocks at once** (`frontend/src/game/hurl.js` `MAX_FLIGHTS`, `flightSlot`;
     `frontend/src/world/HurlSystem.jsx`). This replaces item 44's first version, in which a kept block waited out the
     first throw's 1.5 s flight: that wait also blocked a slam, which never flies, ate the click with no cue, and ran on
     R3F's clock while the flight runs on `worldDelta`, so a pause or a hitstop let the second throw replace the first
     anyway. Six holds two grabs of three blocks inside one flight (`frontend/src/game/hurl.test.js` derives it from the
     trees and relics); a full pool gives up the block flying longest. **Why:** the wait was a workaround for a single
     flight, and the single flight was the cause.
   - **A verb reads its numbers every tick.** The roar's length and the grab's throws and hold are compared against
     `getVerbMods()` as it stands on each frame (`beastTransform.js` `activeSince`, `voidhand.js` `heldSince` and
     `thrown`), as the imbue's chain, the snare and the squad cap already were. **Why:** latched at a verb's start, a
     number outlived its relic: roar with Ember Fang, swap to Lodestone mid-form, grab, and one slot gave both.
   - **The retired crystals and wand leave every bag and every chest** on load, held per bag and per chest
     (`frontend/src/game/saveSchema.js` `liveInventory`, `liveChests`), so no chest can hand one back to the bag.
   - **A saved talent map and a saved spell name are untrusted keys:** the node table has no prototype and
     `spellStatsAt` answers only its own keys, so `constructor` refunds as an unknown id and casts nothing.
49. **Review round 2 changed five rules** (each fix commit carries its mutation receipt):
   - **A block kept after a throw lasts only while the build gives it** (`frontend/src/game/voidhand.js`): when the
     relic or rank that gave a grab its extra throw leaves, the kept block drops on the next tick, before any click can
     launch it. This finishes item 48's second rule, which held for the roar and for a swap before the first throw.
   - **A chain's leap lands only on a hostile no zone of its element covers** (`frontend/src/game/elementZones.js`
     `spawnChain`, which replaces `chainTargets` and its fixed 2 m floor): outside the impact's width as painted and
     outside every zone of the element, the chain's own leaps included. **And one element ticks a body once:**
     `applyZoneEffects` acts on membership for every kind, as it already did for frozen, so overlapping zones of one
     element no longer stack their damage. **Why:** the 2 m floor sat inside every zone's 2.5-3 m radius, so a hostile
     beside the impact got a second zone and twice the ticks; a leap is there to spread the element, not to multiply it
     on one body, which is what "same kind nearby refreshes" already says for a re-imbue. A widened zone also meets its
     neighbours (steam, a rune) at the size it is drawn, and a wider re-imbue widens the zone it refreshes.
   - **Every save this build loads or makes records the Cut's refund as run** (`talents.cut`, `saveSchema.js`
     `TALENT_CUT`): a post-Cut save is recorded too, and a store that has loaded nothing starts with the record. A
     pre-Cut build writes `attributes` into every save it touches, so without this a rollback and a roll forward
     respecced a post-Cut build and paid the refund on top; item 43's "a post-Cut save is never respecced" now holds
     through a rollback. The refund's notice counts the points after the load's other grants, and is not raised with
     nothing to spend.
   - **Every load ends a held grab** (`useGameStore.jsx` `loadWorldData`), as a respec and a death do: the grab's held
     branch reads no talent, so a block carried into a build without the grab was thrown by a verb the player lacked.
   - **The load refund is the unlock rule replayed** (`talentTree.js` `refundUnknownTalents` through `canUnlockTalent`),
     so a rule added to the unlock path reaches loaded saves. One outcome moves: a capstone whose own prerequisite is
     missing no longer takes its rival with it. A saved spell name is looked up by the roster's own keys
     (`frontend/src/game/spells.js` `spellTypeOf`), so item 48's `constructor` casts nothing and raises no false "no mana"
     notice.

## 2026-10-29 — [LOOP] W2-J phase 2: one browser library (Playwright), and `import.meta.main` in place of cli-guard

**Decided by the command session** (SOTA reset rows 39 and 37; plan
`docs/superpowers/plans/2026-10-29-crafty-w2j-phase2.md`, which holds the per-probe table). Each stands while it earns
its place.

1. **`puppeteer` is removed as a dependency.** `@playwright/test` is the repo's one browser library: e2e, the lookbook,
   prod-smoke, the perf runner and the probes. The lockfile is the committed one less puppeteer's own 24-package subtree;
   npm 11.6.2 regenerating it from that state changes nothing further about puppeteer (it re-marks peer flags and drops
   two `@emnapi` entries on the unchanged lock too, so those were left out).
2. **prod-smoke keeps every check it made**, on Playwright's Chromium in its new headless mode with SwiftShader, and
   reads each program's link status at first use, so a canvas the page discards (the title diorama, which R3F 9.5
   unmounts with `forceContextLoss()` before disposing it) no longer reads as "no LINK_STATUS" (the flake on run
   40814659930, attempt 1). CI's gates job installs Playwright's Chromium when the pipeline will run prod-smoke.
3. **22 probes are deleted**, with their port rows: each had no caller in a live doc, gate, script or current lane
   plan, and its last real use was between 2026-06-16 and 2026-09-22. Ported, not deleted: `gpu-cost-probe`,
   `pov-probe`, `ocean-probe` (named by current lane plans), `touch-probe` (the reset plan keeps it), `look-e2e`
   (`npm run test:look`, named by `.claude/rules/physics.md`) and `scripts/perf/run-scenarios.mjs` (`npm run perf:m2`,
   now given a port from the allocator instead of e2e's 4179). Every deleted probe is at `1691217b`
   (`git show 1691217b:frontend/scripts/visual/<name>`).
4. **cli-guard is deleted; every script guards its CLI with `if (import.meta.main)`**, and `engines.node` is
   `>=24.2.0 <25` (Node added the flag in 24.2.0; before it the flag is undefined and every guarded CLI would exit 0
   having done nothing). The protection is now `frontend/tests/scripts/cli-entry.test.js`, which imports every
   exporting script in a child process with output, exit, spawn, file writes and fetch trapped, runs a fixture and a
   real gate by path (also through a symlinked directory), and checks the engines floor. It executes the imports, so
   the guards cli-guard accepted while they gated nothing (an always-true guard, a bare `process.argv[1]` test:
   registry STATUS:G-ledger:22) now fail. The pipeline step and the gate-table row go with it, and the generated tables
   are regenerated without it. cli-guard.mjs is at `1691217b`.

**Door:** two-way; the files and the dependency are in git history.

## 2026-10-28 — [LOOP] W2-E: the hands become a viewmodel, and the eye drops to 1.62 m

**Decided by the W2-E lane under the standing grant** (item 14), by the task script
`docs/superpowers/plans/2026-10-29-crafty-w2e-hands.md`, whose metric was written before any frame was shot. The items
continue the numbering after W2-I's (its last is 32). Readings and frames:
`docs/superpowers/masterpiece-2026-10/evidence/w2e/`.

33. **The hands render inside the composer, as a second render pass with its own camera.** `ViewmodelPass`
   (`frontend/src/render/viewmodel.js`) draws the viewmodel scene right after the world's `RenderPass`, before every
   effect (`GameScene.jsx` PostFX). Why inside: the canvas has no MSAA (`antialias: false`, `multisampling={0}`), so
   only SMAA can smooth the gauntlets' edges; the grade and the Neutral tone mapping keep them in the world's colour;
   and bloom carries the ember core, which is what replaces the hand's point light. Drawn after the composer they
   would be aliased, ungraded and untone-mapped (R3F's composer sets `gl.toneMapping = NoToneMapping`). Why a depth
   range and not the depth clear the plan row named: after each pass that sets `needsDepthBlit` the composer copies the
   depth buffer into the texture GodRays tests the sun against (postprocessing 6.39.5 `EffectComposer.render`,
   `GodRaysEffect.update`), and `ViewmodelPass` sets it so that a gauntlet in front of the sun hides it. After a clear
   that copy would hold the hands alone and the sun would shine through every wall; with the hands left out of the
   copy a clear would work, and the sun would show through the hands. The world's `RenderPass` would copy just before
   it, a second full-resolution copy every frame with GodRays mounted; item 40 keeps it to one.
   The viewmodel camera maps its depth into the front 2% of the buffer instead, so the hands are nearer than any world
   surface beyond 0.102 m (the main near plane is 0.1 m) and still test against each other. It has its own fixed 60
   degree FOV (the main camera's moves 75 to 85 with speed), anchors that follow the aspect so both fists stay in
   frame on a portrait iPad, the world's ambient, hemisphere and key light mirrored into view space, a value floor
   (`max(lit, albedo x 0.45)` in the toon shader), and an HDR ember core above Bloom's threshold. The aura sphere, the
   hand's pooled point light and every shadow flag on the hands are gone; the wand the right hand holds by default
   draws its wood and tip with the same floor, and its translucent aura sphere, the orange sphere the task script's
   goal named, is gone too (the gem stays). It stands while it earns its place.
   **Measured** (local production build, Chromium on ANGLE-Metal, M3 Max, 1280x800 at dpr 2, the eye at bearing 240;
   hand pixels are what the hands change against a pose twin at the same eye, by more than 24 in some channel, so a
   hand pixel about as dark as the ground behind it, an ink outline on dark turf, is not counted and the readings lean
   high; the margin over the declared floor is twice the floor): at midnight (0.75) the mean luma of the
   hand pixels went from 28.7 to 100.2 and the median from 7 to 106, against the floor declared before shooting (mean
   48, median 40). Warm at every time (red over blue: 2.9 at midnight). At point blank, against a tree trunk with the
   body 0.45 m from it, the hand pixels near/far went from 0.02 (the old hands sank into the trunk) to 1.14, and on the
   build after review to 0.97 (declared at least 0.9; `evidence/w2e/index.md`).
34. **The eye sits 1.62 m over the ground: `EYE_HEIGHT_M` 0.67 over the body's centre, not 1.2** (the question W1-D
   left this lane). The capsule is 1.8 m and its centre rests 0.95 m up, so the old eye stood 2.15 m up, 0.30 m above
   the top of the head: blocks read small, the player looked down on every mob, and in any two-block passage the
   body fits through (1.9 m with the controller's gaps) the eye sat 0.15 m inside the ceiling block. 1.62 m is the
   eye of a 1.8 m figure. The swing's cone apex keeps its height (`SWING_DROP_M` 0.8 to 0.27, so it stays 0.4 m over
   the body's centre) and melee reach is unchanged; the snare's aim and the hurl's launch start at the new eye, which
   is where the player now sees from. `playerPosition` (the camera, rounded) reads the same integer at rest. It
   stands while it earns its place.
35. **REVIEW:w2k:dark-polygon-between-hands was a mesh of the old hands, and it went with them.** Corrected after
   review: the first reading, the old hands' shadow, rested on a frame that was not W2-K's framing, and the textured
   darkening its pose twin removes is not W2-K's polygon. W2-K's polygon, cropped from its own frames
   (`docs/superpowers/masterpiece-2026-10/evidence/w2k/after-turf-wall-*.png`), is flat and untextured, carries an ink
   outline along its top edge, and is the colour of the old slab beside it at each time (dark brown at 0.30, navy at
   0.75): the old hands' toon material and outline, so one of their meshes, not their shadow. Every one of those
   meshes is deleted, and none of the after frames looked at shows a flat dark shape between the gauntlets (the list
   is in `evidence/w2e/index.md`). Not done: a frame at W2-K's exact sight, which today's sight finder no longer picks.
   A moved camera also stops counting as a shadow caster (`render/Atmosphere.jsx`), since the hands were the reason it
   did (e9d49bdf): turning the view no longer re-renders the sun's shadow map.
36. **Mobs keep measuring the player from the eye, so item 34 moves which ledges are refuge, and the new table is
   kept.** The AI worker's reach test compares the camera (`game/mobSenses.js` `mobSensePoint`) with the mob's centre,
   0.5 m over its floor. With the eye at 2.15 m a single step onto a block put a player out of an ordinary mob's 2.5
   m vertical reach, which `mobSenses.js` names as what the reach must not do; at 1.62 m an ordinary mob reaches a
   player one block above its floor and not two, the moss brute (3.2) two and not three, and a mob on a ledge reaches
   a player up to three blocks below it and not four (it was four and not five). So a pillar taller than the player
   still keeps ordinary melee out, a step no longer does, and the brute keeps its longer reach. The other choice was
   to measure from the body plus a fixed 1.2 m and keep the old table, which would have kept the one-step refuge and
   tied the AI to a height the camera no longer has. `tests/gates/mob-senses-gates.test.js` holds the table, driven
   through the real worker from `steadyEye`, so a later change to the eye height or a reach lands there. The point the
   game posts, `mobSensePoint`, is the camera's position, which the gate does not read (`mobSenses.test.js` pins it);
   that it carries the camera's shake, kick and the roar's reveal pose is `REVIEW:w2e:mob-sense-from-camera`. It
   stands while it earns its place.
37. **The swing and the heavy charge keep the fist in frame** (`frontend/src/render/handPose.js`). Their offsets were
   authored in metres for the world camera at 75 degrees on a 16:10 window and played unchanged at the viewmodel's 60,
   so the charged fist left a 16:10 frame by half and an iPad's portrait frame whole, and step 2 and the portrait
   finisher swept it off the edge. Each offset is now the same share of the frame at the viewmodel's FOV and the
   window's aspect, and each gesture is then shrunk as a whole, once per aspect, until the fist's projected box stays 95%
   inside at every step (or as inside as at its rest, on a phone in portrait). The cost is travel where the anchor
   leaves no room: step 2 sweeps right from a fist already right of centre, so it crosses a third of the half-width on
   16:10 and 8% on an iPad in portrait, and the charge keeps 78% of its draw on 16:10 and 22% in portrait; the turns are
   whole everywhere. The other choice, starting step 2 at the left so it can sweep right, would pop the fist at the
   swing's start, since every swing begins at the rest anchor. The held item now carries its own rest pose, so the
   swing no longer zeroes the wand's tilt, and an equipped sword or pickaxe takes the hands' value floor. Gated by
   `tests/gates/hand-pose-gates.test.jsx`. It stands while it earns its place.
38. **The key light on the hands follows the world's shadow, and the storm's flash reaches them.** The hands receive no
   shadow, so `frontend/src/render/ViewmodelLayer.jsx` casts one ray from the eye toward the key light every 0.1 s
   against the world's fixed colliders, out to the loaded square's far corner at the largest render distance (102 m),
   and eases the key on the hands to 0 where it is blocked and back where it is open over 0.12 s: in a cave, under a
   roof or a tree the gauntlets no longer take the full sun. The flash rides the hands' sky light as it rides the
   world's. The world's fill and its pooled point lights (the hearth, spell lights) are not mirrored
   (`REVIEW:w2e:hand-light-fill-and-point-lights`). It stands while it earns its place.
39. **The player's own beast draws none of its boxes within 0.25 m of the first-person eye** (the halo and core spheres are not yet covered: registry `REVIEW:w2e:beast-form-eye-in-head`) (`frontend/src/render/BeastAvatar.jsx`,
   `beastAvatarParts.js` `SELF_CLEARANCE_M`). Item 34's eye sits inside the hawk's and the golem's heads and a hand's
   width from the golem's torso and the dragon's neck; such a part writes neither colour nor depth and still casts its
   shadow, and in the transform-cam's reveal every part draws. The other choice was a beast eye at the old 1.2 m. It was
   not taken: the camera is the AI's sense point, so mobs would read the old refuge table in beast form, and the roar's
   reveal hands back to the human eye, so the camera would pop 0.53 m as it settled. It stands while it earns its place.
40. **One depth copy a frame, no draw of an empty viewmodel scene, and the cone apex set from the body.** With GodRays
   mounted, `oneDepthCopy` (`frontend/src/render/viewmodel.js`, applied each frame by `PostTierDriver`) keeps the
   world's `RenderPass` from copying while the viewmodel pass is enabled and follows it, and lets it copy in any other
   arrangement. `ViewmodelPass` draws nothing while the hands group is empty. `SWING_APEX_OVER_BODY_M` (0.4) replaces
   the drop from the eye that item 34 retuned, so an eye change leaves melee reach alone. And a treasure chest that comes
   or goes marks the sun's shadow due, as nothing did once item 35 stopped the camera counting as a caster. It stands
   while it earns its place.

## 2026-10-28 — [LOOP] W2-J phase 1: a short CLAUDE.md, `npm run orient`, a cursor, and the loop docs retired

**Decided by the command session** (SOTA reset rows 29, 38 and 57, and the orient half of 31; plan
`docs/superpowers/plans/2026-10-28-crafty-w2j-phase1.md`). Each stands while it earns its place.

1. **`CLAUDE.md` is 12,000 bytes or less** (enforced: doc-currency's `size` check) and states each standing directive,
   or names the `.claude/rules/` file that carries it at the moment of use, and each invariant with its enforcer.
   Detail and long rationale live in the path-scoped rule file that loads when its code is touched (new:
   `.claude/rules/game-code.md`; the generated table of every gate moved into `.claude/rules/gates-and-probes.md`, which
   loads when a test or script is edited, and `CLAUDE.md` keeps the tiers in three lines) or in the header of the
   script it explains. Numbers in it are generated or absent.
2. **`npm run orient` is the first read** (`frontend/scripts/dev/orient.mjs`): HEAD, CI on main and HEAD, the live
   Production sha, open PRs, unmerged worktrees, the cursor and the registry's counts, read live. The generated read
   order starts with it and no longer names the charter, the drained holistic review or SOTA-INITIATIVE.
3. **LOOP-CHARTER and LOOP-KERNEL-PROMPT retire**, and `SOTA-KICKOFF-PROMPT.md` is deleted; `SOTA-INITIATIVE.md` moves
   to `docs/superpowers/`. Their rules that still bind moved first (the plan's directive table names each rule's new
   home, or why it was dropped). All three stay reachable at `2fef2f32` on main (`git show 2fef2f32:<old path>`), which
   is the archive the restored archive-over-delete rule asks for.
4. **`memory/ACTIVE_PLAN.md` is a cursor** of 60 lines or fewer: the live task table and the next step. Its history is
   git's; its open items are registry rows, two of them added by hand from the old cursors.
5. **The cold-takeover eval checks the instruction surface after a rewrite** (`frontend/scripts/dev/cold-takeover-eval.mjs`).
   What it measures: whether Sonnet 5.5, with only a copy of the repo, orients (runs `npm run orient` or reads the
   cursor) and answers 14 questions within 15 tool calls without stating an inversion its forbidden patterns name, scored by fixed
   patterns that read each answer's local polarity. A rule inverted in other words can still pass: the scorer reads
   the polarity of named phrasings, not of the concept, and its planted control is worded to match those patterns. Twelve are directives: two live only in `.claude/rules/` files (capture guards, probe
   ports and denominators) and two are rules the first rewrite dropped (recording decisions, what to check before an
   edit and a commit). What it does not measure: whether an agent then acts on a directive, any directive no question
   names, or more than a few samples of a stochastic agent. At `bee75223`: two after-runs PASS (14/14, 5 and 7 tool
   calls, both ran orient); a control with stale lines planted on four questions (three in `CLAUDE.md`, one in
   `game-code.md`) FAILs on exactly those four. The first version's results (10/10 after, 9/10 before) were scored by
   a scorer that passed inverted answers on 9 of 10 questions; they are superseded, not evidence.
6. **Kevin's 2026-10-27 mandate to record every non-routine decision is in `CLAUDE.md` again**, with the charter's
   rules that went with it: a hard delete of a referenced file, a new dependency, an external send he approved and a
   reversal are recorded; a large player-facing deletion also records its lived or e2e proof (also in
   `.claude/rules/game-code.md`); a retired doc stays reachable by a named commit or tag. The rewrite had dropped them,
   and the review of PR #42 found it.
7. **`npm run orient` judges main as GitHub has it** (`git ls-remote`), names any drift of the local `origin/main` and
   `main` from it and of the live Production sha from main, and prints the cursor's task table and Next paragraph.
8. **doc-currency also reads the rule files** (`.claude/rules/*.md`) for dangling paths and § citations, counts a
   `.claude/`, `.github/`, `.githooks/` or `ci/` path as a citation, and checks every citation of a CLAUDE.md heading
   (the file name in backticks, then the heading's opening words in double quotes) against CLAUDE.md's `## ` headings.

**Door:** two-way; every removed file is in git history.

## 2026-10-28 — [LOOP] W2-I: the post passes measured on the GPU's own busy time; N8AO deleted, the rest kept

**Decided by the W2-I lane under the standing grant** (DECISIONS 2026-10-28 item 14), by the rule in
`docs/superpowers/plans/2026-10-28-crafty-w2i-passes.md`, written before the measurement and amended twice before the
runs it decides on. The items continue the numbering after the material-grammar entry below (its last is 27), so
"DECISIONS 2026-10-28 item 29" names one item. Readings: `docs/superpowers/masterpiece-2026-10/evidence/w2i/`. Why the lane exists:
Kevin heard his M3 Max run hot on the live site; #24 cut the pixels, this cuts GPU work per frame.

28. **What a pass costs is read from the GPU's own busy time, not from timer queries.** The per-pass timer segments
   summed to 55-63 ms per frame at 60 frames a second, and the whole-frame query (one query per composer.render, opened
   after a sync) read more than the synced wall clock that brackets it in 214 of 240 windows: neither is GPU execution
   time on ANGLE-Metal. The decision instrument is U, the driver's "Device Utilization %" (`ioreg`, no root) times the
   frame interval, in a free-running window, admitted at each time by an all-post control that moved it by 4.6 to 10.3
   ms. The GPU sat at one of two busy levels (about 45% and 87% at the same 60 frames a second), switching every tens of
   seconds, so the windowed run (5 interleaved repetitions of 5 s pairs) under-reads a pass whose pair straddles a
   switch; a fast alternation (the pass off and on every 1.5 s, 18 pairs per arm and time) reads inside one level and,
   by the rule, can only block a deletion. Both stay in the lookbook (`--passes`, `--alt`) for the next pass question.
29. **N8AO is deleted.** U, windowed: 0.32 ms at noon and golden hour (4%), **2.31 ms at midnight (26% of the frame,
   5 of 5 positive)**, material by the rule; the alternation does not block it: 3.41 ms at noon (29%), 3.67 at golden
   hour (25%), 2.58 at midnight (24%), every one of 18 pairs positive each time. The look loss is small: a slight
   darkening under the leaf canopy at noon and golden hour, nothing at midnight, and the mesher's baked vertex AO still
   darkens every block corner. No ink-edge pass replaces it. The r3f chunk loses 141,581 B (829,540 to 687,959 B, 77 KB
   gzipped) and its budget ceiling falls by that, 900,000 to 760,000 B; `n8ao` leaves `package.json` (it stays installed
   as `@react-three/postprocessing`'s own dependency). Two gates keep it out: `scripts/ci/bundle-budget.mjs` fails on
   either of two strings only n8ao's code carries in any chunk, and `scripts/ci/prod-smoke.mjs` fails when the chain the
   production build renders has a pass of N8AO's shape (`chainVerdict`, `CHAIN_ABSENT`). Door: two-way; restoring it is
   one dependency and one element in `GameScene.jsx`, with the ceiling raised back in its own commit.
30. **GodRays and the Sun billboard stay.** U, windowed: 0.17, -0.48 and 0.14 ms (2 to 3 of 5 positive: the busy-level
   switches); not material. The alternation reads 1.33 ms at noon and golden hour, 9% of the frame, under the 10% line,
   and it can only block. The look loss would be large: at golden hour, facing the sun, the sun disc and its warm glow
   are the frame, and without them the sky has no sun and the scene reads as flat overcast. At noon facing the sun the
   shafts wash the upper half of the frame (the lodge roof pale pink-beige instead of maroon), a look note for the light
   and colour lane, not a deletion under this rule. It is the largest remaining pass and the first candidate when
   steady-cool's pixel budgets rise toward dpr 2. **No dynamic import:** `GodRaysEffect` lives in postprocessing's single
   module in the r3f chunk, which boot loads for the composer, Bloom and SMAA anyway, and GameScene already builds the
   effect only when a tier first needs it, so a dynamic import would move nothing off the boot path.
31. **Bloom, SMAA, tone mapping, the grade and the vignette stay.** U, windowed, largest of the three times: Bloom 1.19
   ms (8.1%), SMAA 0.88 (6.6%), tone mapping 0.12, the grade 0.15, the vignette 0.12; none material. The alternation
   reads Bloom 1.17 ms (8%) and SMAA 0.67 to 0.75 (5%).
32. **Not proven, and owed.** Watts: `scripts/dev/power-ab.sh` needs root and stays Kevin's optional row; the GPU-time
   saving is measured, the temperature and fan change are not. The iPad: WebKit was not measured (no timer extension,
   and utilization was read only for Chromium), though `low` never ran N8AO. Other machines, and which busy level a
   player's Mac settles at. Steady-cool's budgets rising toward dpr 2 with the freed time is #24's follow-up, not done
   here. Rapier lazy behind the title (plan row 28) has its own open registry row (`PLAN:sota-reset:28`).

## 2026-10-28 — [LOOP] One material grammar: clustered tones, and top, side and bottom faces (lane W2-K)

**Decided by the command session's W2-K lane** under items 14 and 16 of the 2026-10-28 landing entry, building Units
0-2 of `docs/superpowers/plans/2026-10-27-crafty-material-grammar.md` as its 2026-10-28 amendment scopes them (plan
row 44 of the SOTA reset). Numbered on from that entry's last item. Each stands while it earns its place.

25. **The block textures speak a tone grammar** (`frontend/src/world/proceduralTextures.js`). The bold-flat texture
   look (solid fills, NEAREST up close, no PBR or normal maps) now reads: each material is two to four
   solid tones (`MATERIAL_TONES`), painted in clustered shapes from value noise on a lattice whose cells divide the
   32-texel tile, never per-texel static. **Why:** every layer was per-texel noise (22 to 170 distinct colours, a
   texel sharing its neighbour's colour 1-11% of the time), which reads as static up close and, before the mipmaps,
   crawled at distance; the leaves' 15% near-black "holes" read as mould. **Value held:** each layer keeps its linear
   mean within 15% in luminance and 0.03 in chromaticity of a reference frozen before the repaint
   (`frontend/tests/world/material-before-2026-10-28.json`); measured, every layer is within 5.5% in luminance and 0.012 in chromaticity. The far field,
   the biome tint, the grass blades' match to their turf, the ore glow and the light rig keep their inputs, so the
   light and colour lane's tuning stands. The tones are shaded by rank, not by threshold, so a layer's mean is set by
   its shares. Stone stays grey (`r = g`, `b - r <= 3`) under the ore glow's chroma edge, and the ore tiles' matrix
   is stone without its cracks. **Gates:** `frontend/tests/gates/material-grammar-gates.test.js` (declared tones,
   clustering, seams, the frozen means, no texel under 0.35 of its layer's mean but a nugget, stone never glowing).
   **Cost:** no GPU change (same array, same fetch); the index chunk grew 1,059 B. Mutations are in the commit's
   trailers.
26. **A block's top, sides and underside may show different tiles** (`frontend/src/world/materialGrammar.js`). Grass
   sides show a turf lip over dirt (`grass_side`), snow sides a snow lip over stone (`snow_side`), trunk sides bark
   (`wood_side`) while a cut top keeps its rings; the underside of turf is dirt and of snow is stone. The lip is
   painted in the tile's top six rows (`LIP_TEXELS`), running one or two rows lower in about a third of the columns,
   and the mesher now runs `v` up world Y on every side face (it ran `u` up the wall on X faces), so each block of a
   stacked wall shows its own lip. **Why:** grass hills read as green cliffs with no soil under the turf, and every
   trunk side showed end-grain bullseyes. **How it is chosen:** the terrain's vertex stage takes the face's role from
   its normal and reads the layer from a const table generated from the same `Uint8Array` the node gates read; the
   fragment stage samples that layer, and the biome tint, the ore glow and the leaf feel still key on the block type.
   **Cost:** about five ALU per vertex and one flat varying, no extra texture fetch; the array is 19 layers (103,740 B
   with its chain on the GPU, +16,380); the mesher's time is unchanged (64 real chunks, median ratio 0.999); the index
   chunk grew 2,427 B more (3,486 B for items 25 and 26 together). **Gates:** `material-grammar-gates` (the table
   against literals, the generated GLSL read back as JavaScript for every block and axis normal, the derivation for a
   new id, the variants made of their parents, bark's vertical grain) and `mesher-geometry-gates` (every normal's
   role; `v` rising 1:1 with world Y from a whole block height on all four side directions). **Not proven here:**
   WebKit (iPad). The look on Chromium is in the plan's record, on eye-level lookbook frames.
27. **The face layer is derived in the terrain's vertex stage, never baked into the mesh, and the array's depth is
   derived.** `colors.b` stays unwritten, for the block-light level a later light field writes there (the lantern
   plan, `docs/superpowers/plans/2026-10-27-crafty-lantern-block-light.md`, and its brief,
   `docs/superpowers/plans/2026-10-28-crafty-brief-lantern-costed.md`); a gate fails if the generated GLSL reads it.
   The texture array is the block id space plus the face variants (`TEXTURE_LAYER_COUNT`), with the variants above the
   ids, so the lantern's id 16 makes the array 20 deep and moves the variants to 17-19 with no edit to the grammar.
   `frontend/tests/world/proceduralTextures.test.js` held the count at a literal 16; it now asserts the derivation.

## 2026-10-28 — [LOOP] The SOTA reset's standing decisions (W1-H)

**Decided by the command session** under item 14 of the 2026-10-28 landing entry below, from the SOTA reset plan
(`docs/superpowers/plans/2026-10-28-crafty-sota-reset.md`, lane W1-H). Numbered on their own, so they cannot collide with
that entry's items. Each stands while it earns its place; reversing one takes a new dated entry. The mipmaps decision
(plan row 10) is W1-E's entry, written with its measurement, and is not repeated here.

1. **The capture oracle retires** (plan row 4, lane W2-B). Supersedes "The 31 baselines remain a regression oracle"
   (`docs/superpowers/masterpiece-2026-10/roadmap-2026-10-27.json:261`) and rule 2 of "How a move counts as done" in
   `docs/superpowers/plans/2026-10-27-crafty-masterpiece.md:26-28`. Why: capture mode turns off weather, mobs, NPCs,
   particles, spawning and the hands, so its frames show a build nobody plays, and shipped source carries 131
   `isCaptureMode()` calls (`rg -c` over `frontend/src`, 2026-10-28) that no player needs. Looks are accepted on the eye-level lookbook (W1-D); DOM-only
   checks use Playwright's `toHaveScreenshot`. No re-baseline is owed meanwhile, so ACTIVE_PLAN task T10 and masterpiece
   Phase 0e are cancelled. `tests/visual/baseline/menu.png` (REMOVED 2026-10-29, W2-H item 53) stays until the media
   pipeline (W2-H) replaces the og-image source.
2. **The umbrella is amended** (plan rows 12, 45-49; section 10). Supersedes the Phase 0-3 structure of the masterpiece plan
   above. (a) A Cut wave (W2-F) removes the sandbox layer before Wave 3 builds, so no lane ports a dead system. (b) The
   platform work (W2-G, W3-D) runs beside the game lanes, not in front of them: the refuter showed the dragon and
   feedback-grammar plans need no ECS rewrite. (c) One HUD lane with one owner (W2-D) takes every HUD change from the
   first-minute plan, the visuals lens and roadmap move 6. (d) Phase 0e and T10 are cancelled (item 1). Phase 3 regroups
   into the First Night (W3-A) and the road of light (W3-B).
3. **Lane briefs plus task scripts of 300 lines or less** (plan row 33). Supersedes Kevin's 2026-06-10 rule that every
   milestone gets a full plan doc before it is built (`CLAUDE.md:248`). Why: the twelve 2026-10-27 lane plans run 771 to
   1,720 lines against code the Cut will change, so their step scripts would be rewritten at lane start anyway. Now an
   unstarted lane carries a brief of one page or less (8 KB) that links to its reset-plan row and states scope, files,
   acceptance and one-way doors. At lane start it writes a task script of 300 lines or less against the code as it is
   then, with red-first steps and the gates it runs. The 2026-10-27 designs stay as reference. Kevin's rule fixed
   building from a spec with no build contract; the brief keeps that and drops the cost. Plan row 29 (W2-J) rewrites
   `CLAUDE.md:248`; until then this entry governs. The first briefs are named in item 9.
4. **One costed build mode** (plan row 19, lane W2-F). Supersedes the builder sandbox in
   `frontend/src/world/placementEconomy.js:6-7` ("CREATIVE mode — the game's default — keeps free placement") and the
   default `gameMode: 'creative'` (`frontend/src/store/useGameStore.jsx:694`). Placing a block spends one mined block in
   every game; the creative/survival toggle and the Mode chip go. Why: free walls make holding a siege no choice, and free
   placement would make build accrual (item 5) farmable. A free-build world may return later as a world type. Door: the
   `gameMode` save field stops being written at the Cut; the tombstone pass-through (plan row 20) carries it one release.
5. **Ember: one meter, and it keeps build accrual** (plan row 21, lane W2-F). Supersedes the four banks, Ferocity, Kinetic,
   Soul and Resonance (`frontend/src/store/useGameStore.jsx:546-561`, `:824-826`), and their four HUD bars. One `ember`
   bar feeds the four spends (roar, grab, snare, imbue). It accrues from day kills and from building, as Resonance does
   today (`frontend/src/game/resonance.js:11`), with a per-day cap. Why: four meters that fill the same way read as one
   meter drawn four times; the choice that matters is the spend. Building stays a source because placement now costs
   blocks (item 4); the cap stops a build-and-break loop. Bank by day, spend by night, stays.
6. **Progression becomes talents that change verbs, plus loot relics** (plan row 22, lane W2-F). Supersedes hand
   attribute allocation (`frontend/src/store/useGameStore.jsx:326-333`, five points a level at `:450-456`), the free
   spell-mastery click (`upgradeSpell`, `frontend/src/world/spellUpgrades.js:90`, REMOVED by W2-F step 4) and the crystal
   wallet with its wand discount (`frontend/src/game/crystalWallet.js`, the 2026-07-14 B3b fix, REMOVED by W2-F step 4). A
   level grants one talent point; a talent changes how a verb plays; relics come from loot; spells scale with level. Why:
   seven axes that each add a number give a player nothing to choose. It needs a damage rebalance first, because
   `solveSpellDamage` reads attributes. `frontend/src/game/affixes.js` (no importer, REMOVED by W2-F step 4) goes with it.
7. **The Forge replaces the crafting grid** (plan row 23, lane W2-F). Supersedes the 3x3 grid
   (`frontend/src/ui/panels/CraftingTable.jsx`, `frontend/src/data/recipes.js`, both REMOVED by W2-F step 5, the C
   key, the touch-tray Craft slot, the pickaxe item) and with it the 2026-07-14 grid fixes (B3a sword patterns, B3d escrow). A Forge card on Mara (G)
   offers three things, each with its cost shown: a weapon upgrade, a relic upgrade and a lantern. Why: hidden recipe
   shapes are guesswork, and a drag grid does not work on iPad. The pickaxe is a weapon stat stick (damage 8), so it
   folds into the weapon line.
8. **The lantern is costed, and the radius rule ships first** (plan row 15). Amends
   `docs/superpowers/plans/2026-10-27-crafty-lantern-block-light.md` before block id 16 ships: its grid recipe (1 glass +
   1 coal, Unit 5) and its spawn rule on the baked light field (Unit 6). The lantern is bought at the Forge (item 7), and
   W3-A ships a radius rule: no natural hostile spawn within R of a placed lantern, R starting at 16 m. The light field
   follows as its own lane. Why: a cheap lantern goes everywhere and stops meaning anything, and the radius rule is one
   distance check the siege can build on now, where the light field is a mesher and shader change. Door: block id 16
   enters saves at the first push that lets a player save one, so the radius rule and the Forge price land with the
   block, never after it.
9. **`memory/registry.jsonl` is the one home for open work** (plan row 30). Supersedes the open-work role of STATUS §2,
   its G-ledger and the "Residue: memory/STATUS.md G-ledger" line in ACTIVE_PLAN. The registry holds every open item
   harvested from STATUS §2 and its G-ledger, the ACTIVE_PLAN task list and owed block, the sota-2026-09 QUEUE and
   OPEN-ITEMS files and the masterpiece phase tables. A source item that bundles several fixes is split into one row
   per part (id `key/part`) where a lane closes part of it; some harvested rows (G-ledger 37, 39, 40, OI-47 and two
   E-ter rows) are still bundles, and the lane that closes part of one splits it first, so a merge never closes an
   unbuilt part. Rows follow the plan's schema (`{id, title, playerVisible,
   severity, owner, state, evidence, opened, closedBy}`, plus the harvest key and the plan unit). `evidence` is the
   source line, pinned to the commit on main it was harvested from. `opened` is the date that line was first written
   (`git log -L`), so an item carried into a source when the source was created reads the creation date. A done item
   is closed, never deleted: `closedBy` names the commit that closed it, or the decision or document that did when no
   commit did (a cancellation by decision, a pull request closed unmerged). Kevin owns a row only when it needs his
   device, ear, money, an account sign-in, his explicit OK for an external send, or a decision its source reserves for
   him. Until those sources leave HEAD (plan row 32), `frontend/scripts/ci/registry-harvest.mjs` (run by
   `tests/scripts/registry-harvest.test.js` in every unit run) fails when a source holds an open item with no registry
   row, or yields fewer items than its floor in `frontend/scripts/ci/registry-floors.json`; closing items at the source
   lowers that floor in the same change. `frontend/scripts/ci/registry-append-only.mjs` fails a push, in pre-push and in
   CI, that deletes a row id. New open work goes straight to the registry. The first lane briefs under item 3:
   `docs/superpowers/plans/2026-10-28-crafty-brief-w2b-retire-capture-oracle.md`,
   `docs/superpowers/plans/2026-10-28-crafty-brief-w2d-hud.md`, `docs/superpowers/plans/2026-10-28-crafty-brief-w2f-the-cut.md`,
   `docs/superpowers/plans/2026-10-28-crafty-brief-lantern-costed.md` and
   `docs/superpowers/plans/2026-10-28-crafty-brief-quest-spine.md`.
10. **The three placement-count quests go** (lane W2-F, with item 4). Builder, Architect and World Builder
   (`frontend/src/QuestSystem.jsx`, `QUEST_LIST`: place 20, 100 and 500 blocks) are deleted. Why: under item 4 a placed
   block costs one, but breaking it gives it back (`frontend/src/world/terrain.worker.js:120-130` reports the broken
   block's type; `frontend/src/world/Terrain.jsx:732-742` adds it to the inventory), so placing and breaking one block
   completes all three for 600 XP and 24 wood at no cost. Item 5 caps that loop for ember; a quest counter has no cap.
   Building pays through ember and the siege, and the quest line moves to the spine (the quest-spine brief). Door:
   their ids in saved quest progress ride the tombstone pass-through (plan row 20) for one release.

## 2026-10-28 — [LOOP] Close-quarters combat: the stance, the windup chevrons and the light string (`feat/combat-stance`)

**Decided by the combat-stance lane under the standing grant; the constants an encounter or boss tuner balances
against.** Plan: `docs/superpowers/plans/2026-10-27-crafty-combat-stance.md` (its "Why the numbers are what they are"
section is the derivation). Every value below was printed from the modules on the branch, not copied from the plan.

1. **The stance caps are derived, not typed** (`frontend/src/game/combatStance.js`): retreat **2.0 m/s** (the slowest
   pursuer, the zombie at 3.0, minus a 1.0 m/s closing rate), strafe and advance **6.5 m/s** (the fastest, the
   spider at 6.0, plus 0.5). The clamp acts on the away-from-threat component of the move velocity, whatever key or
   stick produced it. Strafe and advance scale with the form's `moveMult`; all three scale with the walk slows (the
   heavy's charge 0.55, the string's swing slows). A slower pursuer added later reds
   `frontend/tests/gates/stance-roster-gates.test.js`, which names it; the stance itself never refuses a roster at load
   (the module is on App's import chain, so a throw there blanks the game), it holds the retreat at `RETREAT_FLOOR`
   (1.5) and logs the violation.
2. **Engagement**: an aggro'd hostile pursuer within **12 m** whose height difference is within its OWN vertical reach
   (`engageDyM`: 2.5 m, 3.2 for the brute, the 6 m leap for a climber). The height is measured from the point the AI
   worker strikes from (`mobSensePoint`, the eye, in `frontend/src/game/mobSenses.js`), one function for both readers.
   A mob outside its strike reach that makes less than **0.5 m** of its own progress in **1.5 s** stops qualifying
   (the stall release). The stance leaves **2 s** after the last qualifier, blends in over 0.2 s and out over 0.6 s,
   and keeps its threat until another is 1 m nearer.
3. **Exceptions, by name**: the walking moss brute (1.8 m/s) can be backpedalled from on purpose (its threat is the 5.4
   m/s charge), and the skeleton never engages the stance: it kites, and counting it would pin a player walking away
   at the edge of its range.
4. **The boss and the dragon are NOT in the stance**: it scans the ECS mobs, and the boss is not one. A dragon fight with
   no adds keeps the 14 m/s walk. Whether the dragon joins (through its own seam, with a pursuit speed for a flier) is
   the dragon lane's decision (`docs/superpowers/plans/2026-10-27-crafty-shadow-dragon.md`).
5. **Travel stays Kevin's 14 m/s.** At stance weight 0 the controller's target equals `moveVector`'s exactly.
6. **The combat zoom is accepted as intended**: the existing FOV formula reads the achieved speed, so engaging mid-run
   narrows the view from about 88.5 to about 77.7 degrees. **The by-eye verdict on it is NOT yet taken** (the plan's
   Task 12 dev-session check did not run). If it reads as a jolt, the named fallback is to feed the FOV the pre-clamp
   speed while the stance is engaged.
7. **The night-travel fraction with the stance engaged (refute F1:13) is NOT measured.** It is owed to a dev
   session, together with how many engaged spans ended by the stall rule; a high fraction comes back here as a question,
   never as a silent retune.
8. **The light string** (`frontend/src/game/meleeString.js`): three steps, a **650 ms** window to the next swing, a
   **200 ms** buffer before the 300 ms cooldown ends, a finisher at **1.5x** with a **140 degree** arc and a 2x shove, a
   heavy-tier hitstop and the slam's thump, then **500 ms** of recovery. A dodge keeps an open window alive (the step is
   kept); it never revives a lapsed one. **A thrown heavy ends the string and holds the next light swing 300 ms.** Lost
   input, a beast form and death end it too. The string is the human sword's, not a form's.
9. **The swing slows the walk out of combat too** (0.6 for 120 ms after a light swing, 0.4 for 220 ms after a
   finisher), as the heavy's charge slow already did. It is the milestone's one out-of-combat movement change.
10. **The windup chevrons** (`frontend/src/game/windupChevrons.js`, `frontend/src/ui/WindupChevrons.jsx`): at most 4,
    for hostiles winding up within 12 m and off screen by the camera's projection (so a steep pitch counts), on a frame
    inset 120 px from the top, 96 from the sides, 140 from the bottom on desktop and round(0.11 h) + 170 on touch. The
    layer loads behind a `React.lazy` boundary: in the boot chunk the lane measured +9,024 B against its +9,000 B
    share; lazy, +6,311 B (index 725,739 B on the branch, 34,261 B under the 760,000 B ceiling).

**What is not proven yet, and blocks the merge**: every e2e verdict for the chevrons, the string and the touch proofs
(their headers say `Mutation-Proof: OWED`), the chase sub-assertions at CI's frame rate, and the plan's reviews. Load
above 115 on 14 cores ruled out local runs. The stance's own e2e has local verdicts (Task 5).

## 2026-10-28 — [KEVIN] One CLAUDE.md: the symlink and its directory are gone

**Decided by Kevin, in his words:** "i don't really like how the agents.md symlinks to claude.md in this repo, let's just have one claude.md."

**Supersedes** the layout the file described about itself: the instruction text lived in a directory of its own as AGENTS.md, and the root
`CLAUDE.md` was a symlink to it, so that Antigravity and Gemini could read the same copy.

**What shipped.** `CLAUDE.md` is now a real file at the repo root, with the former AGENTS.md text unchanged apart from its header, its layout block and
the generated blocks (the file's earlier history is under the old path; git cannot pair it with a path that already existed as a link). The
directory is removed; it held nothing else tracked (its two workflow notes were already deleted in `974f9a54`). The three generators (`measure.mjs`,
`gate-table.mjs`, `read-order.mjs`) write into `CLAUDE.md`; `doc-currency` lists it as canonical;
`ci/write-receipt.sh` (itself removed later by item 24) no longer names the removed directory as an input root; the
opsec ledger entry moved with the file.

**Door.** Reversible: a link can be added back in one commit. **What it costs.** A harness that read the old directory (Antigravity, Gemini) no
longer finds the instructions there; none is configured to in this repo.

**Plans and audits dated before this** that say AGENTS.md mean `CLAUDE.md`; they are history and stay as written.

## 2026-10-28 — [LOOP, Kevin-delegated] Landing lifecycle: PRs with free CI, merges by merge commit, six e2e shards; PR #28 parked

**Decided by the command session (Kevin asleep; standing authority).**

1. **Every lane lands through a PR**, because main deploys to the live site on every push and the e2e suite runs
   reliably only in CI (local receipts failed three times on 2026-10-27 on machine load, none on code). Actions are
   free: the repository is public. Kevin asked for the milestone as a PR (#22) for his `/code-review ultra`; the
   pattern is now general.
2. **Merges are local merge commits, never cherry-picks or GitHub squashes** (the repository allows only squash in
   the UI). A cherry-pick on 2026-10-27 left a branch git calls unmerged, deletable only by `git branch -D`, which is
   denied estate-wide; AB's `worktree-reap` (now allowed for this repository only, Kevin 2026-10-27) deletes merged
   branches with `-d`, and Kevin's K55(d) moves stale unmerged ones to `refs/backup/branches/`.
3. **E2E runs in 6 shards** (`17e06ecd`): every shard of #22 hit its 25-minute limit with all finished tests green.
4. **PR #28 is parked as a draft** after two review rounds. It let a docs-only commit borrow CI's e2e verdict from an
   ancestor with the same app identity. Round 1 refuted it (identity ignored ci.yml; a newer red was skipped); round 2
   closed that, and the dynamic review found nothing blocking, but a fail-open mutant (only a commit's newest run
   read) and two pre-existing weaknesses (only each run's latest attempt is read; the base read has no event filter)
   remain. It is a convenience; the landing headroom below allows one PR, which goes to #22. Revisit with a
   fail-closed rule: any push or dispatch run with no verdict on a same-identity commit stops the walk.
5. **Landing is capped by the published operator pages.** `artifact-currency` refuses a push more than 30 commits past
   the pages' publish sha; era-review and sota-audit belong to account 1, which this session (account 2) cannot
   write. Until Kevin's morning answer (ACTIVE_PLAN, "For Kevin" 1), at most one PR lands: #22 first.
6. **Then option (b), taken ~01:30Z while Kevin slept:** the cap had reached every lane (touch-hold's push refused at
   41), so the three page sources were refreshed against measured state (`d00273cd`), read in full before publishing,
   and era-review and sota-audit were published from account 2 at NEW addresses — era-review
   https://claude.ai/artifact/Q1QQLYLxPVYZ8A7Srm1BMF, sota-audit https://claude.ai/artifact/NuwFDNnfZG3gRHv6LH1krr —
   with `.artifact-sync.json` repointed and synced at `d00273cd`. The old account-1 addresses stay in the file as
   `previousUrl`. Reversible: once account 1 is active, republish the same sources there and point back.
7. **E2E moves to 8 shards** (from 6): with the Phase 0 lanes' specs merged, two shards projected to about 20 minutes
   on a first pass with no room for a retry (PR #24 prep). Runner minutes are unchanged and free; wall time per shard falls.
8. **The page cap binds only a push that moves main** (`fix/artifact-currency-scope`, two review rounds). A lane counted
   its OWN commits past the publish sha, which no republish from main could lower, so #24 and then #25 were refused for
   good. Branch pushes now report drift without refusing; a push that moves main (or whose refs are unknown) is still
   refused over 30. A merge made on GitHub runs no hook, so CI checks main's drift on every push to main (full history):
   that is DETECTION after the merge, not prevention. Prevention would need a required check, such as Vercel Deployment
   Checks, which is Kevin's dashboard (T6). Residue goes to `memory/STATUS.md` G-ledger.
9. **A fix that main needs ahead of its lane goes to main by `cherry-pick -x`.** The lightning spec's CI budget was
   committed on `feat/instruments` (a9134e2b), but main was red on the same spec; it went to main as a9a303e9 so main
   could go green before any lane landed. That is not a lane landing: #23 still lands by merge, and git reconciles the
   identical change. Item 2 (merge commits only) governs lanes.
10. **Lanes land in readiness order**, not the fixed 22 -> 24 -> 23 -> 25 queue, once main is green: whichever PR is
   CI-green first lands first. The combat-stance lane (Phase 1) builds on main plus #24 and #25, and lands after both.
11. **Kevin, 2026-10-28 morning: "go with option a for the pages."** Option (a) was: keep the operator pages at their
   ORIGINAL account-1 links and republish them there whenever account 1 is active. It supersedes item 6's move as the
   end state: the account-2 copies (`.artifact-sync.json` `url`) are interim. The session cannot switch accounts, so
   the next time account 1 is the active account, the command session republishes era-review and sota-audit at their
   `previousUrl`, swaps `url` and `previousUrl`, and runs `--sync`. Until then the interim copies stay current, because
   a main push more than 30 commits past their publish point is refused (item 8).
12. **The page cap reports and no longer refuses; the pages state their own age** (supersedes the hard-fail half of the 2026-08-07 artifact-currency decision, 7d30ee27; holistic review wf_16b54287-0f9). Measured: the cap refused 8 pushes, 5 of them correct lane work; it stopped no recorded false claim, and it passed a false "Queued" pill on a page that was at HEAD (41c40c6d). It measures how far the WRITER is behind; Kevin's question in August was whether what he READS is current, which a page answers by printing its own commit and time. After item 8, merging a lane still counted the lane's commits into main's drift, so every landing needed a republish from whichever account owns the pages. Now: drift prints on every push and in CI and refuses nothing; a missing or unusable source, a falsified or undeclared Queued pill, and a missing, duplicated or mismatched as-of stamp still refuse; `--stamp` writes a generated "As of <commit>, <UTC time>" line at the top of each page, naming the commit the page was written against and that commit's time, and `--sync`, run after the publish, records it only when the committed source's stamp names the same commit (it cannot read the published page, so the record is honest only if the stamped source was published first); LOOP-PROGRESS (no URL, no reader) is archived; the Command Record page (`docs/superpowers/command-record.html`) is tracked as a surface. Whether era-review and sota-audit stay living pages or are frozen as dated history is Kevin's call (they are his reading surface); option (a) stands until he says otherwise. This also supersedes items 5, 8 and 11 of this entry where they state the refusal (no push is refused any longer for being more than 30 commits past the pages' publish sha), and under option (a) the Command Record, which the era-review and sota-audit stamps point to, must be readable from the account the pages are published from.
13. **Kevin, 2026-10-28: "agree on your recommendations and changes."** It answers the two calls put to him with
   items 8-12. (a) **ONE page for Kevin: the Command Record.** Kevin, same day: "just maintain one html for
   me to review your achievements/ decisions etc whenever i have time." era-review and sota-audit retire to
   `docs/archive/` as dated history (their last published versions stay readable at their links); no account-1
   republish is owed, so option (a) of item 11 lapses. The Command Record is refreshed at every landing.
   (b) **GitHub required status check on main.** First a CI change: one aggregate job is the only required context
   (required checks match job names, so eight shard names would block main whenever the shard count changes),
   docs-only commits skip the e2e jobs (a skipped check counts as passing), and CI runs on every push to `land/**`.
   Then branch protection through the API: that check required, branches up to date, "do not allow bypassing" on
   (every push here comes from the admin account, which bypasses it otherwise), no force pushes, no deletion. Then
   e2e-freshness's tiers retire in favour of the server-side rule. (c) Kevin applied the narrow allow rules the
   classifier would not let the session grant itself (`git branch -d`, remote deletes of `land/`, `feat/`, `fix/`,
   `gh pr close`, the protection call); `git branch -D` stays denied.
14. **Kevin's overarching principle, 2026-10-28 (standing; it governs every later decision).** Crafty was started in 2025
   by far weaker models and agents, and carries fundamental design, architecture and tech debt and AI slop from them;
   work has accelerated only around Opus 5.5, and later models will go faster still. So **nothing is off limits**: the
   whole game, its architecture and design, every element, visual and idea may be changed, enhanced, deleted or pruned
   as the command session judges best. Full autonomy; Kevin is asked nothing unless absolutely needed. Install any tool
   that helps. Keep the public face (the GitHub repo, and GitHub Pages) beautiful and "ASI-looking cool", and the docs
   in SOTA shape. Consequences: earlier decisions, plans, gates and docs bind only as far as they still earn their place
   on re-reading; a fresh whole-project assessment (2026-10-28) ranks what to delete, rewrite and keep; and the
   harness is shaped so a stronger model can take over cold and move faster (state on disk, small surfaces, generated
   facts, no ceremony that only a weaker model needed).
15. **The public face, tests and comments (Kevin, 2026-10-28: "you decide").** (a) **No GitHub Pages site for now.**
   Kevin meant the repo's own face; the live game on Vercel is the showcase, and a second website is a second surface to
   keep current. The effort goes to the README (a hero clip captured from the real game, a short honest description, how
   to play, the architecture in brief, no emoji markers, no number that can rot unless generated), the About line,
   topics, labels, issue templates and the social preview image. Revisit only if a devlog earns its keep. (b) **Tests
   are in scope like everything else.** Keep a test when it checks behaviour and has shown it can fail on the defect it
   guards; delete or merge tests that pin implementation, source-grep gates and duplicates. (c) **Comments are
   minimal.** A comment says WHY, and only when the code cannot: a non-obvious constraint, an external fact (a library
   quirk with its version and line), a safety or ordering invariant. No history, review narrative, round numbers or
   mutation receipts in code: git and this file hold history, and `Mutation-Proof:` commit trailers hold receipts. So
   the killability-ledger gate, which demands a receipt literal in every check file, retires with the comment pass. The
   pass runs as its own wave after the in-flight lanes land, directory by directory, keeping every load-bearing fact.
16. **Nothing is locked (Kevin, 2026-10-28):** *"when i see things like "Design Language (LOCKED — S1-C)" , remember
   the directive, nothing is locked . you're free to enhance / delete / revise anything."* It restates item 14. The
   live docs still carried labels that read as binding locks to the next agent. They now state the decision, its
   reason, and that it stands only while it earns its place; the command session may enhance, replace or delete it,
   recording the call here. **Rewritten:** `CLAUDE.md` (the design-language heading; the de-monolith,
   `Components.jsx` and engine-core lines, which keep their facts: the Player loop's per-frame order is load-bearing,
   so a split must keep it; the engine core is proven, so a replacement must measure better); `LOOP-CHARTER.md` and
   `LOOP-KERNEL-PROMPT.md` (a recorded decision may be reversed by a new dated entry here; `Components.jsx` was parked,
   not banned; the CUT-gate stays unused as a tool, and deleting a shipped player-facing feature needs an entry here
   with the lived or e2e proof that nothing still promised depends on it, not a KEVIN-REVIEW-BATCH entry first;
   re-baselines, new dependencies, taste and direction calls are the session's); `memory/STATUS.md` (the `[KEVIN]`
   legend, the CUT-gate line, section H, the re-baseline items, the pillar summary); `memory/ARCHITECTURE.md` (the
   Components line); `SOTA-INITIATIVE.md` (its guardrails and process sections); `INDEX.md` (a line near the top on how to
   read old labels, and the UI-system entry); the coherence-pillars spec (a status line; P3); and six 2026-10-27
   plans (coast-water, combat-stance, encounters-siege, first-minute, harness-sota, material-grammar). **Left as written:** dated
   specs and plans before 2026-10-27, archives, reviews and CHANGELOG, which are records (the INDEX line says their
   labels bind nothing); this file's own entries; and what stays Kevin's: his two bright lines (spend no money; never
   force-push or rewrite pushed history, the 2026-10-27 mandate entry) and what only he can do (real-device feel, the
   audio mix by ear, account sign-ins), which is also why S4 stays his. Publishing the repo's public face is the
   session's (item 15). P4's two invariants (no frequent mid-combat re-mesh; input via intent-abstraction, not
   `pointerLockElement`) are engineering constraints, not locks: they bind the session as facts about the iPad-class
   frame budget and input routing, and one may be broken only with a measurement showing that frame budget (or input
   parity) still holds, recorded here. **Guard:** `doc-currency` has a `locks` check. It fails when a canonical doc
   other than this one carries one of six phrasings: `(LOCKED` and `LOCKED —` (capitals; the dash may be em or en),
   `IRREDUCIBLE` (capitals, or "documented irreducible"), and `MUST NOT be split`, `KEEP, don't rewrite` and
   `do not relitigate` (any case). It prints file:line and points here. A line that cites item 16 may quote a label,
   which is how a doc quotes Kevin's directive; any other lock wording passes the check. This file is left out
   because it records and quotes such labels. The PASSED line prints both denominators: the phrasings and the docs.
17. **The killability-ledger gate is retired (command session, 2026-10-28; item 15(c) decided it).** It demanded a
   `Mutation-Proof:` line inside every new check file. Item 15(c) forbids mutation receipts in code, so every new test
   raised its ratchet, and its only green path was a comment the comment pass would delete. The receipt now has one
   home: the `Mutation-Proof:` commit trailer. The `mutation-proof-trailer` gate still demands it on every push, for a
   commit that adds a gate or rewrites a gate's assertions. Removed: the pipeline step, the script, its ledger, its
   test and its row in the gate table. The gate census keeps the population it shared with the ledger and no longer
   scores a receipt inside a file. Neither the old gate nor the trailer gate can check that a receipt is true.
18. **The Wave 1 cuts reach further than the plan first said (command session, 2026-10-28, on game-design grounds).**
   A Settler kill pays 0 XP, banks no Aspect power, earns no kill-quest credit and does not count in `stats.kills`. A
   spell hit on a NEUTRAL mob (a Settler or livestock) pays no per-hit XP. A livestock kill still pays its declared XP,
   so hunting stays rewarded. Spellcaster and Archmage count spells that land on hostiles, once per spell, the Shadow
   Dragon included; a cast, a ground hit or a sky shot counts nothing. One edge is not migrated: an old save that
   finished Spellcaster under the old rule and has not claimed it still pays its 40 XP once.
19. **The homepage is https://crafty-game.vercel.app (command session, 2026-10-28).** The command session added it as
   an alias of the Vercel project the same day; Kevin clicked Add Domain. https://crafty-sand.vercel.app keeps working.
   The play link, the README and the repo's homepage are rendered from `frontend/src/brand.js`.
20. **The block textures are mipmapped, in linear light (command session, lane W1-E, 2026-10-28; plan item #10).** It
   supersedes the "no mipmaps" half of the bold-flat texture lock (`tests/world/proceduralTextures.test.js`,
   2026-06-15, `90c3edf0`) and answers the 2026-09-22 KEVIN-REVIEW-BATCH entry "Distant-terrain mipmaps: one constant,
   your taste call", which items 14 and 16 make the session's call. **Why it was refused:** taste, not a defect.
   The 2026-06-15 gate recorded mipmaps as drift toward "realistic filtering"; `6a33a101` (2026-09-22) built the option
   and fixed the one technical trap, then left it off for Kevin's word. **Each reason, and how it is handled:**
   (a) *the pixel look up close*: magnification stays NEAREST, and minification is NEAREST within a mip level and
   LINEAR between levels. What holds: a face seen head-on keeps level 0's crisp texels out to about 16-28 blocks. What
   does not: the GPU picks the level from the larger of the two screen derivatives, and three r172 applies no
   anisotropy under a NEAREST magnify filter, so ground seen at a low angle from eye height blends toward level 1 from
   about 6-10 blocks out while its texels are still several pixels wide (the meadow grass tops in the evidence crop go
   from speckle to flat colour). The lower figures are at device pixel ratio 1 and the higher at 1.75, estimated from
   the screen geometry (fov 75, eye height) by the two reviews of this lane, not measured per distance. The flattening
   is accepted as the standard voxel trade for no sparkle. A sharper level choice, a negative LOD bias or a shader that
   picks the level from the smaller derivative, is a Wave 2 evaluation, judged on eye-level frames; (b) *a grid line at
   every block edge*: the sampler reads raw `vUv` with REPEAT wrapping (since `6a33a101`), so the UV derivative does not
   jump at block edges; (c) *bleeding between tiles*: this is a texture array, not an atlas, and the chain is built per
   layer; (d) *cutout leaves thinning*: there are none to thin, since the leaf tile is opaque (its "holes" are dark
   texels) and the terrain material has no alpha test; (e) *tone*: the GPU's `generateMipmap` filters the stored bytes,
   which here are sRGB-encoded, and a box filter over those bytes, computed for every tile, darkens at the 1x1 level
   leaves by 4.4%, cobblestone 9.7%, cactus 11.5% and gold ore 17.1% in luminance (grass, dirt, stone, sand, snow and
   water move under 1%). So the chain is built in JS from level 0, in the
   linear light the shader decodes into (pow 2.2), and its 1x1 level equals the far field's per-layer mean, which closes
   the tone step where the near terrain meets the far field. three r172 uploads caller-built levels for an array texture
   only through `CompressedArrayTexture` with `RGBAFormat` (an uncompressed `texSubImage3D` per level), so the texture is
   that class; `image.data` stays level 0 for the far field. (f) *anisotropy*: not available. three r172 skips it while
   magFilter is NEAREST, and a linear magFilter would blur the close-up look; that is why the ground flattening in (a)
   is the remaining ceiling. **Cost:** GPU texture memory 65,536 to 87,360 bytes (+21,824, +33%); the chain builds once
   at boot, about 3.5-4.6 ms for the cold first call and about 0.6 ms warm (node, measured by the repro review at a
   load of 59-77); the index chunk grows 551 bytes. **Frame time:** not established. The walking-clip figures (16.67 ms
   per frame over 1,053 frames before, 16.64 ms over 1,315 after, both at the 60 fps cap) and the scene pass's
   timer-query readings come from two lookbook runs at 14:53-15:00Z, inside the window (about 14:53-15:17Z) in which a
   lookbook port collision between lanes may have served another lane's build, so they are unverified. **Look:** on one
   production page at the player's eye, with only the GPU's minify filter switched, high-frequency energy falls 5-9%
   over the frame against a noise floor of 0.6-2.2%, by 54% on the patch of meadow grass in the evidence crop (seen at a
   grazing angle), and by at most 1.0% in the sky; read back from the GPU, all 87,360 bytes of the chain equal the one
   built in node. That comparison is within one page, so the collision cannot touch it. The crawl in motion is not
   measured: a still frame's energy is not temporal stability, and the before and after walking clips come from the
   unverified lookbook pair. The live acceptance clip on the deployed sha is still owed. Frames, crops, clips and the
   method: `docs/superpowers/masterpiece-2026-10/evidence/mipmaps/index.md`. **Known side effect, not fixed here:** the
   ore-glow mask reads the texel the sampler returns (`oreGlow.js`), and a mipped texel mixes nugget and stone, which
   the mask's smoothstep does not average linearly. Averaged over a face, night glow at the 4x4 level moves iron -61%,
   gold +42%, diamond +80% against level 0, so distant diamond blooms harder at night while distant iron nearly goes
   dark; close up nothing changes. Owner: W2-A (shared-file quick fixes) or the light lane's successor. The likely fix
   is to derive the glow mask from level-0 texels and mip it separately, so the mask is averaged rather than recomputed
   from mixed colour. **Gates:** `tests/world/proceduralTextures.test.js` pins the filters and the full chain;
   `tests/gates/texture-mipmap-gates.test.js` pins every texel of every level as the linear-light mean of its block and
   the 1x1 level as the far field's colour; `scripts/ci/prod-smoke.mjs` (`mipVerdict`, CI only) reads the block texture
   back from the GPU of the production build and fails unless it holds a full chain (6 levels for 32 px tiles) sampled
   through a mipmap minify filter, with every level filled and every byte equal to the chain the source builds.
   Mutations are in the commits' `Mutation-Proof:` trailers.
21. **The light and colour lane, landing in Wave 1: the day lasts 480 s, the lane's capture-state work is dropped, and
   the colour blend stays linear (command session, 2026-10-28; the SOTA reset, section 8, asked for each).**
   (a) **Day length: 480 s, one constant** (`DAY_LENGTH_SECONDS`, `frontend/src/game/dayNight.js`; the game-unit rate
   is derived from it). It supersedes the 300 s cycle (`GAME_UNITS_PER_SECOND = 4`) and the light plan's decision 8,
   which kept 300 s for the lane. The reason is the First Night, the reset's ten-minute spine (one dusk, one siege held,
   one golden dawn). A fresh profile starts at dawn (the store's `gameTime: 0`). At 480 s its first dusk falls at 4:00
   of play and its first dawn at 8:00, so with the first minute in front the experience ends at 9:00. At 300 s night
   fell at 2:30, before a new player could light a Hearth, and the ten minutes held two nights. At 600 s the first dawn
   lands at 11:00. Measured in the same change: the golden blend (sunset key to dusk key) lasts 16.8 s, up from 10.5 s;
   the sun's 0.5 deg shadow steps fall from about 2.4 to 1.51 renders a second (727 a cycle). What moves with it is
   what reads game units: the day and night halves, the sky, the shadow steps, and the dusk warning, whose 0.18 of the
   day half is now the last 43 s, up from 27 s. What runs on real time does not: the spawner checks once a real second
   (`frontend/src/systems/SpawnerSystem.jsx`), so a night holds the siege at its mob cap for 240 s of real time instead
   of 150 s, and night 1 ships in Wave 1 at that length, unmeasured. Rebalancing the siege for the longer night is
   W3-A's, which can also move this one constant. Saves load unchanged, because `gameTime` is stored in units. The pause holds the
   clock through the input gate and `isWorldFrozenNow`, and the sky clock catches up at most one tick and holds.
   **Guard:** `tests/gates/day-length-gates.test.js` ticks a fresh profile from the store's own start: the first dusk
   at 180 s or later, the first dawn plus a 60 s first minute within 600 s, and the golden blend 15 s or longer.
   `daynight-clock-gates` drives the real hook for one cycle.
   (b) **The lane's capture-state work is dropped.** This applies the reset's W2-B to this lane: the capture oracle
   retires, and looks are accepted on W1-D's eye-level lookbook. The lane never added `explore-golden` to `capture.mjs`
   or `VISUAL_STATES` (its Task 4, never built), and it will not re-shoot the baselines (its Task 9 Step 4). The code
   built only to serve them is removed (`a0cac94a`): the `captureSolarFraction` store field, the DEV hook
   `setCaptureSolar` and `captureCycle`'s declared-fraction branch. `captureCycle` keeps noon for a day state and
   midnight for a night state, because night now comes from the clock, and a night capture state pinned at noon would
   render daylight until W2-B deletes capture. The baselines are stale against the colour script, and nothing runs the
   visual gate.
   (c) **The colour blend stays in linear RGB.** The reset asked for an OKLab check of the dusk clip. What was
   measured, and in what: (1) the colour model and the authored keys, not pixels. On every pair of adjacent keys and
   every blended colour, the script's linear-RGB path is never darker than the straight OKLab line between the same
   keys, and it loses at most 0.0147 chroma (the fog, from dusk to sunset), under 0.02, the OKLab step the gate takes as
   one visible difference. An sRGB-byte lerp would run up to 0.006 darker, also under a step; linear is kept because it
   is never darker and is three's own lerp. In the display model (the dome's horizon through the key's exposure, the
   grade and NEUTRAL), the horizon's chroma bottoms at 0.051 between the sunset and dusk keys and 0.058 between preDawn
   and sunrise. (2) The dusk clip's pixels, measured afterwards: in `after-walk-0.50.mp4` (the H.264 screencast, f 0.500
   to 0.508, about a quarter of the 16.8 s blend), the sky band where it meets the land reads OKLab L 0.68-0.79 and
   chroma 0.005-0.047, median 0.017, against the model's L 0.82-0.83 and chroma 0.051-0.068 for the dome's horizon. On
   screen the band passes near neutral mid-clip, as the fog and the distance haze grey it; the model's "never grey" is a
   claim about the dome colour, not about that band. Orange to violet passes near neutral in any straight blend
   (OKLab's own midpoint is 0.040), so this is no case for a different blend space; whether the grey band reads as mud
   is a look judgement for the lookbook. **Guard:** `colour-script-gates`, "the blend between keys, against OKLab", both
   bounds one visible step (0.02): the claim is how the blend looks, and a tighter bound would gate how it is computed.
   (d) **The ground at golden hour and through the twilight blends (command session, 2026-10-28, after the lane's
   review).** The keys as first landed lit the ground at dawn and golden hour darker than at midnight and than on main
   (the grey card's up face at L 0.225, against midnight's 0.337 and main's 0.374), because the sun grazes there (its
   arc peaks at 32 deg) and the sunrise and sunset keys gave the indirect light 0.26 ambient and 0.60 hemisphere. The
   pad by the Hearth read maroon at 0.50 (L 0.202 C 0.053 h 3): the fire's orange on the violet twilight. Retuned:
   sunrise and sunset ambient x0.80 and hemisphere x1.80 in warm yellow-greys (#C6B698 / #C2BAAC, #C6B496 / #C2BAA8),
   preDawn and dusk ambient x0.85 and hemisphere x1.50 in a steel blue (#7E8CA2 / #788AAC); exposure, the sky and the
   sun are unchanged, so the dusk sky stays violet. The grey card's up face now reads L 0.418 at 0.02 and 0.415 at 0.48
   (gold, hue 78-79), 0.381 at 0.50 and 0.337 at midnight. A first retune with lavender twilight light and redder greys
   passed the model, but the real-GPU pad by the brazier read 10-20 deg redder than the model and touched maroon at
   0.50 on one target (WebKit 1180x820, L 0.303 C 0.043 h 16), so the final colours were chosen to keep the model's
   pad near chroma 0.02 in the maroon hue band (read 0.021 at hue 30 at f 0.502; no gate asserts that margin). Known
   gaps, as registry rows: G2's pad sample uses the grey card, not the terrain stone the screen was calibrated on, reads
   only 1 m from the brazier, and stops before the night keys (0.574, 0.926); and at midnight the pad within about 1 m
   of the brazier reads on the maroon line on screen (C 0.037-0.040, h 313-331), as it did before this lane. **Guard:** `colour-script-gates` G1 (while the sun is up the ground, grey card and
   terrain stone, is never darker than at midnight; golden hour at least 0.374 and gold) and G2 (no maroon through
   either twilight blend in the sky, fog, hazed land, ground, or the pad 1 m from the brazier, whose light `HEARTH_FIRE`
   in `frontend/src/world/homeAnchor.js` the gate and the brazier share). G2 judges the model, so it does not see that
   red offset: the lavender-twilight keys pass it, and the evidence for the final colours is the lookbook reading.
22. **B7: the commit runs a fast tier, and the full offline core moves to the push and `--tier=certify` (command
   session, lane W2-C, 2026-10-28; harness plan U17, `a56f6d50`).** It supersedes the 2026-09-22 direction that put the
   whole offline core on every commit, taken after Kevin pointed out that Agentic-Brain front-loads its suite onto the
   commit and keeps the push fast (recorded until B7 in `ci/pipeline.sh` and `.githooks/pre-commit`, never here). A
   commit now runs the static gates (opsec-scan, doc-currency, eslint, gate-shape, cli-guard) and `vitest related` over
   the files staged under `frontend/`; the unit suite, build and bundle budget run at the push, in `--tier=certify` and
   in CI. **Why:** the core cost every commit its full run (69 s as the gate table stated it, when the suite was
   smaller than today's 537 test files), while the push and CI re-run it on the exact tree anyway. **What is lost:**
   (a) an intermediate commit carries no unit, build or bundle result of its own, so a red commit in the middle of a
   branch is recorded nowhere, and `git bisect` must run the suite itself; (b) `vitest related` follows static imports
   only, so a module reached through `import()` or `React.lazy`, and a source-grep gate that reads a file by path, is
   not selected; (c) a commit that stages nothing under `frontend/` (only `ci/`, `.githooks/`, `.github/`,
   `memory/registry.jsonl` or docs) runs no unit test at all, although `frontend/tests/scripts/` tests those files;
   (d) a commit writes no receipt, so a push skips the core only after a certify run. **Mitigations:** the push
   certifies the tree it pushes, in full in a fresh worktree or by that tree's certify receipt, and since `c0bffdd2` a
   receipt names the tree read before certify's first step and again after its last, so a commit, checkout or merge made
   while it runs gets none; CI runs the whole suite on every land/** and pull-request sha; main moves only on a sha
   whose `ci ok` passed (item 13(b)); and the commit tier prints its denominator ("N of M test files selected", and
   "0 selected — SKIPPED, not a pass"). **Door:** two-way: the old shape is one tier guard in `ci/pipeline.sh`.
   **Unmeasured:** whether pushes got slower in total; U17's push-cost metric needed U13's push log, which never landed.
23. **A push to main passes on the verdict CI already reached for that exact sha (command session, 2026-10-28 18:35Z;
   built in lane W2-C).** main moves only on a sha whose `ci ok` passed on its land/** push or its pull request, so the
   run main's push starts tested that sha a second time: `13c600ad` passed land run 40740902822, and main run
   40742070022 then ran its gates job again (its e2e was skipped only because that change was docs-only; a code change
   would have run all eight shards again). Now the change-scope job (`frontend/scripts/ci/change-scope.mjs`) reads the
   sha's `ci ok` check runs on a push to `refs/heads/main`, and outputs `certified=true` when the newest one from
   ANOTHER workflow run (the run id in the check run's URL is not this run's `GITHUB_RUN_ID`) completed with success.
   Then the e2e matrix is skipped, the gates job runs only opsec-scan, doc-currency, eslint, gate-shape, cli-guard and
   registry-append-only (`ci/pipeline.sh --sha-certified=true`; registry-append-only stays because its base on this
   push is main's previous tip, a range the certifying run never read), and `ci ok` passes on that verdict, printing
   the certifying run's URL. Everything runs on an API error, a missing run id, a check run whose URL names no run, or
   a newer `ci ok` from another run that failed or is still running. **What it trusts** is what branch protection
   trusts: a check named `ci ok` from the GitHub Actions app; which workflow file produced it is not read. **A pull
   request's verdict** sits on the head sha but tested the merge with its base; main fast-forwards to that head only
   when the base is its ancestor, and then the merge's tree is the head's. **Door:** two-way: deleting the main-push
   branch of `scope()` restores full runs. A dispatch, or a re-run of the main push's own run, still runs everything.
24. **The push runs only the range gates (command session, 2026-10-28, on Kevin's SSD order; lane W2-C follow-ups).**
   It supersedes item 22's push half: `.githooks/pre-push` now runs the two trailers, then `ci/pipeline.sh --tier=push`
   (opsec-scan, queue-ledger, artifact-currency, registry-append-only) on the pushed commit, in place when that commit
   is the checkout's clean HEAD and in a detached worktree otherwise, and no static gate, unit suite, build or bundle
   budget, because CI runs them on the exact sha and main cannot move without that sha's `ci ok` (item 13(b)), while the
   Mac's SSD writes ~4.3 TB/day against a 1 TB/day budget. **What is lost:** local feedback before CI, so a red unit,
   build or bundle result first shows on the branch's CI run (`bash ci/pipeline.sh --tier=certify` gives it on demand,
   and nothing waits for it); the certify receipt and `ci/write-receipt.sh` are deleted with their only reader.
   opsec-scan stays because the push publishes and CI sees the content only once it is on GitHub. **Door:** two-way:
   the push tier is one guard in `ci/pipeline.sh`.

## 2026-10-27 (later) — [LOOP, Kevin-delegated harness authority] The push gate stops depending on a laptop's load

**Why.** `e2e-freshness` refused every push because the base's CI e2e is red (57c45ae4: run 35845534213 cancelled at
the limit; a fresh dispatch, 40499349776, red on shard 2 again — the spec fixes are among the unpushed commits), and
its only escape was a green ~45-minute local e2e run. Three such runs failed today, all on the operator machine's
load (0.5 fps software rendering; swapping at a load of 118-159 from other sessions and the browser), none on code.
A gate whose only green path depends on the machine being idle teaches `--no-verify`, which its own R5 note forbids.

**Decided (two refinements, both narrower than trusting the laptop):**
1. **Tier 1b — CI's e2e verdict on the EXACT commit is a receipt** (`readCommitCi`: some ci.yml run on that sha with
   ALL e2e jobs green). Clean runners make it stronger evidence than a local run.
2. **The red-base refusal guards main only.** `.githooks/pre-push` exports the refs a push moves; a push that moves
   only other branches is let through (CI on that branch decides). Unknown refs (a run by hand, another caller) stay
   STRICT. Main still moves only on a local green receipt or CI green on the exact commit.

**Flow this enables:** push main's commits to a branch, run CI on it (`gh workflow run ci.yml --ref <branch>`), and
when its e2e is green, push main at the same sha — tier 1b passes. Mutation receipts in the commit.

## 2026-10-27 (later) — [LOOP, Kevin-delegated] The calls his overnight goal reserved for him, decided

Kevin's startup prompt handed these to the session (entry below). Each is decided here with its reason; none is
silently dropped.

- **The 147 -> current-Chromium visual re-baseline — WILL DO, alone, as Phase 0e** of the masterpiece plan, in its own
  `Baseline-Review:` commit with no `src/` change, BEFORE any look change. The 2026-10-27 roadmap first bundled it with
  the colour-script re-baseline; the adversarial refute showed that would make every later frame change
  unattributable (the oracle would never exist on the new renderer by itself). Puppeteer is now 25.16.0 (`10a43f68`),
  so the target is the Chromium it pins, recorded in `.capture-meta.json` provenance at capture. Looks acceptance moves
  to the real-GPU, motion-on lookbook (Phase 0d); the 31 SwiftShader frames remain the REGRESSION oracle only.
- **dprCap — REPLACED by a pixel budget** (Phase 0g, lane steady-cool): the canvas dpr becomes
  min(cap, devicePixelRatio, sqrt(budget / CSS pixels)) per tier, so a 16-inch M3 Max at dpr 2 (~7.7 Mpx through a
  half-float post chain) renders at about 1.5 and a small window keeps full sharpness. The exact budgets are set on
  measurement (the lookbook for sharpness, the power A/B for heat), not by this entry.
- **The FPV glove value — DEFERRED to after the light-rig rebalance** (Phase 1). QUEUE B5 measured the gloves at
  rgb(16,3,40) because the scene's lighting floor collapses them; tuning the hex before the ambient/hemisphere change
  would tune against a moving target (B5's own ordering note). Then: the value ladder through `hands-probe.mjs`.
- **Dependencies (Dependabot #20/#21) — DONE**, entry below.
- **three r186 + cascaded shadows — NOT NOW.** An engine bump re-baselines the whole look and changes shadow filtering
  (r186 removes PCFSoftShadowMap); it is its own decision after the colour script lands. New shader terms stay pure GLSL
  modules with JS mirrors so a later TSL/WebGPU port is mechanical.
- **Soft death — KEPT.** The roadmap's "ember cache" would forfeit coins and Aspect meters on a second death, reversing
  a decision of record (`SOTA-INITIATIVE.md`); not built.

## 2026-10-27 (later) — [LOOP, Kevin-delegated] Dependencies: vitest 4, an audit refresh, and Dependabot #20/#21 applied on main (`10a43f68`)

**Why it could not wait.** CI's `npm audit --audit-level=high` gate (R5, CI-only) would have failed the very push that
delivers Kevin's heat fixes: 14 advisories, 2 critical (tinypool via vitest 3) and 8 high. Both open Dependabot PRs
had failed on that gate, not on their bumps. `npm audit fix` inside the declared ranges left the 2 criticals, which
only leaving vitest 3 removes.

**Decided.** vitest + coverage-v8 3 -> 4.1.12 (the config uses none of v4's removed options; the suite needed no
change: 477 files / 3757 tests green). Dependabot #20's dev group and #21's production group applied on main rather
than merged (their branches carry main's state of 2026-10-01), Playwright taken to 1.64.1 (current) instead of the
PR's 1.63.0 so the e2e browsers move once. Puppeteer to 25.16.0 because the audit fix needs it. **The engine stack is
not touched** (three 0.172, postprocessing 6.39.5, R3F 9.5): dependabot.yml's 0.x-minor policy and the 2026-08-13
r174 entry stand, and an engine bump that re-baselines the whole look is a separate, deliberate decision. Every new
version was at least 5 days old at install. Result: `npm audit` 0. Dependabot closes the two PRs itself once it sees
the versions on main; no comment is posted.

**Trade-off accepted.** Playwright 1.64 brings new browser builds into a timing-sensitive e2e suite; the push receipt
runs on them before anything is pushed, so a regression shows up locally first.

## 2026-10-27 (later) — [KEVIN] The Crafty command session's mandate, and its limits

**Source: Kevin's own startup prompt to session c54fc9b6** (not a file written by an earlier session; an earlier
session's attempt to write this grant into ACTIVE_PLAN was refused by the auto-mode classifier, correctly, because a
file carries no visible authority from Kevin). His words: *"You have full autonomy: I will not review or confirm
anything. Decide, act, and record each non-routine decision in docs/superpowers/DECISIONS.md."* And: *"Wherever the
plan says I check, confirm or decide, that is now yours. That includes the items my overnight goal reserved for me:
the 147->151 visual re-baseline, dependency changes (Dependabot #20/#21), dprCap and the FPV glove value."* Then, the
same day: *"make Crafty a masterpiece you'd be proud of. be creative and go all out ... you're free to enhance /
prune / revise anything."*

**Limits, also his:** two bright lines: spend no money (no usage credits, no paid service), and never force-push or
rewrite pushed history. Reviewers at xhigh, never max. Code review per the entry below. The milestone (the parked
`wip/perf-t3-features` work applied to main) goes up as a branch and PR, its number reported to Kevin so he can run
`/code-review ultra <PR#>` himself; the session merges on its own gates without waiting for that review.

**What stays outside the session, by mechanism, not by choice:** ultrareview is Kevin's keystroke only (Claude Code
reserves it to the user). The harness's auto-mode classifier also refuses some actions on its own judgement; when it
does, the session does not reroute, it records the refusal and hands Kevin the exact command. Refused so far:
removing the `mip-ab` worktree and deleting branch `wip/r7-lazy-panels` (content verified fully ported to main by a
line-containment diff: every line only the WIP carries was superseded by review #8's fixes; recoverable at `45590d2c`).
Kevin's command: `git -C ~/Code/Crafty worktree remove --force .claude/worktrees/mip-ab && git -C ~/Code/Crafty branch -D wip/r7-lazy-panels`.

**A claim corrected on arrival:** a hook in the previous session reported "remote CI success at 57c45ae on main
(2026-10-25T08:26Z)". Re-measured: those are the weekly CodeQL `Analyze` runs. The `ci.yml` run for 57c45ae4
(35845534213) still concludes `cancelled` (shards 2 and 3 at the time limit), so main's tree is still red by the read
order's rule.

## 2026-10-27 — [KEVIN-delegated] Code review for Crafty: built-in `/code-review xhigh` as the default, ONE pointed adversarial reviewer on runtime seams, the dynamic layer stays ours; ultrareview held for milestones

**Asked (Kevin, 2026-10-27):** decide between Claude Code's `/code-review` and ultrareview, say how they differ from our
review rituals, which is best, and run reviewers at xhigh at most (with Sonnet and Haiku used liberally).

**Measured, not argued.** Both local reviewers re-ran BLIND, at xhigh, on review #8's range (57c45ae4..9dc5fac7) in an
isolated copy outside the repo (no later history, no main docs). `/code-review` ran as a fresh headless `claude -p`
process, the adversarial reviewer as a non-fork agent whose reads were audited (0 outside the copy). They were scored
against six defects verified earlier in that range (G1-G6). The first attempt was CONTAMINATED and discarded: a forked
`/code-review` inherits the author conversation, and a worktree reviewer can read main's ACTIVE_PLAN and reflog.

| | `/code-review xhigh` | adversarial-reviewer-kz, xhigh, neutral brief | the same reviewer, max, pointed brief (the key's source) |
|---|---|---|---|
| verified defects found (of 6) | 3 (G3, G4, G6) | 2 (G3, G4) | 6 (by construction: biased) |
| findings / wall time | 15 / 15.5 min | 5 / 20 min | 12 / 28 min |
| missed by both xhigh arms | G1 the stepCap judder at 120.2 Hz, G2 the Show Stats over-read, G5 a dodge-latch test hole | | |
| extras worth having | breadth (stale comments, two instrument flaws) | depth (BloomSpikeDriver dead effect, the J6 receipt) | |

**Decision.**
- **Default per change range:** `/code-review xhigh`, run as a FRESH process (`claude -p "/code-review xhigh <range>"`
  from the Crafty root, in the background), never forked from the author session. Reviews #1-#8 used it (78 findings,
  72 fixed), but forked, which breaks author/reviewer separation.
- **Plus one adversarial-reviewer-kz at xhigh with a POINTED brief** where the change crosses a runtime seam (render
  loop, physics, input timing, library semantics). The pointed brief is what found G1/G2. Its yield at xhigh, as
  against max, is untested.
- **The dynamic layer stays ours, and it is the floor:** simulation of pure cores, `mutate.sh` / `mutate-e2e.sh`
  with identity mutants. It alone confirmed G1 and G5 and found the frame-cap leak. Fix first: `mutate-e2e.sh` scores
  a Playwright test timeout as a kill (both xhigh arms found it).
- **ultrareview (`/code-review ultra`):** a cloud fleet that reproduces each finding before reporting it. Max plan:
  3 free runs per account, one-time; then usage credits, typically $5-25 a run; 15-25 min. No effort control, so the
  xhigh cap cannot be applied to it. Only Kevin can launch it. Use it as a milestone gate (the parked features branch
  before it merges, a release), never per commit. Not measured here: every run beyond the free three costs money.

**Limits.** One range and six defects, with a key produced by one of the compared methods. Indicative, not a
statistic. Re-score when the next verified-defect set exists.

### Addendum, same day: the ultrareview, against the bake-off

Kevin launched `/code-review ultra` on main at the start of session c54fc9b6 (scope: the 12 unpushed commits plus the
uncommitted edits, 42 files, +1,917/-164; free run 1 of 3). Six findings. Each was verified by this session before any
fix; the scope is NOT the bake-off's range (57c45ae4..9dc5fac7 was a subset), so this compares what each method found
on overlapping code, not a re-score.

| # | Ultrareview finding | Verified how | Verdict | Bake-off had it? |
|---|---|---|---|---|
| U1 | `_serve.mjs` registers `ipad-probe.mjs`, no such file: probe-ports red | the test re-run with the untracked probe moved aside: RED, `[ 'ipad-probe.mjs' ]` orphaned | CONFIRMED for the uploaded tree (the file was untracked, so not uploaded); fixed by committing both together | no (not in its range) |
| U2 | PanelBoundary renders null on a failed chunk and never closes the panel: the player is stranded | read `lazyPanels.js` + `MenuSystem.jsx`: `onFail` only drops the lazy; every `onClose` lives inside the panel UI that never renders | CONFIRMED; = review #8 #1 (MED), = the bake-off's unverified candidate "PanelBoundary swallows every render error" | yes, as a candidate |
| U3 | a shove carries x/z only; the next ground snap judges from the old feet and reverses it | the bake-off's verifier reproduced it 8/8 with a control; gated red-first in this session | CONFIRMED; = B1 | yes (B1, reproduced) |
| U4 | `e2e-freshness --run`'s busy-port probe is IPv4-only; vite on macOS binds `[::1]` only | LIVE: `lsof` showed the e2e vite listening on `[::1]:4179` and nothing on 127.0.0.1 | CONFIRMED | no |
| U5 | a killed or unspawned `--run` exits 1 (STALE) instead of 3 (COULD NOT CHECK) | read: `spawnSync` status null fell into `exitCode !== 0` | CONFIRMED (nit) | no |
| U6 | `mutate-e2e.sh` has no busy-port check, so a sibling's vite is reused and every mutant reads SURVIVED | read: `playwright.config.js` `reuseExistingServer: !process.env.CI`, no port check before `npx playwright test` | CONFIRMED | no |

**Missed by the ultrareview, found by the bake-off's xhigh arms:** `mutate-e2e.sh` scoring a Playwright test timeout
(and bootDev's untagged wait) as a KILL, which both xhigh arms found; re-verified here with a stubbed runner (HEAD
instrument: `[RED]` on a pure timeout; fixed instrument: COULD NOT CHECK). Also the unverified candidates (T swings the
sword while the voidhand is held; a voidhand grab mid-charge; BloomSpikeDriver's dead effect; FrameCap's DEV-only
counter; duplicated guards).

**What this says, held as indicative.** On the overlap, the ultrareview found 6 of 6 CONFIRMED (no false positive)
and 4 the bake-off's arms did not, three of them instrument seams (U4-U6) the local reviewers had read past. It
missed one instrument flaw both xhigh arms caught. So the methods are complementary rather than ranked, and the
2026-10-27 decision stands: `/code-review xhigh` fresh per change range, a pointed adversarial reviewer on runtime
seams, ultrareview at milestones only. One new practice from U1: **a review of a working tree uploads TRACKED
files only**, so commit or stash untracked work before a review whose scope it belongs to.

## 2026-08-13 (night) — [LOOP] three r174 KILLS the GL-error storm, and is still NOT landing tonight

Kevin, going to sleep: *"if the upgrade works, then do it."* It does not work in the sense that clears the
bar I set before measuring, so it is not landed. Both halves below are measured, with controls.

**Where this came from.** `vanruesc` replied to our upstream report (pmndrs/postprocessing#750, labelled
`investigating`) within hours. They could NOT reproduce the missing sun on three r172 — but they DO see the
`glBlitFramebuffer: Read and write depth stencil attachments cannot be the same image` error we had filed
SEPARATELY as a production-bundle finding, and traced it to a three.js depth-texture-cloning bug fixed in
r174 (mrdoob/three.js#30585). Their claim: postprocessing's `e19bfa3` triggers a bug that lives in older
`three`. So two findings we had been treating as unrelated are one root cause.

### ① Does r174 fix the GL storm — **YES, measured, with a presence control.**
Identical probe, identical 12s window, production bundle both times:

| build | `glBlitFramebuffer` messages |
|---|---:|
| three 0.172.0 + postprocessing 6.39.1 (committed state) | **6**, both message forms |
| three 0.174.0 + postprocessing 6.39.4 | **0** |

The control matters and is the reason this is stated as fact: a zero from an instrument never shown to
produce a non-zero is not evidence. **`prod-smoke.mjs` cannot see this class at all** — it filters on
`m.type() === 'error'` and these arrive as `warning`, so the repo's own prod gate is structurally blind to
the error storm it was written to watch. That is a real gap and it is now written down.

### ② Does r174 let us unpin postprocessing — **UNRESOLVED, and it is not the blocker.**
Not answered, because the question is moot until ③ is decided: `explore-day` shows no sun disc at that
camera angle in EITHER build, so the frame that would answer it has to be identified first.

### ③ Why it is not landing — **the upgrade changes the whole look.**
`three` r174 against the committed baselines: **19 of 31 frames over gate**, many at 99%+ local density
(`explore-day` 99.70% vs a 9.30% ceiling; `spell-iceball` 99.90%; `ocean-depth` 99.19%). Comparing the two
`explore-day` frames by eye, the r174 sky is materially more saturated — this reads as a global colour or
tone-mapping change, not a regression in one subsystem.

So landing it requires rewriting all 31 baselines. **That is a judgement about how the game should LOOK,
which is Kevin's call, not a correctness fix the loop can self-gate** — and a bundled engine-bump +
re-baseline is exactly the shape `baseline-trailer` exists to stop (ten of the last twelve baseline
rewrites were bundled, which is how four monster baselines became pictures of an empty mountain).

It also sits against a live decision-of-record: `c1d933e` deliberately blocks 0.x MINOR bumps for the
engine stack in dependabot, because for 0.x the MINOR position is the breaking one. This measurement is
evidence FOR that policy, not against it.

**State: fully reverted.** `package.json` + `package-lock.json` restored from backup, `npm ci` re-run,
three 0.172.0 / postprocessing 6.39.1 confirmed installed, git tree clean. Nothing about this experiment
is committed except this entry.

**Owed to Kevin in the morning — two separable decisions, do not bundle them:**
1. Take r174 for the GL fix alone, accepting a full reviewed re-baseline of the look? (High value: the
   storm currently MUTES the GL channel, so a genuine later error in that context is silenced.)
2. Reply to #750 with the measurement above. Drafted, NOT posted — posting to a public upstream issue is
   outward-facing and stays Kevin's.

---

## 2026-08-02 — the audit batch (items ①–⑨), decided under the standing grant

Kevin's instruction, verbatim: *"what do you recommend for all the punted / awaiting decision questions?
do all you decide to be best."* So these are loop decisions with the owner's explicit delegation, recorded
here rather than assumed.

### ① Where `perf-siege.spec.js` lives — **[LOOP] Excluded from CI, kept at full strength locally.**
It is a perf probe. `ci.yml`'s own policy note has excluded perf probes since the day CI shipped, because
"the median quantizes to the host vblank, so a cloud runner's number is meaningless" — and this spec was
sitting inside the e2e job in violation of that policy, failing every run for three weeks. It passes on real
hardware (1.4m, heapGrowth 0, no runtime errors).
**Why not just lower the frame floor:** that floor IS the product claim (the render loop stays live under
siege). Lowering it to go green is the reward-hack the charter forbids. Tagged `@local-only` and excluded
via `--grep-invert` **in the workflow**, where the exclusion is visible, rather than hidden in
`playwright.config.js`. Shipped `8ac8d07`.

### ② The knip ignore and the undeclared rapier dependency — **[LOOP] Declared it; deleted the ignore.**
`.knip.json` carried `ignoreDependencies: ["@dimforge/rapier3d-compat"]`, added by `d3e86cf` in the same
commit whose message ends "npx knip now reports ZERO issues".
**Verified before acting, and the review's framing was wrong:** the package is not imported by `src/` at
all — its only importers are `scripts/bench/bull-physics-bench.mjs` and
`tests/integration/beast-collider-rapier.test.js`. So it belongs in **devDependencies**, not dependencies.
Pinned **exact `0.19.2`, no caret**, because `@react-three/rapier` pins that exact version and the
integration test states in its own header that it drives "the same build the app ships" — a caret would let
npm hoist a second copy and the test would silently exercise different WASM than production. Shipped
`32625c0`.

### ③ The 7 ungated visual states — **[LOOP] All promoted into `STATES`.**
Seven of 31 captured frames (23%) were captured AND baselined but absent from `STATES`, so they asserted
nothing: the 4 WILDHEART beast frames (committed 2026-06-17 as "review artifacts", never promoted, no hold
ever recorded) and the 3 forced-tier frames (held since 2026-06-22).
**Reasoning:** a baseline says "do not let this change without noticing"; it does not say the look is final.
Holding a frame out of `STATES` to preserve the option of changing it later buys nothing — it was already
changeable, just unguarded. If the art direction changes, the gate goes red, the frame is reviewed, and it
is re-baselined. That is the process working.
**This immediately paid for itself** — see the 2026-08-02 capture-determinism entry below.

### ④ The 3 HIGH advisories — **[LOOP] `npm audit fix`, and the escalation was overstated.**
All three (brace-expansion, js-yaml, postcss) are dev-only; `npm audit --production` reported 0 before and
after. All carried `fixAvailable` inside already-approved semver ranges. `package.json` is **byte-identical**
before and after (diffed) — the proof it was a lockfile refresh, not the dependency decision it had been
escalated as for weeks. Now 0 vulnerabilities. Shipped `32625c0`.

### ⑤ The `ai.worker` inline mirrors — **[LOOP] DEFERRED, with the premise corrected in place.**
The mirrors' justification ("this classic Worker cannot import") is false — `terrain.worker.js` imports ten
modules and is a worker — and their sync gates are drift-blind: an injected divergence producing
21,655/200,000 behavioural mismatches left all four assertions green.
**✅ SHIPPED 2026-08-02 (`815c007`), as its own unit with the probe paid.** The premise is now disproven by
construction rather than argument: the built worker is 3.71 kB with **zero bare imports**, because Vite
inlines them regardless of the construction form. AIWorkerSystem moved to the `?worker` import that
`terrain.worker.js` has always used; the three modules are imported directly; the telegraph block became the
imported `attackPhase` machine instead of a hand-rolled copy of its transitions.

The three sync gates were **rewritten, not deleted** — behavioural halves kept (mob-los gained a case), and
the mirror-pinning halves replaced with import-specifier anchors plus "no local copy has grown back". Both
are syntactic, so `gate-shape.mjs` confirms a comment cannot satisfy them. Mutation-proven against the real
historical bug: re-pointing `steerGoalCell` at `(playerX, playerZ)` — the archer-kite regression — turns the
gate RED.

**Rule 3 paid in full:** the sustained night-siege probe ran against the refactored worker — 13 frames over
12.4s of saturated siege, zero fatal runtime errors, heapGrowth 0. Mobs path and attack through that worker
for the whole window, so an import failure or a throw would have surfaced there.

The eslint crash-class gate also caught an undefined local mid-refactor (removing the mirror left
`startXGrid`/`startZGrid` dangling downstream). That gate exists because four ReferenceErrors once shipped
to main; this is the first time it has caught one BEFORE a push rather than after.

*Original deferral rationale, kept for provenance:* it was the one item that changes mob behaviour at
runtime, and Rule 3 says a green headless gate is not a lived result — so it needed a lived probe and its
own unit rather than riding in a tranche of harness fixes. The false premise is
corrected in the source comments now so nobody re-derives it.

### ⑥ i18n adoption — **[LOOP] Shipped a ratchet, not the full sweep.**
98 keys at full en/zh-CN parity, and 109 hardcoded user-facing strings across 23 files — five of them in
files that import i18n and hardcode anyway. The gate measured the dictionary; the product was half-English.
**Why a ratchet and not a zero-target:** 109 occurrences cannot be fixed in one commit, and a gate demanding
that would be switched off within a day. Per-file counts are frozen; they may shrink freely, and a count
that grows or a new file appearing fails the suite. Enforceable on day one, converges monotonically.
Mutation-proven. Shipped `a79677d`. The 109-string sweep itself is now ordinary loop work.

### ⑦ This file — **[LOOP] Created, with the protocol at the top.**

### ⑧ `world-rebuild-after-load` in CI — **[LOOP] Kept in CI. Calibrated — and the calibration proved me wrong.**
Unlike ①, this is a correctness test for a critical bug (Load World permanently destroys the terrain), so it
belongs in CI. Its recovery window was a fixed 60s that encoded one machine, and I judged the CI red to be a
slow-runner false negative: 30 of 50 chunks recovered, presumably still climbing. So the window is now derived
from the machine's own measured initial-stream throughput, and the 80%-recovery assertion is untouched.
Shipped `8ac8d07`.

**Then the calibration falsified the hypothesis it was built on, which is the useful part.** With 101s, 134s
and 150s budgets across three attempts, the count settles at **exactly 30** every time against a 49–50
baseline. It does not creep. A slow machine gives a slow climb; this is a deterministic **plateau**.

**Revised reading: this is probably a real bug the fast laptop has been hiding.** The original defect
(`requestedChunks` never drained after a load → nothing re-requested → world gone) was fixed by clearing the
set in the `load_modifications_done` handler. A reproducible ~19-chunk deficit suggests the recovery is
*partial*, not slow — plausibly keys whose worker replies were in flight across the clear stay marked
requested and are never re-requested. On a fast box that window is a chunk or two and rounds away above the
80% bar; on a slow box it is ~20 and the bar catches it.

**RESOLVED 2026-08-02 — and my second diagnosis was wrong too.** Instrumenting the recovery trajectory and
letting CI answer it settled it. All three attempts climb steadily (`2→12→25→30`) and flatline at 30 for
60–100s. That is the shape of a streamer **finishing**, not one stalling.

Root cause is a **test defect**, not a game bug. `GameScene.jsx:185` mounts a drei `<PerformanceMonitor>`
whose `onDecline` steps the quality tier down, and `TIERS.renderDistance` is 4/3/2 → boxes of 81/49/25
chunks, re-read by the streamer every tick. Re-streaming a world right after a load is the heaviest thing
this game does, so on a 2-core runner the monitor declines med→low *during* the measured window. The
streamer then correctly refills the 5×5=25 box; 30 is that plus the stragglers `cullDist = renderDistance + 2`
deliberately keeps. The test was comparing a med-tier baseline against a low-tier recovery — two different
worlds — and calling the difference a defect.

The target is now computed from the tier **as it stands at assertion time**. The 80% bar is untouched, and
the bug the spec exists for is still caught: it parks the count at zero, which fails against every tier's box.

**Three diagnoses, two wrong, and the tooling caught both** — the calibration falsified "it's just slow",
and the trajectory falsified "it's a partial recovery". Worth keeping as the pattern: each fix was built so
that being wrong would be visible, which is why being wrong twice cost one CI run rather than a refactor.

**New lead found in passing (not actioned):** a local run reported `baseline 81 @low`. The tier was `low` —
whose box is 25 — while **81 chunks stayed resident**, because `cullDist = renderDistance + 2` culls only
beyond ±4, i.e. retains a 9×9 box regardless of tier. So a downgrade from high→low stops *loading* new
chunks but frees nothing already loaded. On the machine the downgrade exists to protect, memory and draw
calls stay at high-tier levels. Queued.

### ⑨ CI itself — **[LOOP] Sharded, so it can conclude at all.**
It had concluded `success` **zero times in 88 runs** (86 cancelled, 2 failed) because the e2e job exceeded
its own 25-minute budget every run, and a timed-out job renders as `cancelled` — indistinguishable from a
run superseded by a newer push. Sharded 3× in `70e432e`; the first sharded run produced this repo's first
`success` on an e2e job. Sharding did not fix the tests — it made their results visible, which is how ①, ⑧
and the smoke-budget bug were found at all.

---

## 2026-08-02 — [LOOP] Capture determinism: weather was never frozen

Not from the batch — found because of decision ③.

Promoting the 7 frames turned up a failure in a frame that was *already* gated: `landmark`, at 6.29% then
6.27% against a 6% threshold, reproducible, with **zero `src/` changes since it last passed**. Every signal
pointed at the dependency bump from ④ having shifted the renderer.

It had not. Opening the two PNGs side by side took a minute and showed the actual cause: the current capture
had caught a **dynamic rain storm** — rain streaks, a darkened sky, and an "Atmospheric shift…" toast in the
corner. `WeatherSystem` cycles clear↔storm on a 90-second interval, and a full capture takes over four
minutes, so it fires two or three times mid-run. **Every outdoor frame has been a coin flip against its
baseline for as long as the gate has existed**, depending on where in the cycle it landed.

The audio side of that same interval was already capture-gated, with a comment citing "the T8 long-interval
lesson" — the hazard was known and the fix had been applied to one of the callback's two effects.

Two things worth keeping:
1. **The check must be INSIDE the interval callback.** `isCaptureMode()` is a runtime flag the harness flips
   through a test-bridge hook *after* mount, not a URL parameter — so a guard at `useEffect` setup always
   reads false. The first fix was written that way, and the re-run returned a byte-identical 6.27% with the
   toast still in frame. Verified fixed only after moving the check inside.
2. **A pixel percentage is not a diagnosis.** It cannot distinguish "the renderer changed" from "the scene
   did". The failure message now says to open both frames first and lists the non-render causes in the order
   they actually bite.

---

## 2026-06-15 → 06-29 — **[KEVIN]** decisions-of-record, MIGRATED here 2026-08-07 from `LOOP-CHARTER.md` §0-C

**Why they moved.** They were embedded inside ~5.5 KB of *superseded mandate narrative* in the charter —
06-17 rebuild, 06-20 "fix everything then build everything", 06-28 post-audit, 06-29 tech-debt/de-monolith —
which charter §0-A already declares "now HISTORY", promising their decisions-of-record survive. So the charter
was carrying dead process instructions in a file read EVERY iteration, purely as packaging for these lines.
The narrative is history and lives in `memory/CHANGELOG.md` + git; the decisions are the durable part and this
file is their designed home. **Nothing here is reversed, weakened, or reworded to change meaning** — the
charter now names them and points here.

- **World-design direction = HYBRID (option C)** (Kevin 2026-06-13, `KEVIN-REVIEW-BATCH.md:610` item 11).
  Infinite procedural wilds for the survival/explore loop, PLUS a crafted "home" anchor, a handful of signature
  silhouette landmarks, genuine biome distinctness, and oceans that are a *place* (depth, beaches, something out
  there) rather than blue blocks. Rejected: (A) endless wilds alone — weak memorability; (B) finite crafted
  island — caps the explore loop. Spec `specs/2026-06-13-crafty-world-design-hybrid.md`. Two loop-chosen
  defaults inside it, reversible: the home anchor is a quiet solo **"Hearth"** (lodge + brazier + pier, NO NPCs)
  rather than an inhabited hamlet, and **deep oceans stay friendly-explorable — no drowning/oxygen timer**
  (matches the broad-audience pillar).
  *This is the item the kernel's SETTLED list named and this file did not have: it was recorded only in the
  append-only INBOX, which structurally cannot say whether something was settled.*
- **World/game direction — "The Ember Frontier, gated toward a Blight Heart climax"** (Kevin-confirmed
  2026-06-15). Outward *see-it-go-to-it* exploration on the built landmark + compass rails; the Shadow Dragon
  moved from its ~25-block ambush to a single fixed, foreshadowed far-edge lair = a real WIN-STATE plus endless
  post-climax handoff. Source `plans/2026-06-15-crafty-world-purpose-sota.md`. **Reversing this is genuinely
  Kevin; affirming a sub-direction inside it is loop authority.**
- **Grade LOCK REVERSAL** (Kevin 2026-06-17). The restrained-NEUTRAL grade lock is **reversed** —
  glowier/warmer is AUTHORIZED (ocean = toon Caribbean water-plane; title = cinematic 3D vista; W3 =
  living-frontier MAX; spells = 4 distinct silhouettes). The Ember-Frontier direction above still stands; the
  rebuild changed LOOK, not direction.
- **Control scheme = Option A, `F` = cast spell, `T` = melee** (Kevin 2026-06-28, shipped `74fd858`). Magic is
  the marquee feature, so it gets the primary verb. The Option-A enhancements (verb-telegraph reticle,
  hold-Alt force-build, persistent control legend, full key-rebinding) are authorized loop work. The touch
  Aspect-verb radial wheel is DEFERRED to a Kevin playtest.
- **Bloom `luminanceThreshold` 0.65 (glowier) is INTENDED** (Kevin 2026-06-28). It SUPERSEDES the older ≥0.85
  spec. **Do not "fix" it** — reconcile the stale spec note instead.
- **`grantXP` full-heal on level-up is INTENDED** (Kevin 2026-06-28). Leave it.
- **E2E = `@playwright/test` gameplay-flow specs** (`npm run test:e2e`, `tests/e2e/`) on the dev test-bridge +
  the headless-safe `forcePlay` hook, kept SEPARATE from the puppeteer visual gate (Kevin 2026-06-28).
  Design-of-record `specs/2026-06-28-crafty-control-scheme-design.md`.
- **Audience is BROAD** (Kevin 2026-06-04, also in coherence-pillars P5): kids → young adults → adults, "blur
  the lines". An 8-year-old is A user, **not a depth-lowering floor** — intensity, real stakes and hard modes are
  allowed; age-8 legibility is a design virtue, never a ceiling.
- **Chinese (zh-CN) is a locale TOGGLE with ENGLISH as default** — design copy in English, then routed through
  `t()` so the toggle stays complete. Full content translation is owed (#73) but the game is EN-first.
- **Execution posture: CONTROLLER-SEQUENTIAL for code** (2026-06-28) — TDD → gate → commit → push per item,
  NOT fan-out code-editors: shared god-files rate-limit and conflict (the logged M-HUD lesson). Background
  Workflows are for read-only analysis and adversarial verification.
- **De-monolith is FULL LOOP AUTHORITY** (Kevin 2026-06-29) — it had been parked as Kevin-gated scope/taste at
  iter-175; Kevin explicitly directed it, so it is no longer a genuinely-Kevin item.
- **Still Kevin-gated as of 2026-06-29** (verify against live STATUS before treating any as still gated): zh-CN
  i18n #73, S4 multiplayer/monetization, control-scheme #9, compass #6, touch radial wheel, mob/boss art, W4
  weather, clip/photo-mode, live-eye taste, affixes full wiring. *(Later partly superseded: 2026-07-13 de-gated
  mob/boss art and confirmed the Option-A enhancements — the `[KEVIN-GATED]` tag on them was stale.)*

---

## Older open items, dispositioned

- **Ocean water aesthetic** — **[KEVIN]** Genuinely pure taste, and the coast is lived-verified clean. No
  loop decision; stays in the inbox until Kevin has an opinion. Nothing is blocked on it.
- **Chest LMB mines it (stored inventory lost)** — **[LOOP] Accepted as a real bug, queued as loop work.**
  Losing a chest's contents to a mis-click is data loss, not a balance question; option (a) — LMB opens —
  is the only one that cannot destroy player property. Not bundled here because it is gameplay, not harness.
- **500 ms global damage-lockout / camera-shake decays per frame / mob AI pathfinds in 2D** — **[LOOP]
  Confirmed real, queued by size.** The first two are small and belong in a game-feel unit with a lived
  probe. 3D pathfinding is a project, not a fix, and should be planned before it is started.
- **Preview-tab husks** — resolved; `close-preview-tabs.sh` reports none. The loop will never run `--close`
  itself: its default target is the caller's own session, and an autonomous iteration once used it to
  terminate its own session.

## 2026-08-08 — Kevin removed twelve items from his own desk

**Kevin:** *"is there really a bunch of decisions you need me to make? or can you autonomously decide? and
only leave really important / non-reversible / critical ones for me to decide later."* Then, on the grass
colour specifically: *"decide the grass colour too."*

- **Grass colour** — **[LOOP] Decided: swatch B `#5E8A3E`** (`83054c1`), replacing the blue-green `#4a7c59`
  that read as a different plant from the `#567C35` ground. Measurement ruled A out (13,213 blue-leaning
  pixels vs 11,258) and could **not** separate B from C, so that half was decided on stated reasoning: B is
  +8/+14/+9 on the ground base and keeps tuft and turf in one family, which is what S9 was for; C is
  +25/+32/+21 and re-opens the separation S8/S9b closed. Veto-able, one word.

- **The "Awaiting Kevin" queue was a false ask.** Audited against this file: of thirteen rows, **eight were
  already resolved** and left rendered as questions, and four had already been assigned **[LOOP]** here.
  Exactly one — the ocean water aesthetic — is genuinely Kevin's.

- **`LOOP-KERNEL-PROMPT.md` was the cause and is corrected.** Its "STILL GENUINELY KEVIN" line named
  chest-mining, damage-lockout, camera-shake feel and 3D mob AI as recorded design calls. This file had
  already reassigned all four to **[LOOP]**. The charter states that this record — not the kernel, and not
  the append-only inbox — is what settles ownership, so the kernel line was stale and reading it is what put
  twelve non-Kevin items in front of Kevin. Corrected in the same commit.

- **Standing rule going forward:** a reversible call gets **made** and noted veto-ably. A row survives in an
  Awaiting-Kevin surface only if it is on this file's `[KEVIN]` list, or is irreversible, spends money,
  publishes externally, or adds a new dependency. Any row whose subject is verifiable at HEAD gets verified
  and deleted at session close rather than re-rendered.

## 2026-08-08 — the capture determinism bar was the wrong instrument (research-settled)

**[LOOP] Pending execution, evidence recorded.** Kevin asked for research rather than another fix
attempt, and it settled the question.

Chromium does **not** guarantee deterministic rendering. Playwright maintainer, microsoft/playwright#22620:
*"In general, Chromium does not guarantee consistent rendering for the same inputs, so you should be
prepared that some pixels might be different."* #23654 asks the same-machine/same-driver question
precisely; the answer is that determinism is *intended* and has long-standing bugs (crbug 919955).

**So the `< 0.15%` run-to-run bar demanded a property the browser does not promise.** It was my own
estimate (~2x a then-observed 0.083%), never a derived requirement, and it blocked a genuinely-owed
re-baseline for a day. No production visual-regression suite gates on exact equality — Playwright, Percy,
BrowserStack and reg-suit all expose `maxDiffPixels`/`maxDiffPixelRatio`, and the consistent guidance is
**do not use one threshold for everything**.

Order of execution, deliberately fix-before-tolerance:
1. `--deterministic-mode` + `--font-render-hinting=none` (Chromium `headless/public/switches.h`), measured.
2. Per-frame tolerances re-derived in their own commit with this evidence — tight for the 30 static
   frames, ~1% for `menu`'s live 3D diorama. Rule 4 permits fixing a genuinely-wrong gate WITH
   justification; it forbids relaxing one quietly, which is why this is written down before it is done.
3. The owed re-baseline (S9, S9b, grass B, ocean) in one commit.

**Not to be read as "the fixes were unnecessary."** Both shipped: an adaptive `dpr={[1,2]}` range
reaching capture, and a camera frozen mid-drift. Both were real bugs and both stay.

Full sourcing: `~/.claude/projects/-Users-kz-Code/memory/reference_chromium_render_determinism.md`.

## 2026-08-09 — SOTA audit: step 1 of the 2026-08-08 plan is dead, and the dpr pin was inert

**[LOOP] Supersedes the execution order in "2026-08-08 — the capture determinism bar was the wrong
instrument".** That entry's *finding* stands unchanged — Chromium does not guarantee deterministic
rendering, and the `< 0.15%` bar demanded a property the browser does not promise. Its *plan* does not.

A 42-agent audit (8 research lanes, 32 adversarial verifications, 0 errors) killed two things I had
recorded as settled.

**1. `--deterministic-mode` and `--font-render-hinting=none` do not exist in the binary we launch.**
Step 1 above sourced them from Chromium's `headless/public/switches.h`. They never survive into shipped
Chrome. Verified 2026-08-09 by `strings -a` over the actual framework Puppeteer resolves
(`~/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/…/Google Chrome for Testing Framework`), exact-line
match, **with a presence control** so the instrument had to prove it can return YES:

| flag | exact-line hits | |
|---|---:|---|
| `use-angle` / `disable-gpu` / `headless` | 1 / 1 / 4 | CONTROL — instrument works |
| `deterministic-mode` | 0 | ABSENT |
| `font-render-hinting` | 0 | ABSENT |
| `enable-begin-frame-control` | 0 | ABSENT |
| `run-all-compositor-stages-before-draw` / `disable-partial-raster` / `disable-skia-runtime-opts` | 1 / 1 / 1 | present, INERT here |

They ship only in `chrome-headless-shell`, which left the Chrome binary at M132. Executing step 1 would
have measured nothing and reported "no effect" for the wrong reason — the most expensive kind of null
result, because it looks like evidence. The three present sub-flags are Skia/DOM-raster levers; our
variance is WebGL-canvas pixels, and in-process output is already byte-identical so there is no intra-run
race for them to serialise. **Generalised lesson: a switch in the source tree is not a switch in the
binary. Grep the artifact you actually run.**

**2. The dpr pin was arithmetically inert.** `calculateDpr([1,2])` in installed R3F 9.5.0 is
`Math.min(Math.max(dpr[0], window.devicePixelRatio), dpr[1])`; `capture.mjs:197` sets the viewport with no
`deviceScaleFactor` and Puppeteer defaults it to 1, so `[1,2]` and `1` both resolve to 1.
`tests/gates/capture-dpr-gates.test.jsx` gates a no-op. The prior entry's "both were real bugs and both
stay" is **half-corrected**: the camera fix addressed a real freeze-vs-reset defect; the dpr change is
harmless and may stay, but the CLAIM that it bought 2.7x was wrong — that delta sits inside the metric's
own ~0.6pp spread. Do not cite it as a magnitude anchor.

**The reframe.** Every defect this harness has actually shipped was coverage or content, never tolerance:
four beast-less baselines, 7 of 31 frames baselined but absent from `STATES`, motes at the world origin.
`menu.png` needs 61,440 changed pixels to fail the 6% gate and produces ~10,000 at worst — it cannot go
red. `ocean-coast` at 8.34% is the only red thing. Measured full distribution over a preserved
identical-code pair is three tiers: **13 frames byte-identical**, 16 at 0.002–0.089%, then `explore-day`
0.210% and `menu` 0.455%. The 6% global threshold is therefore ~1000x too loose for the 13 exact frames,
and the gate's live defect is FALSE NEGATIVES on the static frames.

**Largest hole, previously unexamined by anyone: the oracle is ungoverned.** No gate covers
`frontend/tests/visual/baseline/**` — `mutation-proof-trailer.mjs:40` scopes `GATE_PATHS` to
`tests/gates/` and `scripts/ci/`. 79 of 1,603 commits rewrite baselines; **10 of the last 12
baseline-rewriting commits also touch `src/` in the same commit**; no diff artifact exists and `current/`
is gitignored, so a failed run leaves no durable evidence once the terminal scrolls.

**Superseding order of execution:** (0) one-line check of whether the diorama canvas exists when
`enterCapture` fires — `React.lazy` mount order decides whether the phase fix AND `04148c8` are inert;
(1) write the pixelmatch diff PNG on failure; (2) the owed re-baseline in ONE commit; (3) baseline
governance — trailer gate + contact sheet; (4) reset the two remaining animated-phase sites
(`MascotCraftyHero.jsx:37`, `TitleDiorama.jsx:23`) to their declared values; (5) per-frame tolerances,
from n>=10 separate-process captures, never a max-of-three. **One re-baseline, not eight** — eight
findings each independently demand one, and piecemeal that is eight bulk oracle rewrites, which is the
exact mechanism that produced the beast-less baselines.

Also settled and not to be re-proposed: no new browser engine is a viable deterministic WebGL capture
backend (17 candidates, 16 ruled out — Cloudflare's Kitesurf cannot render WebGL and explicitly trades
away pixel fidelity; Firefox hard-disables headless WebGL in source; Servo and Ladybird publish no
determinism claim either way). `pixelmatch`'s `windowSize` is documented on main and exists in NO
published version. Do not migrate capture to Playwright, and do not move the visual gate to CI.

Full audit: `https://claude.ai/code/artifact/036fab8d-57db-409e-80a9-4ca0a3786ba4`

## 2026-08-09 (evening) — capture determinism SOLVED; per-frame tolerances DEFERRED on insufficient n

**[LOOP] Executed.** Closes the plan recorded this morning.

**menu.png is byte-identical across separate processes — 0.0000%.** Pre-fix, same protocol:
0.984 / 0.455 / 0.359 / 0.557%. Byte-identical frames went 13/31 -> 23/30; worst frame 0.4553% ->
0.1899%. The cause was the freeze-vs-reset class: `if (isCaptureMode()) return;` leaves an animation
wherever it got to, and capture is enabled after a boot whose length varies 1.68-10.43 s per process, so
the frozen phase was run-dependent. Fixed for the camera in `04148c8`; the mascot idle and the mote ring
were the two remaining sites (`a5f1be4`), reset to their DECLARED values rather than to t=0 — the gems
decide that, since their pulse PEAKS at the declared intensity.

**CORRECTION to my own morning claim.** I recorded a ~0.155% "floor" that the fix would approach but not
reach. That figure was measured at a 40 ms window gap, so it was itself residual phase difference, not a
floor. Fully reset, the residual is zero. `explore-day` at 0.19% is now the worst frame and it is a
DIFFERENT mechanism — the late-chunk treeline — not this one.

**Re-baseline landed at `6af95b7`**: 19 frames, reviewed in a generated old/new/diff sheet before
promotion, gate re-run AFTER promotion (32/32, 21 frames with no changed pixel). First commit in this
repo's history to pass through `baseline-trailer.mjs`. Baselines now carry provenance.

**PER-FRAME TOLERANCES ARE DEFERRED, and this is a decision rather than a punt.** The audit set the bar at
**n>=10 separate-process captures, explicitly NOT a max-of-three**, and refuted a proposal whose default
was 10x looser than this repo's own bar. I have n=3. Deriving tolerances from three runs would commit
exactly the error that was refuted, and it would do it while the case has WEAKENED: with menu at 0.0000%
and 21 of 31 frames showing no changed pixel, the frames that most need a tight bound are now provably
exact, so the global 6% is wrong by a wider margin than before but the correct replacement is less
obvious, not more.

The calibration mechanism is already in place and running: the windowed diff-density report (`8a2b7f7`)
prints max local density for all 31 frames on every run, asserting nothing. Its first readings show
local/global amplification of **7.3x-62.5x**, which is precisely why a bound derived from the global ratio
cannot be reasoned across to a local one — and why the proposed TAU of 0.10 would have reddened 8 frames,
7 of which pass today. Collect that data over the next ~10 capture runs, then derive.

**Protocol when the data exists:** tier by measured behaviour, not by guess — the byte-identical set gets a
near-zero bound, the trace-noise set a small one, and any frame with genuine 3D motion its own. Rule 4
permits fixing a genuinely-wrong gate WITH justification; it forbids relaxing one quietly, which is why
this is written down before it is done.

---

## 2026-08-09 (evening) — `failOnFlakyTests` DEFERRED on n=1, and instrumented rather than hoped

### The situation. **[LOOP]**
`10a3cca` fixed the two flaky e2e specs (`panel-overflow` — a wait bound tight relative to its own file;
`tier-downgrade-reclaim` — a threshold judged against this machine rather than its design floor). The
obvious follow-through is Playwright's `failOnFlakyTests`, which turns a retry-then-pass into a hard
failure so `retries: 2` can no longer mask a degrading spec.

**Not yet.** Since that fix there has been exactly **one** completed clean CI run on `main` (`2222b22`,
28 specs across 3 shards, 0 flaky; the run at `6af95b7` was `cancelled` by supersession and carries no
signal). Flipping a gate on a single observation is precisely the error corrected four commits earlier in
`03e61d4`, where an n=1 tab sighting had been written up as a mechanism. Doing it again in the same hour,
to a gate that reds the tree, would be worse.

There is also a real cost the other way. The retries are not decoration: these specs drive software-WebGL
Chromium on a shared runner, and `failOnFlakyTests` converts machine weather into a red tree. That is the
self-decaying-gate shape — a gate that goes red from conditions rather than defects teaches everyone to
ignore it, and then it protects nothing.

### The decision. **[LOOP] Instrument the flakiness, flip on the record.**
`scripts/ci/flaky-report.mjs` runs after every e2e shard under `if: always()` and prints, per shard, how
many specs it walked and which ones passed only on a retry — REPORT-ONLY, exit 0, same posture as
`coverage-zero.mjs`. The observation window now accumulates *in the run log*, where anyone can count it,
instead of depending on a future session remembering to grep five runs by hand — which is how these two
were found in the first place.

**The flip criterion, so this is a decision and not an intention:** set `failOnFlakyTests: !!process.env.CI`
once **10 consecutive completed CI runs on `main` report 0 flaky across all three shards**. `cancelled`
runs do not count — they carry no signal, and mistaking one for a result is the exact confusion that hid
88 runs' worth of failure in July. If a spec does appear, fix the spec; do not restart the count by
loosening it.

### One thing worth recording about the instrument itself.
Its recursive descent into nested suites is load-bearing, not defensive polish: three e2e files use
`test.describe`, **including `panel-overflow.spec.js`** — one of the two specs this exists to watch. Proven
against a real Playwright artifact rather than a fixture: on a genuine depth-2 report the shipped walker
reports `walked 1`, and the non-recursive mutant reports `walked 0` while still printing "no flaky specs".
A top-level-only walk would have been blind to exactly the spec it was built for, and would have said so in
the language of a clean run. The `walked` denominator and the cross-check against Playwright's own
`stats.flaky` are what make that failure loud instead of reassuring.

---

## 2026-08-09 (late) — the SOTA audit's four "explicitly not checked" items, now checked

The audit closed with an honest limit: *"Explicitly not checked, because no execution was permitted:
whether the gate is ever actually run; whether antialiasing is granted under the software rasteriser; the
diorama's mount order relative to capture-mode entry; any post-fix measurement of the menu residual. Every
'this will help' claim above is mechanism-verified, not outcome-verified."* Kevin asked what to do about
them. Execution is permitted now, so they were measured rather than reasoned about. **[LOOP]**

### ① Is the visual gate ever actually run? — **No, not automatically, and that stays true by decision.**
It is in neither `.githooks/pre-push` nor `ci.yml`; the hook contains only a comment reminding a human to
run it. Measured 733 s (37 s of which is literal sleeps), and every baseline is macOS arm64 against Ubuntu
x86-64 runners, so CI would compare across a published cross-platform pixel-parity problem.

What was *unanswerable* before is answerable now: `tests/visual/baseline/.capture-meta.json` (REMOVED 2026-10-28, W2-B) (landed with
the provenance work) stamps `startedAt`/`finishedAt` on every capture. Last run **2026-08-09 04:52:11 ->
05:07:36, 925 s, `complete: true`, `crashes: 0`**, on ANGLE/SwiftShader Vulkan 1.3.0, darwin-arm64. Before
that file existed, "when was this oracle last exercised" had no answer at all — which is the more important
half of the audit's question. The instrument now exists; the scheduling stays manual.

### ② Is antialiasing granted under `--use-angle=swiftshader`? — **Yes: 4x MSAA, and it is honoured.**
Probed with the capture's exact launch flags (throwaway probe, deleted; no port bound): requesting
`antialias: true` returns `granted: true` with `SAMPLES 4`, `MAX_SAMPLES 4`; requesting `false` returns
`SAMPLES 0`. The software rasteriser is not silently ignoring the request in either direction.

**What that explains — and, carefully, what it does not.** Only ONE surface asks for it:
`TitleDiorama.jsx:143` (`antialias: true`), which is the `menu` frame. `GameScene.jsx:125` sets
`antialias: false` because post-processing handles AA. So the single frame with MSAA enabled was the single
noisiest frame, and its diff signature was *"hairline outlines tracing every edge of the mascot"* — exactly
what an MSAA resolve does to a small geometric difference. **AA was the AMPLIFIER, not the cause.** MSAA is
deterministic given identical geometry, and the residual went to 0.0000% once the animated-phase reset
landed with no AA change at all. Recording this so nobody later reads "AA was on" as the diagnosis and
disables it: that would blur the frame without removing a single source of variance.

It also confirms the comparator is configured correctly. `pixelmatch`'s `includeAA` default of `false` is
the antialiasing-AWARE setting (the name reads backwards), and the gate leaves it at the default. Against a
frame that genuinely carries 4x MSAA, that default is the right one and is now measured, not assumed.

### ③ Diorama mount order relative to capture-mode entry — **checked earlier this session**, at Kevin's
explicit instruction, and recorded in the preceding entry's order of execution as step (0). The canvas is
present when `enterCapture` fires, so neither the phase fix nor `04148c8` is inert.

### ④ Post-fix measurement of the menu residual — **done: 0.0000%, byte-identical across separate
processes**, from 0.984/0.455/0.359/0.557%. Evidence in the "capture determinism SOLVED" entry above.

### And one recommendation the audit made that was never separately decided.
Under "Declined on purpose -> Moving the visual gate to CI", the audit kept a carve-out: *"Worth doing
cheaply: a Linux self-consistency job that captures twice and diffs run A against run B, touching no
baseline."* The preceding entry says "do not move the visual gate to CI", which settles the MIGRATION but
not this. Deciding it explicitly rather than letting it evaporate: **[LOOP] declined.** Its signal —
does capture reproduce itself — is now covered twice at a fraction of the cost, by
`assertIntraPageDeterminism` (a standing gate, no baseline, cannot rot) and by the measured 0.0000%
cross-process result. A second ~15-minute Ubuntu job per push, on a platform we ship no baselines for,
would buy a third reading of a question already answered exactly.

---

## 2026-08-09 (late) — Phase C step 1: the deterministic capture CLOCK, and what probing it revealed

### Why suppression was ever the design. **[LOOP]**
Substituting for reality needs two primitives and this repo only ever had one. `captureMode.js` shipped
seeded per-key PRNG streams in `captureRandom`; **nothing ever substituted TIME.** So against 72 clock
reads, any system left running under capture advances by WALL TIME — and boot length varies 1.68-10.43 s
per process, so the frame samples a run-dependent phase. Turning systems OFF was the only way to get a
stable frame, and that is why 116 `isCaptureMode()` sites across 61 files exist, 31 of them early-returns.

`src/devtest/captureClock.js` supplies the missing half: under capture, time is a pure function of HOW
MANY FRAMES HAVE BEEN RENDERED. Two processes reaching frame 90 by different routes read the same clock.
`CAPTURE_DT` is a fixed 1/60 and deliberately NOT the display's refresh rate — reading the monitor would
make Kevin's 120 Hz ProMotion screen and a CI runner render different frames from identical code.

### The non-obvious bug, found before it shipped.
This app mounts **three** `<Canvas>` elements (GameScene, TitleDiorama, MascotStudio), each with its own
render loop. Had each advanced the counter, a frame would cost three ticks — and because the diorama is
`React.lazy`, the RATE would change the instant its chunk resolved. Elapsed time would then depend on when
a network-ish event landed: **the same run-dependent phase the clock exists to remove, reintroduced by its
own fix.** Ticks are deduped on `document.timeline.currentTime`, which by spec advances once per animation
frame and reads identically for every callback within it.

### What probing the running app changed about the plan.
The clock was probed in a real headless browser rather than assumed to work. It ticks — and after **2
seconds of wall time under capture, only 2 frames had elapsed**, i.e. 33 ms of virtual time. That is
SwiftShader's ~1 fps, and it is correct behaviour, but it has a consequence for the rest of Phase C that
was not in the plan:

**A frame-indexed clock alone does not put motion into the frame.** Waiting wall-clock time before a shot
now advances the world by almost nothing, so an un-suppressed system would be captured at its start pose —
deterministic, and just as uninformative as suppression. So the remaining work needs a HARNESS change as
well as per-subsystem edits: **step the clock to a declared frame index, then shoot** (`advance N frames`
→ `shot()`), which makes the captured phase an explicit, reviewable constant instead of an emergent
property of how fast the machine happened to render.

That ordering matters and is recorded before the work rather than discovered during it: converting a
subsystem from suppression to substitution WITHOUT step-then-shoot would produce frames that are stable,
still, and no more informative than today's.

### Also recorded: a leak I caused, and the guard that half-caught it.
The probe called `srv.kill()`; `_serve.mjs` returns `{ server, url, waitReady, shutdown }`. The `finally`
threw and vite was orphaned on port 4181. `kill-test-procs.sh` then REFUSED to sweep — correctly, by
design, because the process was under 3 minutes old and could have been a live run. Killed by PID, port
verified clear, probe deleted. The standing rule earns its place again: hand-started means hand-killed,
and a throwaway probe must use the helper's actual contract rather than a plausible-looking method name.

---

## 2026-08-11 — [KEVIN] full design authority over every feature, advertised or not

Kevin, verbatim: *"for any 'advertised' feature (or non-advertised feature), you should deeply and
holistically evaluate if it's worth keeping / wiring up / or deleting. any feature / characteristic of
this game is up for enhancement / modification / deletion as you decide best. no need to wait for my
decision."*

**This supersedes the 2026-08-11 batching decision.** Thirty-three audit findings were filed to
`KEVIN-REVIEW-BATCH.md` on the grounds that "a feature built, advertised and never wired" is a product
call rather than a bug. That reasoning was correct under the old authority and is now moot: the call is
mine. Those entries stay in the batch file as a RECORD of what was decided and why, but they are no
longer blocked on an answer.

**What the grant does NOT change**, because none of it was about design authority:
- Irreversible or outward-facing actions still stop for Kevin — force-push, external send, money,
  accounts, publishing, a NEW dependency, hard-deleting a referenced file.
- Every deletion still needs the same evidence a fix does: the consumer graph traced, the finding
  mutation-proven, and ARCHIVE-over-DELETE where the artifact has independent value.
- Recorded decisions are not silently reversed. A reversal is a new dated entry naming the one it
  supersedes — this entry being the example.

**The bar I will hold myself to,** since "as you decide best" is the whole instruction and a lazy
reading of it is "delete everything unwired": the question is not *is this code reachable* but *does
this make the game better*. A feature reachable by four entry surfaces and localized into two languages
was someone's intent; deleting it is a real cost, not a tidy-up. Wiring costs build time and adds
surface to maintain. I will state which of the two I chose and why, per feature, in the commit that
does it — and where a feature is genuinely worth having but too large for the current unit, it goes to
`ROADMAP.md` as a named unit rather than being deleted for convenience or left rotting for honesty.

---

## 2026-08-11 — Phase C step 3: the capture clock becomes a COMMANDED clock

**Supersedes the free-running half of "2026-08-09 (late) — Phase C step 1: the deterministic capture
CLOCK".** That entry stands on everything else: the clock exists, `CAPTURE_DT` is deliberately not the
display refresh rate, and the three-canvas dedupe on `document.timeline.currentTime` is correct. What is
reversed is one sentence — *"under capture, time is a pure function of HOW MANY FRAMES HAVE BEEN
RENDERED"*. That is exactly what made the phase run-dependent.

### The premise that was wrong, measured rather than argued. **[LOOP]**
`advanceCaptureFrame` runs from `CaptureClockTicker`, mounted in all three `<Canvas>` elements, so the
counter climbs once per RENDERED frame. The harness then waits wall-clock time before each shot, on a
renderer managing about 1 fps. So "frame index at shot time" is a function of how many frames the machine
drew — which is the machine, not the code. Probed on ONE box, identical code, identical schedule, five
sample points, two runs:

| | phase samples |
|---|---|
| run 1 | 6, 10, 13, 15, 16 |
| run 2 | 6, 11, 13, 14, 16 |

Two of five diverge without leaving the machine. Across a fast laptop and a CI runner the spread is
unbounded. **This is the same run-dependent phase the clock was built to remove, reproduced one level up,
inside the fix.** It was invisible because it is latent: nothing read the clock, so nothing could vary
because of it. It would have gone live with the first subsystem converted — which is to say, it would
have been discovered as flapping baselines rather than as a design error.

### And a second reason, which is the one that makes freezing necessary rather than tidy.
`shot()` photographs only after `waitForStableFrame` reports two consecutive IDENTICAL frames. A world
animating off a still-ticking clock never produces two identical frames. **A stability wait and a
free-running clock cannot both be satisfied once anything reads the clock** — the world has to be STILL
at the declared phase to be photographable twice. This was not visible while every animated system was
suppressed, because a suppressed world is still by construction.

### The decision. **[LOOP]**
`setCaptureFrame(n)` sets the phase ABSOLUTELY and freezes the clock; `resetCaptureClock()` thaws, so each
captured state is free to tick during its own setup and is then pinned before its shot. `shot()` in
`frontend/scripts/visual/capture.mjs` (REMOVED 2026-10-28, W2-B) pins before the stability wait, records what the page actually
returned, and the run prints the denominator and fails on any frame shot at an undeclared phase.
`CAPTURE_PHASE_FRAMES = 90` — 1.5 s of virtual time, one constant rather than a per-state parameter,
because a phase that varies by state is one more thing a baseline diff can disagree about for a reason
nobody remembers.

### What this constrains, and it is a real limit rather than a caveat.
Under a commanded clock the world jumps from 0 to the declared phase in ONE step. That is exact for any
animation which is a closed-form function of absolute time (a shader `time` uniform, a sway, a rotation),
and WRONG for an integrator that accumulates per-frame deltas — 90 small steps and one large step are not
the same trajectory. Stepping an integrator honestly would mean rendering 90 frames per shot at ~1 fps,
i.e. 90 seconds x 31 states, which is not a harness anyone will run.

**So the conversion candidates are closed-form animations, and integrator-driven systems stay
suppressed.** That residue is a correct stopping point, not unfinished work, and it should be stated that
way when the suppression census is worked rather than discovered again per subsystem.

### Also recorded: a commit title that outran its diff.
`7d743d6` is titled "step-then-shoot" and says it wired the hook "so the harness can drive it". It touched
`App.jsx`, `captureClock.js` and that module's gate. `capture.mjs` had zero references to it. The
primitive and the bridge hook shipped; the caller never did, and no gate asserted the CALLER — this
repo's most-repeated defect class, inside the harness built to catch it. `tests/scripts/capture-preflight.test.js` (REMOVED 2026-10-28, W2-B)
now asserts it, and the assertion goes red against exactly the `7d743d6` state.

---

## 2026-09-22 — commit `5348c0b8` carries the WRONG message. Read this instead.

**What happened.** I wrote a defensive line into a commit script:

```
git commit -F <scratchpad>/msg.txt 2>/dev/null || true
```

intending a no-op — a leftover path that I expected to fail harmlessly, guarded by `|| true`. It did not
fail. `msg.txt` still existed from earlier in the same session (the MSAA / render-cost work, already
committed separately as `9c52cd02`), so the command SUCCEEDED and committed the staged gate work under
that stale, unrelated message. It was pushed before I read the output.

**The lesson, and it is the one this repo keeps paying for in a new costume:** `|| true` does not make a
command a no-op, it makes its FAILURE invisible. I had reasoned about what the command would do when the
file was absent and never about what it would do when present — the same shape as every gate in this
campaign that was green over input it never examined. A guard that hides an outcome is not a guard.

**What `5348c0b8` actually contains** (9 files; the message describing MSAA, dprCap and godRaySamples
belongs to `9c52cd02` and the commits around it):

- the last six check files brought above 0/5 on `gate-census.mjs` — `chrome-brand-conformance`,
  `title-screen-brand`, `heartbeat-stable-interval`, `touch-wiring`, `hud-declutter`, `npc-spawn`
- `tests/gates/_srcWalk.js` — `strip()` fixed to remove TRAILING `// comments`, which it never had. The
  helper ~10 gates share, whose whole purpose is to stop a gate being satisfied by prose, was doing half
  its job. It reddened a carrier list written an hour earlier the moment it was fixed.
- `tests/sanity.test.js` — documented as deliberately 0/5 (it has no subject; its job is to prove the
  runner executed anything at all) and given the one case it lacked: proof that an assertion can FAIL.
- brand conformance widened from 2 files to all 308, and its patterns strengthened as a result: the old
  file had deliberately weakened `confetti` to an implementation-signature match because a historical
  comment would have tripped the bare word. Stripping comments solves that properly.
- `touch-wiring`'s pointer-lock check widened from 4 hand-named files to repo-wide — which immediately
  disproved the claim I wrote into it. There are TWO readers of `document.pointerLockElement` in code,
  not one: `Components.jsx:510` (the authority, owns `pointerlockchange`, writes `setActive()`) and
  `input/pointerLook.js:32` (guards its own mousemove on the lock being held at all, deliberately not on
  which element holds it). That is a real tension with this repo's "consumers read `getInput().active`"
  rule, and it is now pinned as a PAIR so a third reader reds.

Campaign state at that commit: **32 check files at 0/5 → 0**; the five remaining 0/5 rows are
`scripts/ci` helper modules, which are not checks and are each driven by tests elsewhere.
