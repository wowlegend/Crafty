# Crafty Phase 2 "The first minute" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A stranger sees Crafty at its best within one second, and a new player has fought as the beast inside the first minute or two (Goal below).

**Architecture:** The title stays one lazy R3F canvas (`render/TitleDiorama.jsx`), recomposed and made cheaper: golden-hour light, a small voxel island built by the real mesher, soft-disc motes in one instanced draw, a slow orbit, a dpr cap and pacing. The Ember Prologue is a pure reducer (`game/prologue.js`) driven by a lazy-loaded director that reads the store with `getState()`, the ECS with `mobsQuery` and a small combat-signal bus, and applies its effects through store actions. Nothing per-frame goes through React state.

**Tech Stack:** React 19, R3F 9.5, three 0.172 (no bump), zustand 5, miniplex ECS, vitest (node and jsdom), Playwright (Chromium SwiftShader in CI), the Phase 0d lookbook (prod build, real GPU, Chromium ANGLE-Metal and WebKit).

**Spec:** `docs/superpowers/plans/2026-10-27-crafty-masterpiece.md` (Phase 2, "The first minute"), roadmap move 6 in `docs/superpowers/masterpiece-2026-10/roadmap-2026-10-27.json`, refute F9 and the move-6 row in `docs/superpowers/masterpiece-2026-10/refute-2026-10-27.md:66-68,97,110`. Where they differ, the umbrella plan wins (it applies the refute).

**Paths.** ROOT = `<repo>` (docs, plans, memory). APP = `<repo>/frontend` (source in `frontend/src`, tests in `frontend/tests`). Every command below runs from APP unless it says otherwise. Every path in this plan is APP-relative unless it starts with `docs/` (ROOT-relative).

---

## Goal

When Crafty opens, the first thing on screen is a small floating island at golden hour: the hero on the left of the frame with the staff tip glowing, the Hearth, a hut, two trees and a shrine beam, ringed by sea and drifting cloud, while the camera turns slowly around it. The wordmark sits clear of the hero's face, the tagline says what the game actually is (four Aspects, a frontier, a dragon), and every word on the screen reads in Chinese when the player picks Chinese. A brand-new player who presses Start lands at the Hearth in daylight; Old Pike calls out, a horn sounds, and two ember husks and a moss brute come from a bearing the objective arrow marks. Old Pike teaches the dodge, then the charged heavy, and when the brute winds up the game lends the player one roar: they become the beast and clear the wave. Then the ember sleeps, and the game says plainly how to earn it back. The fight is gentle enough for an eight-year-old, it never coincides with a siege night, it can be skipped, it plays once per browser profile, and it can be completed on an iPad with the press-and-hold controls.

## Current state (cited, read 2026-10-27 on `main` at `f0e84766` unless a branch is named)

**The title screen.**
- `src/MenuSystem.jsx:258` mounts `<TitleDiorama />` inside `<Suspense>`; the diorama is a lazy import (`:32-34`). A local build dated 2026-10-27 05:22 put it in its own chunk, `TitleDiorama-*.js`, at 5,552 B.
- The layout anchors everything to the bottom: the container is `justify-end pb-16` (`:248`). The wordmark is `text-8xl` (`:268-276`) and the scrim is a full-height gradient, 0 to 0.86 alpha over the lower 72% (`:262-265`). Roadmap move 6 records, from the opened `menu.png`, that the wordmark sits over the mascot's face.
- Three player strings are hardcoded English: the wordmark `Crafty` (`:275`), the tagline `Build • Craft • Cast Spells • Explore` (`:295`) and `Start Adventure` (`:304`). The controls strip below them already goes through `t('hint.*')` (`:326-336`).
- `src/render/TitleDiorama.jsx` renders the hero (`MascotCraftyHero`, `:168-170`) on a brown disc plinth (`:172-175`), lit by fixed hex constants (`:19`, `:164-166`). There are 28 motes, each its own mesh with its own plane geometry and material (`:40`, `:63-68`), so 28 draw calls. The hero is the larger cost: `MascotCraftyHero` has 30 `Cube`s, 21 of them with a drei `Outlines` mesh (`src/render/mascots/voxelKit.jsx:14-20`; 9 pass `outline={0}`), plus 10 `Emissive`/`Ink` cubes, so about 61 draws. Today's title is therefore about 90 draws (hero 61, motes 28, plinth 1), counted by reading the source; Unit 3 Step 5 measures it. The camera sways ±0.7 about `CAPTURE_CAM` rather than orbiting (`:95-99`). The DPR is `[1, 2]` (`:149`), antialias is on (`:158`) and the frameloop is `always` outside capture (`:157`).
- Capture determinism for this canvas is gated in `tests/gates/capture-dpr-gates.test.jsx` (pinned DPR, and a canonical pose that is the drift centre). `tests/gates/title-screen-brand-gates.test.js` asserts the mount.
- On `feat/steady-cool` (Phase 0g, not yet on main), the diorama gains `<FrameCap>` at the player's cap, MenuSystem publishes `titleCovering`, and `render/canvasPace.js` paces the GAME canvas behind the title at `TITLE_FPS = 10`. It is paced rather than stopped so that shaders stay compiled and the world stays warm. So the title runs two WebGL contexts.

**i18n.**
- `t()` falls back from locale to `en` to the key itself (`src/i18n/i18n.js:12-17`). The `en` table is `src/i18n/strings.js:5-169` and `zh-CN` is `:170-315`, and `tests/i18n/i18n.test.js` enforces key parity. Aspects are `化身之力` in zh-CN (`:268`).
- The adoption ratchet reads 0 (`tests/i18n/.i18n-adoption-ledger.json` → `"_total": 0`), but its detector only sees a `>text<` pair on ONE line (`scripts/ci/i18n-adoption.mjs:101-107`). That is why all three title strings above passed it.
- A heuristic scan written for this plan (a scratch script, not a gate) found about 37 such multi-line or after-self-closing text nodes in 13 files, among them `GameSystems.jsx` "YOU DIED" and "VICTORY", `WorldManager.jsx` (9) and `GamePanels.jsx` (8). The detector's own count is the authority. This one is an estimate.

**Onboarding and time.**
- `src/App.jsx:115-137`: when the spawn chunk loads, a fresh profile gets two toasts at 1.6 s and 8.6 s, and `localStorage['crafty_onboarded']` is written at `:124`. That write happens while the title is still up, before the player presses Start.
- The day clock advances 4 units/s (`src/game/dayNight.js:26`) against a 600-unit half cycle (`:13`), so a day lasts 150 s. A fresh store starts at `gameTime: 0` (`src/store/useGameStore.jsx:803`), which is dawn.
- `setGameTime` bumps `nightCount` on the crossing into night (`useGameStore.jsx:817-821`), and the siege ramps from that (`siegeParams`, `dayNight.js`).
- The ticker advances only when `shouldAdvanceClock` allows it (`dayNight.js:76-78`; `src/game/useDayNightClock.js:21-31`). A new player therefore meets siege night 1 about 150 s of active play after Start, and with the upside's golden-hour start (refute `:110`) it would be about 45 s.

**The beast form, and why a new player cannot reach it.**
- The roar charges for `ANTICIPATION_SEC = 0.45` and the form lasts `FORM_DURATION_SEC = 14` (`src/game/beastTransform.js:12-13`). `canEnter` gates both the start of the charge and the commit (`:57-60`, `:66`).
- `canEnter` is a full Ferocity bank AND the `wildheart_roar` talent (`src/Components.jsx:635`). Entering spends `FEROCITY_THRESHOLD` (`:649-653`).
- Pressing R while locked fires the "aspect-locked" toast (`:391-394`). The cooldown mirror marks the roar "owned" from the talent alone (`:1029`).
- `wildheart_roar` requires `wildheart_vigor` (`src/game/talentTree.js:34`), and each level grants one talent point (`useGameStore.jsx:413`). So the earliest real roar is at level 3, with a full bank.
- On touch, main shows only unlocked Aspects (`src/ui/TouchControls.jsx:155-157,236`; `src/input/aspectWheel.js:54-57`), which is refute F9.
- On `feat/touch-hold` (Phase 0c, not yet on main), `aspectRing(unlockedTalents)` shows every Aspect with locked ones marked, and a locked sector opens Talents. The roar sector is press-and-hold through `makeIntentHold`, and the action button is press-and-hold through the store seams `pressPrimary` / `releasePrimary` (source `'touch'`).

**Mobs.**
- `spawnMob(x, z, forceType, explicitY)` is a closure published on the store (`src/systems/SpawnerSystem.jsx:27`, `:88`).
- On a fresh world, a ring of 20 random mobs spawns 30-50 m out, and the day pick draws from ALL types, hostile ones included (`:47-53`, `:97-107`). By weight about 70% of that pick is hostile (hostile weights sum to 6.15 against 2.6 passive, `src/game/mobTypes.js:7-20`). The ring fires as soon as `isSpawnChunkLoaded` is true, which happens while the title is still up, BEFORE Start. The dynamic spawner tops up to `siegeParams(0).maxMobs` = `DAY_MAX_MOBS` = 16 by day (`:155`; `dayNight.js:90`), so 20 boot mobs already exceed it.
- Skeleton arrows hard-code `damage: 15` (`src/workers/ai.worker.js:216`); a per-spawn damage override never reaches them.
- Melee damage is the entity's own `damage` field, which travels through `mobStateSync.js:49` to `ai.worker.js:229,255`. A per-spawn damage override therefore reaches the strike.
- The wave's types are `emberhusk` (95 HP, 13 damage) and `moss_brute` (220 HP, 25 damage) (`src/game/mobTypes.js:16,20`).
- The kill bus carries `(mobType, position, source)`, not an entity id (`src/game/mobKillBus.js:25`).

**Combat verbs the prologue teaches.**
- Dodge starts at `Components.jsx:979`, and the perfect-dodge branch is `:998` (window `PERFECT_WINDOW_MS = 220`, `src/game/perfectDodge.js:15`). The heavy throws in `releaseHeavySwing` (`Components.jsx:543`).
- None of the three emits an event a director could observe. The cooldown mirror is a 150 ms throttled proxy.

**HUD.** `ObjectiveTracker` (`src/HUD.jsx:206-246`) points at the nearest shrine, or else at the Blight Heart, and has no override seam. Compass markers are built at `:317-400`.

**Bundle.** The `index` ceiling is 760,000 B (`scripts/ci/bundle-budget.mjs:35`). The 05:22 local build measured `index` at 696,924 B, which leaves 63,076 B of headroom for every Phase 1-3 move together.

