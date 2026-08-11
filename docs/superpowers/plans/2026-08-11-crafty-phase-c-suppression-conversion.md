<!-- PROVENANCE: 17-agent workflow, 2026-08-11 — 6 partition censuses over all 218 isCaptureMode()
     references, then two adversarial lenses per partition (determinism + VALUE, the latter asked to
     refute any conversion whose pixels the 6% gate cannot resolve), then one synthesiser. 41 CONVERT
     proposals were made and 24 were refuted. PER-SITE CLAIMS ARE HYPOTHESES until the file is opened. -->

> **VERIFIED BY HAND before commit:** `frontend/src/render/Atmosphere.jsx:226` really is
> `castShadow={!isCaptureMode()}` — every committed baseline depicts a world with no sun shadows — and
> `frontend/tests/visual/diff.test.js:190` really does carry the comment *"REPORT-ONLY windowed density.
> Asserts nothing"* while `maxWindowDensity` runs on every frame of every run. Those are the plan's two
> load-bearing claims and both hold.
>
> **This plan's own headline is independently corroborated.** Before it was written, the first conversion
> landed (grass wind) and measured 0.281% against a 6% threshold — sub-threshold, exactly as the plan's
> value lens predicts for 39 of 41 proposals. The conversion program's yield is capped by the ORACLE'S
> RESOLUTION, not by the clock primitive. That is why Batch 0 comes first.

# Crafty capture conversion plan — suppression → substitution

**Scope.** 130 behavioural `isCaptureMode()` sites across six partitions; 41 CONVERT proposals; 24 refuted by attack; 17 carried forward here. Written against HEAD `0a57313`.

---

## 0. The three facts that govern every batch

**(a) The oracle cannot see most of these conversions.** `frontend/tests/visual/diff.test.js:78` sets `THRESHOLD = 0.06` of *all* pixels — 61,440 px of a 1280×800 frame. Measured calibration from the attack pass: the entire QUESTS panel in `explore-day.png` is 76,934 px (7.51%); the whole VFX ensemble of `spell-cast.png` is 6,552 px (0.64%); all six mobs in `mob-bestiary.png` are 18,200 px (1.78%). Of the 41 proposals, **exactly one clears the gate** (`Atmosphere.jsx:226`) and **one clears it destructively** (`HUD.jsx:189`, +13.6% of opaque panel over eleven world frames). Every other conversion is *human-eyeball* coverage: after it lands, a total regression of the converted feature still passes green.

**(b) The instrument that fixes (a) is already in-tree and unasserted.** `frontend/src/devtest/diffDensity.js` computes `maxWindowDensity(mask, w, h, 128, 32)` and `diff.test.js:192-195` runs it on **every** frame, green or red, printing local max — while asserting nothing. Its own docblock records the measurement: *"13 of the 31 frames reproduce BYTE-IDENTICALLY, which makes 6% roughly a thousand times looser than those frames warrant"*, and *"a proposed TAU of 0.10 at N=128 turns EIGHT of 31 frames red, seven of which pass the current gate."* A 128×128 window is 16,384 px, so the ObjectiveTracker pill (6,120 px) is ~37% local, the minimap disc ~40-60% local, the DayPhaseDial ~35% local. **The conversion program's yield is capped by the oracle's resolution, not by the clock primitive.** Batch 0 raises the resolution; everything else is worth proportionally more afterwards.

**(c) Two harness facts invalidate a large share of the proposed recipes.**

- **The clock is FROZEN at the shutter, at a single global phase.** `scripts/visual/capture.mjs:148` declares `CAPTURE_PHASE_FRAMES = 90`; `shot()` at `:153-160` calls `setCaptureFrame(90)` *before* the stability wait; `captureClock.js:98` sets `_frozen = true` and `:41` makes `advanceCaptureFrame` a no-op. `capture.mjs:791-795` fails the run non-zero on any frame at an undeclared phase, and the constant is global *on purpose* (`capture.mjs:143-147`). **Consequence: `stepCaptureFrames(n)` from a fixture is discarded, and no per-state phase exists.** Every recipe that posed a beat by stepping is structurally dead until that policy changes.
- **The capture clock must NEVER be substituted into a THROTTLE.** `resetCaptureClock()` (`captureClock.js:59-64`) rewinds to 0; `setCaptureFrame` pins at 1500 ms. So `now - cache.t > N` with `now = captureNow()` evaluates to identically 0 while frozen and *negative* after each `enterCapture` — the throttle latches closed after its first refresh and every later state draws the first state's cached geometry. This kills the `captureNow()` step in the recipes for `HUD.jsx:214`, `HUD.jsx:383` and `RadialMinimap.jsx:19`. **A throttle is not a phase.** Leave `performance.now()`; its output is a pure function of a per-state-constant `playerPosition`, so both processes converge within 750 ms of wall time.

---

## 1. Batch table, ranked

| # | Batch | Existing frames moved | Oracle power | Recapture |
|---|---|---|---|---|
| 0 | Harness + invariants | 0 (byte-identical proof) | — | 1 (verification only) |
| 1 | **Sun shadows** | 10 | **GATE (≫6%)** | 1 |
| 2 | HUD enters the oracle (+ new `hud-full.png`) | 15 (each <1.5%) | eyeball → gate after Batch 0 | 1 |
| 3 | Hearth brazier + shrine beacon + the arch-beacon bug | 2 | eyeball | 1 |
| 4 | Degenerate-sample cleanups | 2 | eyeball | 1 |
| 5 | Hands card (new `hands-showcase.png`) | 0 (+1 new) | borderline (~6-8%) | 1 |
| 6 | Far beacons — **conditional, decision required** | 6 | none (deletion moves the same %) | 1 |

Batches 3-5 touch disjoint frame sets and *could* be merged into one recapture if the reviewer accepts a mixed contact sheet; the table keeps them separate because a mixed sheet is exactly what `baseline-trailer-gates.test.js` exists to discourage.

---

## Batch 0 — harness and invariants (no baseline moves)

**Why first:** three of the carried recipes are unsafe without it, and it is what converts Batches 2-5 from eyeball to gate.

### Sites

**0.1 — Arm the local-density review artifact.** `frontend/tests/visual/diff.test.js:129` currently returns early unless `redFrames.length`. Change the contact-sheet trigger to `ratio >= THRESHOLD || density >= TAU_REVIEW` with `TAU_REVIEW = 0.10` at N=128, and write the diff PNG on the same condition (currently gated at `:197`). **Assert nothing yet** — the sheet is produced, the test still only fails on the 6% global. This is the deliverable that makes a sub-threshold re-baseline reviewable at all: today a 0.6% HUD conversion leaves the run green, writes no sheet, and the reviewer bless­es 15 rewritten PNGs with no artifact.

