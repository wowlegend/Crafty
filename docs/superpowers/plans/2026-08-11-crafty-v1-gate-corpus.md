<!-- PROVENANCE: produced by a 25-agent workflow on 2026-08-11 — 8 classifiers over the 116 ledger
     entries, then two adversarial lenses per partition (reachability + label, the latter attacking in
     BOTH directions so a STRUCTURAL-CORRECT label had to defend itself too), then one synthesiser.
     TREAT EVERY PER-GATE CLAIM AS A HYPOTHESIS UNTIL THE GATE IS OPENED. The corpus-level facts below
     were spot-verified by hand before this was committed (see the header note); the per-file verdicts
     were not, and this repo has already paid for a wrong VACUOUS label once — `survival-quests` was
     4 of 5 legitimate data-driven tests. Verify at the moment of conversion, not now. -->

> **VERIFIED BY HAND before commit, because a plan that opens with a wrong number is worse than no plan:**
> the ledger ghost is REAL (`tests/gates/.source-grep-ledger.json:9` froze `aspect-hint-gate.test.js`;
> the file on disk is `aspect-hint-gate.test.jsx` and contains zero `readFileSync`), the live/frozen set
> difference is EXACTLY that one entry and nothing else, and `gate-shape` printed 115 against a frozen
> `_count` of 116. **That item is already CLOSED** — `scripts/ci/_gate-ratchet.mjs` now compares both
> directions, `gate-shape` fails on a stale entry, and the ledger is re-frozen at 115. The rest of this
> plan is unstarted.

# Crafty — V1 Source-Grep Gate Plan
### Classification (post-attack), Seam-Extraction Batches, and Ratchet Targets
**Scope:** `/Users/kz/Code/Crafty/frontend/tests/gates/` · ratchet `/Users/kz/Code/Crafty/frontend/scripts/ci/gate-shape.mjs` · ledger `/Users/kz/Code/Crafty/frontend/tests/gates/.source-grep-ledger.json`
**Status:** replaces status-doc item V1 and its "~80 never classified". Every one of the 116 ledger entries is now classified with per-test evidence and adversarial review.

---

## 0. Standing rules this plan operates under

These are plan-level and were each learned by an attack refuting a proposal. Violating any one of them produces a gate that goes red at a fix.

**R1 — Never rename a gate file during conversion.** `gate-shape.mjs:207-276` keys the frozen population on the exact path string. A `.test.js` → `.test.jsx` rename mints a *new* ledger member and errors the push ("this population may shrink, never grow"). Use the `// @vitest-environment jsdom` docblock and keep the filename. Precedent already in-tree: `tests/gates/save-slot-ownership-gates.test.js:1`.

**R2 — The repo's own linter cannot see most of this corpus.** `gate-shape.mjs` Check A only inspects positive `toMatch(/…/)` RegExpLiterals in gates that read **exactly one** source file. Every `.includes()`, every `/re/.test()`, every `indexOf` window, and every multi-file concatenation is invisible to it. Prefer forms the linter can see; treat "gate-shape reports clean" as no evidence at all.

**R3 — Never assert over a concatenation of two source files.** Proven live false-greens from this exact pattern: `character-render-gates` t1 (guard found in the *other* file), `perf-config-gates` T2.3 (asserts the opposite of what the guarded file does), `weather-density-gate` t2 (satisfied by `GameScene.jsx` alone), `npc-spawn-gates` t2 (`isStatic` matched in the distance-cull, not the AI tick), `trauma-wired-gates` t4 (`SimplifiedNPCSystem.jsx` contributes zero matches to a test named after it).

**R4 — Every retained source test needs a denominator and both window indices guarded.** `loot-juice-gates` guards `collectStart` and not the end index; a reworded `ecs.remove(entity);` silently expands the "branch" to the rest of two files while still reporting PASS.

**R5 — Positive control before negative control** in every capture test. "Did not render under capture" and "the instrument is dead" are indistinguishable without it. House pattern: `tests/gates/capture-guard-timing-gates.test.jsx:52,92,137`.

**R6 — There are TWO capture flags.** `useGameStore.getState().isCaptureMode` (written only by `setCaptureMode`, `useGameStore.jsx:64`) and the module flag in `src/devtest/captureMode.js` (`enterCaptureMode`). `App.jsx:828-829` sets both. `src/world/bossSystem.js:172` reads the **store** flag; ~112 other guards read the **module** flag. Any test or seam must name which.

**R7 — Delete-as-redundant is a first-class outcome.** The ratchet is designed to fall. Four gates in this plan are strictly weaker text shadows of behavioural tests that already exist and already pass.

**R8 — Reject any seam whose signature leaves the decision in the caller.** Five proposals died on this: `resolveHurlImpact`, `resolvePlayEntry`, `shouldAutosave`, `applyBusGain`, `bridgeRewardSounds`. Test: if the extracted function's headline assertion reduces to `x === x`, it is not a seam.

**R9 — Keep a call-site anchor unless the caller is itself mountable.** After extraction nothing forces the caller to consult the new module. The repo has four same-day instances of "shipped but never called" on record (`fddf7d4`, `8a5e008`, `34f11b0`, `869f71e`).

---

## 1. Final tally

**115 real source-grep gate files. 116 ledger entries. One ghost.**

| Category | Count | Δ from first pass |
|---|---:|---:|
| MIXED | **82** | +12 |
| VACUOUS | **20** | −4 |
| STRUCTURAL-CORRECT | **8** | −3 |
| BRITTLE | **5** | −6 |
| *(not a gate — ledger ghost)* | *1* | *+1* |
| **Total ledger entries** | **116** | |

**The headline is MIXED at 82 (71%).** The per-file label is nearly always the wrong unit of work: almost every file in this corpus pairs a real invariant with a proxy. The first pass's `~31 STRUCTURAL-legit` was an over-count of whole files and a massive under-count of structural *tests*.

### 1.1 The ghost (bookkeeping, do first)
`tests/gates/.source-grep-ledger.json:9` lists `tests/gates/aspect-hint-gate.test.js`. The file on disk is `aspect-hint-gate.test.jsx`, it contains **no `readFileSync`**, and `node scripts/ci/gate-shape.mjs` prints *"115 source-grep gates (ratchet holding)"* against a frozen `_count: 116`. The ratchet is currently holding against a number that corresponds to no file. **Run `node scripts/ci/gate-shape.mjs --write`.** Filing this file under any of the four categories would re-admit a fully-converted gate to the population it already escaped — that is why it is listed as "not a gate", not as STRUCTURAL-CORRECT.

### 1.2 Adjudications where the lenses disagreed

