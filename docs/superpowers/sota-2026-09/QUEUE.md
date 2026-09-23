# Crafty SOTA — THE EXECUTION ORDER

**Produced 2026-09-22.** Synthesis of the three P1 enumeration lanes (`GATES.md`, `OPEN-ITEMS.md`,
`FUTUREPROOF.md`) into one ranked queue, plus the LOOKS/GAMEPLAY analysis neither lane was scoped to do.

**Ranking rule.** `(value to Kevin's stated goal) / (risk + size)`, with LOOKS and GAMEPLAY weighted high
per his words. Rank order is the order **one** worker should take them. Two independent lanes exist and are
marked — see *The shape of the queue* below.

**What I re-verified live before ranking** (not inherited from the lanes):

| Claim | Command | Result |
|---|---|---|
| PR #18 + #17 still open | `gh pr list --state open --json number,title` | **both open**, created 2026-09-01. #18 = `postprocessing 6.39.1 → 6.39.4` |
| `postprocessing` ignore rule scope | `grep -n postprocessing -A6 .github/dependabot.yml` | line 87-88: `update-types: [version-update:semver-minor]` — **patch escapes** |
| the manifest "pin" | `frontend/package.json:19` | `"postprocessing": "^6.39.1"` — caret, not a pin |
| 6.39.5 exists and its peer | `npm view postprocessing@6.39.5 version peerDependencies` | `6.39.5`, peer `three: '>= 0.168.0 < 0.187.0'`. It is `latest`. |
| installed versions | `package-lock.json` | three **0.172.0** · postprocessing **6.39.1** · puppeteer **25.6.0** · vite 6.4.3 · vitest 3.2.7 |
| the HIGH advisory path | `npm ls js-yaml --all` | `eslint@9.39.5 → @eslint/eslintrc@3.3.6 → js-yaml@4.3.1` |
| biome `tint` has no reader | `grep -rn tint frontend/src` | `world/biomeTable.js:38-49` declares 10 tints; **zero consumers** |
| boss torso emissive | `render/BossEntity.jsx:479-481` | `bodyEmissive = phase.color`, `emissiveIntensity` 0.8→2.2 — confirmed |
| talent depth | `game/talentTree.js` | **18 nodes** across 4 aspects; no capstone, no exclusivity, no respec |
| chest LMB | `input/verbRouter.js:35-42` | `button === 0` has no `chestTargeted` branch — falls to `'mine'` |
| damage lockout | `store/useGameStore.jsx:825` | `if (now - state.lastDamageTime < 500) return;` — global, not per-source |
| test-file census | `find frontend/tests -name '*.test.js*' \| sed 's\|/[^/]*$\|\|' \| sort \| uniq -c` | 292, of which **92 are in directories GATES.md never enumerated** (see §E1) |

---

## The shape of the queue

Kevin named four things. They do **not** all sit on one critical path:

- **Tier 0 (Q01–Q06)** is ~one hour of commands that stop live bleeding. It goes first because one row
  (`Q01`) is a single click away from shipping a sunless sky to the live demo, and because `Q03` is a
  blocking CI gate that will fail on its next invocation — which is whatever push starts the real work.
- **After Tier 0 the queue forks.** LANE A (Q07–Q20) is *oracle → LOOKS*: every look change rewrites the
  31-frame visual baseline, so the oracle has to be trustworthy before the look changes, or you freeze
  today's noise into tomorrow's truth. LANE B (Q21–Q30) is *GAMEPLAY*, and it does **not** wait: this repo
  already measured that gameplay/HUD/VFX changes move pixels the 6% gate cannot resolve (`OI-96`: the whole
  spell-cast VFX ensemble is 0.64% of frame, the QUESTS panel 7.51%). Gameplay work is therefore
  baseline-inert and runs in parallel from hour two.
- **Tier 3 (Q31–Q42)** is the gate corpus. It is ranked below LOOKS/GAMEPLAY deliberately: `GATES.md`'s own
  governing finding is that volume is not the variable, and the corpus's defect is *provenance*, not
  coverage. Adding gate work before there is new behaviour to gate inverts that.
- **Tier 4–5 (Q43–Q60)** is debt, docs and the 6–12 month future-proofing horizon.

**The batching constraint that governs LANE A.** Every row marked `[REBASELINE]` rewrites part of the
31-frame oracle, and each rewrite needs a `Baseline-Review:` trailer and Kevin's eye. Do **not** take them
one at a time. `OI-70` already prescribes the answer — two review batches. This queue schedules them at
**Q16** (after the geometry/colour changes) and **Q20** (after the sky work).

---

## A. THE RANKED WORK QUEUE

Legend — **Decide:** `loop` = loop-decidable under the 2026-08-11 grant · `KEVIN` = taste, money, outward-facing,
irreversible, or a new dependency. **Size:** S ≤ 1 commit / 1 hour · M = 1 session · L = multi-session.
`[REBASELINE]` = rewrites visual baselines. `[LANE B]` = independent of the oracle; can start immediately.

### TIER 0 — stop the bleeding (~1 hour, all loop-decidable)

| ID | What | Why it ranks here | Blast radius | Size | Depends on | Decide |
|---|---|---|---|:-:|---|---|
| **Q01** | **Close PR #18.** `gh pr close 18` with the reason. Source: OI-04 / R1. | The highest value-over-cost row in the entire queue. One command. #18 is 8/8 GREEN and bumps `postprocessing` to the exact version this project measured on 2026-08-13 as killing GodRays sun compositing (`ACTIVE_PLAN.md:325-327`, filed as pmndrs/postprocessing#750). CI is structurally blind — the 31-frame visual gate is in neither hook nor workflow — so every check says yes about a sunless sky. It protects precisely the thing Kevin called of utmost importance. | Merging deploys a sky with no sun to the live Vercel demo, and nothing would report it | S | — | loop |
| **Q02** | **Two lines in `.github/dependabot.yml`:** add `version-update:semver-patch` to the `postprocessing` ignore, and pin `frontend/package.json:19` to exactly `"6.39.1"`. Source: R2. | Without it, #18 regenerates monthly. The file already documents this exact failure shape three lines above, for `@react-three/postprocessing` — the reasoning was written down and not applied to its neighbour. The documented "pin" is currently held by the lockfile alone. | A monthly re-offer of the same regression, each one a green tick on a broken look | S | Q01 | loop |
| **Q03** | **`npm audit fix`** — js-yaml 4.3.1 → 4.3.2 (GHSA-2883-xcg3-v3hh, 7.5 HIGH via `eslint > @eslint/eslintrc`). Closes fflate and postcss-selector-parser at the same time. Source: R3. | `npm audit --audit-level=high` is a **blocking CI step** and exits 1 today. It is not red-and-unread, it is *untriggered*: the advisory published 2026-09-08 and the last CI run of any kind was 2026-09-01. The next push — i.e. the first push of this campaign — is the run that fails. Fix it before Q06, not after. | Every subsequent push reds on a transitive dev dependency, and the campaign's first signal is noise | S | — | loop |
| **Q04** | **Ignore `react` / `react-dom` minor** in dependabot until `@react-three/fiber` relaxes its peer. Source: R4. | Hard deadline. `@react-three/fiber@9.7.0` peers `react >=19 <19.3`; react 19.3.0 published 2026-09-09; react is in the `production-minor-patch` group and is **not** ignored. The 2026-10-01 grouped PR will ERESOLVE and regenerate monthly. | ~9 days to a permanently-failing monthly PR | S | Q02 | loop |
| **Q05** | **Review PR #17 entry-by-entry** (dev-dependencies group, 4 updates) and merge or close. Source: OI-05. | Not in any doc. Its green tick predates the 09-08 advisory and is stale. Precedent from PR #13: a "dev-dependency" bump silently split `@dimforge/rapier3d-compat` so an integration test drove different WASM than production. **Review the entries, not the group name.** | A silent engine split under the integration suite | S | Q03 | loop |
| **Q06** | **Push the 2 unpushed commits; commit `.githooks/pre-commit` + `.githooks/post-commit`; resolve the 5 dirty + 8 untracked paths.** Source: OI-26. | `origin/main` is still `46a36015` from 2026-08-13. While nothing pushes: CI never runs, so `failOnFlakyTests`' 10-consecutive-run counter (OI-25) is frozen at 4 and **cannot accrue**, and the audit gate above never fires. Worse, `.githooks/pre-commit` is **untracked** — the `Mutation-Proof:`/`Baseline-Review:` trailer discipline that Tier 3 depends on is not reproducible from a fresh clone. Caveat carried: `f5df6cc`'s STALE note records a hardcoded DATE that OVERWRITES the S0 baseline — **do not re-run `crafty-s0-reality-audit.js` as-is.** | The whole enforcement layer is machine-local; every gate result this campaign produces is unreproducible | S | Q03 | loop |

### TIER 1 — LANE A: make the oracle trustworthy (it gates every LOOKS review)

| ID | What | Why it ranks here | Blast radius | Size | Depends on | Decide |
|---|---|---|---|:-:|---|---|
| **Q07** | **Measure `postprocessing@6.39.5` against the GodRays frames.** Upstream #750 CLOSED 2026-09-09 — vanruesc: *"Should be fixed in v6.39.5"*; 6.39.5 published 27 min later and is `latest`; peer widens to `three >= 0.168.0 < 0.187.0`. Run the same blue-channel ablation at y=4, x=95..165 on both spell frames, 6.39.1 vs 6.39.5, **presence control stated**. Source: R6, OI-03. | **The single highest-leverage experiment in the queue.** If the sun composites, the pin dies and four HIGH rows unblock at once: OI-03 (the pin), OI-07 (the GL storm's only mitigation was the pin), OI-22 (Phase 26 sky), and the joint `three` ceiling rises 0.184.0 → 0.186.0. It is loop-decidable, it is an hour, and until it runs *every* statement about the sun in this repo is six weeks old. | Unblocks or confirms the largest single constraint on how Crafty looks | M | Q01 | loop |
| **Q08** | **Post the reply to pmndrs/postprocessing#750.** Draft is complete at `docs/superpowers/upstream-750-reply-draft.md` (versions, ablation, pixel measurements, control stated) and unposted. Source: OI-76. | Outward-facing, so Kevin's. Cheap and courteous: the maintainer replied within hours and shipped a fix. Note the *filing* is already done — `ACTIVE_PLAN.md`'s "NEEDS KEVIN: filing this upstream" is **STALE-08**. Amend it with Q07's result if 6.39.5 verifies. | Reputational, small; closes a loop the project opened | S | Q07 | **KEVIN** |
| **Q09** | **Fix the `explore-day` settle defect.** `.density-ledger.json` `_ungateable: {observed 0.3035, wouldFreezeAt 0.547}`; two samples are 5.13% and 30.35% **on identical code**. `waitForStableFrame` runs inside `shot()` and does not catch a late chunk arrival on this pose. Source: OI-09. | A 6× spread on identical code is a defect, not a tolerance, and this frame is the primary daylight look frame — the one every LOOKS change will be judged on. **Do NOT widen the ratchet to make it green.** | Every LOOKS verdict downstream is read through this frame | M | Q06 | loop |
| **Q10** | **Raise `needStable` 2 → 5** (`scripts/visual/capture.mjs:236`, `:264`) and delete the 30-line parked block. Source: OI-10. | Parked 2026-08-13 only so PR #15 could be validated against one variable; that PR is merged and split. `waitForStableTerrain` already demands **six** consecutive stable polls for exactly this reason. Measured cost of raising it: **~0** (57.2 s/frame vs 57.6 s/frame). Its one trial WEDGED, which is why it is unproven — and Q09 is the likely reason it wedged. | Removes the most likely proximate cause of every "flaky frame" verdict | S | Q09 | loop |
| **Q11** | **Shoot a capture pair on a QUIET machine and re-baseline on Chromium 151.** Source: OI-11, OI-12. | The oracle's provenance record is wrong: HEAD's `.capture-meta.json` says `HeadlessChrome/147`, puppeteer is 25.6.0 (Chromium 151, bumped 2026-08-13 by `3c0b188`/`5848d64`), and the last baseline commit is `043dcdb0` on 08-12 — *before* the bump. The `.density-ledger.json` `_sources: ["rbA","rbB"]` **is** from the 151 pair, so ledger and PNGs were shot on different renderers. Preconditions already recorded: expect frames MORE complete than the old baselines (that red is signal); **do NOT re-baseline `ocean-coast` / `landmark` / `explore-day-med`** — the capture WARNs in both runs independently that they never stabilize. | Until this lands, every visual verdict mixes two renderers and nobody can tell a look change from a Chromium change | M | Q10 | loop `[REBASELINE]` |

### TIER 2 — LANE A: LOOKS (Kevin: "of utmost importance")

Detail and rationale for Q12–Q16 is in **§B**.