**0.2 — Close the `resetCaptureClock` gap.** `resetCaptureClock()` has exactly one caller, `src/App.jsx:356` inside the `enterCapture` bridge hook. Eleven fixture hooks (`App.jsx:396, 417, 548, 574, 606, 645, 679, 707, 725, 745, 799, 819`) call `enterCaptureMode()` directly and never reset or thaw. Add `src/devtest/enterCaptureFixture.js` exporting `enterCaptureFixture(opts)` = `resetCaptureClock(); return enterCaptureMode(opts);` and route all eleven through it. Matters less now that `setCaptureFrame` is absolute, but it governs the *pre-shot* frames — the window in which mount-time caches latch.

**0.3 — Write the frozen-throttle rule down and gate it.** New `tests/gates/capture-clock-throttle-gates.test.js`: assert that no source file compares a `captureNow()`/`captureElapsed()` value against a stored timestamp (regex over `src/**` for `captureNow()` within 2 lines of `- <ident>.t` / `>` a literal ms). This is a source ratchet, and it is the one place a ratchet is right: the defect is a *shape*, not a value.

**0.4 — Decide the phase policy, explicitly.** Recommendation: **keep `CAPTURE_PHASE_FRAMES` global.** A per-state phase is one more thing a baseline diff can disagree about, and the only conversions that wanted one (`ControlsSheet` auto-fade, `AspectHintToast` clear, `BeastAvatar` burst, `GPUSparkSystem` travel) are all sub-threshold anyway. Record the decision in `capture.mjs` next to the constant so the next survey does not re-propose stepping.

### Gate
`tests/gates/diff-density-review-gates.test.js` — feed `evaluate`-shaped fixtures: a pair with global 0.006 / local 0.35 must produce a contact-sheet row; a pair with global 0.006 / local 0.02 must not; a pair with global 0.07 must produce one regardless of local.
`tests/gates/capture-fixture-clock-gates.test.js` — `enterCaptureFixture()` must leave `captureFrameIndex() === 0` and the clock thawed; `enterCaptureMode()` alone must not (so the helper is provably load-bearing).

### Mutation
Revert `enterCaptureFixture` to a bare re-export of `enterCaptureMode` → the clock gate must go red. Change `TAU_REVIEW` to `1.1` → the density gate must go red on the 0.35-local fixture. A green mutation here means the gate is asserting the call site rather than the behaviour.

### Verification
One full `npm run visual:capture` + diff. **Success criterion: 31/31 byte-identical** (not "green" — byte-identical; the density table now prints `31 frames measured; 31 with no changed pixel anywhere`). Anything else means 0.2 changed something it should not have.

---

## Batch 1 — sun shadows · **THE HIGHEST-VALUE BATCH**

### Site
`frontend/src/render/Atmosphere.jsx:226` — `castShadow={!isCaptureMode()}` → `castShadow`.

### Recipe
Delete the guard. No clock substitution, no RNG substitution, no fixture opt. This is not a determinism control and never was: it carries no stated rationale, the shadow camera is placed from `sunRef.position = m.sunPos` which **snaps** under capture (`Atmosphere.jsx:173-177`), `shadowConfig` (`GameScene.jsx:116-126`) keys only on `q.shadowMapSize` which `enterCapture` forces to `high`, and a depth-only pass is draw-order-independent so React/worker mount order cannot perturb it. Deleting it also *removes* a nondeterminism source: today the value is read in the **render body**, so it is a function of whether `Atmosphere` re-rendered after the flag flipped — the exact defect `captureGlow.jsx` was written about.

### Frames moved (10)
`explore-day`, `explore-day-med`, `explore-day-low`, `explore-night`, `explore-night-low`, `hearth`, `biome-snow`, `landmark`, `boss-obsidian`, `mobile`.

**Not** `ocean-coast` (lookAt x=-110) or `ocean-depth` (x=-128): `Atmosphere` never sets the light's `target`, so the ±100 ortho box is centred on the world **origin** and both ocean poses sit outside it. Not the six sky-studio cards (y≈140-146), not `menu`/`title-mascot` (separate canvas).

### Two things the reviewer must be told before they bless it
1. **A hard shadow terminator will appear across mid-distance in `explore-day`.** Rendered terrain extends past 100 m; the ortho box does not follow the camera. *This is not a capture artifact — it is what a player sees today.* Depicting it is the point of the whole programme. Log the follow-cam shadow box as a separate product defect; do not fix it inside this batch, because that change alters gameplay and would bundle a product decision with an oracle rewrite.
2. **`explore-day-low` / `explore-night-low` are the hard blesses.** At the low tier, 512² over a 200 m box is 0.39 m/texel against `shadow-bias={-0.0001}` — expect acne across the voxel field. Land the high tier first and review those two last.

### Oracle power — **GATE**
Sun at explore mood is `[-55, 48, -52]` = 32° elevation; voxel trees 6-10 blocks tall throw 10-16 m shadows across a grass field filling ~45% of the frame. Comfortably over 61,440 px. This is the only conversion in the entire population for which a *future* regression — a wrong `mapSize`, a broken ortho extent, a bias sign flip, a lost per-mesh `castShadow` — turns a committed frame red.

### Gate
`tests/gates/capture-shadow-gates.test.js` (source-shape, GPU-free, house style per `atmosphere-isolation-gates.test.js`):
- `Atmosphere.jsx` contains no `isCaptureMode` inside the `<directionalLight>` element.
- `Terrain.jsx:217` and `:315` still carry `castShadow receiveShadow` — the caster set is what makes the light matter.
- `GameScene.jsx` still passes `shadows` to `<Canvas>`.

RED before: assertion 1 fails at HEAD. GREEN after.

### Mutation (must match the SHAPE)
Reintroduce the defect as a *guard*, not as a deleted line: `castShadow={!isCaptureMode()}` → gate must go red. Then a second, harder mutation: move the guard to `shadow-mapSize={isCaptureMode() ? [1,1] : shadowConfig.mapSize}`. If the gate stays green on that, it is pinned to one prop name rather than to "shadows are suppressed under capture" — widen it.

### Determinism precondition — mandatory, not optional
Shadow-map rasterisation is a second high-contrast edge source, and the sun sits at y=48, *below* the ~y53 terrain near origin — grazing-angle depth comparison is the class most likely to differ across processes. **Run a two-process A/B on the 10 affected frames before accepting the re-baseline.** `assertIntraPageDeterminism` cannot serve: `capture.mjs:315-319` documents that `menu` was byte-identical *within* a process and 0.36-0.98% *across* processes. A within-process check is structurally incapable of falsifying a between-process claim. Abandon the batch if the cross-process diff on `explore-day` climbs toward 6% (it sits at 0.210% today).

