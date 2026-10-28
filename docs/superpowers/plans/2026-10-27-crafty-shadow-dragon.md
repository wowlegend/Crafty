# The Shadow Dragon Earns the Climax: Implementation Plan (masterpiece Phase 3, roadmap move 13)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the last fight into the best one: a dragon whose shape reads from across the arena, with a visible tell
for every attack, a skill answer to each one (dodge, perfect dodge, heavy, spell), a stage-lit arena and a slow-motion
killing blow.

**Architecture:** The dragon's rules become a pure move machine (`game/dragonMoves.js`) that writes one shared,
duck-typed combat record (`game/bossCombat.js`). The perfect dodge, the heavy and the melee cone already read that
shape for mobs, so they work on the dragon without a special case. The dragon's body becomes about 40 instanced boxes
posed by a pure solver (`render/dragonRig.js`), drawn in 4 draws instead of today's 24. All of it except the shared
record moves into a lazy `BossEntity` chunk that loads only when a fight is due. The world clock's 0/1 freeze becomes
a 0..1 scale, which is how the killing blow slows the world without slowing the UI.

**Tech Stack:** React 19, three 0.172 (`frontend/node_modules/three/package.json:3`), R3F 9, drei 10.7.9 `Outlines`
(instanced-mesh support verified at `node_modules/@react-three/drei/core/Outlines.js:108-110`), zustand 5, vitest,
Playwright (CI e2e).

**Spec:** the umbrella plan `docs/superpowers/plans/2026-10-27-crafty-masterpiece.md` (Phase 3, line 97-98), roadmap
move 13 in `docs/superpowers/masterpiece-2026-10/roadmap-2026-10-27.json` (`"rank": 13`), the refute's verdict for 13
(`refute-2026-10-27.md:104`, "KEEP, after 11"; F3 at `:25-33` on the boss's point lights; the bundle item at
`:117`), the upside's ordering "Dragon rules vs dragon silhouette: rules first" (`upside-2026-10-27.md:52`),
`docs/superpowers/DECISIONS.md:39-62` (soft death, no engine bump), and the umbrella plan's bundle rule
(`2026-10-27-crafty-masterpiece.md:107-108`; DECISIONS.md does not carry it).

---

## Goal (player-facing)

Today you reach the Blight Heart after a long climb and find a purple box with two dots and plank wings. It bites you
with no warning whenever you are within 5 m. In its second phase it roars you across the map wherever you stand.
Neither of your two newest skills, the perfect dodge and the heavy, does anything to it. Its roar is announced by a
text toast after it has already hit you, and its other attacks by text instead of by anything you can read in the
world. After this plan, the dragon is a creature you recognise from its
silhouette: neck, horned head, hinged jaw, wings with membranes that glow with its rage, a whipping tail. It opens
its jaw and its throat glows before it bites or breathes. Its roar has a ring on the ground and a range you can leave.
Dodge its dive-bite at the last moment and it crashes to the ground, wings folded: chain heavies into it and it goes
down for three seconds. Each time it returns it has learned one new move. The arena is lit like a stage, so you can
read the floor you dodge on. When the killing blow lands, the world slows for half a second and comes back. The fight
runs as cool as an ordinary night and reads the same on an iPad.

## Current state (cited, every line verified by reading the file)

**What the fight is today.**
- The dragon is one component, `frontend/src/render/BossEntity.jsx` (609 lines), statically imported by
  `frontend/src/GameScene.jsx:25` and mounted at `:376-382` on every frame of every session. Its single `useFrame`
  (`BossEntity.jsx:184-486`) runs flight, all attacks, the projectiles and the animation. It returns early when inactive
  (`:187-195`), so it costs a call per frame even when there is no fight.
- **Bite, no windup:** `:283-290`. Damage lands whenever the horizontal distance is under `BOSS_CONFIG.attackRange`
  (5, `game/bossConfig.js:13`) and 2000 ms have passed (`bossConfig.js:14`).
- **Roar, no range test:** `:314-343`, every 4200 ms in phase index 1. It applies a Rapier impulse (`:329`) before it
  calls `damagePlayer` (`:333`). `damagePlayer` skips damage during dodge i-frames
  (`store/useGameStore.jsx:895`), but the impulse has already been applied by then, so a dodged roar still throws you.
- **Fireball:** `:293-311`, every 2400 ms in phase index 0, with no tell except a toast.
- **Lava:** `:346-365`, every 5200 ms in phase index 2. It **already has a telegraph**: a ring that grows for
  `LAVA_WINDUP_MS = 750` (`:23`) on the world clock (`:178`, `:422-434`) before it can hurt you.
- **Summon:** `:368-382`, two skeletons every 8500 ms.
- **Four per-attack toasts in English:** `:307-309`, `:336-338`, `:359-361`, `:378-380`. The phase alerts and
  arrival/defeat lines in `world/bossSystem.js:65,79,120,122,150` are hardcoded English too. None goes through
  `t()` (`i18n/i18n.js:12-17`). The adoption ratchet cannot see them: it scans JSX text nodes and four user-visible
  attributes, not string arguments (`scripts/ci/i18n-adoption.mjs:22`).
- **Phase 0 flight** orbits 14 m out and about 13 m up (`:241-248`). The melee cone misses anything more than 2.2 m
  above or below the player (`combat/cone.js:43`), so phase 0 can only be hurt by spells.
- **Perfect dodge cannot reach it:** the dodge start calls `applyPerfectDodge(mobsQuery.entities, …)`
  (`Components.jsx:998`), and the dragon is not an ECS mob. `perfectDodgeTargets` is duck-typed on `passive`,
  `health`, `windupUntil`, `staggerUntil` and `position` (`game/perfectDodge.js:30-42`), so an object with those fields
  is all it needs.
- **The heavy ignores it:** a heavy staggers mobs (`Components.jsx:272-279`). The boss branch (`:289-310`) deals the
  heavy's damage with no other effect, and `heavyAttack.js:18` names the exclusion ("(non-boss)"). The boss branch
  tests one point, the dragon's centre (`:292-293`). `damageBoss` (`world/bossSystem.js:134-137`) applies no riposte,
  unlike `CombatSystem.jsx:40` for mobs.
- **Return tiers only scale numbers:** `game/bossTier.js:35-55` scales health, damage, speed and loot. It adds no
  moves.

**What the model is today.** The torso is 3x2x4 (`:509`). The head is 1.4x1.4x2 (`:521`). Each wing is a 2.2x0.15x3
slab (`:533`, `:545`). There are two sphere eyes (`:557-564`) and 8 static feature boxes (horns, tail, ridge;
`:94-106`, `:568-580`). Per frame, at every tier (`charOutline: true` at `render/quality.js:20,21,32`), that is **24
draws in the main pass**: 14 meshes plus 10 inverted-hull `Outlines` (`:517,:529,:578`). It is also **14 draws per
shadow render**, because every mesh has `castShadow`.
- **One always-on point light** (`:565`) **plus one per live fireball** (`:590`). three 0.172 keys every lit
  material's shader program on the point-light count (`node_modules/three/src/renderers/webgl/WebGLPrograms.js:320,452`).
  Each fireball's spawn and despawn therefore changes the program set for the whole scene, and while it lives, every
  lit fragment on screen pays for it. Refute F3 (`refute-2026-10-27.md:25-33`) names these lights.
- **Hit flash:** a `useState` flipped on hit (`:131-139`). It is rare, so it is allowed under game-loop isolation.
- **Animation:** the bob, the pitch and the wing flap (`:466-485`) read `state.clock.elapsedTime`, which is absolute
  time. The frozen early return (`:217`) skips them during a hitstop, so the wings hold, then snap to the
  absolute-time angle when the freeze ends, and a slow-motion scale could never reach them.

**The discipline already in it, which we keep (named, so a reviewer can check nothing was lost):**
- `worldDelta(rawDelta)` (`:186`), the whole-dragon freeze early return (`:217`, review R4.1), and attack timers on
  `worldNow()` (`:280`, R5.4). All are pinned by `tests/gates/world-delta-census-gates.test.js:99,203,206` and
  `tests/gates/world-hitstop-gates.test.js:134-140`.
- The capture rest pose through the shared seam `bossCaptureReset` / `BOSS_REST` (`game/captureRest.js:20-50`).
- The emissive-by-surface rule: plates get a sheen, membranes carry the phase colour, and the flash dominates every
  surface (`render/characterStyle.js:101-107`, `:116-121`; `render/bossFlash.test.js`;
  `tests/gates/boss-emissive-gates.test.js:85`).
- The obsidian body colour `#111029` (`:493`). The lava telegraph and `destroyVoxelsInRadius` (`:25-87`).
- The phase flight model: orbit in phase 0, ground charge in phases 1-2 (`:241-254`), and the per-tier phase stats
  (`:110`, pinned at `tests/gates/boss-tier-loop-gates.test.jsx:202-203`).
- Everything in `world/bossSystem.js`: the lair arrival poll (`:54-109`, 24 m, 1500 ms), tier returns, the kill beat
  run through isolated effects with the win latch last (`:143-171`), the encounter mirror for saves (`:202-204`), and
  the danger-mood bridge (`:211-214`). The health bar (`ui/BossHealthBar.jsx`). The entrance beat
  (`game/bossEntrance.js:32-65`), which notes "NO ROAR" at `:14-17` because no dragon voice existed. **There is still
  none.** The `roar` voice registered at `audio/synthVoices.js:733` is the player's own heroic WILDHEART roar (the R
  verb plays it, `Components.jsx:656`, `game/keyMap.js:28`), and the audio keeps a player-vs-enemy split
  (`synthVoices.js:84-86`: the enemy snarl is "deliberately higher + shorter + nastier than the heroic WILDHEART roar
  so a threat reads as a threat, not the hero"). Unit 7 adds a distinct `dragonRoar` synth voice, playable through
  `playSpatialSound(name, pos, rate, range)` (`SoundManager.jsx:591`).

**What the world clock can and cannot do.** `worldTimeScale` is 0 or 1 (`game/hitstop.js:33-35`). `tickWorldClock`
computes the world clock in closed form as wall time minus every frozen span (`game/worldClock.js:26-30`), and
`worldDelta` multiplies by the scale (`:43-45`). There is no slow-motion anywhere (survey `survey-2026-10-27.json:377`,
grep finds 0).

**The bundle.** `index` has a hard ceiling of 760,000 B (`frontend/scripts/ci/bundle-budget.mjs:35`). The newest
build on disk (`frontend/build/assets/index-RM8RWfkj.js`, 05:22 today; which commit it came from is unknown) measures
696,924 B and contains the dragon (its `'Shadow Dragon Shockwave'` string is present). `BossEntity.jsx` alone
minifies to about **9,610 B** (esbuild `--minify`, unbundled, measured for this plan). This is an estimate of what
leaves `index`. Unit 1 measures the real number. The lazy-panels split is the precedent for a gated lazy chunk
(`bundle-budget.mjs:95-130`, `ui/panels/lazyPanels.js:16-27,41-76`).

**Dependencies, and where each stands on 2026-10-27** (checked with `git merge-base --is-ancestor`):
- Phase 0c, touch press-and-hold heavy: on `feat/touch-hold` (`6270b370`), **not merged**. The touch dodge already
  exists (`ui/TouchControls.jsx:205-214`).
- The lookbook probe and its production seam: on `feat/instruments` (`scripts/visual/lookbook.mjs`,
  `src/render/lookbookSeam.js`), **not merged**.
- The parked ore-glow emissive term `world/oreGlow.js`: only on `feat/parked-looks-perf` / `feat/steady-cool` /
  `wip/perf-t3-features`, **not on main**.
- Moves 5 (combat stance), 11 (merged mob parts, edge telegraph, light pool) and 4 (colour script): plans written,
  nothing built.
- **Move 11 is a precondition for Units 3 and 5** (review amendment, 2026-10-27). The refute orders this move
  "KEEP, after 11" (`refute-2026-10-27.md:104`), the umbrella applies the refute and wins
  (`2026-10-27-crafty-masterpiece.md:7-8`), and the roadmap names "move 11 (the merged-part pipeline and the edge
  telegraph)" as a dependency (`roadmap-2026-10-27.json:218`). Move 11's plan
  (`docs/superpowers/plans/2026-10-27-crafty-feedback-grammar.md`) produces the surfaces this plan would otherwise
  duplicate: U1's `edgeLook`, `telegraphLevel`, `hdrGain` and `DANGER`; U4's `createInkOutlineMaterial`; U7's decal
  pools (`poolAlloc`, `poolStep`). So:
  - **Unit 3 does not start** until move 11's U1 is on main. Its decal pool uses U7's pool helpers if U7 is on main,
    and otherwise its own pool under the same `poolAlloc`/`poolStep` contract, so U7 can absorb it.
  - **Unit 5 does not start** until move 11's U1 is on main. Its windup rim and outline go through
    `edgeLook`/`telegraphLevel`, the eye and throat gain through `hdrGain` and the one `BLOOM_THRESHOLD`, and the outline
    through U4's ink material if U4 is on main (else drei `Outlines`).
  - **Units 1, 2, 4, 6 and 7** touch no surface move 11 owns (lazy loading, the move rules, the dodge-start seam, the
    world clock, audio). Building them first follows the upside's "rules first" (`upside-2026-10-27.md:52`), but it
    partially reverses the refute's ordering. **Before Unit 1 starts, the implementer adds a dated DECISIONS.md entry**
    recording that reversal for those five units and the reason. Without that entry, the whole plan waits for move 11.

## Design