| Gate | Classifier | Verdict taken | Why |
|---|---|---|---|
| `beast-noremesh-gates.test.js` | STRUCTURAL-CORRECT | **VACUOUS** | `src/game/beasts.js` has zero imports (verified) — the `setWorldBlocks\|terrain.worker\|postMessage` forbid is unfalsifiable where it is pointed, and the transform path it names lives in `Components.jsx`, which the gate never reads. Delete the feature → green. Re-mesh the real transform → green. "It reads a file" is not what makes a gate structural; `zero-emoji` and `no-raw-hex` earn the label by **reach**. |
| `mob-los-sync-gates.test.js` | STRUCTURAL-CORRECT | **MIXED** | The unimportable-Worker premise was disproved by execution (§2 Batch 0). The file's own subject, `ai.worker.js:3-17`, says the premise "was false". Tests 1-2 are behavioural; test 3 is a source proxy for something now reachable — and its regexes do not enforce their own invariant (a mirror named `losLocal` passes both). |
| `biome-foliage-gates.test.js` | VACUOUS | **MIXED** | Tests 1-2 are a confirmed substring lottery, but test 3 (`world/foliage.js` no `Math.random`) is the same whole-module determinism prohibition the same reviewer credited as legitimate in `biome-ambience-gates`. A file-level VACUOUS label destroys it. |
| `biome-flora-gates.test.js` | BRITTLE | **MIXED** | Both brittleness vectors reproduced — but gutting the taiga branch leaves all four assertions green. Re-anchor it perfectly and the real regression is *still* green. BRITTLE's remedy (re-anchoring) does not close it; only extraction does, and shipping it as BRITTLE would produce exactly the wrong fix. |
| `error-boundary`, `locomotion-audio`, `nametags`, `mob-aggro-audio` | VACUOUS | **MIXED** | Each contains a test that reds when the feature is deleted (`nametags` t4 pins three assignments unique in the file; `locomotion-audio` t4 is a `Math.random` sweep; `mob-aggro-audio` A1/A2 are the file's only occurrences). Rule 2 of the brief applied literally. |
| `boss-melee-spark`, `combat-keybind`, `inventory-flat-bucket`, `kill-attribution`, `terrain-quest-callback` | BRITTLE | **MIXED** | In every case the classifier's own per-test evidence names one VACUOUS test beside the brittle ones. A file with both is MIXED by definition, and the two halves need different fixes. |
| `blight-marker-gates.test.js` | `survivesDeletion=true` | **false** | Mutation run: deleting the marker block reds t2 *and* t3. It is the opposite class — it reds at an **edit** (a reworded `// 3. Render Chest` comment). Category MIXED survives; the triage flag does not. |
| `ally-eyes-gate.test.js` | `survivesDeletion=true` | **false as written** | `/!entity\.isAlly/` has exactly one match in `MobModel.jsx` (:276); deleting the conjunct reds it today. VACUOUS still stands, for the better reason: the assertion is load-bearing only by an unenforced uniqueness accident that dies the moment the file grows a second ally-aware branch. |
| `npc-routine-gates.test.js` | `survivesDeletion=true` | **partial** | `/isDay/` occurs only inside the ambient block, so full deletion reds t3. Per-test VACUOUS holds (hardcode the night branch and it stays green). |

---

## 2. Conversion work list — ranked, batched by shared seam

Ranked by (gates retired × defect class closed) ÷ effort.

---

### **Batch 0 — The Worker Harness. Both workers are importable. This is the single largest finding.**
**Retires or rewrites 9 gates. Do this first; three later batches depend on it.**

Both `ai.worker.js` and `terrain.worker.js` import cleanly under `environment: 'node'` when `globalThis.self` is stubbed, and both can be driven through their real message protocols. This was proven by execution — a probe test passed inside vitest in 708ms. The "a classic Worker cannot import, so comparing source is the only tool" premise is **stale**, and `src/workers/ai.worker.js:1-24` already says so in its own header after a differential fuzz found 21,655 behavioural mismatches out of 200,000 grids with all four sync gates green.

**New file:** `frontend/tests/helpers/workerHarness.js` (a test harness, not a src seam)

```js
export function loadTerrainWorker({ seed = 12345 } = {}) -> {
  post(type, payload),            // drives self.onmessage
  generate(cx, cz),               // returns the chunk_mesh payload
  probeBlock(cx, cz, x, y, z),    // update_block round-trip -> block_broken payload
  messages,                       // every postMessage, in order
}
export function loadAiWorker() -> { tick(payload), messages }
```

**Behavioural assertions that replace the greps**

| Gate | Replaced grep | New assertion | Mutation that proves it |
|---|---|---|---|
| `heightat-single-source.test.js` t1-t2 | `toContain('40 + n * 18')`, `toContain('computeHeight')` | `tests/world/workerHeightParity.test.js`: for 16 far-from-origin columns, `workerGroundY === climate.surfaceBlockAt(wx,wz).surfaceY` **and** the block code matches (verified: (328,216) → y45/b5 both sides) | restore the stale `30 + n*40` in `climate.js` → red. This is the exact historical bug, asserted as a value. |
| `m1-bugfix-gates.test.js` t1 | `'10:'…'13:'` within 900 chars of `const BLOCK_COLORS` | break an ore voxel through the real worker; `payload.color !== '#ffffff'` for every ore code (verified coal `#2f2f2f`, iron `#d8af93`, gold `#fcee4b`) | re-introduce `10: [1,1,1]` → red. Today: **green**. |
| `ocean-coastline-gates.test.js` t3 | `/y <= SEA_LEVEL/` (a *condition*, not an effect) | probe (cx −40, cz −24) at y=28 → `blockType: 9` | change `blocks[index] = 9` to `= 0` → red. Today: **green**, and the gate's whole subject is the water fill. |
| `ocean-coastline-gates.test.js` t2 | import-specifier grep | `vi.mock('src/world/oceanProfile.js')` wrapping the real `oceanSurfaceY` with a spy; one `generate`; assert the spy fired | leave the import, stop calling it → red. A dangling import passes the grep. |
| `home-anchor-gates.test.js` t6 | two `indexOf` positions | `load_modifications([[0,0,getIndex(8,51,8),0]])` then `generate` → probe returns **air** (verified; without the mod it returns block 1) | swap the stamp/replay order → red. |
| `mob-los-sync-gates.test.js` t3 | import specifier + `not.toMatch(/function\s+hasLineOfSight\s*\(/)` | `vi.mock('src/game/mobLineOfSight.js')` with a spy; post one cover-seeking TICK; assert 79 calls with the real 81-cell grid and `isCoverSeeking:true` in the result | re-grow a mirror as `function losLocal(...)` and call it → red. Today both current assertions pass. |
| `archer-kite-steer-gates.test.js` | region between two **comment** strings | drive the tick: archer at (10,10), player at (12,10), flat 81-cell grid → emitted `targetX` is **west**; chaser at the same geometry moves toward (the denominator) | wire the steer goal from `playerX` → red. |
| `attack-telegraph-gates.test.js` slice 1 | `toMatch(/pendingAttack = \{ id, type: 'melee', damage, position: \[x, y, z\] \}/)` | `expect(aiTick(meleeScenario).attacks[0]).toMatchObject({ id: 7, type:'melee', position:[x,y,z] })` — property shape, not spelling; plus tick@0 emits none, tick@380 emits one | reorder the object literal → today red (a false red), after → green. Defer the strike → red both. |
| `grass-revival-gates.test.js` d1 | `toMatch(/const topCodes = new Uint8Array/)` (one match satisfies, two sites exist) | see Batch 6 — the harness proves the **effect**; the call-count stays structural | |

**Caveat carried forward:** after any of these extractions, "does `update_block` still *call* the shared helper" is a call-**count** question with no behavioural form. Keep it as a structural assertion (§3).

---

### **Batch 1 — jsdom render harness. No new src modules. Retires the most gates for the least code.**
**Touches 21 gates; retires 12 outright.**

The single largest category of vacuity in this corpus is *vacuity by pure omission*: a plain DOM React component with no R3F, greped because the gate author reached for `readFileSync` by habit. `@testing-library/react` is already a devDependency and ~28 gates in this directory already run under jsdom.

**New file:** `frontend/tests/helpers/renderPanel.jsx`

```js
export function seedStore(patch)                 // useGameStore.setState + reset in afterEach
export function withTouch(on)                    // vi.mock('src/input/touchDevice')
export function withCapture(on)                  // enterCaptureMode / setCaptureMode — names which flag
export function renderPanel(el, { store } = {})  // render + act-flush + jsdom cleanup
```

| Gate | Action | Behavioural replacement | Mutation |
|---|---|---|---|
| `allocate-ui-gates.test.js` | **DELETE** | none needed — `tests/integration/inventory-attributes.test.jsx` already renders the real `Inventory`, clicks `alloc-strength`, and asserts `strength===11 && attributePoints===2`, including the zero-points affordance | stub `allocateAttribute: () => ({})` → integration test reds 3 assertions, gate stays green. That asymmetry *is* the case for deletion. |
| `combat-log-gates.test.js` | rewrite (keep filename, add pragma) | render `<CombatLog notifications={mk(20)}/>` → exactly 8 rows **and they are the last 8 in order**; touch mode → 4; capture → `container.firstChild === null`; unknown `n.type` → `sparkles` + `text-text-muted` fallback | gut the capture guard **and** change `slice(-(…))` to `slice(-1)` simultaneously → all four current assertions stay green. Verified. |
| `ability-bar-gates.test.js` | rewrite the AbilityBar half | seed `abilityCooldowns`, render, assert the sweep div's `style.background` carries the right **fraction**, `opacity==='0'` when ready, `null` when only dodge is owned, re-render on Aspect unlock (the memo bug the component's own comment records) | dead-code the mirror write (`if (false) …setAbilityCooldowns`) → all three current assertions green (`buildCooldownMirror` from the import at `Components.jsx:14`) |
| `aspect-trees-gates.test.js` | delete t1, keep t2 verbatim | fold into `tests/integration/spell-upgrade-talents.test.jsx`: rendered branch headings `toEqual(ASPECT_TREES.map(t => t.aspect))`, derived from the module | inline a hard-coded array under **any** spelling → red. The current `not.toMatch(/const\s+branches\s*=\s*\[/)` bans one identifier: `let branches`, `const BRANCHES`, `const branchList` all walk past. |
| `quest-log-gates.test.js` | rewrite t1 only | render `<QuestLog quests={[…]}/>` → `getByText('Old Pike the Warden')`, the lore string, and the `2 / 5` readout | delete the giver/lore JSX → red. Today `/Modal/`, `/lore/` and `/giver/` are **all three** satisfied by one comment at `QuestLog.jsx:6`. |
| `spell-mastery-ui-gates.test.js` | rewrite | render `<SpellUpgradePanel/>`; four rows; below `requiredLevelForUpgrade(next)` → lock affordance, no button; at/above → click calls `upgradeSpell('fireball')`; `spellLevels.fireball = 99` still renders (the clamp at :186) | **⚠ scope the query.** `getByRole('button', {name:/upgrade/i})` is ambiguous — talent nodes render literal `Upgrade` at :164 and `t('ui.upgrade')` resolves to the byte-identical `'Upgrade'`. Use `within(row)` or add a testid, or the test clicks a talent button and greens over an unwired `upgradeSpell`. |
| `modal-static-gates.test.js` | rewrite 9 of 10 | per panel: `getByRole('dialog')` + `aria-modal` + non-empty `aria-label`; `getByTestId('inventory-modal')`; `d.className` contains `overflow-y-auto` for the two capture-scrolled panels. Verified working: `<CreditsScreen onClose={()=>{}}/>` returns a dialog with `aria-label='Credits'` | the tightest current window is the **Chest** at 183/200 chars — 17 characters of headroom. One className token reds it with the a11y contract intact. |
| `coin-sink-gates.test.js` | rewrite describe 2, keep describe 1 | click a coin trade with sufficient coins → `useGameStore.getState().coins` decrements | describe 1 is real store behaviour against `spendCoins` — **do not touch** |
| `target-frame-gates.test.js` | rewrite | `<TargetFrame/>`: no target → nothing; health 50/100 → bar width `'50%'` and readout `50/100`; `isAlly` → `#3DFFB0`; capture + live target → still nothing | `TargetFrame.jsx` is 26 lines with zero R3F. The throttle claim in t2's *name* has no seam — say so; do not invent one. |
| `hud-declutter-gates.test.js` | extract `ControlsSheet` → `src/ui/ControlsSheet.jsx`, then render | **⚠ the mount effect turns it ON.** Correct sequence: render → assert present → `advanceTimersByTime(8000)` → absent → `setShowControls(true)` → present. Plus `isCaptureMode()` suppresses the auto-show (`HUD.jsx:189`) — currently unguarded | t1's `/showControls.*CombatInstructions|CombatInstructions.*showControls/s` spans from the import at :11 to any token 176 lines later. It asserts co-occurrence, never a relationship. |
| `victory-audio-gate.test.js` t4 | rewrite | `window.playVictory = vi.fn(); render(<VictoryOverlay onDismiss={()=>{}}/>)` → called once; `rerender` → still once (the `[]`-deps once-per-mount property) | delete `GameSystems.jsx:223` → red. Today green, on the comment at :220-221. |
| `ui-sounds-gate.test.js` t3 | rewrite | `it.each(['showInventory','showCrafting','showMagic','showBuildingTools'])` — flip each flag independently, assert `playUIOpen` once, `playUIClose` once on the falling edge, **neither** on an unrelated re-render | drop `showMagic`/`showBuildingTools` from the selector (`UISounds.jsx:12` has four; the regex checks two) → green today. Collapse the edge to an unconditional call → green today. |
| `heartbeat-stable-interval-gates.test.js` | rewrite | `vi.mock` SoundManager returning a **new object identity per call** (the defect condition); health 30→28 (same bucket) adds **zero** calls; 30→10 adds exactly one; above threshold freezes the count | restore `[bucket, playHeartbeat]` in the deps → red. Arithmetic verified against `src/game/lowHealth.js`: bucket 1, period 1.1125s, 3s → exactly 3 beats. |
| `touch-tray-gate.test.js` | rewrite | `typeof getState()[p.action] === 'function'`; the **round trip** `togglePanel(p, getState())` flips `p.show` and flips back; `togglePanel({action:'nope'}, …) === false` | rewrite a setter to take a plain boolean instead of the fn-updater → every substring still matches, the whole touch tray dies. That is the assertion the grep cannot make. |
| `touch-xp-readout.test.jsx` t3 | rewrite | `enterCaptureMode({showTouch:true})` → compact readout present **and** desktop bar absent; then the inverse. Covers both halves; today only one | insert a second condition into the JSX → today red at a correct change |
| `touch-dodge-gates.test.js` | rewrite all three | mock `isTouchDevice`/`isTouchUIMode` → true, `setActive(true)`, render, `pointerDown` on `getByLabelText('Dodge')` → `getInput().dodge === true`, advance `TAP_HOLD_MS` → false. Precedent verbatim: `tests/gates/aspect-ring-gates.test.jsx` | the current 600/300-char proximity regex already has ~340 chars of comment inside its budget |
| `siege-warning-gates.test.js` describe 2 | rewrite (**keep the `.js` filename**, R1) | `setState({nightCount:4})`, `renderHook(({d}) => useSurvivalMode(d))`, `rerender({d:false})` → `survivalWarning` matches `/Night 4/`; positive control that it starts `null` | delete the nightfall branch, keep the import → both current positives green |
| `dusk-warning-gates.test.js` describe 2 | fold into `tests/gates/capture-guard-timing-gates.test.jsx` | ONE warn per day (10 × 1100ms inside the window → `warns.length===1`); RE-ARM (isDay false → fresh dusk → 2) | `toMatch(/armed/)` matches `const armed = useRef(true)` even if the latch is never consumed |
| `daynight-audio-gates.test.js` t2-t4 | rewrite | mock SoundManager; render `<DayNightAudio/>` → **no** sting on mount; `setState({isDay:false})` → horn once, chime zero; flip back → chime once | 27-line null-returning component; on-mount-fires is a real property no grep sees |
| `objective-tracker-gates.test.js` | move `ObjectiveTracker` out of `HUD.jsx` → `src/ui/ObjectiveTracker.jsx` (export it), then render | capture → `container` empty; spy on `window.localStorage` → zero `getItem`/`setItem` over a full render | measured: the capture guard sits at offset 2140 of a 2200-char window — **28 characters of headroom**. And `block.includes('localStorage') === false` passes on an empty block. |
| `title-screen-brand-gates.test.js` t3 | rewrite the CTA half only | click the real `<Button …onClick={enterPlay}>Start Adventure</Button>` → assert `enterPlay`'s observable effect | **⚠ do NOT put a testid on `<TitleDiorama/>`** — it is `lazy()` inside `<Suspense fallback={null}>`, so it never mounts in jsdom and the assertion fails on correct code |