### Why this batch goes first
1. **It is the only conversion that the oracle can see.** Every other batch buys pictures; this one buys a gate.
2. **It needs neither new primitive.** The whole initiative is framed around substituted time and substituted randomness — and the single highest-value site uses neither. It is a static scene property, therefore immune to phase slip, therefore the one conversion that cannot be undone by a later change to `CAPTURE_PHASE_FRAMES`.
3. **It unlocks an entire subsystem that has never been tested by anything.** `shadowConfig`'s map size, the ±100 extents, `near`/`far`, the bias, and every per-mesh `castShadow`/`receiveShadow` flag in `Terrain.jsx` and the mob/hub renderers currently have zero coverage of any kind — unit, gate or pixel.
4. **It is the largest single divergence between the captured build and the played build.** Nine outdoor frames depict a world lit by a sun that casts nothing. No other suppression changes the picture that much.
5. **It carries the largest determinism risk in the plan**, so it should be run while the corpus is still otherwise pristine and a cross-process A/B is cheap to interpret.

---

## Batch 2 — the HUD enters the oracle

**Structural move:** do **not** smear the sub-threshold HUD conversions across the eleven world frames whose subject is terrain. Convert the always-on wayfinding surfaces (which are small and belong there), and route everything large or occluding into **one new fixture, `hud-full.png`**, whose subject *is* the HUD.

### Sites and recipes

**2.1 `src/HUD.jsx:78` + `:93` — DayPhaseDial.** Delete both guards and, in the same edit, delete the interval machinery: replace the `useEffect`/`apply`/`orbitRef`/`labelRef` with a reactive read. `const gameTime = useGameStore((s) => s.gameTime); const p = dayPhase(gameTime, isDay);` and render `transform: rotate(${p.markerAngleDeg}deg)` plus the label directly.
*Why not the proposed `apply(); if (capture) return;`*: the effect has `[]` deps and the HUD mounts on `start`, **before** `settlePlayerToGround` and `setTimeOfDay(0.5)`. It would latch `gameTime = 0` — marker at −90° (dawn) with an empty label, contradicting a noon sky. The memo re-renders only on the `isDay` flip, so nothing corrects it. A reactive read is exact in both capture and play, and it costs one re-render of a leaf memo per game-second in real play — within Game-Loop-Isolation, which targets per-*frame* state.
*Load-bearing fact:* `gameTime` cannot drift under capture — `useDayNightClock.js:27` gates the sole advancing writer, and `setTimeOfDay` is a declared fixture input.

**2.2 `src/HUD.jsx:214` + `:257` — ObjectiveTracker.** Delete both guards. Change the cache sentinel at `:211` from `useRef({ t: 0, shrine: null })` to `useRef({ t: -Infinity, shrine: null })`. **Keep `performance.now()` at `:234`** — see §0(c). The `-Infinity` sentinel is still required, but for a different reason than the survey gave: `capture.mjs` makes the 45 s diorama wait non-fatal, and in the skipped-menu branch `setCaptureFrame` never ran and the free-running counter is exactly the quantity `captureClock.js:76-78` measured diverging (`[6,10,13,15,16]` vs `[6,11,13,14,16]`) — `now - 0 > 750` becomes a run-dependent branch that flips the *depicted objective* between the shrine and the Blight Heart.
*Correctness note for the reviewer:* `playerPosition` is **not** the player. `PositionTracker.jsx:11-20` mirrors `Math.round(camera.position)` on a 200 ms throttle, so the distance shown is camera-to-shrine.

**2.3 `src/ui/RadialMinimap.jsx:19` — delete the early return.** Change the cache init at `:25` to `{ t: -Infinity, s: null }`. **Keep `performance.now()` at `:45` and keep the 250 ms `setInterval`.** Reject the rAF rewrite: `draw()` calls `setCoords({x,z})` with a fresh object (`:35`), so an rAF loop is an unconditional React `setState` per animation frame — a Game-Loop-Isolation violation for zero determinism gain, since every draw under capture is identical. This site is the half-landed fix the survey flagged: the render guard was already removed with a comment arguing the redraw is deterministic, but line 19 returns before the interval is ever installed, so ~12 frames currently assert an empty canvas over a `0, 0` readout.

**2.4 `src/HUD.jsx:383` — SHRINE compass marker.** Delete the `!isCaptureMode()` wrapper; keep `performance.now()` at `:384`; change the sentinel at `:274` to `-Infinity`. **Renders in only 2 of the 31 states** (`biome-snow` pct 84.1, `landmark` pct 91.0), and at `landmark` the label is **clipped** — the track is `w-[280px] overflow-hidden`, pct 91 puts the label centre at x≈755 with ~65 px of text in a 780 px track. Either widen the clamp or accept a truncated label in the oracle; do not land it unexamined.

**2.5 `src/HUD.jsx:189` — ControlsSheet, opt-gated.** Add `showControls: false` to `_opts` in `src/devtest/captureMode.js:31`, merge it in `enterCaptureMode` and clear it in `exitCaptureMode`, exactly as `showTouch`/`hitDir` do. Then `:189` becomes `if (isCaptureMode() && !getCaptureOpts().showControls) return undefined;` and, in the opt-in branch, call `setShowControls(true)` **without** arming the 8 s `setTimeout` (it can never fire — `captureNow()` is pinned at 1500 ms in every gated frame, and per §0(c)(2) the faded state is not depictable at all).
*Why opt-gated:* measured against the pre-demotion baseline (`git show 68eeeee^:frontend/tests/visual/baseline/explore-day.png`), the sheet occupied 118,205 px = 11.54% at 17 `KEY_MAP` rows; it now yields 21 rows ≈ 13.6%. An opaque `bg-panel` slab from x1056-1264, y16-650 in eleven world frames is a permanent 13.6% tax on the frames' actual subject, and `z-hud`=100 buries both the DayPhaseDial (`z-20`) and the 42×42 settings gear.
*Reactivity requirement:* the opt is read inside an **effect**, so the fixture must force a HUD remount — `setHudHidden(true)` → `enterCapture({ showControls: true })` → `setHudHidden(false)`. `enterCaptureMode` notifies no subscriber.

**2.6 New fixture `hud-full.png`** — `App.jsx` hook `spawnHudShowcase()` + a `capture.mjs` state. Requirements, all checkable before capture:
- `enterCapture({ showControls: true, camera: <declared pose> })`, `setTimeOfDay(0.5)`, `setHudHidden(false)`.
- The declared heading must make `HOME` **non-degenerate**: `bearingToMarker(0,0,px,pz,heading,fov).pct ≠ 50.0`. In 7 of the 8 existing poses that render HOME it is *exactly* 50.0, which is why `HUD.jsx:364` was dropped — a sign flip maps `pct → 100-pct` and 100−50 = 50.
- The shrine marker's pct must land in [15, 85] so the label is not clipped.
- If and only if both hold, **conditionally re-include** `src/HUD.jsx:364` (HOME) and `src/HUD.jsx:407` (BLIGHT HEART) *for this card only*, behind the same `showControls`-style opt. `407` requires a heading toward ≈135°; no existing pose has one (all six capture headings are 0° to −47°, putting the lair 135-180° off-axis at 997-1085 m), which is why it is dropped from the world frames and only reachable here.