**Harnesses.**
- Playwright gives each test a fresh browser context (`playwright.config.js`: Chromium SwiftShader, 1280x800, 120 s per test). `tests/e2e/_fixtures.js` seeds no storage.
- The visual and probe scripts launch fresh profiles too. Once a prologue exists, every one of them would meet it unless they are seeded. There is NO shared launcher: each script calls `browser.newPage()` itself (puppeteer, so seeding is `evaluateOnNewDocument`, not Playwright's `addInitScript`). On main, 31 files under `scripts/` create pages: 29 in `scripts/visual/`, plus `scripts/perf/run-scenarios.mjs` and `scripts/ci/prod-smoke.mjs`. `scripts/visual/lookbook.mjs` (feat/instruments) is a 32nd once that branch lands.
- `tests/e2e/` has 27 `*.spec.js` on main.

## Design

Each move states its GPU cost and its main-chunk (`index`) byte cost. Byte numbers are estimates until the unit's own `node scripts/ci/bundle-budget.mjs` run prints the drift. **This milestone's total main-chunk ceiling is +6,000 B**, which is about 10% of the remaining headroom. The rows below total about +5.45 KB (D1-D11: 0.6 + 0.3 + 0.1 + 0 + 0.3 + 0.1 + 0.4 + 0.4 + 0.35 + 2.9 + 0), which leaves about 0.55 KB of margin; the first amendment pass found the earlier rows summing to 6.2 KB, over their own ceiling. A unit that would cross it splits its code into a lazy chunk before it lands, and a lazy split is only real when the bundle check proves a marker ABSENT from `index` (Unit 10 Step 5).

| # | Move | GPU cost | Main-chunk bytes |
|---|---|---|---|
| D1 | **Title strings through `t()`**, a rewritten tagline, and an i18n detector that sees multi-line text nodes | 0 | +~0.6 KB (3 keys × 2 locales; each key is added in the unit that first renders it) |
| D2 | **Recomposed title**: the wordmark in a top band with an ink drop shadow, a bottom-25% scrim band, the CTA in clear space, and the hero on the left third (centred in portrait). The camera orbits the HERO and a lens shift (`setViewOffset`) places it, so the composition holds at every orbit angle. The pose is derived from a projection check, not by eye alone | 0 | ~+0.3 KB (layout constants in MenuSystem) |
| D3 | **A cheaper, living title canvas**: golden-hour light from the Phase 1 colour script; 28 motes become ONE instanced soft-disc draw (a pure GLSL string module with a JS mirror); a true orbit at 0.02 rad/s; DPR from the SAME per-tier pixel budget as the game canvas (steady-cool's `pixelBudgetDpr`), capped at 1.5 and never above the game tier's budget; antialias off on a coarse pointer; frames paced to `min(30, cap)`, with 30 under Unlimited | **Lower by expectation, unmeasured until the Unit 12 A/B.** Draws ~90 to ~63 (the motes go 28 to 1; the hero's ~61 draws stay, and they are the dominant draw cost). Pixels follow the tier budget: iPad Pro 11 (1180x820 CSS, low tier) renders at dpr 1.25 = 1.51 Mpx instead of `[1, 2]`'s up to 3.87 Mpx; a 16-inch M3 Max (1728x1117, high) at ~1.47 = 4.2 Mpx instead of up to 7.7. Frame count halves at a 60 cap. **Look risk, stated:** MSAA off on a coarse pointer with a continuous orbit over high-contrast voxel and outline edges can crawl; Unit 12 judges it on WebKit iPad frames with the orbit in motion, and antialias comes back on if it does. The game canvas behind stays at steady-cool's 10 fps | ~+0.1 KB (the `title.aria.vista` key); the code is in the TitleDiorama chunk only (+~1 KB there) |
| D4 | **The island**: an authored 16×256×16 voxel chunk (an island of radius 7, the Hearth pad, a hut, two trees, a shrine with its beam) meshed ONCE by the real `generateMesh` and drawn with the real terrain material, extracted from `Terrain.jsx` into a per-instance factory; a flat sea ring and four cloud cards | **+1 island draw, +1 beam, +1 ring, +4 cloud cards** (≈ +7 draws; triangle count measured in the step, expected a few thousand). **Fill:** the full terrain fragment chain (texture-array sampling, cloud shadows, aerial perspective, land grade; `Terrain.jsx:56-67`, `:236-251`) over the island's screen area at 30 fps. **Compile:** one more terrain program, compiled in the title's own WebGL context (ms measured). One upload of the voxel texture array into that context (bytes measured). One main-thread mesh of one chunk at title mount (ms measured). The draw count cannot see fill or compile cost; the Unit 12 A/B can. **Fallback** if the A/B shows the island costs more than Unit 3 saved: a `MeshLambertMaterial` with the mesher's vertex `color` attribute, no texture array and no injected terms | ≈0 net: the factory MOVES out of `Terrain.jsx`. The mesher (15,935 B of source) lands in the lazy TitleDiorama chunk, never in `index` |
| D5 | **Prologue core**: a pure reducer, once-per-profile eligibility, spawn candidates, timeouts and the damage scale, in TWO modules: `src/game/prologueFlags.js` (keys and `prologueEligible`; main chunk, read at boot) and `src/game/prologue.js` (reducer, candidates, constants; imported ONLY by the lazy director). Rollup places a module in one chunk with every export the graph uses, so one shared module would pull the reducer into `index` | 0 | +~0.3 KB (the flags module only) |
| D6 | **Not a siege night**: the clock HOLDS while the prologue runs, so a new player keeps the whole 150 s day after it, and `nightCount` stays 0 through it | 0 | +~0.1 KB |
| D7 | **The lent roar**: one `canEnterRoar` predicate used at all three roar sites in `Components.jsx`, plus `aspectRing` reading the grant, so the touch sector is live while lent (F9) | 0 (the beast form's existing cost, once) | +~0.4 KB |
| D8 | **Combat signals**: a tiny emit/subscribe bus with three emits in `Components.jsx` (dodge, perfect dodge, heavy) | 0 | +~0.4 KB |
| D9 | **Spawner seams**: `spawnMob` accepts whitelisted overrides (`prologue`, `damage`), and while `prologueActive` is true, every unforced spawn (the boot ring and the dynamic spawner, both of which reach the pick through `spawnMob`) picks passive types only. `prologueActive` is armed AT BOOT on an eligible profile, before the boot ring can fire, and cleared on every prologue end | 0. Mobs during the prologue: the 20-mob boot ring (all passive on an eligible profile) plus the 3 scripted, so 23, above `DAY_MAX_MOBS` = 16 exactly as today's 20-mob ring already is; the dynamic spawner adds none while 16 or more are alive. Zero ambient hostiles. A new player's first day after the prologue also starts with a passive ring; hostiles return as the dynamic spawner tops up | +~0.35 KB |
| D10 | **The director, the coach, the skip and the objective arrow**: a lazy `PrologueDirector` chunk (a 250 ms interval, no React per-frame state) and a lazy `PrologueCoach` DOM panel outside the centre third, with the QuestTracker collapsed while it shows; Skip in the Settings/pause panel (the surface ESC opens after Start, on desktop and touch) and on the coach (a button on touch, a one-line "Esc, then Skip" hint on desktop, where the cursor is locked); the objective arrow points at the wave; the onboarding toasts AND the `crafty_onboarded` write deferred until the prologue ends | 0 GPU (DOM text, transitions only) | +~2.9 KB (≈20 coach and skip keys × 2 locales in `strings.js`, plus the lazy-import stub, the store fields and the QuestTracker collapse). Director, coach and the Settings Skip button live in lazy chunks |
| D11 | **Harness hygiene**: the e2e fixtures and every page creator under `scripts/` (through one new helper, `scripts/visual/_profile.mjs`; there is no shared launcher today) seed a returning profile by default; specs and scripts opt into `fresh` | 0 | 0 |

**Rejected for now, and why (Compose / Door):**
- *One surface at the title* (the game canvas renders the vista and the diorama canvas is deleted; upside R7). It would remove a WebGL context and show the real world. But it needs the title camera to own `camera` against the Player's `useFrame` in `Components.jsx`, which is the irreducible controller where ordering is a decision of record. It would also run the full post chain at the title.
- The door stays open: D4's extracted terrain material is the same material, so moving the island into the game canvas later is mechanical. It becomes the plan if Kevin's iPad turns out to be on Safari < 27 and shows the stacked-canvas regression (umbrella open question).
- *Prologue as the first siege at golden hour* (upside S6). Overruled by the umbrella: a new player must not face siege night 1 inside the prologue (refute `:110`).

## Global Constraints

- Death stays soft (`docs/superpowers/DECISIONS.md`, 2026-10-27). The prologue never forfeits anything, and a death in it ends the prologue gently.
- No WebGPU/TSL and no three.js or R3F bump. A new shader term is a pure GLSL string module with a JS mirror, in the `src/world/oreGlow.js` / `leafFeel.js` pattern.
- Bundle: the `index` ceiling is 760,000 B (`scripts/ci/bundle-budget.mjs:35`), and this milestone adds at most +6,000 B to `index`. Rare-moment code (the director and the coach) lives in lazy chunks.
- Heat: no move adds GPU cost without stating it in its unit. The iPad (low tier, WebKit) must stay correct.
- Game-loop isolation: per-frame systems read `useRef`, `useGameStore.getState()` and miniplex queries. React subscribes only to rare transitions (`prologueStep`, `prologueCoach`, `prologueRoarGrant`, `locale`).
- i18n: every player-visible string in `en` and `zh-CN` (`src/i18n/strings.js`). Plain spoken mainland Chinese, Simplified. No key names on touch (touch prompts never say "Shift" or "R").
- No emoji anywhere in `src/` (a hard gate).
- Touch: every verb the prologue asks for is performable on an iPad with Phase 0c's controls: dodge (the dodge button), heavy (hold the action button), roar (hold the WILDHEART sector), Start (CTA tap) and Skip (the coach button).
- Visual-baseline re-shoots are their own `Baseline-Review:` commit and are never bundled with `src/`. A new or rewritten gate under `tests/gates/` or `scripts/ci/` carries a `Mutation-Proof:` trailer.
- Commits: no "Generated with" or Co-Authored-By footer; fix-ups are new commits.
- AST-safe edits only (no `sed` on `.js/.jsx`).
- After any browser run: `sh scripts/dev/kill-test-procs.sh`. Never run e2e or dev servers on a loaded machine (`uptime` first). CI runs the e2e suite.
- Review: a fresh `/code-review xhigh` per change range, plus one adversarial reviewer at **xhigh** (never max) on the runtime seams (D7, D9, D10). These run as Workflow stages with `model: 'claude-opus-5-5'`, `effort: 'xhigh'`.

## Review Focus

The five failure modes most likely to bite a person, which the units' tests must pin. Each line names the owning unit's test.

1. **A returning player meets the prologue.** A legacy profile has `crafty_onboarded`, and `App.jsx:124` writes that key at world build, BEFORE Start. Eligibility read after that write would call every new player "returning", and eligibility read without the legacy key would ambush every old player. *Expected:* eligibility is read once at boot, before the onboarding effect. Any prologue flag value, or the legacy key, means ineligible, and a reload mid-prologue never restarts it. On an eligible profile the `crafty_onboarded` write itself is deferred to the prologue's end, so a reload on the title before Start does not turn a new player "legacy". Pinned by Unit 5 (`prologueEligible` truth table) and Unit 11 (cases B, C, D and D0).
2. **Every harness boots a fresh profile.** Without seeding, all 27 e2e specs and the 31 page-creating scripts would meet the prologue: the held clock breaks `day-night-cycle.spec.js`, the passive-only spawner breaks mob specs, and the coach overlays frames. *Expected:* the fixtures and one shared script helper seed `done` by default and a spec opts into `fresh`. Capture mode is NOT a boot-time input (the harness enters it after `__craftyTest.ready()`), so eligibility cannot see it; the guard is the director's per-tick capture check. Pinned by Unit 10 (a seeding test over every page creator under `scripts/`, plus a jsdom test that the director does nothing under capture, with a capture-off presence control).
3. **Input dies mid-prologue** (ESC pause, a panel, death, a save loaded from WorldManager). *Expected:* step timeouts count active time only; death or a save load ends the prologue cleanly (the lent roar is revoked, the clock released, `prologueActive` cleared, the flag set to `done`); a pause resumes where it was. Pinned by Unit 5 (reducer cases), Unit 10 (effect applier cases), Unit 10's pure `buildObs` test (death and a load REACH the reducer as `alive: false` and `saveLoaded: true`) and one jsdom director test that calls `loadWorldData` mid-prologue.
4. **The wave cannot spawn**: the bearing lands on water, the ground probe is absent, or the spawn chunk is not loaded (the `dodge-latch` lesson, `.claude/rules/gates-and-probes.md` 4d). A held clock that is never released is a world where night never comes. *Expected:* bounded retries over the candidate bearings for at most 10 s, then a clean end with the flag set and the clock released, logged. Pinned by Unit 5 (`spawn-failed` path) and Unit 10 (the applier releases the clock on every terminal effect).
5. **The player never roars** (an eight-year-old who does not find R, or a touch player who never opens the ring). *Expected:* on touch the ring opens itself during the roar beat with the WILDHEART sector live; the roar step times out after 25 s of active time, the lent roar is revoked, and the closing line still teaches the real path. Pinned by Unit 7 (the grant opens the sector) and Unit 5 (timeout revokes the grant).

---

## Units

The order is the build order. Each unit is independently shippable on its own branch off the previous one. Every step names its file. Test commands run from APP: `npx vitest run <file>`.

### Unit 0: Preconditions (no code)

**Files:** none.

- [ ] **Step 1: Confirm the base carries Phase 0c and Phase 0g.** Run from ROOT:

```bash
git merge-base --is-ancestor feat/touch-hold main && echo touch-hold-merged
git merge-base --is-ancestor feat/steady-cool main && echo steady-cool-merged
git merge-base --is-ancestor feat/parked-looks-perf main && echo parked-merged
```
Expected: all three lines print. If `feat/touch-hold` is not merged, Units 7, 10 and 11's touch cases WAIT for it, because the lent roar has no touch sector without `aspectRing` (F9). Units 1-6 do not depend on it.

- [ ] **Step 2: Confirm the light and colour script's palette seam.** Unit 3 consumes the golden-hour key from the Phase 1 colour script, whose plan (`docs/superpowers/plans/2026-10-27-crafty-light-colour-script.md`) was still a skeleton when this plan was written. Record its exported name and signature here before Unit 3 starts. That plan now specifies the seam as `sampleScript(f, out?) -> ScriptFrame` in `frontend/src/render/colourScript.js` (`docs/superpowers/plans/2026-10-27-crafty-light-colour-script.md:175,264-266`), where `f` is the day fraction, colours are LINEAR `THREE.Color`s, and the frame also owns `motes`. `titleLight.js` calls `sampleScript` at the golden-hour key's anchor (that plan's `keyFrame(name)`), converts linear to sRGB hex with `color.getHexString()` (three 0.172's `getHex` defaults to sRGB output from the linear working space, `node_modules/three/src/math/Color.js:353`; never read `.r/.g/.b` as sRGB, and never add a second manual `convertLinearToSRGB`, which would convert twice), and takes the mote tint and strength from `frame.motes`. If that lane has not landed, Unit 3 ships with authored constants in `titleLight.js` and a TODO-free note pointing at this step.

- [ ] **Step 3: Create the branch** `feat/first-minute` from main, and run `node scripts/ci/bundle-budget.mjs` after `npm run build` to record the `index` baseline bytes in the first commit message.

### Unit 1: Title strings through `t()`, and the detector that missed them

**Files:**
- Modify: `scripts/ci/i18n-adoption.mjs:90-110` (`scanSource`)
- Modify: `tests/i18n/adoption.test.js` (detector-accuracy fixtures)
- Modify: `tests/i18n/.i18n-adoption-ledger.json` (re-frozen by the tool)
- Modify: `src/MenuSystem.jsx:275,295,304`
- Modify: `src/i18n/strings.js` (en block before `:169`, zh-CN block before `:315`)
- Create: `tests/gates/title-i18n-gates.test.jsx` (copy the render harness of `tests/integration/esc-resume-recovery.test.jsx`)

**Interfaces:**
- Produces: string keys `title.wordmark`, `title.tagline` and `title.start`, each rendered in this unit. A key is added in the unit that first renders it, because `tests/i18n/key-resolution.test.js:96-99` fails on any dictionary key with no reachable use: `title.aria.vista` lands in Unit 3 and the skip keys in Unit 10.

- [ ] **Step 1: Write the failing detector fixtures** in `tests/i18n/adoption.test.js`, inside `describe('i18n adoption detector accuracy')`:

```js
it('finds a JSX text node whose text sits on its own line', () => {
  const src = ['        <motion.p className="x">', '          Build • Craft • Explore', '        </motion.p>'].join('\n');
  expect(texts(src)).toEqual(['Build • Craft • Explore']);
});
it('finds text that follows a self-closing tag on the same line', () => {
  expect(texts('            <Icon name="sword" size={22} /> Start Adventure')).toEqual(['Start Adventure']);
});
it('does NOT read a multi-line JS expression as a text node', () => {
  // no code punctuation in the middle line, so isProse alone accepts it: only the new branch's
  // previous-line-is-a-tag rule can reject it (the old `threshold && b` fixture was rejected by
  // the EXISTING `&&` filter at i18n-adoption.mjs:75, so it could not kill a mutant of the new rule)
  const src = ['    const ok = a >', '      plain words here', '    < limit;'].join('\n');
  expect(texts(src)).toEqual([]);
});
```

- [ ] **Step 2: Run it.** Run: `npx vitest run tests/i18n/adoption.test.js`. Expected: the first two FAIL (`[]` received), and the third passes (today's detector has no multi-line branch at all).

- [ ] **Step 3: Widen `scanSource(src)` in `scripts/ci/i18n-adoption.mjs`.** Recognise (a) a line whose trimmed text passes `isProse`, sits between a previous non-blank line ending in `>` (not `=>`) and a next non-blank line starting with `<` or `{`, and starts with neither `<`, `{`, `//` nor `*`; and (b) prose after `/>` to the end of the line. Keep the comment skip. The third fixture must stay green: a line ending in a bare `>` operator is not a tag close, so branch (a) REQUIRES the previous non-blank line to match `/<[A-Za-z][^>]*>\s*$/` (an opening tag at the end of the line). That rule is what the third fixture pins (M1.4).

- [ ] **Step 4: Run it.** Run: `npx vitest run tests/i18n/adoption.test.js`. Expected: the three new fixtures pass. The ratchet tests FAIL, because the detector now sees the existing debt (about 37 by the scratch estimate).

- [ ] **Step 5: Freeze the newly visible debt.** Run: `node scripts/ci/i18n-adoption.mjs --list`, check every hit by hand (gates-and-probes 3c: a false positive widens the detector, never an exemption), then `node scripts/ci/i18n-adoption.mjs --write`. Record in the commit message the new `_total`, the per-file counts, and that the ceiling rose once because the detector became able to see, with no copy added.

- [ ] **Step 6: Write the failing title gate** `tests/gates/title-i18n-gates.test.jsx`. Render `<MenuSystem>` with the title visible (`isPointerLocked={false}`, no panels) twice: once with `useGameStore.setState({ locale: 'en' })` and once with `'zh-CN'`. Mock `./render/TitleDiorama` to return null, and mock the lazy panels as the integration harness does.

```js
expect(screen.getByTestId('title-tagline').textContent).toBe(STRINGS['zh-CN']['title.tagline']);
expect(screen.getByTestId('title-start').textContent).toContain(STRINGS['zh-CN']['title.start']);
expect(document.body.textContent).not.toMatch(/Start Adventure|Build • Craft/);
// presence before absence: the same render in en DOES show the en strings
```

- [ ] **Step 7: Run it.** Run: `npx vitest run tests/gates/title-i18n-gates.test.jsx`. Expected: FAIL (no `data-testid="title-tagline"`; English strings present).

- [ ] **Step 8: Route the three strings through `t()`** in `src/MenuSystem.jsx` and add `data-testid="title-wordmark" | "title-tagline" | "title-start"`. Add the keys to both locales in `src/i18n/strings.js`:

| key | en | zh-CN |
|---|---|---|
| `title.wordmark` | `Crafty` | `Crafty` (brand stays Latin; see Open questions) |
| `title.tagline` | `Four Aspects. One frontier. A dragon at the edge of the world.` | `四种化身之力，一片边疆，世界尽头有一条龙。` |
| `title.start` | `Start Adventure` | `开始冒险` |

- [ ] **Step 9: Re-freeze, then run.** The ledger is a ceiling that only falls when re-frozen (`tests/i18n/adoption.test.js:78-81` compares against the frozen count; nothing checks that the ledger is tight). Run `node scripts/ci/i18n-adoption.mjs --write`, record the re-frozen `_total` (Step 5's value minus 3) in the commit message, then `npx vitest run tests/gates/title-i18n-gates.test.jsx tests/i18n/`. Expected: PASS, including `tests/i18n/key-resolution.test.js` (no dead keys: each of the three new keys has a literal `t('title.*')` use). `MenuSystem.jsx` is at 0 in the ledger (or absent from it).

- [ ] **Step 10: Commit** with a `Mutation-Proof:` trailer recording these mutants, each observed RED, restored from a `cp` backup:
  - **M1.1** In `scanSource`, delete branch (a): the own-line fixture goes red.
  - **M1.2** Put `Start Adventure` back as a literal at `MenuSystem.jsx:304`: `title-i18n-gates` goes red, and the adoption ratchet goes red too (MenuSystem 0 to 1, against the Step 9 re-freeze; without that re-freeze the frozen 3 would absorb it).
  - **M1.3** Delete the zh-CN `title.tagline`: `tests/i18n/i18n.test.js` parity goes red, and `title-i18n-gates` falls back to en and goes red.
  - **M1.4** In branch (a), drop the previous-line-is-a-tag requirement (accept any previous line ending in `>`): the third fixture goes red.
  - **M0 identity** A comment edit in `MenuSystem.jsx`: all green.

### Unit 2: The recomposed title (layout, no GPU)

**Files:**
- Create: `src/render/titleComposition.js` (pure: the layout bands and the camera framing)
- Create: `src/render/titleComposition.test.js`
- Modify: `src/MenuSystem.jsx:248-338` (the title block)
- Modify: `src/render/TitleDiorama.jsx:80-99` (pose from the composition module)

**Interfaces:**
- Produces:
  - `WORDMARK_FONT = { maxPx: 96, vh: 0.11 }`: the wordmark's font size is `min(96px, 11vh)`, read by BOTH `MenuSystem.jsx`'s style and the band math, so the band follows the rendered wordmark instead of a constant fraction (a fixed `text-8xl` is 96 px, which is 25% of a 390 px phone-landscape height on its own).
  - `titleBands(viewportH: number) -> { wordmarkTop, wordmarkBottom, scrimTop }` (fractions of viewport height). `wordmarkTop = 0.06`; `wordmarkBottom` is `wordmarkTop` plus the wordmark line and the tagline block derived from `WORDMARK_FONT` at that height; `scrimTop = 0.75`.
  - `titleFraming(aspect: number) -> { target: [x,y,z], camPos: [x,y,z], fov: number, shiftX: number }`. `target` is ON the hero (the orbit centre); `shiftX` is the horizontal lens shift, as the hero centre's on-screen displacement in fractions of the view width (negative moves it left; landscape ≈ −0.17 puts it near x = 1/3), applied with `camera.setViewOffset` (a positive offset `x` moves the visible window right, so the content moves left: `x = -shiftX * w`). Landscape (`aspect >= 1`) shifts the hero onto the left third; portrait uses `shiftX = 0` and centres the hero below the wordmark band. Because the camera orbits the point it looks at and the shift is a lens shift, the hero's screen position does not depend on the orbit angle.
  - `heroScreenBox(framing, aspect, orbitAngle = 0) -> { x0, x1, y0, y1 }` and `heroFaceBox(framing, aspect, orbitAngle = 0)` (the face sub-box), in 0..1 screen fractions (y down). Both project bounding-box corners with a three `PerspectiveCamera` carrying the same view offset (three runs in node).
  - `OLD_WORDMARK_RECT_1180x820 = { x0, x1, y0, y1 }`: today's wordmark rectangle, MEASURED once in a real browser (Step 1a), written as a constant with that provenance.
- Consumes: `CAPTURE_CAM` semantics from `TitleDiorama.jsx`. The capture pose becomes `titleFraming(1180/820).camPos` at orbit angle 0, and the existing capture gates must stay green.

- [ ] **Step 1a: Measure the defect before changing it.** On main, before any layout edit, run a scratch puppeteer probe on the dev server at 1180x820 (seeded, `_serve.mjs`, swept after) that reads `getBoundingClientRect()` of the wordmark `<h1>` and writes `OLD_WORDMARK_RECT_1180x820` as fractions. Delete the probe after; the constant and its provenance comment are the record. The reviewer's projection of today's pose (repro 2026-10-27) puts the hero's hat top at y ≈ 0.28 and the face centre at y ≈ 0.60, so the defect is the bottom-anchored wordmark sitting on the FACE, not the head reaching a top band.

- [ ] **Step 1: Write the failing test** `src/render/titleComposition.test.js`:

```js
const VIEWPORTS = [[1180, 820], [820, 1180], [1280, 800], [844, 390]]; // 844x390: iPhone landscape
const ORBIT = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
it.each(VIEWPORTS)('at %ix%i the hero clears the wordmark band and the scrim at every orbit angle', (w, h) => {
  const bands = titleBands(h);
  for (const a of ORBIT) {
    const box = heroScreenBox(titleFraming(w / h), w / h, a);
    expect(Number.isFinite(box.y0) && box.y1 > box.y0, `presence: a real box at ${a}`).toBe(true);
    expect(box.y0, `hero head under the wordmark at ${a}`).toBeGreaterThan(bands.wordmarkBottom);
    expect(box.y1, `hero feet above the scrim band at ${a}`).toBeLessThan(bands.scrimTop + 0.1);
    expect(box.x1 - box.x0, 'hero is visible, not a speck').toBeGreaterThan(0.06);
  }
});
it('landscape puts the hero on the left third, at every orbit angle', () => {
  for (const a of ORBIT) {
    const box = heroScreenBox(titleFraming(1180 / 820), 1180 / 820, a);
    expect((box.x0 + box.x1) / 2).toBeGreaterThan(0.15);
    expect((box.x0 + box.x1) / 2).toBeLessThan(0.42);
  }
});
it('portrait centres the hero', () => {
  const box = heroScreenBox(titleFraming(820 / 1180), 820 / 1180);
  expect(Math.abs((box.x0 + box.x1) / 2 - 0.5)).toBeLessThan(0.08);
});
it('the instrument can see a FAIL: today\'s pose puts the FACE under today\'s bottom-anchored wordmark', () => {
  // the control encodes the OBSERVED defect (roadmap move 6: the wordmark sits over the face), measured in Step 1a
  const old = { target: [0, 2.15, 0], camPos: [2.6, 4.0, 10.8], fov: 34, shiftX: 0 };
  const face = heroFaceBox(old, 1180 / 820);
  expect(Number.isFinite(face.y0) && face.y1 > face.y0, 'presence: the face box is real').toBe(true);
  expect(overlaps(face, OLD_WORDMARK_RECT_1180x820), 'today\'s face is under today\'s wordmark').toBe(true);
});
```
The last case is the control. If today's face does NOT overlap today's measured wordmark, the face sub-box or the measurement is wrong, and the step stops to re-measure against the opened `menu.png`. It never re-tunes `titleBands` to make the control agree: the bands are not in the control.

- [ ] **Step 2: Run it.** Run: `npx vitest run src/render/titleComposition.test.js`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement `titleComposition.js`.** The hero's bounding box comes from `MascotCraftyHero`'s scaled extent at `TitleDiorama.jsx:168` (`scale 0.95`, `position [0, 0.9, 0]`). Measure its geometry once with `new THREE.Box3().setFromObject` in a node script and write it as a constant with that provenance in a comment. The face sub-box is the same measurement over the head cubes only (the eyes, the smile at `MascotCraftyHero.jsx:138`, and the head block), also a constant with provenance.

- [ ] **Step 4: Run it.** Expected: PASS.

- [ ] **Step 5: Re-lay the title in `MenuSystem.jsx`.**
  - The container becomes `justify-between`.
  - The wordmark block sits at `top: titleBands(h).wordmarkTop`, its font size is `min(${WORDMARK_FONT.maxPx}px, ${WORDMARK_FONT.vh * 100}vh)` (replacing the fixed `text-8xl` at `:269`), with an ink drop shadow from the theme (`textShadow: '0 5px 0 var(--ui-ink)'` or the token `tokens.js` names, read first) plus a soft glow.
  - The tagline goes under the wordmark, and its pill scrim (`:289`) is deleted, because it no longer sits over the robe.
  - The CTA and controls strip stay at the bottom.
  - The full-height scrim (`:262-265`) becomes a band: `linear-gradient(to bottom, rgba(0,0,0,0) 75%, rgba(0,0,0,0.7) 100%)`, built from `titleBands(h).scrimTop`.
  - Contrast stays above WCAG AA for `text-text/85` on the band. The existing contrast gate covers the token pair. Read it and do not weaken it.

- [ ] **Step 6: Read the pose from `titleFraming`** in `TitleDiorama.jsx`. `CAPTURE_CAM` becomes `titleFraming(1180 / 820).camPos` (a frozen array, so the capture gate's "canonical pose" still holds). The camera looks at `target` and applies `shiftX` through `camera.setViewOffset(w, h, -shiftX * w, 0, w, h)` on mount and on resize (one place, a small `useLayoutEffect` keyed on the canvas size, not per frame).

- [ ] **Step 7: Run** `npx vitest run src/render/titleComposition.test.js tests/gates/capture-dpr-gates.test.jsx tests/gates/title-screen-brand-gates.test.js tests/gates/title-i18n-gates.test.jsx`. Expected: PASS.

- [ ] **Step 8: Commit** (src only; the `menu` baseline is NOT re-shot here, see Unit 12). Mutants:
  - **M2.1** `titleFraming` returns the old pose (no shift, target at the old look-at): the left-third case goes red. The band case stays GREEN under this mutant, because today's head (y ≈ 0.28) already clears the new top band; today's defect was the bottom-anchored wordmark, which Step 5 moves. That is stated, not hidden.
  - **M2.2** Swap the projection's y sign: the band case goes red.
  - **M2.3** Move the face sub-box up by one world unit (above the old wordmark): the control case goes red. This proves the control discriminates.
  - **M2.4** Orbit about a point offset from the hero (`target` back at the old look-at with the shift kept): the every-angle left-third case goes red at some angle.

### Unit 3: A cheaper, living title canvas (light, motes, orbit, DPR, pacing)

**Files:**
- Create: `src/render/softDisc.js` (a GLSL string module and its JS mirror)
- Create: `src/render/softDisc.test.js`
- Create: `src/render/titleLight.js` (the golden-hour key, from the colour script's seam in Unit 0 Step 2)
- Modify: `src/render/TitleDiorama.jsx` (lights `:164-166`, motes `:54-71`, pose `:95-99`, Canvas props `:149-158`)
- Modify: `tests/gates/capture-dpr-gates.test.jsx`
- Create: `tests/gates/title-canvas-cost-gates.test.jsx`
- Modify: `src/i18n/strings.js` (`title.aria.vista`, both locales: `A floating island at golden hour` / `黄昏时分的浮空小岛`; rendered here as the diorama container's `role="img"` `aria-label`, so `key-resolution` sees a literal use)

**Interfaces:**
- Produces:
  - `SOFT_DISC_GLSL = { decl: string, alpha: string }` and `softDiscAlpha(r: number) -> number`, the JS mirror of the GLSL radial falloff: 1 at r=0, 0 at r≥1, smoothstep between.
  - `titleOrbitAngle(capture: boolean, elapsed: number) -> number` (rad; `capture ? 0 : elapsed * TITLE_ORBIT_RATE`, `TITLE_ORBIT_RATE = 0.02`).
  - `titleCanvasProps({ capture, coarsePointer, frameCap, tier, devicePixelRatio, cssWidth, cssHeight }) -> { dpr, antialias, loop, fps }`. `dpr` is `1` under capture; otherwise `min(TITLE_DPR_CAP = 1.5, pixelBudgetDpr({ tier, devicePixelRatio, cssWidth, cssHeight }))`, a NUMBER from steady-cool's `src/render/pixelBudget.js` (the decision of record, `docs/superpowers/DECISIONS.md:50-51`), using the same tier the game canvas uses, so the title's pixels never exceed the game tier's budget. TitleDiorama recomputes it on resize through `usePixelBudgetDpr`'s viewport read.
  - `titleLight() -> { sun, sky, ground, ambient, hemi, sunIntensity }` (hex strings and numbers).
- Consumes: Unit 2's `titleFraming`; Unit 0 Step 2's colour-script seam; steady-cool's `FrameCap` (`render/FrameCap.jsx`) and `pixelBudgetDpr` (`render/pixelBudget.js`).

- [ ] **Step 1: Write the failing cost gate** `tests/gates/title-canvas-cost-gates.test.jsx`:

```js
const base = { capture: false, coarsePointer: false, frameCap: 60, tier: 'high', devicePixelRatio: 2, cssWidth: 1280, cssHeight: 800 };
it('spends the tier pixel budget, never above 1.5, and keeps capture pinned', () => {
  // iPad Pro 11 landscape on the low tier (the iPad starts on low): CSS px x dpr^2 within the low budget
  const ipad = titleCanvasProps({ ...base, coarsePointer: true, tier: 'low', cssWidth: 1180, cssHeight: 820 });
  expect(typeof ipad.dpr).toBe('number');
  expect(1180 * 820 * ipad.dpr ** 2).toBeLessThanOrEqual(TIERS.low.budgetPx);
  // a 16-inch M3 Max window on high: within the high budget and the title cap
  const mac = titleCanvasProps({ ...base, cssWidth: 1728, cssHeight: 1117 });
  expect(1728 * 1117 * mac.dpr ** 2).toBeLessThanOrEqual(TIERS.high.budgetPx * 1.001);
  expect(mac.dpr).toBeLessThanOrEqual(1.5);
  expect(titleCanvasProps({ ...base, capture: true }).dpr).toBe(1);
});
it('turns antialias off on a coarse pointer only', () => {
  expect(titleCanvasProps({ ...base, coarsePointer: true }).antialias).toBe(false);
  expect(titleCanvasProps(base).antialias).toBe(true);
});
it('paces the title at min(30, cap), 30 under Unlimited, unpaced demand in capture', () => {
  expect(titleCanvasProps(base)).toMatchObject({ loop: 'demand', fps: 30 });
  expect(titleCanvasProps({ ...base, frameCap: 24 })).toMatchObject({ fps: 24 });
  expect(titleCanvasProps({ ...base, frameCap: 0 })).toMatchObject({ fps: 30 });
  expect(titleCanvasProps({ ...base, capture: true })).toMatchObject({ loop: 'demand', fps: 0 });
});
it('orbits at 0.02 rad/s, and capture resets to the orbit origin', () => {
  expect(titleOrbitAngle(false, 50)).toBeCloseTo(1.0, 6);
  expect(titleOrbitAngle(true, 50)).toBe(0);
});
it('the soft disc mirror is 1 at the centre, 0 at the rim, and monotone', () => {
  expect(softDiscAlpha(0)).toBe(1); expect(softDiscAlpha(1)).toBe(0); expect(softDiscAlpha(1.4)).toBe(0);
  for (let r = 0; r < 1; r += 0.05) expect(softDiscAlpha(r + 0.05)).toBeLessThanOrEqual(softDiscAlpha(r));
});
```
**The component, not only the helpers** (gates-and-probes 4c: a helper test cannot see whether TitleDiorama USES the helper). Extend `capture-dpr-gates.test.jsx`'s Canvas mock (`:23-28`, which today records only `props.dpr`) to record `{ dpr, antialias: props.gl?.antialias, frameloop: props.frameloop }`, and to scan `React.Children.toArray(props.children)` for the direct-child `FrameCap` element's `fps` and `active` props and for one `TitleIsland` element (Unit 4). Render `TitleDiorama` with `matchMedia('(pointer: coarse)')` mocked true and then false, and with the store's `frameCap` at 60:
  - the "keeps the adaptive range" case is REWRITTEN (a gate-assertion rewrite, so a `Mutation-Proof:` trailer): normal play's `dpr` is a number equal to `titleCanvasProps(...).dpr` for the mocked viewport and ≤ 1.5, and capture still pins `1` (presence first: the Canvas rendered once);
  - coarse pointer gives `antialias === false`, fine pointer `true`;
  - `frameloop === 'demand'`, and the `FrameCap` element carries `fps: 30, active: true`.
  Stated blind spot: the mock renders no children, so the number of meshes INSIDE `DioramaMotes` (one `instancedMesh`, no per-mote meshes) is not visible to any jsdom gate. It is measured by Step 5's draw count on the prod build, and a component that kept 28 meshes would show there.

- [ ] **Step 2: Run it.** Run: `npx vitest run tests/gates/title-canvas-cost-gates.test.jsx tests/gates/capture-dpr-gates.test.jsx`. Expected: FAIL (the functions are missing, the DPR is a `[1, 2]` range, antialias is always on).

- [ ] **Step 3: Implement.**
  - `softDisc.js` follows `src/world/oreGlow.js`'s module shape exactly (read it first).
  - The motes become ONE `<instancedMesh args={[geom, mat, MOTE_COUNT]}>`. Its matrices are set once from `dioramaMotePositions()`, and its material is a `ShaderMaterial` (additive, `depthWrite: false`, `toneMapped: false`) that uses `SOFT_DISC_GLSL`. The group's Y rotation still comes from `dioramaMoteSpin`.
  - The camera orbits `titleFraming(...).target` (the hero) at radius `|camPos - target|` by `titleOrbitAngle`, with Unit 2's lens shift.
  - The Canvas takes `titleCanvasProps({ capture, coarsePointer: matchMedia('(pointer: coarse)').matches, frameCap, tier, ...viewport })`, and `<FrameCap fps={props.fps} active={props.fps > 0} />`.
  - The container `div` gets `role="img"` and `aria-label={t('title.aria.vista')}`; add the key to both locales here.
  - The lights take `titleLight()`.
  - Keep `CaptureClockTicker`.

- [ ] **Step 4: Run** `npx vitest run tests/gates/title-canvas-cost-gates.test.jsx tests/gates/capture-dpr-gates.test.jsx tests/gates/title-screen-brand-gates.test.js`. Expected: PASS.

- [ ] **Step 5: State the cost in the commit message.** Before and after, MEASURED on the prod build: draw calls and triangles on the title (`gl.info.render.calls` / `.triangles` through the Phase 0d Diagnostics readout), DPR, frame rate, and a GPU-time signal: `EXT_disjoint_timer_query_webgl2` GPU ms per title frame where the context exposes it, else the word ABSENT (never a guess). Expected: calls fall from ~90 to ~63 (the hero's ~61 stay). A frame rate pinned at the 30 cap cannot show GPU load, so it is never the heat evidence; the heat verdict is the Unit 12 A/B.

- [ ] **Step 6: Commit** (src only). Mutants:
  - **M3.1** `titleCanvasProps` returns `[1, 2]` / ignores the budget: red (helper and component cases).
  - **M3.2** Antialias left on for a coarse pointer: red.
  - **M3.3** `fps: frameCap` (no 30 floor under Unlimited): red.
  - **M3.4** A sign flip in `softDiscAlpha`: red.
  - **M3.5** The orbit under capture returns `elapsed * rate`: red.
  - **M3.6** (component) `TitleDiorama` keeps the helpers but hardcodes `gl={{ antialias: true }}`: the extended `capture-dpr-gates` coarse-pointer case goes red.
  - **M3.7** (component) `TitleDiorama` passes `dpr={[1, 2]}` outside capture: the rewritten adaptive-range case goes red.
  - **M0** identity.

### Unit 4: The island (the real mesher and the real terrain material)

Ships last among the title units, and is independently droppable. If the material-grammar lane (roadmap 9) has already extracted a terrain material factory, Steps 1-4 become "consume theirs".

**Files:**
- Create: `src/world/terrainMaterial.js` (`createTerrainMaterial()`, MOVED from `src/world/Terrain.jsx:47-251`: the material, the injected uniforms at `:56-67`, `compileShader`, and the GLSL constants and tint uniforms at `:236-245` together with `opaqueMaterial.onBeforeCompile` at `:246-251`, whose `userData.shader` write becomes per-instance)
- Modify: `src/world/Terrain.jsx` (consumes the factory; `.claude/rules/voxel-mesher.md` applies, so read it first)
- Create: `src/render/titleIsland.js` (the pure authored chunk)
- Create: `src/render/titleIsland.test.js`
- Modify: `src/render/TitleDiorama.jsx` (mounts the island, the sea ring, the clouds and the shrine beam; the brown disc plinth `:172-175` is deleted)

**Interfaces:**
- Produces:
  - `createTerrainMaterial({ textures }) -> { material: THREE.MeshStandardMaterial, uniforms: object }`. `uniforms` is created PER CALL, and `onBeforeCompile` binds that instance's object. Two instances must never share uniforms. This is the trap: three re-runs `onBeforeCompile` per renderer, and a shared closure would hand the game's per-frame writes to the title's program.
  - `buildTitleIsland() -> { blocks: Uint8Array /* CHUNK_VOLUME */, biomeIds: Uint8Array, topY: number, hearth: [x,y,z], shrineBase: [x,y,z] }`.
- Consumes: `generateMesh(cx, cz, blocks, biomeIds)` (`src/world/mesher.js:30`); `sharedVoxelTextures()` (`src/world/proceduralTextures.js:26`); `shrineParts(baseY, topY)` (`src/world/shrineShape.js:17`); block ids from `src/world/blockIds.js`.

- [ ] **Step 1: Write the failing factory test** `src/world/terrainMaterial.test.js`:

```js
it('two materials get two uniform objects, and compiling one never rebinds the other', () => {
  const a = createTerrainMaterial({ textures: fakeTex }), b = createTerrainMaterial({ textures: fakeTex });
  const shaderA = { uniforms: {}, vertexShader: VS, fragmentShader: FS };
  const shaderB = { uniforms: {}, vertexShader: VS, fragmentShader: FS };
  a.material.onBeforeCompile(shaderA); b.material.onBeforeCompile(shaderB);
  a.uniforms.mood.value = 2;
  expect(shaderA.uniforms.mood.value).toBe(2);
  expect(shaderB.uniforms.mood.value).toBe(0);
});
```
`VS`/`FS` are three's `ShaderLib.standard` sources, so every `replace` anchor is present. Add `expect(shaderA.fragmentShader).toContain('sampler2DArray voxelTextures')` as the presence check.

- [ ] **Step 2: Run it.** Run: `npx vitest run src/world/terrainMaterial.test.js`. Expected: FAIL (module missing).

- [ ] **Step 3: Move the material.** Move the material construction and `compileShader` out of `Terrain.jsx` into `createTerrainMaterial`. It is a move, not a rewrite: every GLSL string is byte-identical. `Terrain.jsx` calls the factory once at module scope and keeps writing per-frame uniforms through the returned `uniforms`.

- [ ] **Step 4: Prove the move changed nothing.**
  - Run: `npx vitest run src/world/terrainMaterial.test.js tests/gates/mesher-geometry-gates.test.js` (all mesher and terrain gates). Expected: PASS.
  - On an IDLE machine (`uptime` load < cores), run `npm run visual:capture` before and after the move on the same machine. Expected: all 31 frames byte-identical between the two runs, or within each frame's measured run-to-run noise.
  - If the machine is loaded, this step is OWED and recorded as such in the commit message. Never claim it.

- [ ] **Step 5: Write the failing island test** `src/render/titleIsland.test.js`. Assert:
  - The island has grass on every top cell except the 5×5 Hearth pad (stone), and dirt directly under grass (the turf lip).
  - It has at least one log and one leaf voxel per tree (2 trees), and the shrine stone from `shrineParts`.
  - Every solid voxel is 6-connected to the island's body (no floaters, by a flood fill from the Hearth).
  - `generateMesh(0, 0, blocks, biomeIds)` returns more than 0 indices, and fewer than 60,000 (a triangle budget, printed).
  - Presence before absence: the flood fill run on a fixture with one detached voxel reports exactly 1 floater.

- [ ] **Step 6: Run it.** Expected: FAIL (module missing). Then implement `buildTitleIsland`. Run again. Expected: PASS, with the triangle count printed.

- [ ] **Step 7: Mount it in `TitleDiorama.jsx`.**
  - The island is a `TitleIsland` component, a DIRECT child of the Canvas (so Unit 3's element scan can see it), rendering one mesh with a `BufferGeometry` from `generateMesh` (the same attribute names `Terrain.jsx` sets: `position`, `normal`, `uv`, `color`, `aAO`), built in `useMemo` once.
  - Its material comes from `createTerrainMaterial({ textures: sharedVoxelTextures() })`, with uniforms set once from `titleLight()` (mood 0, `skyHorizon` the golden sky, `uSunDir` the title sun).
  - The shrine beam reuses the `Emissive` beacon shape `Terrain.jsx:484` uses.
  - The sea is a flat `ringGeometry` in the colour script's sea colour.
  - The clouds are 4 alpha cards.
  - The hero stands on the pad on the left third (Unit 2).

- [ ] **Step 8: Measure and state** in the commit message: draw calls, triangles, the voxel texture array's bytes (`size*size*layers*4`), the mount-time mesh cost (`performance.now()` around `generateMesh`), the island program's compile cost (the first title frame's time with the island against without it), and GPU ms per title frame where `EXT_disjoint_timer_query_webgl2` exists (else ABSENT), on the M3 Max and in the iPad probe. State the island's share of the screen at 1180x820 (its projected bounding box), since its fill runs the full terrain fragment chain. If the Unit 12 A/B shows the title hotter than before Unit 3, the island switches to the D4 fallback material before the milestone closes.

- [ ] **Step 9: Commit** (two commits: the move first, then the island). Mutants:
  - **M4.1** The factory hoists `uniforms` to module scope: the isolation test goes red.
  - **M4.2** `buildTitleIsland` skips the dirt layer: the turf-lip case goes red.
  - **M4.3** One tree leaf is placed detached: the floater case goes red.
  - **M4.4** `TitleDiorama` no longer mounts `<TitleIsland />`: the extended `capture-dpr-gates` element scan (Unit 3) goes red. Stated blind spot: that scan sees the element, not that its geometry came from `buildTitleIsland`; the Unit 12 frames are the check for that.
  - **M0** identity.

### Unit 5: The prologue core (pure)

**Files:**
- Create: `src/game/prologueFlags.js` (main chunk: the storage keys and `prologueEligible`, nothing else)
- Create: `src/game/prologueFlags.test.js`
- Create: `src/game/prologue.js` (the reducer, spawn candidates and step constants; imported ONLY by the lazy director, never by a main-chunk module)
- Create: `src/game/prologue.test.js`

**Interfaces:**
- Produces:
  - In `prologueFlags.js`:
    - `PROLOGUE_FLAG_KEY = 'crafty_prologue_v1'` and `LEGACY_ONBOARDED_KEY = 'crafty_onboarded'`.
    - `prologueEligible({ flag: string|null, legacyOnboarded: string|null, perfProbe: boolean }) -> boolean`. Any non-null `flag` (`started`, `done`, `skipped`, or anything else) means false. A non-null `legacyOnboarded` means false. The perf probe (`?perf=`, a URL read at boot, `src/devtest/perfProbe.js:25-29`) means false. Capture mode is NOT an input: the harness enters it after boot (`src/devtest/captureMode.js:17,44`), so at the one place eligibility is evaluated it is always false; the director's per-tick capture check (Unit 10) is the guard.
  - In `prologue.js` (constants):
    - `PROLOGUE_WAVE = ['emberhusk', 'emberhusk', 'moss_brute']` and `PROLOGUE_DAMAGE_SCALE = 0.35` (Kevin-tunable, see Open questions).
    - `STEP_TIMEOUT_S = { muster: 10, dodge: 20, heavy: 20, roar: 25, clear: 30 }` and `PROLOGUE_CAP_S = 150`.
  - `makePrologue() -> PrologueState`, where `{ step: 'muster', stepActiveS: 0, totalActiveS: 0, spawned: 0, granted: false, roarUsed: false, lastAdvance: null, ended: null }`. On every step change, `lastAdvance` is set to `'signal'` or `'timeout'`; the e2e reads it to tell a performed verb from a beat that merely expired.
  - `stepPrologue(s, obs) -> { s, effects: Effect[] }`.
    - `obs = { dt, active, alive, worldReady, spawnedOk: number|null, waveAlive: number, huskAlive: number, bruteWindingUp: boolean, beastActive: boolean, signals: { dodge, perfectDodge, heavy }, skip: boolean, saveLoaded: boolean }`.
    - Effects: `{ type: 'holdClock' | 'releaseClock' | 'horn' | 'spawnWave' | 'grantRoar' | 'revokeRoar' | 'openRing' | 'coach', key? } | { type: 'end', reason: 'done'|'skipped'|'died'|'loaded'|'spawn-failed'|'timeout' }`.
  - `prologueSpawnCandidates(headingRad: number) -> Array<[x, z]>`: 8 points at 22-26 m from the Hearth (0, 0), starting at the player's heading and alternating ±30°, ±60°, … (deterministic, never behind the player first).

- [ ] **Step 1: Write the failing tests** `src/game/prologueFlags.test.js` and `src/game/prologue.test.js`, one `it` per row:
  - **Eligibility truth table** (`prologueFlags.test.js`). All 16 combinations of (`flag` null/'started'/'done'/'x') × (`legacy` null/'1') × (`perfProbe` false/true), 4 × 2 × 2, with the row count asserted: true ONLY for (null, null, false).
  - **Muster.**
    - With `worldReady: false`, it waits and emits nothing: no spawn before the world (the dodge-latch lesson).
    - With `worldReady: true, active: true`, it emits `holdClock`, `spawnWave`, `horn` and `coach:prologue.coach.muster` exactly once.
    - With `spawnedOk: 3`, it moves to `dodge`.
    - With `spawnedOk` < 3, it re-emits `spawnWave` at most once per second for 10 s, then emits `end:spawn-failed` together with `releaseClock` and `revokeRoar`.
  - **Dodge.** `signals.dodge` advances to `heavy` with `lastAdvance: 'signal'`; `signals.perfectDodge` also emits `coach:prologue.coach.perfect`. With no dodge, after 20 s of ACTIVE time it advances anyway with `lastAdvance: 'timeout'`. With `active: false`, `stepActiveS` does not grow (time spent paused never counts).
  - Notation: `coach:<key>` in these tests means the effect `{ type: 'coach', key: '<key>' }`. Keys are always the BASE key; the coach component picks the `.touch` variant.
  - **Heavy.** `signals.heavy` advances to `roar`; a timeout advances too.
  - **Roar.** On entry with `bruteWindingUp`, or with `huskAlive === 0`, or after 6 s, it emits `grantRoar` and `openRing`. `beastActive` moves to `clear` with `roarUsed: true`. After 25 s of active time it emits `revokeRoar` and goes to `clear` with `roarUsed: false`.
  - **Clear.** It ends `done` when the beast form has ended after use (`beastActive` false after true), or when `waveAlive === 0`, or after 30 s. The `end` effect is always paired with `releaseClock` and `revokeRoar`, and with `coach:prologue.coach.emberSleeps` when the roar was used, else `coach:prologue.coach.earnIt`.
  - **Any step.**
    - `skip` ends `skipped`; `!alive` ends `died`; `saveLoaded` ends `loaded`; `totalActiveS > 150` ends `timeout`.
    - Every terminal path emits `releaseClock` and `revokeRoar` (Review Focus 4). This is asserted over an explicit table of FEASIBLE (step, reason) pairs, with the denominator printed and asserted: `skipped`, `died`, `loaded` and `timeout` (the 150 s cap) at each of the 5 steps (20 pairs), `spawn-failed` at `muster` only (1), and `done` at `clear` only (1), so 22. The infeasible pairs are listed in the test as such, so the table is complete by construction.
  - **Spawn candidates.** 8 points, all at 22-26 m, the first within ±1° of the heading, and none duplicated.

- [ ] **Step 2: Run it.** Run: `npx vitest run src/game/prologueFlags.test.js src/game/prologue.test.js`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `src/game/prologueFlags.js` and `src/game/prologue.js`.** The reducer is pure: no store, no React, no three. `prologue.js` may import from `prologueFlags.js`, never the reverse.

- [ ] **Step 4: Run it.** Expected: PASS, with the eligibility row count (16) and the feasible terminal-pair denominator (22) printed.

- [ ] **Step 5: Commit.** Mutants:
  - **M5.1** Eligibility ignores `legacyOnboarded`: red.
  - **M5.2** `stepActiveS += dt` without the `active` check: the paused-time case goes red.
  - **M5.3** Drop `releaseClock` from `spawn-failed`: the all-terminals case goes red.
  - **M5.4** Grant the roar at muster: the roar-entry case goes red.
  - **M5.5** Muster spawns with `worldReady: false`: red.
  - **M0** identity.

### Unit 6: Not a siege night (the held clock)

**Files:**
- Modify: `src/game/dayNight.js:76-78` (`shouldAdvanceClock`)
- Modify: `src/game/useDayNightClock.js:21-31`
- Modify: `src/store/useGameStore.jsx` (add `clockHeld: false`, `setClockHeld(b)`; not serialized)
- Modify: `src/game/dayNight.test.js` and `tests/gates/daynight-clock-gates.test.jsx`

**Interfaces:**
- Produces: `shouldAdvanceClock({ isWorldBuilt, active, isAlive, captureMode, held })`, which returns false when `held` is true. Store `clockHeld` and `setClockHeld(held: boolean)`.

- [ ] **Step 1: Write the failing tests.**
  - In `src/game/dayNight.test.js`, extend the exhaustive case table with `held` (it doubles it): `held: true` means false in every row.
  - In `tests/gates/daynight-clock-gates.test.jsx` (fake timers; follow its existing driven harness): with `clockHeld: true`, 200 simulated seconds leave `gameTime` and `nightCount` unchanged. Releasing it then advances `gameTime` by 4 per second.
  - Presence first: the same harness without the hold advances.

- [ ] **Step 2: Run** `npx vitest run src/game/dayNight.test.js tests/gates/daynight-clock-gates.test.jsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** `useDayNightClock` reads `useGameStore.getState().clockHeld` LIVE inside the interval. It is not a hook dependency, so the 1 s interval is not torn down.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.** Mutants:
  - **M6.1** `shouldAdvanceClock` ignores `held`: red.
  - **M6.2** The ticker reads `clockHeld` once at mount: the driven gate goes red, because the hold set after mount does not stop it.

### Unit 7: The lent roar (one predicate, three sites, and the touch sector)

**Files:**
- Create: `src/game/roarGate.js`
- Create: `src/game/roarGate.test.js`
- Modify: `src/Components.jsx:391-394` (the denied toast), `:635` (`canEnter`), `:649-653` (enter: consume the lent roar instead of the bank), `:1029` (owned)
- Modify: `src/store/useGameStore.jsx` (`prologueRoarGrant: false`, `setPrologueRoarGrant(b)`; not serialized)
- Modify: `src/input/aspectWheel.js` (`aspectRing(unlockedTalents, lent = {})`, on the feat/touch-hold version)
- Modify: `src/input/aspectWheel.test.js` and `tests/gates/touch-hold-gates.test.jsx` (both from feat/touch-hold)
- Modify: `src/ui/TouchControls.jsx` (subscribes to `prologueRoarGrant` and `prologueRingOpen`, both rare transitions and therefore subscription-safe; opens the ring when `prologueRingOpen` turns true)
- Modify: `src/store/useGameStore.jsx` (also `prologueRingOpen: false`; Unit 10's `openRing` effect sets it, and every `end` clears it)

**Interfaces:**
- Produces:
  - `canEnterRoar({ ferocityBanked, unlockedTalents, prologueRoarGrant }) -> boolean`, true when `(canTransform(ferocityBanked) && talent > 0) || prologueRoarGrant === true`.
  - `roarLocked({ unlockedTalents, prologueRoarGrant }) -> boolean`, for the toast.
  - `roarOwned(same) -> boolean`, for the cooldown mirror.
  - `aspectRing(unlockedTalents, lent: { roar?: boolean }) -> Array<{ verb, talent, key, aspect, locked }>`.
- Consumes: `canTransform` (`src/game/ferocity.js:29-31`), `FEROCITY_THRESHOLD`.

- [ ] **Step 1: Write the failing tests.**
  - `roarGate.test.js`: the full truth table over `bank ∈ {0, 99, 100}` × `talent ∈ {0, 1}` × `grant ∈ {false, true}` (12 rows, denominator asserted). `canEnterRoar` is true iff (bank 100 AND talent 1) OR grant. `roarLocked` is false when the grant is set even with talent 0.
  - `aspectWheel.test.js`: `aspectRing({}, { roar: true })` marks only `roar` as `locked: false`, and `aspectRing({}, {})` marks all four as locked.
  - `touch-hold-gates.test.jsx`, a new case. With `prologueRoarGrant: true` and no talents, open the ring. The WILDHEART sector has `data-locked="false"`. A `pointerdown` writes `setIntent('roar', true)`, and a `pointerup` after 600 ms writes false (a hold, not the Talents panel). The control: with the grant false, the same press calls `onOpenTalents`.

- [ ] **Step 2: Run** `npx vitest run src/game/roarGate.test.js src/input/aspectWheel.test.js tests/gates/touch-hold-gates.test.jsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - At `Components.jsx:635`, `canEnter: canEnterRoar(st)`.
  - At `:391-394`, `if (roarLocked(st)) notifyDenied(...)`.
  - At `:649-653`, on a real `enterBeastForm`: if the bank-and-talent path was not met and the grant was, call `st.setPrologueRoarGrant(false)` and skip `accrueFerocity(-FEROCITY_THRESHOLD)`. Otherwise keep today's spend.
  - At `:1029`, `roar: roarOwned(st)`.
  - In `aspectRing`, `locked = !(rank > 0 || lent[verb] === true)`.
  - In `TouchControls`, pass `{ roar: prologueRoarGrant }`, and call `setWheelOpen(true)` in an effect keyed on `prologueRingOpen` turning true.
  - Add a gate case: with `prologueRingOpen: true` set after mount, the `touch-aspect-roar` sector is in the DOM without any tap on the opener.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit.** The `Components.jsx` wiring is not unit-reachable (it is a `useFrame` controller). It is proven by Unit 11 case A (desktop R hold) and case F (touch hold), which carry mutants M7.3 and M7.4. Mutants:
  - **M7.1** `canEnterRoar` drops the grant term: red.
  - **M7.2** `aspectRing` ignores `lent`: red.
  - **M7.3** `Components.jsx:635` back to the old expression: e2e A and F go red.
  - **M7.4** Enter spends the bank under the grant: an e2e A assertion goes red. That assertion sets the bank to 50 at roar-step entry and asserts it did not fall across the lent roar (Unit 11 case A). With the bank at 0, `clampFerocity(0 - 100)` is 0 (`src/game/ferocity.js:23-26`), so "unchanged" would hold under the mutant; the case sets the variable it reads.

### Unit 8: Combat signals

**Files:**
- Create: `src/game/combatSignals.js` and `src/game/combatSignals.test.js`
- Modify: `src/Components.jsx:979` (dodge start), `:998` (after a non-empty `perfect`), `:543-546` (after `releaseHeavy` returns true and `triggerMeleeAttack({ heavy: true })` runs)

**Interfaces:**
- Produces: `emitCombatSignal(kind: 'dodge'|'perfectDodge'|'heavy')`, `subscribeCombatSignal(cb: (kind) => void) -> unsubscribe`, and `_resetCombatSignals()`, with the `mobKillBus.js` shape (one throwing subscriber never blocks the rest).

- [ ] **Step 1: Write the failing bus test.** Cover fan-out to two subscribers, unsubscribe, a throwing subscriber isolated, and the kinds passed through unchanged.

- [ ] **Step 2: Run** `npx vitest run src/game/combatSignals.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement the bus and add the three emits.** Each is one line, with no work when there are no subscribers.

- [ ] **Step 4: Run it.** Expected: PASS.

- [ ] **Step 5: Commit.** The producer side, that `Components.jsx` actually emits, is gates-and-probes 4c and is proven ONLY by Unit 11 (mutants M8.2-M8.4). Mutants:
  - **M8.1** The bus skips the remaining subscribers after a throw: red.
  - **M8.2** Delete the dodge emit: e2e A's dodge beat never completes before its timeout. A asserts that the beat ended by signal (`reason: 'signal'` in the step log), not by timeout, so it goes red.
  - **M8.3** Delete the heavy emit: e2e A's heavy beat goes red.
  - **M8.4** Delete the perfect-dodge emit: no prologue assertion depends on it, so it SURVIVES. Record it as a stated limit: the praise line is cosmetic.

### Unit 9: Spawner seams

**Files:**
- Create: `src/systems/spawnTypePick.js` and `src/systems/spawnTypePick.test.js` (the pick extracted from `SpawnerSystem.jsx:47-53`)
- Modify: `src/systems/SpawnerSystem.jsx:27` (signature), `:47-53` (use the pure pick), `:59-83` (merge the overrides)
- Modify: `src/store/useGameStore.jsx` (add `prologueActive: false` and `setPrologueActive(b)`; not serialized). It has exactly two writers: the BOOT ARM (Unit 10: `App.jsx` sets it true at mount when `PROLOGUE_ELIGIBLE_AT_BOOT`, which is before the boot ring can fire, because the ring waits for `isSpawnChunkLoaded`, `SpawnerSystem.jsx:97`), and the director's applier, which clears it on every `end`. Arming it at muster would be too late: the 20-mob boot ring spawns while the title is still up.

**Interfaces:**
- Produces:
  - `spawnMob(x, z, forceType = null, explicitY = null, overrides = null) -> boolean`. Overrides are whitelisted to `{ prologue: true, damage: number }`. Unknown keys are dropped.
  - `pickSpawnType({ isDay, hostileChance, prologueActive, rng }) -> string`. When `prologueActive`, it only ever returns a passive type.
- Consumes: `MOB_TYPES`, `weightedPick`.

- [ ] **Step 1: Write the failing tests.**
  - `pickSpawnType` with `prologueActive: true`: 1,000 draws over a seeded rng, day and night, all passive (denominator asserted).
  - With `prologueActive: false` at night with `hostileChance 1`: all hostile. This is the presence control.
  - A `spawnMob` override test via a thin exported `mobEntityFor(type, x, y, z, overrides)`, the entity literal extracted from `:59-83`. `damage` is overridden; `{ position: 'evil' }` is dropped.

- [ ] **Step 2: Run** `npx vitest run src/systems/spawnTypePick.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.** `SpawnerSystem` reads `store.prologueActive` from `getState()` inside `spawnMob`. The boot ring (`:97-104`, which calls `spawnMob(x, z)` with no `forceType`) and the dynamic spawner both reach the pick through `spawnMob`, so neither places hostiles while `prologueActive` is true. The guarantee for the boot ring rests on WHEN `prologueActive` turns true (Unit 10's boot arm); its lived proof is Unit 11 case A's zero-ambient-hostiles assertion, and mutant E11.

- [ ] **Step 4: Run** `npx vitest run src/systems/` plus the existing spawn gates (`npx vitest run tests/gates -t spawn`). Expected: PASS.

- [ ] **Step 5: Commit.** Mutants:
  - **M9.1** The pick ignores `prologueActive`: red.
  - **M9.2** The override merge is not whitelisted: red.
  - **M9.3** The overrides are applied BEFORE the base fields (overwritten): the damage case goes red.

### Unit 10: The director, the coach, the skip, the objective arrow, persistence and harness seeding

**Files:**
- Create: `src/game/prologue/PrologueDirector.jsx` (lazy; renders null) and `tests/gates/prologue-director-gates.test.jsx` (jsdom, fake timers)
- Create: `src/game/prologue/applyPrologueEffects.js` and `.test.js`
- Create: `src/game/prologue/buildObs.js` and `.test.js` (pure: the observation the director feeds the reducer)
- Create: `src/ui/PrologueCoach.jsx` (lazy) and `tests/gates/prologue-coach-gates.test.jsx`
- Create: `src/game/prologueBoot.js` (main chunk: imports only `prologueFlags.js`, reads the flags once at module evaluation and exports `PROLOGUE_ELIGIBLE_AT_BOOT`)
- Create: `scripts/visual/_profile.mjs` (`seedReturning(page)` and `seedProfile(page, 'done'|'fresh')`, working for BOTH a puppeteer page, via `evaluateOnNewDocument`, and a Playwright page, via `addInitScript`)
- Create: `tests/gates/settings-skip-gates.test.jsx` (jsdom)
- Modify:
  - `src/App.jsx`:
    - mount both lazies only when eligible;
    - the BOOT ARM: a `useLayoutEffect(..., [])` that calls `setPrologueActive(true)` when `PROLOGUE_ELIGIBLE_AT_BOOT` (Unit 9's writer; it runs at first commit, before the boot ring, which waits for `isSpawnChunkLoaded`);
    - when eligible, the `:115-137` effect defers BOTH the toasts AND the `localStorage.setItem('crafty_onboarded', '1')` write at `:124` until `prologueStep` ends; today that write happens at world build behind the title, so a new player who reloads (or whose iPad tab is evicted) before Start would boot "legacy" and lose the prologue for good;
    - the DEV `readMobs` hook (`:335`) also returns `prologue: !!e.prologue`, so the e2e can tell scripted mobs from ambient ones.
  - `src/ui/GamePanels.jsx` (`SettingsPanel`, `:602`, already in the lazy panel chunk): a secondary "Skip the opening fight" button while `prologueStep` is live, calling `skipPrologue()`. This is the surface ESC opens after Start: `shouldShowTitleMenu` returns false once `gameStarted` (`src/ui/panelState.js:77`), Start sets `gameStarted` (`src/MenuSystem.jsx:72`), and the unlock transition opens Settings (`src/App.jsx:202-206`), so a Skip on the title block would never be seen in play. Add `data-testid="settings-panel"` to its root if it has none.
  - `src/QuestSystem.jsx:489`: the QuestTracker returns null while `prologueStep` is non-null (a rare-transition subscription), so the coach takes the top-left without covering it or being covered.
  - `src/HUD.jsx:206-246`: extract `pickObjective(state, nearestShrine, blightHeart) -> { x, z, labelKey, color }`, where `state.prologueTarget` wins.
  - `src/store/useGameStore.jsx`:
    - add `prologueStep: null`, `prologueCoach: null` and `prologueTarget: null` (`prologueActive` comes from Unit 9);
    - add the actions `setPrologue(patch)` and `skipPrologue()`;
    - make `loadWorldData` (`:1021`; `startNewWorld` at `:1192-1194` goes through it too) set `prologueSaveLoaded: true` when a prologue is live.
  - `src/i18n/strings.js` (the coach keys, `prologue.skipFight` and `prologue.coach.skipHint`, each consumed in this unit)
  - `scripts/ci/bundle-budget.mjs` (the lazy-prologue check, Step 5)
  - `tests/e2e/_fixtures.js`: a `prologue` option, `'done'` by default, seeded with `page.addInitScript`.
  - EVERY page creator under `scripts/` imports `_profile.mjs` and seeds a returning profile by default (31 on main: 29 in `scripts/visual/`, `scripts/perf/run-scenarios.mjs:44`, `scripts/ci/prod-smoke.mjs:140`; plus `scripts/visual/lookbook.mjs` once feat/instruments lands). A script that needs a new player opts into `'fresh'`.

**Interfaces:**
- Consumes: Units 5-9.
- Produces:
  - `applyPrologueEffects(effects, api) -> void`, where `api = { holdClock(b), horn(), spawnWave(heading), grantRoar(b), openRing(b), setActive(b), coach(key), end(reason), writeFlag(v) }`. It is pure apart from the injected api. `setActive` writes Unit 9's `prologueActive`; `openRing(false)` clears `prologueRingOpen`.
  - `buildObs({ state, input, mobs, signals, now, dt }) -> obs` (pure): `alive` from `state.isAlive !== false`; `worldReady` from `state.isSpawnChunkLoaded && !!state.getMobGroundLevel`; `saveLoaded` from `state.prologueSaveLoaded`; `beastActive` from `state.beastFormActive`; `active` from `input.active`; `waveAlive`, `huskAlive` and `bruteWindingUp` from the `prologue`-tagged mobs with `health > 0` (`bruteWindingUp` is the brute's `windupUntil > now`); `skip` from `state.prologueSkipRequested`; and the latched signals.
  - The coach DOM carries `data-testid="prologue-coach"` with `data-step={step}`, a PROD-reachable read path for the lookbook (refute F7).
  - DEV only: on every step change the director appends `{ step, from, reason: s.lastAdvance, atMs }` to `window.__craftyTest.prologueLog`, and on the end `{ end: reason }`. It is tree-shaken from prod like the rest of the test bridge.
  - Store fields added here: `prologueStep`, `prologueCoach`, `prologueTarget`, `prologueSaveLoaded`, `prologueSkipRequested` (all null/false, none serialized; `skipPrologue()` sets the last). `prologueActive` (Unit 9; set true by the boot arm, cleared by the applier), `clockHeld` (Unit 6), and `prologueRoarGrant` and `prologueRingOpen` (Unit 7) are written by this unit's applier.

**The director's tick, as a contract.**
- A `setInterval` of 250 ms, in a `useEffect` with `[]` deps.
- Each tick calls `buildObs` with `getState()`, `getInput()`, `mobsQuery.entities`, the signals latched by a `subscribeCombatSignal` set since the last tick, and `worldNow()`. The director holds no observation logic of its own, so the seam where death and a save load end the prologue is a pure, tested function.
- It then calls `stepPrologue` and applies the effects.
- On every `end`, the applier also calls `setActive(false)` and `openRing(false)` (defensive, like `holdClock(false)` and `grantRoar(false)`), so the ambient spawner and the touch ring return to normal on every terminal path.
- `spawnWave` calls `store.spawnMob(x, z, type, null, { prologue: true, damage: Math.round(MOB_TYPES[type].damage * PROLOGUE_DAMAGE_SCALE) })` over `prologueSpawnCandidates(heading)`, until 3 succeed. `prologueTarget` becomes the first success point.
- `writeFlag('started')` runs at the first `spawnWave`, so a reload never restarts the prologue.
- The `end` reason writes `'done'` or `'skipped'`, then writes the deferred `crafty_onboarded` and releases the deferred toasts (in that order, both in the end handler).
- A capture-mode check (`isCaptureMode()`) runs at the top of every tick. Entering capture ends nothing and writes nothing; it just stops ticking. This check is the ONLY capture guard (eligibility cannot see capture), so it has its own test (Step 2b) and mutant (M10.7).

**Coach copy** (en / zh-CN; touch variants never name a key):

| key | en | zh-CN |
|---|---|---|
| `prologue.speaker.pike` | Old Pike | 老派克 |
| `prologue.coach.muster` | Husks at the gate! Follow the arrow, and hold the Hearth. | 有怪物冲到营地门口了！顺着箭头走，守住营火。 |
| `prologue.coach.dodge` | When one rears back to strike, roll aside: Shift. | 看到它往后一缩要扑过来，就翻滚闪开：按 Shift。 |
| `prologue.coach.dodge.touch` | When one rears back to strike, tap the roll button. | 看到它往后一缩要扑过来，就点翻滚键闪开。 |
| `prologue.coach.perfect` | Right on the lunge. That is a perfect dodge. | 正好躲在它扑过来的一刻，完美闪避！ |
| `prologue.coach.heavy` | Hold attack to wind up a heavy swing, then let go. | 按住攻击键蓄力，松开打出重击。 |
| `prologue.coach.heavy.touch` | Hold the attack button to wind up a heavy swing, then let go. | 按住攻击按钮蓄力，松开打出重击。 |
| `prologue.coach.roar` | The ember answers you, once. Hold R to become the beast. | 余烬回应了你，只此一次。按住 R，化身为兽。 |
| `prologue.coach.roar.touch` | The ember answers you, once. Hold WILDHEART to become the beast. | 余烬回应了你，只此一次。按住 WILDHEART，化身为兽。 |
| `prologue.coach.emberSleeps` | The ember sleeps. Earn it back: reach level 3, unlock Primal Roar in Talents (U), and fill the beast bar in a fight until it reads ROAR! | 余烬睡去了。想再唤醒它：升到 3 级，在天赋（U）里解锁 Primal Roar，再在战斗中把野兽能量条攒满，直到显示 ROAR! |
| `prologue.coach.emberSleeps.touch` | The ember sleeps. Earn it back: reach level 3, tap the locked WILDHEART to unlock Primal Roar, and fill the beast bar in a fight until it reads ROAR! | 余烬睡去了。想再唤醒它：升到 3 级，点上锁的 WILDHEART 解锁 Primal Roar，再在战斗中把野兽能量条攒满，直到显示 ROAR! |
| `prologue.coach.earnIt` | The moment passed. The beast can still be yours: reach level 3 and unlock Primal Roar in Talents (U). | 这次没抓住机会。化身之兽仍会属于你：升到 3 级，在天赋（U）里解锁 Primal Roar。 |
| `prologue.coach.earnIt.touch` | The moment passed. The beast can still be yours: reach level 3 and tap the locked WILDHEART. | 这次没抓住机会。化身之兽仍会属于你：升到 3 级，点上锁的 WILDHEART。 |
| `prologue.coach.skip` | Skip | 跳过 |
| `prologue.coach.skipHint` | Esc to pause; Skip is there. | 按 Esc 暂停，可以在那里跳过。 |
| `prologue.skipFight` | Skip the opening fight | 跳过开场战斗 |
| `prologue.objective` | The husks | 怪物来处 |

**Names in the copy are the names as RENDERED.** The Aspect and talent names are English-only data today: the ring sector reads `WILDHEART` (`src/game/keyMap.js:28` via `src/input/aspectWheel.js:33`), the talent is `Primal Roar` (`src/game/talentTree.js:34`), and nothing in `src/` says 野性之心 or 原始咆哮. So both locales quote `WILDHEART` and `Primal Roar` as rendered. The Ferocity meter has no on-screen name (`src/HUD.jsx:126-133` shows an icon, the value, and `ROAR!` when full), so the copy describes it by what it shows. If the talent tree is translated later, these rows change with it, and the gate below forces that.

**Touch variants are rendered through a literal table** in `PrologueCoach.jsx`, `const TOUCH_KEY = { 'prologue.coach.dodge': 'prologue.coach.dodge.touch', ... }`, never as `key + '.touch'` or `` t(`${key}.touch`) ``: an empty static prefix registers no dynamic prefix (`src/i18n/keyReachability.js:64-65`), so a computed variant is a dead key to `tests/i18n/key-resolution.test.js:96-99`.

- [ ] **Step 1: Write the failing applier and observation tests.**
  - `applyPrologueEffects.test.js` with a recording `api`:
    - every effect type mapped to exactly one api call;
    - `end` always followed by `holdClock(false)`, `grantRoar(false)`, `setActive(false)` and `openRing(false)`, even when the effect list omits them (a defensive mapping);
    - `writeFlag('started')` once on the first `spawnWave`, never twice.
  - `buildObs.test.js` (presence first: a live state gives `alive: true`, `saveLoaded: false`):
    - `isAlive: false` gives `alive: false`;
    - `prologueSaveLoaded: true` gives `saveLoaded: true`;
    - a `prologue` brute with `windupUntil > now` gives `bruteWindingUp: true`, and one with `windupUntil <= now` gives false;
    - an untagged (ambient) husk is NOT counted in `waveAlive` or `huskAlive`.

- [ ] **Step 2: Write the failing coach gate** `tests/gates/prologue-coach-gates.test.jsx`.
  - For `prologueCoach = 'prologue.coach.dodge'`: in jsdom with `isTouchUIMode` mocked false the text contains "Shift"; mocked true it contains no `Shift|\bR\b|\(U\)`; in `zh-CN` it equals the zh-CN `.touch` string.
  - Under touch, the Skip button exists and calls `skipPrologue`. Under desktop, the `prologue.coach.skipHint` line is shown (the cursor is locked in play, so a desktop button could not be clicked).
  - **Names as rendered.** A table in the test lists, per coach key, which names it quotes (`talent`, `aspect`, or both). For each listed key, in BOTH locales, the string contains the `wildheart_roar` node's `name` from `ASPECT_TREES` (`src/game/talentTree.js:9,34`) where it quotes the talent, and the roar entry's `aspect` from `ASPECT_VERBS` (`src/input/aspectWheel.js:27-34`) where it quotes the Aspect, both read from the data modules (so translating the data without the copy, or the copy without the data, turns this red); and no coach string contains `野性之心` or `原始咆哮`. Presence first: the en `prologue.coach.roar.touch` string contains `WILDHEART`.
  - The coach's box style keeps it out of the centre third: its `left` and `width` come from one exported constant, `COACH_BOX = { top: '9%', left: '3%', maxWidth: '30%' }`, and the test asserts `left + maxWidth <= 33%`. Rendering `QuestTracker` with `prologueStep: 'dodge'` gives no `quest-tracker` element, and with `prologueStep: null` it renders (presence control). Unit 11 case A also asserts in the running game that the two bounding rects never intersect at 1280x800.

- [ ] **Step 2a: Write the failing Settings-skip gate** `tests/gates/settings-skip-gates.test.jsx`. Render `SettingsPanel` with `gameStarted: true` and `prologueStep: 'dodge'`: the "Skip the opening fight" button is present (assert presence FIRST), and clicking it calls `skipPrologue`. With `prologueStep: null`, the button is absent.

- [ ] **Step 2b: Write the failing director gate** `tests/gates/prologue-director-gates.test.jsx` (jsdom, fake timers, the store's `spawnMob` replaced by a spy that returns true).
  - **Capture.** Presence control first: with capture OFF, mount `PrologueDirector`, set `active` true and `isSpawnChunkLoaded` true with a ground probe, advance 2 s, and assert `spawnMob` was called and `clockHeld` is true. Then, in a fresh mount, call `enterCaptureMode()` first, advance 2 s, and assert no `spawnMob` call, `clockHeld` false and `prologueCoach` null.
  - **A save load mid-prologue.** Start as above, wait for `prologueStep === 'dodge'` (feed a successful spawn), set the roar grant, call the store's `loadWorldData` with a minimal save, advance 300 ms, and assert `clockHeld === false`, `prologueRoarGrant === false`, `prologueActive === false`, and the flag `'done'`.
  - **A death mid-prologue.** The same, with `isAlive: false` instead of the load.

- [ ] **Step 3: Write the failing objective test** for `pickObjective`. A live `prologueTarget` beats the shrine; a null one falls through to today's behaviour (shrine, then Blight Heart). This is the presence control.

- [ ] **Step 4: Write the failing harness test** `tests/scripts/prologue-seeding.test.js`.
  - Import `_fixtures.js`'s exported seeding function and assert it writes `crafty_prologue_v1='done'` by default and nothing under `'fresh'`. Do the same for `_profile.mjs`'s `seedProfile` against a fake puppeteer page (records `evaluateOnNewDocument`) and a fake Playwright page (records `addInitScript`).
  - Then glob `scripts/**/*.mjs`, select every file whose source contains the call form `.newPage(` (anchored to the call, not a bare token; gates-and-probes 4), and assert each imports `_profile.mjs`. Print the denominator and assert it is at least 31 (the count on main, 2026-10-27), so a glob that silently matches nothing cannot pass.

- [ ] **Step 5: Write the failing lazy-prologue check** in `scripts/ci/bundle-budget.mjs`, on the same marker shape as the existing lazy-panel check (`:96-130`), because an existence check cannot see code that ALSO sits in `index`:
  - `'spawn-failed'` (a reason string only the reducer and director carry) must be ABSENT from `index-*.js` and PRESENT in `PrologueDirector-*.js`;
  - `'prologue-coach'` (the coach's testid) must be ABSENT from `index-*.js` and PRESENT in `PrologueCoach-*.js`;
  - both chunks must exist. Fail loud, naming the marker and the chunk.

- [ ] **Step 6: Run** `npx vitest run src/game/prologue/ tests/gates/prologue-coach-gates.test.jsx tests/gates/settings-skip-gates.test.jsx tests/gates/prologue-director-gates.test.jsx tests/scripts/prologue-seeding.test.js`, plus `npm run build && node scripts/ci/bundle-budget.mjs`. Expected: all FAIL.

- [ ] **Step 7: Implement.**
  - The director, the coach, the boot flag read, and the App mounts: `const PrologueDirector = lazy(() => import('./game/prologue/PrologueDirector.jsx'))`, mounted ONLY when `PROLOGUE_ELIGIBLE_AT_BOOT` holds and no prologue end has been recorded this session.
  - The boot arm (`setPrologueActive(true)` in a mount-time `useLayoutEffect` when eligible).
  - The deferred onboarding: when eligible, neither the `crafty_onboarded` write nor the toasts run at world build; the director's end handler runs both.
  - The Settings skip, the coach (touch Skip button, desktop hint), the QuestTracker collapse, the HUD extraction, the store fields, the strings, the `readMobs` `prologue` field, the fixture and `_profile.mjs` seeding across every page creator, and the bundle-budget check.
  - `prologueBoot.js` must be imported by `App.jsx` above the component definition, so the flag is read before any onboarding write. A test in Step 1's file imports `prologueBoot.js` after seeding `crafty_onboarded` and asserts ineligible.

- [ ] **Step 8: Run** the Step 6 commands, then `npm run test:unit`, `npm run lint` and `node scripts/ci/i18n-adoption.mjs`. Expected:
  - all PASS, including `tests/i18n/key-resolution.test.js` with no dead keys;
  - the bundle printout shows both lazy-prologue markers absent from `index` and present in their chunks, and `index` drift ≤ +6,000 B for the milestone so far, with the number written in the commit message;
  - i18n parity green and adoption not risen.

- [ ] **Step 9: Commit** (with the `Mutation-Proof:` trailer for the bundle-budget, seeding, Settings-skip and director gates). Mutants:
  - **M10.1** The applier drops the defensive `holdClock(false)` on `end`: red.
  - **M10.2** The touch coach uses the desktop key: red.
  - **M10.3** `pickObjective` ignores `prologueTarget`: red.
  - **M10.4** The fixture seeds nothing by default: the seeding test goes red. Also: one `scripts/visual/*.mjs` drops its `_profile.mjs` import: red, naming the file.
  - **M10.5** A static `import PrologueDirector` in `App.jsx`: the bundle check goes red (`spawn-failed` found in `index`).
  - **M10.5b** `prologueBoot.js` imports from `prologue.js` instead of `prologueFlags.js`: the bundle check goes red (`spawn-failed` found in `index`).
  - **M10.6** `prologueBoot` reads the flags lazily inside a function called from an effect: the ordering test goes red.
  - **M10.7** Delete the director's per-tick capture check: the director gate's capture case goes red.
  - **M10.8** `buildObs` never reads `prologueSaveLoaded`: `buildObs.test.js` and the director gate's load case go red.
  - **M10.9** The Skip button removed from `SettingsPanel`: the Settings-skip gate goes red.
  - **M10.10** The applier drops `setActive(false)` on `end`: the applier test and the director gate's load case go red.
  - **M0** identity.

### Unit 11: The lived proof (real input, the running game)

**Files:**
- Create: `tests/e2e/prologue.spec.js`
- Create: `tests/e2e/prologue-touch.spec.js` (reuses `touch-hold.spec.js`'s CDP touch helpers: `touchStart`/`touchEnd`, and `aimAt` hit-testing)

**What would still pass if the feature were deleted?** Every case asserts a POSITIVE observed in the running game: the coach's `data-step` advancing by signal, prologue-tagged mobs existing and then dying, `beastFormActive` true, and the flag written. A deleted director makes A and F fail on the first `waitForFunction`. Case B (returning) alone would pass against a deleted feature, which is why it is the control and never the proof.

**The cases** (fresh browser contexts; `test.use({ prologue: 'fresh' })` except B):
- **A. Desktop, real input.**
  - `bootDev`, then a real mouse click on `[data-testid="title-start"]`, then `startPlayActive`'s live-input proof.
  - **Ambient hostiles held** (D9): from the first `readMobs` after the world is built through the end of `heavy`, poll every 1 s: assert prologue-tagged mobs exist once `muster` has spawned them (presence FIRST), and that the count of mobs with `prologue` false and `passive` false is 0 (any distance: the 20-mob boot ring is included).
  - **Coach and quest tracker never overlap**: while `prologue-coach` is visible, `quest-tracker` is absent or its bounding rect does not intersect the coach's.
  - Wait for `data-step="dodge"`. Aim: rotate the camera with real mouse movement (pointer lock refused headless means `startPlayActive`'s path; read how `heavy-melee.spec.js` aims and reuse it) until a prologue husk is in the melee cone.
  - `keyboard.down('Shift')` and `up`, and assert the step left `dodge` BY SIGNAL (the director logs the reason to `window.__craftyTest.prologueLog` in DEV).
  - Hold the mouse past `HEAVY_HOLD_MS + HEAVY_CHARGE_MS`, release, and assert the step left `heavy` by signal.
  - At `roar` entry, set the variable the assertion reads: `setFerocityBanked(50)`, then read the bank as `b0` immediately before pressing R. Hold R for `ANTICIPATION_SEC + 0.3` s, assert `beastFormActive === true`, and read `b1` at once: assert `b1 >= b0` (M7.4). Under the mutant `b1` is `clamp(b0 - 100 + kills)`, and the three wave mobs can bank at most 48 in that window, so it falls below `b0`; with the bank left at 0 the clamp would hide the spend.
  - Wait for `end:done`, and assert:
    - `localStorage['crafty_prologue_v1'] === 'done'`;
    - kill stats ≥ 1;
    - `gameTime` equal to its value at muster, and `nightCount === 0` (D6);
    - `clockHeld === false` after the end;
    - the play-start-to-beast wall time printed.
  - Test timeout 300 s. Ordering is asserted, not wall time: the refute doubts 120 s on SwiftShader.
- **B. Returning profile (control).** The default seeded `done`. For 20 s of live play: `prologueStep` stays null, no entity has `prologue: true`, and the clock advances.
- **C. Legacy profile.** Seed only `crafty_onboarded='1'`: the same assertions as B.
- **D0. Reload on the title, before Start.** Fresh, wait for `isSpawnChunkLoaded` behind the title, assert `localStorage['crafty_onboarded']` is still null, reload, click Start, and assert `data-step` reaches `muster` (the prologue still runs).
- **D. Reload mid-prologue.** Fresh, wait for `dodge`, reload: after the world is ready, `prologueStep` stays null and the flag is `'started'`.
- **E. Skip, desktop.** Fresh, wait for `muster`, press Escape (a real key). In headless the refused relock goes through `pointerlockerror` (`src/Components.jsx:563-565`), `active` falls, and with `gameStarted` set by the real Start click the unlock transition opens Settings (`src/App.jsx:202-206`), the same surface a real browser's lock release reaches. Assert `[data-testid="settings-panel"]` is visible (a SETUP failure if it never opens, so a mutation run reports COULD NOT CHECK rather than a catch), then click "Skip the opening fight" inside it by real mouse: `end:skipped`, the clock released, `prologueActive` false, the wave's mobs keep their scaled damage.
- **F. iPad (Chromium, iPad Pro 11 landscape emulation, real CDP touch).** Tap `title-start`, then tap `touch-tap-to-play` if shown. At `dodge`, tap `touch-dodge`. At `heavy`, hold `touch-action` past the charge. At `roar`, the ring is open by itself (assert `touch-aspect-roar` exists with `data-locked="false"` without tapping the opener); hold it past `ANTICIPATION_SEC`, and assert `beastFormActive`, with the same bank set-and-compare as A (`setFerocityBanked(50)` at roar entry, `b1 >= b0`). Wait for `end:done`. This is not WebKit: real Safari is Kevin's device and the Phase 0d iPad probe (stated limit).

- [ ] **Step 1: Write both specs.** The `Mutation-Proof:` block in the header lists the planned e2e mutants (OWED until observed).

- [ ] **Step 2: Do not run them locally on a loaded machine.** `uptime` first. If load ≥ cores, push to a branch and let CI run them (they are CI-only by design; the push is checked by `e2e-freshness`).

- [ ] **Step 3: The command session runs the mutation batch** with `sh scripts/dev/mutate-e2e.sh`, E0 identity included. Mutants and the case expected to catch each:
  - **E1** Delete the director mount in `App.jsx`: A, F.
  - **E2** M7.3, M7.4: A, F.
  - **E3** M8.2, M8.3: A.
  - **E4** `PROLOGUE_DAMAGE_SCALE = 1` and brute damage restored: no case catches it. This is a stated limit; tuning is judged by play.
  - **E5** `prologueBoot` treats a legacy profile as fresh: C.
  - **E6** `writeFlag('started')` removed: D.
  - **E7** The skip button wired to nothing: E.
  - **E8** The touch ring not opened by the roar coach: F.
  - **E9** `clockHeld` never set: A's `gameTime` assertion.
  - **E10** The `crafty_onboarded` write restored at world build for eligible profiles: D0.
  - **E11** The boot arm removed (`prologueActive` set only at muster): A's zero-ambient-hostiles assertion.
  - **E0** Identity (a comment in `PrologueDirector.jsx`): all green.

  Replace OWED with the observed verdicts in a follow-up commit.

- [ ] **Step 4: Sweep.** Run: `sh scripts/dev/kill-test-procs.sh`. Say "a local run bound port 4179; I cannot see whether a tab was left", never "all clean".

### Unit 12: Real-GPU looks and the baseline

**Files:**
- Modify: `scripts/visual/lookbook.mjs` (from feat/instruments):
  - a `title` shot set: no pose, the title layer up, motion on, 3 s of orbit;
  - a `--hold title` scenario for `scripts/dev/power-ab.sh`, which today holds a fixed IN-GAME scenario with Start clicked, so it cannot measure the title idle;
  - a `prologue` shot set: a fresh profile, real key input reading the coach's `data-step` from the DOM (prod-reachable), shots at `dodge`, `heavy` and `roar`, and in beast form.
- Re-shoot (its own commit): `tests/visual/baseline/menu.png` and any other frame the capture diff names.

- [ ] **Step 1: Shoot the lookbook on the prod build.** Chromium new-headless on ANGLE-Metal, and WebKit, each at 1180x820 and 820x1180 (plus 1280x800 for the title), motion on. Save the frames to `docs/superpowers/masterpiece-2026-10/evidence/after-first-minute-*.jpg`.

- [ ] **Step 2: Open every frame by eye** beside the `before-*` set. Check:
  - the wordmark is clear of the face, and the hero is on the left third (landscape) or centred (portrait);
  - golden light, with no navy stone in WebKit portrait (the Phase 1 defect must not reappear on the island);
  - with antialias OFF on the coarse-pointer (iPad) frames and the orbit in motion (a short frame sequence, not a still): no edge crawl or shimmer on the voxel edges and the hero's outlines; if there is, antialias comes back on for the title and the D3 row is corrected;
  - the motes read as soft light, not lens dust;
  - the coach is outside the centre third during combat;
  - Chinese renders in CJK fonts (switch the locale in one shot).

  Write what was seen, per frame, in the commit message. "Looks right" is not a verdict.

- [ ] **Step 3: Stranger test** (Kevin or anyone not on the project). Show the title for one second and ask "what is this game?". Record the answer verbatim in `docs/superpowers/KEVIN-REVIEW-BATCH.md`.

- [ ] **Step 4: Measure the heat.**
  - On the prod build at the title, read the Diagnostics readout (DPR, renderer, frame rate, draw calls, triangles) and the GPU-time signal (or ABSENT), and record the before and after.
  - Hand Kevin `scripts/dev/power-ab.sh --hold title` (feat/instruments) for a title-idle A/B on his M3 Max: arm A is the commit before Unit 3, arm B is the commit after Unit 4. This is REQUIRED for Units 3-4's heat claim, not optional: the script runs `powermetrics` as root and says no agent runs it, so it is a Kevin-gated item in `docs/superpowers/KEVIN-REVIEW-BATCH.md`. Until he runs it, the D3/D4 GPU rows read "unmeasured", never "negative".

- [ ] **Step 5: The baseline.**
  - On an idle machine: `npm run visual:capture`, then the diff report. Only the frames this milestone meant to change may move (`menu`, and `title-mascot` if the diorama feeds it).
  - Commit the new PNGs ALONE with `Baseline-Review: menu (recomposed title, golden-hour island, Units 2-4); <any other frame and why>`, and no `frontend/src/` in that commit (the baseline-trailer gate refuses a bundle).

---

## Acceptance

The milestone is done when ALL of these hold, each observed rather than inferred:

1. **Lived, desktop.** CI's `prologue.spec.js` case A is green on the merge commit, and the mutation batch's verdicts are recorded (E0 survived; E1-E3 and E5-E11 caught).
2. **Lived, iPad performability.** Case F is green in CI, and the Phase 0d iPad probe in WebKit on the prod build completes the prologue's three verbs with its own touch input. If WebKit cannot be driven to completion, that is a named gap in `docs/superpowers/KEVIN-REVIEW-BATCH.md` with Kevin's device as the closing check, never a pass.
3. **Lived, real GPU, the 120 s claim, as a LOWER BOUND.** The lookbook's prologue run on the M3 Max prod build prints the time from Start to the first kill and to `beastFormActive`; target ≤ 120 s. The roadmap's lived proof is measured here, not on SwiftShader (refute move-6 row). A bot that fires each verb the instant its step appears measures the director's pacing (the grant at brute windup or 6 s, the 14 s form), not "a new player has fought as the beast inside the first minute or two". The human claim is the family play session (Kevin with a young player; Risks), recorded verbatim in `docs/superpowers/KEVIN-REVIEW-BATCH.md` with the observed time.
4. **The control.** Cases B, C and D are green: returning, legacy and reloaded profiles never see the prologue. Case D0 is green: a new player who reloads on the title before Start still gets it.
5. **Not a siege night.** Case A asserts `nightCount === 0` and `gameTime` unchanged across the prologue.
6. **Looks.** Unit 12's frames were opened by eye on both engines and both iPad orientations, and what was seen is written down. The baseline re-shoot is its own `Baseline-Review:` commit.
7. **i18n.** `title-i18n-gates` and `prologue-coach-gates` are green; the adoption ledger is at or below Unit 1 Step 5's frozen total minus 3; key parity is green; and a zh-CN title and coach frame is in the lookbook set.
8. **Bytes and heat.** `index` drift is ≤ +6,000 B over the Unit 0 baseline (printed); the lazy-prologue markers are absent from `index` and present in `PrologueDirector-*.js` and `PrologueCoach-*.js`; the title's draw calls, triangles, DPR, frame rate and GPU-time signal (or ABSENT) before and after are recorded; the island's added triangles, texture bytes, compile cost and screen share are stated; and Kevin's title-idle `power-ab.sh` A/B (Unit 12 Step 4) has run, or its absence is an open Kevin-gated row and the heat claim is written as unmeasured.
9. **Gates and review.** `npm run test:unit`, `npm run lint`, `npm run build`, `node scripts/ci/bundle-budget.mjs`, `node scripts/ci/gate-shape.mjs`, `node scripts/ci/killability-ledger.mjs` and `node scripts/ci/doc-currency.mjs` are all green; `/code-review xhigh` has run per change range; and one adversarial reviewer at xhigh has refuted D7, D9 and D10's seams. Findings are fixed or ledgered with owners.

## Risks

- **Every harness meets the prologue** (Review Focus 2). Mitigation: seeding lands in the SAME unit that mounts the director (Unit 10), over every page creator under `scripts/` through one helper, and the director stops ticking under capture (eligibility cannot see capture, which is entered after boot).
  - Residual: a page creator that opens pages through a call form other than `.newPage(` (for example a pre-created context's default page).
  - The test prints its count and asserts a floor of 31. Compare it against `grep -rl "\.newPage(" scripts | wc -l`.
  - With `prologueActive` armed at boot, an UNSEEDED capture run would shoot a passive-only boot ring; capture.mjs is a page creator under the seeding test, so it is seeded.
- **`Components.jsx` edits** (Units 7 and 8). These are three one-line call swaps and three one-line emits in the irreducible controller. No ordering changes, and none move a statement across the capture or dead-window early returns. Mitigations: the adversarial review is pointed here, and e2e mutants E2 and E3 prove reach.
- **The terrain-material move** (Unit 4) touches `Terrain.jsx`, which material-grammar (roadmap 9), the colour script and the lantern-block-light plan also edit. The lantern plan splices block light into `compileShader` and the terrain uniforms (`docs/superpowers/plans/2026-10-27-crafty-lantern-block-light.md:571,608-609`), the very code this move relocates.
  - Mitigation: a pure move, proven byte-identical on an idle capture, landed as its own commit early in the Phase 2 window; or deferred to consume that lane's factory.
  - Order, agreed in advance: the move lands FIRST, and from then on both this plan and the lantern lane edit `src/world/terrainMaterial.js`, not `Terrain.jsx`. If the lantern lane lands first, Unit 4 moves the code WITH its splices, byte-identical, and re-runs the lantern lane's gates. The command session tells the lantern lane which order happened.
  - Unit 4 is droppable without harming Units 1-3.
- **Two WebGL contexts at the title** (the diorama, plus the game at 10 fps on steady-cool). Unit 3 makes the diorama cheaper, but the stacked-canvas regression on Safari < 27 is untested against Kevin's iPad. The fallback is the one-surface title (Design, "Rejected for now").
- **A young player is overwhelmed.**
  - Mitigations: damage ×0.35; ambient hostiles held from BOOT (the 20-mob boot ring is passive on an eligible profile, proven by case A's zero-ambient-hostiles assertion; skeleton arrows' hard-coded 15 damage, `ai.worker.js:216`, therefore never meets a new player in the prologue); every step times out to the next; the clock held; and Skip in Settings and on the coach.
  - Residual: a moss brute is still large and loud. Kevin, or a young player with him, playing it is the real check.
- **Roar discoverability on desktop.** R is not taught anywhere before this beat. The coach names it; the ring does the same job on touch. Not measured until someone plays it.
- **Lent roar leaking.** The grant must die on every terminal path (Unit 5's all-terminals test, Unit 10's defensive applier). The grant is not serialized, so a reload clears it.
- **Byte creep from the coach strings** (~2.9 KB in `index` with the skip keys). If Phase 1 consumed more headroom than expected, the prologue's string table moves to a lazy-merged locale fragment. That changes `t()`'s contract, so it gets its own decision.
- **The detector widening (Unit 1) surfaces debt.** The ledger ceiling rises once, documented. Paying down the ~34 other strings is not this milestone's work, but the ratchet now holds them.

## Out of scope

- The play-HUD relayout from roadmap move 6: level and XP folded into the player card, the quest tracker collapsed to one objective, the tool rail auto-hidden in combat, panels faded after 4 s idle. It is not in the umbrella's Phase 2 list. It shares `HUD.jsx` with move 2's ticker, and gets its own plan.
- An "Earn the Roar" tracked quest. Quest titles are English-only data (`src/QuestSystem.jsx:28-56`) and there is no `unlock_talent` quest type. The closing coach line carries the pointer instead.
- A voiced Old Pike line, and a sampled horn. The prologue uses the existing synth `siegeHorn` (`src/SoundManager.jsx:579`). Voice and samples belong to the sound lane (roadmap 8).
- Any change to the siege ramp, `siegeWarning`'s English strings (`src/game/dayNight.js`), or day length (refute, "important items" 3).
- The one-surface title, a three/R3F bump, WebGPU/TSL.
- The social preview / OG image (`scripts/visual/make-og-image.mjs`). Re-shoot it after this lands, as its own change.

## Open questions

1. **The wordmark in Chinese.** This plan keeps `Crafty` in Latin letters in both locales, as a brand. Should zh-CN show a Chinese name beside it? (Kevin)
2. **The tagline copy** in both languages is a draft (Unit 1 Step 8). Kevin may rewrite it. The key stays.
3. **The colour script's seam** (Unit 0 Step 2) is recorded as `sampleScript(f, out?) -> ScriptFrame` with linear colours. Confirm with the light-and-colour lane before Unit 3 that it has not changed.
4. **The game canvas behind the title.** Steady-cool paces it at 10 fps to keep shaders warm, while roadmap move 6's heat budget says it should not draw. Settle it with Kevin's powermetrics A/B, not by argument.
5. **`PROLOGUE_DAMAGE_SCALE = 0.35`** and the 25 s roar window are first guesses for an eight-year-old. Kevin-tunable after a play session.
6. **Kevin's iPadOS and Safari version** (umbrella open question). If it is below Safari 27, the one-surface title moves up.

## Review amendments (2026-10-27)

An adversarial review of this plan returned 19 findings (2 HIGH, 11 MED, 6 LOW). Each was re-checked against the code on `main` (and the Phase 0 worktrees where named) before any change; a review verdict is a hypothesis. **19 applied, 0 rejected.** Where the re-check narrowed or extended a finding, the disposition says so.

| # | Sev | Finding | Re-check | Disposition |
|---|---|---|---|---|
| 1 | HIGH | The desktop Skip was put on MenuSystem's title block, which never renders after Start | Confirmed: `src/ui/panelState.js:77` returns false once `gameStarted`; Start calls `markGameStarted()` (`src/MenuSystem.jsx:72`); the unlock transition opens Settings (`src/App.jsx:202-206`); ESC with no panel only re-requests the lock (`src/InputManager.jsx:87-94`). In headless, `forcePlay` sets `active` without `gameStarted` (`src/App.jsx:319-325`), the refused relock fires `pointerlockerror` (`src/Components.jsx:563-565`), and with `gameStarted` from the real Start click Settings opens | **Applied.** The Skip moves into `SettingsPanel` (lazy panel chunk) for every input mode, plus the coach (a button on touch, an "Esc, then Skip" hint on desktop where the cursor is locked). New jsdom gate `settings-skip-gates` (presence first) and mutant M10.9. Case E rewritten: ESC, assert the Settings panel, click Skip inside it. D10 and the Unit 10 file list updated |
| 2 | HIGH | Ambient hostiles are not held: the 20-mob boot ring spawns before Start, ~70% hostile, before anything sets `prologueActive` | Confirmed: `src/systems/SpawnerSystem.jsx:97-104` fires on `isSpawnChunkLoaded`, behind the title; hostile weights 6.15 vs passive 2.6 (`src/game/mobTypes.js:7-20`); the applier api had no `prologueActive` setter. One sub-claim did not hold: the ring already reaches the pick, because it calls `spawnMob(x, z)` with no `forceType` and the pick lives inside `spawnMob`, so no rerouting is needed; the defect is WHEN the flag turns true | **Applied.** A boot arm in `App.jsx` (a mount-time `useLayoutEffect`) sets `prologueActive` when eligible, before the ring can fire; the applier clears it on every `end` (`setActive` added to the api, M10.10). D9 restated: 20 boot (passive) + 3 scripted, zero ambient hostiles. Case A asserts zero non-prologue hostiles with prologue mobs present first; `readMobs` exposes `prologue`; mutant E11 |
| 3 | MED | Unit 2's control measured a different variable from the defect and would fail on a correct implementation | Confirmed by the repro the reviewer specified (`<session scratchpad, not kept>/first-minute-probe.mjs`, run 2026-10-27): today's hat top projects to y 0.285 (bounding-box corners 0.282-0.289), the face centre to 0.598 and the boot sole to 0.840. So `y0 < 0.26` was false at baseline, and M2.1 left the band case green | **Applied.** The control now encodes the observed defect: today's FACE overlaps today's bottom-anchored wordmark, whose rect is measured once in a real browser (Step 1a). The bands are not in the control, so it cannot be tuned to agree. M2.1 is restated honestly (only the left-third case kills it); M2.3 retargeted at the face box |
| 4 | MED | The cost and island gates test pure helpers, not the component | Confirmed: the only rendered check was the DPR; `tests/gates/capture-dpr-gates.test.jsx:23-28` already mocks the Canvas and records props | **Applied**, with one stated blind spot. The Canvas mock now records `dpr`, `gl.antialias`, `frameloop` and the direct-child `FrameCap`/`TitleIsland` elements; component mutants M3.6, M3.7 and M4.4. The mesh count INSIDE the motes is not visible to jsdom (the mock renders no children, and no R3F test renderer is installed: `node_modules/@react-three/` holds drei, fiber, postprocessing and rapier only), so it is measured by the prod-build draw count instead |
| 5 | MED | D3's draw arithmetic is wrong, and D4 omits the island's fill and compile cost | Confirmed: `MascotCraftyHero.jsx` has 30 `Cube` (21 with drei `Outlines`, `voxelKit.jsx:14-20`) and 40 Cube/Emissive/Ink in all, so the hero alone is ~61 draws and the title ~90, not ~33; `power-ab.sh` states that no agent runs it (root `powermetrics`) | **Applied.** D3 restated (~90 to ~63; the hero stays the dominant draw cost); D4 names fill, compile and a cheaper fallback material; Unit 3/4 measure triangles, compile cost and a GPU-time signal (or ABSENT); the title-idle `power-ab.sh` A/B becomes REQUIRED and Kevin-gated, with a `--hold title` scenario added to the lookbook; until it runs the heat rows read "unmeasured" |
| 6 | MED | The fixed title DPR `[1, 1.5]` breaks the pixel-budget decision of record and the iPad low tier | Confirmed: `docs/superpowers/DECISIONS.md:50-51`; steady-cool's `src/render/pixelBudget.js` (`pixelBudgetDpr`, low 1.8 Mpx / cap 1.25); 1180x820 at 1.5 is 2.18 Mpx, and 1728x1117 at 1.5 is 4.34 Mpx | **Applied.** `titleCanvasProps` takes the tier and viewport and returns `min(1.5, pixelBudgetDpr(...))`; gate cases for iPad low and the M3 Max window. The antialias-off look risk is in the D3 row and judged on moving WebKit iPad frames in Unit 12 |
| 7 | MED | Capture mode is not a boot-time input, so "capture is ineligible" was false, and the director's capture check was untested | Confirmed: `src/devtest/captureMode.js:17,44` (entered after boot); no Unit 10 test or mutant targeted the check. The perf probe IS a boot-time input (`src/devtest/perfProbe.js:25-29`, a URL read), so it stays | **Applied.** `capture` dropped from `prologueEligible`; a jsdom director gate with a capture-off presence control and the capture case; mutant M10.7; Review Focus 2 and Risks corrected |
| 8 | MED | Nothing proves the director FEEDS death or a save load to the reducer | Confirmed from the plan text: the reducer and the applier were each tested, the observation builder between them was not | **Applied.** A pure `buildObs` with its own test, plus director-gate cases for a `loadWorldData` call and a death mid-prologue; mutant M10.8 |
| 9 | MED | M7.4 survives when the Ferocity bank is 0 | Confirmed: `clampFerocity(0 - 100)` and `clampFerocity(32 - 100)` both print 0 (same repro) | **Applied**, refined: case A (and F) sets the bank to 50 at roar entry and asserts `b1 >= b0` around the roar, not equality, because a husk kill in that window can add 16; under the mutant the bank falls by at least 52 |
| 10 | MED | A reload on the title before Start loses the prologue for good | Confirmed: `src/App.jsx:115-124` writes `crafty_onboarded` at world build, behind the title | **Applied.** On an eligible profile the WRITE (not only the toasts) is deferred to the prologue's end; case D0 and mutant E10 |
| 11 | MED | The byte rows exceed their own ceiling, and one module cannot be split between `index` and a lazy chunk | Confirmed (arithmetic): the rows summed to 6.2 KB. The chunking claim matches how Rollup assigns whole modules to chunks, but no build was run in this re-check | **Applied.** `prologueFlags.js` (main) split from `prologue.js` (lazy only); rows re-totalled to ~5.45 KB; the bundle check uses absent-from-`index` markers (`spawn-failed`, `prologue-coach`) on the existing lazy-panel shape (`scripts/ci/bundle-budget.mjs:96-130`); mutant M10.5b |
| 12 | MED | Unit 1 added keys nothing rendered, and computed `.touch` keys are dead to the classifier | Confirmed by the same repro: `title.skipPrologue`, `title.aria.vista` and a `` `${key}.touch` `` use all classify `dead`; `tests/i18n/key-resolution.test.js:96-99` fails on any dead key | **Applied.** Each key is added in the unit that renders it (`title.aria.vista` in Unit 3 as the diorama's `aria-label`; the skip keys in Unit 10, renamed `prologue.skipFight`); touch variants go through a literal table |
| 13 | MED | The zh-CN coach copy names UI that does not exist | Confirmed: Aspect and talent names are English-only data (`src/game/talentTree.js:28,34`, `src/game/keyMap.js:28`), and `src/` contains neither 野性 nor 原始咆哮. Extended: the Ferocity meter has no on-screen name at all (`src/HUD.jsx:126-133`) | **Applied.** Both locales quote `WILDHEART` and `Primal Roar` as rendered, and describe the meter by what it shows (`ROAR!`); a names-as-rendered gate reads the names from the data modules |
| 14 | LOW | The "shared probe launcher" does not exist, and the seeding denominator missed page creators | Confirmed: `_serve.mjs` and `_probe.mjs` export no launcher; 31 files under `scripts/` call `.newPage(` (29 in `scripts/visual/`, plus `scripts/perf/run-scenarios.mjs:44` and `scripts/ci/prod-smoke.mjs:140`) | **Applied.** New `scripts/visual/_profile.mjs` for puppeteer and Playwright; every page creator imports it; the seeding test globs `scripts/**/*.mjs`, prints the count and asserts a floor of 31 |
| 15 | LOW | Denominators and one detector fixture cannot discriminate | Confirmed: (a) the old signature gave 32 rows, not 16; (b) 5 steps, not 6, and some pairs are infeasible; (c) the third fixture's `&&` is rejected by the existing filter (`scripts/ci/i18n-adoption.mjs:75`); (d) no re-freeze followed Step 8 | **Applied.** (a) After finding 7 removes `capture`, the table is 4 × 2 × 2 = 16, asserted; (b) an explicit table of 22 feasible pairs; (c) a no-punctuation fixture plus M1.4; (d) a `--write` re-freeze in Step 9 |
| 16 | LOW | The coach box lands on the desktop QuestTracker | Confirmed: `src/QuestSystem.jsx:489` (top-left, max width 280) | **Applied.** The QuestTracker collapses while `prologueStep` is live (jsdom presence control), and case A asserts the two rects never intersect |
| 17 | LOW | The composition is proven only at the capture pose, and phone landscape is missing | Confirmed from the plan text: the orbit was about an offset look-at point; `text-8xl` (`src/MenuSystem.jsx:269`) is 96 px against a 390 px phone height | **Applied.** The camera orbits the hero and a lens shift places it, so the position does not depend on the angle; tests sweep 8 orbit angles; 844x390 added; the band is derived from a viewport-relative wordmark size; mutant M2.4 |
| 18 | LOW | Stale cites and an unnamed collision with the lantern plan | Confirmed: `shouldAdvanceClock` is `dayNight.js:76-78`; `HALF_CYCLE_UNITS` is `:13`; `maxMobs` is `SpawnerSystem.jsx:155`; main has 27 e2e specs; the colour-script seam is `sampleScript(f, out?)` with linear colours; the lantern plan splices `compileShader` (now at its `:608-609`); `onBeforeCompile` is `Terrain.jsx:246-251` | **Applied.** Cites corrected; `sampleScript` recorded as the seam, with the linear-to-sRGB conversion stated (three 0.172's `getHexString()` already converts, `node_modules/three/src/math/Color.js:353`, so no second manual conversion); the moved range includes `:236-251`; Risks names the lantern plan and the order |
| 19 | LOW | Acceptance 3 measures bot pacing, not a new player; the Goal promised a compass marker no unit builds | Confirmed from the plan text | **Applied.** Acceptance 3 is labelled a scripted-path lower bound, and the human claim is the recorded family play session. (The plan's private-name mentions, one original and two from this pass, were also replaced: `opsec-scan` blocks that name as `child-name`.) The Goal now says the objective arrow marks the bearing; a compass marker was not added (fewer moving parts; the arrow is the bearing cue this plan builds) |

**Not verified in this re-check**, so stated as open rather than as results: no build ran, so the Rollup chunk placement, the 5,552 B and 696,924 B figures and the new ~5.45 KB total are unmeasured until Unit 0 Step 3 and each unit's bundle run; the headless ESC-to-Settings path in case E was traced through code, not executed; whether `EXT_disjoint_timer_query_webgl2` is exposed on Chromium ANGLE-Metal or WebKit is unknown, which is why the plan records ABSENT rather than assuming it; the boot-arm ordering rests on the boot ring waiting for `isSpawnChunkLoaded`, and case A's assertion is its lived proof.