---

### **Batch 2 — SoundProvider graph harness.**
**Touches 8 gates.**

`src/SoundManager.audioReady.test.jsx:21-40` already builds a Proxy fake `AudioContext` and renders `<SoundProvider>` with a probe consumer. Extend it into a **recording** mock (every node's `connect` logs its target and the `fillStyle`-style live values) and the whole audio-routing corpus becomes executable.

**New file:** `frontend/tests/helpers/soundHarness.jsx` — `renderSounds()` → `{ ctx, graph, sounds }` where `graph.edges` is every `connect(src → dst)` pair.

| Gate | Replacement | Mutation |
|---|---|---|
| `master-bus-gates.test.js` t1/t2/t3/t5 | `getMasterBus()` returns a live node; for **every** key of `sounds`, `playSound(k)` terminates at that node; `ctx.destination` receives nothing but the limiter | replace the body with `const getMasterBus = () => null` → all four current assertions green while every one of the four call sites (`SoundManager.jsx:194/209/318/539`) falls through to `destination`. **⚠ Spy on the *argument* to `connect`, not on `ctx.destination.connect` — `masterBus.js:21` is `limiter.connect(ctx.destination)`.** |
| `master-bus-gates.test.js` t4 | **KEEP** (§3) | whole-file absence over voices the harness cannot drive |
| `settings-a11y-gates.test.js` bus-gain half | slider → live bus gain, end to end (`SoundManager.jsx:259-262` and the fresh-bus seed at :477-479) | `applyBusGain` was refuted (§4): it only re-tests `audioGain`, already covered by `src/game/audioSettings.test.js` |
| `spatial-sfx-bus-gates.test.js` t1/t2 | assert the whole chain: `filter` and `wetGain` both reach `busInput`; `ctx.destination` appears in no node's edges; `buildSpatialChain(ctx, listenerGain, null)` **does** fall back to destination (the "never silence" contract, covered by nothing today) | t1's `/value\s*=\s*\{[\s\S]*getMasterBus[\s\S]*\}/` is greedy and unanchored across 580 lines — it matches `value = {` at :562 plus `getMasterBus` at any of six places plus any `}` |
| `ui-sounds-gate.test.js` t2, `victory-audio-gate.test.js` t2, `daynight-audio-gates.test.js` t1 | `renderHook(() => useGameSounds(), {wrapper: SoundProvider})` → `typeof playUIOpen/playVictory/playSiegeHorn === 'function'` | replaces three exact-source pins including `/playVictory:\s*\(\)\s*=>\s*playSound\(['"]victory['"]\)/` |
| `aspect-sfx-gates.test.js` test 1 | **DELETE — redundant** | `src/audio/synthVoices.test.js` already asserts `Object.keys(VOICES).sort()` **set-equal** to all seven names *and* that every factory returns a non-silent, unclipped buffer. Strictly stronger on both axes. |
| `audio-resume-gates.test.js` | new modules, below | |
| `biome-ambience-gates.test.js` | new module, below | |

**New src modules in this batch**

```js
// src/audio/ctxResume.js
export function resumeCtx(ctx) -> boolean      // true iff it resumed a suspended ctx

// src/audio/entryGesture.js
export function entryAudioActions({ isPointerLocked, musicEnabled }) -> { resume, startMusic }

// src/audio/windBed.js   (mirrors src/audio/stormBed.js + stormBed.test.js)
export function createWindBed(ctx, destination) -> { start(buf), applyAmbience({cutoff,gain},t), stop(), active }

// src/audio/procMusicGain.js
export const PROC_MUSIC_GAIN = 0
export function procGain(base, volume) -> number

// src/audio/pitchJitter.js
export const JITTER_FLOOR = 0.93, JITTER_SPREAD = 0.14
export function jitterRate(rate, jitter = true, rng = Math.random) -> number
```

- **`audio-resume-gates`** — the killer assertion is `entryAudioActions({isPointerLocked:true, musicEnabled:false}).resume === true`. Mutation: rewrite `App.jsx:893` to `if (musicEnabled) { resumeAudio(); playBackgroundMusic(); }` — the shipped bug verbatim — and **all four current assertions stay green**. Verified.
- **`biome-ambience-gates`** — `windBedTeardown` op list contains `stop` and `disconnect`. Mutation: delete `SoundManager.jsx:91-94` and :111-112, leaking a looping BufferSource forever; line 90 (`const wb = windBedRef.current;`) alone keeps the 1500-char window green. **Free win:** `src/audio/biomeAmbience.js` has **no test file at all** — assert the map (surfaceBlock → {cutoff,gain}, every biome distinct, unknown falls back, stable across calls), which subsumes the `Math.random` grep more strongly.
- **`proc-music-mute-gates`** — `procGain(b, v) === 0` for arbitrary b and v. Mutation: regress *only* `SoundManager.jsx:415` to `volume * 0.75` — both current assertions stay green, because :322 still carries the factor. The gate would have been green through the life of the bug it names. Retire the duplicate `music-gates.test.js` test 4 at the same time.
- **`m1-bugfix-gates`** t2 — `jitterRate(1,true,()=>0) === 0.93` and `(…,()=>1) === 1.07` (exact in IEEE754, verified), `jitterRate(1,false) === 1`. **Do not claim this removes a `Math.random` from `src/` — a default parameter keeps the token.**

---

### **Batch 3 — Capture policy: the declared-rest-pose rule.**
**Touches 11 gates. Must land as ONE commit for the Terrain half.**

The governing rule already exists in-tree (`src/game/captureRest.js`): *a capture guard must RESET TO A DECLARED VALUE, never early-return*. Three gates currently **require the broken shape to be present** and would go red at the fix.

**3a — `<CaptureNullGlow>` migration (one commit: `home-anchor` + `landmarks` + `blight-monolith`).**
`grep -n '<Emissive' src/world/Terrain.jsx` returns **374, 400, 411, 441** — hearth brazier, shrine beacon, sky-arch beacon, Blight-Heart beacon — each behind a render-body `!isCaptureMode() &&`. Migrating one and adding the corpus ban reds the other three. Migrate all four to the existing `src/render/captureGlow.jsx` (the swap `HubRender.jsx:29,49` already took), then delete the three source assertions and let `tests/gates/capture-glow-gates.test.jsx` carry it (it mocks `useFrame`, captures the callback, drives ticks, and asserts `visible` tracks the flag when capture is entered **after** mount).

**Additive requirement:** the hearth block also carries `<pointLight …>` at `Terrain.jsx:375`. Add `export function CaptureNullLight(props)` to `src/render/captureGlow.jsx` doing the same `ref.current.visible = !isCaptureMode()` per frame — otherwise the migration silently drops the brazier's light.

**3b — declared-pose seams**

```js
// src/render/captureClock.js
export function captureElapsed(state) -> number      // 0 under capture, live otherwise

// src/render/pickupPose.js
export function xpOrbSpin(prevRot, capture) -> {x,y}
export function lootDropPose(elapsed, prevY, capture) -> {rotX, rotY}
export function lootPopPose(elapsedMs, capture) -> {scale, opacity}

// src/game/npcAmbientStep.js
export function ambientStep(pos, target, { capture, lerp = 0.04 }) -> { x, z }
export function shouldProbeGround(frame, index, every, capture) -> boolean

// src/render/bossStep.js
export function bossStep(prev, target, delta, capture) -> [x,y,z]
```

- **`vfx-extraction-gates` t3** — replaces `expect(count).toBeGreaterThanOrEqual(2)` where the file has **three** guards (`pickupVfx.jsx:23/71/139`). Assertion: for `capture=true` the output is **identical for any input**; for `capture=false` it varies. Mutation: delete `:139` → two remain → green today.
- **`npc-routine-gates`** — under capture the result **equals the target exactly**. `AIWorkerSystem.jsx:142-147` documents this as a real determinism bug (a `return` froze each NPC at a run-dependent pose). Mutation: delete the entire ambient useFrame → `/routinePosition/` green (import at :6), `/isCaptureMode\(\)/` green (unrelated guard at :175 and `captureSeed` at :260).
- **`character-render-gates` t1/t4** — mock `@react-three/fiber`'s `useFrame` to capture the callback (`capture-glow-gates.test.jsx:21`), mock the worker module to a spy class, tick outside capture (**≥1 post — the instrument check**), `enterCaptureMode()`, tick again → no further post, `drainKnockback` still called. Mutation run: neutering the real guard in `AIWorkerSystem.jsx` while adding any capture guard to the prepended `SimplifiedNPCSystem.jsx` keeps t1 **green** (`guardIdx 6908 < postIdx 18416`) with capture determinism fully broken.
- **`danger-bridge-gates`** — `src/game/dangerMood.js` → `bossDangerLevel(bossActive, captureMode)` returning `null` for "do not write". **⚠ R6:** this bridge reads the **store** flag. The capture assertion must use `setCaptureMode(true)`, not `enterCaptureMode()`, or it fails on correct code. Chain assertion: `moodTarget({isDay:true, dangerLevel: getState().dangerLevel}) === 2` — the only assertion that catches "the write exists but the mood never reads it".
- **`daynight-clock-gates` t1/t2** — no new module; the seam (`shouldAdvanceClock`) already exists at `src/game/dayNight.js:76`. `renderHook(useDayNightClock)` + fake timers: 3s advances `gameTime` by exactly `3 × GAME_UNITS_PER_SECOND`; `active=false`, capture, `isWorldBuilt=false` each freeze it. Positive control first. Keep t3 (no-`useFrame` forbid) verbatim.
- **`atmosphere-isolation-gates`** — test 1 → drive the store directly (`getState().captureStudio === false`, `setCaptureStudio(true)` flips, `'truthy'` coerces). Test 2's live finding is the **selector-parameter pin**: `(state) => state.captureStudio` reds `/captureStudio\s*=\s*useGameStore\(\s*\(?s\)?\s*=>\s*s\.captureStudio\s*\)/` at a one-token rename. The 1400/700-char windows have 3.5×–6.7× headroom (measured: 209/116/136/114/75/199 chars) — real class, not the live failure. Optional: `src/devtest/captureFraming.js` `isStudioCard(hook)` with a completeness denominator over the union of both sets.

---

### **Batch 4 — Combat attribution & death effects.**
**Touches 6 gates. Closes the AFK-farm exploit class behaviourally.**

`src/systems/CombatSystem.jsx` imports `useEffect`, **not** `useFrame`, and publishes `GameMethods.damageMob` at :169. Every transitive import is node-safe. `tests/gates/friend-foe-gates.test.jsx` already renders it in jsdom and calls `damageMob`. The header's "component-closure-scoped (untestable directly)" is **stale**.

```js
// src/combat/hitEffects.js
export function hitEffects(source, spawnRing) -> { hitstop, shake, ring, xpEligible }

// src/game/bossMeleeHit.js
export function bossMeleeHit({playerPos, lookDir, bossPos, range, angleRad, sparkType, isCrit})
  -> { hit, sound:{name,pos,vol}, sparks:{pos,color,count,type,dir} } | null

// src/game/lavaZone.js
export const LAVA_WINDUP_MS = 750, LAVA_RADIUS_SQ = 7.56
export function lavaZoneState(now, zone) -> { forming, ramp }
export function lavaBurns(now, zone, distSq, radiusSq = LAVA_RADIUS_SQ) -> boolean
```

- **`kill-attribution-gates`** — 2×2: `'player'` → all four effects; `'player-dot'` → `xpEligible` only; `'ally'` → none. Plus the accrual sweep, self-extending: iterate `Object.entries(await import('src/world/accrualHooks.js'))` filtered to `/^use.*Accrual$/`, `renderHook` each, `emitMobKill('zombie',[0,0,0],'ally')`, snapshot the whole store before/after → unchanged; `'player'` → moved. A new meter added without a filter fails automatically. **⚠ Seed a FRESH mob per source** — `CombatSystem.jsx:113` gates the death block on `!entity.dyingUntil` and :156 sets it, so a single mob makes arms 2 and 3 assert about a corpse. **⚠ Keep** the explicit no-source call (the default-arg case is what the fireball DoT relied on) and **keep** `QuestSystem.jsx`'s `if (source !== 'player') return;` grep.
- **`death-fx-gates`** — spy assertions on the fan-out. **⚠ Assert `count`, not `color`:** `deathBurst` returns the constant `#FFB84D` for every mob, so a re-typed literal is observationally identical. Only count varies (pig 18 vs cow 23; clamp ends reachable via villager xp 0 → 14 and moss_brute xp 60 → 28).
- **`element-impact-gates`** t3 — no seam: `const colors = Object.keys(SPELL_TO_ELEMENT).map(s => sparkFor(s,false).color); expect(new Set(colors).size).toBe(colors.length)` and `not.toContain(sparkFor('physical',false).color)`. Catches two elements collapsing to one colour; the `case 'x':` grep cannot.
- **`boss-melee-spark-gates`** — verb consistency asserted as **data**: the boss path's `color`/`count` equal what `sparkFor(sparkType,isCrit)` returns for the mob path. Delete t1 (redundant with t2). Today the t2 window is delimited by the comment at `Components.jsx:266` — `between()` returns `''` on any rewording, and `expect('').toMatch(…)` is red at a documentation edit.
- **`attack-telegraph-gates`** slice 3 — `lavaZoneState`/`lavaBurns`: a zone at t=0 burns **nobody** at t=500 even at distSq=0 (forming = harmless — the dodgeability promise, currently unverified), burns at t=800 inside, not outside. Kills the `7.56` magic-number pin, which `BossEntity.jsx:430`'s own comment documents as a 2.75u radius.
- **`death-beats-gates`** — convert d1t2/d3 only (see §4 for what was dropped). d3: render `<DeathScreen>`/`<VictoryOverlay>` with `nightCount:4`, assert the run summary and the callback. **Keep the off-token forbids** (`bg-green-600`/`text-red-500`/`bg-amber-500`) — design-system corpus invariants.

---

### **Batch 5 — Worldgen decision seams (depends on Batch 0 for the effect half).**

```js
// src/world/floraStamp.js
export function floraStamp(surfaceBlock, flora, rand)
  -> { shape:'pine'|'acacia'|'swamp'|'jungle'|'cactus'|null, trunkBlock, leafBlock, height }

// src/world/surfacePick.js
export function surfaceForColumn(temperature, moisture, continent, surfaceY)
  -> { surfaceBlock, secondaryBlock }

// src/world/columnFill.js
export function blockAtY(y, surfaceY, surfaceBlock, secondaryBlock) -> number
export function beachOverride(surfaceY, surfaceBlock, secondaryBlock) -> [block, secondary]

// src/world/columnTops.js
export function columnTops(blocks, size, height, getIndex) -> { topCodes, topYs }
```

Precedent for all four, out of this same worker: `world/heightAt.js`, `world/biomeTable.js`, `world/oceanProfile.js`, `world/caveCA.js`, `world/blockIds.js`, `world/dawnSurvival.js`.

- **`biome-foliage-gates` + `biome-flora-gates`** — one extraction retires both. `floraStamp(5,'snow',r).shape === 'pine'`, `trunkBlock===6`, `leafBlock===7`; `floraStamp(1,'pine',…).shape === 'pine'` and `!== 'oak'`; **`floraStamp(4,'none',…) === null`** (mesa stays bare — the invariant the grep only hopes for); exhaustive loop over `Object.values(BIOMES)` so a new biome cannot be silently unhandled. Mutation: gut the taiga or snow branch body → today **all** assertions in both gates stay green (`pineShape(` supplied by the taiga branch, `vegRandom(worldX,worldZ,4)`/`= 6;`/`= 7;` supplied by the **swamp** branch, which sits inside the "snow" slice). Second mutation: retune the density literal 0.02 → 0.03 → `indexOf` returns −1, `slice(-1,end)` yields `''`, three assertions red **and the fourth (`not.toMatch(/Math\.random/)`) silently becomes a no-op**. Loud-fail and silent-pass in the same anchor.
- **`biome-table-gates`** t1/t3 — `surfaceForColumn(…, BEACH_BAND_TOP-1).surfaceBlock === 4` (beach **wins** — the effect, not an index comparison); above the band it deep-equals `pickBiome(…)`. Mutation: leave `if (surfaceY < BEACH_BAND_TOP) { }` with an emptied body → t3's index compare stays green.
- **`ocean-coastline-gates`** t3 — `blockAtY(29,20,…) === 9`, `blockAtY(31,20,…) === 0`, boundary at `SEA_LEVEL` for every `surfaceY` in 0..40 (a property, not a spelling). Drop the `targetOceanHeight` negative — `oceanSurfaceY` being **called** already means the inline formula is gone.
- **`grass-revival-gates`** d1 — `columnTops` is called from **both** worker paths (`terrain.worker.js:71-81` generate and `:151-156` update_block; the code's own comment at :147-150 names "a shared computeGrassTops helper" as the upgrade). **⚠ After extraction, "does update_block still call it" is a call-COUNT question with no behavioural form** — keep that as a structural assertion (§3). d2: `patchGrassShader(shader, material)` — note it ends with `grassMaterial.userData.shader = shader`, so the signature needs the material; fixture must be `THREE.ShaderLib.lambert.*`, not hand-typed include strings, or "the replace matched" is only true of the fixture.
- **`ocean-mesher-no-water-faces`** t3 — no new module, `generateMesh` is already exported and already driven by `tests/gates/mesher-geometry-gates.test.js`. Differential: a chunk with water (9) above a slab emits geometry **identical** to the same chunk with those cells set to 0; the same chunk with **stone** emits strictly more. Mutation both ways: reordering the guard's operands leaves it green (today: red), gutting the emit inside the branch reds it (today: green). The current regex has both failures exactly backwards.

---

### **Batch 6 — Quality / perf ladder & chunk residency.**
**Shared: extend `src/render/quality.js` (where `TIERS` already lives) rather than minting modules.**

```js
// src/render/quality.js  (additions)
export function chunkRadiusFor(tier) -> number          // (TIERS[tier] || TIERS.low).renderDistance
export function weatherCounts(tier, bases) -> { rain, snow, fireflies }
export function stepTier(cur, dir) -> 'low'|'med'|'high'   // saturating
export function useWeatherCounts(bases)                  // reactive hook — the actual bug

// src/world/chunkResidency.js
export function chunkResidency(playerCx, playerCz, renderDistance, residentKeys, { reclaimPerTick = 4 })
  -> { toRequest, toCull, toReclaim }
```

- **`perf-config-gates`** — `chunkRadiusFor('low')===2 < 'med' 3 < 'high' 4`, `chunkRadiusFor(undefined)===2`; `weatherCounts('high').rain === 400` (the byte-identical-baseline contract, asserted as a **number** rather than as a `Math.round` spelling); `stepTier('high','up')==='high'` (the no-op the `next !== cur` guard exists for). Kills the 300-char window, the ternary pin and the `rainCountBase` local-name pin.
- **`perf-config-gates` T2.3 — DELETE, do not convert.** It asserts `getState().qualityTier` under a comment about Game-Loop-Isolation, but `WeatherSystem.jsx:138` is `useGameStore((s) => s.qualityTier)` — a **reactive selector, deliberately**, per its own :130-137 comment. The only `getState().qualityTier` hits are in `GameScene.jsx:201/206`, unrelated code, reachable only through the concatenation. The gate asserts the opposite of what the guarded file does.
- **`perf-config-gates` T3.4** — the `{!isCaptureMode && !isPerfProbe() && (` literal `indexOf` reds on **one inserted space**. Re-anchor whitespace-insensitively; the JSX-placement claim itself is legitimate (§3).
- **`weather-density-gate`** t1/t2 — `renderHook(useWeatherCounts)` + `act(() => setState({qualityTier:'low'}))` → rain count drops. That is the actual regression (reactivity, not arithmetic) and it is indifferent to whether a future freeze is a `useMemo`, a `useRef` or a mount-time `getState` — all three slip past t1's single-shape regex. t2 is **outright vacuous**: both concatenated files carry a matching selector (`GameScene.jsx:90` and `WeatherSystem.jsx:138`), so deleting the line the gate exists to protect leaves it green. t3 stays (§3), with the tag regex hardened to two independent counts.
- **`chunkResidency`** is the highest-value single extraction in the plan: `Terrain.jsx:704-712` documents a **real shipped bug** — on a high→low downgrade the +2 hysteresis band retained the full 81-chunk high-tier box, so the downgrade culled nothing on exactly the machine it protects (measured 81 → 72 flat for 45s against a low-tier box of 25). Its only coverage today is a Playwright e2e. Assertions: `toReclaim.length > 0` after a downgrade and convergence toward `(2*2+1)**2`; at steady state `toReclaim` is **empty** (normal movement never thrashes); `toRequest` capped at 2/tick.

---

### **Batch 7 — Trade / inventory / cast-cost.**

```js
// src/game/tradeInventory.js
export function applyBlockTrade(prev, { blockType, required, resultItem, resultCount }) -> inventory
export function applyCrystalTrade(prev, { magicItem, requiredCrystals, resultCount }) -> inventory

// src/game/coinTrades.js
export const COIN_TRADES = [...]                                  // lifted from TradingInterface.jsx:89-90
export function resolveCoinTrade(trade, coins) -> { ok, spend, grant } | { ok:false, reason }

// src/utils/spellCast.js  (WIDEN the existing module — do not mint a new one)
export function resolveCastManaCost(getSpellStats, spellType, staticBase, wandCount = 0) -> number
```

- **`trade-fresh-prev-gates`** — the assertion that actually states the invariant needs **no new module**: install a capturing spy via `useGameStore.setState({ setInventory: (u) => { captured = u; } })`, render, click Trade, then apply `captured` to a prev **deliberately different** from the rendered snapshot: `expect(captured({blocks:{stone:100}}).blocks.stone).toBe(84)`, not `4`. That proves "reads prev, not the closure", proves the expression really is what was passed to `setInventory`, is immune to renames and formatting, and removes the file's `readFileSync`. **Note:** neither the current gate nor `tests/integration/trading-interface.test.jsx` distinguishes fresh-prev from render-snapshot today — that hole is larger than the brittleness.
- **`inventory-flat-bucket-gates`** — `applyBlockTrade(…).blocks.plank === 2` and **`out.magic` toEqual `{}`** — the flat-bucket invariant as a value, failing however the code is spelled. Keep `expect(Object.keys(out).filter(k => out[k] !== inventory[k])).toEqual(['blocks'])`. For the panel half, use the **negative**: `expect(read('ui/GamePanels.jsx')).not.toMatch(/inventory\.(magic|tools)/)` (verified zero hits today), which fires on the actual regression and self-extends.
- **`coin-sink-gates`** describe 2 — data-driven: every `COIN_TRADES` row has `cost > 0` and a `getItem` present in `src/game/consumables.js` (the real "genuinely-usable consumables" claim, currently a `/Health Potion|Mana Potion/` grep a comment satisfies).
- **`spell-cast-level-wire-gates` + `wand-economy-gates`** — one widening retires both. `resolveCastManaCost(stats({manaCost:20}),'fireball',15,3) === 16` (20 × 0.82, `WAND_MANA_PER 0.06 × 3`); `(…,0) === 20` byte-identical at zero wands; capped at `WAND_MANA_CAP 0.30`; floored at 1. Kills four exact-call-site pins including two purely-local variable names. **⚠ `blocker: none` was wrong** — `EnhancedMagicSystem` calls `useFrame` at :280, so `castSpell` is never installed outside a Canvas; the extraction is mandatory, not optional. **Do not delete** `wand-economy` t4's bucket concern on the grounds that nothing covers it — `tests/gates/crystal-wallet-gates.test.jsx` already covers the B3b bucket bug end to end, which makes `wand-economy` more redundant than first classified.

---

### **Batch 8 — Compass & minimap markers.**

```js
// src/game/compassMarkers.js       (composes the already-pure game/compass.js bearingToMarker)
export function buildCompassMarkers({ playerPos, heading, fov, capture, home, shrine, blightHeart, boss, chests, openedIds })
  -> Array<{ kind:'HOME'|'SHRINE'|'BLIGHT'|'CHEST'|'BOSS', label, pct, dist, color }>

// src/ui/minimapProject.js
export function projectBlip(wx, wz, px, pz, { scale, radius, clamp }) -> { x, y, visible }
```

Retires the grep halves of `blight-marker-gates`, `compass-hearth-gates`, `shrine-marker-gates` and the projection half of `radial-minimap-gates`. `HUD.jsx:317-480` is already pure — it builds strings and assigns `innerHTML`.

**⚠ Capture suppression is PER-BLOCK, not global.** `HUD.jsx:286` only stops the rAF from re-scheduling; the cardinal ticks (:319-334) and the **BOSS marker block (:336-360) have no capture guard at all**. Only HOME (:364), SHRINE (:383), BLIGHT (:407) and chests (:428) are suppressed. A faithful `buildCompassMarkers` must still emit BOSS under capture. Asserting "capture → empty array" either fails against a behaviour-preserving extraction or silently ships a behaviour change inside a refactor.

Assertions the greps cannot make: per-kind capture suppression as a **value**; the hide-while-near rules that nothing currently touches (`homeDist > 6`, `sDist > 8`, `bDist > 12`); `projectBlip` clamping a 1025-unit target to exactly `radius` on the true bearing while a 5m shrine returns `visible:false`.

Mutation: `blight-marker` t3's window is delimited by two comments 1094 chars apart (`// 2d. Render the BLIGHT HEART` … `// 3. Render Chest`); renaming `// 3. Render Chest` → `// 3. Render the Chest` makes `end === -1` and reds the gate at a documentation change. `compass-hearth`'s 800-char floating window is a **latent** hazard, not a present false-green (verified: removing HOME's own guard reds it today, because the boss block above carries no guard) — it becomes real the moment anyone adds one, which the HOME block's own comment already falsely claims exists.

---

### **Batch 9 — Small single-gate pure lifts (do in one sweep; each ~30 min).**

| New module | Signature | Gate | Killer assertion / mutation |
|---|---|---|---|
| `src/render/mobEyes.js` | `showsHostileEyes(mobConfig, entity) -> bool` | `ally-eyes-gate` | captured companion `{passive:false,type:'zombie',isAlly:true}` → **false**. 15-line gate, 4-line seam, guards a shipped visual bug. Mirrors `src/render/mobFlash.js`. |
| `src/game/placePuff.js` | `placePuffSpec(blockType, pos) -> {pos,color,count,kind}` | `place-puff-gates` | `count > 0` — mutation: change the count arg to `0` (no puff renders) → `/triggerGPUSparks\?\.\([^)]*puffColor/` stays green. Plus `color` pinned to the **placed** type, which `BLOCK_TYPES[anything]` cannot check. |
| `src/game/bossSpawnGate.js` | `shouldAwakenBoss({playerLevel, alreadySpawned, defeated, gameWon, playerPos, lair, radius=24}) -> bool` | `boss-lair-gates` | level 5 at 25m → false, at 23m → true. Mutation run: deleting the entire spawn gate line (`bossSystem.js:47`) leaves **all three** tests green. |
| `src/game/aggroGrowl.js` | `makeAggroGrowler(play, {cooldownSec, now}) -> (entity, wasAggro, isAggro) => bool` | `mob-aggro-audio-gate` | a second edge inside `cooldownSec` returns false. The cooldown is the gate's whole subject and is satisfied today by the module-scope `let _lastAggroGrowl = -Infinity` at :36. Mirrors `src/game/attackSounds.js`. |
| `src/game/footstepCadence.js` | `stepDecision({time,lastStep,isGrounded,prevGrounded,horizontalSpeed,surface}) -> {play,kind,rate,nextLastStep}` | `locomotion-audio-gates` | plays separated by exactly `max(0.28, 0.42 − v*0.01)`; exactly ONE `land` per false→true edge. **⚠ The caller must still `addKick(kickRef.current, KICK_PROFILES.land)` on `landed`** (`Components.jsx:1243`) — the naive collapse ships a silent feel regression. **⚠ Keep t3** (the jump cue at :1073 is a different branch). |
| `src/game/nametagView.js` | `nametagView(tag, health) -> {group,bg,bar,barScaleX,barOffsetX,color}` | `nametags-gates` | `showBar:false` → `bg===false && bar===false` (the stray-rectangle bug as one value, not two assignment spellings); `group===false` when `health<=0`. Delete tests 1-3 outright — all three are satisfied by import lines (:3,:4,:5). |
| `src/game/lowHealth.js` **(existing)** | `+ dangerBucket(intensity)` | `heartbeat-stable-interval-gates` | do **not** mint `src/game/dangerBucket.js` for a `Math.ceil` — `lowHealth.js` is already the pure home, with `LOW_HEALTH_THRESHOLD` and `heartbeatPeriod` beside it. |
| `src/world/blightHeart.js` **(existing)** | `+ lairChunkLoaded(chunks)`, `+ lairBeaconVisible(capture)` | `blight-monolith-gates` | each of the 8 neighbour chunks → false (the off-by-one the regex cannot see). Beacon half joins Batch 3a. |
| `src/world/beaconPlacement.js` | `clampBeacon(px,pz,tx,tz,clamp) -> {x,z,visible}` | `spawn-legibility-gates` | Blight Heart at 1025.3 units → placed at exactly `BEACON_CLAMP=150` on the true bearing; `dist<=0.5` → `visible:false`. **Keep** the `<LandmarksRender chunks={chunks}` / `<FarBeacon />` mount greps (§3). |
| `src/game/objectiveTarget.js` | `currentObjective({shrineReached, playerX, playerZ, nearestShrine, blightHeart}) -> {x,z,labelKey,color}` | `objective-tracker-gates` + `spawn-legibility-gates` | shared. `shrineReached:false` with **no** shrine in range → falls through to the Blight Heart (`HUD.jsx:236`, exercised by nothing today). |
| `src/world/debrisInstances.js` | `makeDebrisInstances(n, parkY) -> [{key,position,rotation,scale}]` | `block-debris-gates` | **every** scale deep-equals `[1,1,1]` (the `[0,0,0]` invisible-debris regression by value); keys unique 0..n−1; every start position parked below the world. `src/game/debrisPark.js` is the same shape in the same subsystem. |
| `src/render/oceanVertices.js` | `displaceOceanVertices(pos, nrm, xz, t) -> void` | `ocean-depth-tint-gates` t4 | allocation contract as behaviour: `vi.mock` `oceanProfile.js` so the **object-returning** `gerstnerDisplace`/`gerstnerNormal` are spies; assert they are **never** called while the `…Into` variants are. Survives renaming `t`/`_d`/`_n` — which currently reds the gate (its own comment records two prior re-anchorings, 2026-08-08 and 2026-08-11). |
| `src/game/spellGlowLayout.js` | `resolveGlowLayout(profile, motion) -> {showOuterShell, glowScale}` | `spell-motion-gates` | lightning/iceball → `showOuterShell:false`; fireball `glowScale[1]` exactly 1.5× and strictly taller than x,z (anisotropy is the claim). **⚠ Do NOT delete T2** — see §4. |
| `src/game/spellImpactFx.js` | `resolveSpellImpactFx(spellType, wasKill) -> {sparkColor, sparkCount, bloomSpikeMs, shakeMagnitude}` | `spell-vfx-gates` | unmapped type → exactly `['#ffffff', 25]` (documented fallback, untested anywhere); `wasKill` multiplies count by 1.8 rounded and raises shake 0.4→0.8. Do **not** assert `bloomSpikeMs > 0` — it is a literal 80 with no per-element branch. |
| `src/game/mobSpeed.js` | `effectiveMobSpeed(e, now) -> number` | `elemancer-noremesh-gates` | order-free: frozen zone → `base × SLOW_MULT`; clearing `zoneSlowMult` restores base; both channels stack. Replaces a factor-**order** pin on `AIWorkerSystem.jsx:233`. |
| `src/game/aiTickRoster.js` | `tickableMobs(entities) -> entity[]` | `npc-spawn-gates` | a `isStatic:true` hub NPC is **excluded**. The current `/isStatic/` is satisfied by the distance-**cull** at `SpawnerSystem.jsx:191` while the real AI guard lives at `AIWorkerSystem.jsx:201`, in a file the gate never opens. Worth more than all eight of that gate's current tests. |
| `src/systems/mobSnapshot.js` | `mobSnapshot(e)`, `mobSnapshots(entities)` | `friend-foe-gates` t10 | property matrix: `isProtected(mobSnapshot(live)) === isProtected(live)` for hostile/passive/isNPC/hostile-but-isNPC. **⚠ Do NOT delete the readFileSync** (§4). |
| `src/systems/combatMethods.js` | `installCombatMethods(GameMethods, ecs)` / `makeCaptureMob(world, q)` | `allegiance-gates` t1 | assert **installation**: call the registrar against a fake `GameMethods`, then `capture(9001)` returns the entity and removes it from `mobsQuery`; `capture(4242)` → null (stale `ssm.targetId`); villager → null. Mutation: move the registration into a dead branch → green today. Tests 2-3 stay (§3). |
| `src/ui/ControlsSheet.jsx` | component extraction | `hud-declutter-gates` | Batch 1 |
| `src/ui/ObjectiveTracker.jsx` | component extraction | `objective-tracker-gates` | Batch 1 |
| `src/ui/ErrorBoundary.jsx` | class extraction (verbatim), `+ onReload` prop | `error-boundary-gates` | the DEV-gate privacy assertion via `vi.stubEnv('DEV', false)` — **verified to work** in this repo's vitest across a module boundary. **⚠ `window.location.reload` is `[Unforgeable]` in jsdom 29.1.1** — `defineProperty` throws, `vi.spyOn`/`stubGlobal` fail. Inject `onReload` defaulting to `() => window.location.reload()`. |

---

## 3. LEAVE ALONE — gates that read source and should keep doing so

Be generous here. Mass-rewriting these is the failure mode this plan exists to prevent.

### 3.1 The eight pure STRUCTURAL-CORRECT files
| File | One-line reason |
|---|---|
| `boot-chrome-gate.test.js` | Shipped `<head>` + on-disk asset existence + trademark-copy ban — build-graph facts with no runtime. |
| `chrome-brand-conformance-gates.test.js` | Off-brand chrome cannot return to two named first-impression surfaces — a corpus-shape ban. |
| `dynamic-light-gates.test.js` | Whole-`src/` forbid on shadow-casting point lights; a perf cliff, not a wrong return value. |
| `equipment-dry-gates.test.js` | Single-source-of-truth for the damage ladder; the bug class is silent **divergence** between two consumers. |
| `ore-drop-gates.test.js` | Recipe/block-key round-trip and "no recipe depends on a material the world can never yield" — a corpus reachability claim. |
| `progression-source-gates.test.js` | "No *other* file also computes this" has no runtime observation, by construction. |
| `survival-quests-gates.test.js` | Cross-table quest contract plus a tier floor protecting the visual baselines. |
| `voidhand-noremesh-gates.test.js` | Forbidden-token rule over a 12-module file set including a 1379-line R3F controller — the blessed class, and it has **reach** (unlike `beast-noremesh`). |

### 3.2 Structural halves inside MIXED files — keep verbatim

**Determinism / capture absence sweeps** (the blessed `no-Math.random-under-capture` class):
`biome-foliage` t3 (`world/foliage.js`) · `biome-flora` t4 · `biome-ambience` t3 · `landmarks` (both `world/landmarks.js` sweeps) · `locomotion-audio` t4 (`world/climate.js`) · `home-anchor` (`world/homeAnchor.js` + the no-metalness/roughness art-direction absence).

**Forbidden-token / dependency-surface bans over a file set:**
`elemancer-noremesh` describe 1 (six-file voxel-seam forbid; its own comment: "matches literal tokens anywhere, comments included — by design: cheap and unbluffable") · `allegiance` t2 (nothing outside `allegiance.js` removes `isMob` — the seam is the only door) · `allegiance` t3 (no comma-template `worldBlocks` key — a shape that shipped as a **silent always-miss**, which by definition produces no observable behaviour) · `touch-wiring` t6 (`touchHandlers.js` purity) · `touch-purity` T1 (no react/three/R3F/inputState import, no DOM globals — an unused `import React` is invisible to execution) · `verb-router` t3 (`verbRouter.js` import-graph purity) · `ability-bar` (`not.toMatch(/voidhandSMRef|soulbindSMRef/)` — an architectural dependency ban) · `static-gates` zero-emoji, no-legacy-class, no-frosted-glass, no-raw-hex-in-primitives (walked corpora with real denominators: `expect(prim.length).toBeGreaterThan(5)` before the loop).

**Cardinality / single-owner invariants:**
`input-abstraction` t2 (`pointerLockElement` at most once in `Components.jsx`), t6 (zero in `InputManager.jsx`), t7 (no `pointerlockchange` listener) · `touch-wiring` t3 + t9 (four-file no-leak sweep) · `verb-router` t1 (no `mousedown` listener may re-grow in `Terrain.jsx`) · `terrain-quest-callback` **t3** (`onBlockBreak?.()` appears exactly once in `Terrain.jsx` — a second call site **is** the double-count bug; per-call spies cannot see it) · `attack-telegraph` (`not.toMatch(/const\s+WINDUP_MS\s*=/)` — a duplicated constant is invisible to execution of the shared one) · `archer-kite-steer` + `mob-los-sync` import anchors (as anti-duplication, once re-anchored per §5) · `grass-revival` d2t2 mount **count** and the `columnTops` call-count · `hub-render` t3 (glow count + two anti-pattern bans — **the template for this whole corpus**: a stated denominator plus a delegation of the behaviour to `capture-glow-gates.test.jsx`).

**Anti-resurrection ratchets** (deleted code must stay deleted; you cannot execute what is absent):
`ocean-depth-tint` t1-t3 (`vFoam`/`isWaterPixel`/`bioluminescence`/`shore foam` gone from `Terrain.jsx`) · `ocean-mesher` t1-t2 (`isWaterTopFace`, `seabedDepthT(`) · `siege-warning` (`'Night has fallen…'`) · `save-consolidation` t2/t5 negatives (the dead axios `saveGame`/`loadGame`) · `siege-gates` t1 (`setDangerLevel` single-writer negative) · `spell-vfx` (busy-wait ban + both slop-deletion bans) · `hud-declutter` t3 (the standalone spell band is gone) · `title-screen` six style bans · `look-sensitivity` t3 (drei `PointerLockControls` fully removed — "this library is not used" has no behavioural form) · `bundle-split` describe 2 (`test_swarm.js` stays deleted) · `vfx-extraction` t2 (five no-leave-behind-duplication checks) · `biome-table` t2 (the legacy inline branch stays deleted) · `spatial-sfx` t4 (`getState().volume` phantom field).

**Mount / reachability where the host is not jsdom-renderable:**
`Terrain.jsx` imports `@react-three/rapier` (:7) and `./terrain.worker.js?worker` (:8) — so `landmarks` t1's `<LandmarksRender chunks={chunks}` mount, `spawn-legibility`'s `<FarBeacon />` mount, `home-anchor` t4, `hub-render` t4, `blight-monolith`'s `lairChunkLoaded` call site, and `place-puff`'s call-site anchor all stay. Same for `GameScene.jsx` (`<PointerLook />` mount) and `App.jsx` (the autosave `useGameStore.subscribe` effect, the reward-sound `window.*` bridge, `createAutosave` + `beforeunload`). `friend-foe` t10's `setMobEntities(… isNPC: e.isNPC` grep is the **only** assertion tied to the production call site, and the original bug *was* the inline projection omitting `isNPC` — keep it.

**Config / build-graph as data:**
`m1-bugfix` t4 and `bundle-split` describe 3 (`pkg.scripts.test === 'vitest run'`, `postprocessing` declared) · `music-gates` t1 (`existsSync` + `statSync(f).size > 50000` on the three mp3s) · `hud-stat-wire` t1 + **t3** (the `gameSystems.*` set-difference sweep — most reads sit behind `isPointerLocked && isAlive && isWorldBuilt` while `respawn` lives in the `!isAlive` death branch, so **no single mount sees both**; this is a genuine whole-file invariant and its behavioural store-side twin already exists at `tests/gates/hud-slice-reachability.test.jsx`) · `heightat-single-source` t3's climate negative sweep · `proc-music-mute` (the ramp **enumeration**, once rewritten per §5) · `kill-attribution` t6's `QuestSystem.jsx` filter · `camera-kick` t2 (a cross-file reachability claim of the same class as the blessed CLI-at-module-scope gate; the repo already blesses this shape at `tests/game/keyMap.test.js`) · `static-gates` N8AO presence (**no honest unit seam — say so, do not dress it up as behavioural**) · `verb-router` t2 residual and `spell-cast-level-wire`'s dev-injector residual.

### 3.3 Two files whose *behavioural* halves must survive any rewrite
- **`friend-foe-gates.test.jsx`** — 9 of 10 tests drive the real `CombatSystem` in jsdom against real entities, including the negative control that distinguishes the rule from luck (`isAutoTargetable({passive:false, isNPC:true}) === false` — "the questgivers happen to be `passive:true`, so a `!passive` filter excludes them BY ACCIDENT"). A blanket label here would have cost the most in the corpus.
- **`save-slot-ownership-gates.test.js`** — 7 of 9 tests run against the real store, real `localStorage` under jsdom, and the real `worldSaves`/`saveSchema`, including a drift-proof `toEqual(pristine)` reset. It is on the ratchet only for describe B2c.

---

## 4. DROPPED — proposals an attack refuted

Recorded in full so nobody re-derives them.

**Category errors**
1. `beast-noremesh` STRUCTURAL-CORRECT — unfalsifiable where pointed (`beasts.js` has zero imports); the transform path it names is in `Components.jsx`, unread.
2. `mob-los-sync` t3 STRUCTURAL-CORRECT — worker importable; and the regexes don't enforce the invariant (`function losLocal` passes both).
3. `aspect-hint-gate` filed under any category — it is not a source-grep gate.
4. `biome-foliage` file-level VACUOUS · `biome-flora` file-level BRITTLE · `locomotion-audio` flat VACUOUS (t4 is the same class the same reviewer blessed one gate earlier) — all destroy a legitimate test.
5. `blight-marker` `survivesDeletion=true` · `ally-eyes` `survivesDeletion=true` as written · `npc-routine` `survivesDeletion=true` (partial) · `proc-music-mute` `survivesDeletion=true` (partial).
6. `atmosphere-isolation`'s "one comment slides it out of the window" — measured 3.5×–6.7× headroom; the selector-name pin is the live finding, and over-pitching the weak half weakens an unimpeachable one.
7. `compass-hearth`'s "proves only that *some* capture call appears" as a present false-green — it discriminates today; it is a latent hazard.
8. `combat-keybind`'s "85 of 120 chars consumed" — measured 67; the conclusion survives at ~44 chars of comment, but state the real number.
9. `blight-monolith`'s "one added prop reds it" — measured 46 of 80 consumed; it takes two props.
10. `objective-tracker` t2's ordering claim — the `indexOf` finds the **effect** guard at `HUD.jsx:214`, while the spelling assertion is about the **render** guard at :257; the two claims never meet.
11. `home-anchor`'s memoization argument — backwards: `HubRender` is `React.memo` and prop-less (hence its bake-in); `HomeAnchorRender` is not and re-renders on every chunk arrival. "Green over a live defect" is unproven; the correct charge is that it pins the guard to the render **schedule** and reds at the fix.
12. `landmarks`'s "green over a live defect" — same correction: landmarks mount from a changing `chunks` prop after `enterCapture`.

**Seams that were tautological, thin, or behaviour-changing (R8)**
13. `resolveHurlImpact({activeSpellAtImpact})` — returns its own argument; the entire defect (**where** `store.activeSpell` is read) stays at `HurlSystem.jsx:62/99` inside `useFrame`.
14. `resolvePlayEntry({isTouch}) → {forceActive: isTouch}` — reduces to `!!true === true`; also drops `markGameStarted()` (`MenuSystem.jsx:68`) and puts a `.catch` on a path that has none.
15. `shouldAutosave` + `AUTOSAVE_TRIGGER_KEYS.some(...)` — the array **is** the predicate, so the "catches a mis-spelled key" sweep is tautological; and deleting App's autosave effect entirely leaves every proposed assertion green, whereas the current `[1]`-on-a-null-match throws (red).
16. `PERSISTED_STATE_KEYS` as a derived denominator — `saveSchema.js:30-64` hand-writes each key and routes bossState through `serializeBossState`, so the three keys where the last bug lived still have to be hand-named.
17. `applyBusGain` — only re-tests `audioGain` (covered by `src/game/audioSettings.test.js`) plus a null check, and never asserts SoundManager calls it.
18. `bridgeRewardSounds(host, sounds)` — `Object.assign` plus a teardown the code does not have; if App stops calling it, every assertion stays green, which **is** the shipped defect.
19. `applyImbueAction(action, …)` — two dispatch sites with **disjoint** action sets (`Components.jsx:803-812` arm/disarm, :318-333 consume); the headline assertion encodes stamping the kind at arm time, i.e. re-imports the off-by-one that :309-315 records as fixed.
20. `spawnerTick({now,lastSpawnCheck,entities,remove,spawn})` — cannot host the branch (needs camera-derived coords, store flags, zoneTier, siegeParams, runSpawnPlacement); its headline assertion is already implemented **with a throttle negative control** in `src/systems/corpseSweep.test.js`; and it deletes the only check that the production frame calls the sweep outside the throttle.
21. `runDeathFinisher` owning the `!entity.dyingUntil` latch — the XP-orb spawn at `CombatSystem.jsx:113-138` sits under the same latch and is not moving, so the latch would be duplicated (the exact shape `bossSystem.js:84-87` warns against).
22. `decideSpawn({tier}) → {count, hostile}` — conflates two decisions taken at different sites from different tiers (`SpawnerSystem.jsx:147-152` uses the **player's** zoneTier; :42 uses the **spawn point's**). Needs two functions.
23. `rehydrateQuestState(null) → empty shape` — a behaviour **change**: `QuestSystem.jsx:174` deliberately leaves live state untouched on a legacy save. Also not object→object (it writes `statsRef`/`unlockedRef`, whose omission re-fires every earned achievement's toast), and the coercion it would own is already extracted and tested (`quest-stats-guard-gates`).
24. `describeSpellLayers(profile)` — the descriptor has no position/rotation/geometry args, but `bolt` emits 12 meshes with per-index positions and three cylinder tuples and `sigil` emits seeded motes; the colour enum is contradicted by a hardcoded `#FFFFFF` (:285) and two `vertexColors` cases; the hot core and outer shell live outside the switch; `Set(...).size === 4` passes on one differing field.
25. `capturePhaseFor` merging two `/isCaptureMode(/` greps — they are **not** one claim. `CastTelegraph` (`spellVfx.jsx:650-693`) contains **no** `isCaptureMode` call at all; the test titled "cast telegraph is capture-deterministic" is green only via the concatenation. That is a live false-green to **report**, not to launder into a seam.
26. `src/game/uiHotkeys.js` `panelForKey` — a **third** binding source of truth beside `src/game/keyMap.js`, and collapsing `InputManager.jsx:123-127`'s literal chain reds the existing green `tests/game/keyMap.test.js` ANTI-LIE test for five keys.
27. `verbGate.verbAllowed` as a **replacement** for `input-abstraction` tests 3/4/5 — the four call sites live inside `Player`, unmountable; after extraction nothing asserts the caller consults it. Add, don't replace. The `anyPanelOpen` parameter also invents a contract none of the four sites has.
28. `pickNextQuest(claimed, active, questList = QUEST_LIST)` — circular import unaddressed (the repo's precedent is to move the DATA out first, as `LOOT_TABLES` → `src/data/lootTables.js`); assertion 3 wrong (the authored find wins first); assertion 4 wrong (bounties get no theming); and it deletes describe #2 without ever asserting `claimQuest` calls it.
29. `blockColorFor(id) !== [1,1,1]` — **red on correct code**: Snow's `toLinear('#FFFFFF')` maps to exactly `[1,1,1]`, air has no entry, `255` is a deliberate sentinel, and there is no exported `BLOCK_IDS` array. Assert `id in BLOCK_COLORS` for placeable ores instead.
30. `src/game/dangerBucket.js` — a module whose whole body is a `Math.ceil`; add to `src/game/lowHealth.js`.
31. `src/game/dayNightSting.js` — the wiring render test carries all the catching power; the 3-line edge function mostly adds a file.
32. `src/audio/busCache.js` as specified — drops the volume **seed** (`SoundManager.jsx:479`, deliberate per :258), so either the seed stays in the caller (thin seam) or the signature needs the store read injected.
33. `buildSpatialChain(ctx, listenerGain, busInput)` as specified — the fallback it wants to assert is one line **above** the extracted block (:119, not :120-130); it is 8 connects, not 7; and after extraction nothing asserts the component passes `getMasterBus()` in, which was the historical defect.
34. `RENDERED_BUCKETS = ['blocks']` asserted against its own literal — the purest form of this repo's signature failure, proposed as "one honest structural line".
35. `src/game/aspectVerbSfx.js` registry half — redundant with `src/audio/synthVoices.test.js` (set-equality + audibility).
36. `src/game/castMana.js` / `src/game/tradeInventory.js` as **new** homes where `src/utils/spellCast.js` and the prop-boundary spy already suffice — widen and reuse.

**Assertions that cannot run as written**
37. `fireEvent.keyDown(document, {key:'Escape'})` → `onClose` — `Modal.jsx:9` states Esc is handled globally by `InputManager` (capture phase) and calls store setters, never the `onClose` prop.
38. `render(<MenuSystem/>)` with `setState({showQuestLog:true})` — `showQuestLog` is a **prop** (`MenuSystem.jsx:122`), and a bare render throws at :100.
39. `getByRole('button', {name:/upgrade/i})` in `SpellUpgradePanel` — ambiguous with the talent-node `Upgrade` buttons; `getAllByRole()[0]` would click a talent and green over an unwired `upgradeSpell`.
40. `render(<ControlsSheet/>)` then assert null — the mount effect calls `setShowControls(true)`; the assertion fails on correct code.
41. `data-testid` on `<TitleDiorama/>` — `lazy()` inside `<Suspense fallback={null}>`; never mounts in jsdom.
42. `Object.defineProperty(window,'location',…)` — `[Unforgeable]` in jsdom 29.1.1; `location.reload` is non-writable, non-configurable.
43. `render(<SimpleExperienceSystem/>)` — no such component (`src/SimpleExperienceSystem.jsx` exports `useSimpleExperience`, `SimpleXPGainVisual`, `SimpleLevelUpEffect`, `SimpleExperienceBar`, `SimpleExperienceBarTouch`).
44. `loadWorld('w1')` — no such export in `src/game/worldSaves.js`.
45. `spy(ctx.destination.connect)` — `masterBus.js:21` calls `connect` **on** the limiter **with** destination.
46. `ctx.arc(…)` carrying a colour — colour is `fillStyle` at `fill()` time.
47. `require('../../tailwind.config.cjs')` — ESM tests; house form is `import twConfig from …` (`tests/theme/tailwind-wiring.test.js:5`).
48. `render(<LootDropRender/>)` under a div-host mock — the `useFrame` body calls `.position.copy()` on the ref, which throws on a div; and the beam colour is a JSX prop, so the test asserts the mock.
49. `useThree: () => ({camera: null})` reused for `PointerLook` — `PointerLook.jsx:10` uses a **selector** call; the naive mock binds a truthy non-camera and the yaw-ratio assertion compares 0 to 0 and passes for the wrong reason.
50. Three-source `damageMob` matrix on one mob — the `dyingUntil` latch makes arms 2 and 3 assert about a corpse.
51. `expect(chests.length).toBe(1)` after a 3s shrine poll — the mount effect also spawns a non-shrine initial chest; filter on `shrine === true`.
52. `expect(window.playFanfare).toHaveBeenCalledTimes(1)` after one mob kill — two fire (quest completion + achievement unlock) unless `unlockedAchievements` is seeded.
53. "capture:true → no markers of any kind" — the BOSS block has no guard; the assertion would either fail or ship a behaviour change.
54. Corpus-wide `animate-<name>` resolution — `animate-pulse` ×5, `animate-spin`, `animate-ping`, `animate-bounce` are Tailwind **built-ins** absent from `theme.extend`, and `spin`/`pulse` are single-step keyframes.
55. `expect(reads.length).toBeGreaterThan(8)` on `hud-stat-wire` — 10 raw matches against a floor of 8; a routine de-monolith reds it. Assert the **deduped key set** against a named list.
56. `expect(m.length).toBeLessThanOrEqual(1)` on `pointerLockElement` — passes at **zero**; the single-authority gate survives the authority being deleted. Use `toBe(1)`.
57. `expect(glows.length).toBe(2)` in `hub-render` — reds when a fifth building gets a lantern; derive from `HUB_BUILDINGS`.

**Scope / packaging errors**
58. Renaming any gate `.js` → `.jsx` (proposed for `siege-warning`, `combat-log`, `title-screen`, `settings-a11y`, `modal-static`, `heartbeat`, `victory-audio`) — mints a new ledger path and reds the ratchet at the fix.
59. Adding a Terrain-wide `!isCaptureMode() && …<Emissive` corpus ban from the `home-anchor` commit alone — fires at four sites, three of which another recipe owns.
60. "Move the six `title-screen` style bans into `static-gates`" — no corpus font lock exists; `chrome-brand-conformance`'s CHROME map is `App.jsx` + `MenuSystem.jsx` only (a denominator **loss** dressed as consolidation); and `static-gates.jsx:91` documents the MenuSystem splash as an explicit carve-out; and `radial-gradient(ellipse at 50% 30%, #1a1040` is a MenuSystem-specific literal with no corpus meaning.
61. Ratcheting all three `static-gates` reporters — the emoji reporter's regex is a strict subset of the hard gate's (provably 0 forever) and the frosted-glass `2` are exactly the gate's own `SPLASH_DEV_BACKDROP_EXCLUDE` entries. **Only the hex reporter (441 hits / 72 files) is a real ratchet.**
62. `POST_FX` extraction for the bloom threshold — asserts the constant against itself; the current gate reads the actual call site (`GameScene.jsx:290`). A false-red risk traded for a false-green certainty.
63. "Delete the `readFileSync` from `friend-foe-gates.test.jsx` entirely" — that grep is the only tie to the production projection; re-inlining the map leaves the matrix test green while questgivers are exposed. Better: render the **real** `MinimapSyncSystem` with the captured-`useFrame` mock, seed `_lastMinimapUpdate`, and assert `isProtected(getState().mobEntities[0])`.
64. Deleting `loot-juice` test 5 — `GameMethods.spawnLootPop =` and `<LootPopRender` live in a different file (`SimplifiedNPCSystem.jsx:89/160`); a pure descriptor proves nothing about the bridge.
65. Deleting `modal-static` test 6 as a duplicate — `modal-a11y.test.jsx` never asserts the focus is **capture-gated** (`Modal.jsx:21`), which keeps three captured modal frames byte-identical.
66. Deleting `spell-motion` T2 — `T3` asserts four distinct **strings** in `spellVisualProfiles.js`; re-adding `rotation.x += 0.06` to `spellVfx.jsx` leaves them untouched. T2 is the only guard on that regression in the corpus.
67. Replacing `terrain-quest-callback` T3's file-scope count with per-call spies — a second call site **is** the double-count.
68. `pulseIntent` across "four call sites" — jump (`TouchControls.jsx:197-201`) is a press-and-**hold** and the spell picker is not an intent; routing jump through a 300ms pulse is a behaviour regression sold as a refactor. Extract for dodge + aspect sectors only.
69. `wand-economy`'s "no assertion can see the bucket" — `tests/gates/crystal-wallet-gates.test.jsx` already covers it with a negative control and an end-to-end purchase.
70. `heightat-single-source`'s "the worker cannot be imported" premise (and the same premise in `ocean-coastline` t2, `mob-los-sync`, `archer-kite-steer`'s stale header at lines 7-13, `biome-*`, `grass-revival`) — disproved by execution. **Delete `archer-kite-steer-gates.test.js:7-13` as part of its fix**; a stale justification header is exactly how a gate gets rubber-stamped STRUCTURAL on re-review.

---

## 5. The BRITTLE tail — RE-ANCHOR, not extract

A brittle gate asserts real behaviour through incidental text. The fix is usually a better anchor, not a new module. Nine gates went red at a **fix** last session; every item here is a repeat of that class.

### 5.1 The five BRITTLE files

| Gate | Fix | Detail |
|---|---|---|
| `trade-fresh-prev-gates.test.js` | **RE-ANCHOR (no extraction)** | Capturing-spy on `setInventory` at the prop boundary (Batch 7). Asserts the invariant the text pins gesture at, is immune to renames/formatting, and drops the file off the ratchet. Extraction to `tradeInventory.js` is a bonus, not the fix. |
| `touch-entry-gate.test.js` | **RE-ANCHOR** | Mock `isTouchDevice` → true, render `MenuSystem`, click the CTA, assert `setIsPointerLocked(true)`. **Drop t4 outright** — a 130-char literal `match(...).length === 1` including the arrow spelling and the `console.warn` argument name is a formatter tripwire, not a gate; eslint/knip already cover dead duplication. No seam. |
| `touch-dodge-gates.test.js` | **RE-ANCHOR → render** | The 600/300-char proximity regex is replaced wholesale by the jsdom render (Batch 1). Delete t3 (`/setIntent\('dodge', true\)/` over all of `Components.jsx` matches the **keyboard** path at :365). `pulseIntent` extraction only for dodge + aspect sectors. |
| `shrine-marker-gates.test.js` | **RE-ANCHOR + extract** | Both window boundaries are comment text (`HUD.jsx:378` `// 2c. Render nearest-SHRINE…`, :421 `// 3. Render Chest Markers.`); renumbering `2c.` → `2d.` when a marker is inserted kills the gate. Batch 8 replaces the behaviour; re-anchor t1's import pin so a second named import cannot red it. t2's `src.includes('SHRINE (')` is separately vacuous — a comment satisfies it. |
| `spell-cast-level-wire-gates.test.js` | **EXTRACT (widen) + keep a re-anchored residual** | Batch 7. Keep one structural line for the dev capture injector: `spawnDeterministicCast` sets `damage: spell.damage` (`EnhancedMagicSystem.jsx:267`) and never calls the resolvers, so no seam assertion can see it de-stabilise the spell-cast baseline frame. |

### 5.2 Brittle sub-tests inside MIXED files — RE-ANCHOR only (no extraction owed)

| Gate | Incidental anchor | Re-anchor to |
|---|---|---|
| `archer-kite-steer` | region between **comment** text (`// --- Step 3: Voxel Height-Aware …`, `ai.worker.js:330`; the gate does not strip comments, unlike its siblings) | Drop the region entirely: file-wide `not.toMatch(/steerGoalCell\(\s*playerX/)`. A prohibition needs no region. |
| `attack-telegraph` | `import { windupRamp, WINDUP_MS } from '../game/attackTelegraph'` — pins the **extensionless** specifier while `BossEntity.jsx:13` and `ai.worker.js:19` both write `.js` | Normalise the source and match either form. This is a red-at-a-fix the codebase is already 2/3 converged on. |
| `attack-telegraph` | `if (!forming && distSq < 7.56)` — a magic number the source's own comment calls "2.75 units radius" | Exported `LAVA_RADIUS_SQ` (Batch 4). |
| `atmosphere-isolation` | `(s) => s.captureStudio` selector **parameter name** | `getState()` on the store. One-token rename currently reds it. |
| `biome-flora` / `biome-foliage` | region anchor embeds the vegetation **probability literal** `0.02` | Drop the region (Batch 5). |
| `blight-marker` / `compass-hearth` / `objective-tracker` / `loot-juice` / `landmarks` / `home-anchor` | fixed character windows (1094 / 800 / 2200 / 1100 / 2600) | Batches 3 and 8 remove them. Until then, the one-line hardening is `expect(endIdx).toBeGreaterThan(-1)` — an unguarded window is how a green gate stops guarding. |
| `camera-kick` t2 | hand-typed 4-profile list while `cameraKick.js:17-30` declares **five** (`hurt` is dispatched at `Components.jsx:1150` by luck) | Iterate `Object.keys(KICK_PROFILES)` and match `KICK_PROFILES\.k|KICK_PROFILES\[['"]k`. Data-driven, self-extending, refactor-tolerant. No seam. |
| `heightat-single-source` t1 | `toContain('40 + n * 18')` — whitespace-exact | **Delete**: `tests/world/heightAt.test.js:12-21` already pins the formula as a computed value at 9 digits. |
| `hud-stat-wire` t2 | `<PlayerHealthBar\s+health=\{gameSystems\.playerHealth\}` — prop order | **Delete**: subsumed by t3's set-difference for the bug of record. (Note: it does narrow the guard against a mis-pairing to another *existing* key.) |
| `hud-stat-wire` t3 | `gs.match(/const value = \{([\s\S]*?)\};/)` **throws** on a `useMemo` wrap | Get the key list by **execution**: render `<GameSystemsProvider>` with a probe consumer (`SoundManager.audioReady.test.jsx:40-41`); keep the static all-branches read sweep. |
| `combat-keybind` t3 | `code: 'KeyF', label: 'Cast` — property order in a plain data module | Import `KEY_MAP` and assert `.find(r => r.code==='KeyF')` has `label` matching `/Cast/` and `group === 'Combat'`. |
| `allegiance` t1 | `convertMobToAlly(ecs, entity)` — argument **identifiers**; plus a two-file concatenation | Batch 9 (assert installation by execution). Widen tests 2-3 from their hard-coded 2- and 4-file lists to glob `src/` so the corpus invariant is actually corpus-wide. |
| `kill-attribution` | pins **default values** (`damage = 25`), so a balance tweak 25→30 reds the exploit gate; pins one whole `emitMobKill(...)` expression | Batch 4. Its own comment already concedes: *"Asserting the literal is what made this gate go red at the fix instead of at a regression."* |
| `ocean-depth-tint` t4 | `gerstnerDisplaceInto(_d, wx, wz, t)` — two module scratch names + three loop locals; two prior re-anchorings on record | Batch 9 (the Into-vs-object spy). |
| `terrain-quest-callback` t1/t2 | window delimited by three exact arrow-declaration spellings and their **order** | Batch 9 / DI orchestrators. Note the DI list is larger than first stated (`MINE_GAIN`, a direct `useGameStore.setState({chests})`, `idForBlock`, `buildFootprint`, `PLACE_GAIN`, `consumeForPlacement`, `triggerGPUSparks`, and a real `THREE.Vector3`). The minimum-viable `notifyBlockEdit(store, kind)` is the honest first step. |
| `boss-melee-spark` t2 | comment-delimited window (`'Boss-cone branch'` occurs once, at `Components.jsx:266`, inside a comment) | Batch 4; delete t1 as redundant. |
| `perf-config` T3.4 | `{!isCaptureMode && !isPerfProbe() && (` literal `indexOf` — one inserted space kills it | Whitespace-insensitive / AST check. The JSX-placement claim itself is legitimate. |
| `error-boundary` t2 | `border: '4px solid #0A0F1A'` and `boxShadow: '8px 8px 0 #0A0F1A'` — exact inline-style literals | Assert the rendered `<div>`'s computed presence, or drop; the DEV-gate privacy assertion is the one worth the exercise. |
| `weather-density` t1 | absence of the old bug's **exact** `useMemo(…,[])` spelling — passes on a `useRef`, a mount-time `getState`, wrong non-empty deps, or deletion | Batch 6's `useWeatherCounts` renderHook. |
| `vfx-extraction` t1 | named-import **order** + extensionless path | **Delete**: t2 proves no duplicate definition and the converted t4/t5 imports prove the path resolves — strictly more than the regex proved. |
| `proc-music-mute` t2 | one spelling (`0.75 * volume,`); `volume * 0.75` walks past, and any new ramp at a different base is invisible | **Enumerate**: scan every `.gain.linearRampToValueAtTime(<arg>` on a proc-music node and assert each `<arg>` is literal `0` or contains `procGain(`, failing with the offending line number. Structural and correct — that is the invariant. |
| `spell-vfx` line 170 | **already broken** — reports a `CastTelegraph` capture guard that does not exist | Delete it or bound the regex to the `CastTelegraph` body. Report it; do not fold it into a seam. |
| `touch-wiring` t8 | `/getInput\(\)\.active\s*\|\|\s*isCaptureMode\(\)/` is **polarity-blind** — `Terrain.jsx:241` is `if (!… || !getInput().active || isCaptureMode()) { visible = false; return; }`, an early-return suppression, and the regex matches identically if inverted | Extract `src/world/highlightGate.js` `showBuildHighlight({active, capture}) -> bool`; three lines, polarity-proof. |
| `touch-wiring` t1 | order-only across the whole file; passes if the ternary is **inverted** | Tighten to the ternary syntax `getCaptureOpts().showTouch ? <TouchControlsSurface`. |
| `music-gates` t4 / `master-bus` t3 / `look-sensitivity` t1 / `settings-a11y` `addEventListener('change', apply)` / `ability-bar` `_lastCdMirror` / `attack-telegraph` `const charging` | local identifier and dependency-array-order pins | Each replaced by its batch's behavioural assertion; where none exists (`settings-a11y`'s `apply`), match on the call shape, not the const name. |

---

## 6. Ratchet targets

**Today:** `_count: 116` in the ledger, 115 real files, `gate-shape.mjs` printing 115. **Step 0 of this plan is `node scripts/ci/gate-shape.mjs --write`** so the ratchet holds against a number that corresponds to reality.

### Confident departures (22 files reach zero `readFileSync`)
`aspect-hint-gate.test.js` (ghost) · `allocate-ui-gates.test.js` (deleted as redundant) · `ally-eyes-gate.test.js` · `audio-resume-gates.test.js` · `aspect-trees-gates.test.js` · `boss-lair-gates.test.js` · `coin-sink-gates.test.js` · `combat-log-gates.test.js` · `daynight-audio-gates.test.js` · `fade-in-keyframe-gates.test.js` · `heartbeat-stable-interval-gates.test.js` · `mob-aggro-audio-gate.test.js` · `nametags-gates.test.js` · `npc-routine-gates.test.js` · `objective-tracker-gates.test.js` · `quest-lore-gates.test.js` · `target-frame-gates.test.js` · `touch-dodge-gates.test.js` · `touch-tray-gate.test.js` · `touch-xp-readout.test.jsx` · `trade-fresh-prev-gates.test.js` · `ui-sounds-gate.test.js`

→ **115 → 93.**

### Conditional departures (8, each gated on one judgement call)
`victory-audio-gate.test.js` (only if the `App.jsx` window-bridge residual moves to e2e) · `spell-mastery-ui-gates.test.js` (only if the MenuSystem mount assertion lands) · `quest-log-gates.test.js` (same) · `modal-static-gates.test.js` (only if every panel mounts in jsdom) · `touch-entry-gate.test.js` (only if t3's `onClick={enterPlay}` grep is replaced by the click) · `bundle-split-gates.test.js` (only if `package.json` is `import`ed rather than `read`) · `m1-bugfix-gates.test.js` (same) · `blight-monolith-gates.test.js` (only if the `lairChunkLoaded` call-site anchor is dropped)

→ **best case ≈ 85.**

### The irreducible floor: **≈ 58–62**

Not a number to drive down further. It is the sum of four things that genuinely cannot be executed:

1. **Absence over a file set.** `no Math.random under capture`, `zero emoji in src/`, `no raw hex outside theme`, `no shadow-casting pointLight`, `no voxel seam on the VOIDHAND path`, `no useFrame in the clock`, `drei PointerLockControls is gone`, and every anti-resurrection ratchet. You cannot execute code that is absent. *(≈ 20 files carry at least one.)*
2. **Cardinality and single-owner.** `exactly one pointerLockElement read`, `exactly one onBlockBreak call site`, `no second definition of WINDUP_MS`, `no duplicate hasLineOfSight`, `columnTops is called from both worker paths`, `no other file computes the level-up formula`. A duplicated constant is invisible to execution of the shared one; a second call site is invisible to a per-call spy. *(≈ 14 files.)*
3. **Mount / reachability whose host is not jsdom-renderable.** Anything inside `Terrain.jsx` (imports Rapier + `?worker`), `GameScene.jsx`, or `App.jsx`'s root effects. After every seam in this plan lands, "the game actually calls this" remains a source claim for those three files. *(≈ 16 files.)*
4. **Build-graph and config facts.** `package.json` scripts, shipped `<head>` tags, on-disk asset sizes, the `gameSystems.*` all-branches sweep, the proc-music ramp enumeration. *(≈ 8 files.)*

**The honest framing for the status doc:** the ratchet is not a debt counter. Roughly **half** of the population is correct and should never move; the work is the other half, and the yield is concentrated — Batches 0, 1, 2 and 3 alone account for ~40 of the ~52 gates that change, because the same four unlocks (the worker harness, the jsdom render harness, the SoundProvider graph harness, and `CaptureNullGlow`) sit under most of them.