### Frames moved (15)
Twelve world states — `explore-day`, `-med`, `-low`, `explore-night`, `-night-low`, `hearth`, `biome-snow`, `ocean-depth`, `ocean-coast`, `landmark`, `mobile`, `boss-obsidian` — plus the three modal states `inventory-open`, `achievements-open`, `progression-open`, where `capture.mjs:620` restores `setHudHidden(false)` and `:641` hides the canvas, so the DOM HUD sits on a solid backdrop. **Those three are the cleanest HUD frames in the corpus and the best place to review this batch.** Plus one new PNG.

### Oracle power
Eyeball today (dial 0.56%, tracker 0.60%, minimap 0.07-0.10%). **Gate after Batch 0**: each of these is 35-60% local density in its own 128 px window, which is precisely the regime `diffDensity.js` was written for. On the three canvas-hidden modal frames the local density is higher still.

### Gate
`tests/gates/hud-capture-render-gates.test.jsx` — behavioural, jsdom + `@testing-library/react` (all three components are plain DOM/canvas, so this needs no source ratchet):
- Under `enterCaptureMode()`, `<DayPhaseDial/>` renders a non-null element whose orbit transform equals `dayPhase(gameTimeForTimeOfDay(0.5), true).markerAngleDeg` — i.e. the *declared* pose, not the mount-time dawn pose.
- Under capture, `<ObjectiveTracker/>` renders and its distance text is not `--` after one rAF flush; assert the `-Infinity` sentinel behaviourally by pinning `captureNow()`-adjacent state to 0 and checking the shrine label still appears.
- `<RadialMinimap/>` under capture: assert `getContext('2d')` received a `fillRect` — mock the canvas context and count calls. This is the assertion that actually fires on the half-landed fix.
- The world-frame guard: with `showControls` **unset**, `<ControlsSheet/>` under capture renders `null`; with the opt set, it renders `CombatInstructions`. Both directions, or the opt is decoration.

### Mutation
Restore each guard in its original shape one at a time — `return null` for 2.1/2.2, `return undefined` for 2.3 — each must turn its own assertion red *and no other*. Then the shape mutation that matters: change `{ t: -Infinity }` back to `{ t: 0 }`. If the tracker gate stays green, it is asserting presence rather than the first-tick branch, and it will not catch the regression that silently swaps the depicted objective.

---

## Batch 3 — hearth brazier, shrine beacon, and the arch-beacon bug

### Sites
- `src/world/Terrain.jsx:372` — delete the `{!isCaptureMode() && (...)}` wrapper so the brazier `<Emissive size={0.34} color="#FF7A1A" intensity={2.8}/>` and its `<pointLight intensity={1.6} distance={9}/>` render unconditionally.
- `src/world/Terrain.jsx:400` — delete the wrapper on the shrine's `<Emissive size={2.6} color="#F5D76E" intensity={5.0}/>`.
- **`src/world/Terrain.jsx:410-411` — a live bug, not a conversion.** The beacon is a `2.0³` opaque box at `[0, top, 0]`; the lintel `<Cube>` at `:410` is at the **identical centre** with half-extents (6.1, 1.2, 1.1). The beacon is strictly smaller on all three axes → fully enclosed, occluded from every direction, and `<Bloom>` (`GameScene.jsx:288`) is a global screen-space pass so an object writing no fragment contributes no glow. **The S8d "faint beacon from POV" fix has never had a visible effect, in capture or in real play.** Fix the geometry first (raise to `[0, top + 2.4, 0]` or shrink the lintel), verify visibility in a throwaway capture, *then* delete the guard. Deleting the guard alone yields a byte-identical `landmark.png` under a Baseline-Review trailer that says "beacon reviewed" about an object that has never been on screen.
- `src/world/Terrain.jsx:441` — dead-branch cleanup only. `blightHeartSite()` = `{725, 725}` → chunk (45,45); the most distant capture pose is `[85,62,-40]` → chunk (5,-3) with `renderDistance 4`, so `BlightHeartRender` never mounts. Delete the branch, **change no baseline, claim no review credit, and do not bundle it into the trailer for the other two.**

No clock or RNG substitution belongs anywhere in this batch. `Emissive` (`src/render/mascots/voxelKit.jsx:28-39`) is a static mesh with a fixed material; the shrine's placement is the pure `imul` hash in `world/landmarks.js`.

### Frames moved (2)
`hearth.png` (brazier) and `landmark.png` (shrine beacon — verified in frame: chunk (2,−7) hashes to `landmarkTypeAt === 0`, `surfaceBlockAt(40,−104)` = surfaceY 45, and the beacon projects to px (709,188) behind the arch). The brazier's ember projects to (695,760) in `explore-day` — **inside the hotbar rect**, HUD-occluded — so the explore frames do not move. Verify that empirically rather than assuming; the `distance=9` pointLight falloff is the uncertain term.

### Oracle power
Eyeball, and only just. The brazier ember is ~5.6 px at the hearth pose (31.8 units out, 16.4 px/unit); the shrine beacon is ~17×17 px plus bloom spill = 0.03-0.35% of frame. **Do not sell this as regression coverage** — a total deletion of either beacon also passes green. Sell it as: two cards whose entire subject is a lit landmark stop depicting it unlit. That is honest art direction, and it reverses a deliberate studio-card decision documented at `Terrain.jsx:352-354`, so it needs Kevin's assent rather than an engineer's.

### Gate
`tests/gates/landmark-beacon-gates.test.js`:
- Source-shape: `Terrain.jsx` has no `isCaptureMode` on the `HomeAnchorRender` / shrine / arch `Emissive` elements.
- **The geometry gate, which is the batch's real content**: a pure assertion that the arch beacon's AABB is not contained in the lintel's AABB — `emissiveHalf = size/2` at `[0, top, 0]` vs `lintelHalf = [legX + 1.1, 1.2, 1.1]` at `[0, top, 0]`. Extract the two literals into named constants so the test can import them rather than re-typing them.

### Mutation
Move the arch beacon back to `[0, top, 0]` → the containment gate must go red. If it stays green, it is comparing numbers it also authored. Re-add `{!isCaptureMode() && ...}` on `:372` → the source gate red.

---

## Batch 4 — degenerate-sample cleanups

These four change little or nothing, but each replaces a genuinely **degenerate** sample or an ungated RNG read. Bill them as code correctness, never as gate coverage.