| ID | What | Why it ranks here | Blast radius | Size | Depends on | Decide |
|---|---|---|---|:-:|---|---|
| **Q12** | **The solar arc.** Wire `cycleFraction(gameTime)` into `sunPos` so the sun actually crosses the sky. NEW — in no lane's ledger. | §B1. The largest single change to how Crafty looks, and most of it already exists: `game/dayPhase.js:28` computes dawn/noon/dusk/midnight and has **zero consumers outside its own file**, while `render/mood.js:17-19` holds the sun at one of three fixed directions. The HUD dial at `HUD.jsx:81` currently shows a sun orbiting while the sky's sun does not move. One coherent fix lights the whole world, sweeps the shadows, swings the GodRays shafts, and makes OI-02 answerable and OI-35 buildable. | Every outdoor frame, every hour of play | M | Q11 | loop `[REBASELINE]` |
| **Q13** | **Shadow frustum follows the player** (terrain S10). `GameScene.jsx:116-126` builds a static ±100 box memoized only on `q.shadowMapSize`. Source: OI-46. | §B1 makes this a **hard dependency, not a sibling**: a static shadow box is tolerable under a fixed sun and breaks visibly under a moving one (grazing light needs a much longer, re-centred frustum). Phase-C Batch 1 already put `castShadow` unconditionally in ten baselines (`Atmosphere.jsx:242`), so S10's payoff is now gateable rather than invisible — which closes `TERRAIN-GRASS-SOTA-PLAN.md` Q6 in part and **raises** this row's value. | Shadow quality + correctness across the whole view | M | Q12 | loop `[REBASELINE]` |
| **Q14** | **Biome ground tint.** `world/biomeTable.js:38-49` declares a `tint` on all ten biomes; **zero readers**. Six biomes share `surfaceBlock: 1` so taiga/plains/forest/meadow/jungle/savanna render **pixel-identical at ground level**. Source: OI-44 / terrain S13 / world M4b. | §B2. Kevin's own question was *"how do different biomes appear?"* — today the answer is "six of the ten do not." The data exists, the shader seam exists (`world/Terrain.jsx:53-145` already patches vertex+fragment and already carries `aAO`), so this is an attribute + one `mix()`, not a render rewrite. **Tint STRENGTH is Kevin's call** — recommend the 25/35/50 ladder from `TERRAIN-GRASS-SOTA-PLAN.md`, defaulting to 35% luminance-preserving. | Every ground-bearing frame; 6 of 10 biomes gain an identity | M | Q11 | loop (build) / **KEVIN** (strength) `[REBASELINE]` |
| **Q15** | **The boss art emergency.** `render/BossEntity.jsx:479-481`: `bodyColor = "#111029"` (correct obsidian) but `bodyEmissive = phase.color` at intensity 0.8 → 1.5 → 2.2 floods the entire torso. Source: OI-19. | §B3. It is the payoff of the entire run and it reads **cheaper than the trash mobs** — a flat purple box. Kevin DE-GATED art on 2026-07-13, so this is loop work today. **Do NOT "fix" `bodyColor`** — move the phase colour off the torso onto DETAIL (eyes, wing membranes, vent seams, a rim term), which is what the obsidian was written for. | The single most important silhouette in the game | M | Q06 | loop |
| **Q16** | **REBASELINE BATCH 1 + Kevin review.** Q12–Q15 together, one `Baseline-Review:` trailer, contact sheets from `tests/visual/diff.test.js:243-258` (it already writes a 3× zoomed baseline\|current\|mask crop). | `OI-70` prescribes batching re-baselines into two review passes; this is the first. Reviewing four look changes as one diff is also the only way Kevin can tell which change he is reacting to. | Freezes four look changes into the oracle | S | Q12–Q15 | **KEVIN** (eye) `[REBASELINE]` |
| **Q17** | **The player reads monstrous.** `character-closeup.png` is a green box-man with **red eyes** — this game's own hostile marker — and no arms. Source: OI-32. Judge by opening the PNG, not by reading the code. | §B5. The player is on screen in third-person, in the title diorama and in every character card. Cheap relative to its visibility: the render language and tokens already exist (`render/characterStyle.js`, `render/playerRender.jsx`). Pair it with OI-33 — the FPV glove art at `playerRender.jsx:30-32` (`GLOVE_INK = '#2A2A33'`) **exists and has never been looked at in the running game**; `scripts/visual/hands-probe.mjs` already exists to do it. | Player identity, title screen, every mascot/character card | M | Q16 | loop → **KEVIN** (eye) |
| **Q18** | **Composer audit: the scene pays 8× MSAA *and* a full SMAA pass.** `GameScene.jsx:294` `<SMAA />` with `antialias:false` on the canvas but `multisampling` left at the composer default; `multisampling` sits in the composer's `useMemo` deps, so wiring it to `qualityTier` rebuilds the **whole composer** on every `PerformanceMonitor` flip — exactly when FPS has already dipped. Source: OI-70 (composer AA), OI-49 Q5. | Free frame budget on the constrained tiers, which is what pays for Q19/Q20. The trap is named in the terrain plan and has never been acted on. Measure `multisampling` effectiveness in this composer config first (OI-49 Q5) — do not assume. | Perf headroom on low/med; a stutter class at exactly the wrong moment | M | Q16 | loop |
| **Q19** | **Terrain S11 sky-coloured AO · S12 macro-octave de-tile · S14 unnormalized `Uint8` attributes · S15 AO in the greedy merge key.** Source: OI-47. Plus **S4 AO-chosen quad diagonal** (OI-48). | §B4. AO today is a flat grey multiply — `world/Terrain.jsx:145` `diffuseColor.rgb *= mix(0.55, 1.0, vAO/3.0)`. Tinting it toward the sky colour is the difference between "dirty" and "shadowed", and it costs one uniform. **S15 is gated** on the §5-Q2 trimesh-rebuild measurement and needs `Uint32Array` (the `Uint16Array(4096)` mask silently truncates an 18-bit key). `TERRAIN-GRASS-SOTA-PLAN.md` Q4 warns S11/S12 may be visible to the eye and invisible to the 6% gate — that is a reason to look, not a reason to skip. S4 has three contradicting readings (see §E4) and is settled only by looking at a face with strong AO contrast. | Surface quality everywhere; de-tiling kills the repeating-texture tell | M | Q18 | loop → **KEVIN** (S4 eye) `[REBASELINE]` |
| **Q20** | **Phase 26 sky** — scattering · volumetric clouds · light shafts, then **REBASELINE BATCH 2**. Source: OI-22. Plus the **dawn/dusk payoff spike** (OI-35: `grep dawnPayoff\|duskSpike` → zero hits; the boss-entrance half shipped 2026-08-05 in `game/bossEntrance.js`). | Ranks last in LANE A because it is the only LOOKS row that is genuinely large and genuinely Kevin-gated to *start*. **Read its warning block first:** the sun is a camera-locked billboard at a fixed 380 units (`render/Sun.jsx`) existing as `GodRaysEffect`'s light source, reparented into the effect's `lightScene` every frame, bound by the vendor contract *"must not write depth and has to be flagged as transparent."* Making it real scene geometry is **not** an upgrade. Volumetric clouds need a perf budget agreed **before** building — the cost lands on low/med. Q12 is a prerequisite in substance: scattering without a moving sun is a static gradient with extra steps. | The sky is most of every outdoor frame | L | Q07, Q12, Q18 | **KEVIN** (start) / loop (build) `[REBASELINE]` |

### TIER 2B — LANE B: GAMEPLAY (starts at hour two, in parallel with Q07+)

Detail and rationale for Q21–Q25 is in **§C**.

| ID | What | Why it ranks here | Blast radius | Size | Depends on | Decide |
|---|---|---|---|:-:|---|---|
| **Q21** | **The 500 ms GLOBAL damage lockout.** `store/useGameStore.jsx:825` `if (now - state.lastDamageTime < 500) return;`. Source: OI-39. | §C1. A pack of N mobs deals the damage of **one**. It silently deletes the entire threat model — the night siege, squad AI, `mobArchetypes`' three archetypes, the duskhound pack design — all resolve to the same DPS. Highest gameplay value per line changed in the repo. Key the lockout per damage **source**, keep a short global floor for feel, and gate it with a lived probe (a pack of 3 must out-damage a single). | Every combat encounter in the game; all pack/siege design is currently inert | S | Q06 | loop |
| **Q22** | **Chest LMB data loss.** `input/verbRouter.js:35-42` — `button === 0` has **no `chestTargeted` branch** and falls through to `'mine'`. Only `button === 2` (`:45`) returns `'interact'`. Source: OI-38. | §C2. Losing a chest's contents to a mis-click is **data loss, not a balance question** — already re-assigned `[LOOP]` 2026-08-08 on exactly that reasoning. Option (a), LMB opens, is the only branch that cannot destroy player property. Carry the caveat: `verb-router-gates.test.js` §5-12 explicitly pins LMB→mine as existing cleanup, so **that test moves with the fix** (and moving it is itself a `Mutation-Proof:` commit). | Irreversible loss of player inventory on a single mis-click | S | Q06 | loop |
| **Q23** | **Recurring apex threat.** `grep -rn "bossTier" src` → **zero hits**; the boss is a one-shot L5 event. Source: OI-20 (E1). | §C3. The project's own documents call this *"the single highest retention lever."* The scaffolding is all present — `world/bossSystem.js`, `game/bossConfig.js`, `game/bossPersistence.js`, `game/bossEntrance.js`, `game/bossKill.js` — so this is a tier dimension over existing machinery, not a new system. Pairs naturally with Q15: a boss worth fighting twice has to look worth fighting once. | Why a player returns after the L5 kill | M | Q15, Q21 | loop |
| **Q24** | **Build-identity talents.** 18 flat +stat nodes across 4 aspects (`game/talentTree.js`); no capstones, no mutually-exclusive picks, no respec (`grep -rn respec src` → zero hits in talent code). Drains by L18. Source: OI-21 (E2). | §C4. The second-run problem, stated precisely: with 18 nodes that all add a number, there is no build to *choose*, so there is no build to come back and try differently. The effect-less-unlock pattern for signature nodes already exists four times over (`voidhand_grasp`, `wildheart_roar`, `soulbind_snare`, `elemancer_imbue`) — capstones are that pattern with an exclusivity constraint, which is one field in the fold. | Replayability; the whole 4-aspect design pays off here or nowhere | M | Q21 | loop |
| **Q25** | **Distinct mob MOVEMENT.** `workers/ai.worker.js:278` `else if (type === 'skeleton')` and `:299` `else if (type === 'spider')` are still the only two arms besides beeline-and-bonk. Source: OI-34 (E3/D2). | §C5. `game/mobArchetypes.js` moved the *numbers* per type (aggro, leash, reach, cooldown, vertical reach — live at `ai.worker.js:192`); the *movement* did not follow. Five of seven hostiles are the same creature wearing different meshes. The file's own docblock names the next slice: a brute that shoulders through, a hound that flanks. Its safety property already holds — a type with no entry reproduces today's numbers exactly. | Whether ten silhouettes play as ten creatures or three | M | Q21 | loop |
| **Q26** | **The four authorized control-scheme enhancements (C1).** (1) verb-telegraph reticle — `input/verbRouter.js` already exports the pure `routeMouseVerb(button, ctx)`, so this is "render what it already predicts"; (2) hold-Alt force-build (`grep -rn altKey src` → **zero hits**); (3) persistent control legend — today an 8-second auto-fade in `HUD.jsx`, *literally the undiscoverability bug the spec names*; (4) full key rebinding. Source: OI-31. | Kevin picked Option A on 2026-06-28 and these were AUTHORIZED loop work; the `[KEVIN-GATED]` tag on them was **stale**. (1) and (3) are the two highest-value and the two cheapest — the prediction and the legend both already exist, they are just not on screen. | New-player comprehension; the difference between "what does clicking do here" and knowing | M | Q22 | loop |
| **Q27** | **Directional hurt flinch** (OI-37) + **the dawn/dusk payoff spike** (OI-35, also listed under Q20). | `game/hurtFeel.js` grades the freeze on a fraction of max health but `hurt` is undirected (`right = 0`), though the store already computes `lastHitDir.angle` and `game/trauma.js` already biases shake by direction. Two existing signals, one unconnected consumer. Deliberately not done blind — it is a feel change wanting a human eye on a real hit. | Combat legibility: which way is hurting me | S | Q21 | loop → **KEVIN** (feel) |
| **Q28** | **Glass renders OPAQUE** (R4b). `world/mesher.js:79`,`:84` — the greedy mesher's only non-solid block is water: `const aIsSolid = blockA > 0 && blockA !== 9`. Source: OI-41. | R4a shipped (id registry, ores 10-13, water 9, cobblestone 14, glass 15, refuse-don't-substitute) so glass **places** correctly and renders as a solid block. True see-through glass needs a second transparent draw pass — a real render slice, which is why it ranks below the free wins. It is also a LOOKS row: a window is the most legible building affordance a voxel game has. | Building expressiveness; one block type is a lie | M | Q19 | loop |
| **Q29** | **Boss ROAR audio asset** (OI-36) and **item sets / set-bonuses** (OI-59, `grep setBonus\|itemSets` → zero hits) and **`aspect-underbanked` denied-reason** (OI-60, zero hits). | `game/bossEntrance.js:14-16` ships **deliberately silent** rather than firing `playVictory` at an entrance because that was the closest asset to hand — the code says so in its own docblock. Inventing an audio asset is outside a loop slice. Sets/underbanked are content depth behind Q24. | Boss entrance impact; late-game itemization | M | Q23, Q24 | **KEVIN** (asset) / loop (sets) |
| **Q30** | **3D mob pathfinding** (OI-40). | Carries a standing caveat that ranks it here and not higher: *"3D pathfinding is a project, not a fix, and should be planned before it is started."* Note the related B4 defect **is** closed — `game/mobLineOfSight.js` is a real pure module, imported at `ai.worker.js:18`/`:244`, so mobs no longer hit through 200 blocks of rock. | Mob competence in vertical terrain, which is most of this world | L | Q25 | loop (plan first) |

### TIER 3 — the gate corpus: prune and enhance