Every move below gives its GPU cost and its main-chunk (`index`) bytes. The byte figures are esbuild-minified
estimates, and each unit's commit body records the measured delta from `npm run build && node
scripts/ci/bundle-budget.mjs`.

| # | Move | GPU cost | `index` bytes |
|---|---|---|---|
| D1 | **Lazy dragon chunk.** `BossEntity.jsx` keeps its path and is loaded with `React.lazy` through `onceRetrying` (`lazyPanels.js:16`). It mounts only while `bossActive` (or its death beat, D6). `bossSystem` preloads it once the player qualifies for a fight (tier 0 at level 5, or a return due), and at mount when a saved fight is active. **The lazy element sits inside its own `<Suspense fallback={null}>`**, so a pending chunk hides only the dragon, never the world. On a failed chunk the dragon shows a notice and retries; after the last retry the encounter is suspended (HP and save kept, the lair re-armed) and the player is told to reload. The game is never replaced by the reload screen | 0. Removes one `useFrame` call from every frame outside a fight | **-~9.0 KB** (BossEntity out, about 0.6 KB of loader, boundary and give-up path in) |
| D2 | **A tell for every attack.** A pure machine with one move at a time, each with a windup on the world clock: bite 520 ms, fireball 600 ms (throat), roar 900 ms inhale with a 9 m radius and falloff, summon 700 ms. The lava keeps its one 750 ms tell, today's growing ring: the machine places the zone when the move **starts**, so the zone's own telegraph is the windup and the total warning stays 750 ms. The roar is **skipped whole, impulse included, under i-frames**, and keeps today's camera shake and block breaking on a strike. Strike-or-whiff follows `attackPhase` (`game/attackTelegraph.js:11-18`). The tier's trick list arrives in this unit, not later | 0 (CPU: one pure step per frame) | +~0.1 KB (`tricks` in `bossTier.js`) |
| D3 | **Ground decals replace toasts.** A fixed pool of 4 decal meshes (ring, disc, arc), always mounted while the fight runs, shown and hidden in `useFrame`. The 4 toasts are deleted. Every remaining boss line goes through `t()`, in en and zh-CN, **and so does the boss's name** (`bossDisplayName(tier)`), which every one of those lines interpolates | At most 2 transparent decal draws, only during a windup. Worst fill: the roar ring, about 254 m² of ground for 0.9 s | +~1.9 KB (strings, both locales, and the name helper) |
| D4 | **Skill answers.** A shared combat record that the dragon writes every frame, duck-typed like a mob. The perfect dodge reads it as a target (parryable moves only: bite, dive-bite, tail sweep). A perfect dodge staggers it 1400 ms (`STAGGER_MS`), and in phase 0 it lands. Riposte in `damageBoss`. **Heavies chain:** each heavy that lands on the staggered dragon refreshes the stagger to 1400 ms. The third heavy knocks it down for 3000 ms. Then it is immune to stagger for 4000 ms (no stunlock). The melee cone tests three hit points (head, chest, hips) instead of the centre | 0 | +~1.3 KB |
| D5 | **The segmented voxel dragon.** About 40 boxes in one `InstancedMesh`: 2 torso, 5 neck, skull, snout, hinged jaw, 3 horns/crest, 6 tapering tail, 8 leg, 6 wing-bone, 4 spine spikes, 2 eyes, 1 throat. Six membrane panels go in a second instanced mesh. **The eyes and throat stay an unlit, non-tone-mapped `meshBasicMaterial`** (a third instanced mesh of 3), the recorded design (`characterStyle.js:108-114`, gate `boss-emissive-gates.test.js:97-98`): brightest by construction, never dimmed by the scene, and white on a hit. Plate and membrane glow comes from one per-instance attribute in a pure GLSL string module with a JS mirror (the `oreGlow.js` pattern). A cold view-fresnel rim tints toward danger red during a windup (through move 11's `edgeLook`). The pose is solved on the CPU over arrays in one `useFrame`. Each instanced mesh carries a fixed bounding sphere of the rig's full reach, so posing never culls it wrongly. **The boss point light and the per-fireball lights are deleted**, and the fireballs glow through HDR emissive | **Main pass 24 → 4 draws** (body, its outline, membranes, eyes/throat). **Shadow 14 → 2** (the eyes cast none). **Point lights 1+N → 0**, so no program recompile per fireball and no per-fragment light loop scene-wide. Added: about 8 ALU per dragon fragment (glow + rim). Instance upload about 3 KB/frame during the fight. Frustum culling kept, against the reach sphere (an off-screen dragon issues no draw). Net negative | 0 (lazy) |
| D6 | **Slow-motion killing blow.** `worldClock` gains a slow-motion factor: linear from 0.15 to 1 over 600 ms, starting when the kill's hitstop ends. At most one per 10 s, none in capture mode, none when `juiceIntensity` is 0. Hitstops requested while a ramp is scheduled or running are dropped, so the world clock stays monotonic. The player, camera, UI and audio stay on real time. **The dragon stays on screen through it:** a death beat keeps the rig mounted in a collapse pose on world time until the ramp ends, while the fight itself (music, mood, save, health bar) ends on the kill as today | 0 (the rig's 4 draws for under a second longer) | +~0.9 KB |
| D7 | **Entrance roar and inhale voice.** A new synth voice `dragonRoar` (lower, longer and more dissonant than the player's WILDHEART `roar`, built from `makeAggroGrowl`'s enemy recipe), so the enemy never sounds like the hero. `bossEntranceBeat` gains a `roar` effect (`playSpatialSound('dragonRoar', lair, 1, 60)`), suppressed in capture mode. The roar inhale plays it at the start of the windup | 0 | +~0.5 KB (the voice recipe is in the main-chunk `synthVoices.js`) |
| D8 | **Returns learn moves.** `bossTierStats(tier).tricks` (the list itself and its tier-0 value land in Unit 2, so every pushed build has the fireball, lava and summon): tier 0 has `fireball, lava, summon`. Tier 1 adds `diveBomb` (a ground-shadow disc that grows for 1100 ms, then a 4 m slam). Tier 2 adds `tailSweep` (a 270° arc of 6 m behind it, 600 ms). The core moves `diveBite, bite, roar` are not in `tricks` and cannot be removed. Move 14's `shrinesLit` removes tricks from this list (its plan owns that) | 0 | +~0.2 KB |
| D9 | **A stage-lit arena.** Obsidian mood: fog density 0.0200 → 0.0110 (`render/mood.js:27`). Grade saturation -0.45 → -0.25 and brightness -0.06 → -0.01 (`:57`). Obsidian floor value up (`theme/tokens.js:31` `grass`/`rock`). A brighter crimson horizon band (`skyHorizon`, `:30`) that silhouettes the dragon. **Lava cracks** through the ore-glow term **only if** `oreGlow.js` has reached main by then | 0 (constants and palette). Lava cracks: one emissive term already budgeted by Phase 0b | ±0 |
| D10 | **The dragon in the lookbook.** A `dragon-arena` place and `dragon(pose)` on the production lookbook seam (behind `?lookbook=1`), so real-GPU frames of the fight exist | 0 in play | +~0.3 KB |

**Net `index` ≈ -3.9 KB** against today (it was -4.8 KB before the review amendments added the give-up path, the
death beat, the name keys and the `dragonRoar` voice). The dragon's whole runtime lives in the lazy chunk.
**Net GPU during the fight: lower than today** (24+14 draws and 1+N point lights → 4+2 draws and 0 lights). The
roadmap's target, boss fight within +0.3 ms of an ordinary night (`roadmap … "heat_budget"`), has **no instrument in
this repo that measures GPU time** (a grep for a timer query across `scripts/` and `src/` finds none). Acceptance 3
therefore checks the structural numbers on the production build, and the heat itself in watts, Kevin-run and blocking.

**Kept, replaced, removed (the answer to "say what is kept").**
- **Kept:** all of `world/bossSystem.js`'s state machine and save mirror; `bossTier`/`bossConfig` numbers; the lava
  move and its 750 ms telegraph; `destroyVoxelsInRadius`; the phase flight model; the world-clock discipline (it gains
  the slow-motion scale); `bossCaptureReset` (extended to the rig); the emissive-by-surface rule and `#111029`; the
  unlit, non-tone-mapped eyes; the health bar; the entrance beat (it gains a roar); the hitstop and sparks on boss
  hits; **the roar's camera shake (`BossEntity.jsx:321`, `triggerCameraShake(1.8)`) and its block breaking
  (`:341`, `destroyVoxelsInRadius(bossPos, 5.0, 4-8)`) on a roar strike**. On a whiff (the player out of range or
  rolling) the shake still fires, because the roar happened, and the blocks still break around the dragon, because
  they are at the dragon and not at the player.
- **Replaced:** the box model, its 10 outlines and the flash `useState` (flash becomes a uniform); the no-windup bite;
  the range-free roar; the absolute-time wing flap.
- **Removed:** the 4 per-attack toasts, the boss point light, and the fireball point lights.

**A correction to the roadmap, found while planning (stated here so a reviewer checks it rather than trusts it).** The
roadmap says "three heavies inside one stagger" of 1.4 s. A heavy cannot be thrown sooner than `HEAVY_HOLD_MS +
HEAVY_CHARGE_MS` = 280 + 420 = **700 ms** after its press (`game/heavyAttack.js:13,15`), so three of them take at least
2.1 s. That is longer than one 1400 ms stagger, so the knockdown as written can never happen. D4 keeps every
roadmap number (1.4 s stagger, three heavies, 3 s knockdown) and makes it reachable with a **chain**: each heavy that
lands refreshes the stagger. A realistic 0.9-1.1 s cadence then reaches the knockdown, and a 1.5 s cadence lets the
stagger lapse. Unit 4 pins both ends of that.

**The seams, and why they are where they are.**
- `game/bossCombat.js` is the **only** dragon module in the main chunk besides the existing `bossSystem`/`bossTier`.
  The dodge start (`Components.jsx`) and `damageBoss` must read it before the lazy chunk has ever loaded. It is module
  state read transiently, like `heavyAttack.js:25-26`. React never subscribes to it.
- The move machine **mutates the record** and returns events, the way `applyPerfectDodge` mutates mobs
  (`perfectDodge.js:48-55`). There is one source of truth, so a perfect dodge that zeroes `windupUntil` between frames
  is the cancel. A copy held in the component would overwrite it on the next frame.
- **Game-loop isolation:** the pose, the decals, the glow and the flash are written to instance buffers and uniforms
  from `useFrame`. The only React state changes are the ones that exist today on rare transitions (fireball and lava
  membership, `BossEntity.jsx:155,168,181`). The `isFlashing` `useState` (`:131`) is removed.
- **Move 11 compatibility:** Units 3 and 5 wait for move 11's U1 (see Dependencies). Unit 5 consumes its edge
  telegraph (`edgeLook`, `telegraphLevel`) and HDR gain (`hdrGain`, `BLOOM_THRESHOLD`) rather than writing its own.
  The dragon's part table → instance matrices solver stays in `dragonRig.js`, because move 11's rig is a single
  vertex-coloured mesh with legs swung in the vertex shader (its M3), which does not fit a 40-part articulated chain.

## Global Constraints

- Repo layout is TWO-LEVEL: ROOT `<repo>`, APP `<repo>/frontend`. Use absolute paths.
  Run every `npx vitest` and `npm` command **from `frontend/`**.
- Decisions of record (`DECISIONS.md:39-62`): death stays soft (the dragon never forfeits progress); no WebGPU/TSL
  and no three bump; new shader terms are pure GLSL string modules with JS mirrors. The umbrella plan
  (`2026-10-27-crafty-masterpiece.md:107-108`): every move states its main-chunk bytes, and rare-moment code goes in
  lazy chunks.
- Kevin's live-site report leads: no move adds GPU cost without stating it, and the iPad (low tier, WebKit) must
  stay correct. `charOutline` is on at every tier (`quality.js:20-32`), so the outline draw is paid on iPad too, and
  that is in the 4-draw count.
- Game-loop isolation (`.agent/AGENTS.md`): never bind React state to per-frame systems. Use refs, `getState()`,
  module state.
- Every `useFrame` that takes a delta routes it through `worldDelta` or `realDelta`
  (`tests/gates/world-delta-census-gates.test.js`). The dragon is a WORLD consumer.
- No emoji in `src/`. Every player string goes through `t()` with keys in en **and** zh-CN (`i18n/strings.js`; parity
  is enforced by `tests/i18n/i18n.test.js`). Simplified Chinese in plain game register.
- Any new check file carries a `Mutation-Proof:` line naming the mutation and the RED it produced
  (`scripts/ci/killability-ledger.mjs`). A new or rewritten gate under `tests/gates/` or `scripts/ci/` needs a
  `Mutation-Proof:` commit trailer (`scripts/ci/mutation-proof-trailer.mjs`). A new `readFileSync` gate under
  `tests/gates/` raises the frozen source-grep population and reds the push: prefer behavioural tests on the pure
  modules, and re-point existing boss source gates rather than adding new ones.
- Mutations: `scripts/dev/mutate.sh` or a `cp` backup with a `cmp`-verified restore, **never `git checkout <file>`**
  (`.claude/rules/gates-and-probes.md:74-76`).
- A visual-baseline re-shoot is its OWN `Baseline-Review:` commit with no `src/` change. It comes after the Phase 0e
  re-baseline has landed alone.
- Commits: no "Generated with" / Co-Authored-By footer. Subagent fix-ups are new commits, never `--amend`.
- Path rules that fire on files this plan touches: `.claude/rules/gates-and-probes.md` (all tests, scripts/ci,
  scripts/visual) and `.claude/rules/input-and-pointer-lock.md` (it covers `GameScene.jsx`. Unit 1's edit there
  touches no input or lock path, and must not).
- e2e specs are CI-only (about 20 min, serialized). Write them in the unit, run them in CI. **Do not run e2e, dev
  servers or capture locally while the machine is loaded.** e2e is certified by
  CI's `ci ok` on the exact sha (push to a `land/` branch), since W2-C deleted e2e-freshness.

## Review Focus

The five inputs no unit's main tests exercise that are most likely to bite a player, most likely first. Each has its
test in the unit that owns the code.

1. **A reload in the middle of a fight.** `bossActive` is restored true at boot (`bossSystem.js:19`), so the lazy
   chunk must load at mount, not only on arrival. Expected: the dragon is there after a reload, at the saved HP, with
   no windup and no stagger carried over. → Unit 1, step 1.3 (`preloadDragon` called when the store says a fight is
   active) and Unit 4 (`createBossCombat` gives a clean record on mount).
2. **A pending or failed dragon chunk:** a slow first load, offline, or a tab left open across a deploy, so the old
   hashed chunk 404s on every retry. Expected: while it loads, only the dragon is missing (the world, the player and
   post-processing keep running); on failure, a notice, up to 3 retries, and the game keeps running. After the last
   retry, the encounter is **suspended**: the health bar, boss music and obsidian mood end, the HP and the save are kept,
   the lair re-arms for the next arrival, and the notice tells the player to reload (naming the new-version case).
   Never the reload screen, and never an invisible dragon whose health bar stays up forever. → Unit 1,
   `dragonLoader.test.js` "a rejected load is retried" and the boundary tests in `LazyDragon.test.jsx`.
3. **A hitstop or slow-motion during a windup.** Expected: the windup holds and lands late, never early and never
   twice (the R5.4 lesson). → Unit 2, "a frozen world clock holds the bite windup". Unit 6, "worldNow never runs
   backwards across a kill, a ramp and a hit during it".
4. **The player dies, or rolls, mid-windup.** Expected: no strike on a dead player, and no impulse through i-frames.
   → Unit 2, "a roar in range under i-frames does nothing, impulse included" and "no strike event while the player is
   dead".
5. **A touch player on the low tier.** Expected: every answer can be performed with the on-screen controls (dodge
   button, cast button, held action button for the heavy). The dragon draws exactly 4 on low, one of them its
   outline. → Unit 4's touch e2e case (runs once Phase 0c is merged) and Unit 5's draw-count case, run at `low`.

---

## Units

Each unit ships on its own: the gates are green and the game is playable after it. Units run **in order** because
they share `BossEntity.jsx`. Inside a unit, the tests come first and must be seen failing. "Mutant" means: apply
exactly that change, run the named test, and observe RED. Record it in the file's `Mutation-Proof:` line and restore.

### Unit 1: the dragon becomes a lazy chunk (no behaviour change)

**Files:**
- Create: `frontend/src/render/dragonLoader.js`, `frontend/src/render/dragonLoader.test.js`,
  `frontend/src/render/LazyDragon.test.jsx` (the boundary tests)
- Modify: `frontend/src/GameScene.jsx:25` (the static import) and `:376-382` (the mount)
- Modify: `frontend/src/render/BossEntity.jsx:504` (the outer `<group>` gains `name="crafty:dragon-chunk"`, the
  literal inline, **not exported**)
- Modify: `frontend/src/world/bossSystem.js:54-56` (preload when a fight is due), `:19` (preload when one is restored),
  and a new `suspendEncounter()` (the give-up path)
- Modify: `frontend/src/App.jsx:621-646` (`spawnBossCloseup` awaits `preloadDragon()`, then force-spawns, and
  returns that promise. `capture.mjs:655` returns the hook's value from `page.evaluate`, so the capture waits for the
  chunk before its 1800 ms settle)
- Modify: `frontend/scripts/ci/bundle-budget.mjs` (a dragon split check beside the lazy-panels block, `:95-130`)
- Modify: `frontend/src/i18n/strings.js` (`notice.dragonLoadFailed`, `notice.dragonLoadGaveUp`, en + zh-CN)

**Interfaces:**
- The chunk marker is the literal `'crafty:dragon-chunk'`, written inline in the JSX (`name="crafty:dragon-chunk"`)
  and **not exported**. The importer hands the whole module namespace on (`loaded = m`, as `lazyPanels.js:63` does),
  so Rollup keeps every export of the lazy module, and an exported constant would keep the string in the chunk even
  after its one use was deleted (that would let mutant L4 survive). The e2e specs use the same literal string.
- Produces: `makeDragonLoader(importer) -> { load(): Promise<module>, preload(): void, loaded(): module|null }`, and
  the app instance `dragonLoader = makeDragonLoader(() => import('./BossEntity.jsx'))`, plus
  `export const preloadDragon = () => dragonLoader.preload()`.