**4.1 `src/render/spellVfx.jsx:174`** — the only clock-adjacent conversion that survives on merit. The `rotation.x/y/z += m.shapeSpin[...]` accumulation is skipped entirely, so rotation is pinned at the **mount-time 0** and every `ENERGY_PROFILE` tumble rate is completely ungated. Replace with an absolute assignment: `const k = captureFrameIndex(); meshRef.current.rotation.set(k*m.shapeSpin[0], k*m.shapeSpin[1], k*m.shapeSpin[2])` under capture, keeping the accumulator outside. **Correct the claim while you land it:** `spellMotion.js` gives ice `motion:'static'` and lightning `motion:'strobe'`, both `shapeSpin === null` — only fire (`roil`) and arcane (`orbit`) move. Expect a small silent drift in `spell-cast.png` and `spell-arcane.png` (~0.15%), *not* zero churn: `k` is pinned at 90, not 0.

**4.2 `src/render/Ocean.jsx:70`** — drop the `isCaptureMode() ||` short-circuit. Executed against the real predicate at the real camera XZ: `ocean-depth` (−100,20) → TRUE (surfaceY 29), `ocean-coast` (−60,40) → TRUE (42); every inland pose → FALSE with the plane buried 16-25 m. **Net delta ≈ 0 px across all 31 frames**, so the value is purely a latent gate: a future false-negative in `oceanVisibleNear` would blank the sea in the two ocean frames and nothing catches it today. Verify the inland diff is *empirically* zero — at low/med tiers terrain culls to 4-5 chunks while the plane spans 110 m, so an exposed teal horizon sliver is possible.

**4.3 `src/systems/SpawnerSystem.jsx:74`** — `moveTimer: Math.random() * 3` is an **ungated RNG read on a path fixtures reach** (`store.spawnMob` from `mobBestiary` and `spawnCharacterCloseup`). Zero pixels now and under any tick budget the harness can produce, so this is latent-defect insurance only. Recipe: `const rnd = isCaptureMode() ? makeSeededRandom(\`capture-spawn:${type}:${x}:${z}\`) : Math.random;` and `moveTimer: rnd() * 3`. **Key on fixture-declared inputs, not on `nextId.current`** — that ref (`SpawnerSystem.jsx:22`) is never reset, and `enterCapture` purges the *entities* while leaving the counter at whatever the documented boot race left it (0 or 24), so an id-keyed stream re-imports the wall-clock race it was written to remove. Leave `:73`'s dead `rotation` branch and `:45-49` alone (unreachable — every capture-path spawn passes `forceType` and `explicitY`).

**4.4 `src/render/Atmosphere.jsx:172`** — **do not land this batch.** Deleting the `weatherBoost: 0` ternary is provably zero-pixel (single writer `WeatherSystem.jsx:93`, inside an interval whose first statement is the capture guard; store default 0), and its only observable effect is deleting a comment that documents the measured 2026-08-02 incident (`landmark` green, then 6.29%/6.27% on two consecutive runs with zero source changes, because the second run caught a storm). An un-exercised open path plus a deleted warning is strictly worse than the guard. **Land it in the same commit as a declarable-storm fixture, or not at all.**

### Frames moved (2)
`spell-cast.png`, `spell-arcane.png`. Ocean and Spawner: 0 expected — assert it.

### Gate
`tests/gates/spell-spin-gates.test.js` — behavioural over the pure kernel: with the capture clock set to frame 90, the computed rotation for `fire` must equal `[90*0.012, 90*0.02, 90*0.008]` and for `ice`/`lightning` must be untouched (`shapeSpin === null`).
`tests/gates/ocean-visibility-capture-gates.test.js` — `oceanVisibleNear` at each of the seven capture camera XZ must return the enumerated TRUE/FALSE vector, and `Ocean.jsx` source must not contain `isCaptureMode() ||`.
`tests/gates/spawner-seed-gates.test.js` — two `spawnMob` calls with identical `(type,x,z)` in two fresh module states must yield identical `moveTimer`; two different `(x,z)` must differ.

### Mutation
Replace the absolute `rotation.set` with the accumulator under capture → spin gate red. Re-add `isCaptureMode() ||` to `Ocean.jsx:70` → visibility gate red. Key the spawner stream on a module counter instead of `(type,x,z)` and simulate a 24-offset boot → seed gate red. That last one is the mutation that matters; the first two are line-level.

---

## Batch 5 — the hands card (new fixture, 0 existing frames move)

### Sites
`src/devtest/captureMode.js:31` (+`:49`, `:65`) — add `showHands: false` to `_opts`, merge, clear. **And add a store mirror**: `useGameStore` field `captureShowHands`, set by the fixture hook. `src/Components.jsx:1373` — `{(!inCapture || showHandsFromStore) && (`. `src/render/playerRender.jsx` (~`:326`, `:415-426`) — replace the two `state.clock` reads with `frameElapsed(state.clock.elapsedTime)`. New `App.jsx` hook `spawnHandsShowcase`, new `capture.mjs` state `hands-showcase.png`.

**The store mirror is not optional.** `getCaptureOpts()` is a plain module object read during **render**, and `enterCaptureMode` notifies no subscriber — a module read here is exactly the dead-branch shape `hitDir` had for its entire life (documented in `captureMode.js:50-57`). `showTouch` gets away with it because its consumer reads it inside a `useFrame`.

**Use `frameElapsed(...)`, not `captureElapsed()`.** `captureClock.js:156-170` is explicit: `captureElapsed` invents a wall-clock reading outside capture, which is the wrong number for a site that already holds R3F's clock.

### The card is IDLE and BARE-HANDED. Three independent reasons the swing is unreachable:
1. `attackType` is component-local `useState` (`Components.jsx:70`) with no store mirror and no bridge setter; its only writers are `:226`/`:341`, each followed by a **wall-clock** `setTimeout(...,200)` that retires between SwiftShader frames.
2. `attackStartTime` is only ever stamped at `Components.jsx:1325`, **below** the capture early-return at `:548` in the file's only `useFrame`. It stays 0 → `swingElapsed = 0` → slash opacity `Math.sin(0)*0.85 = 0`.
3. `stepCaptureFrames(6)` is overwritten by `shot()`'s absolute pin (§0(c)(1)).

`ProceduralRibbonTrail` is **structurally invisible** under this harness — it needs ≥2 ring points inside `TRAIL_LIFE_SEC` and pushes one point per rendered frame at ~1 fps. Nothing to audit; keep `equipment.weapon` unset and say why.

### Oracle power — borderline
Hands are children of `<primitive object={camera}>`, so the fixture camera **cannot frame them** — only the backdrop. Footprint is fixed by the authored camera-local transforms: right forearm ~2.6%, left forearm ~3.3%, wand + cuffs ~1-2% ⇒ **~6-8% total**. Blanking *both* gloves is a coin flip at the threshold; blanking *one* passes silently; the `HELD_REST` restore bug this file already fixed once is a 0.08-unit shift and passes silently. So: bill it as an eyeball card for the glove/wand render language **plus a mount/crash guard** on a subsystem that appears in ~100% of real play and 0% of the current 31 baselines. Batch 0's local density is what gives it teeth (a forearm is ~40-60% of its own 128 px window).