| ID | What | Why it ranks here | Blast radius | Size | Depends on | Decide |
|---|---|---|---|:-:|---|---|
| **Q31** | **THE STRUCTURAL CHANGE: move the killability receipt from a per-commit sentence to a per-file artifact the suite reads.** A `Mutation-Proof:` block **inside** each check file; one CI script that parses it, refuses a new check file without one (ratcheted exactly like `.source-grep-ledger.json`), and **prints the denominator on every run** — `N/497 check files carry a receipt`. Source: GATES.md §"The single structural change". | `GATES.md`'s one governing finding: only 148 proof lines exist in all 1,857 commits, 28 commits added more gate files than proofs, so **at most 82 of 405 files (20%) have a dedicated receipt** — and the 106 gates in `.source-grep-ledger.json` have **zero between them**. The receipt regime already works at the one channel rules survive in this repo (the commit message); its only structural weakness is that the receipt is not attached to the thing it certifies. The second-order effect is the point: once every file must name the mutation that reds it, *"deleted the assert → RED"* reads visibly weak next to *"halved the damage → RED"*, and the sufficiency half gets forced. **Update the denominator to 497** — see §E1. | Converts the suite's central defect from invisible to counted | M | Q06 | loop |
| **Q32** | **Fix `scripts/ci/gate-shape.mjs` — the repo's own anti-decoration lint.** It reaches 388 of 495 positive source-text assertions (78%), **silently skips 26 gate files** via three bare `continue`s (`:212`, `:230`, `:241`), prints no skip count, and **passes on an empty population** (`:304`). `toContain` (33) and negated (88) assertions are outside it by construction. | This is the gate that authorizes every other gate, and it is the repo's own #1 documented failure mode — *"a gate's PASS is worth nothing without its DENOMINATOR"* (`AGENTS.md`, which records seventeen prior instances). Make it print `examined N / skipped M (reasons)` and fail on an empty population. Everything in Q33–Q35 is judged by this tool; fixing the judge precedes the trial. | Every gate verdict in Tier 3 | S | Q31 | loop |
| **Q33** | **DELETE the 24 decorative gates** named in `GATES.md` §A·DELETE — pure source-text greps that import nothing, so **a comment naming the symbol satisfies them**. Includes `modal-static-gates.test.js` (16/16 assertions are regex over JSX text while claiming *accessibility* — `role="dialog"`, `aria-modal` — when jsdom + `getByRole` is used elsewhere in this repo), `title-screen-brand-gates.test.js:6-15` (6 of 8 assertions are absences of CSS class names from a **deleted** design — necessity without sufficiency, permanently), `look-sensitivity-gate.test.js:12` (concatenates two source files and asserts `not.toMatch(/PointerLockControls/)` over the union — an absence belonging to neither file), `heightat-single-source.test.js:21-24` (anti-drift gate implemented as `toContain` on file text; the real invariant — both samplers return the same height — is one import away). | Apply **classify-before-delete**: each deletion commits with the reason and, where the claim is worth keeping, its replacement in the same commit. These are not coverage; they are decoration that makes the denominator look healthy. | Removes 24 files that cannot fail | M | Q32 | loop |
| **Q34** | **CONVERT the 51 gates** that read an importable module as TEXT (`GATES.md` §A·CONVERT) into gates that drive it. Unit is per-TEST, not per-FILE. This is `OI-14`'s ten unstarted seam-extraction batches (worker harness · jsdom render · SoundProvider · capture policy · combat attribution · worldgen seams · quality ladder · trade/inventory · compass/minimap · small lifts). | Ranks **below** Q31 deliberately, and `GATES.md` argues the reason: converting these raises provenance from tier 3 to tier 3 — a behavioural test written in the same pass as its code is still self-authored. It removes the comment-satisfiable defect and leaves killability untouched, and killability is the factor at zero for 73% of this suite. Do it, but do it after the receipt regime makes the work legible. The ratchet holds at 106 and may fall, never rise. | 51 files move from "the symbol exists" to "the behaviour holds" | L | Q31, Q33 | loop |
| **Q35** | **Fix the four named instrument defects.** (a) `scripts/ci/i18n-adoption.mjs:113,178-180` — empty glob → `✓ 0 occurrences across 0 files`, exit 0; worse, files that **vanish** from the frozen ledger route to the SUCCESS branch (*"— improved, re-freeze"*), so **deleting `src/ui` reads as an improvement**. (b) `scripts/ci/cli-guard.mjs:131` prints its denominator and never asserts it — in a file whose entire subject is a gate that silently stopped running. (c) `scripts/visual/heldf-probe.mjs:4`,`:65`,`:72` — premise six weeks stale (header still says *"F is now MELEE only"*, which Kevin's 2026-06-28 change reversed) and it reports PASS on an absence with a **dead positive control**: it wraps `store.castSpell`, and `EnhancedMagicSystem.jsx:164` re-installs that function via `setState` whenever its effect re-runs, silently replacing the wrapper. The BINDING is correct; only the probe is wrong (OI-52). (d) the 11 empty-denominator sites (R3a) and 6 silent-skip sites (R11) listed with file:line in `GATES.md`. | Each of these is a control that reports success over input it never examined — the exact class `AGENTS.md` says has now shipped seventeen times. (a) is the worst because its failure direction is inverted: it rewards deletion. | Four gates currently incapable of reporting a failure | M | Q32 | loop |
| **Q36** | **Fix `scripts/ci/prod-smoke.mjs:78` — `m.type() === 'error'`.** The WebGL storm arrives as `warning`, so the prod gate is structurally blind to its own subject. It **is** wired into CI (`ci.yml:107`), which makes it worse. Source: OI-06. | Cheap, **not gated on r174**, and it is the only harness that loads the production bundle at all. Pair with OI-08: `capture.mjs:212`'s `FATAL_GL_RE` does not match `GL_INVALID_OPERATION: glBlitFramebuffer` **and** capture runs the DEV server, so it would never see it either way. The recorded instruction stands — **do not simply widen `FATAL_GL_RE`**; the fix is a probe that loads the PRODUCTION build and asserts on its console. | The one production-facing gate cannot see the one production-only defect | S | Q06 | loop |
| **Q37** | **Group E — the 29 visual probes.** 25 of 29 carry no receipt; 19 read `getState()` they never set (R12). `probe-honesty.test.js` gates `_probe.mjs`'s helpers superbly; the other 27 probes' **drive logic is ungated**. A probe that drives nothing still writes a PNG, and that PNG becomes the baseline. Source: GATES.md offender #9. | This is the group the brief's own count left out (375 vs 405) and the weakest in the suite — **13% receipt rate**, against B's 94%. It is also the group that manufactures the oracle, so its defects propagate into everything LANE A does. Extend `probe-honesty`'s pattern to the drive logic: assert the probe CHANGED something before it shoots. | The oracle's inputs | M | Q11, Q32 | loop |
| **Q38** | **A standing determinism CONTROL in the harness** — capture twice, diff A-vs-B, fail above a floor. Source: OI-28. | `assertIntraPageDeterminism` covers the intra-page half; the cross-process half was measured once at 0.0000%; the Linux self-consistency CI job was explicitly **declined** (`DECISIONS.md`, 2026-08-09) and should stay declined. What is absent is a run-to-run control **inside** the harness — exactly the instrument Q09 (OI-09) and Q41 (OI-18) each needed and had to hand-run. Build the instrument once instead of hand-running it a fifth time. | Turns two recurring hand-investigations into a standing check | M | Q11 | loop |
| **Q39** | **Density ledger honesty.** `_unmeasured: 23` of 31 frames compare against the constant `0.02`, so the ratchet cannot distinguish "reproduces almost exactly" from "regressed by less than the floor"; `_samples["title-mascot"]: 1`. Source: OI-13. Then **per-frame tolerances** (OI-27) once n ≥ 10. | The ledger's own note is the standing instruction: **do NOT raise `DENSITY_FLOOR` to shrink this number** — that widens every floored entry at once. The calibration instrument is already live and accruing: `diff.test.js` prints max local density for all 31 frames on every run, asserting nothing. Q11's captures feed it. The audit bar is n ≥ 10 **separate-process** captures, explicitly not a max-of-three; n = 3 today. | Whether the 6% gate means anything per frame | M | Q11, Q38 | loop |
| **Q40** | **Root-cause the `beast-*` determinism race** (4th pass, 3 wrong conclusions). `spawnBeastTransform` is still the only showcase hook depending on live physics state (`src/App.jsx:422`); `spawnCharacterCloseup` is the pattern to copy (FIXED constants, documented why). Source: OI-18. | Success criterion is already written and checkable: **two consecutive `visual:capture` runs produce byte-stable `beast-*` frames.** Q38 makes that a command rather than a project. The broken-oracle half is closed (`8b1a45e`, `043dcdb`); the race is not. **Two strikes rule applies** — this has failed three times; if pass 5 fails, stop adjusting and state two distinct root-cause hypotheses. | Four frames of the 31-frame oracle | M | Q38 | loop |
| **Q41** | **Governance A2 — generate the counts.** `scripts/ci/measure.mjs` emits only `srcFiles`, `srcLoc`, `colocatedTestFiles`, `largeFiles`. **Visual states, e2e specs, gate-file count and the queue split are still hand-typed** — and those are exactly the numbers that rotted twice already. Source: OI-50, OI-64 (AGENTS.md says 72 `Math.random()` / 127 `isCaptureMode()`; live is 73/21 files and 130/58 files). | The fix is to **generate them, not retype them** — this repo's own stated lesson: *"a number in prose rots no matter how emphatically the prose warns about rot."* Add the four populations to `measure.mjs --write` and let `doc-currency` enforce them. Q31's denominator should be generated by this same path. | Ends a recurring class rather than an instance | S | Q31 | loop |
| **Q42** | **The accretion ratchet** — a deterministic, advisory-only script: net-LOC add/delete ratio, jscpd duplicate blocks, knip/ts-prune dead exports, cyclomatic delta on the god-files, per phase-exit over the phase commit range. Source: OI-97, `docs/superpowers/specs/crafty-coherence-pillars.md:66`. | Half of it is already the better half and already deterministic — `knip` is wired in CI. `grep -rn "jscpd\|ts-prune\|cyclomatic\|accretion"` over `package.json` + `scripts/ci/*.mjs` → **zero hits**. Its named wiring target (`ruthless-cleaner-kz`) was archived 2026-08-29, so the spec now points at nothing: **decide whether the script IS the whole answer** or whether a review layer sits on top. Recommend: the script is the whole answer, advisory-flag only, never auto-delete — which is what the spec already says. | Stops the suite growing where growth is cheapest (Group G: 83 of 135 in `src/game` alone) | M | Q41 | loop (decide + build) |

### TIER 4 — playable truth (the largest genuine coverage gap)

| ID | What | Why it ranks here | Blast radius | Size | Depends on | Decide |
|---|---|---|---|:-:|---|---|
| **Q43** | **V2 — the input-driven E2E harness.** Live: `grep -rlE "keyboard\.\|mouse\.\|\.click\(\|\.press\("` over `tests/e2e/` returns **exactly one** file (`panel-overflow.spec.js`) of **20**. Source: OI-15. | The gap **is** closable and the parts exist: every verb reads `getInput().active`, not pointer-lock, so Playwright can flip it through `devtest/testBridge.js` and fire real keys. The input-abstraction layer was built for this and never used for testing. This is the only instrument that answers `AGENTS.md`'s standing question — *"ask what would still pass if the feature were simply deleted"* — for gameplay. It ranks below Tier 3 only because Q21–Q26 supply the behaviour worth driving. | The 20-spec e2e suite currently proves the app boots | L | Q26, Q31 | loop |
| **Q44** | **V3 — verb-truth / HUD-truth / click-truth on that harness.** LMB=mine · LMB-on-mob=melee · RMB=cast/place · F=cast · T=melee · 1-4=select; bars render real state; Use→heal, talent unlock, craft, quest claim, chest open, respawn. Source: OI-16. | This is where Q22 (chest LMB) and Q26 (verb telegraph) get a gate that a comment cannot satisfy. | The verb layer, end to end | M | Q43 | loop |
| **Q45** | **V5 — seeded sim RNG + state-hash replay gate.** Live: **73 `Math.random()` across 21 files** in `frontend/src`; mulberry32 lives only in `captureMode`/`perfProbe`. Source: OI-17. (The doc says 107, then 72/20 — all three are stale; **re-measure, never quote**.) | A sim regression cannot be reproduced or bisected today, which is why Q40 has taken four passes. Ranks here because it is a prerequisite for cheap debugging of everything in LANE B, not for shipping it. | Reproducibility of every gameplay bug from here on | L | Q43 | loop |
| **Q46** | **`failOnFlakyTests` flip.** `playwright.config.js:16` is `retries: process.env.CI ? 2 : 0` with no `failOnFlakyTests`. Criterion: 10 consecutive completed CI runs on `main` reporting 0 flaky across all three shards; the counter is at **4 and frozen** because no CI has run on `main` since 2026-08-13. Source: OI-25. | Q06 restarts the accrual on the first push; `scripts/ci/flaky-report.mjs` already runs `if: always()` so the record accrues automatically. This row is a **watch**, not work — revisit when the count reaches 10. Do not flip early and do not relax the criterion. | Flake tolerance in CI | S | Q06 | loop (watch) |
| **Q47** | **R2 closure-var-mutated-inside-a-setState-updater sweep** (3 remaining `set[A-Z]*((prev` sites in `src/**/*.jsx`) — OI-29. **R3 `smoke.spec.js` canvas-detach race** — `tests/e2e/smoke.spec.js:15` `page.locator('canvas').first()` while **three** `<Canvas>` mounts exist (`GameScene.jsx:125`, `render/TitleDiorama.jsx:60`, `render/mascots/MascotStudio.jsx:75`); bind the game canvas explicitly, **do not widen the 60 s timeout** — OI-30. Also `smoke.spec.js:28` `expect(max - min).toBeGreaterThan(20)` over 0–255 luminance is an absolute unitless floor a sky-only frame passes (GATES.md offender #8). | Three small, precisely-located correctness fixes with runnable checks. The canvas-detach one is a genuine flake source feeding Q46's counter. | E2E stability; one latent React defect class | S | Q43 | loop |

### TIER 5 — debt, docs and the 6–12 month horizon

| ID | What | Why it ranks here | Blast radius | Size | Depends on | Decide |
|---|---|---|---|:-:|---|---|
| **Q48** | **Fix the 13 STALE DOC CLAIMS** in `GATES.md`/`OPEN-ITEMS.md` §G — STALE-01..13, plus `ACTIVE_PLAN.md:317` ("postprocessing is PINNED at 6.39.1 and cannot move", refuted by Q07) and `SOTA-INITIATIVE.md:69` ("last: 2026-06-18", OI-62). | *A stale doc is a LIVE TRAP that regenerates dead work* — `LOOP-CHARTER.md` §0-B.6, this repo's own words. Nineteen rows in the OI ledger were already closed and three had been re-listed as open for over a month. For `SOTA-INITIATIVE.md:69`, follow ROADMAP's precedent and **remove** the hand-typed stamp rather than re-stamping it: *"a date typed by hand at the top of a living file is a claim nothing checks."* | The next reader re-derives all of it otherwise | S | Q07 | loop |
| **Q49** | **Per-frame allocations, 3 of 4 sites live** (OI-42): `Components.jsx:1120` `new THREE.Vector3()` inside the movement branch; `render/MobModel.jsx:181` full-subtree `traverse()` per mob inside `useFrame`; `HUD.jsx:480` compass `container.innerHTML = markersHtml.join('')` inside an rAF loop (which also restarts the marker CSS animation). `Ocean.jsx:84` is fixed. | CHANGELOG's *"no per-frame allocs remain"* is an overclaim (STALE-10). The `innerHTML` one is also a visible defect, not just a GC one. Modest and well-located. | Frame-time consistency; one visible HUD glitch | S | Q06 | loop |
| **Q50** | **Perf-harness honesty (F2 / terrain S2).** The only recorded measurement — `memory/perf/m2-KZ-M3-Max-MacBook-1781111677559.json` (2026-06-10) — reports `medianMs: 16.6999999…`, **quantized to the 60 Hz vblank**, so the M2 budget is effectively a boolean. The C−B scenario delta structurally cancels the ocean/weather/spell VFX it claims to measure. Source: OI-43. | Success test is already written: **an A median that is not 16.7.** Every frame-cost figure in all five terrain documents is structural, not measured (OI-49 Q1), and this is the gate on measuring any of them — including Q18's MSAA question and Q20's cloud budget. | Every perf claim in the terrain corpus | M | Q18 | loop |
| **Q51** | **Terrain §5 — the six numbers nobody has measured** (OI-49). Q2 (Rapier trimesh BVH rebuild per streamed chunk and per mined block) is **S15's gate and Elemancer-v2's unpark condition**. Q3 live grass instance count (81×50 is a ceiling; measured 32/50/0 on three chunks). Q4 whether S11/S12 move a baseline at all. Q5 MSAA effectiveness. Q6 is **closed in part** (STALE-12: `Atmosphere.jsx:242` now sets `castShadow` unconditionally; Phase-C Batch 1 put shadows in ten baselines). | Unblocks Q19's S15 half and OI-57's Elemancer v2, which is parked behind the P4 no-mid-combat-re-mesh **HARD VETO** — do not unpark it without this number. | Two blocked features and every terrain perf argument | M | Q50 | loop |
| **Q52** | **Session-close ritual (G3).** `grep -n "session-close"` over `.agent/AGENTS.md` and `LOOP-KERNEL-PROMPT.md` → **zero hits**. Nothing refreshes the GitHub remote surfaces (README, description, CHANGELOG/STATUS) and pushes at session close. Source: OI-53. | This is the **proximate cause** of Q06 (two commits unpushed for 40 days) and OI-56 (three artifact pages 10 commits behind; `artifact-currency` has blocked two pushes in one session before, because "refresh at session close" let them reach 31 behind). Fixing the cause outranks re-fixing the instances. Also lands OI-51 (the `[MECH:]`/`[ADVISORY]` tag pass, stopped one-third done: LOOP-CHARTER 17 · LOOP-KERNEL-PROMPT 1 · AGENTS.md 0 — until a rule says whether it has an enforcer, *"no new floating TODO later"* is indistinguishable from a gate). | The mechanism that let 40 days of drift happen silently | S | Q06 | loop |
| **Q53** | **Verify the never-verified.** OI-54: the touch rings (X1/X2a/X2b) have only ever been SEEN CLOSED — `touch-probe.mjs` exercises them now, so this is one probe run plus Kevin's thumb. Carry the instrument lesson: `tapTestId` returns `dispatched=true` on non-zero size alone and **never checks the point it taps is occupied by the element it named** — that produced two wrong registry lines. OI-65: `oceanVisibleNear()` is unit-covered and `ocean-probe.mjs` took four COAST shots, but **no probe has ever taken a CAVE shot**, which is the case the gate exists for. OI-33: look at the FPV hands in the running game. | Three things asserted true that have never been observed true. Cheap now that the probes exist; each is a `[LANE B]`-style standalone. | Three live claims with no observation behind them | S | Q11, Q26 | loop → **KEVIN** (thumb) |
| **Q54** | **Close `quality.js TIERS.outlineWorldEdge`** — declared on all three tiers (`render/quality.js:20-22`, `low:false`/`med:false`/`high:true`), **read by nothing** in `src/**/*.jsx`; the only other mention is a comment in `character-render-gates.test.js:66`. Source: OI-63. Same commit: **close OI-61 (WebGPU/TSL) as WONTFIX** — `onBeforeCompile` is WebGLRenderer-only with four live sites (`OptimizedGrassSystem.jsx:18`, `render/Ocean.jsx:87`, `render/characterStyle.js:48`, `world/Terrain.jsx:166`) plus a WebGL postprocessing chain; a pipeline rewrite for a non-bottleneck. | **classify-before-delete**: trace the consumer graph, then wire or delete **with the reason stated in the commit**. Carrying WebGPU as a roadmap item with huge blast radius, when the terrain plan's own KILLED table already refuted it, is a trap for the next reader. | Two phantom capabilities on the roadmap | S | Q48 | loop (to close) |
| **Q55** | **eslint 10 blocker.** `eslint-plugin-react` last published 7.37.5 on **2025-04-03 (17.6 months)**; it is terminal on the registry and hard-blocks eslint 10. PR #7 was closed as unmergeable, exactly as `dependabot.yml` predicted. Source: R7. | The crash-class gate — `no-undef` / `react/jsx-no-undef`, the one that catches shipped-but-broken JSX — rides on this plugin. **Action now is a WATCH plus a spike**: evaluate `@eslint-react/eslint-plugin`, which is a rule-name migration, not a drop-in. Do not migrate on spec. | The one lint gate that catches a shipped crash | M | Q48 | loop (spike) → **KEVIN** (adopt) |
| **Q56** | **vitest 3 → 5 while the gate is still green.** GHSA-82fw-gwwq-j7x9 covers `>=2.1.0 <4.1.11`; installed 3.2.7; npm offers 5.0.1, which peers `vite ^6.4 \|\| ^7 \|\| ^8` — the installed vite 6.4.3 is **just inside**. Source: R9. | Only moderate today, so `--audit-level=high` ignores it. If it is ever re-scored high, the CI unit gate goes red and the only fix is a coordinated vitest + `@vitest/coverage-v8` **double major performed under a red build**. Do it deliberately now, cheaply. | The CI unit gate | M | Q41 | loop |
| **Q57** | **Bump all six GitHub Actions off `@v4`** (checkout v7.0.1, setup-node v7.0.0, upload-artifact v7.0.1). Node 20 runtime deprecation warnings are already in the logs; dependabot ignores **all** action majors so this never self-corrects. Read upload-artifact v4→v5 notes first — artifact semantics changed. Source: R10. | Deprecation becomes removal, and when the Node 20 action runtime retires, all three jobs fail at once with no code change — while the config that would have warned is the one suppressing it. One PR. | All CI, simultaneously, with no warning | S | Q06 | loop |
| **Q58** | **Make `npm ci` possible.** `ci.yml` runs `npm install --no-audit --no-fund` in both install steps because the lockfile is generated on macOS/arm64 and never records the linux-only napi optionals (`@emnapi/core`, `@emnapi/runtime`). Source: R11. | The lockfile-as-pin mechanism that Q02 leans on is weaker than it looks, and there is no supply-chain determinism on the runner that holds `GITHUB_TOKEN` — the same runner that executes the full dependency tree's lifecycle scripts. Generate the lockfile in a linux container (or commit both platform sets) and switch to `npm ci`. | Reproducibility of every CI result; supply-chain surface | M | Q57 | loop |
| **Q59** | **Node runtime alignment.** `engines: >=24.0.0 <25`; installed **v24.13.0** (8 patches behind v24.21.0); CI floats to `24` — **local and CI are not the same runtime**. Node 24 enters maintenance **2026-10-20 (28 days)**; Node 26 becomes active LTS 2026-10-28. | The range is current and stops being right in about a month. Pin CI to the same patch as local, then plan the 26 move as its own tranche. | Runtime drift between the two places code runs | S | Q57 | loop |
| **Q60** | **tailwind 3→4** (3.4.19 is the terminal `v3-lts` tag, carrying the `postcss-selector-parser` advisory — R8) and **lucide-react 0.439→1.x** (24 months, 0.x→1.x major; PR #9 closed — R12). **Watch `@react-three/rapier`** (R13): the exact pin on `@dimforge/rapier3d-compat@0.19.2` is correct today and becomes a trap the day the wrapper moves — the two must change in the **same commit** or `supply-chain.test.js` silently exercises a different engine than the app ships. | Tailwind 4 is a CSS-first config rewrite touching the PostCSS pipeline, not the game — scope it as its own tranche. lucide is now large enough that the bump is a **visual review of every icon**, so batch it with Q16 or Q20's baseline session. | Build pipeline; every icon in the UI | L | Q16, Q58 | **KEVIN** (schedule) |

### KEVIN DECISION BATCH — the 13, collected

Put these in `KEVIN-REVIEW-BATCH.md` as one pass. Nothing below blocks Q01–Q15.

| ID | Decision | Queue row | Note |
|---|---|---|---|
| OI-01 | **three r174** — take it for the GL fix, accepting a full reviewed re-baseline? | after Q07 | Kills the production GL storm 6→0 with a presence control. Cost: **19 of 31 frames over gate** and a visibly more saturated sky. **Peers are not the obstacle** — r174 sits ten minors below even today's 0.184.0 ceiling (0.186.0 with 6.39.5). The bill grows monthly and nothing reduces it. The only queue row an agent cannot close. |
| OI-03 | **Unpin `postprocessing`** | Q07 | Tied to OI-01. Re-ask after Q07 measures 6.39.5. |
| OI-22 | **Start Phase 26 sky** | Q20 | Needs a perf budget agreed **before** building. |
| OI-23 | **S4 multiplayer + monetization scope** | — | Servers, accounts, real money, legal. Hard line already recorded: no randomized gacha/lootboxes, COPPA, odds-disclosure-if-random. The loop will not start netcode or payments without his model. |
| OI-24 | **#44 the holistic playtest** | gates Q16, Q17, Q27, Q53 | **The perennial one, and it gates every taste sign-off below.** Spell look, movement feel, storm, audio mix (his ear), real-device touch. Schedule it against Q16's baseline batch so one sitting discharges the most rows. |
| OI-36 | **A boss ROAR audio asset** | Q29 | Inventing an audio asset is outside a loop slice. |
| OI-55 | **Touch HUD ergonomics at 390×844** | Q26 | Health/mana bars overlap the hotbar's left slots; top-right controls collide, one clipping off the right edge. The invariant to gate any fix is pure and cheap: *no two simultaneously-visible touch targets overlap, and every one is fully inside a 390×844 viewport.* |
| OI-67 | **Clip / photo-mode tooling** | — | Named by the project as a **commercial** blocker. |
| OI-68 | **Final taste sign-offs** — v7 spell look, the D art pass | after Q15, Q17 | Downstream of OI-24 and Q15. |
| OI-69 | **Ocean water aesthetic** | — | Per the 2026-08-08 audit, the **only genuinely-Kevin row** of the thirteen that queue carried. Pure taste; the coast is lived-verified clean; **nothing is blocked on it.** |
| OI-70 | **The eight remaining terrain taste calls** | Q14, Q18, Q19 | Grass density (stride 2→1, cap 150, hash-thinning for the bald +Z strip — note `grassTops` is structured-cloned, so 5× entries is 5× main-thread deserialize per chunk and `update_block` re-emits on every mined block) · blade silhouette (a tapered blade forks the bold-flat lock and needs `vertexColors: true`) · tint strength (recommend 35% luminance-preserving; ladder 25/35/50) · composer AA (Q18) · shadow box size after S10 (Q13) · `castShadow` on blades (recommend **keep off** — sub-texel blade → acne not contact shadow, and no `customDepthMaterial` exists so the shadow would be unswayed under a swaying blade) · per-face grass texture (two design locks, not one) · re-baseline batching (Q16, Q20). |
| OI-71 | **zh-CN content go/no-go** | behind Q61* | Correctly blocked. The toggle with English default is the decision of record. Mechanically healthy: `i18n-adoption` reports `_total: 0`, `i18n-dead-keys` 0. |
| OI-76 | **Post the #750 reply** | Q08 | The *filing* is already done — `ACTIVE_PLAN.md`'s "NEEDS KEVIN: filing this upstream" is STALE-08. |

*\* **OI-45**, the i18n id-decouple, is pure engineering and is the actual blocker on zh-CN content. `data/lootTables.js:6-8` still requires every `item` string to be a valid **display name**, and `useGameStore.jsx:640` keys `inventory.blocks` by whatever string it is handed. An `ITEMS` id registry + `NAME_TO_ID` + `getItemName(id)` exist (`data/items.js:56,107`) and `CraftingTable.jsx:168` was converted — so the refactor is **started, not done**. Slot it as a loop row between Q26 and Q43; it is M-sized and unblocks a Kevin decision, which is a good ratio.*

**Plus 7 loop rows that cannot close without his eye, ear or thumb** — OI-02 (act on the r174/sun pair), OI-33 (FPV viewmodel look → Q53), OI-37 (directional flinch feel → Q27), OI-44 (biome tint strength → Q14), OI-45 (zh-CN unblock), OI-48 (AO diagonal — three readings disagree, only the render settles it → Q19), OI-54 (the touch rings have never been seen OPEN → Q53).

### RECONCILED AGAINST TWO ON-RECORD CONSULT RECEIPTS

Two prior queue records surfaced while writing this file. Both are reconciled here rather than re-derived:

- **`Crafty audit queue` (2026-08-11)** — *"35 of 108 full-source audit findings closed; 73 open (8 HIGH,
  ~29 MEDIUM, ~36 LOW). 33 of the open ones are PRODUCT DECISIONS batched in `KEVIN-REVIEW-BATCH.md`, not
  bugs — do not decide them autonomously."* **The count is superseded**: `OPEN-ITEMS.md` re-checked
  `AUDIT-2026-08-09-full-source.md` live and its DRAINED header records **all 108 findings closed** (OI-89,
  OI-90 are two of them, both verified fixed in code). **The instruction is not superseded and this queue
  honours it**: every product decision is routed to the *Kevin Decision Batch* above (13 decisions + 7
  eye/ear/thumb rows) and none is decided here. Note the coincidence trap — "73 open" appears in both that
  2026-08-11 record and in `OPEN-ITEMS.md`'s 2026-09-22 count of **73 still-open OI rows**. They are
  different populations that happen to share a number; do not treat one as confirming the other.
- **`Crafty A-bis queue` (2026-08-05)** — the 18-domain review (91 confirmed bugs across 8 root seams) is
  **CLOSED for loop-actionable work**; B1–B8 complete; what remained was Kevin-gated only (the B5 HUD and
  B7 `mobile.png` re-baselines, plus 3 B8 taste items). Live state agrees and has moved further: the B5
  re-baseline was **DISCHARGED 2026-08-13** (OI-83) and `043dcdb0` re-shot the whole baseline set including
  `mobile.png`. **Do not re-mine the A-bis block for work** — the three B8 taste items are already carried
  in the Kevin batch above, and the B4 seam it names is closed (`game/mobLineOfSight.js`, OI-81).

### DELIBERATELY NOT IN THE QUEUE — settled, do not re-propose

`OI-92` coherence CUT-gate (parked by design; its own bound #1 makes it inadmissible until a blind calibration scores 100% on must-NOT-cut negatives — and the governing consequence stands: *the pillars govern what to BUILD; they may NOT authorize deletions*) · `OI-93` move the visual gate to CI / Playwright capture / another engine (17 candidates, 16 ruled out; `pixelmatch`'s `windowSize` is documented on main and exists in **no** published version; the one carve-out, a Linux A-vs-B job, was separately declined 2026-08-09) · `OI-94` `--deterministic-mode` / `--font-render-hinting=none` (verified absent from the actual framework with a presence control: 0 exact-line hits, while `use-angle`/`disable-gpu`/`headless` return 1/1/4 — they ship only in `chrome-headless-shell`) · `OI-95` the dpr "2.7×" claim (obsolete as a magnitude anchor: `calculateDpr([1,2])` in installed R3F 9.5.0 resolves identically to `1` because `capture.mjs:197` sets no `deviceScaleFactor`; the change itself may stay) · `OI-96` Phase-C conversion Batches 2/4/5/6 (a decision, not a punt — they move ~0 pixels the 6% gate can resolve; revisit only after Q39's per-frame tolerances exist) · **19 rows in `OPEN-ITEMS.md` §D that are already DONE** — do not re-open them.

---

## B. THE 5 THINGS THAT WOULD MOST CHANGE HOW CRAFTY LOOKS

Ordered by visible change per unit of work, against what the codebase already has.

### B1 — Give the sun an arc. The math already exists and nothing reads it. `[Q12 + Q13]`

**This is the biggest one and it is mostly already written.**

- `src/game/dayPhase.js:28` — `cycleFraction(gameTime)` returns `0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight`. Its own comment says it *"drives the day-phase dial's sun/moon orbit angle."*
- `grep -rn cycleFraction frontend/src` → **the only references are inside `dayPhase.js` itself.** `dayPhase()` is consumed at `HUD.jsx:81` and `:96`, and nowhere else.
- Meanwhile `src/render/mood.js:17-19` holds `sunPos` as **three fixed constants**: `explore [-55,48,-52]`, `dusk [-30,40,-50]`, `obsidian [-50,30,-50]`.
- `moodTarget()` (`mood.js:91-94`) takes `isDay` as a **boolean** and returns `Math.max(night, dangerLevel, weatherBoost)` — so "night falls" is a target snap smoothed by a lerp, not a sun setting.

The consequence, stated plainly: **the HUD dial shows a sun travelling from dawn to noon to dusk while the sun in the sky does not move.** The game contradicts its own instrument.

The fix is small because every consumer is already pointed at the right variable. Three sites read `m.sunPos` and all of them follow for free:

| Site | What follows |
|---|---|
| `render/Sun.jsx:18` | the sun billboard's position — and therefore **the GodRays shaft angle**, since `GameScene.jsx:279` passes this exact mesh as `sun={sunMesh}` |
| `render/Atmosphere.jsx:196` | the skydome's `sunDir` uniform — the glow lobe moves with the disc |
| `render/Atmosphere.jsx:207` | `sunRef.current.position` — **the directional light, which is the `castShadow` light**. Shadows sweep for free. |

**Correction to OI-46's evidence, which matters here.** `OPEN-ITEMS.md` cites `render/Atmosphere.jsx:244` as hard-coding `position={[50, 100, 50]}`. That literal is the JSX **initial** value on the single `<directionalLight ref={sunRef}>`; `useFrame` overwrites `sunRef.current.position` from `m.sunPos` on every frame (`Atmosphere.jsx:207`). It is dead after frame one. The inline comment nearby — *"the light position is a constant"* — is true only because `sunPos` is a per-mood constant, not because of that literal. So the shadow direction **already tracks the mood sun**; it simply has nowhere to go.

**What makes this a two-row job, not one.** Once the sun moves, `GameScene.jsx:116-126`'s static ±100 shadow box becomes visibly wrong: grazing dawn/dusk light needs a longer, player-re-centred frustum or shadows clip mid-world. That is exactly terrain **S10 / OI-46**, which is why Q13 is a **hard dependency of Q12**, not a sibling. The lanes listed them as unrelated rows.

**Capture safety** — non-negotiable per `AGENTS.md`: *"a capture guard must RESET to a declared value, never early-`return`."* The solar angle must be pinned to a **declared constant** in `isCaptureMode()`, not frozen wherever the clock happened to be, or every frame becomes run-dependent.

**Second-order payoffs.** OI-02 (*"does r174 fix the SUN?"*) is currently **unanswerable as posed** because `explore-day` shows no sun disc at that camera angle in either build — with an arc, there is a phase where the disc is framed, and the question becomes measurable. OI-35's dawn/dusk payoff spike (`grep dawnPayoff\|duskSpike\|dawnBeat` → zero hits) becomes buildable rather than notional; its sibling beat already shipped (`game/bossEntrance.js`: 220 ms freeze + 650 ms bloom swell + 1.4 shake, capture-suppressed) so the pattern is proven.

### B2 — Make the ten biomes look like ten biomes. `[Q14]`

`src/world/biomeTable.js:38-49` declares a `tint` on **all ten** biomes — `snow #eaf3ff`, `taiga #9fb89a`, `plains #8fb45a`, `forest #5e8c3a`, `meadow #a6c763`, `swamp #6b7d49`, `jungle #3fae46`, `savanna #c2b466`, `desert #dccf8a`, `mesa #b06a3c`.

A repo-wide grep finds **no consumer**. And six of them share `surfaceBlock: 1` — taiga, plains, forest, meadow, jungle, savanna — so **six of ten biomes render pixel-identical at ground level.** Kevin's own recorded question was *"how do different biomes appear?"* Today: four of them do.

The seam is already open. `world/Terrain.jsx:53-145` already patches both shaders via `onBeforeCompile`, already carries a per-vertex `aAO` attribute (`:204`) baked by the mesher, and `world/mesher.js:235-238` already writes a 3-wide `color` attribute whose `.g`/`.b` channels are documented as **unused** — the comment says they are kept 3-wide only so the shader's `attribute vec3 color` read is unchanged. There is a free channel sitting in the geometry.

So this is: emit a biome id (or the tint directly) into the unused channels in `terrain.worker.js`, and one `mix()` in the fragment shader next to the existing AO multiply at `Terrain.jsx:145`. **Tint strength is Kevin's** — recommend the `TERRAIN-GRASS-SOTA-PLAN.md` ladder at 25/35/50, defaulting to 35% luminance-preserving so the bold-flat lock survives.

Note the grass already does per-blade tinting (`OptimizedGrassSystem.jsx:236` `bladeTint(x, z)`), so the blades and the ground they grow from will disagree until both read the biome. Do them in the same commit.

### B3 — Stop the boss glowing through its own armour. `[Q15]`

`src/render/BossEntity.jsx:479-481`:

```js
const bodyColor     = isFlashing ? "#ef4444" : "#111029";   // correct obsidian
const bodyEmissive  = isFlashing ? "#ef4444" : phase.color; // floods the whole torso
const emissiveIntensityVal = isFlashing ? 3.0 : (bossPhase === 2 ? 2.2 : (bossPhase === 1 ? 1.5 : 0.8));
```

The torso is a `<boxGeometry args={[3, 2, 4]} />` with `roughness={0.15} metalness={0.9}` — a beautiful obsidian setup — and then an emissive at 0.8→2.2 washes every bit of it out. The result reads as a flat purple box: **cheaper-looking than the trash mobs, and it is the payoff of the entire run.**

**Do not "fix" `bodyColor`.** The obsidian is right. Move `phase.color` off the torso and onto detail that can carry it: the eyes (already phase-aware at `:482`), wing membranes, vent seams between plates, and a fresnel rim — the rim machinery already exists at `render/characterStyle.js:10` (`RIM = { color:'#bfe2ff', power:2.5, strength:0.35 }`) and at `MobToonMaterial`'s `rimStrength`. A phase-coloured rim on obsidian reads as *heated*; a phase-coloured emissive on obsidian reads as *plastic*.

Kevin **de-gated art on 2026-07-13**, so this is loop work today, not a review item.

### B4 — Make ambient occlusion read as shadow, not as dirt. `[Q19]`

`world/Terrain.jsx:145` is the whole AO term:

```glsl
diffuseColor.rgb *= mix(0.55, 1.0, clamp(vAO / 3.0, 0.0, 1.0));
```

A flat grey multiply. Real contact shadow is not grey — it is lit by the sky, so it is **blue in daylight and warm at dusk**. That is terrain **S11 (sky-coloured AO)** and it costs one uniform: `mix(skyMid * 0.55, vec3(1.0), vAO/3.0)`, and `skyMid` is already mood-driven and already uploaded to the skydome (`Atmosphere.jsx:193`). Combined with B1, AO would shift colour across the day for free.

Three more from the same plan, all still unimplemented (OI-47):

- **S12 macro-octave de-tile** — `world/detile.js` exists (760 bytes) and is the classic cure for the repeating-texture tell that reads as "procedural" from thirty metres.
- **S14 unnormalized `Uint8` attributes** — a correctness bug in attribute upload.
- **S15 AO in the greedy merge key** — gated on the §5-Q2 trimesh-rebuild measurement (Q51) **and** needs `Uint32Array`: the current `Uint16Array(4096)` mask **silently truncates an 18-bit key**. That truncation is a latent mesh-corruption bug, not just a perf note.

And **S4, the AO-chosen quad diagonal** (OI-48): `world/mesher.js` has no diagonal-flip logic, so AO gradients break at the wrong angle on every quad with one dark corner. It is purely aesthetic — both windings stay CCW and no behavioural test distinguishes correct from inverted — which is why three readings disagree (§E4) and only looking at a high-contrast face settles it.

`TERRAIN-GRASS-SOTA-PLAN.md` Q4 warns S11/S12 may be **visible to the eye and invisible to the 6% gate**. That is a reason to put a human in front of the frame, not a reason to skip the work.

### B5 — Fix the two characters the player actually looks at. `[Q17]`

- **The player reads monstrous** (OI-32): `character-closeup.png` is a green box-man with **red eyes** — this game's own hostile marker — and **no arms**. It is the title diorama subject, the character card, and the third-person silhouette. Judge it by opening the PNG, not by reading the code.
- **The FPV hands have never been looked at** (OI-33): `render/playerRender.jsx:30-32` defines the glove tokens (`GLOVE_INK = '#2A2A33'`, outline + thickness), `:468-469` and `:493-494` build the meshes with `<Outlines>` — the art **exists**. `scripts/visual/hands-probe.mjs` exists. Nobody has ever run the probe and looked. This is the most-on-screen geometry in a first-person game and it is un-reviewed.

Both are cheap relative to how much screen time they get, and both are pure verification-then-tune rather than new systems.

**Honourable mention, not in the top 5:** the composer pays for both 8× MSAA and a full SMAA pass (`GameScene.jsx:294`, OI-70), and `multisampling` sits in the composer's `useMemo` deps — so wiring it to `qualityTier` rebuilds the **entire composer** on every `PerformanceMonitor` flip, i.e. precisely when FPS has already dipped. That is `[Q18]`: it does not change the look so much as pay for B1 and B4 on the constrained tiers.

---

## C. THE 5 THINGS THAT WOULD MOST CHANGE HOW CRAFTY PLAYS

> ### ⚠️ STATUS RE-VERIFIED LIVE 2026-09-22 — TWO OF THESE FIVE ARE ALREADY DONE
>
> Every row below was re-checked against the source, not against the prose. **C1 and C2 are SHIPPED.**
> A queue that points a future session at finished work is the stale-doc trap this repo names as a LIVE
> TRAP, and it costs a whole session to discover by reimplementing.
>
> | item | verdict | evidence |
> |---|---|---|
> | **C1** damage lockout | ✅ **DONE** | `useGameStore.jsx` has `damageLockouts: {}` keyed per attacker and `const key = sourceKey \|\| source`. `lastDamageTime` is deliberately KEPT as the hit SIGNAL the HUD and camera read — it is no longer the rate limiter. Wired end to end: `mobDamage.js` spreads all four args, `AIWorkerSystem.jsx:77` calls `damagePlayer(...damageArgsForAttack(attack))`. Callers passing no key fall back to `source`, so a pre-existing call site degrades to per-CLASS rather than silently losing its limit. |
> | **C2** LMB destroys chests | ✅ **DONE** | `verbRouter.js` `button === 0` now has `if (chestTargeted && chestHasItems) return 'interact'`, gated on HAS ITEMS so removing an empty chest you placed still works (§5-12 preserved). Wired: `Terrain.jsx:887/891` builds both flags (via the pure `chestState.chestHasItems`), `Components.jsx:490/491` passes them into the ctx, `:502` routes `'interact'` to `terrainVerbs.open(hit)`. |
> | **C3** boss second appearance | ❌ **STILL OPEN** | `grep -rn bossTier src` → **0 hits**, as the row claims. |
> | **C4** talent tree is not a choice | ❌ **STILL OPEN** | **18** node ids, **0** hits for `exclusive` or `capstone` in `talentTree.js`. The row's "`grep -rn respec` returns zero hits" is right, but be careful re-deriving it: a bare `respec` grep returns FOUR hits that are all the word "respect**s**" (prefers-reduced-motion, and a comment in `progression.js`). Substring, not implementation. |
> | **C5** five mobs share one movement | ❌ **STILL OPEN** | `ai.worker.js` still has exactly **two** typed arms, `skeleton` (:278) and `spider` (:299), as the row claims. |
>
> **The fabricated path is still in the C1 row below and is still fabricated.** It says
> "`game/damageSource.js` already exists, with tests". It does not exist — verified by `ls` —, and it is
> one of the four false verdicts that made the original one-shot audit's DELETE column unsafe and led to
> `gate-census.mjs` refusing to issue dispositions at all. The real fix used `sourceKey` on the existing
> `damagePlayer` signature and needed no new module. Left in place below, labelled, rather than silently
> edited: the row is evidence of how that audit failed.
>
> C1's row also asks for the fix to be "gated with a lived probe, not a unit test — a pack of three must
> measurably out-damage a single". **That gate does not exist.** The per-attacker keying is implemented
> and commented; nothing in the suite drives three attackers and compares total damage. That is the real
> remaining C1 work, and it is a test, not a feature.


### C1 — Delete the 500 ms global damage lockout. `[Q21]`

`src/store/useGameStore.jsx:825`:

```js
if (now - state.lastDamageTime < 500) return;
```

`lastDamageTime` is **one number for the whole game**. A pack of six mobs, each swinging on its own cooldown, deals the damage of roughly one mob.

This single line silently deletes the entire threat model above it: the night siege, `world/SquadAISystem.jsx`, `game/squadAI.js`, and every distinction `game/mobArchetypes.js` draws — the duskhound designed as a *pack hunter* whose "threat is being found and worried at", the skitterling designed as *swarm chip damage* — all collapse to the same DPS, because the second and third and sixth attacker are free. It is the highest gameplay value per line changed anywhere in this repo.

Fix: key the lockout per damage **source** (`game/damageSource.js` already exists, with tests), keeping a short global floor so simultaneous hits still feel like one impact rather than a stutter. Gate it with a lived probe, not a unit test — a pack of three must measurably out-damage a single. It was already re-assigned `[LOOP]` on 2026-08-08.

### C2 — Stop LMB destroying chests. `[Q22]`

`src/input/verbRouter.js:35-42` — the `button === 0` ladder is `held → attack`, `meleeHit → attack`, `aimedMobDist <= terrainDist → attack`, `terrainDist < Infinity → mine`. **There is no `chestTargeted` branch.** Only `button === 2` (`:45`) returns `'interact'`.

So left-clicking a chest **mines it and loses its stored inventory.** This is data loss, not a balance question — which is the exact reasoning under which it was re-assigned `[LOOP]` on 2026-08-08. Option (a), LMB opens, is the only branch that cannot destroy player property.

Carry the caveat the audit recorded: `tests/gates/verb-router-gates.test.js` §5-12 explicitly pins LMB→mine as existing cleanup, so **that test moves with the fix** — and moving it is itself a `Mutation-Proof:` commit under the Q31 regime.

### C3 — Give the boss a second appearance. `[Q23]`

`grep -rn "bossTier" frontend/src` → **zero hits.** The boss is a one-shot L5 event, and the project's own documents call a recurring apex threat *"the single highest retention lever."*

Everything needed is already built: `world/bossSystem.js`, `game/bossConfig.js` (phases with per-phase colour and intensity), `game/bossPersistence.js`, `game/bossEntrance.js` (the shipped 220 ms freeze + bloom swell + shake beat), `game/bossKill.js`, `world/blightHeart.js` + the lair relocation, and the compass marker. A tier dimension over that machinery — scaling stats, a new phase, a new lair, a reason to be stronger — is a data-and-progression change, not a new system.

Sequence it **after** B3/Q15: a boss worth fighting twice has to look worth fighting once.

### C4 — Make the talent tree a choice. `[Q24]`

`src/game/talentTree.js` is **18 nodes** across four aspects. Fifteen add a flat number to one of four stats. Four are effect-less unlocks (`voidhand_grasp`, `wildheart_roar`, `soulbind_snare`, `elemancer_imbue`) plus `soulbind_pack` (+1 squad slot) and `wildheart_endurance` (+3s per rank). There are **no capstones, no mutually-exclusive picks, and no respec** — `grep -rn "respec" frontend/src` returns zero hits in talent code.

The tree drains by L18. Stated precisely: *with 18 nodes that all add a number, there is no build to choose, so there is no build to come back and try differently.* That is the whole second-run problem in one sentence.

The mechanism to fix it already exists four times over. The effect-less-unlock pattern — a node the stat-fold **skips**, whose rank is read at its own call site — is exactly how a capstone works. Exclusivity is one field on the node consumed in the same fold (`getEffectiveAttributes`, which the comment correctly describes as *derive, never bake*, so every solver and `deriveMaxStats` picks it up free). Add: one capstone per aspect, one either/or pair per aspect, and a respec that refunds to the existing stale-id migration path the file already implements.

### C5 — Give five mobs their own movement. `[Q25]`

`src/workers/ai.worker.js:278` (`else if (type === 'skeleton')` — archery, maintain tactical range) and `:299` (`else if (type === 'spider')` — leap/charge) are still the **only two arms** besides beeline-and-bonk. Of seven hostiles, **five** — zombie, skitterling, duskhound, moss_brute, emberhusk — are the same creature wearing different meshes.

`game/mobArchetypes.js` did the first half honestly: it moved the *numbers* per type (aggro radius, leash multiplier, melee reach, attack cooldown, vertical reach) into a data table, live at `ai.worker.js:192`, with a safety property that makes it shippable — **a type with no entry reproduces today's numbers exactly**, asserted per-constant in `mobArchetypes.test.js`. What it did not move is *movement*. Its own docblock names the next slice: *a brute that shoulders through, a hound that flanks.*

`game/mobSteering.js`, `game/mobSenses.js` and `game/mobWander.js` all exist as pure, tested modules. This is a third and fourth arm in a worker whose two existing arms are the template, gated by pure unit tests plus one lived probe.

**Runner-up, and cheaper than all five:** OI-31's four authorized control enhancements `[Q26]`, two of which are pure display of things that already exist — the **verb-telegraph reticle** (`routeMouseVerb(button, ctx)` is already exported, pure, and already computes the answer; the reticle just renders what it predicts) and the **persistent control legend** (today an 8-second auto-fade in `HUD.jsx` — *literally the undiscoverability bug the spec names*). Kevin picked Option A on 2026-06-28; the `[KEVIN-GATED]` tag on these was stale.

---

## D. WHAT TO DO FIRST

> **Close PR #18.**
>
> **First concrete step:**
> ```
> cd $REPO && gh pr close 18 --comment \
>   "Holding: 6.39.4 is the version measured on 2026-08-13 to stop GodRays compositing the sun \
>    (pmndrs/postprocessing#750). 6.39.5 ships the fix and is now latest — reopening against 6.39.5 \
>    once it is verified locally against the GodRays frames. CI cannot see this: the 31-frame visual \
>    gate is in neither the pre-push hook nor ci.yml."
> ```
> Then, in the same sitting, Q02 (two lines in `dependabot.yml` + pin the manifest) so it does not come back on 2026-10-01.

**Why this and not something bigger.**

Kevin named looks as of utmost importance. PR #18 is the only row in this entire queue where *the thing he named* can get worse while everyone is busy improving it — and it takes one click by anyone, including an automation, including him. It is open, it is **8/8 green**, and every one of those green ticks is a true statement about a build whose sky has no sun in it, because the 31-frame visual gate is deliberately in neither the pre-push hook nor `ci.yml`. Vercel deploys from this repo, so the merge is not just a commit; it is a publication.

It is not literally irreversible — a revert is cheap. What is not cheap is the interval: nothing in CI would report it, so the regression would be discovered by Kevin opening the demo, which is the worst available detector.

Cost: one command. Risk: zero; if Q07 shows 6.39.5 is good, the bump returns immediately and better.

**And it is the right first move for a second reason.** It is the cheapest possible demonstration of the pattern that FUTUREPROOF correctly names as the shape of this whole campaign: *a control that was correct when it was written, and whose correctness was never re-measured.* The `postprocessing` ignore rule was right for the hazard visible that week. The audit gate measured clean on 2026-08-12 and has not looked since. `ACTIVE_PLAN.md:317` records a pin that upstream released two weeks ago. **None of these failed — they were each correct once, and nothing re-asked.** Q01–Q07 are, in order, the seven re-asks. Doing them first costs an hour and changes what every later measurement in this campaign is measured against.

**What to do in the same session, in order:** Q01 → Q02 → Q03 (`npm audit fix`, before any push, or the campaign's first push reds on js-yaml) → Q04 (nine-day deadline) → Q05 → Q06 (push; this restarts CI, which has not run on `main` in 40 days, and makes the trailer hooks reproducible) → Q07 (measure 6.39.5 — the single highest-leverage experiment here). Then fork: LANE A at Q09, LANE B at Q21.

---

## E. WHERE THE LANES DISAGREED, OR LEFT IT INCONCLUSIVE

Named explicitly, because each of these is a place where acting on one lane's number would be acting on a contested one.

### E1 — The test-corpus denominator is wrong in the lane that exists to count it. **92 files unenumerated.**

`GATES.md` opens by correcting the brief: *"Real denominator is **405** check files, not 375"* — A 181 · B 18 · C 20 · D 21 · E 29 · F 1 · G 135. I re-ran the census:

```
$ find frontend/tests -name '*.test.js*' | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn
 181 tests/gates      32 tests/store      18 tests/scripts    16 tests/world
  11 tests/integration 10 tests/data        7 tests/game        4 tests/theme
   3 tests/render       3 tests/i18n        2 tests/ui          1 tests/visual
   1 tests/unit         1 tests/devtest     1 tests/audio       1 tests/
```

292 total. GATES.md's groups cover `tests/gates` (181) + `tests/scripts` (18) + `tests/visual` (1) = **200**. The e2e specs are `.spec.js` and counted separately as C. That leaves **92 test files — `tests/store` 32, `tests/world` 16, `tests/integration` 11, `tests/data` 10, `tests/game` 7, `tests/theme` 4, `tests/render` 3, `tests/i18n` 3, `tests/ui` 2, and five singletons — enumerated by no group at all.**

The real denominator is **497**, not 405. `GATES.md` made the same omission it opens by correcting, one group over.

**And the omission is not random.** I sampled them: `tests/store/beastForm.test.js` imports `useGameStore` and drives it through every exit path asserting a NO-PERMANENT-BEAST invariant; `tests/integration/` holds eleven files driving crafting escrow, inventory equip/consume, esc-resume recovery and spell-upgrade talents. These are **behavioural tests against real seams** — structurally the *opposite* of the source-grep population, and plausibly the highest-provenance group in the repo.

So the headline figures — *"tier 3 = 244 (60%)"*, *"at most 82/405 (20%) have a dedicated killability receipt"*, *"provenance × killability = 0 for half the suite"* — are computed over a population that **excludes the tier-1/2-richest group by construction**. They are the right shape and the wrong magnitude, and they are biased pessimistic.

**Action:** before Q31 ships its denominator line, classify the 92 and re-derive. Q31's printed line should read `N/497`, and if it reads `N/405` the ratchet will encode the same blind spot permanently.

### E2 — The two lanes contradict each other on `postprocessing`, and one is demonstrably wrong.

- `OPEN-ITEMS.md` **OI-03**: *"6.39.4 is still upstream `latest`, so there is no newer release to take."*
- `FUTUREPROOF.md` **R6**: #750 closed 2026-09-09, *"Should be fixed in v6.39.5"*, 6.39.5 published 27 minutes later.

Same day, same repo, opposite facts. I checked: `npm view postprocessing version` → **6.39.5**; `npm view postprocessing@6.39.5 peerDependencies` → `three: '>= 0.168.0 < 0.187.0'`. **R6 is right and OI-03 is wrong.**

It matters because OI-03's wrongness is load-bearing: it is what makes the pin read as permanent, and "there is nothing newer to take" is the sentence that stops anyone looking. Fix OI-03 in the ledger as part of Q48.

### E3 — Nobody has measured whether 6.39.5 actually restores the sun.

Upstream said *"should be fixed."* That is a maintainer's expectation, not a measurement, and this project's own ablation (blue-channel at y=4, x=95..165, both spell frames) is the instrument that would settle it. **Q07 is an experiment with an unknown result, and the queue should not be read as assuming it passes.** If it fails, OI-01/OI-03 stay exactly where they are and Q20 stays blocked.

### E4 — `OI-48`, the AO quad diagonal: three readings, no tiebreaker.

The lane is honest about this and it stays unresolved. `TERRAIN-GRASS-SOTA-PLAN.md` says flip *"when the current diagonal is the brighter one"*; working the concrete case (one dark corner, three light: `a0+a2 = 3` vs `a1+a3 = 6`) says flip when it is the **darker** pair; the canonical voxel formulation reads a third way. It is purely aesthetic — both windings stay CCW and **no behavioural test distinguishes correct from inverted** — so the only verification is looking at a face with strong AO contrast. Its recorded unblock condition is now satisfied, so it is workable; it is not decidable from source.

### E5 — `needStable = 5` is a hypothesis whose one trial wedged.

OI-10: parked at 2, measured cost of raising it ≈ 0 (57.2 s/frame vs 57.6 s/frame), and `waitForStableTerrain` already demands six consecutive polls for the same reason. But the single trial **wedged**, so the evidence for 5 is an argument from a sibling, not a result. Q09 is the likely reason it wedged; do Q09 first and treat Q10's outcome as genuinely unknown until a pair completes.

### E6 — Two measurements of `explore-day` that the ledger never reconciles.

- **OI-01**: under r174, *"`explore-day` 99.70% local vs a 9.30% ceiling"*.
- **OI-09**: `_ungateable: {observed 0.3035, wouldFreezeAt 0.547, kept 0.093}`, with two samples at 5.13% and 30.35% **on the same code**.

Different instruments, different quantities, same frame name, no stated relationship. Since `explore-day` is the primary daylight frame every LOOKS verdict is read through, **do not quote either number as "the explore-day variance" until Q09/Q11 produce a clean pair.** `OPEN-ITEMS.md` §H says it exactly: *"A pixel percentage is not a diagnosis. It cannot distinguish 'the renderer changed' from 'the scene did.'"*

### E7 — Two incompatible classifications of the gate corpus, neither reconciled.

- `OI-14` / `plans/2026-08-11-crafty-v1-gate-corpus.md`: **115 files** → MIXED 82 · VACUOUS 20 · STRUCTURAL-CORRECT 8 · BRITTLE 5.
- `GATES.md` §A: **181 files** → KEEP 50 · CONVERT 51 · ENHANCE 56 · DELETE 24.

Different denominators (115 vs 181), different taxonomies, no crosswalk. **Which one authorizes the 24 deletions in Q33?** They must be reconciled before anything is deleted, or a file classified STRUCTURAL-CORRECT in one pass gets deleted by the other. Recommend: GATES.md's taxonomy governs (it is current and enumerates the full 181), with each DELETE row cross-checked against the V1 classification, and disagreements resolved by reading the file rather than by picking a lane.

### E8 — Every killability verdict in `GATES.md` is inferred, and the lane says so.

`GATES.md` §R7: the audit **never ran the suite and performed no mutation.** Every killability claim comes from an author's sentence in a commit trailer, or from its absence. The per-row tier/target/verdict columns are mechanical and **have no positive control of their own.**

Applied honestly, that means: *"at most 82/405 have a dedicated receipt"* is a statement about what **commit messages record**, not about what **tests catch**. A gate with no trailer may kill perfectly; a gate with a trailer may have been proven against a mutation that did not reproduce the defect's shape (`OPEN-ITEMS.md` §H: *five mutations stayed green in the 108-finding drain and every one was a defect in the test*). The 2026-08-27 same-variable rule applies directly — the evidence shows *our method found no receipt*, which is not the same claim as *no killability exists*. Q31 is the row that converts the inference into a measurement; until it ships, treat the 20% as an upper bound on **documented** killability and as no bound at all on actual killability.

### E9 — `Math.random()` counts disagree across four surfaces.

`memory/STATUS.md` says 107, then 72/20. `.agent/AGENTS.md:149` says 72 (and 127 `isCaptureMode()` guards). `OI-17` measures 73 across 21 files. `OI-64` measures 73/21 and 130/58. The lane's own instruction is the right one: **re-measure, never quote** — which is precisely what Q41 (generate the counts in `measure.mjs`, let `doc-currency` enforce them) exists to make permanent.

### E10 — Left open by every lane, and worth naming: nobody has measured what a Crafty session feels like.

`OI-24` (#44, the holistic playtest) is described as *"the perennial one"* and *"it gates every taste sign-off."* Seven further loop rows cannot close without Kevin's eye, ear or thumb. And `AGENTS.md` records that the gated visual frames *"depict a build with weather, mob AI, NPC routines, particles and spawning disabled — a version nobody plays, and one structurally incapable of regressing anything that only manifests in motion."*

So: the visual oracle photographs a build nobody plays, the e2e suite fires a real key in **1 of 20** specs, and the one instrument that would cover the gap — a live session with a human in it — has never been scheduled. **Every LOOKS and GAMEPLAY verdict in this queue is provisional on that.** Schedule OI-24 against the Q16 baseline batch; it is the single appointment that discharges the most rows.

---

*Every file:line, count, version and PR state cited in this document was either read live from the working tree on 2026-09-22, or is attributed to the lane that measured it. The table at the top of this file lists what I re-verified myself rather than inherited.*

---

## L1 — DIAGNOSED 2026-09-22. It is NOT the ambient floor, and it does NOT reproduce in capture mode.

**Two controlled experiments, `scripts/visual/ambient-floor-probe.mjs` (new, port 4236). Both results
are negative, and both are worth more than the tuning they prevented.**

**1. Raising the ambient floor is NOT the fix.** Tripling `explore.ambientIntensity` from the shipped
0.90 to 2.80 moved the dark/lit RATIO by **1.07x** — both regions lifted together. Ambient is a global
exposure here: the scene washes out and the hole stays a hole relative to its surroundings. Reporting
only the dark patch's value would have made every step look like progress, which is exactly how a
tuning session talks itself into shipping a washed-out scene. **Do not bump ambient on this evidence.**

**2. THE SUBJECT DOES NOT EXIST IN CAPTURE MODE.** After the probe was corrected to DERIVE its regions
from the frame rather than inherit them, it refused to report: the darkest WORLD tile in a capture-mode
frame at `setTimeOfDay(0.3)` reads **44.4**, well above the near-black threshold. That is a legitimately
dark material, not a hole. The luminance-13.7 tile found on a first pass turned out to sit inside the
MINIMAP rect — UI, which does not respond to ambient at all and would also have been a dead control.

So the near-black surfaces measured at rgb(16,3,40) live in the LIVE-GAME frames (hands-probe, and the
godrays A-frames) and not in the deterministic harness. **Which means the visual gate could never have
caught L1, and still cannot.** That is the same structural gap as the FPV hands being `!inCapture`: the
capture corpus is not a sample of what the player sees, it is a sample of a build with 127 things
switched off.

**What is still unknown, stated precisely.** Whether the live-only darkness is (a) something capture
suppresses — weather, a light, a post pass — or (b) specific to that camera position and those
particular structures. Nothing here distinguishes them. The next step is a LIVE-mode version of this
same ladder, which the probe can do by skipping `enterCapture`, at the cost of comparing frames that
are no longer deterministic — which is precisely the trade the godrays probe had to reason about.

**Two corrections recorded rather than quietly fixed**, because both are instances of classes this
estate keeps paying for:
- The first version hardcoded its DARK rect from a different probe's frames. It landed on a patch
  reading 73.9 and produced a confident ratio about pixels that were never the subject — an input the
  assertion read and never set.
- The control has to be a well-lit WORLD tile. "The brightest tile on screen" selected the quests
  PANEL, and UI is unaffected by ambient, so it would have shown zero lift and made every world change
  look like a dramatic improvement in the ratio.

---

## L1 (original observation, kept for provenance)


Observed while looking at `/tmp/crafty-godrays/A1-godrays-on.png` (tier high, `setTimeOfDay(0.3)`,
sun above horizon). The structures nearest the camera — the same buildings that read brown and red in
`/tmp/crafty-grass/grass-ground.png` at midday — render as large flat near-black navy slabs, losing all
material identity. On a LOCKED bold-flat art direction, a surface that goes to near-black stops reading
as a material at all and reads as a hole.

**This is an observation from ONE frame at ONE time of day with GodRays raising scene contrast. It is
not a diagnosis and must not be treated as one.** Three candidate causes, untested:
1. the ambient/hemisphere light floor is too low, so faces with no direct sun fall off a cliff;
2. the mood colour-grade (`MoodGradeDriver` lerps saturation/brightness/contrast per mood) crushing
   shadows at that mood;
3. GodRays' own blend darkening non-source regions — cheap to rule out, the probe already captures the
   matching `B-godrays-off.png`.

**First step is (3), because the evidence already exists:** diff the same region between
`A1-godrays-on.png` and `B-godrays-off.png`. If the slabs are equally dark in B, GodRays is exonerated
and the cause is lighting or grade.

**Then measure before tuning.** Sample the actual pixel luminance of a known material (a plank wall) at
several `timeOfDay` values and find where it falls off; a "raise the ambient a bit" edit with no
before/after number is the shape this repo keeps paying for.

---

## B5 partial — THE FPV HANDS, MEASURED 2026-09-22. They render, they are huge, and they are a black hole.

`scripts/visual/hands-probe.mjs` existed and, per B5's own note, had never been run. It has now been run
and the frames opened. Three findings, all measured, none of them what I expected to find.

**1. The hands ARE on screen, and they are large.** Established with a presence control rather than by
looking: `GLOVE_INK` was temporarily set to magenta and the probe re-run, giving **11,043 magenta pixels
in a bounding box of x 338-1239, y 427-799** — roughly the whole lower third of a 1280x800 frame. The
source was restored byte-identical. (Before that control I had looked at the real frame and concluded
the hands were absent, which was wrong; a diff of idle-vs-swing was also useless because the probe moves
the camera between shots, so the changed bbox was the entire frame.)

**2. They render at luminance ~10 — a black hole where the gloves should be.** `GLOVE_INK` is `#2A2A33`
= rgb(42,42,51), and under the scene's lighting the rendered pixels sample at **(16,3,40)** and
**(1,15,43)**. For scale, the ground beside them is **(74,94,108)**. Adjacent surfaces therefore span a
**9x luminance range**, and the dark end has lost all material identity — it does not read as a dark
glove, it reads as a hole in the frame. Note the green channel collapsing to 3 and 15 while blue holds
near 40: these surfaces are lit almost entirely by the blue sky term with essentially no sun
contribution.

**This is the same defect as L1, on a different subject.** L1 recorded near-camera structures going
near-black at a low sun. Same mechanism: a dark base colour plus a lighting floor that does not hold it
up. Treating either one by tuning that one material is fixing the instance; the class is the floor.

**3. THE VISUAL GATE CAN NEVER SEE THEM, BY CONSTRUCTION.** `Components.jsx:1372` mounts them as
`{!inCapture && <StableMagicHands ... />}`. Capture mode suppresses the hands outright, so not one of
the 31 gated frames contains the most-on-screen geometry in a first-person game. That is why "nobody has
ever looked" — there was no instrument that could, and the one probe that could had never been run.
It also means a hands regression is invisible to every automated check in this repo, permanently.

**What is NOT done, and why.** Choosing the replacement glove value is a taste call on a LOCKED art
direction, and the value ladder I started measuring (`#2A2A33` vs `#45454F` vs `#5C5C68`, rendered
luminance in the glove bbox) did not complete. The instrument is straightforward — patch the token,
re-run the probe, sample the measured bbox, restore — and `grass-swatch-probe.mjs` is the committed
precedent for exactly this shape. **Do not pick a value without rendering it:** the collapse from
rgb(42,42,51) to (16,3,40) is a ~4x drop that no amount of reading the hex predicts.

**Ordering note:** if the lighting floor (L1) is fixed first, the glove value may need no change at all.
Measure the hands AFTER any ambient change, not before, or the tuning will be against a moving target.

---

## G1 — `gate-shape.mjs` cannot see the assertion form that fooled it (found 2026-09-22, FIXED)

**FIXED 2026-09-22.** The collector now reads all four presence forms (`toMatch`, `expect(/re/.test(src)).toBe(true)`,
`toContain('s')`, `expect(src.includes('s')).toBe(true)`) with polarity honoured in each, and prints a per-form
denominator plus the counts it could NOT check. Planting the siege shape against a real comment-only token exposed
a second, older blind spot: a gate reading `resolve(__dirname, '../../src/...')` resolved to no target and was
skipped silently, so even `toMatch` reported nothing. Fixed too. Corpus re-run: **547 assertions checked (was 387,
+41%), 0 comment-satisfied**; 2 gates read non-JS files and are named as unchecked. `tests/scripts/gate-shape.test.js`,
7/7 mutants RED.

`gate-shape` exists to catch "an assertion satisfiable by a COMMENT alone". It blanks comments with a real
AST (so trailing comments are handled correctly) — but it only inspects `expect(x).toMatch(re)`
(`scripts/ci/gate-shape.mjs:187`, `n.callee.property?.name === 'toMatch'`).

The form `expect(/re/.test(src)).toBe(true)` is invisible to it. That is exactly how `siege-gates`
asserted `incrementNight()` into a file where it appears zero times in code, green on the comment
documenting its removal — and gate-shape reported the corpus clean throughout. Four comment-satisfied gates
were found by hand this session; gate-shape caught none of them.

**Fix:** teach the collector the second form (a `.test(` call on a regex literal whose argument is a
source read, inside `expect(...)` compared with `toBe(true)`), then re-run it over the corpus BEFORE
trusting its count. A detector that false-negatives gets widened, never exempted. Mutation-prove it by
reintroducing the siege-gates shape against a comment-only token.

**Related, also open:** 14 gate files still carry a local `strip` that removes only block and FULL-LINE
comments, not `code; // trailing`. `tests/gates/_srcWalk.js` has the fixed version; migrate them onto it.

## Tooling added 2026-09-22
`frontend/scripts/dev/mutate.sh` — the mutation runner, committed (it lived in a session scratchpad).
Exit 0 RED / 1 SURVIVED / 3 COULD NOT CHECK. Self-tested: all three exit codes, subject clean after each.

---

## R1 — INDEPENDENT CODE REVIEW OF THE 2026-09-22 SESSION (`673ecde8..a0af9d55`, high effort). FIX THESE FIRST.

Ten findings against work I shipped today. **The pattern matters more than any one row: my gates proved
properties of PURE FUNCTIONS, and the bugs live where those functions meet the running system.** The
shoulder-charge gate asserts the goal point is past the player — true, and the brute still oscillates,
because nothing latches the charge. Verify each row before fixing (a review is a claim, not a result);
then fix with a gate that drives the INTEGRATION, and mutation-prove it with `scripts/dev/mutate.sh`.

| # | sev | where | finding |
|---|---|---|---|
| R1.1 | ✅ FIXED (AO + biome in the greedy-merge key, 0fps diagonal flip; `mesher-merge-key-gates` checks AO exact at every top-face corner of 10 real-shaped chunks and biome under every quad cell, 7/7 mutants RED; same-renderer A/B in `evidence/mesher-ao-ab-*.png`) — was HIGH | `world/mesher.js:616` | Quad biome read from corner `c0`, which lies OUTSIDE the quad for top/+X/-X/-Z faces (a 1x1 grass top takes column (x,z+1)'s biome). The greedy merge key (`blockType|dir`) ignores biome, so one merged quad spanning a border gets one tint: borders snap to quad rectangles and the grass blades (per exact column) disagree with the ground at every border — the defect Q14 was meant to remove. Fix: biome into the merge key + sample the quad's own column. |
| R1.2 | ✅ FIXED (latched state machine brace→charge→recover; `game/mobStateSync.js` one round-trip list, which also closed a dropped `wanderRoll`; `mob-charge-loop-gates` drives the REAL worker across ticks, 6/6 non-equivalent mutants RED + 1 equivalent) — was HIGH | `game/mobMovement.js` shoulder | The charge is never LATCHED. The goal is recomputed every tick from the current vector, so it is a homing beeline that never arrives: sidestepping re-aims it, and past the player the vector flips — the brute oscillates across the player all fight and faces away half the time. Fix: latch the charge target at commit time; release on arrival/timeout. Gate it in the worker loop, not the pure fn. |
| R1.3 | ✅ FIXED (`ci/write-receipt.sh`, driven in a real temp repo by `tests/scripts/write-receipt.test.js`, 6/6 mutants RED) — was HIGH | `.githooks/pre-commit:68` | The pipeline tests the WORKING TREE but the receipt certifies `git write-tree` (the INDEX). With partial staging, a never-tested tree is certified and pre-push skips the offline core for it. Fix: refuse to write a receipt when `git diff --quiet` (unstaged changes) is false, or test a checkout of the index. |
| R1.4 | ✅ FIXED (respec clears beast form + held grab; the imbue SM disarms on `owned:false`; the squad cap is an every-tick invariant in SquadAISystem via `squadCapFor` + `releaseOverCap`; `respec-unwind-gates`, 10/10 mutants RED) — was MED | `store/useGameStore.jsx` respec | Respec refunds ranks but does not unwind state effect-less unlocks granted: a third ally from `soulbind_pack` stays (squadCap only gates NEW snares), active beast form / held grab continue. Free, repeatable exploit. |
| R1.5 | ✅ FIXED `f4515dd9` (tint only on grass/dirt/sand/snow/leaves via a per-layer mask MIXED into the multiply; `world/terrainTint.js` generates the GLSL, `terrain-tint-gates` 5/5 + 1 structural mutants RED; same-renderer A/B moved stone and wood only, `evidence/tint-mask-*.png`) — was MED | `world/Terrain.jsx:316` | Biome tint multiplies EVERY opaque block — stone, ores, sand, snow, wood, player-placed blocks, cave walls 30 blocks under a jungle. Should gate on the grass surface (or top faces of surface blocks). |
| R1.6 | ✅ FIXED `f4515dd9` (array sized from `BIOME_NAMES`, mask from the texture array's own depth; driven with 11 biomes) — was MED | `world/Terrain.jsx:295` | `uniform vec3 uBiomeTint[10]` and `clamp(vBiome, 0.0, 9.0)` hard-coded; an 11th biome clamps to mesa on the ground while the blades get it right. Derive from `BIOME_NAMES.length` + pin with a gate. |
| R1.7 | ✅ FIXED (imports RESOLVED against the importer, not text-matched; `gate-census.test.js`, 3/3 mutants RED) — was LOW | `scripts/ci/gate-census.mjs:119` | `drivenBy` misses sibling imports (`from './doc-anchors.mjs'`) inside scripts/ci, so helpers only other CI scripts use are falsely listed UNDRIVEN. |
| R1.8 | ✅ FIXED (two presses; the arm expires after 3 s; driven in jsdom) — was LOW | `ui/SpellUpgradePanel.jsx` | Respec wipes the whole build in one click beside the close button, no confirm/undo. |
| R1.9 | ✅ FIXED (each file read once) — was LOW; measured whole-run 0.39 s before, so tidiness not speed | `scripts/ci/gate-census.mjs:128` | ~8,000 readFileSync per run; read each file once into a Map. |
| R1.10 | ✅ FIXED (`biomeTable.BIOME_TINT`, one object read by the ground uniform and the blades; a reused scratch triple per blade; 4/4 mutants RED) — was LOW | `OptimizedGrassSystem.jsx:225` | `biomeTintTable()` rebuilt per chunk + an array per blade; export one frozen module-level table and share it with Terrain (also guarantees ground and blades read the same object). |

## R2 — `/code-review high` over the overnight range (7351c3bd..813428ac), 2026-09-22

Ten unverified candidates; each checked against source before any action.

| # | where | finding | disposition |
|---|---|---|---|
| R2.1 | `scripts/ci/e2e-freshness.mjs` | a running base read green from its finished shards; a timeout failed open | ✅ FIXED `7482cfdc` (reproduced live on run 35803592408) |
| R2.2 | `scripts/dev/kill-test-procs.sh` | an orphaned `npm`/`sh -c` wrapper shielded a leaked vite forever | ✅ FIXED `3ef77fa5` (my first tests passed before the fix — the wrappers carried the marker; rebuilt) |
| R2.3 | `render/cloudField.js` | terrain shadows ignored the sky's cloud cover | ✅ FIXED `0de44886` |
| R2.4 | `render/cloudField.js` | a set/grazing sun sampled clouds ~3,400 m away | ✅ FIXED `0de44886` (fade with sun elevation) |
| R2.5 | `workers/ai.worker.js` | the shoulder-charge latch survived a cover-seek break-off | ✅ FIXED `91dcabc6` (first test to ever drive the cover branch) |
| R2.6 | `game/hitstop.js` | the freeze is per-consumer opt-in: allies, BossEntity, projectiles, particles keep moving | ✅ FIXED `bb9f170c` — `worldDelta` + a census over every delta-taking useFrame (15 sites: 12 world, 3 real on purpose); e2e: a kill's XP orbs hold through a freeze. Absolute-time VFX still move → R2.7 |
| R2.7 | `workers/ai.worker.js` | the worker's timers (brace, windup, recover) run on wall-clock through a freeze | ✅ FIXED `c72586cd` — worldNow(): the worker's timers, the windup telegraph and the dragon's attack timers hold through a freeze; e2e case in world-hitstop |
| R2.8 | `scripts/ci/gate-shape.mjs` | `toContain`/`includes`/`toMatch` literals are checked against the gate's source files whatever the `expect()` subject is | OPEN as **G2** — true by construction, latent (0 false accusations in today's corpus). Shape: only count an assertion whose subject resolves to a source-text binding (`readFileSync`/`read(`/`strip(` init). |
| R2.9 | `.githooks/pre-push` | a receipt-matched push still builds a full worktree and may `npm install` | OPEN — perf only, not correctness. |
| R2.10 | `world/mesher.js` | corner AO computed in the key pass, then recomputed per emitted quad | OPEN — perf only; decode it from the key. Measure worker mesh time first. |

## R3 — `/code-review high` over 813428ac..0398b7b7 (far horizon + C3), 2026-09-22

| # | where | finding | disposition |
|---|---|---|---|
| R3.1 | `world/bossSystem.js` | a reload during a return fight refilled the dragon's HP | ✅ FIXED `aad73f24` (reproduced: 1050 instead of 200) |
| R3.2 | `HUD.jsx` | VICTORY overlay re-fired on a return kill after a reload | ✅ FIXED `aad73f24` (gated on tier 1) |
| R3.3 | `App.jsx` | autosave triggers lacked bossTier/bossKillNight | ✅ FIXED `aad73f24` |
| R3.4 | `world/farField.js` | far WATER sits at SEA_LEVEL-2, above the loaded seabed (a near-surface swimmer sees a floor) | ✅ FIXED `1c0dde0b` (R3.9: discarded over loaded chunks; water sinks only past the deepest wave trough) |
| R3.5 | `world/farField.js` | canopyFrom ignores Terrain's cull hysteresis (chunks kept to renderDistance + 2, `Terrain.jsx:816`) | ✅ FIXED `1c0dde0b` (canopyFrom deleted; the mask covers whatever IS loaded) |
| R3.6 | `world/farField.js` | triangle interiors can cover gullies inside loaded chunks; at low tier the ring runs under the player | ✅ FIXED `1c0dde0b` (per-fragment discard over loaded chunks) |
| R3.7 | `world/FarField.jsx` | no danger-mood grade, no cloud shadows: a seam in the boss fight | ✅ FIXED `de175e6e` — one generated grade (render/landGrade.js) + cloud shadows on the far field; measured: the obsidian fog swallows the far ring, so the visible effect in the boss sky is ~nil |
| R3.8 | `world/farField.js` | swamp trees grow on DIRT (`terrain.worker.js:578`); CANOPY_SURFACES omits it | ✅ FIXED `de175e6e` — carriesCanopy: dirt carries canopy only in the swamp |
| R3.9 | `world/farField.js` + `FarField.jsx` | **the design fix for R3.4–R3.6**: no FIXED sink can be right, because the sink must be deep only where a chunk IS loaded and chunk presence changes continuously. HOLE-PUNCH instead: a `world/loadedChunks.js` 32x32 R8 mask of loaded chunks around the player (Terrain writes it when its chunk set changes; origin in chunk coords), sampled in the far field's fragment shader to `discard` wherever a real chunk is loaded. Then the ring sits AT the true surface (tiny sink only against the ocean plane), canopy lifts anywhere, water at sea level — no step at the loaded edge. Gates: pure mask build/index; the discard is spliced; mutation: mask ignored / origin off by one chunk | ✅ FIXED `1c0dde0b` — K1–K9 mutation-proven (K8 an equivalent mutant, its dead code deleted); capture A/B opened |
| R3.10 | `world/FarField.jsx` | each rebuild allocates new arrays + BufferAttributes and regenerates the texture array Terrain already holds | ✅ FIXED `de175e6e` — one buffer set refilled in place, index built once, the shared texture array |
| R3.11 | `game/bossPersistence.js`, `bossSystem.js` | killNight coercion duplicates `nat`; stats recomputed; the return entrance still says "the Shadow Dragon awakens" | ✅ FIXED `674a54eb` (entrance names the tier; a corrupt kill night counts from tonight — it clamped to night 0 and woke the dragon at once) |

## I2 — knip sits in the CI-only tier, which its own rule says it does not belong in (found 2026-09-22, OPEN)

`ci/pipeline.sh` puts knip under "TIER: CI-ONLY — needs the network or a browser". knip needs neither: it is
offline, deterministic, ~20 s here. So no local chokepoint can see a knip failure, and one reached CI on
`8202ec59` (a test spawning `pgrep`/`pkill`, fixed in `9e8efbf2` via `ignoreBinaries`). **Shape of the fix:** a
push-tier step that also runs under `--range-only` (a SECTION that is neither `core` nor `range`), stated ONCE
with a guard true for `push` and `fast`, and teach `scripts/ci/gate-table.mjs` to derive that guard (it
generates the gate table from the guards, and `doc-currency` fails on drift). Mutation-prove: an unused export
added in a scratch commit must redden the pre-push.

## I1 — the capture has no subset mode (instrument gap, found 2026-09-22, OPEN)

Every look change gets a same-renderer A/B (two full captures), and `scripts/visual/capture.mjs` can only
capture all 31 states: ~15-25 min per run under the machine's normal load, so one A/B is ~40 min. Its states
are sequential inline blocks in `main()` with interleaved setup (not a table), so an `--only=` flag is a
refactor of the harness that manufactures the oracle, not a one-line option. **Shape of the fix:** lift the
states into a table of `{ name, setup, shoot }` with each setup self-contained (re-entering capture from a
known state), then `--only=` filters the table and writes to `tests/visual/subset/` with `complete:false`
semantics so a partial run can never satisfy `diff.test.js`. Mutation-prove that a subset run is refused by
the diff gate.

## P1 — mobs walk up walls: the AI has no horizontal collision (found 2026-09-23 while scoping pathfinding) — ✅ FIXED `232f0581`

EXTERNAL-BASELINE's "Pathfinding 9×9 — mobs stick on features > 4 blocks" understates it. Read in source:
the worker's Step 4 (`workers/ai.worker.js`) moves `x, z` straight at the steer target with no height check,
and the main thread then snaps `y` to the TOP surface — the mob ground probe casts DOWN from y = 255
(`world/Terrain.jsx`, `getMobGroundLevel`), and `AIWorkerSystem` applies it every update. So whenever A*
returns no path (the goal cell unreachable inside the 9×9 grid — e.g. the player behind a wall or inside a
built enclosure), the mob walks straight at the player and rises onto the wall top. Building as defense —
the outpost-walls quest — does not stop anything that is not already pathing around. Shape of the fix:
(1) Step 4 refuses a move into a cell whose ground is more than the A* step limit (1.25) above the mob's,
sliding along the free axis instead; (2) an unreachable goal returns the best partial path (the reached cell
nearest the goal) rather than nothing, so a blocked mob goes AROUND; (3) spiders may climb (they do in the
genre — decide and state it). Gate through the REAL worker across ticks (mob-charge-loop-gates' grid
harness): a walled goal must never raise the mob above the wall's base, and a wall with a gap must be routed
through the gap. Blind spots to name: wandering mobs carry no height grid; the y = 255 probe also lifts a mob
out of a cave onto its roof.

## R4 — review #3 (`/code-review high 0398b7b7..33c75345`, 2026-09-23), each to be VERIFIED before fixing

| # | Where | Finding | Disposition |
|---|---|---|---|
| R4.1 | `render/BossEntity.jsx` | the boss's bite, roar knockback, fireball, lava and summon timers run on `performance.now()`, so it keeps ATTACKING through a hitstop that freezes its movement | ✅ FIXED `84f9efe2` — a frozen frame returns before the attack timers (isWorldFrozen); structural slice gate (no R3F test renderer) |
| R4.2 | `world/BlockParticleSystem.jsx` | debris are Rapier bodies and physics is never paused: `worldDelta` only freezes their lifetime counter, so the "hangs in the air" comment is false and a freeze lengthens their life | ✅ FIXED `84f9efe2` — VERIFIED; debris lifetime on real time like their physics. **Follow-up R4.2b: pause the Rapier step through a freeze** (moves the player's body too — design first) |
| R4.3 | `world/FarField.jsx` + `loadedChunks.js` | the mask lags what is drawn: registration in a passive `useEffect` (after paint), `clearLoadedChunks()` before the unmount commits, and ±16 chunks cannot cover a 420 m ring after a teleport | ✅ FIXED `c0785955` — layout-effect registration, no early clear (clearLoadedChunks deleted), 64-texel mask covering FAR_OUTER |
| R4.4 | `game/bossPersistence.js` | `serializeBossState` writes a junk `bossKillNight` as 0, a VALID night, so hydrate's "junk counts from tonight" never sees junk from live state | ✅ FIXED `fafc562a` — serializes junk as tonight, proven through buildSaveData → loadWorldData |
| R4.5 | `HUD.jsx` | VICTORY now needs the isolated 'tier' kill effect to succeed (`bossTier === 1`); a throwing tier step strands the win's own UI | ✅ FIXED `fafc562a` — showsVictory: tier ≤ 1; driven through the real hook with the tier write throwing |
| R4.6 | `systems/AIWorkerSystem.jsx` | the hub-NPC routine lerps a fixed 0.04 per FRAME (frame-rate dependent) and keeps walking through a freeze; the census cannot see a callback with no delta | ✅ FIXED `84f9efe2` — npcFollowT per-second rate (= old 0.04 at 60 fps) on the world delta; census now counts it |
| R4.7 | `world/oceanProfile.js`, `render/Ocean.jsx` | `gerstnerDisplaceInto`/`gerstnerNormalInto` are dead in production (test-only) and their docs describe the removed CPU loop; Ocean.jsx comments stale | ✅ FIXED `07661878` — Into variants + their test deleted, gerstnerHeight (0 runtime callers) deleted, comments corrected (the test file's deletion was staged early and rode into `84f9efe2`; the tree at HEAD is right, history not rewritten) |
| R4.8 | process | the GPU-ocean milestone (`9860eaa9`) had no plan doc | ✅ `07661878` — plan doc written, labelled RETROSPECTIVE |
| R4.9 | `world/FarField.jsx` | the mask centre uses a literal `/ 16` while loadedChunks.js owns CHUNK | ✅ FIXED `c0785955` — chunkOf() is the one definition |
| R4.10 | `game/worldClock.js` | `worldDelta` re-reads the clock and the store per call (~70×/frame with 60 mobs), and consumers in one frame can straddle the freeze boundary | ✅ FIXED `84f9efe2` — WorldClockTicker computes the scale once per frame at priority -9999 |

## R5 — review #4 (`/code-review high 33c75345..4f28c78d`, 2026-09-23), each to be VERIFIED before fixing

| # | Where | Finding | Disposition |
|---|---|---|---|
| R5.1 | `game/localPath.js`, worker | A* starts at cell (4,4) = column `round(x)`, clampMove/the snap use `floor(x + 0.1)`: they disagree for frac(x) in [0.5, 0.9), so a mob stopped at a wall it approached in +x/+z plans FROM the wall top, straight over it, and never routes around | ✅ FIXED `43154097` — reproduced (stuck at x 4.73); gridOrigin/cellOf/cellCentre, one framing everywhere |
| R5.2 | `game/localPath.js` | A* cuts diagonally between two blocked orthogonal cells; clampMove refuses the move and both slides → the mob wedges at any diagonal gap, forever | ✅ FIXED `43154097` — a diagonal step needs both orthogonals passable |
| R5.3 | `systems/AIWorkerSystem.jsx` | only aggro mobs get a heightGrid, so wandering/passive mobs (and the first aggro tick) still walk up walls | ✅ FIXED `43154097` — settleOnGround: the snap refuses a climb for every mover |
| R5.4 | `render/BossEntity.jsx` | the frozen return only POSTPONES: attack cooldowns and the lava telegraph run on `performance.now()`, so a freeze eats the warning window and releases a burst of attacks on the first unfrozen frame | ✅ FIXED `c72586cd` — the dragon's timers and the lava telegraph on the world clock |
| R5.5 | `game/bossTier.js`, `HUD.jsx` | VICTORY is derived from STATE (defeated, tier ≤ 1) with HUD-local dismissal, so it reappears on every reload of a won game (and on a return kill whose tier step throws) | ✅ FIXED `5b1cb802` — victoryPending, an event of the tier-0 kill, never saved; showsVictory deleted |
| R5.6 | `systems/AIWorkerSystem.jsx` | altitude: the fix patched one mover; knockback, allies, spider leaps, spawns still set x/z unchecked and the top-surface snap lifts them | ✅ FIXED `43154097` — with R5.3 (the snap is the choke point) |
| R5.7 | `workers/ai.worker.js` | clampMove's `blocked` is discarded: a mob stopped at a wall keeps isMoving=true (walk cycle in place) | ✅ FIXED `43154097` — waits when it kept under a quarter of its step (exact-zero missed a shallow press) |
| R5.8 | `world/Terrain.jsx` | the chunk streamer computes the player's chunk with its own `Math.floor(camera / CHUNK_SIZE)` beside the new `chunkOf` | ✅ FIXED `d8e8a5b0` — CHUNK_SIZE + chunkOf the one definition |
| R5.9 | `world/FarField.jsx` | `computeVertexNormals` every rebuild, for a `flatShading` material that never reads normals | ✅ FIXED `d8e8a5b0` — normals dropped for the flat-shaded ring |
| R5.10 | process | the GPU-ocean plan doc is retrospective (already recorded; the rule was broken once) | ACKNOWLEDGED — see OVERNIGHT corrections |

## I3 — mipmaps have no MOTION-stability probe (found by the page refresh, 2026-09-23, OPEN)

The mipmap A/B in KEVIN-REVIEW-BATCH compares still frames. The failure mipmaps exist to fix — distant faces
crawling as the camera moves — is temporal, and sota-audit recommended a far-band temporal-stability probe
(sub-pixel camera jitter, depth > 40 m). None exists (`scripts/visual`, `scripts/ci`: no jitter/temporal
probe). Write it before Kevin decides the lock, so the decision rests on the property, not on a still.

## R6 — review #5 (`/code-review high 4f28c78d..34ead1d3`, 2026-09-23), each to be VERIFIED before fixing

| # | Where | Finding | Disposition |
|---|---|---|---|
| R6.1 | `game/localPath.js` A* | the corner guard checks only orthogonals ABOVE the current cell; a trench orthogonal (target > STEP_UP above it) is still cut and clampMove wedges the mob | ✅ FIXED `458de5db` — both legs of both orthogonals checked |
| R6.2 | `game/localPath.js` settleOnGround | compares only the DESTINATION column: a multi-block knockback shove across a thin wall onto equal ground beyond is accepted — it passes THROUGH the wall | ✅ FIXED `458de5db` — the shove is walked against the ground probe in drainKnockback |
| R6.3 | settleOnGround | a refused grid-less mover keeps isMoving/target: walks in place and jitters until its wander re-rolls | ✅ FIXED `458de5db` — a refused mover stops and re-rolls |
| R6.4 | settleOnGround | if the mob's OWN column rises > STEP_UP (a build placed on it), every snap is refused and it stays embedded | ✅ FIXED `458de5db` — a rise of the mob's own column lifts it |
| R6.5 | `world/bossSystem.js`, store | victoryPending is never cleared on loadWorldData / new world: an undismissed VICTORY reappears over another save | ✅ FIXED — loadWorldData clears it |
| R6.6 | `game/worldClock.js` | only the CURRENT burst window is subtracted: a burst that ends and another that starts between two ticks loses the first's tail | ✅ FIXED — the store banks finished bursts; closed-form clock |
| R6.7 | BossEntity:72, useGameStore:1087, blightHeart:22, shrines:12 | literal `Math.floor(v / 16)` chunk indices remain; the R5.8 gate only matched `/ CHUNK_SIZE` | ✅ FIXED — three sites through chunkOf; gate matches any literal /16 (shrines.js had none) |
| R6.8 | `systems/AIWorkerSystem.jsx` | the wall check for knockback runs at the 15 Hz reply, after a STALE reply overwrites x/z — the shove renders on the wall or is lost; the guard belongs in drainKnockback (or knockback through clampMove) | ✅ FIXED `458de5db` — with R6.2 (a stale-reply race of a few ms remains: the shove can be lost, never through a wall) |

## R7 — review #6 (`/code-review high 34ead1d3..9063b8c7`, 2026-09-23), each to be VERIFIED before fixing

| # | Where | Finding | Disposition |
|---|---|---|---|
| R7.1 | `game/localPath.js` settleOnGround | REGRESSION of R6.4: the own-column exemption accepts ANY rise, and the probe is top-down from y=255 — a roof or bridge built ABOVE a mob (air between) lifts it onto the roof | **FIXED 2026-09-23** — the diagnosis held: the root was the probe. `game/mobFloor.js` (the air-gap rule, pure) + `world/mobFloorProbe.js` (a sky-down column walk over FIXED colliders; Rapier trimesh casts hit faces from behind, verified on 0.19.2) registered beside the top-down probe as `getMobFloor`; the snap (`snapMob`), the aggro grid (`heightGridAt`), knockback, hub NPCs, allies and the leg IK all read the floor. Gate `tests/gates/mob-floor-gates.test.js` meshes a real chunk into a real Rapier world and chases the real worker under a roof and a canopy, each beside a top-down CONTROL that must fail; 12 mutations RED (M7 survived first). |
| R7.2 | chunk literals | "no literal chunk size left" is false: `Terrain.jsx` `cx * 16`, SpawnerSystem 161-162, spawnPlacement 22-23, mesher.js:41, homeAnchor/terrain.worker redeclare CHUNK_SIZE; the gate regex misses nested parens and `* 16` | **FIXED 2026-09-23** — `world/chunkLayout.js` is the one definition (sizes, `voxelIndex`, `columnIndex`, `chunkOf`); every literal site repointed; gate `chunk-layout-gates` asserts no redeclared size, no `c[xz] * 16`, no `* 256`, no inline `[xz] * 16 +` and one `/ 16` (the music arp) |
| R7.3 | `useGameStore` loadWorldData | the replay's voxel index uses CHUNK_SIZE² while mesher.js uses a literal 256: two layout definitions | **FIXED 2026-09-23** — `voxelIndex` used by the worker, the Hearth stamp, the mesher and the save replay; the biome array by `columnIndex`. The seam is checked as behaviour: a block written at an asymmetric voxel is meshed by the real mesher exactly there |
| R7.4 | `game/captureRest.js` | depth: the shove is `knockback * delta * 4` — a one-frame impulse scaled by frame delta (refresh-rate-dependent, multi-block after a hitch); fix the displacement, not only the wall walk | **FIXED** — verified by reading: a player hit shoved 0.13 m at 60 fps and 0.8 m at 10 fps, and the spider's leap (the same impulse, 15) 1 m vs 6 m. `KNOCKBACK_SHOVE_S = 4/60` per unit of impulse — the 60 fps tuning at every frame rate; drainKnockback lost its frame-delta parameter |
| R7.5 | `captureRest.shoveAgainstWalls` | re-implements clampMove's sub-step walk without the slide; one implementation with a heightAt function | **FIXED** — `localPath.walkAgainstWalls` is the one sub-step walk (with the slide); clampMove and the shove both run it. The shove tracks the floor it stands on from the feet: re-probing the point it leaves read a canopy on a column seam and let a shove in under it (the mob-floor control caught that draft) |
| R7.6 | same | per-sub-step castRays on the hit frame (AoE × slow frame = hundreds); probe per column crossed | **FIXED** — the floor is cached per column the shove crosses; and with R7.4 a shove is ~0.13 m (a hit) to 1 m (a leap), never a slow frame's multi-block walk |
| R7.7 | `localPath.findLocalPath` cornerOk | stricter than clampMove (a centre-to-centre diagonal need not enter either orthogonal) — A* and the mover disagree; one shared predicate | ⊘ DISMISSED — the disagreement runs the SAFE way: A* stricter than the mover can only send a mob the longer way round, never plan a step the mover refuses (the direction that wedges mobs, pinned by R5.2/R6.1) — `cd frontend && npx vitest run tests/gates/mob-wall-gates.test.js -t corner` |
| R7.8 | settleOnGround R6.3 | a refused wanderer re-rolls at once and may pick the same wall; a latched brute charge re-charges the wall | **FIXED** — `snapMob` → `turnFromWall`: a CHARGE that meets a wall ends there and the brute is winded for SHOULDER_RECOVER_MS (the punish window a dodged charge gives); a WANDERER heads back out, away from the wall, for 1.5 s; a chasing mob stays with A* |
| R7.9 | column-top readers left after R7.1 | same root, other consumers: spells impacted at `y <= columnTop + 0.5`, so a cast under a tree or a roof burst at the muzzle; XP orbs and loot from a mob killed under a canopy snapped up onto the leaves | **FIXED 2026-09-23** — `floorUnderPoint` (the same air-gap rule, no headroom) for spells (`projectileGrounded`), orbs and loot (`groundYAt` now gets the drop's own y). Proving it in the running game exposed a second defect the frame rate had hidden: the spell's ground check ran ONCE per frame at the end of the move, so a 3 fps frame carried a 25 m/s fireball 8 m unchecked — through a thin wall, or out from under the roof before the buggy check looked (the e2e passed on the buggy predicate). `advanceProjectile` checks every 0.5 m. Gates: mob-floor-gates (spell, orb, sub-step cases on the real-mesher Rapier world, 10 mutations RED, 2 survived first); e2e `mob-floor.spec.js` fireball case, E2 RED "burst after 0.0 m" |
| R7.9b | `SpawnerSystem.spawnMob` | spawn placement still takes the column top, so a mob can SPAWN on a tree canopy or a roof (it walks off the edge and drops — cosmetic, but Minecraft-genre players read it as a bug) | **FIXED 2026-09-23** — not the lowest floor after all: under a roof that is INSIDE the player's sealed base, which building walls exists to prevent. `mobFloor.spawnGroundAt` accepts a column only when its top is solid 4 blocks down (one point query), else the spawner tries elsewhere. Gate `tests/gates/spawn-surface-gates.test.js` on a real-mesher Rapier chunk; V1-V3 RED |

## R8 — review #7 (`/code-review high 9063b8c7..HEAD`, 2026-09-23), each to be VERIFIED before fixing

| # | Where | Finding | Disposition |
|---|---|---|---|
| R8.1 | `AIWorkerSystem` reply loop | a worker reply computed before the dodge copies the cancelled `windupUntil` back onto the staggered mob: the charge glow returns (MobModel's `charging` has no stagger check) and `perfectDodgeTargets` treats it as a fresh target | **FIXED** — VERIFIED through the real worker first (the in-flight reply did restore the windup). `holdStagger` after every reply apply; `perfectDodgeTargets` skips staggered mobs; MobModel's charge glow skips them |
| R8.2 | `perfectDodge.riposteDamage` | x1.5 of an integer is fractional: health and the floating number read "37.5" | **FIXED** — verified (25 -> 37.5); `Math.round` |
| R8.3 | `mobFloor.spawnGroundAt` | a trunk column is solid from the ground to the canopy top, so the 4-down probe reads it as ground: a mob can still spawn ON a tree | **FIXED** — VERIFIED on the real probe first (a trunk under a canopy returned 58). A column is spawn ground only if it and its four neighbours are |
| R8.4 | `localPath.settleOnGround` | an Infinity floor on the mob's OWN column skips R6.4's exemption: a mob entombed by a build taller than the reach stays embedded | **FIXED** — verified (the pillar case held y inside the pillar). `snapMob` lifts a mob out onto the top on its OWN column (or a first snap); `settleOnGround` still never writes Infinity |
| R8.5 | `CombatSystem.damageMob` | the riposte applies to allies, burns and zones too — the tip says "your hits"; an ally's 30 becomes a 45 "crit" | **FIXED** — `isPlayerSource` (the player's hits and their burns; not allies or hazards) |
| R8.6 | `perfectDodge.PERFECT_RANGE` | 3.4 covers melee; a spider's leap winds up from up to 6 m (LEAP_RANGE) and can never be perfectly dodged | **FIXED** — verified: the leap goes through the same 380 ms telegraph from up to 6 m, above too. `LEAP_RANGE` now shared from `game/mobSenses.js`; `PERFECT_RANGE = LEAP_RANGE + 0.4`, across and up (every windup targets the player, so range is only a sanity bound) |
| R8.7 | `mobFloor.columnFaces` | more than MAX_FACES faces above the feet returns null, which switches off the snap AND the wall rule for that mob | **FIXED** — cap 64 (32 layers); a capped walk answers from what it saw — a floor above or a WALL — never null |
| R8.8 | `world/mobFloorProbe.js`, MobModel IK | a closure allocated per probe call; the leg IK calls the multi-cast probe per leg per frame | **PARTLY** — the closure is hoisted (one per probe, not per call). The IK's cost is NOT measured: on open ground it is one cast per leg, as before; under a canopy or roof three |
| R8.9 | `EnhancedMagicSystem` | the `grounded` closure and a getState() per projectile per frame | **FIXED** — built once per frame |
| R8.10 | `mobFloor.spawnGroundAt` | its refusal silently depends on SPAWN_SOLID_DEPTH + 0.1 <= FLOOR_REACH; past it every canopy reads as ground | **FIXED** — the spawn check carries its own reach (depth + 1), and an Infinity answer refuses (the safe direction) |
| R8.11 | `chunkLayout.chunkOrigin` | (self, found at commit) exported with zero callers | **DELETED** — 29 `c * CHUNK_SIZE` sites already read the one constant; a wrapper adds nothing |