- Produces: `<LazyDragon {...props} />`. It renders `loaded().BossEntity` directly once loaded (the
  `lazyPanels.js:55-59` trick against React.lazy's blank first beat). Otherwise it renders
  `<DragonBoundary><Suspense fallback={null}><Lazy/></Suspense></DragonBoundary>`. **The inner Suspense is
  required.** Without it the nearest boundary is `GameScene.jsx:360`, which also wraps `<Physics>`, `<MinecraftWorld/>`,
  `<Player/>` and `<PostFX/>`. Measured for this amendment (react-dom 19.2.8, the repro at Step 1.1): a lazy child
  suspending in an already-revealed boundary on a non-transition update (`setBossActive(true)` runs in a
  `setInterval`, `bossSystem.js:58,106`) hid the sibling (`display: none`) and ran its layout-effect cleanup. R3F's
  `useFrame` subscribes in a layout effect (`events-*.esm.js:1185`), and its reconciler implements `hideInstance`, so
  the whole world would vanish and stop updating while the chunk loads. With the inner boundary, the sibling was never
  hidden or unsubscribed.
- `DragonBoundary` (an error boundary in `dragonLoader.js`): on failure it renders null, calls
  `addNotification(t('notice.dragonLoadFailed'), 'warning')`, and remounts after 5000 ms, at most 3 times (one rare
  `setState`). **After the third failed retry it calls `onGiveUp()`**, which is `bossSystem.suspendEncounter()`, and
  notifies `t('notice.dragonLoadGaveUp')` ("The dragon could not be loaded. Reload the page, especially if Crafty was
  just updated."). `suspendEncounter()` sets `bossActive` false (the health bar, music and mood end through their
  existing effects), leaves `bossHealth`, `bossTier` and `bossDefeated` untouched (the save mirror at `:202-204` keeps
  the HP), resets `bossSpawned.current`, and bumps a `rearm` counter in the arrival poll's deps, because resetting the
  ref alone does not restart an interval the effect skipped at `:55`. The next arrival at the lair tries the chunk
  again, and a restored fight comes back at the saved HP (`:96-99`).

- [ ] **Step 1.1: Write the failing loader tests** in `frontend/src/render/dragonLoader.test.js`

```js
it('loads once while pending or loaded', async () => {
  const importer = vi.fn(() => Promise.resolve({ BossEntity: 'X' }));
  const L = makeDragonLoader(importer);
  L.preload(); L.preload(); await L.load();
  expect(importer).toHaveBeenCalledTimes(1);
  expect(L.loaded()).toEqual({ BossEntity: 'X' });
});
it('a rejected load is retried by the next call', async () => {
  const importer = vi.fn().mockRejectedValueOnce(new Error('404')).mockResolvedValue({ BossEntity: 'X' });
  const L = makeDragonLoader(importer);
  await expect(L.load()).rejects.toThrow('404');
  await expect(L.load()).resolves.toEqual({ BossEntity: 'X' });
  expect(importer).toHaveBeenCalledTimes(2);
});
it('loaded() is null until the import resolves', () => {
  expect(makeDragonLoader(() => new Promise(() => {})).loaded()).toBeNull();
});
```
Also put the `Mutation-Proof:` placeholder comment at the top of the file, to be filled in at step 1.7.

And the **boundary tests** in `frontend/src/render/LazyDragon.test.jsx` (jsdom, react-dom, the pattern of the repro
below). Each renders `<Suspense fallback={null}><Sibling/>{on && <LazyDragon/>}</Suspense>`, where `Sibling` logs its
layout-effect mount and cleanup, and flips `on` from a `setTimeout` (a non-transition update, as the arrival poll does):
- **"a pending dragon hides no sibling"**: while the fake importer is pending, the sibling is not `display: none` and
  its layout effect was never cleaned up. **Presence first:** the same harness with `LazyDragon`'s inner Suspense
  removed (a test-only `bare` flag) shows the sibling hidden and logs `UNSUB`, so the test can see the defect it
  guards.
- **"a rejected dragon renders null and notifies"**: the importer rejects; the sibling stays visible, the dragon
  renders nothing, and the injected `notify` was called once with `notice.dragonLoadFailed`.
- **"after the last retry it gives up, once"**: with fake timers and an importer that always rejects, after 3 retries
  `onGiveUp` was called exactly once and no 4th import was attempted.

The repro that settled the mechanism for this amendment (react-dom 19.2.8, jsdom 29.1.1, run from the session
scratchpad): with the lazy element directly inside the outer boundary, the log read
`["sub","UNSUB","during=<span style=\"display: none !important;\">world</span>","sub",…]`; with an inner
`<Suspense fallback={null}>` it read `["sub","during=<span>world</span>",…]`.

- [ ] **Step 1.2: Run it.** `cd <repo>/frontend && npx vitest run src/render/dragonLoader.test.js
  src/render/LazyDragon.test.jsx`. Expected: FAIL, "Failed to resolve import './dragonLoader.js'".
- [ ] **Step 1.3: Implement `makeDragonLoader`** over `onceRetrying` imported from `ui/panels/lazyPanels.js:16`. Do
  not write a second copy. Add `preloadDragon()` calls in `bossSystem.js`: (a) inside the arrival effect once its
  early-return guard at `:56` has passed, before `setInterval`; (b) in a mount effect when
  `useGameStore.getState().bossActive` is true. Add a third case to the test file: a fake store with
  `bossActive: true` → `shouldPreloadAtMount(state)` returns true. Export that predicate from `dragonLoader.js` and
  have `bossSystem` call it, so the reload case (Review Focus 1) is behaviour and not wiring.
- [ ] **Step 1.4: Run it.** Same command. Expected: PASS, 7 tests (4 loader, 3 boundary). Also add a
  `suspendEncounter` case beside the existing boss persistence hook gate's pattern
  (`tests/gates/boss-persistence-hook-gates.test.jsx`): after it, `bossActive` is false, `bossHealth` is unchanged,
  and moving the player into the lair re-activates the fight at the same HP.
- [ ] **Step 1.5: Write the failing split check** in `bundle-budget.mjs`: `DRAGON_MARKERS = ['crafty:dragon-chunk']`.
  Each marker must be absent from the `index` chunk and present in exactly one other chunk, with the same messages as
  the panels block. Add the marker to `BossEntity.jsx`'s outer group **before** making it lazy.
- [ ] **Step 1.6: Run it.** `cd <repo>/frontend && npm run build && node scripts/ci/bundle-budget.mjs`.
  Expected: FAIL, `✘ dragon: "crafty:dragon-chunk" is in the BOOT chunk`. This is the red-first proof that the check
  can see the dragon in `index`.
- [ ] **Step 1.7: Make it lazy.** In `GameScene.jsx` replace the static import with `LazyDragon` and mount it as
  `{bossActive && <LazyDragon …same five props… />}` inside `<Physics>`, where it sits today. Rerun step 1.6.
  Expected: `✓ dragon: 1 marker only in BossEntity-<hash>.js, none in the boot chunk`, and `index` smaller by the
  measured delta. **Write that delta in the commit body.**
- [ ] **Step 1.8: Mutants.**
  - **L1:** `makeDragonLoader` without `onceRetrying` (a bare `importer()` per call) → "loads once" RED.
  - **L2:** `onceRetrying` that keeps a rejected promise → "a rejected load is retried" RED.
  - **L3:** a second static `import { BossEntity } from './render/BossEntity'` left in `GameScene.jsx` → step 1.6's
    split check RED ("in the BOOT chunk").
  - **L4:** delete the `name="crafty:dragon-chunk"` → split check RED ("found in 0 chunk(s)": the presence half,
    which proves the split rather than a deletion). This only holds because the literal is not exported (see
    Interfaces). **Run it; do not assume it.** If it stays green, the string survives somewhere else in the chunk:
    find where before trusting the check.
  - **L5:** remove the inner `<Suspense>` from `LazyDragon` → "a pending dragon hides no sibling" RED.
  - **L6:** `DragonBoundary` never calls `onGiveUp` → "after the last retry it gives up, once" RED.

  Put L1/L2/L5/L6 in the test files' `Mutation-Proof:` lines and L3/L4 in the commit trailer, because
  `bundle-budget.mjs` is a `scripts/ci` gate.
- [ ] **Step 1.9: Re-point the boss source gates.** The path `render/BossEntity.jsx` is unchanged, so
  `world-delta-census-gates`, `world-hitstop-gates`, `boss-emissive-gates`, `character-render-gates`,
  `attack-telegraph-gates`, `boss-tier-loop-gates` and `bossFlash.test.js` must stay green with **no edit**. Run
  `npx vitest run tests/gates src/render/bossFlash.test.js`. Expected: PASS with the same assertion count as before
  the unit. If any assertion count fell, a gate went blind: stop and find out why.
- [ ] **Step 1.10: Full local gates** (see Verification gates), then commit:
  `perf(boss): the Shadow Dragon loads as a lazy chunk when a fight is due — index -<measured> B; a failed chunk retries instead of blanking the fight`
  with a `Mutation-Proof:` trailer (L3, L4).

### Unit 2: every attack has a tell (the move machine)

**Files:**
- Create: `frontend/src/game/dragonMoves.js`, `frontend/src/game/dragonMoves.test.js`
- Create: `frontend/src/game/bossCombat.js` (the record only in this unit; Unit 4 adds the adapter),
  `frontend/src/game/bossCombat.test.js`
- Modify: `frontend/src/game/bossTier.js:35-55` (`tricks` on every tier: `['fireball','lava','summon']` in this unit;
  Unit 8 adds the tier-1 and tier-2 moves), and its colocated test
- Modify: `frontend/src/Components.jsx:160-163` (DEV only: the `applyImpulse` shim also logs each impulse, for
  `readImpulses()`; no input or pointer-lock path is touched, `.claude/rules/input-and-pointer-lock.md`) and
  `frontend/src/App.jsx:346-362` (the DEV test hooks of step 2.8)
- Modify: `frontend/src/render/BossEntity.jsx:279-383`. The attack section becomes `const events = stepDragon(rec,
  ctx, now)` plus an event applier. The flight (`:230-277`), the projectile loops (`:385-464`) and the capture and
  freeze guards (`:197-217`) stay.
- Modify: `frontend/src/render/BossEntity.jsx:519-530`. The head's emissive ramps with the windup
  (`windupRamp(now, rec.windupUntil || rec.castUntil, move.windupMs)`), the interim visible tell on the old model
  until Unit 5.

**Interfaces:**
- Produces (in `bossCombat.js`, main chunk): `createBossCombat() -> BossCombat` and the singleton `bossCombat`.
  `BossCombat = { active:boolean, passive:false, health:number, position:{x,y,z}, hitPoints:[{x,y,z},{x,y,z},{x,y,z}],
  move:string|null, windupUntil:number /* parryable windups only */, castUntil:number /* every other windup */,
  staggerUntil:number, knockdownUntil:number, immuneUntil:number, heavyChain:number, cooldowns:Record<string,number> }`.
  `resetBossCombat(rec)` restores `createBossCombat()`'s values in place. **BossEntity calls it in a `useEffect`
  cleanup**, so an unmount (the kill, the death beat's end, a give-up) leaves no `active:true` record with a pending
  `windupUntil` for a perfect dodge to "parry". The kill deactivates in a post-commit effect
  (`bossSystem.js:143-148`), so the last frame that wrote the record may have written `health > 0`.
- Produces (in `dragonMoves.js`, lazy): `DRAGON_MOVES` (values below), `CORE_MOVES = ['diveBite','bite','roar']`,
  `roarFalloff(dist) -> number`, `dragonCtx({ bossTier, phase, player, playerAlive, invincible, groundY, damage })`
  (builds `ctx`, taking `tricks` from `bossTierStats(bossTier).tricks`), and `stepDragon(rec, ctx, now) ->
  DragonEvent[]`, where
  `ctx = { phase:0|1|2, tricks:string[], player:{x,y,z}, playerAlive:boolean, invincible:boolean, groundY:number, damage:number }`.
  `stepDragon` throws a `TypeError` when `ctx.tricks` is not an array, so a missing list fails loudly instead of
  silently disarming the fireball, lava and summon. It returns events
  `{type:'windup', move, until, at:{x,z}, radius?, arc?}`, `{type:'strike', move, damage, knockback:{x,y,z}|null}`,
  `{type:'whiff', move}`, `{type:'launch', move:'fireball'}`, `{type:'lava', at}`, `{type:'summon', at:[{x,z},{x,z}]}`.
- **Cooldowns are charged when a windup starts**, so a cancelled or whiffed move does not re-arm before its cooldown.
- **The lava is placed when its move starts.** `stepDragon` emits `{type:'windup', move:'lava'}` and
  `{type:'lava', at: player position}` on the same step, and holds `castUntil = now + 750` so no other move starts.
  The zone's own 750 ms ring (`telegraphUntil: worldNow() + LAVA_WINDUP_MS`) is the one tell, and the total warning
  from the first visible ring to harm stays 750 ms, as today.
- `DRAGON_MOVES` (exact values; tune only with a DECISIONS entry):
  `bite {windupMs:520, reach:5, cooldownMs:2000, parryable:true, phases:[1,2]}`,
  `diveBite {windupMs:520, reach:5, cooldownMs:6000, parryable:true, phases:[0]}` (its dive is Unit 4),
  `fireball {windupMs:600, cooldownMs:2400, parryable:false, phases:[0]}`,
  `roar {windupMs:900, radius:9, cooldownMs:4200, parryable:false, phases:[1]}`,
  `lava {windupMs:750, cooldownMs:5200, parryable:false, phases:[2], placeAtStart:true}` (750 = today's
  `LAVA_WINDUP_MS`, spent by the zone's ring, not by a second cast before it),
  `summon {windupMs:700, cooldownMs:8500, parryable:false, phases:[2]}`.
  `roarFalloff(d)` is 1 at 0 m, linear down to 0.4 at 9 m, and **0 beyond 9 m**. **The roar's range is defined only
  through it:** its `hasIntent` and its start condition are `roarFalloff(d) > 0`, never a separate `d <= radius`, so
  there is one source for the radius. Damage on a strike is
  `ctx.damage x 1.3 x roarFalloff(d)` for the roar (today's `x1.3`, `BossEntity.jsx:333`), and `ctx.damage` for the
  bite. The roar's knockback is today's impulse `(36, 14, 36)` (`:329`) scaled by `roarFalloff(d)`.

- [ ] **Step 2.1: Write the failing machine tests** in `frontend/src/game/dragonMoves.test.js` (one `describe` per
  rule; `rec = createBossCombat()`; player at a set distance on the x axis):

```js
it('the bite winds up before it lands — no strike in the first 519 ms', () => {
  const rec = createBossCombat(); const ctx = at(3, { phase: 1 });
  expect(stepDragon(rec, ctx, 0)).toContainEqual(expect.objectContaining({ type: 'windup', move: 'bite', until: 520 }));
  expect(stepDragon(rec, ctx, 519).some((e) => e.type === 'strike')).toBe(false);
  expect(stepDragon(rec, ctx, 520)).toContainEqual(expect.objectContaining({ type: 'strike', move: 'bite' }));
});
it('a bite whose target left reach whiffs', () => { /* windup at 3 m, step at 520 with the player at 8 m -> {type:'whiff'} */ });
it('the roar hits at 5 m and misses at 11 m', () => {
  // phase index 1 damage is 25 (bossConfig.js:18); the roar is x1.3 (BossEntity.jsx:333) scaled by the falloff
  expect(strikeDamage(roarAt(5, { damage: 25 }))).toBeCloseTo(25 * 1.3 * roarFalloff(5));
  expect(stepAt(roarAt(11, { damage: 25 }), 900).some((e) => e.type === 'strike')).toBe(false);
});
it('roarFalloff: 1 at 0, 0.4 at 9, 0 past 9', () => {
  expect(roarFalloff(0)).toBe(1); expect(roarFalloff(9)).toBeCloseTo(0.4); expect(roarFalloff(9.01)).toBe(0);
});
it('a roar in range under i-frames does nothing, impulse included', () => { /* invincible:true at 900 -> no strike, no knockback */ });
it('no strike event while the player is dead', () => { /* playerAlive:false at the due time -> 'whiff' */ });
it('a frozen world clock holds the bite windup', () => { /* step at 0, then 300 x5 with now fixed at 300 -> no strike; at 520 -> strike once */ });
it('one move at a time', () => { /* during a roar windup, no bite windup even in reach */ });
it('only parryable moves write windupUntil', () => {
  /* roar windup -> rec.windupUntil === 0 && rec.castUntil === 900; bite windup -> rec.windupUntil === 520 */
});
it('a cancelled windup (windupUntil zeroed by a dodge) never strikes', () => {
  /* set rec.windupUntil = 0 at 300, then step every 16 ms from 300 to 300 + bite.cooldownMs (2300):
     no strike at any step. A single instant (520) cannot see a re-armed windup: attackPhase re-arms on
     windupUntil 0 + intent (attackTelegraph.js:12-16) and would strike at about 1040. */
});
it('a removed trick never fires', () => { /* tricks without 'fireball' in phase 0 -> no fireball windup over 10 s */ });
it('a missing trick list throws', () => { expect(() => stepDragon(createBossCombat(), { ...at(3, { phase: 0 }), tricks: undefined }, 0)).toThrow(TypeError); });
it('dragonCtx takes the tier\'s tricks: tier 0 has fireball, lava, summon', () => {
  expect(dragonCtx({ bossTier: 0, phase: 0, ...rest }).tricks).toEqual(['fireball', 'lava', 'summon']);
});
it('the lava warns once, for 750 ms', () => {
  /* phase 2, lava due: the start step emits windup+lava together; the zone's telegraphUntil - its spawn time
     === 750; no second lava event before the cooldown. Total warning from first ring to harm === 750. */
});
```
And in `bossTier`'s colocated test: every tier's `tricks` is an array that contains `fireball`, `lava` and `summon`,
and none of `CORE_MOVES` (imported from `dragonMoves.js`; the test may import a lazy module).
Put `Mutation-Proof:` at the top.

- [ ] **Step 2.2: Run it.** `cd <repo>/frontend && npx vitest run src/game/dragonMoves.test.js`.
  Expected: FAIL, unresolved import.
- [ ] **Step 2.3: Implement `createBossCombat`/`resetBossCombat`** (with a 4-case test in `bossCombat.test.js`: fresh
  values, reset in place keeps identity, two creates do not share `position`, and a live record with a pending
  windup reads `active:false, windupUntil:0, castUntil:0` after the reset. The unmount cleanup itself is proven by
  Unit 6's e2e: right after `plantBossKill()`, `readDragon().active` is false), then **`stepDragon`**: per frame,
  (1) if staggered or knocked down (`staggerUntil > now || knockdownUntil > now`), cancel and return `[]`;
  (2) if a windup is due, resolve it by `attackPhase(now, until, hasIntent, windupMs)` from `attackTelegraph.js:11`,
  where `hasIntent` is "still in reach (for the roar, `roarFalloff(d) > 0`), and the player is alive and not
  invincible";
  (3) otherwise start the first move in a fixed priority order (`diveBite|bite`, `roar`, `tailSweep`, `diveBomb`,
  `lava`, `summon`, `fireball`) that is in this phase, off cooldown, in `ctx.tricks` or `CORE_MOVES`, and in reach or
  radius. Starting a move charges its cooldown. Cooldowns live in `rec.cooldowns` on the world clock.
  Then `tricks` on `bossTierStats` (every tier `['fireball','lava','summon']` for now).
- [ ] **Step 2.4: Run it.** Expected: PASS, every case.
- [ ] **Step 2.5: Wire it into `BossEntity`.** `ctx` comes from `dragonCtx({ bossTier, … })`, never built inline. The
  event applier: `strike` → `damagePlayer(damage, t('boss.src.<move>'), bossPos)` (`sourcePos` gives the directional
  damage indicator), then the impulse only for a `strike` with `knockback`. **A roar `strike` or `whiff` also fires
  today's `triggerCameraShake?.(1.8)` (`:321`) and `destroyVoxelsInRadius(bossPos, 5.0, 4-8)` (`:341`)**, both at the
  dragon. `launch` → today's `spawnFireball` (`:159-169`). `lava` → today's `spawnLavaZone` and
  `destroyVoxelsInRadius`. `summon` → today's `spawnMob` pair. `windup` of the roar → its inhale voice (until Unit 7
  adds `dragonRoar`, the windup is silent; it never plays the player's `roar`). Update
  `bossCombat.position`/`health`/`active` every frame, and `resetBossCombat(bossCombat)` in the effect cleanup.
  **Delete the toast calls at `:307-309`, `:336-338`, `:359-361`, `:378-380`** (Unit 3 adds their replacement). The
  per-frame `const now = worldNow();` line stays (census `:203`).
- [ ] **Step 2.6: Re-run the boss gates and the census.** `npx vitest run tests/gates src/render/bossFlash.test.js
  src/game`. Expected: PASS. `world-delta-census-gates:206` still finds `telegraphUntil: worldNow() + LAVA_WINDUP_MS`
  in `BossEntity.jsx`. If it does not, the lava telegraph was rewired outside the clock: fix the code, not the gate.
- [ ] **Step 2.7: Mutants** (each one RED in the named case):
  - **M1** `roarFalloff` returns 1 past 9 m → "roarFalloff: … 0 past 9" **and** "misses at 11 m" (the second only
    because the roar's range is defined through `roarFalloff`; with a separate `d <= radius`, M1 would survive it,
    and the e2e receipt for M1 would be unobtainable).
  - **M2** `hasIntent` ignores `invincible` → "under i-frames does nothing".
  - **M3** windup length 0 (strike on start) → "no strike in the first 519 ms".
  - **M4** roar marked `parryable:true` → "only parryable moves write windupUntil".
  - **M5** the stagger check removed → Unit 4's "a staggered dragon starts nothing" (written there; until then
    record M5 as owed).
  - **M6** `ctx.tricks` ignored → "a removed trick never fires".
  - **M7** cooldown charged at the strike instead of at the windup start → "a cancelled windup never strikes".
  - **M8** the lava placed at the end of a 750 ms cast → "the lava warns once, for 750 ms".
  - **M9** the `Array.isArray(ctx.tricks)` guard removed → "a missing trick list throws".
- [ ] **Step 2.8: Write the e2e** `frontend/tests/e2e/dragon-fight.spec.js`, case **"the roar: hit at 5 m, missed at
  11 m, nothing under i-frames"**, by the `perfect-dodge.spec.js` method (`:12-60`: world frozen at spawn, state
  planted through a test hook, released, judged by `damagePlayer` events). New DEV test hooks in `App.jsx`, beside
  `plantWindup` (`:346-357`):
  - `spawnDragonAt([x,y,z], {phase})`: force-spawn and set HP to the phase's threshold via `phaseForHealth`.
  - `plantDragonMove(move, dueMs)`: writes `rec.move/castUntil|windupUntil` on the world clock.
  - `readDragon()`: a copy of the record, plus `y`.
  - `readImpulses()`: the list of impulses passed to the player's `applyImpulse` since the plant. The DEV build's
    `applyImpulse` shim (`Components.jsx:160-163`) appends each `{x,y,z}` to a log before adding it to
    `knockbackVelocity`/`velocityY`. A velocity is the wrong instrument: the player is a `kinematicPosition` body
    (`:1411`), so a Rapier linear velocity reads about 0 with or without an impulse; the refs decay by
    `exp(-8·delta)` per frame (`:1158-1159`), so on CI's multi-hundred-ms frames a sampled value depends on frame
    timing; and the roll's own motion overlaps any sample. A log of calls has none of those problems.
  - `readBossText()` (used from Unit 3 on): `{ notification, name }` from `useBossSystem`'s return.

  The hit must take more than 0 HP at 5 m and 0 at 11 m. **The knockback is judged presence first:** (a) the 5 m
  no-dodge case requires exactly one logged impulse with a horizontal magnitude of 24 ± 1 (36 × `roarFalloff(5)` ≈
  36 × 0.667); (b) the i-frame case presses Shift through the real listener so the roll covers the due time, asserts
  0 HP **and zero logged impulses** after the first frame whose `worldNow() >= due` (named in the spec). HP alone
  cannot see M2: `damagePlayer` drops the damage under i-frames (`useGameStore.jsx:896`) whether or not the strike
  fired. It runs in CI. Mutants M1 and M2 must turn it RED via `scripts/dev/mutate-e2e.sh` (CI run ids in the
  trailer).
- [ ] **Step 2.9: Gates, then commit:** `feat(boss): every dragon attack has a windup — the roar has a 9 m radius and a dodge skips it whole, impulse included`.

### Unit 3: ground decals replace the toasts; every boss line in both languages

**Files:**
- Create: `frontend/src/render/DragonTelegraphs.jsx` (lazy), `frontend/src/render/dragonTelegraphs.js` (pure),
  `frontend/src/render/dragonTelegraphs.test.js`
- Modify: `frontend/src/render/BossEntity.jsx` (mount `<DragonTelegraphs events={eventsRef} />` beside the effects;
  the projectile loops' damage sources at `:406` `'Dragon Fireball impact'` and `:448` `'Burning Lava AOE'` become
  `t('boss.src.fireball')` and `t('boss.src.lava')`)
- Modify: `frontend/src/world/bossSystem.js:65,79,120,122,150,151` (route through `t()` with `{name}`/`{xp}` vars;
  `:151` is the `grantXP` reason `${stats.name} Defeated!`, also player-visible) and `:219` (`bossName` becomes
  `bossDisplayName(bossTier)`)
- Modify: `frontend/src/game/bossTier.js` (add `bossDisplayName(tier)`: `t('boss.name')`, plus `t('boss.tier', {n})`
  for a return. `bossTierStats().name` stays the English internal id, so `boss-tier-gates` keeps passing)
- Modify: `frontend/src/ui/BossHealthBar.jsx:20` (its `BOSS_CONFIG.name` fallback becomes `bossDisplayName(0)`)
- Modify: `frontend/src/i18n/strings.js` (keys below, en + zh-CN)
- **Precondition:** move 11's U1 is on main (Dependencies). The decal pool follows its `poolAlloc`/`poolStep`
  contract, and uses U7's helpers if U7 is on main.

**Interfaces:**
- Produces: `decalFor(event, bossPos) -> {shape:'ring'|'disc'|'arc', x, z, radius, arc?, heading?, color, until}|null`,
  and `decalOpacity(now, until, windupMs) -> number` (0.25 → 0.75 as the windup ramps, via `windupRamp`).
- Keys: `boss.src.bite`, `boss.src.roar`, `boss.src.fireball`, `boss.src.lava`, `boss.src.diveBomb`,
  `boss.src.tailSweep`, `boss.arrive`, `boss.stirs`, `boss.phase2`, `boss.phase3`, `boss.defeated`,
  `boss.defeatedXp` (the `grantXP` reason), **`boss.name`** (en "Shadow Dragon", zh-CN "暗影巨龙"), **`boss.tier`**
  (en "Risen" / "Risen {roman}", zh-CN with no Latin letters, e.g. "再临" / "第{n}次再临"; the defeated line's "XP" is
  written "经验值" in zh-CN), and `notice.dragonLoadFailed` (if Unit 1 has not already added it). The phase lines
  describe the read, not the
  mechanics, e.g. `boss.phase2`: en "The dragon lands. Leave the ring when it breathes in." zh-CN
  "巨龙落地了。它吸气时，离开地上的红圈。"

- [ ] **Step 3.1: Write the failing tests:** the roar's decal is a ring of radius 9 centred on the dragon; the dive-bite's
  is an arc of reach 5 in the dragon's heading; the lava's is today's ring (the lava keeps its own mesh, and
  `decalFor` returns null for it so it is never drawn twice); opacity is monotonic over the windup; **every new `boss.*`
  key resolves in zh-CN to a string that differs from en** (a missing translation falls back to en at
  `i18n/i18n.js:15`, so key parity alone cannot see it); and **`bossDisplayName(n)` in zh-CN contains no Latin letter
  for n in 0..4**, and every boss line rendered with it in zh-CN contains no `[A-Za-z]` (the name is interpolated
  into those lines, so translating only the template would still show "Shadow Dragon").
- [ ] **Step 3.2: Run.** `npx vitest run src/render/dragonTelegraphs.test.js`. Expected: FAIL, unresolved import.
- [ ] **Step 3.3: Implement** `decalFor`/`decalOpacity`, then `DragonTelegraphs.jsx`: a pool of 4 meshes
  (`ringGeometry`, `circleGeometry`, and a `ringGeometry` with `thetaLength` for arcs), `depthWrite={false}`,
  `transparent`, `toneMapped={false}`, colour `theme/tokens` danger red. It is driven only in `useFrame` through
  `worldDelta`, reading the events the parent wrote to a ref. `visible=false` when idle, so idle decals cost no draw.
- [ ] **Step 3.4: Run.** Expected: PASS. Then `npx vitest run tests/i18n`. Expected: PASS (parity and adoption).
- [ ] **Step 3.5: Mutants:**
  - **T1** `decalFor` returns null for the roar → "the roar's decal is a ring of radius 9" RED.
  - **T2** a zh-CN value copied from en → "differs from en" RED.
  - **T3** opacity inverted → "monotonic" RED.
  - **T4** `bossDisplayName` returns `BOSS_CONFIG.name` → "no Latin letter" RED.
- [ ] **Step 3.6: Lived proof** (added to `dragon-fight.spec.js`): during a planted roar windup, `readDragon()` reports
  exactly one visible decal of radius 9, and zero after the strike. Delete the `<DragonTelegraphs>` mount and it goes
  RED. Run in CI.
- [ ] **Step 3.6b: The zh-CN fight (Acceptance 5's spec).** Switch the locale to zh-CN, spawn the dragon, and drive
  it through phases 1-3 and the kill with the dev hooks. At each step read `readBossText()` (the
  `bossSystem.bossNotification` toast text, `HUD.jsx:625-627`, and the health bar's name) and every `damagePlayer`
  source string from a boss strike. **Presence first:** at least one boss line and the name were read (a spec that
  read nothing would otherwise pass). Then: none contains `[A-Za-z]`. The boss lines never go through
  `addNotification` (`bossSystem.js:33` keeps them in local state), so reading that channel would pass with this unit
  deleted. T4 must turn it RED.
- [ ] **Step 3.7: Gates, commit:** `feat(boss): the dragon's attacks are read from the ground, not from toasts — boss lines in en and zh-CN`.

### Unit 4: the skill answers (perfect dodge, dive-bite landing, riposte, the heavy chain)

**Files:**
- Modify: `frontend/src/game/bossCombat.js` + `bossCombat.test.js` (the adapter, the heavy chain, the hit volume)
- Modify: `frontend/src/Components.jsx:998` (`applyPerfectDodge(withBossTarget(mobsQuery.entities), …)`)
- Modify: `frontend/src/Components.jsx:289-310` (the boss branch tests `bossHitByCone`; on a heavy it calls
  `registerBossHeavy`, and on `'knockdown'` it triggers `HITSTOP.crit` and `playSpatialSound('slam', bp, 0.8, 30)`)
- Modify: `frontend/src/world/bossSystem.js:134-137`. `damageBoss(amount, source = 'player')` applies
  `riposteDamage(amount, bossCombat, worldNow())` for player sources, the `CombatSystem.jsx:40` rule.
- Modify: `frontend/src/render/BossEntity.jsx:241-254`. Phase 0 runs a **dive**: every `diveBite.cooldownMs`, the
  flight target becomes the player at ground + 1.2 m. The `diveBite` windup starts in reach. Staggered or knocked
  down, the target is ground + 0.8 m with no horizontal motion ("wings fold, it lands"). After a stagger in phase 0
  it climbs back to the orbit.
- Modify: `frontend/src/game/heavyAttack.js:18` (the comment says the boss now takes the heavy through the chain, not
  the 800 ms stagger)

**Interfaces:**
- Produces: `withBossTarget(mobs, rec = bossCombat, now = worldNow()) -> object[]`. It returns `mobs` with `rec`
  appended when `rec.active && rec.health > 0 && now >= rec.immuneUntil`, as a new array (called only at dodge start,
  which is rare, so no per-frame allocation).
- Produces: `registerBossHeavy(rec, now) -> 'ignored'|'chained'|'knockdown'`. On a staggered rec:
  `heavyChain += 1`, `staggerUntil = now + STAGGER_MS`. At `heavyChain === KNOCKDOWN_HEAVIES (3)`:
  `knockdownUntil = now + KNOCKDOWN_MS (3000)`, `staggerUntil = knockdownUntil` (so the riposte applies),
  `immuneUntil = knockdownUntil + RECOVER_IMMUNE_MS (4000)`, and `heavyChain = 0`. A rec that is not staggered, or
  already knocked down, returns `'ignored'`. The chain resets when a stagger lapses (checked lazily on the next call).
- Produces: `bossHitByCone(rec, origin, dir, range, angleRad) -> boolean`, `isPointInCone` (`combat/cone.js:25`) over
  `rec.hitPoints`, falling back to `rec.position`.

- [ ] **Step 4.1: Write the failing tests** (in `bossCombat.test.js`):

```js
it('a perfect dodge in the dive-bite windup staggers the dragon for STAGGER_MS', () => {
  const rec = live({ windupUntil: 1000, position: { x: 3, y: 0, z: 0 } });
  const hit = applyPerfectDodge(withBossTarget([], rec, 850), { x: 0, y: 0, z: 0 }, 850);
  expect(hit).toEqual([rec]); expect(rec.staggerUntil).toBe(850 + STAGGER_MS); expect(rec.windupUntil).toBe(0);
});
it('the roar cannot be parried (its windup is a cast)', () => {
  const rec = live({ castUntil: 1000, move: 'roar' });
  expect(applyPerfectDodge(withBossTarget([], rec, 850), origin, 850)).toEqual([]);
});
it('three heavies at a 1.0 s cadence knock it down; at 1.5 s the stagger lapses', () => {
  const a = staggeredAt(0); expect([1000, 2000, 3000].map((t) => registerBossHeavy(a, t))).toEqual(['chained', 'chained', 'knockdown']);
  expect(a.knockdownUntil).toBe(3000 + KNOCKDOWN_MS);
  // 1000 refreshes the stagger to 2400; at 2500 it has lapsed, the chain resets, nothing after it counts
  const b = staggeredAt(0); expect([1000, 2500, 4000].map((t) => registerBossHeavy(b, t))).toEqual(['chained', 'ignored', 'ignored']);
  expect(b.knockdownUntil).toBe(0);
});
it('no stunlock: immune to stagger for RECOVER_IMMUNE_MS after a knockdown', () => {
  const rec = knockedDownAt(3000); expect(withBossTarget([], rec, 3000 + KNOCKDOWN_MS + 1)).toEqual([]);
});
it('a heavy on a dragon that is not staggered is ignored', () => { expect(registerBossHeavy(live({}), 500)).toBe('ignored'); });
it('the cone reaches the head when the centre is out of range', () => {
  const rec = live({ position: { x: 7, y: 0, z: 0 }, hitPoints: [{ x: 3.5, y: 0.6, z: 0 }, { x: 7, y: 0, z: 0 }, { x: 9, y: 0, z: 0 }] });
  expect(bossHitByCone(rec, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 4.5, Math.PI / 2)).toBe(true);
});
```
plus a `dragonMoves.test.js` case: **"a staggered dragon starts nothing"** (this closes M5 from Unit 2) and **"a
knocked-down dragon starts nothing for 3000 ms"**. And a `riposte` case through `bossSystem`'s pure helper
`bossDamage(amount, source, rec, now)`: 10 on a staggered dragon from the player becomes 15, and from any other
source stays 10.

- [ ] **Step 4.2: Run.** `npx vitest run src/game/bossCombat.test.js src/game/dragonMoves.test.js`. Expected: FAIL
  (`withBossTarget`/`registerBossHeavy`/`bossHitByCone`/`bossDamage` not exported).
- [ ] **Step 4.3: Implement** the four functions with the constants above. Add the `BossEntity` dive and landing.
  `BossEntity` writes `rec.hitPoints` every frame: until Unit 5, use chest = centre and head = centre + 2.6 m along
  the heading at the head box's height (`:520`); Unit 5 takes them from the rig.
- [ ] **Step 4.4: Run.** Expected: PASS.
- [ ] **Step 4.5: Mutants:**
  - **K1** `withBossTarget` returns `mobs` unchanged → "staggers the dragon" RED.
  - **K2** `registerBossHeavy` without the stagger refresh → the 1.0 s cadence row RED. This is the mutant that
    proves the roadmap's literal rule is unreachable.
  - **K3** the immunity removed → "no stunlock" RED.
  - **K4** `bossHitByCone` tests only `rec.position` → "reaches the head" RED.
  - **K5** the riposte skipped in `bossDamage` → the riposte case RED.
  - **K6** the staggered branch removed from `BossEntity`'s phase-0 flight target → the e2e landing case RED
    (step 4.6; no unit test can see it, because the flight lives in the component).
- [ ] **Step 4.6: Lived proof** (in `dragon-fight.spec.js`):
  - **"perfect dodge on a planted dive-bite: stagger and landing"**. Dragon at 3 m horizontally, **airborne at
    ground + 1.2 m** (where the dive puts it), phase 0; dive-bite planted due 150 ms on the frozen world. Shift through
    the real listener. Assert `staggerUntil > worldNow`. After release, sample `readDragon().y` on every frame of the
    stagger: it settles into the band within 1 s of world time (from 1.2 m, `nextY` closes 0.1 m in about 0.15 s at
    the `* 2.0` rate of `:269`), and from that sample on, **every** later sample inside the stagger stays within
    ground + 0.8 ± 0.3 (a phase-0 flight target would lift it toward ground + 13, `BossEntity.jsx:248,269`), and after
    the stagger ends it climbs above ground + 3 within 3 s. A grounded start would satisfy "reaches the ground" on its
    first sample, so the start is airborne. **Control:** the same planted windup with the press at 330 ms due
    (outside the 220 ms window) gives no stagger. K1 must turn the spec RED, and so must **K6**: the staggered branch
    removed from the flight target, so a staggered phase-0 dragon keeps its orbit target.
  - **"three heavies chain into a knockdown"**. Stagger planted (hook `plantDragonStagger(ms)`), the dragon placed in
    the camera's facing at 3 m, `Math.random` pinned high as in `heavy-melee.spec.js`. Three real `page.mouse`
    holds of `HEAVY_HOLD_MS + HEAVY_CHARGE_MS + 80` ms at a 1000 ms cadence: `knockdownUntil > worldNow`.
    **Control:** a 1600 ms cadence leaves `knockdownUntil === 0`. K2 must turn it RED.
  - **Touch (Review Focus 5), added only once Phase 0c (`feat/touch-hold`) is on main:** the same chain with
    `hasTouch` and the held action button. Until then this case is listed as **owed** in ACTIVE_PLAN. It is not
    skipped silently.
- [ ] **Step 4.7: Gates, commit:** `feat(boss): the dragon answers the perfect dodge and the heavy — a parried dive-bite lands it, three chained heavies knock it down`.

### Unit 5: the segmented voxel dragon (draws 24 → 4, no point lights)

**Files:**
- Create: `frontend/src/render/dragonRig.js` (pure, three math only), `frontend/src/render/dragonRig.test.js`
- Create: `frontend/src/render/dragonGlow.js` (GLSL string chunks + JS mirror), `frontend/src/render/dragonGlow.test.js`
- **Precondition:** move 11's U1 is on main (Dependencies): this unit consumes `edgeLook`, `telegraphLevel`, `hdrGain`
  and `BLOOM_THRESHOLD`, and U4's ink outline material if U4 is on main.
- Modify: `frontend/src/render/BossEntity.jsx:503-581` (the model block becomes three `instancedMesh` + one outline:
  body, membranes, and the unlit eyes/throat), `:590` (the fireball `pointLight` deleted), `:565` (the boss
  `pointLight` deleted), `:120-139` (refs and flash become instance buffers and a `uFlash` uniform), `:466-485` (the
  animation becomes `poseDragon` on **world** time, read in closed form from `worldNow()`)
- Modify: `frontend/src/game/captureRest.js:20-50` (`BOSS_REST` gains `pose: DRAGON_REST_INPUT`. `bossCaptureReset`
  writes the rest pose into the instance buffer and returns the count it wrote)
- Modify: `frontend/src/render/bossFlash.test.js`, `tests/gates/boss-emissive-gates.test.js:85`,
  `tests/gates/character-render-gates.test.js:29-49`. Re-point them to the new structure. **Each keeps or raises its
  assertion count**, and where possible the assertion moves from source text to the `dragonGlow` mirror (behaviour),
  which lowers the source-grep population
- Modify: `frontend/src/App.jsx:621-635`. `spawnBossCloseup` keeps its camera. The dragon is now larger, so re-frame
  only if the rest pose leaves the frame (judged by eye on the re-shot frame in Unit 5b)

**Interfaces:**
- Produces: `DRAGON_PARTS` (an array of `{id, kind:'plate'|'bone'|'glow', parent:number|-1, box:[w,h,d],
  offset:[x,y,z], color}`, length 40: 37 plate/bone parts drawn by the body mesh, 3 `glow` parts, the two eyes and the
  throat, drawn by the unlit glow mesh), `DRAGON_MEMBRANES` (length 6, each attached to a wing bone),
  `DRAGON_REST_INPUT`, and `DRAGON_REACH` (metres: the radius, from the rig origin, that no posed part corner exceeds
  for any input).
- Produces: `poseDragon(bodyOut: Float32Array /* 37x16 */, membraneOut: Float32Array /* 6x16 */, glowOut:
  Float32Array /* 3x16 */, input) -> void`, where `input = { t:number /* world seconds */, flap:number, inhale:number /*
  0..1 */, stagger:number /* 0..1 */, knockdown:number /* 0..1 */ }`. It allocates nothing (module-level scratch
  objects). `t` is `(worldNow() - mountWorldNow) / 1000`, a closed form, never a sum of per-frame deltas, so the pose
  time is exact at any frame rate (and the slow-motion and death-beat proofs can read it).
- Produces: `dragonHitPoints(bodyOut, groupMatrix, out) -> out` (head, chest, hips in world space). Unit 4's record
  reads these.
- Produces: `GLOW_VERTEX_PARS`, `GLOW_FRAGMENT` (strings), `patchDragonMaterial(material, uniforms)`, and the mirror
  `dragonGlow({ kind, phaseIntensity, flash, tell, ndv }) -> [r,g,b]` for the two LIT meshes (`kind` is `plate` for
  the body and `membrane` for the membranes; one kind per mesh, so no per-instance glow attribute is needed). The
  mirror keeps the existing rule: the flash equals `BOSS_FLASH_EMISSIVE` (3.0) on every lit surface; plates
  `BOSS_EMISSIVE.plate[phase]`; membranes `BOSS_EMISSIVE.membrane[phase]`; rim `pow(1 - ndv, 3) * 0.35` in `#9DB4FF`,
  lerped toward `DANGER` by `edgeLook`'s telegraph level.
- Produces: `eyeLook({ part:'eye'|'throat', phase, flash, inhale }) -> [r,g,b]` for the UNLIT glow mesh
  (`meshBasicMaterial`, `toneMapped={false}`, no shadow). Its base is today's per-phase eye colour (`BossEntity.jsx:501`)
  times `hdrGain(colour, BLOOM_THRESHOLD, margin)` so the eyes bloom past the threshold; the throat scales up with
  `inhale`. Its flash is white times `EYE_FLASH_GAIN`, defined as at least the largest base gain any part reaches
  (the throat at full inhale in phase 2), so **a hit never dims the eyes or throat**, the defect
  `characterStyle.js:108-114` records (an eye band of 3.20 against a flash of 3.00).

- [ ] **Step 5.1: Write the failing rig tests** (`dragonRig.test.js`):
  - **"chains stay attached"**: for t in {0, 0.37, 1.9}, each neck and tail segment's base equals its parent's tip
    within 1e-5.
  - **"the tail is a travelling wave"**: segment 4's yaw at t equals segment 3's yaw at t - k/ω within 1e-4, and
    segment 4's yaw at t differs from segment 3's at t.
  - **"the jaw opens with the inhale"**: jaw pitch 0 at inhale 0, at least 0.6 rad at inhale 1, and monotonic.
  - **"a staggered dragon folds its wings and drops its head"**: wingtip span at stagger 1 is at most 0.5x the span at
    stagger 0, and the head hit point is at most 1.6 m above the feet, inside the cone's 2.2 m band
    (`cone.js:43`).
  - **"the rest pose is deterministic"**: two `poseDragon(DRAGON_REST_INPUT)` buffers are byte-identical.
  - **"the silhouette reads as a dragon, not a box"**: an orthographic front view and a side view, rasterised from the
    rest pose's 40 part boxes into a 64x64 mask. Wingspan must be at least 2.2x the torso width. The head must be at
    least 3 m ahead of the chest and the tail tip at least 4 m behind the hips.
    **Solidity** (filled / convex-hull area) must sit below a threshold that is **measured, not guessed**:
    - encode today's 14-box layout (`BossEntity.jsx:94-106,509-564`, its sizes and offsets) as a test fixture;
    - rasterise both layouts with the same function;
    - set the threshold halfway between the two measured solidities;
    - write both numbers in the test's comment.

    Planning target: the new rig at or below 0.60. If the old layout already measures below the new rig, the metric
    cannot tell them apart: stop and choose another shape statistic before going on.
  - **"draw budget"**: `DRAGON_PARTS.length <= 64`; every `plate`/`bone` part maps to `dragonGlow`'s plate kind and
    every `glow` part to `eyeLook`; exactly 3 `glow` parts.
  - **"the reach sphere holds every pose"**: for t from 0 to 4 s in 0.05 s steps, and each of inhale, stagger and
    knockdown at 0 and 1, every corner of every posed part box (body, membranes, glow) lies within `DRAGON_REACH` of
    the rig origin. three's `InstancedMesh` computes its bounding sphere once, from the matrices it holds at the first
    cull, and caches it (`node_modules/three/src/math/Frustum.js:81-85`), so without a fixed sphere a pose that moves
    far from that first frame can be culled at the screen edges.
- [ ] **Step 5.2: Write the failing glow tests** (`dragonGlow.test.js`):
  - The flash dominates every lit surface: plate and membrane at `flash:1` give 3.0 in every phase.
  - A membrane beats a plate in every phase.
  - **The flash never dims the eyes or throat**: for every phase and inhale in {0, 0.5, 1}, the luminance of
    `eyeLook({flash:1})` is at least that of `eyeLook({flash:0})`, for both parts. This extends the existing
    `BOSS_FLASH_EMISSIVE >= base` rule (`render/bossFlash.test.js`) to the eyes and throat.
  - The eyes' base luminance exceeds `BLOOM_THRESHOLD` in every phase (they bloom).
  - Rim at ndv 1 is 0, and at ndv 0 it is 0.35.
  - A full telegraph turns the rim red (`r > b`).
  - **The GLSL and the mirror agree**: the `GLOW_FRAGMENT` string contains exactly the constants the mirror exports
    (`3.0`, the `BOSS_EMISSIVE` bands, `0.35`, the exponent `3.0`). They are read from the exported constants and
    never retyped, so a retune in one and not the other goes RED.
- [ ] **Step 5.3: Run.** `npx vitest run src/render/dragonRig.test.js src/render/dragonGlow.test.js`. Expected: FAIL,
  unresolved imports.
- [ ] **Step 5.4: Implement** the part table (the counts in D5; colours `#111029` plate, `#2A2438` bone, glow parts
  phase-coloured), `poseDragon` (a chain composition per segment; a travelling sine down the spine and tail; wing
  bones with lag; the jaw on `inhale`; stagger and knockdown blends) and `dragonGlow`.
- [ ] **Step 5.5: Run.** Expected: PASS.
- [ ] **Step 5.6: Wire the render.**
  - One `<instancedMesh args={[unitBox, bodyMat, 37]} castShadow receiveShadow>` with its outline (drei `<Outlines>`
    supports instanced meshes, `Outlines.js:108-110`; move 11's ink material if its U4 is on main).
  - One `<instancedMesh args={[unitBox, membraneMat, 6]} castShadow>` with `transparent opacity 0.85` (today's wing
    value, `:541`).
  - One `<instancedMesh args={[unitBox, eyeMat, 3]}>` (no `castShadow`) whose material keeps today's unlit form,
    `<meshBasicMaterial color={eyeColor} toneMapped={false} />`, so `boss-emissive-gates.test.js:97-98` stays green
    unchanged. Its colour is written per frame from `eyeLook` (an imperative write, not React state).
  - After mount, give each of the three meshes, and the outline's own `InstancedMesh` (the child that shares the body's
    `instanceMatrix`, `Outlines.js:110`), `boundingSphere = new Sphere(origin, DRAGON_REACH)`, so frustum culling stays
    on and stays correct. GPU cost of the choice: none added; an off-screen dragon still issues no draw.
  - `useFrame((s, rawDelta) => { const dt = worldDelta(rawDelta); /* flight, as today */ poseDragon(body, membranes, glow, { t: (worldNow() - t0) / 1000, … }); …needsUpdate = true; })`.
    World time means a hitstop or the slow-motion ramp reaches the wings.
  - Delete the two `pointLight`s.
  - Fireballs keep their mesh with a `meshBasicMaterial` colour scaled above 1.0 (HDR), so they glow through bloom.
- [ ] **Step 5.7: Mutants:**
  - **R1** the chain composition skips the parent transform → "chains stay attached" RED.
  - **R2** the phase lag k = 0 → "travelling wave" RED.
  - **R3** stagger ignored → "folds its wings" RED.
  - **R4** `DRAGON_PARTS` swapped for the old-layout fixture → "reads as a dragon" RED. Its solidity was measured
    above the threshold in 5.1, and the proportion checks fail too.
  - **G1** the flash reduced to `max(base, 3.0 * 0.5)` → "the flash dominates" RED.
  - **G2** a membrane band retyped in the GLSL only → "GLSL and mirror agree" RED.
  - **G3** `EYE_FLASH_GAIN` set below the throat's full-inhale gain → "the flash never dims the eyes or throat" RED.
  - **R5** a part offset pushed 2 m beyond `DRAGON_REACH` → "the reach sphere holds every pose" RED.
- [ ] **Step 5.8: Lived proof** (in `dragon-fight.spec.js`, CI):
  - **"the dragon draws exactly 4, one of them its outline, casts at most 2, and mounts no light"**. The body group
    gets its own name, the literal `'crafty:dragon-body'`, because the outer `'crafty:dragon-chunk'` group also holds
    the fireballs, lava and decals. Under the body group: exactly 4 visible `Mesh`/`InstancedMesh` descendants, of
    which **exactly one is the outline** (the `InstancedMesh` whose `instanceMatrix` is the body mesh's own, as drei
    builds it at `Outlines.js:110`, or move 11's ink material if used). A count of draws alone could not see a dropped
    outline on `low`. Count descendants with `castShadow` ≤ 2. Every instanced mesh's `boundingSphere.radius >=
    DRAGON_REACH`. Run at `setQualityTier('low')` and at `'high'`.
  - **No point light, judged two ways.** (a) `PointLight` descendants of the `'crafty:dragon-chunk'` group: **exactly
    0** (a scene-wide before/after comparison cannot see the always-on boss light at `:565`, which is present on both
    reads). (b) The scene-wide `PointLight` count is unchanged across a fireball spawn, **and a fireball mesh exists
    between the two reads** (without it, a fireball that never launched would pass). **Mutant P1:** the boss
    `pointLight` at `:565` kept → (a) RED. Record the CI run id.
  - **What would still pass if the dragon were deleted?** The counts would read 0. So the spec first asserts the group
    exists and has at least 1 visible draw (a presence before the absence, `gates-and-probes.md:69-72`).
- [ ] **Step 5.9: Gates, commit** (src only, **no baseline**):
  `feat(boss): the Shadow Dragon is a segmented voxel dragon — 4 draws instead of 24, no point lights, a jaw that opens before it breathes`.

### Unit 5b: Baseline-Review, the boss frames (its own commit, no `src/`)

- [ ] Precondition: the Phase 0e re-baseline is on main (check `git log --oneline -- frontend/tests/visual/baseline/`).
- [ ] `cd <repo>/frontend && npm run visual:capture` (on an unloaded machine; it binds 4178 with
  `--strictPort`; sweep `sh scripts/dev/kill-test-procs.sh` after). Open `boss-closeup.png`. **Only** `boss-closeup`
  (and `boss-obsidian` if any dragon shows in it) may differ. Any other frame differing is a regression in Unit 5:
  stop and fix it there.
- [ ] Commit only those PNGs and `.capture-meta.json` with a `Baseline-Review:` trailer naming each frame, what
  changed (box → segmented dragon; point light gone, so the rim and glow now light it) and that it was opened by eye.

### Unit 6: the slow-motion killing blow

**Files:**
- Create: `frontend/src/game/slowMo.js`, `frontend/src/game/slowMo.test.js`
- Modify: `frontend/src/game/worldClock.js:16-30`. `scale = worldTimeScale(...) * slowMoScale(now, slowMoStart)`;
  `worldMs` subtracts `slowMoLostTotal + slowMoLost(now, slowMoStart)`.
- Modify: `frontend/src/store/useGameStore.jsx:364-377`. Add the fields `slowMoStart: 0, slowMoLostTotal: 0`,
  `triggerSlowMo(at)`, which banks the previous ramp's lost time like `hitstopFrozenTotal`. `triggerHitstop`
  returns early while `slowMoBlocksHitstop(now, slowMoStart)`.
- Modify: `frontend/src/world/bossSystem.js:163-165`. A `['slowmo', …]` effect **after** `'hitstop'`:
  `triggerSlowMo(Math.max(now, getState().hitstopUntil))` when `slowMoAllowed(now, lastStart, juiceIntensity,
  isCaptureMode)`.
- Modify: `frontend/src/world/bossSystem.js:147-148` and `:216-220`, **the death beat**. Today the kill beat's first
  effect is `['deactivate', () => setBossActive(false)]`, and after Unit 1 the dragon is mounted only while
  `bossActive`, so it would be unmounted on the same commit and the slow motion would play over an empty arena (the
  fireballs and lava rings live inside `BossEntity`, `:586-606`, so they go too). A new first entry
  `['dying', () => setDragonDying(true)]` runs in the same batch as `'deactivate'`, so React commits both together and
  the dragon never leaves. `'deactivate'` stays where it is, so the music, the danger mood, the save mirror and the
  health bar end on the kill exactly as today (a save in the window reads `active:false`, never a dead live fight).
  `dragonDying` clears on a real-time timeout of `HITSTOP.boss + SLOWMO.ms + 100` ms, tracked like the notification
  timers so it cannot fire after unmount. The hook returns `dragonDying`.
- Modify: `frontend/src/render/dragonLoader.js` (`dragonMounted({ bossActive, dragonDying }) -> boolean`, pure) and
  `frontend/src/GameScene.jsx` (mount `LazyDragon` when `dragonMounted(...)`, passing `dying`).
- Modify: `frontend/src/render/BossEntity.jsx`. With `dying` set and `bossActive` false it renders the rig only: no
  `stepDragon`, no flight, no projectiles (cleared, as the inactive path does today at `:187-195`), `bossCombat`
  reset (so nothing can parry it), and the pose input `knockdown` ramping 0 → 1 over the dying window on world time,
  so the collapse itself plays in slow motion.
- Modify: `tests/gates/world-delta-census-gates.test.js` only if its closed-form cases (C1/C7) need the new term.
  **Extend; do not loosen.**

**Interfaces:**
- Produces: `SLOWMO = Object.freeze({ floor: 0.15, ms: 600, minGapMs: 10000 })`.
- Produces: `slowMoScale(now, start) -> number`: 1 before `start`, then linear from `floor` to 1 over `ms`, then 1.
- Produces: `slowMoLost(now, start) -> number`, the closed form
  `(1-floor)*τ - (1-floor)*τ²/(2*ms)` for τ in [0, ms]. The full ramp is **255 ms**.
- Produces: `slowMoAllowed(now, lastStart, juice, capture) -> boolean`.
- Produces: `slowMoBlocksHitstop(now, start) -> boolean`: true from the moment a ramp is scheduled
  (`start > 0 && now < start + ms`).

- [ ] **Step 6.1: Write the failing tests** (`slowMo.test.js`):

```js
it('scale: 1 before, 0.15 at start, 0.575 at mid, 1 at end', () => {
  expect(slowMoScale(999, 1000)).toBe(1); expect(slowMoScale(1000, 1000)).toBeCloseTo(0.15);
  expect(slowMoScale(1300, 1000)).toBeCloseTo(0.575); expect(slowMoScale(1600, 1000)).toBe(1);
});
it('lost time is the integral: 191.25 at mid, 255 for the full ramp', () => {
  expect(slowMoLost(1300, 1000)).toBeCloseTo(191.25); expect(slowMoLost(5000, 1000)).toBeCloseTo(255);
});
it('at most one ramp per 10 s; none at juice 0; none in capture', () => {
  expect(slowMoAllowed(15000, 6000, 1, false)).toBe(false); expect(slowMoAllowed(17000, 6000, 1, false)).toBe(true);
  expect(slowMoAllowed(17000, 6000, 0, false)).toBe(false); expect(slowMoAllowed(17000, 6000, 1, true)).toBe(false);
});
```
In `world-delta-census-gates` (or a new colocated `worldClock.test.js`, preferred because it reads no source), with
`tickWorldClock(now)` driven over an injected store timeline:
- **"worldNow never runs backwards across a kill, a ramp and a hit during it"**: sample every 5 ms from a 160 ms
  hitstop, through a ramp scheduled at its end, with `triggerHitstop(90)` attempted at ramp + 100. `worldNow` must
  be non-decreasing at every sample, and the total lost time must equal 160 + 255.
- **"worldDelta is 0.15x at the start of the ramp"**.

And for the death beat, in `dragonLoader.test.js` and the kill-beat gate's pattern
(`tests/gates/boss-killblock-gates.test.jsx`, behavioural):
- **"the dragon stays mounted through its death beat"**: `dragonMounted({bossActive:false, dragonDying:true})` is
  true, and with both false it is false.
- **"the kill commits dying and inactive together, and dying ends after the ramp"**: drive a kill with fake timers;
  on the commit where `bossActive` turns false, `dragonDying` is true; at `HITSTOP.boss + SLOWMO.ms + 100` ms it is
  false.

- [ ] **Step 6.2: Run.** `npx vitest run src/game/slowMo.test.js src/game/worldClock.test.js
  src/render/dragonLoader.test.js`. Expected: FAIL.
- [ ] **Step 6.3: Implement** with the closed form. No per-tick accumulation (the R6.6 lesson at
  `worldClock.js:20-24`).
- [ ] **Step 6.4: Run.** Expected: PASS. Then `npx vitest run tests/gates/world-delta-census-gates.test.js
  tests/gates/world-hitstop-gates.test.js`. Expected: PASS.
- [ ] **Step 6.5: Mutants:**
  - **S1** `slowMoBlocksHitstop` always false → "never runs backwards" RED.
  - **S2** `slowMoLost` dropped from `worldMs` → "the integral" plus a census closed-form case RED.
  - **S3** the 10 s gap removed → "at most one ramp" RED.
  - **S4** the ramp starts at the kill instead of at the end of the hitstop → "never runs backwards" RED. (Not the
    total-lost check: each closed form integrates on its own, so the total is still 160 + 255 under the overlap. What
    breaks is the overlap itself, where both subtract and `worldNow` runs backwards.)
  - **S5** the `'dying'` entry removed from the kill beat → "the kill commits dying and inactive together" RED.
- [ ] **Step 6.6: Lived proof** `frontend/tests/e2e/slow-mo-kill.spec.js` (CI). **Judged on the clock in closed form,
  not on per-frame deltas.** A loaded CI runner draws a frame every few hundred ms and stalls for a second or more
  inside a freeze (`perfect-dodge.spec.js:12-14,55-56`), and a world consumer's delta is `rawDelta × scale` sampled
  once per frame (`worldClock.js:43-45`), so a 600 ms ramp seen in 1-3 frames cannot give a meaningful rate over a
  300 ms window. New DEV hook `readClock()`: `{ wall, world, scale }`, all three from the **same**
  `tickWorldClock` call (the ticker keeps the `now` it was given). Lost time is `wall - world`.
  - **Presence:** read `readClock()` before the kill; then hook `plantBossKill()` calls the real `damageBoss(health)`.
    On the first sample after it, `readDragon().active` is false and `windupUntil` is 0 (the combat record is
    cleared, so a perfect dodge cannot "parry" a dead dragon).
  - **The ramp happened:** at the first sample whose `wall` is at least 1000 ms after the kill (well past the 160 ms
    hitstop and the 600 ms ramp), the lost time grew by **415 ± 5 ms** (160 + 255). S2 or a removed `'slowmo'` entry
    gives 160: RED.
  - **The dragon was on screen through it:** `readDragon()` gains `dying` and `poseT`. Every sample taken while
    `dying` is true finds the `'crafty:dragon-chunk'` group with at least one visible draw, and the spec asserts at
    least one such sample inside the ramp (the denominator; zero samples fails as "could not measure", never as a
    pass). Across the dying window, `poseT` advances by exactly the `world` delta of the same ticks (the rig is on
    world time), so the collapse slowed with the world. Once `dying` is false, the group is gone. S5 turns it RED.
  - **Coarse world-consumer check:** an XP orb from a zombie killed first still ages across the window (`readOrbs`),
    with the number of samples asserted, so a frozen world cannot pass.
  - **Control:** a second, ordinary zombie kill grows the lost time by its own hitstop only (no +255).
- [ ] **Step 6.7: Gates, commit:** `feat(feel): the killing blow on the dragon slows the world for 600 ms — the world clock gains a scale, the UI stays real-time`.

### Unit 7: the entrance roar

**Files:** Modify `frontend/src/game/bossEntrance.js:58-65` and `frontend/src/game/bossEntrance.test.js`,
`frontend/src/world/bossSystem.js:78-88`, `frontend/src/audio/synthVoices.js` (a new `makeDragonRoar` recipe,
registered as `dragonRoar` beside `:733`) and its test, and `frontend/src/render/BossEntity.jsx` (the roar inhale
plays `dragonRoar`).
**Interfaces:** `bossEntranceBeat({ notify, roar, shake, bloom, hitstop })` returns
`[['notify'], ['roar'], ['shake'], ['bloom'], ['hitstop']]` in that order (notify stays first, `bossEntrance.js:50-53`).
`makeDragonRoar(ctx)` keeps the player-vs-enemy audio split (`synthVoices.js:84-86`): built from `makeAggroGrowl`'s
enemy recipe (the lunging pitch and the dissonant fifth), but lower and longer than the player's WILDHEART `roar`
(`makeRoarSound`, 0.7 s), so the dragon sounds like the biggest enemy and never like the hero.

- [ ] **Step 7.1:** failing tests. In `bossEntrance.test.js`: membership includes `roar`, `notify` is still first, and
  `roar` comes before `shake`. In the synth voices test: `dragonRoar` is registered, is a different recipe from
  `roar`, is longer than `roar`'s buffer, and its zero-crossing rate (computed on the data the fake context in
  `src/audio/synthVoices.test.js:29-34` hands back) is below `roar`'s, i.e. lower-pitched.
- [ ] **Step 7.2:** `npx vitest run src/game/bossEntrance.test.js` plus the voices test. Expected: FAIL.
- [ ] **Step 7.3:** add them. `bossSystem` passes
  `roar: bStore.isCaptureMode ? null : () => bStore.playSpatialSound?.('dragonRoar', [lair.x, y, lair.z], 1, 60)`.
  The roar windup in `BossEntity` plays `playSpatialSound('dragonRoar', bossPos, 0.8, 40)`. Update the "NO ROAR"
  paragraph (`:14-17`) to say the dragon has its own voice and where it is wired.
- [ ] **Step 7.4:** run. Expected: PASS. **Mutant E1:** `roar` dropped from the list → RED. **Mutant E2:**
  `dragonRoar` registered as `makeRoarSound` → the "different recipe / lower" case RED.
- [ ] **Step 7.5: Lived proof:** in `dragon-fight.spec.js`, spy `playSpatialSound` and walk to the lair through the
  real arrival poll (player teleported to 30 m, level set to 5, then moved to 20 m). `'dragonRoar'` must fire exactly
  once, and the player's `'roar'` zero times.
  Commit: `feat(boss): the dragon roars when it wakes, in its own voice`.

### Unit 8: each return learns a move (dive-bomb, tail sweep) and the tricks hook for move 14

**Files:** Modify `frontend/src/game/bossTier.js:35-55` and `tests/gates/boss-tier-gates.test.js` (or a colocated
`bossTier.test.js` if none reads tricks yet); `frontend/src/game/dragonMoves.js` and its test;
`frontend/src/render/dragonTelegraphs.js` (disc and arc decals).
**Interfaces:**
- `bossTierStats(tier).tricks` and `CORE_MOVES` already exist (Unit 2, every tier `['fireball','lava','summon']`).
  This unit extends the list: tier 1 adds `'diveBomb'`, tier 2+ also `'tailSweep'`.
- `DRAGON_MOVES.diveBomb {windupMs:1100, radius:4, cooldownMs:9000, parryable:false, phases:[0]}` and
  `tailSweep {windupMs:600, radius:6, arc:3*Math.PI/2, cooldownMs:7000, parryable:true, phases:[1,2]}`.
- **For move 14 (relight the frontier):** removing a trick is `tricks.filter(...)`, and HP stays in
  `bossTierStats(...).health`. Move 14's plan owns `shrinesLit`; this unit only guarantees the list is the one place
  the machine reads.

- [ ] **Step 8.1:** failing tests:
  - Tier 0 has no `diveBomb`; tier 1 has it; tier 2 has both.
  - `CORE_MOVES` never appear in `tricks` (kept from Unit 2, now over tiers 0-4).
  - **"the machine reads only `ctx.tricks` for non-core moves"**: at tier 2 with `tricks: []`, no dive-bomb or tail
    sweep over 30 simulated seconds.
  - The tail sweep hits a player at 5 m behind and misses one at 5 m in front (the arc).
  - The dive-bomb's decal is a disc of radius 4 at the target, growing over 1100 ms.
- [ ] **Step 8.2:** `npx vitest run src/game/dragonMoves.test.js tests/gates/boss-tier-gates.test.js`. Expected: FAIL.
- [ ] **Step 8.3:** implement. The dive-bomb's flight goes in `BossEntity`'s phase 0 branch, like the dive-bite.
- [ ] **Step 8.4:** run. Expected: PASS. Mutants:
  - **N1** `tricks` built without the tier check → "tier 0 has no diveBomb" RED.
  - **N2** the machine reads `DRAGON_MOVES` keys instead of `ctx.tricks` → "reads only ctx.tricks" RED.
  - **N3** the arc test dropped → "misses at 5 m in front" RED.
- [ ] **Step 8.5:** commit `feat(boss): each return of the dragon learns a move — a dive-bomb at Risen, a tail sweep at Risen II`.

### Unit 9: the arena lit like a stage (+ its own Baseline-Review commit)

**Precondition:** move 4 (the light and colour script) is on main. Re-read `render/mood.js` and `theme/tokens.js`
first. If move 4 has replaced the obsidian rows with a boss overlay, apply the same deltas there and cite its lines
in the commit.

**Files:** Modify `frontend/src/render/mood.js:27` and `:57`, `frontend/src/theme/tokens.js:29-34`, and
`tests/render/mood.test.js`.

- [ ] **Step 9.1:** failing tests in `tests/render/mood.test.js`:
  - Obsidian `fogDensity` is at most 0.012.
  - Obsidian grade saturation is at least -0.30.
  - **The floor reads:** relative luminance (WCAG sRGB) of obsidian `grass` and `rock` is at least 0.05. Today
    `#2A2438` measures about 0.020 and `#262030` about 0.017; both are hand calculations for this plan, and the test
    recomputes them.
  - **Silhouette contrast:** `skyHorizon`'s luminance is at least 3x the dragon plate colour `#111029`'s (about
    0.0065). Today's `#2A1622` gives about 1.8x, so the test is red now.
  - The luminance helper is checked against pure primaries on white, so each coefficient is pinned
    (`gates-and-probes.md:78-85`).
- [ ] **Step 9.2:** `npx vitest run tests/render/mood.test.js`. Expected: FAIL on all four.
- [ ] **Step 9.3:** set the values: fog 0.0110; grade `{ saturation: -0.25, brightness: -0.01, contrast: 0.18 }`;
  `grass '#4A3F5E'` (about 0.057), `rock '#473E57'` (about 0.055), `skyHorizon '#6A1A2A'` (about 0.040, about 6x the
  plate). These are a starting point. Tune them on the lookbook frames, not on numbers, and never below the test
  floors.
- [ ] **Step 9.4:** run. Expected: PASS. Mutant **A1:** fog back to 0.0200 → RED.
- [ ] **Step 9.5: Lava cracks:** only if `world/oreGlow.js` is on main. Then a cracked-obsidian emissive layer goes
  in the arena floor within 24 m of `blightHeartSite()`, through the ore-glow term, with its own tests in that
  module's pattern. If it is not on main, this step is **not done**, and ACTIVE_PLAN says so.
- [ ] **Step 9.6:** commit src (`feat(boss): the dragon's arena is lit like a stage — half the fog, a floor you can read, a crimson band behind it`).
  Then, **separately**, the `boss-obsidian` re-shoot as a `Baseline-Review:` commit (as in Unit 5b).

### Unit 10: the dragon in the lookbook (the instrument for Acceptance)

**Precondition:** `feat/instruments` is merged (`lookbook.mjs`, `_lookbook.mjs`, `render/lookbookSeam.js`).

**Files:** Modify `frontend/src/render/lookbookSeam.js` (`dragon({ pose })`, live only behind `?lookbook=1`;
`installLookbookSeam` at `:110` on `feat/instruments`); `frontend/scripts/visual/_lookbook.mjs` (a `dragon-arena`
place, and if `TARGETS` still lacks them, `chromium-1180x820` and `chromium-820x1180`);
`frontend/tests/gates/lookbook-seam-gates.test.js` and `frontend/tests/gates/lookbook-plan-gates.test.js` (both on
`feat/instruments`: a `dragon` case in each. These are assertion rewrites of existing gates, so they need a
`Mutation-Proof:` trailer); `frontend/tests/e2e/lookbook-seam.spec.js` (the seam's `dragon()` is reachable on the
production build). **And the spawn path the seam needs**, because the only force-spawn today is DEV-only
(`world/bossSystem.js:185-186`, `if (import.meta.env.DEV) { … forceBossSpawn …`) and `installLookbookSeam`'s
dependencies (`store, setActive, getActive, cycleOf, glInfo, contextLosses`, `lookbookSeam.js:110` on
`feat/instruments`) include none that can spawn: `frontend/src/world/bossSystem.js` (a `lookbookSpawnDragon(pos,
pose)` that exists only when `parseLookbookParam(location.search)` is true, built from the same body as
`forceBossSpawn`, plus `preloadDragon()`), the seam's wiring site in `frontend/src/index.jsx` (inject it as a new
`spawnDragon` dependency), and `frontend/src/game/bossCombat.js` (a `lookHold: null|'rest'|'inhale'|'staggered'` field
that `dragonCtx`/the rig honour by holding that pose; only the seam sets it, the move-11 `lookHold` pattern).

- [ ] **Step 10.1:** failing seam test: without `?lookbook=1`, `window.__craftyLookbook` is undefined (unchanged)
  **and `lookbookSpawnDragon` is not installed** (the production game has no spawn seam). With it,
  `dragon({pose:'inhale'})` reports a live dragon at the lair and `bossActive` true. An unknown pose throws a
  `TypeError` naming the pose. The e2e on the production build (`npm run build` + preview, CI) calls `dragon()` and
  finds the `'crafty:dragon-chunk'` group: presence on the bundle that ships, not on the dev server.
- [ ] **Step 10.2:** run `npx vitest run tests/gates/lookbook-seam-gates.test.js tests/gates/lookbook-plan-gates.test.js`.
  Expected: FAIL. Implement. Run. Expected: PASS. Mutant **B1:** the param guard removed → the "without
  ?lookbook=1" case RED. Mutant **B2:** `lookbookSpawnDragon` installed unconditionally → the "no spawn seam without
  ?lookbook=1" case RED.
- [ ] **Step 10.2b: The heat instrument's scenario.** Extend `scripts/visual/gpu-cost-probe.mjs` (on main, production
  build) with `--scene dragon-arena`, which loads `?lookbook=1`, spawns through the seam, and measures with and
  without the fight at the same camera; and add the same `dragon-arena` scenario to the lookbook's `--hold` mode that
  `scripts/dev/power-ab.sh` drives (on `feat/instruments`). Both are for Acceptance 3.
- [ ] **Step 10.3:** commit `feat(lookbook): the dragon arena is a lookbook place — the fight on a real GPU, both engines, both iPad viewports`.

---

## Acceptance (lived proof, in the running game)

The milestone is done when **all** of these are true, each seen. A green unit suite alone is not enough.

1. **CI e2e green** with `dragon-fight.spec.js` and `slow-mo-kill.spec.js` in the run: the roar control (5 m hit,
   11 m miss, i-frames whole); the perfect dodge on a planted dive-bite with its early-press control; the heavy chain
   with its slow-cadence control; the airborne-start landing; one decal during a roar windup; the draw/shadow/light
   counts at `low` and `high` (exactly 4 draws, one outline, 0 point lights under the dragon); the entrance roar in
   the dragon's own voice; the slow-motion ramp (judged on the closed-form clock) with the dragon on screen through
   it and the ordinary-kill control; the zh-CN fight. **What would still pass if the feature were deleted:** every
   spec asserts a presence first (the dragon group exists with at least 1 draw; the planted windup reads back; one
   impulse is logged at 5 m; at least one boss line is read; a fireball exists between the light counts; at least one
   sample falls inside the ramp), and every spec carries a control that a deleted or always-on feature would fail.
   The mutate-e2e receipts for M1, M2, K1, K2, K6, P1, S2, S5 and T4 are in the trailers.
2. **Real-GPU, motion-on lookbook frames, opened by eye.** `node scripts/visual/lookbook.mjs --targets
   chromium-1280x800,chromium-1180x820,chromium-820x1180,webkit-1180x820,webkit-820x1180` on the production build, on
   an unloaded machine. Chromium must report ANGLE Metal (the probe refuses SwiftShader, `lookbook.mjs` header). Shots
   at `dragon-arena` in poses rest, inhale and staggered, at night (0.75) and golden hour (0.48), at tiers `low` and
   `high`. Open the contact sheet. The check, written down per shot in ACTIVE_PLAN:
   - the dragon reads as a dragon at the iPad viewports;
   - the floor where decals land is readable;
   - the throat glows during the inhale;
   - nothing renders navy or black where it should be lit (the 2026-10-27 WebKit finding);
   - the shot is valid in `lookbook.json`.

   **And the 64 px silhouette:** downscale the rest-pose `boss-closeup` frame to 64 px and threshold it to black.
   It must read as a dragon to a person who was not told what it is. The rig's solidity test (Unit 5) is the
   regression floor, not this judgement.
3. **The heat check, in two parts with an instrument each.** The roadmap's "+0.3 ms of GPU" has no instrument here:
   nothing in `scripts/` or `src/` reads a GPU timer query, `gpu-cost-probe.mjs` reports draw calls, triangles,
   programs and GL errors (its header), and `power-ab.sh` measures whole-chip watts at spawn and is for the operator
   only ("No agent runs this script", `power-ab.sh:2-5`; "it says nothing about combat", `:34-35`). So:
   - **(a) Structural, agent-run, blocking.** `node scripts/visual/gpu-cost-probe.mjs --scene dragon-arena` (Unit
     10.2b) on the production build, 3 runs each with and without the fight at the same camera and time of day.
     Pass: the fight adds at most 4 + 2 (decals) + live fireballs draw calls (plus 2 shadow draws per shadow
     render), and **0 programs** across a fireball spawn and despawn. The dragon group's own counts per tier are the
     CI e2e's job (Unit 5.8); the probe sees only frame totals. Report the per-run numbers.
   - **(b) Heat, Kevin-run, blocking for calling the milestone done.** Kevin runs `power-ab.sh` twice at an ordinary
     night at the Hearth (to measure the run-to-run spread), then once with the `dragon-arena` hold scenario, 120
     samples each after the default warmup, same Mac on mains. Pass: the fight's mean GPU power is within the
     ordinary night's mean plus twice the spread between the two ordinary-night runs. Requested in
     KEVIN-REVIEW-BATCH with the exact commands; until he has run it, ACTIVE_PLAN lists it as **owed**, not done.
4. **Bundle:** `bundle-budget.mjs` green, with the dragon marker only in its lazy chunk, and `index` smaller than
   before Unit 1 by the measured amount.
5. **i18n:** switch to zh-CN and run a planted fight through phases 1-3 and the kill (the dev hooks). No English boss
   line appears, and the dragon's name is in Chinese. Checked by `dragon-fight.spec.js` step 3.6b, reading the channel
   the player actually sees: `readBossText()` (the `bossSystem.bossNotification` toast, `HUD.jsx:625-627`, and the
   health bar's name) and the boss strikes' `damagePlayer` sources, with a presence check first and then no
   `[A-Za-z]` in any of them. (Not `addNotification`: after Unit 2 no boss line goes through it, so a check there
   would pass with Unit 3 deleted.)
6. **Touch:** the touch dodge (`ui/TouchControls.jsx:205-214`) performs the perfect dodge in the e2e on an emulated
   iPad. The heavy chain on touch is proven once Phase 0c is merged, or listed as owed.

## Verification gates (run from `<repo>/frontend` before every commit; the pre-commit hook runs the first nine)

| Gate | Command | Expected |
|---|---|---|
| unit + static gates | `npm run test:unit` | PASS; the suite total printed is the previous total plus this unit's new tests |
| lint | `npm run lint` | 0 errors (`no-unused-vars` is an error: the deleted toasts and lights leave no orphans) |
| build | `npm run build` | succeeds |
| bundle | `node scripts/ci/bundle-budget.mjs` | `✓ index` under 760,000 B; `✓ dragon` marker only in the lazy chunk (from Unit 1 on) |
| doc-currency | `node scripts/ci/doc-currency.mjs` | PASS. Plans are not in its canonical list (`doc-currency.mjs:38-50`), so this file's not-yet-created paths do not red it. `memory/ACTIVE_PLAN.md` and `ARCHITECTURE.md` are in the list, and must cite only paths that exist |
| gate-shape, killability, cli-guard | `node scripts/ci/gate-shape.mjs && node scripts/ci/killability-ledger.mjs && node scripts/ci/cli-guard.mjs` | PASS; the killability count does not rise (every new check file carries its `Mutation-Proof:` line) |
| opsec | `node scripts/ci/opsec-scan.mjs --all` | PASS |
| trailers (push) | `node scripts/ci/mutation-proof-trailer.mjs <range>` and `node scripts/ci/baseline-trailer.mjs <range>` | PASS: gate commits carry `Mutation-Proof:`, and baseline commits carry `Baseline-Review:` and no `src/` |
| e2e (CI) | `ci ok` on the land branch's exact sha | PASS: every shard green (e2e-freshness was deleted by W2-C) |
| review | a fresh headless `/code-review xhigh` per unit's range; one pointed adversarial reviewer at **xhigh** on Units 1, 4 and 6 (they cross runtime seams: lazy loading, the dodge-start, the world clock) | findings fixed or ledgered with an owner |

Then `superpowers:verification-before-completion` and `plan-verify-kz` against this file's task list before the
milestone is called done. ACTIVE_PLAN carries the cursor.

## Risks

- **The world-clock scale is a shared door** (roadmap "door"). Twelve non-test source files call `worldDelta(`
  (grep, 2026-10-27), and the AI worker's timers ride `worldNow` (`worldClock.js:33-37`). A fractional scale reaches all of them, which is the point, and a bug there would slow the whole
  world. Mitigation: closed form only, the monotonicity test, the hitstop block during a ramp, and the adversarial
  review on Unit 6.
- **Lazy loading in the middle of a moment.** A cold chunk at arrival on a slow iPad connection means the dragon
  appears late. Mitigation: preload when the player qualifies (often minutes before arrival), the 220 ms entrance
  freeze, the dragon's own Suspense boundary (a pending chunk hides only the dragon), and the retrying boundary.
  Residual: a first arrival with the network down shows a notice and no dragon until a retry succeeds; after the last
  retry the encounter is suspended with its HP kept and the lair re-armed. That is better than today's alternative for
  panels, which was the reload screen.
- **Instanced outlines on WebKit/low tier.** drei's instanced outline shares `instanceMatrix`
  (`Outlines.js:108-110`). `count` is fixed at creation, so the part count must never change at runtime: constants
  37 (body), 6 (membranes) and 3 (eyes/throat), asserted. If WebKit shows outline artefacts in the lookbook, the
  fallback is outline-off for the dragon only on `low`, stated as a cost trade in the commit (and the draw-count case
  then changes to exactly 3 on `low`, by the same commit).
- **Frustum culling of a posed instanced mesh.** three caches an `InstancedMesh`'s bounding sphere from the first cull
  (`Frustum.js:81-85`). Mitigation: a fixed `DRAGON_REACH` sphere on every dragon mesh, the rig test that no pose
  exceeds it, and the e2e that reads each radius.
- **Balance.** The dive-bite cadence, the 1.4 s stagger and the knockdown are tuned against today's 14 m/s walk.
  Move 5's combat stance changes that (roadmap "door"). Re-tune after move 5 lands, via a DECISIONS entry. The e2e
  cadences (1.0 s chain, 1.6 s control) do not change.
- **A dodgeable roar makes phase 2 trivial** (roadmap "threat"). The radius and inhale are constants in one table, to
  be tuned in playtest. The decal makes it readable, not free.
- **Source gates go blind when code moves.** Seven boss gates read `BossEntity.jsx` as text. Mitigation: keep the
  path, re-point within each unit, and treat a falling assertion count as RED (Unit 1, step 1.9).
- **Slow motion read as lag** (roadmap "threat"). Only the boss kill triggers it in this plan, at most once per
  10 s, and never at juice 0.

## Out of scope

- The ember cache, or any death penalty in the fight (death stays soft, `DECISIONS.md:61-62`).
- WebGPU/TSL, a three bump, CSM (`DECISIONS.md:58-60`).
- Move 14's shrine events and `shrinesLit`. This plan only provides the `tricks` list and the HP field it will
  modify.
- Recorded roar samples and a world-bus playback rate for slow motion (move 8, sound with body). A synth
  `dragonRoar` voice (Unit 7) is used; the player's WILDHEART `roar` is never played for the dragon.
- A shared light pool (move 11). This plan removes the dragon's lights instead.
- Sky light and block light in the arena (move 12).
- Third-person beast form during the fight. Gamepad.
- Slow-motion triggers other than the dragon's death (the captain kill and shrine lighting belong to moves 10 and
  14, which call `triggerSlowMo`).

## Open questions

1. **Kevin (FYI, non-blocking):** the roadmap's "three heavies inside one 1.4 s stagger" is unreachable with a 700 ms
   minimum heavy. This plan makes it a chain (each heavy refreshes the stagger). The alternative is a longer stagger
   for the dragon only (about 3 s, no chain). Recommendation: the chain. It rewards rhythm and keeps one stagger
   number across mobs and the boss. Batched to KEVIN-REVIEW-BATCH.
2. Should the slow-motion ramp also apply to the dragon's death **sound** (pitch-down on the world bus), or wait for
   move 8? This plan waits.
3. ~~When move 11 lands its merged-part pipeline, should the dragon migrate onto it?~~ Settled by the review
   amendments: move 11's U1 is a precondition for Units 3 and 5, which consume its edge telegraph, HDR gain, decal
   pool contract and (if landed) ink outline. The articulated `dragonRig` solver stays the dragon's own, because move
   11's rig is a single vertex-shaded mesh per mob (its M3). Still open: the DECISIONS entry for building Units 1, 2,
   4, 6 and 7 before move 11 (Dependencies).
4. Kevin's iPad iPadOS/Safari version (umbrella open question) decides whether the WebKit lookbook frames stand in
   for his device.

## Review amendments (2026-10-27)

An adversarial review of this plan returned 23 findings (its verdict text says 25, counting the sub-items of #20 and
#23 separately). Each was treated as a hypothesis and re-checked against the code before the plan changed. **23
applied, 0 rejected.** Four of them corrected the plan's own prose rather than its design (#15, #16, #17 and the
voice sentence in #14). Nothing was built or committed; the only file edited is this plan.

| # | Sev | Finding | Re-verified by | Disposition |
|---|---|---|---|---|
| 1 | HIGH | The lazy dragon has no Suspense of its own; a pending chunk hides and stops the whole world | `GameScene.jsx:360-412` (one Suspense wraps Physics, world, Player, PostFX); `lazyPanels.js:41-50,70` (error boundary only); R3F `useFrame` subscribes in a layout effect (`events-*.esm.js:1185`) and its reconciler has `hideInstance`. **Repro run** (react-dom 19.2.8, jsdom 29.1.1): without an inner boundary the sibling went `display: none` and logged `UNSUB`; with one, neither happened | **Applied.** Inner `<Suspense fallback={null}>` in `LazyDragon` (Unit 1 Interfaces); boundary tests in `LazyDragon.test.jsx` incl. a presence control; mutant L5 |
| 2 | MED | The i18n acceptance reads `addNotification`, the wrong channel; the boss name stays English | `bossSystem.js:33,65,79,120,122,150,151`, `HUD.jsx:625-627`, `bossConfig.js:4`, `bossTier.js:30,46`, `BossHealthBar.jsx:20`; also `BossEntity.jsx:406,448` damage sources | **Applied.** `bossDisplayName`, `boss.name`/`boss.tier`/`boss.defeatedXp` keys, no-Latin unit test, step 3.6b reads `readBossText()` and damage sources with a presence check; Acceptance 5 rewritten; mutant T4 |
| 3 | MED | Unit 2 reads `ctx.tricks`/core moves that only arrive in Unit 8 | `bossTier.js:35-55` has no `tricks`; plan Unit 2 file list had no `bossTier.js` | **Applied.** `tricks` (tier 0 `fireball, lava, summon`) and `CORE_MOVES` move to Unit 2; `dragonCtx` builds `ctx` from the tier; `stepDragon` throws on a missing list; Unit 8 only extends; mutant M9 |
| 4 | MED | The plan builds before move 11, against the refute's "after 11" | `refute-2026-10-27.md:104`, `masterpiece.md:7-8`, `roadmap…json:218`; move 11's plan (`2026-10-27-crafty-feedback-grammar.md`) produces `edgeLook`, `telegraphLevel`, `hdrGain`, `DANGER`, the ink outline and decal pools | **Applied.** Move 11's U1 is a precondition for Units 3 and 5; Units 1, 2, 4, 6, 7 may go first only after a dated DECISIONS entry records that partial reversal, else the whole plan waits |
| 5 | MED | Moving the eyes into the lit body reverses a recorded decision and can bring back "a hit dims the eyes" | `boss-emissive-gates.test.js:97-98`, `characterStyle.js:108-114`, `BossEntity.jsx:501,557-564` | **Applied (keep the decision).** Eyes and throat stay an unlit, non-tone-mapped `meshBasicMaterial` in a third instanced mesh, so the gate stays green unchanged; `eyeLook` with `EYE_FLASH_GAIN` ≥ every base and a flash-never-dims test; mutant G3. Cost: 4 draws, not 3, and the plan's draw counts are updated everywhere |
| 6 | MED | The slow-motion kill plays after the dragon has been unmounted | `bossSystem.js:147-148` ('deactivate' first), `BossEntity.jsx:187-195,488`, plan's `{bossActive && <LazyDragon/>}` | **Applied.** A `'dying'` effect committed with 'deactivate' keeps the rig mounted in a world-time collapse until the ramp ends, while music, mood, save and health bar still end on the kill; the pose time becomes closed-form `worldNow()`; the e2e asserts the group exists through the ramp; mutant S5 |
| 7 | MED | The retry cap contradicts "never an invisible dragon whose health bar stays up forever" | plan Unit 1 vs Review Focus 2; `lazyPanels.js:78-79`; `bossSystem.js:55,96-99,182,202-214` | **Applied.** After the 3rd retry `suspendEncounter()` clears `bossActive`, keeps HP and save, and re-arms the lair (a `rearm` dep, since the ref alone cannot restart a skipped interval); a reload notice names the new-version case; tested; mutant L6 |
| 8 | MED | The scene-wide before/after light count cannot see a retained boss light, nor that a fireball spawned | `BossEntity.jsx:565` (always-on light present on both reads) | **Applied.** Exactly 0 `PointLight` under the dragon group; the scene-wide comparison kept, with a fireball mesh asserted between the reads; mutant P1 |
| 9 | MED | M2's e2e kill rests on an un-instrumented "player velocity" | `useGameStore.jsx:896` (i-frames drop damage either way); `Components.jsx:160-163` (impulse into refs), `:1411` (kinematic body), `:1158-1159` (per-frame decay) | **Applied, with a better instrument than the one proposed.** A DEV log of `applyImpulse` calls (`readImpulses()`), immune to decay, frame timing and the roll's motion: one impulse of 24 ± 1 at 5 m (presence), zero under i-frames |
| 10 | MED | The slow-motion e2e's 300 ms rate window is unmeasurable at CI frame cadence | `perfect-dodge.spec.js:12-14,55-56`; `worldClock.js:43-45` (`delta * scale` per frame) | **Applied.** Judged on a same-tick `readClock()` pair: lost time grows by 415 ± 5 ms (160 + 255); orb age kept as a coarse check with an asserted sample count |
| 11 | MED | Mutant L4 probably survives while the marker is an exported constant | `lazyPanels.js:63` hands the namespace on (`loaded = m`); `bundle-budget.mjs:110` is a substring scan. Not built, so not observed | **Applied.** The marker is an inline, unexported literal; L4 must be run and seen RED before the check is trusted |
| 12 | MED | The heat check names power-ab.sh, which measures watts at spawn and which no agent may run | `.claude/worktrees/instruments/frontend/scripts/dev/power-ab.sh:2-5,8-12,34-35`; `gpu-cost-probe.mjs` header (draws, programs, no GPU time); no timer query anywhere in `scripts/` or `src/` | **Applied.** Acceptance 3 is now (a) structural, agent-run: `gpu-cost-probe --scene dragon-arena` (Unit 10.2b); (b) heat in watts, Kevin-run and blocking, with two ordinary-night runs for the spread and 120 samples each. "+0.3 ms" is stated as having no instrument |
| 13 | MED | The landing half of "stagger and landing" passes with the landing code deleted | `BossEntity.jsx:248,269` | **Applied.** Airborne start at ground + 1.2; it settles within 1 s, every later sample stays in band, and it climbs after the stagger; mutant K6 |
| 14 | MED | The `roar` voice is the player's WILDHEART roar, not a dragon voice | `synthVoices.js:84-86,733`, `Components.jsx:656`, `keyMap.js:28` | **Applied.** A distinct `dragonRoar` synth voice (enemy recipe, lower and longer), tested and with a mutant (E2); the Current-state sentence corrected; the windup is silent until Unit 7 |
| 15 | LOW | "The wings keep flapping through a hitstop" is wrong | `BossEntity.jsx:217` returns before `:466-485` | **Applied.** Restated: they hold, then snap, and slow motion cannot reach them |
| 16 | LOW | "Toasts after they have already hit you" holds only for the roar | `BossEntity.jsx:305-308,333-337,357-360,422-444` | **Applied.** Goal prose corrected |
| 17 | LOW | The bundle rule is cited to DECISIONS.md, which does not carry it | grep of DECISIONS.md: no match; `masterpiece.md:107-108` has it | **Applied.** Cited to the umbrella plan in Spec and Global Constraints |
| 18 | LOW | The roar's camera shake and block breaking are in no list | `BossEntity.jsx:321,341` | **Applied.** Listed under Kept and in the step 2.5 applier, on strike and on whiff |
| 19 | LOW | The lava gets two 750 ms telegraphs, its target picked after the first | plan D2/step 2.6/`decalFor`; census pins `telegraphUntil: worldNow() + LAVA_WINDUP_MS` | **Applied.** The zone is placed when the move starts, so its own ring is the one 750 ms tell; a unit case pins the total; mutant M8 |
| 20 | LOW | M1 and S4 are mis-attributed; the cancel test checks one instant | `attackTelegraph.js:12-16` (re-arms on 0 + intent); the closed forms integrate independently | **Applied.** The roar's range is defined through `roarFalloff` so M1 kills "misses at 11 m" and the e2e; S4 re-attributed to monotonicity; cooldowns charged at windup start and the cancel test spans a full cooldown; mutant M7 |
| 21 | LOW | No reset of the combat record on unmount | `bossSystem.js:143-148` (post-commit deactivate) | **Applied.** `resetBossCombat` in BossEntity's effect cleanup and in the death beat; a unit case and an e2e read |
| 22 | LOW | Unit 10 has no production spawn path and is missing files | `bossSystem.js:185-186` (DEV-only spawn); `lookbookSeam.js:110` deps (worktree); `feat/instruments` not merged into main (checked with `git merge-base --is-ancestor`) | **Applied.** A `?lookbook=1`-only `lookbookSpawnDragon` injected into the seam, a `lookHold` pose field, the files listed, a test that the spawn seam is absent without the param, and mutant B2 |
| 23 | LOW | A ≤3 draw count cannot show the outline on low; no plan for instanced bounding spheres | `Outlines.js:108-111`; `three/src/math/Frustum.js:81-85` (sphere computed once and cached) | **Applied.** Exactly 4 draws with exactly one outline (identified by its shared `instanceMatrix`); a fixed `DRAGON_REACH` sphere on every dragon mesh, a rig test that no pose exceeds it, and an e2e radius read; mutant R5 |

**Still open after these amendments:** the DECISIONS entry that would let Units 1, 2, 4, 6 and 7 go before move 11
(#4); L4 is observed only when step 1.8 runs (#11); the heat check (b) needs Kevin's run (#12). The eye decision
(#5) was kept rather than reversed, so no DECISIONS entry is needed for it.