### Gate
`tests/gates/hands-capture-opt-gates.test.jsx` — with `captureShowHands` false, `<Player/>` renders no `StableMagicHands`; with it true, it does. Both directions. Plus a `frameElapsed` gate: with the clock at frame 90, the aura pulse scale must equal `1 + sin(1.5*ω)*0.02` — a number, not "is defined".

### Mutation
Read the opt from `getCaptureOpts()` in the render body instead of the store → the gate must go red, because the fixture sets the opt *after* mount. If it stays green, the gate is asserting the flag rather than the reactivity, and it will bless a permanently empty card.

---

## Batch 6 — far beacons · **CONDITIONAL, needs a decision before it is scheduled**

### Sites (inseparable)
`src/world/Terrain.jsx:478` (the `useFrame` early return) and `:495` (`return null`). Either alone is provably zero pixels: with the component null the refs never attach; with the refs attached and the loop guarded the meshes stay at their declared `visible={false}`.

### Recipe corrections the survey's version lacks
- **Anchor.** `useGameStore.getState().playerPosition` is the rounded **capture camera** (`PositionTracker.jsx:11-20` × `Components.jsx:548-556`), not the settled player. In `ocean-depth` the beams would radiate from an underwater camera 100 units off spawn — a cue no player ever sees, which is the "build nobody plays" defect in a new shape. Read the settled player transform, or gate the beams behind a fixture opt.
- **Per-shot reset.** `place()` mutates `.visible` and `.position` imperatively and nothing restores the declared resting state, so once a state has shown a beam, a later state where `nearestLandmark` returns null leaves the blight pair **parked at the previous state's coordinates**. Add an explicit reset to the declared state at capture entry.
- **Throttle `nearestLandmark`.** Its own docblock forbids per-frame calls; this `useFrame` makes 1089 hash probes per rendered frame at `maxChunks=16`.

