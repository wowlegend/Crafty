# Crafty SOTA reset (2026-10-28)

Measured on main at 58455351 to c2bda904 (read-only). It synthesises five lens reports (architecture, game, visuals,
harness, public), the upside generator and the refuter. Under DECISIONS 2026-10-28 item 14, nothing is off limits. A
decision of record that this plan reverses gets its own new, dated DECISIONS entry naming the entry it supersedes,
never a silent edit.

**How to read the sources.** Every claim carries a source tag:

| Tag | Meaning |
|---|---|
| `[arch A#]` | Architecture lens finding |
| `[game: ...]` | Game lens finding |
| `[vis: ...]` | Visuals lens finding |
| `[harn: ...]` | Harness lens finding |
| `[pub: ...]` | Public lens finding |
| `[up]` | Upside generator |
| `[ref]` | Refuter |
| `[here]` | Checked by command while writing this plan |

**Labels.**
- **UNVERIFIED:** nothing has checked the claim.
- **WEAKENED:** the refuter showed part of the claim is wrong, or its cost is understated. The plan carries the
  narrower version.
- **REFUTED:** the claim was dropped (listed under the table in section 2).

**In-flight state, checked here** `[here]`:
- **Branches and worktrees** (`git worktree list`, `git diff --name-only`):
  - `feat/combat-stance`, local
  - `feat/steady-cool`, PR #24
  - `worktree-wf_34f35934-dfe-1`, the light and colour script, local
  - `fix/ci-required-check`, head de668d11: "one required check, `ci ok`, and a docs-only skip of the browser jobs"
  - `fix/e2e-runner-speed`, head 3fc43749: "canvases at pixel ratio 0.5; the slowest CI shard 978 -> 605 s"
  - `feat/harness-tranche-a`, PR #27
  - `feat/ci-tree-equivalence`, PR #28
  - Flake fixes: `fix/touch-hold-freeze`, `fix/lightning-ci-budget`, `fix/e2e-hardening-2026-10-27`
  - `fix/artifact-currency-scope`
- **Already merged:** `feat/touch-hold`, `feat/instruments` and `feat/parked-looks-perf` carry no commits beyond main.
- **Node engines:** `frontend/package.json:5` reads `"node": ">=24.0.0 <25"`.

---

## 1. The verdict

1. Crafty today is a browser voxel action-RPG with a strong pure-logic kernel and one genuinely good idea: pick an
   element, bank power by day, spend it by night, become the beast. Around it sit a Minecraft-era sandbox layer and a
   process harness that is larger than the game. The sandbox layer is the creative default, a hidden 3x3 grid, hunger,
   hand-allocated attribute points and eight progression axes. The harness is 52,298 lines of tests and scripts
   against 39,113 lines of game source `[harn]` `[game: spine]` `[arch A25]`.
2. A player sees this directly:
   - Two near-black glove slabs, and about a fifth of the eye-level frame in navy chrome `[vis: hands, HUD]`.
   - Four meters that work the same way `[game: Ember]`.
   - A pause that, by the code path, does not stop the mobs `[arch A1]`, confirmed by the refuter.
   - A dragon that three Aspect kits cannot hurt `[arch A2]`, confirmed.
   - Keyboard hints on the iPad title screen `[pub: hint strip]`, confirmed.
3. Crafty should become one 10-minute experience a skeptical player calls a masterpiece: **the First Night**. You
   fight at eye level with ember hands and a quiet HUD. One ember-gold bar is spent between your verbs. A siege
   marches on a Hearth you lit, and a golden dawn breaks `[up]`.
4. The spine is five things, in build order: the fight, the night, the road of light, the dragon, and the first
   minute `[game: spine]`. iPad parity and the light-and-colour script run under all five. Anything that serves none
   of them is cut before anything is migrated, so the platform work never ports a dead system `[up]`.
5. The work runs in three waves:
   - **Wave 1** unlocks and ships small visible wins: the required check on main, a real pause, the eye-level
     lookbook, and the in-flight light and stance lanes.
   - **Wave 2** cuts the sandbox layer and lays the platform seams.
   - **Wave 3** builds the First Night, the road of light and the first minute.

   Throughout, the harness shrinks to what guards a regression a player could see. The public face is rendered from
   the same eye-level frames that accept the work.

---

## 2. The ranked programme

Ranked by player value, how much other work each item unlocks, and cost.

Verdicts: delete, rewrite, redesign, new, keep. Sizes are the lens estimates. The refuter's stance is quoted, or
"not tested" (the refuter tested only items rated high or transformative, or marked delete).