### Frames moved (6) — not the ten claimed
Frustum-audited at the real poses: the **violet blight beam is behind the camera in every capture state** (camera-space z = −84.5 explore, −114.3 landmark), so half the conversion is inert. The cyan beam reaches `explore-day`, `-med`, `-low`, `explore-night`, `-night-low`, `landmark`. It does **not** reach `hearth` (0/16 samples in frame), `biome-snow` (1/16, at the terrain surface, occluded), `mobile` (402×874 halves the horizontal half-FOV to 19.4° against the beam's 19.7° bearing), `ocean-coast` or `ocean-depth` (behind the camera). Its target is also not a shrine: `nearestLandmark(0,0,16)` from spawn is (40,−88) with `landmarkTypeAt === 1` — a **sky-arch**.

### Oracle power — none
Core is ~1.1% (explore) to ~2.3% (landmark); with the 0.10/0.13-opacity halos, ~5-6% — at or under the gate. **Deleting the beams outright moves the same ~5%**, so the gate stays green through exactly the bearing/clamp/visibility/colour regressions this is sold to catch.

### The decision Kevin owes before this is scheduled
In `landmark.png` the cyan pillar is drawn **dead-centre through the arch**, veiling both the arch silhouette and the verified type-0 shrine 16 units behind it — the two subjects that frame exists to gate. And four more additive, `toneMapped:false`, fog-crossing surfaces are exactly the large bright area the repo already blames for pairwise drift (`explore-day` sits at 0.210%). **Options:** (a) accept the veil; (b) gate the beams behind a capture opt and enable it only for the five explore frames; (c) re-frame `landmark.png`'s camera; (d) drop the batch. Recommendation: **(b)**, and if that is rejected, **(d)** — the batch buys a picture, not an oracle, and it degrades the one frame in the corpus with the most silhouette content.

---

## DROPPED — 24 proposals an attack refuted

Each is a finding about the survey, not an omission.

### Refuted because the site changes zero pixels, now or ever
| Site | Reason |
|---|---|
| `src/HUD.jsx:286` (compass rAF reschedule) | Nothing in `updateCompass` reads a clock. Inputs are the hard-pinned `camera.matrixWorld` and the rounded camera mirror — both constant for the whole state, so every tick writes identical `innerHTML`. "Under step-then-shoot the track depicts the declared frame index" is false. Meanwhile the file's own comment records a **measured** ~500 px top-of-frame flicker from sub-pixel re-derivation, and the change would mutate DOM on every frame of `waitForStableFrame`. |
| `src/HUD.jsx:407` (BLIGHT HEART marker) | `blightHeartSite()` = a literal {725,725}, world bearing 135°. All six capture headings are 0° to −47.4°, giving heading-relative diffs of 135-180° against `fov/2 = 90`. Paints in **0 of 31** frames. `world/blightHeart.js`'s own docblock says so. |
| `src/world/Terrain.jsx:441` (Blight monolith beacon) | `BlightHeartRender` mounts only for chunk (45,45); the furthest streamed chunk is ~40 chunks away. Unreachable code. (Retained in Batch 3 as *cleanup only*.) |
| `src/world/Terrain.jsx:411` as written | The beacon is fully enclosed inside its own lintel. Deleting the guard is byte-identical. (Retained in Batch 3 as a **geometry bug fix** instead.) |
| `src/ui/AbilityBar.jsx:65` | `ownedKey` yields exactly `['dodge']` because `abilityCooldowns` is never written under capture (`Components.jsx:950` sits below the `:548` return), so the existing `owned.length <= 1` gate at `:67` nulls it regardless. Slot/Icon are already painted by the hotbar in every HUD frame and by both `primitives-showcase` cards. |
| `src/ui/TargetFrame.jsx:11` | `targetEntity` defaults null and its only writer is below `Components.jsx:548`; the `!target` guard on the same line already nulls it. A fixture pins one of three colour thresholds; the nameplate is 0.94% of frame. |
| `src/ui/AspectHintToast.jsx:21` | Zero pixels today; the auto-cleared fixture is impossible (phase re-pinned to 90 before the shutter, and `capture.mjs:791` fails the run at any other phase); the shown state needs a new PNG for a 1.4% subject. |
| `src/ui/primitives/Modal.jsx:21` | Target is `tabIndex={-1}` with no focus styling; a programmatic `.focus()` from `<body>` does not match `:focus-visible`; `grep` of `index.css`/`App.css` finds only `outline: none` and three `.bf-slider:focus-visible` rules. The file's own comment states the conclusion. Budgets a full re-capture to confirm nothing changed. |
| `src/systems/SpawnerSystem.jsx:127` | Zero pixels **and positively harmful**: `captureNow()` is constant 1500 while `enterCapture` rewinds to 0 eight times, so `now - lastSpawnCheck >= 1000` latches permanently false and disables the 100 u distance cull at `:186-196` — the only mechanism removing stale fixture entities between states. `capture.mjs`'s own comment records that leak class ("the leftover boss leaked a stray cube into this frame's bottom edge"). |
| `src/render/MobModel.jsx:222` | `time` feeds only `Math.sin(time)*0.6` and the leg-IK block, both behind `speed > 0.05`; mob movement is frozen, so `swing = 0` regardless. Belongs to the AI partition's change, not its own. |

### Refuted because the sample is already NON-DEGENERATE — the parameters are gated at t≠0
The proposal in each case re-samples a pure function at a different constant, buying nothing and costing a silent or massive re-baseline. `CAPTURE_PHASE_FRAMES` freezes at the shutter precisely so `waitForStableFrame` can see two identical frames, so *no* motion is ever depicted either way.

| Site | Reason |
|---|---|
| `src/render/Ocean.jsx:73` | `CAPTURE_TIME = 4.0`, not 0. Amplitude, wavelength, dispersion, crest sharpening, recomputed normals and both foam terms are already asserted at t=4.0. Cost is maximal: whitecap water fills ~35-40% of `ocean-coast`, and +1.5 s moves every crest ~10 m — a 25-35% forced re-baseline on the two most complex frames, indistinguishable by a human from a real wave-math regression. |
| `src/render/LightMotes.jsx:183` | `uTime` frozen at 11.0; rise, sway, the `mod()` wrap and the twinkle are all pure in it. Marginal coverage zero, and the "frame 0 is byte-identical" premise is false — the shot is at frame 90, so ~12 world frames drift 0.2-0.7% silently. |
| `src/render/spellVfx.jsx:164` | `capturePhase` is 0.65/0.30/1.10/0.50. Arcane `orbit` ignores `phase` entirely; lightning `strobeGate` returns g=1 at **both** 1.10 and 40.1; ice `static` wiggles ±2.5% scale; only fire `roil` moves, ≤±12% on a ~40 px core. |
| `src/render/pickupVfx.jsx:70` | Gems are ~18×18 px (~1.3 k px total); the bright rarity aura is nested under `meshRef` and rotation-invariant; the octahedron has 4-fold vertical symmetry so 2.7 rad ≈ 65° effective. `rotation.x` becomes 1.6°. |
| `src/render/BeastAvatar.jsx:66` | At the pinned 1.5 s, `MORPH_SEC = 0.55` and `BURST_SEC = 0.18` are both long expired and `cp` clamps to 1 — byte-identical to the forced values. Only the core pulse changes (1.08 → 0.922, ~0.2-0.5%). The burst/entrance beats need a per-state phase the harness forbids. |
| `src/world/GPUSparkSystem.jsx:226` | The conversion is the **identity map**: `captureElapsed()` = 1.5 both when `aStartTime` is stamped and when the uniform is read, so `t ≡ 0.30` — today's exact phase. And measured on `spell-cast.png`, the spray is 491 px (0.048%); the entire VFX ensemble is 6,552 px (0.640%). `uTime = 0` is already a declared constant, not a frozen pose. |
| `src/render/WeatherSystem.jsx:198` and `:299` | With the storm forced clear both precip branches are `scale(0,0,0)`, so fireflies are the whole delta — `sphereGeometry(0.1)` × `pulse*0.22` = ≤2.2 cm radius, 25-35 m from the camera at 18.6 px/m ⇒ **under one pixel each**, 30 of them, ~30 px total = 0.003%. The `:198` recipe additionally proposed six seeded respawn streams whose *consumption count* is run-dependent, and a `probeFrame` stride keyed to a rendered-frame counter. |
| `src/render/captureGlow.jsx:26` | Forge fire and lantern are `size 0.4`/`0.5` cubes ~35 m out ⇒ 6-7 px each, ~1 k px with bloom = 0.1%. `hearth.png` already carries ~15 warm bokeh dots of the same apparent size. Deleting `captureGlow.jsx` also deletes the only written record of why a render-body `{!isCaptureMode() && ...}` is wrong, and breaks `hub-render-gates.test.js:33` plus all of `capture-glow-gates.test.jsx`. |

### Refuted because the recipe is not deterministic
| Site | Reason |
|---|---|
| `src/systems/AIWorkerSystem.jsx:175` | `tickAccumRef.current += CAPTURE_DT` advances **per rendered frame** — the exact quantity `captureClock.js:76-78` measured diverging run-to-run. `waitForStableFrame` *certifies* the divergence: `MobModel.jsx:97` snaps the group to `entity.position`, so 3 of 4 frames are identical between ticks and different runs exit at different tick counts, both reporting "settled". Plus: `now = captureNow()` is a constant 1500 while the world moves, so `attackPhase` can never leave windup; `MobModel.jsx:222` pins `time = 0` so the walk cycle cannot render at all; the async worker round-trip has no barrier. And the budget: all six `mob-bestiary` mobs are 18,200 px (1.78%), so **total deletion of the behaviour tree stays green afterwards too**. |
| `src/EnhancedMagicSystem.jsx:286` | `delta = 0` is what *holds* the declared tableau written by `spawnDeterministicCast` (`:239-277`), which is a reset-to-declared-value, not a freeze. As written the delta is identically 0 (the clock is frozen and `spawnSpellCast` never routes through the resetting hook), so it is byte-identical. If forced to land, the 1.5 s phase **prunes** the 180 ms telegraph and the 360 ms ring out of state and carries the fireball from x≈119 to x≈157 against a view spanning [104.6, 135.4] — four near-blank cards, strictly less coverage. |
| `src/HUD.jsx:214`/`:383`, `src/ui/RadialMinimap.jsx:19` — *the `captureNow()` steps only* | Frozen-throttle latch (§0(c)(2)). Computed consequence: `biome-snow` and `landmark` — the only two frames that render a shrine marker — would draw `explore-day`'s shrine and distance. A false claim baked into the oracle, strictly worse than the suppression. **The sites themselves are converted in Batch 2 with `performance.now()` retained.** |

### Refuted as already shipped
| Site | Reason |
|---|---|
| `src/OptimizedGrassSystem.jsx:159` | Converted at HEAD in `ccebde0`. Line 165 already reads `shader.uniforms.time.value = frameElapsed(state.clock.elapsedTime);`; line 6 imports `frameElapsed`; lines 156-164 are the conversion's own commit comment, and line 159 is a *sentence of that comment*. `grep isCaptureMode` on the file returns nothing. The proposed inline ternary would also be a downgrade — it re-inlines the pattern `frameElapsed` was created to centralise. |

### Refuted on value but retained in a reshaped form
`src/HUD.jsx:78`/`:93` (dial: 0.56%, and `:78` alone is ~200 px) → retained in Batch 2 as a *reactive-subscription simplification* that removes the interval entirely, not as gate coverage. `src/HUD.jsx:189` (13.6% occlusion of eleven world frames, buries the dial and the settings gear) → retained **opt-gated to the new card only**. `src/HUD.jsx:364` (pct exactly 50.0 in 7 of 8 frames — a `bearingToMarker` sign flip maps 50→50, so the headline claim survives the conversion; and it lands on the reticle) and `:407` (zero frames) → retained **conditionally**, only if the new card's declared heading makes them non-degenerate. `src/render/BossEntity.jsx:193` → **deferred**: `boss-obsidian.png` contains no dragon (it is `setDangerLevel(2)` on the explore camera, captured ~40 lines before `spawnBossCloseup`), so only `boss-closeup` is touched, at 2-3% — half the threshold, with a 1 px hover bob. Worth landing only if that camera is tightened onto the wings.

---

## What remains suppressed after the whole plan lands — and why that is correct

The residue is roughly 100 of the 130 behavioural sites. It partitions into four classes, three of which are **finished**, not unfinished.

**Class 1 — genuinely external inputs, unrecoverable by any clock or RNG.**
`GameScene.jsx:242` (`<Physics paused>` — rapier colliders stream from an async worker, so the collider *set* at frame N varies per run; a fixed timestep cannot fix a varying world, and this is the measured 53.2/61.2/50.2 settle spread). `GameScene.jsx:176` (`PerformanceMonitor` reads real fps and would ratchet the pinned `high` tier away under SwiftShader's ~1 fps). `GameScene.jsx:212` (`AdaptiveDpr` would change the PNG's **dimensions**, making the comparison ill-defined). `App.jsx:896` (`matchMedia` reads the capture box's OS reduced-motion setting — a baseline that cannot be shared). `App.jsx:134` (pointer lock: a *successful* lock destroys the `menu` fixture). `App.jsx:112`, `QuestSystem.jsx:263/708/750/793`, `WeatherSystem.jsx:83`, `SpawnerSystem.jsx:93/145` (wall-clock `setInterval`/`setTimeout` — `captureClock` substitutes *reads* of time, not the browser's timer queue; the firing count against a ~1 fps renderer is a per-process race, and `SpawnerSystem`'s bodies additionally gate on async chunk membership so even fully seeded the *population size* is run-dependent). `Nametags.jsx:86` (troika SDF glyph rasterisation is asynchronous and outside the frame clock). `ui/primitives/StatBar.jsx:21` (a CSS transition runs on the **compositor** clock, which `captureClock` cannot reach from JS at all — and this is what keeps every StatBar-derived HUD bar deterministic).

**Class 2 — side effects with no pixel.**
All audio (`MusicPlayer.jsx:26/37`, `WeatherSystem.jsx:98`, `AIWorkerSystem.jsx:96`, the `ElementZoneSystem` fanout). All persistence (`App.jsx:215/222`, `store/useGameStore.jsx:1121`, `game/settingsPersist.js:82/97`) — writing a real world slot or a dial into the developer's `localStorage` during a capture run. Transient wall-clock-expiring toasts (`denyToast.js:13`, `DuskWarning.jsx:26`, `CombatLog.jsx:23`). `deathVfx.jsx:46` (a pool removal, not a pixel). `GameScene.jsx:298` (`<Noise>` — a uniform 1% overlay that would make every pixel of every frame differ, consuming the whole 6% budget, and a per-pixel `hash(uv+time)` is the classic amplifier of float-precision divergence across renderer versions).

**Class 3 — declared constants that are already non-degenerate samples.**
`Ocean.jsx:73` (t=4.0), `LightMotes.jsx:183` (uTime=11.0), `spellVfx.jsx:164` (capturePhase 0.30-1.10), `GPUSparkSystem.jsx:226` (t=+0.30 s of spark life), `EnhancedMagicSystem.jsx:286` (delta=0 holding a hand-authored tableau), `BeastAvatar.jsx:66` (the settled end state), `Atmosphere.jsx:173` / `BloomSpikeDriver.jsx:34` / `pickupVfx.jsx:23`/`:139` / `MobModel.jsx:97` / the three `TitleDiorama` resets / both mascot resets. **These are the shape the whole initiative is arguing for.** Every parameter in each of them already moves the frame if it changes; re-sampling at 1.5 s asserts the same parameters at a different constant. This class is not a backlog — it is the finished state, and the survey's instruction to recognise the six recently-fixed sites generalises to all twenty-nine of them.

**Class 4 — the only genuine residue: motion whose subject is below the oracle's resolution.**
Mob AI (`AIWorkerSystem.jsx:175` + the two spawners), the boss wing-beat (`BossEntity.jsx:193`), the FPV swing (`Components.jsx:1373`'s motion half), the spell VFX lifetimes. Every one is arithmetically invisible: the boss wings sweep 2-3% of frame, six mobs are 1.78%, the zombie is 4.95% *and travels straight at the lens*, the whole spell ensemble is 0.64%. Converting them today would trade a stable green gate for a flakier one **and the gate would still not be able to fail** — deleting the behaviour tree would remain green afterwards, which is the survey's own headline complaint, unfixed.

That is the honest closing statement of this plan: **the remaining suppression is not blocked on the clock primitive. It is blocked on the oracle.** The clock and the seeded RNG are sufficient for every conversion that is worth making at a 6% whole-frame threshold, and Batch 1 is the only one of those that the threshold can see. Batch 0 is what changes that arithmetic — and it is the reason Batches 2-5, which are eyeball-only today, are worth landing at all rather than being deferred indefinitely. If Batch 0's local-density assertion is ever armed (τ ≈ 0.10 at N=128, per `diffDensity.js`'s own measurement), Class 4 becomes reachable and this plan should be re-opened. Until then, Class 4 is correctly suppressed for the same reason Class 1 is: its determinism can be bought, but its *observability* cannot.

---

## Commit protocol (applies to every batch)

`tests/gates/baseline-trailer-gates.test.js` enforces two commits per batch, in order:

1. **`feat(capture): <batch> — src + gates.`** Touches `frontend/src/**` and `frontend/tests/gates/**`. No `frontend/tests/visual/baseline/**`. Gates must be RED at the parent commit and GREEN at this one; the mutation must be run and its red recorded in the message.
2. **`Baseline-Review: <what moved, and that you opened them>`** Touches `frontend/tests/visual/baseline/**` **only**. Bundling a baseline rewrite with the src change that caused it is what the gate exists to block, and it is what 10 of the last 12 baseline commits did.

Between them: one `npm run visual:capture` (~12 min) plus `npm run visual:diff`. For sub-threshold batches, open `tests/visual/diff/index.html` — which only exists once Batch 0 lands. **Do not re-baseline a batch whose contact sheet you have not opened.**