| # | What | Verdict | Player-visible effect | Size | Depends on | Refuter |
|---|---|---|---|---|---|---|
| 1 | Apply DECISIONS 13(b): one aggregate `ci ok` required check plus a ruleset on main (no bypass, no force push, no deletion). First, fix or quarantine the flaky e2e specs from the required aggregate `[harn: protect main]` | redesign | A red commit can no longer reach crafty-sand.vercel.app (43d766e6 reached Production with a red e2e shard) | M | `fix/ci-required-check`; flake fixes (G-ledger 27-28) | WEAKENED: 43d766e6 was a timing flake, and with no bypass a flaky e2e freezes landing |
| 2 | Real pause through the existing world-clock scale: `paused` joins the hitstop scale in `tickWorldClock`, and the gameplay `setInterval` ticks skip while the scale is 0 `[up W0.3]` `[arch A1]` | new | ESC stops mobs, windups, attacks, burns, spawns and quest polls; hitstop also holds burn damage | S-M | none | A1 STANDS: code path confirmed, live behaviour UNVERIFIED |
| 3 | Eye-level lookbook as the look acceptance surface. Shots at the player's +1.6 m with hands and HUD on, 3 headings by 4 times of day, plus 4 s real-input walking clips. Add a gate that the production bundle keeps the lookbook seam (G-ledger 31), and a per-pass GPU timer `[vis: eye level, instrument]` | redesign | Indirect but total: every later look decision is made on what the player sees | M | none | STANDS (eye level); PLAUSIBLE (timer) |
| 4 | Retire the capture-mode visual oracle; cancel umbrella 0e and T10 `[harn: retire oracle]` | delete | The light lane ships without a re-baseline; 129 test-only `isCaptureMode()` branches leave shipped code over time | L | #3 seam gate; a DECISIONS entry reversing roadmap :261; the og source replaced, or `menu.png` kept until it is | WEAKENED |
| 5 | Land the light and colour script (in flight). Accept it on eye-level frames and clips; check an OKLab blend on the dusk clip `[vis: colour script]` | keep | A moonlit, readable night and a warm golden hour instead of maroon nights and navy ground | S | #4 | UNVERIFIED (branch not read by the refuter) |
| 6 | Land combat stance as reviewed, without coupling it to encounters `[ref]` | keep | Off-screen windup chevrons, a 3-step string with a finisher; a fight can no longer be outwalked | S | #24 (DECISIONS item 10) | The game lens's coupling proposal is WEAKENED, so no coupling |
| 7 | Gameplay quick deletions: delete the Settings Time row; delete the 3 XP per cast; Settler kills bank 0 Aspect power `[game: Time toggle, XP farms, Settlers]` | delete | No skipping a siege from the pause menu; levels mean fighting; no reward for killing a villager | S | none | STANDS, STANDS; WEAKENED for Settlers, so only the narrow banking fix is adopted |
| 8 | Delete hunger (the meter that kills while its bar is hidden) `[game: creative/hunger]` | delete | No unexplained damage late in a session | S | #2 (shares GameSystems.jsx) | WEAKENED for the creative half; the hunger half is confirmed |
| 9 | Chain lightning queries `mobsQuery` live; later delete the 250 ms ECS-to-store mirror `[arch A17]` | delete | Arcs land where mobs are, never on a mob that already died | S | none | STANDS |
| 10 | Terrain mipmaps on (one constant; an A/B has been on file since 2026-09-22) `[vis: mipmaps]` | rewrite | Distant ground and treelines stop crawling and sparkling | S | #3 for the clips; DECISIONS entry | STANDS |
| 11 | Title hint strip removed on touch now, and on every input mode once the prologue ships `[pub: hint strip]` | delete | The iPad title no longer asks for WASD, Space and Q | S | #24 and stance (both edit MenuSystem.jsx) | STANDS |
| 12 | ONE HUD lane with one owner. It folds in roadmap move 6, `[vis: HUD]`, `[pub: HUD plan]`, `[game: panel sprawl]` and `[arch A18]` (details in Wave 2) | redesign | The world gets about a fifth of the screen back; a readable compass; one dusk warning, in the player's language | L | #24, stance, #9 | STANDS (a merge of overlapping findings) |
| 13 | First-person hands as a viewmodel: own FOV, depth clear, toon material with a value floor, ember gauntlets, no aura sphere, no shadows, emissive core instead of a point light `[vis: hands]` | redesign | Warm, readable hands instead of two black monoliths | M | #6, #5 | STANDS |
| 14 | Bundle headroom: N8AO and GodRays imported only when the tier enables them; LazyMotion with `m`; gameIcons fetched lazily; tailwind-merge dropped `[arch A11]` | rewrite | Faster time to title on iPad; pays the lanes' byte ledger (about 67,600 B of allowances against 63,076 B of headroom) `[up]` | M | GameScene parts after #24 and stance | not tested |
| 15 | Costed lantern: edit the plan before block id 16 ships; the radius rule (no spawns within R) first, the baked light field later `[game: lantern]` | redesign | Every lantern on the map was a decision | S | none (a plan edit) | STANDS |
| 16 | Measure, then delete: GodRays plus the Sun billboard, and N8AO (or swap it for one ink-edge pass), each decided on timer ms and power-ab watts. Delete `outlineWorldEdge` and the 1% film grain now. The motes stay with the colour lane's Task 7 `[vis: GodRays, N8AO, slop]` | delete | A cooler Mac, then sharper pixels as steady-cool's budgets rise | S-M | #3 timer; #24 | WEAKENED: measure first; motes are deliberate and already reshaped. `outlineWorldEdge` STANDS |
| 17 | One media pipeline, `scripts/visual/media.mjs`. A declared shot table on the prod build and a real GPU, stamped with sha and renderer. It feeds the README hero, og card, GitHub social preview, release stills and the Command Record's frames `[pub: capture pipeline]` `[up]` | new | Every shared link shows a real frame of the game | M | #3; shoot after #5 | STANDS |
| 18 | Public text now (details in section 6): README rewrite with controls generated from `keyMap.js`; one pitch source; About and topics; NOTICE plus the OFL texts; PNG apple-touch-icon; honest noscript; a bug form; Discussions and Projects off `[pub]` `[harn: README]` | rewrite | A visitor sees the true controls, including dodge and the four Aspect keys; the iPad home screen gets a real icon | S | none (hero image later, #17) | STANDS (README); the rest not tested or UNVERIFIED |
| 19 | One costed build mode: placing a block spends a mined block. The Mode chip and the creative/survival toggle go. Record it as a reversal of the "builder sandbox" choice (placementEconomy.js:7) `[game: creative]` `[ref]` | redesign | Walls cost something, so holding a siege is a choice | S | #20 | WEAKENED: a documented choice, reversed on the record |
| 20 | Tombstone pass-through: unknown progression keys survive load and save unchanged for one release `[up]` | new | No player loses allocations if a cut is rolled back | S | none | Upside proposal; the refuter asks for a pre-cut save fixture |
| 21 | One Ember meter replaces Ferocity, Kinetic, Soul and Resonance. It keeps build accrual (now honest, because placement costs blocks), capped per day `[game: Ember]` `[ref]` | redesign | One ember-gold bar; choose roar now, or two grabs and a snare | M | #19, #20 | WEAKENED: Resonance's build-verb bridge is kept |
| 22 | Progression becomes talents that change verbs plus loot relics. Delete hand attribute allocation, the free spell-mastery click and the wand/crystal economy `[game: axes]` | redesign | Each level-up is one interesting choice | M | #20; a damage rebalance (solveSpellDamage reads attributes) | WEAKENED: 7 live axes, not 8 (affixes.js is dead code) |
| 23 | A Forge card on Mara replaces the 3x3 grid: weapon upgrade, relic upgrade, lantern, each with its cost shown `[game: crafting grid]` | redesign | No guessing hidden shapes, and no drag-grid on iPad | M | #22 | WEAKENED: the pickaxe is a weapon stat stick (damage 8), and the lantern plan edits the grid |
| 24 | Achievements become 8 skill feats in the Journal; quest text comes from `displayName`; delete the "die 3 times" achievement `[game: feats, Settlers, death]` | rewrite | Achievements teach the verbs; quests name the mobs on screen | S | #12 (Journal) | not tested |
| 25 | The dragon on the one damage path: hurl, squad, zones and burns hit the boss through a small adapter in the dragon lane. The full boss-as-ECS-entity move comes later, on its own merits `[arch A2]` `[ref]` | redesign | Three Aspect kits stop doing nothing in the climax fight | S-M | stance | WEAKENED: shadow-dragon.md:10-12 and :66-69 need no ECS move |
| 26 | Event bus, first steps: generalise mobKillBus; delete the `window.play*` globals (App.jsx:99-108) `[arch A6]` | rewrite | Fewer silent dead features (level-ups were once silent) | L | #2 | STANDS |
| 27 | A per-world seed save field, defaulting to 12345 (additive). Real new worlds once anchors are placed procedurally `[arch A12]` | redesign | "New World" stops always being the same terrain | S now, L later | none | not tested |
| 28 | Rapier off the title's critical path: lazy-load the physics subtree behind the title, after testing whether the warm world behind the title needs physics before Start (canvasPace runs it at 10 fps) `[arch A4]` `[ref]` `[up]` | rewrite | The title paints sooner on iPad over cellular | S spike | #24 and stance (GameScene.jsx) | WEAKENED: this cheap step comes before any rewrite |
| 29 | AGENTS.md at 12 KB or less. It lifts the weaker-model locks to re-openable notes and keeps Kevin's standing directives (models and effort, the commit footer rule) `[harn: AGENTS.md]` `[ref]` | rewrite | Indirect: a successor model will restructure where the game needs it | M | PR #27 and `fix/ci-required-check` land (both edit AGENTS.md) | WEAKENED |
| 30 | A single registry: `memory/registry.jsonl` is the only home for open work, with a `playerVisible` field `[harn: registry]` | redesign | Game defects stop drowning in harness rows | M | none | STANDS |
| 31 | The Command Record generated from repo state, plus `npm run orient`. A hand-written "decisions and asks" section is kept. Delete artifact-currency and the stamp/sync protocol `[harn: Command Record]` `[ref]` | redesign | Kevin reviews the game as frames | M | #30, #17 | WEAKENED |
| 32 | Closed records out of HEAD, reachable through the annotated tag `records/2026-10-28`. Recorded as superseding 13(a)'s in-tree archive, with doc-currency's CANONICAL list edited in the same commit `[harn: records]` `[ref]` | delete | The public repo reads as a game, not about 5 MB of process logs | M | #30 | WEAKENED |
| 33 | Unstarted lane plans become one-page briefs. A size-bounded plan rule supersedes the 2026-06-10 "every milestone" rule by an entry. The first-minute plan is kept `[harn: briefs]` `[pub: first-minute]` | rewrite | Phases 2-3 start sooner, against current code | S | none | WEAKENED: it is Kevin's rule, so it needs an entry |
| 34 | Harness tranche #27: land Tranche A; cut D1, the D3 script, D6/D7, the D9 back-fill, the D12 hand rewrite, C4's GATE-INCIDENTS.md and E2 `[harn: tranche]` | redesign | none | S | #1 | UNVERIFIED |
| 35 | Gate roster from 17 to about 10. Each deletion lands only after its replacement exists and its CI failure history has been read. The mutation-proof trailer stays `[harn: roster]` `[ref]` | redesign | Faster commits and pushes | M | #1, #4, #31, #36, #37 | WEAKENED |
| 36 | StrykerJS: a scoped dry run on `src/game` first, then pruning by a measured criterion `[harn: Stryker]` `[ref]` | new | Indirect: redesigns stop being blocked by string-pinning tests | L | none | PLAUSIBLE defect in the plan; deletion criterion tightened |
| 37 | cli-guard replaced by `import.meta.main`, with engines raised to `>=24.2.0` and a run-by-path test `[harn: cli-guard]` `[ref]` | delete | none | S | none | WEAKENED: engines does not pin it today `[here]` |
| 38 | Retire LOOP-CHARTER and LOOP-KERNEL-PROMPT, editing doc-currency's CANONICAL list in the same commit `[harn: loop]` | delete | none | S | #31 | STANDS |
| 39 | One browser stack: prod-smoke and run-scenarios move to Playwright; puppeteer and stale probes are deleted, along with the 7 test files that import them, in the same commit `[harn: puppeteer]` | delete | none | M | #4 | STANDS |
| 40 | Review effort re-aimed: harness code gets one static pass; xhigh review goes to the seams a player feels `[harn: re-aim]` | redesign | Review attention lands on input, render and combat timing | S | #1 | STANDS |
| 41 | Small platform cleanups: the DEV bridge moves out of App.jsx `[arch A13]`; autosave derives from `PERSISTED_KEYS` `[arch A20]`; knip in production mode `[arch A22]` | rewrite/delete | Prevents a future silent progress loss | S each | after the App.jsx lanes land | PLAUSIBLE (A22); the rest not tested |
| 42 | Ocean shader terms moved before fog, driven by the sun (the moon at night), with foam lit by the key light. Only these terms are un-deferred `[vis: ocean]` | rewrite | No glowing white foam at midnight | S | #5 | not tested |
| 43 | Terrain and far-field metalness 0 now; Lambert or a toon ramp later `[vis: shading]` | rewrite | Ground and creatures sit in one light, with no plastic sheen on dirt | S/M | #5 | not tested |
| 44 | Material grammar M1/M2 pulled forward: authored 32x32 tiles with top, side and bottom roles `[vis: textures]` `[ref]` | rewrite | Bark on trunk sides instead of bullseyes; a turf lip over a dirt wall | M | #5 | WEAKENED: a repackage; tiles are 32x32, not 16x16 |
| 45 | **The First Night** (Wave 3 composition) `[up]` `[game: spine]` | new | A siege you hold at a Hearth you lit, fought as the beast, ending in a golden dawn | L | #6, #12, #15, #21 | A BET; each component is rated in its own row |
| 46 | **The road of light**: relight plus Pike's quest spine, the one piece no plan carries (relight-frontier.md:1255). Dungeons become encounter consumers; biome families join the encounter table. Capstones, reactions and the 14 s beast form stay where roadmap :263/:265 already put them `[game]` `[ref]` | redesign | Lit shrines become power, checkpoints and the quest line | L | #45, #25 | The survey finding is REFUTED except the quest spine; biome families not tested |
| 47 | **The first minute** (the plan is kept, with amendments): the title on the game canvas once its cost is measured; the prologue; the hint strip deleted for all inputs; the tagline as the single pitch source; the og re-shoot owned by media.mjs `[pub: first-minute]` `[vis: title]` | keep | The first image is the game in its best light; one GL context on iPad | L | #5, #17 | STANDS (keep); WEAKENED (title canvas: measure first) |
| 48 | Platform deep `[arch]`: the fixed-step sim A1, the Player split A5, store slices A7, replay A8, source-grep retirement A9, quests as reducers A14, the GameSystems context out A16, one player position A21, i18n events A23, and the domain layout via `git mv` alongside each step A24 | redesign | Pause and hitstop stay consistent; translated toasts; mobs aim at the body, not the camera | XL | #2, #6, #26 | A1/A5/A6/A7/A16 STAND; A8 PLAUSIBLE; A9 WEAKENED; the rest not tested |
| 49 | Instanced mobs and VFX pools `[arch A10]` | redesign | Nights with 40 or more mobs stay smooth on iPad | L | #25, #26 | not tested; A3's "needed for Phase 3" is REFUTED |
| 50 | Look polish: a LUT after tone mapping; the iPad low tier on baked sky exposure instead of realtime shadows; hotbar block icons; the sky dome drawn after the opaques `[vis]` | rewrite | Controlled colour, steady iPad shading, a hotbar that shows blocks | M each | #5, #44, #3 | not tested |
| 51 | The Rapier retirement BET (full A4) plus a main-thread VoxelWorld (A12) `[arch A4, A12]` | redesign | Up to about 830 KB gzip less boot download (lens-reported, not re-measured) | XL | #48 (A8 replay), #27 | WEAKENED |
| 52 | A text-voxel model format, as a spike only `[vis: text voxels]` | new | none until adopted | M | #44 | WEAKENED: the mesher is chunk-shaped; the dragon plan uses about 40 instanced boxes |
| 53 | A persistent chase camera, as a flagged experiment after the 14 s beast hold ships `[vis: chase cam]` | redesign | Possibly: see your ember-lit character and threats around you | L | #45 | WEAKENED: beyond Kevin's recorded 2026-06-07 scope |
| 54 | The comment pass (15c) plus a lint rule banning milestone tags and "used to" `[arch A15]` `[harn: comments]` | delete | none | M | #35, #39, #48 | STANDS (a repackage of 15c) |
| 55 | GitHub Releases as the devlog `[pub: releases]` | new | A dated, illustrated history of the game | M | #1, #17 | not tested |
| 56 | Flatten `frontend/` to the repo root, in one window with the Vercel root-directory change `[pub: flatten]` | redesign | none | L | all lanes landed; Kevin's Vercel dashboard | not tested |
| 57 | Doc hygiene `[harn]` `[pub]`: declutter the root; generated ARCHITECTURE and CHANGELOG; ACTIVE_PLAN as a cursor; short DECISIONS entries; gates-and-probes as a checklist; the opsec ledger set to 0 | rewrite | none | S each | #32 | STANDS (declutter, low); the rest not tested |
| 58 | A readable `*.vercel.app` alias; crafty-sand stays permanent `[pub: alias]` | new | A link people can remember | S | Kevin's dashboard; availability UNVERIFIED | not tested |

**Dropped as REFUTED** (kept here for traceability):
- **A3's claim** that Phase 3 depends on the ECS/sim rewrite, and its hold on Phase 3 builds.
  - The shadow-dragon plan reaches the dragon through a duck-typed record (shadow-dragon.md:10-12, :66-69).
  - Feedback-grammar merges meshes per mob (feedback-grammar.md:80-81) `[ref]`.
  - So the platform runs beside the game lanes, not in front of them. This also weakens the upside's "W2 before W3"
    sequencing.
- **The game lens's "best findings no plan carries"**: the third-person beast form, capstones and the reaction
  table are in roadmap-2026-10-27.json:263/:265, and dungeon chests are at :256. Only the quest spine survives, as
  row 46 `[ref]`.
- **Deleting the mutation-proof-trailer gate**: DECISIONS 15(c) names `Mutation-Proof:` trailers as the home for
  receipts `[ref]`.
- **"import.meta.main is pinned by the engines field"**: false. Row 37 survives only with the engines bump `[ref]`
  `[here]`.
- **Coupling combat stance to encounter groups**: the stance's chevrons and string pay off without groups, and pack
  aggro already spreads within 12 m (combat-stance.md:6-7, :76) `[ref]`.

---

## 3. Waves

**Live check.** "Live" means the landing sha shows as Production in
`gh api repos/wowlegend/Crafty/deployments`, and the check runs against https://crafty-sand.vercel.app:
- Chromium on ANGLE Metal on the M3 Max, through the production lookbook seam `[vis]`.
- WebKit at 1180x820 and 820x1180 for iPad layout. WebKit is not iPad hardware; real-device feel stays Kevin-gated
  (AGENTS.md).
- Where a check needs DEV test hooks, it also runs as an e2e on the CI sha, and the live check is the visible
  behaviour.

**Machine load.** Before any real-GPU capture, run `uptime`. The lenses measured load averages of 126-222 on 14
cores, which makes frames uneven `[vis]` `[pub]`.

### Wave 1: start now, in parallel lanes with disjoint files

The files the in-flight lanes own are off limits to Wave 1 `[here]`:
- **#24, stance and light-colour:** App, Components, GameScene, HUD, InputManager, MenuSystem, i18n/strings,
  store/useGameStore, systems/AIWorkerSystem, workers/ai.worker, world/{Terrain, FarField, survivalSystem}, most of
  render/, and ui/{hudTicker, panelState, AbilityBar, WindupChevrons}.
- **e2e speed:** GameScene and TitleDiorama.
- **The CI-check branch and PR #27:** AGENTS.md, ci.yml and ci/*.

| Lane | Items | Files it owns | Acceptance on the live game |
|---|---|---|---|
| **W1-A Required check** | #1 | `.github/workflows/ci.yml`, `ci/pipeline.sh` (the existing `fix/ci-required-check` branch); flaky specs under `frontend/tests/e2e/` (fold in `fix/touch-hold-freeze`, `fix/lightning-ci-budget`, `fix/e2e-hardening-2026-10-27`); the ruleset via `gh api` | **Precondition:** the last 10 `ci ok` runs on main contain no flake failure, or the flaky specs are quarantined out of the aggregate. **Then:** `gh api repos/wowlegend/Crafty/branches/main/protection` shows `ci ok` required, admins enforced and force push off; a deliberately red `land/` probe branch is refused a fast-forward of main; the next Production deployment's sha has `ci ok` = success. |
| **W1-B Real pause** | #2, the hunger interval part of #8 | `game/worldClock.js`, `game/hitstop.js`, `GameSystems.jsx` (mana routed, hunger interval deleted), `game/burnManager.js`, `world/bossSystem.js`, `systems/SpawnerSystem.jsx`, `QuestSystem.jsx` polls, `game/useDayNightClock.js`; new `tests/e2e/pause-freezes-world.spec.js` | **First,** run the new spec on main to prove the defect: HP falls during pause. **Then, on the CI sha and live by hand:** paused beside an aggro mob for 5 s, HP and the mob's position stay unchanged; on resume the mob moves again. **On touch,** the pause path sets the same flag (WebKit iPad viewport). **Hunger** shows no starvation damage in a session over 83 minutes, by inference from the deleted interval. AIWorkerSystem needs no edit, because it already reads `worldDelta` `[up]`. |
| **W1-C Gameplay deletions** | #7, the chain-lightning half of #9 | `ui/GamePanels.jsx` (Time row :776-787), `EnhancedMagicSystem.jsx` (:247-249 cast XP; :81-93 targets from `mobsQuery`), `game/mobTypes.js` or `world/accrualHooks.js` (Settler banking) | **Live:** Settings has no Time row. Casting 10 spells at the sky leaves the XP bar where it was. Killing a deliberately targeted Settler by day leaves the Aspect bars unchanged. **e2e on the CI sha:** chain-lightning arc endpoints sit within 0.3 m of the targets' current ECS positions, and none target a mob that died that frame. |
| **W1-D Instruments** | #3 | `scripts/visual/_lookbook.mjs`, `scripts/visual/lookbook.mjs`, `src/render/lookbookSeam.js`, a new `src/render/passTimer.js` (EXT_disjoint_timer_query_webgl2, Chromium only), a new gate that the prod bundle installs the seam | **The lookbook against the production URL** writes the eye-level set (+1.6 m, hands and HUD on, three headings, four times of day), four 4 s walking clips, and ms per pass for each shot. **The seam gate is proven killable:** removing the install from a built bundle makes it red, recorded in a `Mutation-Proof:` trailer. **Amended 2026-10-28, after the lane's review:** the eye-level set uses the game's own eye, about 2.15 m above the ground (the camera sits 1.2 m above the body's centre, which rests 0.95 m up: `Components.jsx`), not +1.6 m; the gap is W2-E's to decide, and the instrument does not fake it. The set was shot on a local production build. **Owed after merge and deploy:** the same run against `https://crafty-sand.vercel.app/?lookbook=1`, which W1-E's before and after clips need; `lookbook.mjs` serves a local build today and needs a `--url` mode for it. The per-pass GPU numbers of that first run are not usable (`masterpiece-2026-10/evidence/eye-level/index.md`); W2-I re-measures on an idle machine, where the probe flags any window whose results sum to more than it lasted. |
| **W1-E Mipmaps** | #10 | `world/proceduralTextures.js:19`, `tests/world/proceduralTextures.test.js:73-77`; a DECISIONS entry superseding the "no mipmaps" lock | **Live:** an eye-level walking clip before and after on the deployed sha shows no leaf or stone sparkle at mid distance. Lands after W1-D. |
| **W1-F Public text** | #18 | `README.md`, `NOTICE`, `LICENSES/OFL-*.txt`, `frontend/public/{apple-touch-icon.png, icon-192.png, icon-512.png, manifest.webmanifest}`, `frontend/index.html` (noscript; head tags from one brand source), a new `frontend/scripts/ci/controls-table.mjs` with a doc-currency marker check, a new `frontend/scripts/ci/public-face.mjs`, `.github/ISSUE_TEMPLATE/bug.yml` | **The GitHub repo page** renders the README with a generated controls table including Shift, hold-heavy and R/V/X/Z. **`gh api repos/wowlegend/Crafty`** shows the new About, the 13 topics and `has_discussions: false`. **The apple-touch-icon** on the live site resolves to a 180x180 PNG. **Live** `view-source` shows the new noscript copy. |
| **W1-G Bundle, UI only** | part of #14 | `ui/primitives/{Panel,Button,Toast,cn}.js(x)` (drop tailwind-merge), `ui/primitives/gameIcons.js` (lazy sprite) | `node scripts/ci/bundle-budget.mjs` shows the index chunk shrinking. **Live:** title time-to-interactive on the WebKit iPad viewport before and after, from the lookbook report; every icon still draws (the eye-level HUD frames). |
| **W1-H Plans and decisions** | paper for #4, #10, #15, #19, #22, #23, #33, the HUD lane brief, the quest spine; registry harvest (#30) | `docs/superpowers/**`, `memory/registry.jsonl` | **No live effect.** Proven by doc-currency green, and by a diff of harvested ids against the five open-work sources (STATUS §2, the G-ledger, ACTIVE_PLAN tasks, sota-2026-09 QUEUE/OPEN-ITEMS, the masterpiece phase tables) showing nothing dropped. |

**DECISIONS entries W1-H writes.** Each is a new dated entry naming what it supersedes:
- Capture oracle retired (supersedes roadmap :261's "baselines remain a regression oracle").
- Mipmaps on (supersedes the taste lock, KEVIN-REVIEW-BATCH.md:1758-1785).
- One costed build mode (supersedes placementEconomy.js:7's builder sandbox).
- Ember keeps build accrual.
- Progression to talents and relics.
- The Forge replaces the grid.
- Lane briefs plus task scripts of 300 lines or less (supersedes AGENTS.md:240, Kevin 2026-06-10).
- The umbrella amended: a Cut wave, the platform in parallel, one HUD lane, and 0e/T10 cancelled.
- The lantern costed, with the radius rule first.

### Wave 2: after #24, stance, light and colour, and W1-A land

| Lane | Items | Acceptance on the live game |
|---|---|---|
| **W2-A Shared-file quick fixes** | #11 (hint strip off when `isTouchDevice()`); the `outlineWorldEdge` and Noise deletions of #16 (quality.js; GameScene.jsx:132); #43 metalness 0 (Terrain.jsx:49-56, FarField.jsx); #42 ocean terms (Ocean.jsx:100-107) | **WebKit at 820x1180 on the live title** shows no "WASD", "Space" or "Q Claim"; Chromium desktop still shows them. A jsdom gate renders desktop first (finds WASD), then touch (finds none). **Eye-level live frames at 0.75 (midnight)** show no white foam glow. **At 0.30** dirt shows no specular sheen. |
| **W2-B Retire the capture oracle** | #4 | **Delete** `scripts/visual/capture.mjs`, `test:visual`, the density ratchet and ledger, `scripts/ci/baseline-trailer.mjs`, visual-denominator-gates and the baselines. **Keep** `tests/visual/baseline/menu.png` until W2-H replaces the og source (make-og-image.mjs:34, social-preview.test.js:6) `[ref]`. **Drop** the light lane's capture-state work. **e2e specs** that assert capture behaviour lose those assertions in the same commit. **Live:** nothing changes; that is the point. **Every later look PR** attaches lookbook before/after frames. |
| **W2-C Ruleset follow-ups** | parts of #1 and #35 | **Delete** `scripts/ci/e2e-freshness.mjs` and the tier-1b receipt logic in `.githooks/pre-push`; **close** PR #28; **remove** the CI artifact-currency step and the duplicate `docs` job (ci.yml:179-189); **then** land PR #27's B7, a fast commit tier. **Proof:** a push to main without a local e2e receipt is accepted, and main still deploys only green shas (`gh run list` against the deployments). |
| **W2-D The HUD lane** (one owner) | #12, #24 | **At rest:** delete the desktop rail (GameHud.jsx:94-101; touch keeps it); fold the Level card (SimpleExperienceSystem.jsx:165) into a 4 px XP bar on the hotbar edge; collapse the quest tracker to one objective line. **Compass:** rewrite the innerHTML compass (HUD.jsx:322-491) as a component with de-overlap, i18n keys and icons. **Notifications:** one deduplicated channel through `t()`. **Re-key:** chrome from navy to warm charcoal. **Panels:** E, M, C, B, Q, H and Tab become Character (Tab), Journal (J, quests auto-claimed, plus feats) and Build. **Touch tray:** Character, Journal, Build. **Acceptance:** chrome is 8% of pixels or less at rest on the live eye-level frames (token-colour count, as the visuals lens measured it), on Chromium and both WebKit iPad viewports; a frame with HOME and NPC markers close together shows no overlapping labels; at dusk the warning appears exactly once, and in Chinese on zh-CN. |
| **W2-E Hands viewmodel** | #13 | **Live eye-level frames at 0.30, 0.48, 0.75 and midnight** show ember gauntlets with a value floor. Mean luminance of the hand pixels sits above a declared floor at midnight. No hand mesh clips a wall at point blank. |
| **W2-F The Cut** (one small PR each, in this order) | #20, #19, #21, #22, #23, the rest of #8, #24 quest text | **Order:** tombstone pass-through first, then one costed mode, Ember, progression, Forge, then the hunger store field, HUD bar and food items, then quest text from `displayName` with a `kills_by_type` key map. **Every PR** carries one real-input e2e: the surface is gone, and the game boots, fights and saves. **A pre-cut save fixture** loads with no NaN damage. **Live,** after the series: a fresh profile shows no Mode chip, one ember bar, no C key or grid, and a Talents page of one screen; placing a block reduces the stack count; the old save fixture loaded on the live site keeps its level. |
| **W2-G Platform first steps** | #25, #26, #27, #41, the rest of #9 (delete MinimapSyncSystem's mirror; the G-key villager talk queries the ECS) | **Live:** hurl, squad, element zones and burns lower the dragon's HP bar, observed in one recorded live fight clip. The level-up sound plays (event bus). `new World` writes a `seed` field, and old saves load at 12345. **CI:** production knip runs beside the existing knip. |
| **W2-H Media pipeline** | #17 | `scripts/visual/media.mjs` writes `docs/media/{social-preview.jpg, hero.jpg, stills, media.json}` and `frontend/public/og-image.png` from the prod build, then replaces make-og-image's baseline crop. **Live:** a share-card debugger on the site URL shows the new og frame. First shoot after light and colour lands, on an idle machine. |
| **W2-I Measure, then decide passes** | the rest of #16, the GameScene half of #14, #28 | **Measure** each pass's ms with W1-D's timer, plus a `power-ab.sh` pair. **GodRays and N8AO** are deleted, or N8AO is replaced with an ink-edge pass, on those numbers. **Each remaining pass** is imported only when its tier enables it. **Rapier** gets the lazy-behind-title spike. **Live:** watts drop on the M3 Max. Steady-cool's pixel budgets rise toward dpr 2 at the same watts. The `rapier-*.js` modulepreload is gone from the live `index.html`, and the title is interactive sooner on WebKit iPad. |
| **W2-J Docs and harness** | #29, #31, #32, #34, #35, #36, #37, #38, #39, #40, #57 | **Proof:** a cold Sonnet 5.5 agent with only the repo answers 10 orientation questions in 15 tool calls or fewer, scored against `orient` output. One planted stale doc must make it fail (PASS-but-wrong control) `[harn: gardening]`. **No live game effect.** |
| **W2-K Material grammar, forward** | #44 | **Live eye-level frames:** trunk sides show bark, not rings; grass hills show a turf lip over a dirt wall. |
| **W2-L LazyMotion conversion** | the rest of #14 | `motion.div` becomes `m.div` with `domAnimation`. The index chunk falls by the framer-motion share (about 124 KB minified, lens-reported). **Live:** panel transitions still animate (one clip). |

### Wave 3: the game, then the deep platform

| Lane | Items | Acceptance on the live game |
|---|---|---|
| **W3-A The First Night** | #45: the encounter table's day groups and siege waves; a siege director marching from a visible bearing on the lit Hearth; the costed lantern radius rule; the Ember spend; out-of-combat health regeneration keyed on the stance's calm state; respawn at the nearest lit light; per-archetype windup voices; the beast form held in third person for its full 14 s (roadmap :265) | **A scripted fresh-profile play-through on the production build:** prologue beat, first dusk horn, siege held, dawn. Its eye-level clip is opened beside today's frames. **Live, by hand,** on Chromium and the WebKit iPad viewport, using the touch-hold roar and heavy. **Health** visibly refills after 4 s calm. **No hostile** spawns inside a placed lantern's radius. |
| **W3-B Road of light and the dragon** | #46, #25 (completed in the dragon lane), shadow-dragon's tells and perfect-dodge stagger | **Live play-through:** relight a shrine on Pike's quest line; the Ember cap rises; death respawns at that shrine; a dungeon holds a guardian group and an altar chest; the dragon telegraphs its bite, and a perfect dodge staggers it. |
| **W3-C The first minute** | #47; delete the hint strip on every input; the tagline becomes the pitch source for the README, About, manifest and index.html | **Unit 0 measures** two canvases against one on the WebKit iPad viewport (memory and frame time) and picks. **Live:** the title shows the real Hearth at golden hour; on iPad, `canvas` count is 1 if one context won; the first click after Start lands in the game, not on an overlay (G-ledger 40). |
| **W3-D Platform deep** | #48, #49 | **Headless seeded replays** in node prove: a mob reached the player, the boss took damage, beast form was entered. **Each source-grep gate** is deleted in the commit that moves its subject. **Live:** pause and hitstop hold every system; a 40-mob night holds its frame time on the WebKit iPad viewport. |
| **W3-E Look polish** | #50, #52, #53 | **A LUT** samples known colours in a test. **Live eye-level frames:** no neon greens at 0.48; on the iPad low tier, no shadow stair-steps; the hotbar shows block icons. **The chase-camera flag** is kept or dropped on eye-level against chase lookbook frames plus one combat-feel session. |
| **W3-F Rapier retirement BET** | #51 | **DDA raycasts, then debris, then a flagged swept-AABB controller** that must win a replay A/B before `@react-three/rapier` is deleted. A DECISIONS entry supersedes "Engine CORE ... KEEP". **Live:** boot gzip falls (measured); movement clips side by side show no change in feel. |
| **W3-G Public face and doc finish** | #17 (hero and social preview), #55, #54, #56, #58 | **The README hero** is the First Night clip. **`usesCustomOpenGraphImage`** reads true. The first release is cut. The comment pass and lint rule land. The flatten happens only in one window with the Vercel root change. |

### One-way doors and when each closes `[up]`

1. **Save fields the Cut stops writing** (saveSchema.js:34, 38, 46-49, 52). The door closes at the first push that
   stops writing them. It is held open by the tombstone pass-through (#20) for one release.
2. **Lantern block id 16.** Closes at the push that lets a player save one. The radius rule ships first.
3. **A public licence grant.** It cannot be withdrawn from forks, so it is not taken. The code stays all rights
   reserved; NOTICE and the OFL texts cost nothing.
4. **A URL schema for postcard links.** Put the seed and the world version into v1. The seed field itself is
   additive.
5. **The Vercel root-directory flip** during a flatten. It must happen in the same window as the move, or the next
   push breaks the live deploy.

### What needs Kevin

The plan asks Kevin for at most two things:
- **The Vercel root-directory setting,** and only if the flatten (#56) is taken.
- **A readable alias** (#58), dashboard or token.

The GitHub social-preview upload is a Settings UI step. The session does it through browser automation if GitHub is
signed in there; otherwise it costs Kevin one click. Everything else runs under item 14.

---

## 4. Deletions, and what replaces each

### Game and UI

| Delete | Replaced by |
|---|---|
| Settings Time row, `ui/GamePanels.jsx:776-787` `[game]` | Nothing for players; `setTimeOfDay` stays as a dev seam |
| 3 XP per cast, `EnhancedMagicSystem.jsx:247-249` `[game]` | XP from kills, encounters, siege dawns, shrines and quests only |
| The three free-placement quests (QuestSystem.jsx:29, 39, 49) `[game]` | Combat and relight beats in the quest spine |
| The hunger interval (`GameSystems.jsx:103-111`), starvation (`useGameStore.jsx:990-997`), the hunger bar (`HUD.jsx:564`), raw and cooked meat `[game]` | Out-of-combat health regeneration (W3-A) |
| Creative/survival toggle (`GamePanels.jsx:765-772`), Mode chip (`GameHud.jsx:80-83`), `gameMode` `[game]` | One costed mode; Free Build may return later as a world type |
| Ferocity, Kinetic, Soul and Resonance as separate fields and HUD bars (`HUD.jsx:126-168`) `[game]` | `ember`, one bar |
| Hand attribute allocation (useGameStore.jsx:287-293, 409-416); SpellUpgradePanel's mastery section and its free `upgradeSpell` click (spellUpgrades.js:91-121); `game/crystalWallet.js` and the wand discount `[game]` | Level grants one talent point; talents change verbs; loot relics; spells scale with level |
| `game/affixes.js` (no importer) `[arch A22]` `[ref]` | Relics, when loot integration is real |
| `ui/panels/CraftingTable.jsx`, `data/recipes.js`, the C key, the touch-tray Craft slot, the pickaxe item `[game]` | Mara's Forge card on G |
| The M, C, B, Q, H panels and the Achievements panel `[game]` | Character (Tab), Journal (J), Build |
| 12 counter ACHIEVEMENTS, including "Survivor" (QuestSystem.jsx:85-98) `[game]` | 8 skill feats |
| Settler day-kill banking (mobTypes.js:12, `bank: 8`) `[ref]` | Bank 0; the NEUTRAL killable tier stays (targeting.js:16-23) |
| Desktop tool rail (GameHud.jsx:94-101) `[vis]` | Keys plus the Esc menu; touch keeps the rail |
| Level card under the crosshair (SimpleExperienceSystem.jsx:165) `[vis]` | A 4 px XP bar on the hotbar edge |
| innerHTML compass (HUD.jsx:322-491) `[arch A18]` | A Compass component with de-overlap and i18n |
| Title keyboard hint strip (MenuSystem.jsx:314-342): on touch now, on every input with the prologue `[pub]` | The prologue; H opens a controls panel generated from keyMap.js |

### Render

| Delete | Replaced by |
|---|---|
| `outlineWorldEdge` tier flag (quality.js:16, 20, 21, 32) `[vis]` `[ref]` | Nothing; it has no consumer |
| Film grain at 0.01 (GameScene.jsx:132) `[vis]` | Nothing |
| GodRays, `render/Sun.jsx`, `godRaySamples`, the `sunAboveHorizon` subscription (if the timer numbers say so) `[vis]` | The sky dome's sun disc and the colour script's sun-glow fog |
| N8AO, GameScene.jsx:94-103 (if the timer numbers say so) `[vis]` | Baked vertex AO, plus optionally one ink-edge pass |
| The aura sphere, the hand point light and 15 `castShadow` sites in playerRender.jsx `[vis]` | A viewmodel layer with an emissive core |
| TitleDiorama's own Canvas, `render/TitleDiorama.jsx:145` (if Unit 0's measurement favours it) `[vis]` `[arch A19]` | The title as a camera state of the game canvas |

### Architecture

| Delete | Replaced by |
|---|---|
| The 250 ms mob mirror: `mobEntities`, `npcEntities`, `setMobEntities`, `_lastMinimapUpdate` (MinimapSyncSystem.jsx:13-33) `[arch A17]` | `mobsQuery`; the minimap reads the ECS on the HUD ticker |
| `window.playLevelUpSound`, `playFanfare`, `playVictory`, `playCraft` (App.jsx:99-108) `[arch A6]` | SoundCue events |
| The DEV test bridge inside App.jsx (:306-920) `[arch A13]` | `devtest/installBridge.js`, loaded by a DEV-only dynamic import |
| The autosave hand list (App.jsx:247-290) and its policing gate `[arch A20]` | `PERSISTED_KEYS` from saveSchema |
| The GameSystems context, `useGameSystems` defaults and `selectHudState` (Wave 3) `[arch A16]` | Narrow store selectors |
| The DEV `captureSeed` branch (AIWorkerSystem.jsx:229-240) `[arch A8]` `[arch A15]` | Seeded sim replay |
| The unused `setActive` import (InputManager.jsx:4-8) and the gate that forces it (input-abstraction-gates.test.js:75-86) `[arch A9]` | Nothing |
| The store's `selectedBuildBlock` and `isWebGLContextLost` (no reader) `[arch A22]` | Nothing |
| `@react-three/rapier` and `@dimforge/*` (Wave 3, only after the flagged controller wins) `[arch A4]` | DDA raycasts and a swept-AABB voxel controller |

### Harness

| Delete | Replaced by |
|---|---|
| `scripts/ci/e2e-freshness.mjs` (408 LOC), pre-push tier 1b, PR #28 `[harn]` | The `ci ok` required check |
| The capture oracle: `scripts/visual/capture.mjs`, `test:visual`, the density ratchet and ledger, `scripts/ci/baseline-trailer.mjs`, visual-denominator-gates, `tests/visual/baseline/*.png` (`menu.png` last) `[harn]` | The eye-level lookbook, plus `toHaveScreenshot` for DOM-only checks |
| `scripts/ci/artifact-currency.mjs` (562 LOC), `.artifact-sync.json`, the `--stamp`/`--sync` protocol `[harn]` | `scripts/report/record.mjs` |
| `scripts/ci/queue-ledger.mjs` `[harn]` | A registry schema check in doc-currency |
| `scripts/ci/killability-ledger.mjs` (already decided, 15c) | `Mutation-Proof:` trailers, which stay |
| `scripts/ci/cli-guard.mjs` (132 LOC) `[harn]` | `if (import.meta.main) main();`, engines `>=24.2.0` and a run-by-path test |
| `scripts/ci/gate-shape.mjs` (only after Stryker is proven on this suite) `[harn]` | Stryker incremental reports |
| `scripts/ci/doc-anchors.mjs`, `scripts/ci/read-order.mjs` `[harn]` | `npm run orient` |
| The duplicate CI `docs` job (ci.yml:179-189) `[harn]` | The pipeline's own doc-currency step |
| puppeteer and the stale `scripts/visual/*-probe.mjs` (25 files; 21 last touched in August); keep the touch probe `[harn]` | Playwright, the lookbook and e2e |

### Docs and the repo root

| Delete | Replaced by |
|---|---|
| `LOOP-CHARTER.md`, `LOOP-KERNEL-PROMPT.md` `[harn]` | About 15 lines of §4 self-gating moved into AGENTS.md |
| Closed records from HEAD: `docs/archive/**`, dated audits and reviews, HOLISTIC-REVIEW, KEVIN-REVIEW-BATCH, era-review, sota-audit, sota-2026-09/*, memory/*AUDIT*, shipped plans and specs (coherence-pillars kept as the one taste spec) `[harn]` | The annotated tag `records/2026-10-28`; INDEX keeps one `git show` line. Before deleting, move any evidence a kept doc cites (for example `sota-2026-09/evidence/mipmaps-ab-explore-far.png`) `[ref]` |
| `SOTA-KICKOFF-PROMPT.md` `[pub]` | Git history |
| The README's emoji, badge wall, mermaid diagram, memory-architecture section and correction history `[pub]` | The section 6 structure |
| The `index.html:44` noscript boilerplate `[pub]` | Copy that names the game and says it needs JavaScript and WebGL |
| make-og-image's baseline crop path `[pub]` | media.mjs |
| GitHub Discussions (one template post) and Projects (empty) `[pub]` | A bug form asking for the Diagnostics readout |

---

## 5. Docs and harness target state

**Instruction and state surfaces** `[harn]`:

| Surface | Role |
|---|---|
| `.agent/AGENTS.md` | 12 KB or less. Layout, commands, bright lines, invariants each naming its enforcer, where state lives, and the generated gate table. It keeps Kevin's standing directives: Crafty reviewers at xhigh, never max; Sonnet and Haiku used liberally; no AI footer; no amend or force push `[ref]`. The old locks are recast in ARCHITECTURE as "current state, why, re-openable under item 14". |
| `npm run orient` | Generated state: HEAD, the CI verdict, the live Production sha, open PRs with their CI, worktrees with unmerged commits, the cursor, and registry counts. It replaces the generated read order and the post-compaction ritual. |
| `memory/ACTIVE_PLAN.md` | A cursor of 60 lines or fewer. The command session's live task table (the estate Verify Gate reads it) and the next step. Lane task tables live in their PRs. |
| `memory/registry.jsonl` | The only home for open work: `{id, title, playerVisible, severity, owner, state, evidence, opened, closedBy}`. STATUS §1 stays short, with a generated registry view. |
| `docs/superpowers/DECISIONS.md` | Short entries (5 lines or fewer) plus a generated "binding now" index. |
| The Command Record | Generated from merges, their "Player-visible:" lines, CI, the deployed sha, DECISIONS headings, registry rows and lookbook frames. It keeps a hand-written decisions-and-asks section, because Kevin's request is "one html to review achievements/decisions" `[ref]`. It is republished at each landing, and stays the one page for Kevin (13a). |
| `memory/CHANGELOG.md` | One generated line per first-parent merge. The 573 KB history goes to the records tag. |
| `docs/ARCHITECTURE.md` | 150 lines or fewer: a module map generated from imports, plus hand-written invariants. It supersedes `memory/ARCHITECTURE.md`. |
| Plans | The umbrella plus active lane plans; unstarted lanes as briefs of one page or less. A task script of 300 lines or less is written at lane start. |
| `.claude/rules/` | gates-and-probes cut to a checklist of about 60 lines; voxel-mesher and input-and-pointer-lock kept. |

**Five gardening rules** `[harn: gardening]`, each enforced by doc-currency or by deletion:
1. A number in prose is either generated or absent.
2. One home per fact.
3. No history in instruction surfaces.
4. One size-budget table: AGENTS.md 12 KB, each rule 6 KB, STATUS 30 KB, ACTIVE_PLAN 8 KB, a brief 8 KB.
5. Closed means removed from HEAD at the next landing.

**Gates, at about 10** `[harn: roster]` `[ref]`:
- **Kept:** opsec-scan (ledger at 0), eslint, the behavioural unit suite, build, bundle-budget, knip plus production knip,
  npm audit, prod-smoke (Playwright), e2e as the required aggregate `ci ok`, doc-currency (narrowed to dangling paths,
  generated blocks, the size table and the registry schema), and the mutation-proof trailer.
- **Local hooks:** pre-commit runs opsec, eslint on staged files and `vitest related`; pre-push runs opsec.
- **Before each deletion:** the gate's failure history is read with `gh run list`.

**Review policy** `[harn: re-aim]`:
- Harness code gets at most one static pass. LOWs are fixed or dropped, never ledgered.
- xhigh review goes to input, render and combat timing, and to reading lookbook frames side by side.
- New lanes carry 1-3 lived e2e proofs and unit tests for pure logic, and add no new source-grep gates.

**The acceptance test for the doc set** is the cold-takeover eval in W2-J, run after the prune and then quarterly,
with rotating questions.

---

## 6. Public face plan

**GitHub Pages: none.**
- Keep DECISIONS 15(a) `[pub: no Pages]`. Kevin said "keep" about a site that does not exist. The refuter notes
  item 15 is already committed (c2bda904) `[here]`. The live game is the showcase, and GitHub Releases carry the
  devlog.
- If a showcase with sound or video ever earns its place, it is one generated static page under
  `frontend/public/`, written by media.mjs and served by the same Vercel deploy, so no second host is needed.

**README** (W1-F text now; hero after W2-H) `[pub: README]` `[harn: README]`:
- A hero frame from media.mjs, linked to the live game. Until then no image; never the capture-mode frame.
- `# Crafty`, the single pitch, and "Play in your browser: desktop and iPad, nothing to install."
- A 2x2 grid of captioned real stills (Wave 3), each caption stating sha and renderer.
- How to play: a block generated from `KEY_MAP` with Desktop and Touch columns, checked by doc-currency.
- How it's built: 10 lines or fewer, naming the stack once, the two workers by path and miniplex. A link to
  `docs/ENGINEERING.md` carries the harness story.
- Run locally: Node 24 (per engines), `cd frontend`, `npm ci`, `npm run dev`.
- Credits and licence, mirroring NOTICE, plus one line saying the code is all rights reserved.
- **Deleted:** 20 emoji; the H1 "Next-Gen 3D Browser Voxel Engine"; "high-craft", "100% vibration-free",
  "imperceptible"; "120Hz" (misleading next to the 60 cap; the refuter notes `frameCap 0` means unlimited);
  "Components.jsx:994" (now :1094); "3-way-sharded" (CI runs 8 shards); the 5 dependency badges; the mermaid diagram;
  the memory section; correction history.
- **Badge:** one CI badge, only once `ci ok` is required.

**About line and topics** (W1-F, applied idempotently by `scripts/ci/public-face.mjs`; `--check` reports drift and
refuses nothing) `[pub: pitch source]`:
- **About:** "A voxel action-RPG that runs in the browser, on desktop and iPad. Four Aspects, one frontier, a dragon at
  the edge of the world." Homepage: crafty-sand.vercel.app. The current "31-frame visual-regression gate" claim goes.
- **Topics:** browser-game, action-rpg, rpg-game, voxel, voxel-game, procedural-generation, threejs,
  react-three-fiber, webgl, webgl-game, rapier-physics, game-development, ipad.
- **Dropped topics:** 3d-engine, voxel-engine, framer-motion, zustand, vite, react19, miniplex, ecs,
  visual-regression-testing, minecraft-clone.
- **One brand source** (the `title.tagline` key plus a small brand module) drives the title, og and twitter tags, the
  manifest description, the README pitch and the About. It replaces the seven divergent pitches and the
  per-session G3 ritual.
- Do not promise "light is what you fight for" until the shrines ship.

**Social preview and og card** `[pub: capture pipeline]`:
- media.mjs produces:
  - `social-preview.jpg`: 1280x640, under 1 MB, a real-GPU blue-hour frame of the Hearth with lanterns.
  - `frontend/public/og-image.png`: 1200x630, composed in a tiny card page with the game's own Lilita One wordmark in
    gold #C9A86A on ink #0C1322. No buttons and no controls text.
- The GitHub upload is the one UI step. It is verified by reading back `usesCustomOpenGraphImage: true`.
- Shoot only after the light lane lands, on an idle machine, and never publish a shot the lookbook marks invalid.

**iPad install** `[pub: icon]`:
- An `apple-touch-icon.png` at 180x180, plus manifest PNGs at 192, 512 and a maskable 512 rendered from favicon.svg
  with `magick`.
- Manifest orientation becomes `any`.
- Extend `tests/scripts/social-preview.test.js` to check that the href is a PNG that exists.

**Licence and credits** `[pub: NOTICE]`:
- A root `NOTICE` and `LICENSES/OFL-<font>.txt` for Lilita One, Space Grotesk and Smiley Sans.
- The music source joins the Credits screen. Read the ElevenLabs plan terms first (UNVERIFIED).

**Community** `[pub]`: Discussions and Projects off; labels pruned to bug, ipad, looks, perf and dependencies; a bug
form asking for device, OS, browser and the Diagnostics readout.

**Releases** `[pub: releases]`: one per landed wave, starting with v0.3 for Phase 0 and v0.4 for light and colour.
- The notes are written from merge commits and dated DECISIONS, in player terms.
- 2-4 media.mjs stills are attached.
- The tag goes on a green main, with `package.json` version bumped in the same commit.

**Opsec and public hygiene** `[harn: opsec]` `[pub: reading set]`:
- **Home paths:** 419 occurrences of the operator home path sit in 47 tracked files of a public repo. Most leave with
  the records removal. The rest are rewritten: AGENTS.md through `git rev-parse`; the two `drive-*.mjs` probes are
  deleted; `.claude/workflows/crafty-s0-reality-audit.js` moves out of this repo to the shared workflow store.
- **Opsec ledger:** regenerated at 0, so any new home path is refused outright.
- **To decide:** whether `memory/MONETIZATION-VIRALITY-SCAN-2026-05-30.md` and perf files named after the operator's
  machine belong in the public repo. The default under the records removal is that they leave HEAD.

---

## 7. Tools to install

Each is pinned to an exact version and installed under item 14's standing grant. Versions are as the lenses read them
from `npm view` (lens-reported).

| Tool | For | Source |
|---|---|---|
| `dependency-cruiser@18.7.0` (devDependency) | The layering rule that `sim/` imports no react, three, `@react-three/*` or the store. Replaces many source-grep gates as subjects move. Optionally feeds the generated ARCHITECTURE module map. | `[arch A9]` |
| `rollup-plugin-visualizer@7.1.1` (devDependency) | A bundle treemap per build: the byte ledger G-ledger #41 asks for, and the A11 lazy-load work | `[arch A11]` |
| `@stryker-mutator/core` and `@stryker-mutator/vitest-runner@10.1.1` (devDependencies; peer `vitest >=2`) | Measured test pruning and mutation reports. First a `--dryRunOnly` on `src/game/resonance.js`, then `src/game/**`. Source-grep gates are excluded, because they would read instrumented source. Delete only tests that kill no mutant AND pin implementation strings; overlap with another test is not grounds `[ref]`. | `[harn: Stryker]` |
| `spectorjs@0.9.33` (devDependency) | One-off WebGL frame dissection through the lookbook seam: pass list, draws, shader per draw | `[vis]` |
| `culori@4.0.2` (devDependency) | OKLab maths for the colour-script gates and the dusk-blend check; replaces the hand-rolled matrices in `tests/gates/_lightModel.js` | `[vis]` |
| `gifski` (`brew install gifski`) | The README hero loop from frame sequences. ffmpeg, ImageMagick, cwebp and avifenc are already installed. | `[pub]` |
| **Not now** | `@gltf-transform/cli` and KTX2/Basis (no glTF assets and only a 64 KB procedural texture array); `r3f-perf` (last published 2024-11; the pass timer is built on EXT_disjoint_timer_query_webgl2 directly); any static-site generator (no Pages) | `[vis]` `[pub]` |

---

## 8. How this composes with the in-flight lanes

| In flight | Decision | What changes |
|---|---|---|
| **CI required check** (`fix/ci-required-check`, DECISIONS 13b) | **Keep; top priority** (W1-A) | Before "no bypass" goes live, the flaky specs are fixed or quarantined from the `ci ok` aggregate, so a flake cannot freeze landing `[ref]`. After it is live, W2-C deletes e2e-freshness and closes PR #28. |
| **Flake fixes** (`fix/touch-hold-freeze`, `fix/lightning-ci-budget`, `fix/e2e-hardening-2026-10-27`) | **Fold into W1-A** | They are W1-A's precondition, not separate goals. |
| **e2e speed** (`fix/e2e-runner-speed`: canvases at pixel ratio 0.5; slowest shard 978 to 605 s) | **Keep this change; stop further speed machinery** | Once `ci ok` is required, e2e duration is the landing latency, so the 0.5 DPR change pays directly. Long term, the headless replay (A8) shrinks e2e to input wiring. |
| **PR #28** (`feat/ci-tree-equivalence`) | **Stop; close** | The required check replaces the receipt it optimises `[harn]`. |
| **#24 steady tiers, cool by budget** | **Keep** | Land it after the G-ledger #44 re-review. After W2-I's pass deletions are measured, raise the pixel budgets back toward dpr 2 at the same watts `[vis: steady-cool]`. |
| **Light and colour script** (`worktree-wf_34f35934-dfe-1`) | **Keep; land in Wave 1** | 0e stops being its precondition through W1-H's decision and W2-B. Drop its capture-state work (adding explore-golden to VISUAL_STATES, plan :972, :1009). Accept it on the W1-D eye-level frames and dusk clip. Check the OKLab blend. Settle the 300 s day length in this lane. Its Task 7 keeps owning the motes reshape `[vis]` `[up]` `[ref]`. |
| **Combat stance** (`feat/combat-stance`) | **Keep; land as reviewed, after #24** (DECISIONS item 10) | No coupling to encounter groups `[ref]`. If the first eye-level play session shows the walk clamp reads as a slowdown against single mobs, its constant is switched off until W3-A's day groups land (reversible) `[up]`. A5's Player split, the hands viewmodel and the HUD lane all start after it. |
| **Harness tranche #27** (PR #27; `worktree-wf_34f35934-dfe-2`) | **Fold: land Tranche A, amend the rest** | Land A2, A4, A5, A6, A7 and the receipt fix. Cut D1, the D3 archive-cursor script, D6/D7, the D9 hand back-fill, the D12 hand rewrite, C4's GATE-INCIDENTS.md and E2 (Stryker instead). Keep D2's harvest, aimed at `registry.jsonl`. C3 becomes item #29: it lifts the locks and keeps Kevin's directives. B7 comes after the ruleset `[harn]`. The refuter did not read this plan in depth (UNVERIFIED). |
| **`fix/artifact-currency-scope`** | **Stop** | Land it only if it is already green and one commit. artifact-currency is replaced by the generator (#31), so no further work. |
| **Coast (deferred)** | **Keep deferred, except the shader terms** | Before-fog, sun-driven and lit-foam terms land in W2-A; the seabed-depth bake stays deferred `[vis: ocean]`. |
| **Masterpiece umbrella and its 12 lane plans** | **Amend** | Add the Cut (W2-F), one HUD lane (W2-D) and a platform track beside the game lanes, not in front of them. Regroup Phase 3 into the First Night and the road of light. Cancel 0e and T10. Unstarted lanes become briefs; the first-minute plan is kept with its amendments. |
| **Dependabot PR #26** | **Unaffected** | It lands through `ci ok` like any other change. |
| **The Command Record** | **Keep as Kevin's one page** | Refresh it by hand at each landing until the generator (#31) exists; then it is generated, with its hand-written decisions-and-asks section. |

---

## 9. What stays deliberately unchanged, and why

- **The pure `game/` kernel and the worker greedy mesher** `[arch A25]`. There are 114 React-free modules, and the
  decide* reducers (Transform, Voidhand, Soulbind, Fuse, Imbue) have colocated tests. The new architecture is built
  from them, and the tuned feel (coyote time, jump buffer, perfect dodge, heavy charge) carries over unchanged.
- **The element-picks-the-form matrix, and bank by day, spend by night** `[game: keep]`. These are the game's best
  idea and the only system that already ties the others together. The Ember merge keeps one bank with four spends,
  and keeps build accrual feeding it `[ref]`.
- **Fire and ice annihilating each other.** Documented as "THE DESIGN" (elementZones.js:4-6). The roadmap's reaction
  table (:263) extends it rather than undoing it `[ref]`.
- **Soft death** (the decision of record), the audience-broad stance, and the killable NEUTRAL Settler tier
  (targeting.js:16-23). Only the Settler banking side effect changes `[game]` `[ref]`.
- **First person as the default camera** (Kevin, 2026-06-07; transformCam.js:4-12). The 14 s third-person beast hold
  is already in Kevin's recorded scope. A persistent chase camera stays a flagged experiment `[ref]`.
- **Rapier as the movement engine** until a flagged voxel controller wins a replay A/B. Movement feel is the game, and
  the cheap win (off the title's critical path) comes first `[arch A4]` `[ref]`.
- **`Mutation-Proof:` commit trailers** (DECISIONS 15c) `[ref]`.
- **No GitHub Pages site, and no licence grant.** Both are reversible later; the grant is not `[pub]`.
- **Deploy and repo rules:**
  - Vercel's auto-deploy of main on push.
  - The permanent crafty-sand.vercel.app alias.
  - No force push and no amend; history stays and the records tag preserves it.
  - The opsec gate on a public repo.
- **Code invariants:**
  - The zero-emoji gate in `src/`.
  - en plus lazy zh-CN i18n.
  - Game-loop isolation: no reactive state bound into `useFrame` or Rapier.
  - AST-safe edits only.
  - The voxel-mesher winding rules.
- **The first-minute plan's substance** (19 review amendments applied) `[pub: first-minute]`. It is amended, not
  rewritten, and is built last because it shows off what the First Night already delivers `[game: spine]`.
