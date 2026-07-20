# Crafty — STATUS (THE single source of truth)

> **READ THIS FIRST. This file is CANONICAL for "where are we / what's next".**
> Every other doc is subordinate for status purposes. If any other file disagrees with this one about
> what is done or what is next, **this file wins** and the other file is stale (fix it in the same tick).
>
> **Doc roles (the map — do not scatter status across these again):**
>
> | Surface | Owns | Does NOT own |
> |---|---|---|
> | **`memory/STATUS.md`** (this) | Where we are · the open-work REGISTRY · what's next | history, direction, taste |
> | `memory/ACTIVE_PLAN.md` | The LIVE cursor — the one unit in flight right now | the registry (points here) |
> | `memory/CHANGELOG.md` | History (reverse-chron). Append-only | current status |
> | `memory/ARCHITECTURE.md` | The current code blueprint | status, plans |
> | `SOTA-INITIATIVE.md` | DIRECTION / vision / the S-ladder | status (its §3 is FROZEN — see below) |
> | `docs/superpowers/LOOP-CHARTER.md` | The loop's constitution (how it works) | what's next |
> | `docs/superpowers/KEVIN-REVIEW-BATCH.md` | Kevin's decision/eyeball queue | anything the loop can decide |
> | `docs/superpowers/INDEX.md` | The MAP of every doc + its status tag | content |
> | `docs/superpowers/{specs,plans}/` | Per-milestone design + build contracts | global status |
>
> **Rule:** a milestone completing updates **STATUS.md + CHANGELOG + the plan-doc banner** — and nothing else
> needs touching. That is the whole point of this file.

---

## 1. Where Crafty actually is (2026-07-13)

Crafty is a **mature, deployed, internally-coherent R3F voxel action-RPG** (~224 source files / ~28K LOC,
auto-deploying to crafty-sand.vercel.app). **The masterplan's spine is complete.**

**DONE (verified against code, not docs):**
- **S0** reality audit · **S1** art direction + render recipe + the locked bold-flat UI · **S2** game design
- **S2-B — the four-Aspect spine**: Wildheart (beast-transform) · Voidhand (kinetic grab/hurl) · Soulbind
  (capture/squad/fuse) · Elemancer (element-zone chemistry). All shipped 2026-06-10/11.
- **S3 engine/platform**: de-monolith done (SimplifiedNPCSystem 934→183, GameScene 933→304; Components ~1330
  is a *documented irreducible* Player useFrame controller, not an accidental god-file) · touch/mobile built
  (iPad/iPhone, iOS cold-start bridged) · perf tiers.
- **The 2026-06-17 W1–W4 Comprehensive Rebuild**: purge/fix → the look (warm magic-hour grade, toon ocean,
  cinematic title, de-islanded continent) → living frontier (RPG HUD, Hearth outpost, 4 named NPCs, quest
  chain + log) → polish (movement feel, weather, affix model, boot chrome).
- **Ember Frontier + Blight-Heart climax** — a real win-state (the answer to "what is the point").
- **v6** (tech-debt + de-monolith) · **v7** (weather bugs + all-4-spell SOTA VFX redesign).
- Gates today: **~2033 unit · 24-state visual · 12+ e2e specs · eslint/knip/build clean.**

**The honest bar:** the plan's own end-state is "SOTA taste sign-off + S4 (multiplayer + monetization)".
S4 is at **literal zero** and is **Kevin's call**. Product-wise this is a **1–2 hour demo with excellent
moment-to-moment feel**. The single-player game is essentially feature-complete; what remains is the
registry below plus Kevin's decisions.

**⚠️ The finding that reframes everything — and be precise about which parts are MEASURED vs INHERITED:**

**MEASURED (hard-verified 2026-07-13; reproduce with the commands below):**
- **124 gate files in `tests/gates/`; 114 of them `readFileSync` + regex the SOURCE.** That is **92% of the
  entire gate corpus asserting TEXT, not behaviour.** Only **10** are behavioural.
  `ls tests/gates/*.test.js* | wc -l` · `grep -rl readFileSync tests/gates/ | wc -l`
- **11 e2e specs; exactly ZERO fire a real key or click.** They drive `__craftyTest` / `getState()` — the
  store, not the game. `grep -rlE "keyboard\.|mouse\.|\.click\(|\.press\(" tests/e2e/` → nothing.

**MEASURED — the real coverage number (18-domain deep review, 2026-07-13/14; `docs/superpowers/audits/2026-07-13-18-domain-review.md`).**
18 agents enumerated their domain's features and measured how each one is *actually* validated. **650 features:**

| How it is actually validated | Features | Share |
|---|---:|---:|
| Behavioral test (would go RED on a real break) | 276 | 42.5% |
| Live probe (real browser / real worker) | 24 | 3.7% |
| **Source-grep only** (proves the code EXISTS, not that it RUNS) | 156 | 24.0% |
| Visual-diff only (6% pixel gate) | 20 | 3.1% |
| **Nothing at all** | 174 | 26.8% |

**Real validation = 300/650 = 46.2%.** The rest is text-assertions, a loose pixel diff, or nothing.

*This REPLACES the old "of 185 features, ONE (0.5%) is fully validated" line, which was **inherited** from
`AUDIT-2026-06-28-full-status.md` — that audit agent-audited only 10 of its 18 domains and inventory-inferred
the other 8, and it predates v6/v7. It was never a measurement. **Do not quote it again.***

**The conclusion (which the measured facts fully support):** nothing in the corpus proves the game is
*playable*. This is the exact class that shipped a dead desktop mouse-look, a dead iOS cold-start, a
permanently `0/100` health bar, the F-key confusion, and R1's reward theft — **all of them "green".**

**And it is worse than untested — some gates are VACUOUS.** `quest-rewards-gates.test.js` asserts
`expect(qs).toMatch(/store\.addCoins\(r\.coins\)/)` — it proves *the line exists in the source*, not that it
*runs*. It sat green while a live bug stole quest rewards and corrupted the save (see R1). A gate that greps
source text is not a gate.

---

## 2. THE REGISTRY — every open item (the loop's definition of done)

Legend: **[LOOP]** = full loop authority · **[KEVIN]** = needs him · `▢` open · `▣` in flight · `▣✓` done

### A. Confirmed live bugs
- ▣✓ **R1 — FIXED + SHIPPED `926751e` (2026-07-13).** RED-first: 3 behavioral tests reproduced it exactly
  (`expected [30] to equal [30,120]` = the 2nd reward swallowed · `expected ['zombie_slayer'] to equal
  ['first_blood','zombie_slayer']` = the save corrupted · first_blood re-offered at progress 0). Fixed with a
  PURE reduction (`src/game/questClaim.js reduceClaim()`) + live refs (the synchronous truth within a tick);
  no closure mutation, no nested setState; a repeat dispatch provably cannot double-pay.
  **AND it exposed a harmful gate:** the old `quest-rewards-gates.test.js` was a SOURCE-GREP that stayed GREEN
  through the whole bug and went RED the moment it was fixed (a variable got renamed) — **anti-correlated with
  correctness.** Replaced with a behavioral gate; mutation-proven. unit 1936→1938, 303 files green.
  *~~Original diagnosis kept below for the record.~~*
- ~~▢ **R1 [LOOP] Quest multi-claim steals rewards + corrupts the save.**~~ `QuestSystem.jsx:236-280` mutates the
  closure var `claimedQuest` from *inside* the `setQuests` updater and reads it after; on a 2nd claim in the
  same tick React has pending lanes → the updater is not eager → `claimedQuest` stays null → **reward never
  granted**. And `new Set([...completedQuestIds, questId])` reads a **stale closure** → claim #2 **erases
  quest #1** from `completedQuestIds` (re-offered; bounty seq miscounts). Reachable: `InputManager.jsx:136-140`
  — the **Q key claims EVERY completed quest in one synchronous `forEach`**, and quests complete in pairs
  routinely (one zombie kill advances `first_blood` AND `zombie_slayer`). *Fix RED-first.*
- ▢ **R4 [LOOP] THE HOTBAR LIES — 4 of your 9 hotbar blocks place the WRONG material.**
  > **⚠️ SEVERITY CORRECTED 2026-07-13 (I over-claimed, and so did the audit agent).** The original write-up
  > said "the material is DESTROYED / save-corrupting". **That is false.** The place path in `Terrain.jsx`
  > **never calls `removeFromInventory`** — blocks are free to place, nothing is consumed, nothing is lost.
  > The *wrong id is* persisted, but no material is destroyed. Logged because an overstated bug is still a
  > false claim, and this file is the source of truth.

  **What is actually true (verified):** `world/Terrain.jsx:724` maps a placed block to a worker id, and it
  disagrees with the engine's real id space (`terrain.worker.js` `BLOCK_COLORS`: 1 grass · 2 dirt · 3 stone ·
  4 sand · 5 snow · 6 wood · 7 leaves · 8 cactus · **9 water** · **10 coal · 11 iron · 12 gold · 13 diamond**).
  - `diamond/gold/iron/coal` → sent as **`3` (stone)** instead of 13/12/11/10 → **you place grey stone.**
  - `water` → sent as **`4` (SAND)** instead of 9.
  - `glass / cobblestone / lava` → sent as `3` — but these have **NO engine id and no texture layer at all**
    (`proceduralTextures.js`: `numLayers = 14`, and **layer index == block code**, so the id space is 0–13).
    The game offers blocks in the hotbar that the engine literally cannot place.
  - An unmapped type falls back to **`|| 1` (grass)** — another silent substitution.
  `HOTBAR_BLOCKS = [grass, dirt, stone, wood, **glass**, **diamond**, sand, **cobblestone**, chest]` → **glass,
  diamond, cobblestone place as stone; chest places as wood.** In a voxel *builder*, the palette IS the product.

  **▣✓ R4a — FIXED (pending capture-verify).** ONE canonical registry (`world/blockIds.js`): both the place-map
  and the mine-map now derive from it, so they cannot drift again. Ores get their real ids (10-13), water gets
  9, and **`cobblestone` (14) + `glass` (15) became real blocks** — new voxel ids + new texture layers
  (`numLayers` 14→16). An unplaceable block is now **REFUSED**, never silently substituted (the old `|| 1`
  fell back to *grass*). Note `cobblestone` is a **Stone Sword recipe ingredient**, so the engine was unable to
  produce a material its own crafting depends on.
  *Glass renders OPAQUE for now* — the greedy mesher's only non-solid block is water (`blockA !== 9`), so true
  see-through glass needs a second transparent draw pass. Correct identity beats a silent substitution;
  transparency is a tracked follow-up (**R4b**).
  Gates: `block-id-gates.test.js` (round-trip property over the whole block set + the HOTBAR contract;
  mutation-proven — re-break diamond→3 and 3 tests go red). unit 1938→1950, all 304 files green.
  **It also killed two more vacuous gates:** `ore-drop-gates.test.js` was source-grepping the text of the very
  id-map literal that WAS the bug — so it went RED when the code got FIXED. Rewritten behavioral. (That's the
  3rd such gate this session; see V1.)
- ▢ **R2 [LOOP]** Repo-wide sweep for the same anti-pattern: any closure var mutated inside a setState updater;
  any `setX()` called inside a `setY(prev => ...)` body. Fix only hits with a real multi-dispatch caller.
- ▢ **R3 [LOOP]** `tests/e2e/smoke.spec.js` canvas-**detach** race — three `<Canvas>` mounts exist
  (`GameScene.jsx:125`, `render/TitleDiorama.jsx:60`, `render/mascots/MascotStudio.jsx:75`) and
  `locator('canvas').first()` races the title→play transition. Bind the game canvas explicitly. **Do not widen
  the 60s timeout.**

### A-bis. ⭐ THE 18-DOMAIN REVIEW — 91 confirmed bugs (2026-07-14). THIS IS NOW THE WORK.

**Full report + every executed-probe transcript: `docs/superpowers/audits/2026-07-13-18-domain-review.md`.**
18 domain agents drove the real code (187 probes: vitest, node, Playwright, puppeteer). 135 raw findings, each
then handed to an *independent refuter* whose job was to KILL it. **91 survived; 43 were killed** (the refuters
threw out 22 LOW / 15 MEDIUM / 6 HIGH as no-impact-or-wrong, and caught one agent citing fabricated evidence).
Severity of survivors: **17 CRITICAL · 29 HIGH · 32 MEDIUM · 13 LOW.**

**The 91 are not 91 pieces of work — they collapse into 8 root seams.** Fix the seam, not the symptom. Ordered
by player impact. Each slice is RED-first and MUTATION-PROVEN (charter §3) — no exceptions.

- ▣✓ **B1 — FIXED + SHIPPED `86c76d1` (2026-07-14).** Seam-extracted to `src/combat/targeting.js` (three tiers:
  PROTECTED `isNPC` = the questgivers, undamageable by anything, ever · NEUTRAL `passive` = livestock, killable
  when deliberately aimed at but never AUTO-targeted · HOSTILE = the rest). The guard lives in **`damageMob`,
  the choke point** — melee, projectiles, the fireball DoT, chain, element zones, hurl and ally AI all funnel
  through it, so the invariant holds for damage paths that don't exist yet. `checkMobCollision` now resolves
  NEAREST instead of first-in-ECS. **Caught while wiring it:** the `mobEntities` snapshot (what chain lightning
  actually targets off) carried `passive` but **not** `isNPC` — the questgivers were excluded only
  *incidentally*, because they happen to be passive. Field added; snapshot contract pinned by a gate.
  Mutation-proven 4 ways (each guard → RED; restore → GREEN). unit 1950→1960, 305 files.
  *~~Original diagnosis below.~~*
- ~~▢ **B1 [LOOP] FRIEND/FOE — combat has no allegiance filter.**~~ `mobsQuery = ecs.with('isMob','position','type')`;
  `npcSpawn.makeNpcEntity` sets `isMob:true, isNPC:true, isStatic:true` to reuse the renderer. Nothing in combat
  ever re-filters. *(I verified this one myself.)* Consequences, all CONFIRMED:
  **melee permanently kills all 4 hub questgivers** (2.7s of LMB → trading/crafting/healing/quests gone for the
  run, no respawn) · **chain lightning auto-zaps passive villagers + livestock** · **aimed spells hit the WRONG
  mob** (`checkMobCollision` returns *first-in-ECS*, not nearest).
  **Seam:** one targeting module — `hostilesQuery` + a nearest-in-cone selector — consumed by melee, chain, and
  aimed casts. `CombatSystem.jsx:160-174`, `EnhancedMagicSystem.jsx:331`, `game/chainLightning.js:10-46`.
- ▣ **B2 — 7 of 8 FIXED (`…`, `f98d3c4`, `9200986`, 2026-07-14).** ✓ B2a-e ✓ **B2f** night-ratchet ✓ **B2h**
  the kill block ran inside a setState updater (one throw voided the win) — extracted to `game/bossKill.js`
  (pure `applyBossDamage` + a post-commit isolated `runBossKillEffects`, win latch LAST). **Still open:
  B2g** — the boss fight is React-local (`world/bossSystem.js:11-18`), so a reload resets it to full HP;
  persist it through saveSchema + rehydrate (do NOT re-arm a defeated boss). *(Split from B2h; the boss-state
  rewrite is the bigger, riskier half — land it as its own verified unit.)*
  - **B2a ✓** the autosave no longer destroys your world. `_sessionWorldId` (in-memory, never persisted): an
    autosave may only write to a slot THIS SESSION opened or created; unowned → mint. Also stopped renaming
    "Marcus's Castle" → `Save_<timestamp>`, and added `mintWorldId()` (a bare `Date.now()` id collides within
    a millisecond — my own RED test caught that in my own fix).
  - **B2b ✓** "Create New World" no longer clones the world you're playing. `startNewWorld()` resets by
    round-tripping the store's INITIAL state through the save schema → drift-proof by construction. That gate
    immediately found a second bug: `gameTime` loaded with `||`, and **gameTime 0 is DAWN** (falsy) — so any
    save made at the start of a day kept your *current* clock.
  - **B2c ✓** a grind session no longer dies with the tab. coins/XP/attributes/spellLevels/nightCount/**gameWon**
    were not autosave triggers, so an hour of grinding — and beating the boss — scheduled nothing and flushed
    nothing. The gate derives the trigger list FROM saveSchema, so it can't rot.
  - **B2d ✓** "Load World" no longer destroys the terrain. `requestedChunks` was never drained on load, so the
    streamer could never re-request a chunk → 81 chunks → 0, forever, free-falling. **Proven by a live E2E**
    (`tests/e2e/world-rebuild-after-load.spec.js`) — and the test had to be rewritten 3× because the first two
    versions were VACUOUS and passed with the bug deliberately reintroduced. Mutation-proven: bug → "had 81,
    settled at 0".
- ~~▢ **B2 [LOOP] SAVE/LOAD is the most broken system in the game**~~ (8 confirmed bugs; the save domain has the
  worst coverage of all 18). **The autosave destroys the player's world on their next visit** — nothing
  auto-resumes at boot, but the autosave still targets the same slot, so session 2 saves an empty world over
  session 1. **"Load World" permanently destroys the terrain** (the chunk streamer can never re-request a chunk
  it already requested → 81 chunks → 0, forever). **"Create New World" silently clones the current one.** Every
  autosave **clobbers the world's name** with `Save_<timestamp>`. `flush()` on tab-close is a no-op unless a
  debounce is already pending — and coins/XP/gameWon/nightCount are not autosave triggers, so **a grind session
  dies with the tab**. **Spell Mastery is dead after a load** (every spell casts at Level 1 while the panel says
  MAX RANK; the first Upgrade click writes the Level-1 state to disk). Loading a NIGHT save **adds a night to
  the siege, and it ratchets on every reload**. A page reload mid-boss-fight **resets the 700-HP climax boss to
  full**. `App.jsx:220-261`, `useGameStore.jsx:858/967-973`, `Terrain.jsx:657/592-595`, `WorldManager.jsx:65-108`,
  `world/spellUpgrades.js:57-66`, `game/autosave.js:8`, `world/bossSystem.js:11-18`.
- ▣✓ **B3 — ALL 4 FIXED (2026-07-14).** ✓ B3a swords (`60e2b67`) · ✓ B3c free placement (`69c88c4`) · ✓ B3d
  crafting-grid escrow (`02acb83`) · ✓ **B3b** crystal/wand black hole (`b707c60` — one canonical
  `game/crystalWallet.js`; the seed + trade read/spend + wand consumer all use the rendered `blocks` bucket;
  3 bug-pinning gates corrected, behavioral RED + mutation-proven).
- ~~▢ **B3 [LOOP] THE ECONOMY IS A BLACK HOLE.**~~ Crystals live in TWO buckets (`inventory.magic.crystals` vs
  `inventory.blocks.crystals`) and the trade UI reads one and writes the other → **ore→crystal trades destroy
  your ore for nothing, the Crystals→Wand trade is mathematically unreachable, and a bought wand gives 0% mana
  discount.** **The entire sword tree is uncraftable** — `normalizeGrid` trims the player's grid to its bounding
  box, but the recipe pattern is compared raw, and the 4 sword patterns are the only ones with null-padded outer
  columns *(I re-derived this: exactly 4 unmatchable recipes, exactly the swords)* → weapon progression is
  permanently capped at the starting Stone Sword. **Placing a block is FREE while mining grants +1** → infinite
  diamonds in seconds. **CraftingTable permanently destroys every material left in the grid when you close it.**
  `TradingInterface.jsx:24-75`, `data/recipes.js:9-28`, `ui/panels/CraftingTable.jsx:22/27-54/75`,
  `world/Terrain.jsx:819-848`.
- ▢ **B4 [LOOP] MOB AI IS 2D — the Y axis does not exist.** `ai.worker.js:166` uses `distToPlayer2D`. Pillaring
  up, walling in, or going underground gives **ZERO** protection — mobs melee you through 200 blocks of vertical
  separation. In a voxel game with a night-siege loop, **building is strategically pointless.** This is the one
  that most damages the core fantasy. Also here: the attack telegraph is bypassable (a stale `windupUntil`
  survives de-aggro → instant undodgeable hit on re-aggro, `ai.worker.js:280-287`).
- ▢ **B5 [LOOP] THE HUD LIES.** **The health bar is 100% invisible during normal play** — the QUESTS panel is
  painted on top of it (same `z-20`, later in DOM); the mana bar is 59% buried. **All 7 stat bars lay out as a
  1232px horizontal ribbon** instead of a vertical stack (`space-y-2` is a no-op on `inline-flex` children).
  **The day/night dial is 90° out of phase** — it draws the sun at ZENITH one second before nightfall while
  printing "DUSK". The Progression panel's entire header (incl. the close X) is **off-screen and unreachable**
  at 1280×800; the Inventory's attribute-point "+" buttons are **below the fold with no scroll affordance**.
  `HUD.jsx:547/80-102`, `ui/primitives/StatBar.jsx:18`, `ui/SpellUpgradePanel.jsx:40`, `ui/GamePanels.jsx:252`.
- ▣ **B6 — B6a+B6b FIXED (`df90131`, 2026-07-14).** ✓ **B6a** double-count + ✓ **B6b** dead mobType filter —
  one pure `game/questMatch.js` seam replaced the buggy inline matcher: a 'kill' quest advances only on the
  'kill' dispatch (not the kill_type echo), a 'kill_type' quest only for its own mob. RED-first e2e through the
  real hook + emitMobKill; mutation-proven both ways. **Still open (separate, LOW): the 2 unlockable
  achievements — `updateLevel` has zero callers (`QuestSystem.jsx:398-404`).**
- ~~▢ **B6 [LOOP] QUESTS MISCOUNT.**~~ Every "Defeat N mobs" quest **completes at half the advertised cost** —
  `onMobKill` fires `updateQuestProgress('kill')` AND `('kill_type')` and the match arm accepts both, so **each
  kill counts twice**. The **mobType filter is dead code** — killing any mob advances every targeted-hunt quest
  ("Defeat 5 moss brutes" completes on 5 spider kills). Two of the twelve achievements **can never unlock**
  (`updateLevel` has zero callers). `QuestSystem.jsx:197-199/317-318/398-404`.
- ▢ **B7 [LOOP] TOUCH IS VISUALLY + FUNCTIONALLY BROKEN** (rolls X1/X3 in). **The joystick knob is 100%
  transparent** and every touch-button border is silently dropped — bare `var(--ui-*)` used as a colour against
  space-separated **RGB-channel** tokens. **The Pause hit-button is 100% disjoint from the Pause glyph** and it
  covers the Settings gear, so **tapping Settings pauses the game.** A stray tap anywhere in the left half
  **kills a held joystick** (player freezes mid-run). The hotbar **overflows the phone viewport** — 2 of 9 slots
  entirely off-screen on an iPhone. `ui/TouchControlsSurface.jsx:11-20/53-58/76`, `ui/TouchControls.jsx:126-127`,
  `input/touchHandlers.js:39-44`, `ui/GameHud.jsx:20-24`.
- ▢ **B8 [LOOP] COMBAT + WORLD FEEL.** A pack of N enemies deals the damage of **ONE** (a 500ms *global* damage
  lockout caps ALL incoming damage at 2 hits/sec → the siege cannot threaten you). Camera shake decays **per
  frame, not per second** (1067ms @30fps vs 267ms @120fps). **Fireball — the default starting spell — cannot hit
  anything past ~12m** (gravity applied to a projectile that was never designed to arc). Arcane "pierce 3
  targets" **triple-hits ONE target**. **The ocean plane renders inside every inland cave** and burns ~14% of
  the frame budget 1.1km from any water. **Alt-tab leaves movement keys stuck ON.** **Left-clicking a chest
  MINES it** — chest and contents deleted, no drop, no confirm. Spatial audio is **dead until the first hostile
  spawns** (footsteps/jump/swing silent at game start).

**MEDIUM (32) + LOW (13)** — enumerated in the audit doc. Fold them into the seam slices above where they share
a root cause; do not open 45 separate tickets.

### B. Verification truth (the structural gap)
- ▢ **V1 [LOOP] Vacuous-gate audit — ⚠️ MY OWN HEADLINE WAS OVERSTATED. Corrected below.**
  > **I was saying "114 of 124 gates are source-greps — 92% of the corpus asserts TEXT not behaviour."**
  > That framing is **wrong in its implication**: reading the source is not the same as being vacuous.
  > Correcting it here, because an overstated claim is still a false claim (and this file is the SoT).

  **Measured (2026-07-13, first-pass classification of all 124 files in `frontend/tests/gates/`):**
  | Class | Count | Meaning |
  |---|---|---|
  | **VACUOUS** | **3** | asserts a code line EXISTS as a proxy for behaviour that *could* be tested behaviourally → the dangerous class (`boss-notif-timer`, `melee-swing-audio`, `survival-quests`) |
  | **STRUCTURAL (legit)** | ~31 | a cross-file invariant that genuinely CANNOT be behavioural — e.g. the `ai.worker.js` inline-mirror sync gate (a classic worker cannot import, so comparing source IS the correct tool), zero-emoji-in-src, no-raw-hex-outside-theme, capture-determinism (no `Math.random`) |
  | **NEEDS REVIEW** | ~80 | source-reading, not yet classified — this is the actual work |
  | **BEHAVIOURAL** | 10 | already execute the code |

  **What remains TRUE and is the real finding:** three gates this session were *anti-correlated with
  correctness* — green while the code was broken, RED once it was fixed (`quest-rewards`, `ore-drop`, and the
  `bundle-split` gate that asserted **zero bytes** against a 4.5MB bundle). And **0 of 11 e2e specs fire a
  single real key or click** (`grep -rlE "keyboard\.|mouse\.|\.click\(|\.press\(" tests/e2e/` → nothing).
  **⚠️ REFINEMENT (2026-07-13, after actually opening the 3 "vacuous" ones): the fix is NOT to rewrite the
  test.** All 3 are **WIRING gates** — "does function A call function B" — e.g. `melee-swing-audio-gates`
  asserts `triggerMeleeAttack` contains `playAttackSounds?.()`. They guard a REAL bug class (that helper was
  *defined but never called*, so melee swings were silent). But `triggerMeleeAttack` lives **inside the R3F
  `Player` component and is not exported**, so it cannot be driven without mounting the whole Rapier/R3F tree.
  **⇒ You cannot fix a vacuous gate by editing its assertion. You fix it by making the behaviour REACHABLE** —
  extract the decision into a pure/injectable seam (the pattern already proven twice today: `game/questClaim.js`
  for R1, `world/blockIds.js` for R4a), then assert the seam behaviourally.
  **So V1's real work is SEAM EXTRACTION, not test-rewriting.** Budget it as such. The three:
  `melee-swing-audio` (audio-on-swing), `boss-notif-timer` (timer/notification), `survival-quests` (quest wiring).
  **The work:** triage the ~80 unclassified; for the genuinely vacuous ones extract a seam, then
  **mutation-prove** (break the behaviour → it must go RED). Do NOT mass-rewrite the structural gates — for a
  classic Worker that cannot import, comparing source IS the correct tool.
  *(V4, the bundle-byte gate, is DONE + mutation-proven, `4e32dbf`.)*
- ▢ **V2 [LOOP] Input-driven E2E harness ("Playable Truth").** The gap IS closable: `input/inputState.js`
  documents `setActive(v)` as the abstract input-live gate that *"replaces the scattered
  `document.pointerLockElement` checks"* — every verb reads `getInput().active`, **not pointer-lock**. So
  Playwright can flip it via `devtest/testBridge.js` and fire **real** keys/clicks. (The input-abstraction layer
  from S2-A-M1 was built for exactly this and never used for testing.)
- ▢ **V3 [LOOP]** On that harness: **verb-truth** (LMB=mine · LMB-on-mob=melee · RMB=cast/place · F=cast ·
  T=melee · 1-4=select), **HUD-truth** (bars render real state — the `0/100` class), **click-truth**
  (consumable Use→heal · talent unlock · craft · quest claim · chest open · respawn).
- ▢ **V4 [LOOP]** Real **bundle-BYTE** gate. Today `bundle-split-gates.test.js` only regexes `vite.config.js`
  for `/manualChunks/` and asserts **zero bytes** against a ~4.5MB bundle. Read `dist/assets/*`, assert a
  committed budget, assert three/rapier/r3f stay split.
- ▢ **V5 [LOOP]** Seeded sim RNG + **state-hash replay gate**. The sim is non-deterministic (**107
  `Math.random` sites**; mulberry32 lives only in captureMode/perfProbe) → a sim regression cannot be
  reproduced or bisected. Per-subsystem seeded streams + an FNV-1a golden hash → bisect to first diverging tick.
- ▢ **V6 [LOOP]** **CI + pre-push hook.** VERIFIED: **no `.github/workflows`, no `core.hooksPath`** — while
  Vercel auto-deploys **every push**. A red push ships to the live demo today.

### C. Authorized-but-never-built (a stale gate — Kevin already decided)
- ▢ **C1 [LOOP] Control-scheme Option-A enhancements.** Charter 2026-06-28 decision-of-record: Kevin picked
  Option A; F=cast/T=melee shipped; the four enhancements are **"AUTHORIZED loop work"** — the loop wrongly
  carried them as `[KEVIN-GATED]`. **All four verified unbuilt:** (1) **verb-telegraph reticle** — the crosshair
  shows which verb the click will fire (`input/verbRouter.js` already exports a pure
  `routeMouseVerb(button, ctx)`; the reticle is "render what it already predicts" → TDD red-first);
  (2) **hold-Alt force-build** (zero `altKey` in src); (3) **persistent control legend** — today only an
  **8-second auto-fade** (`HUD.jsx:191`), *literally the undiscoverability bug the spec names*;
  (4) **full key-rebinding**.

### D. Art (Kevin DE-GATED this 2026-07-13: "have a go as you decide best")

**⚠️ Judged by LOOKING at the rendered baselines, not by reading the code.** A specs agent read the source and
concluded "there is no unbuilt mob/boss ART item in any spec — the art is done." **The pixels say otherwise for
the boss.** This is the founding sin again: *code-presence ≠ lived result.* Always open the PNG.

- ▢ **D1 [LOOP] THE BOSS IS THE ART EMERGENCY.** `boss-closeup.png` reads as a **flat purple box with a box
  head, two grey stick-wings, two vestigial horn nubs and lavender dot-eyes** — a toy imp, *cheaper-looking than
  the trash mobs*, and it is **the payoff of the entire run**. `DRAGON_FEATURES` (horns/tail/back-ridge) DO exist
  in code (iter-172) and still don't read.
  **Root cause — CORRECTED 2026-07-13 (my first diagnosis was wrong; verify-before-assert applies to ME too):**
  the body colour is **already obsidian** — `render/BossEntity.jsx:467` `bodyColor = "#111029"`. I had blamed
  `bossConfig.js:6` (`color: '#4B0082'`); that is the PHASE colour, and the real culprit is the next line:
  **`:468 bodyEmissive = phase.color`** — the indigo is flooded as **emissive across the ENTIRE torso** at
  `emissiveIntensity` 0.8 → 2.2 (`:469`). The emissive drowns the obsidian, so the mass renders as flat toy
  purple. The observation (a purple box — I read the PNG) was right; the attributed line was wrong.
  **⇒ Fix vector: keep the obsidian body; move the phase colour OFF the torso and onto DETAIL** (eye-slits,
  edge-rim, back-ridge, vein accents) so it reads as dark mass + hot detail. Do NOT "fix" `bodyColor`.
  **Fix vector:** near-black obsidian body (the `#111029` the design intends) + phase-colored *emissive detail*
  (veins/eye-slits/edge-rim) rather than a phase-colored *body*; a real dragon silhouette in the bold-flat voxel
  vocabulary the mobs already prove works (neck + snout + membraned wings + tail + legs + mass); scale up.
- ✅ **D2 — MOBS ARE GOOD. DO NOT TOUCH THE ART.** `mob-bestiary.png` reads well: distinct silhouettes at a
  glance (spider sprawl · duskhound ears+tail · ribbed skeleton · crested emberhusk · horned cow · shouldered
  moss-brute), coherent bold-flat language, clean ink outlines. The mob-distinctness spec T1–T4 fully shipped.
  **Their real gap is BEHAVIOR, not art** → see E3: 10 distinct-looking creatures share **3 AI brains**; the
  moss-brute *looks* like a tank and *plays* like a zombie. **The art has out-run the AI.**
- ▢ **D3 [LOOP]** **Player/character** reads *monstrous* — `character-closeup.png` is a green box-man with **red
  eyes** (this game's own *hostile* marker) and **no arms**.
- ▢ **D4 [LOOP]** **FPV viewmodel** — W2 specced *gloved hands*; verify against the live view, not the code.
- Bounds: reference-lock first (charter §4), stay inside the S1-C bold-flat lock + coherence pillars P0–P5
  (below), judge IN-WORLD on the real grade, capture-verify, batch before/after to KEVIN-REVIEW.

### E. Gameplay depth (the 4 milestone levers — loop authority per the 2026-06-20 mandate)
- ▢ **E1 [LOOP]** **Recurring apex threat** — `bossTier` **does not exist**; the boss is a one-shot L5 event.
  The project's own backlog calls this *"the single highest retention lever."*
- ▢ **E2 [LOOP]** **Build-identity talents** — no capstones, no mutually-exclusive picks, **no respec**;
  ~20 flat +stat nodes drain by L18 → no reason for a 2nd run.
- ▢ **E3 [LOOP]** **Mob archetypes** — telegraphs ARE built (380ms windup + gate), but all 10 mob types still
  share **one** behavior tree (beeline+bonk).
- ▢ **E4 [LOOP]** **Cinematic beats** — boss-entrance mood SNAP, dawn/dusk payoff spike.
- Balance/feel constants ship with sensible defaults + a dial, and surface to KEVIN-REVIEW as **FYI, not a block**.

### E-bis. ⛔ THE HARD COHERENCE VIOLATION (highest-priority build item found in the specs audit)

- ▢ **X1 [LOOP] The four Aspects are UNREACHABLE ON TOUCH.** Verified: `grep "roar|grab|snare|imbue"` across
  `ui/TouchControls*.jsx` + `ui/touchTray.js` = **0 hits**. The radial Aspect-verb wheel (touch M3b) was never
  built. So **Wildheart / Voidhand / Soulbind / Elemancer — the entire signature identity of the game — are
  desktop-only.**
  **Why this outranks almost everything else:** it violates **two coherence pillars at once**, and P4 is one of
  the only two HARD vetoes in the whole design system: **P1** = "four Aspects, each deep — the signature", and
  **P4** = "runs great in the web/iPad/mobile+touch envelope" (a *hard frame*, per the master plan §0). The game
  ships its own identity as unreachable on half its stated platforms.
  Build: press-and-hold ⊕ → a ring of the **unlocked** verbs (gate on `unlockedTalents`, mirroring `keyMap.js`'s
  `talent` field) → `setIntent(verb, true)`. **Reuses the entire existing intent path — zero downstream change.**
  Gate: pure sector-hit math (unit, like `input/touchMath.js`) + unlock-gating test + a wheel-open state added to
  the `mobile.png` fixture (`getCaptureOpts().showTouch` already exists). Thumb-reach/ring layout → Kevin's eye.
- ▢ **X3 [LOOP] TOUCH HOTBAR — ⚠️ UNCONFIRMED. DO NOT "FIX" IT ON THE READING ALONE.**
  > **Status 2026-07-13: I tried to reproduce this and FAILED. Recording that honestly, because a
  > code-reading is a HYPOTHESIS (LOOP-CHARTER §0-B) and this campaign exists precisely to distrust them.**

  **The hypothesis (from reading, unproven):** `ui/TouchControls.jsx:113-117` renders its root as
  `position:fixed; inset:0; zIndex:40` with **no `pointerEvents:'none'`**, above the HUD/hotbar (`z-20`), and
  its handlers `preventDefault()`. That *would* hit-cover the onClick-wired hotbar and swallow the tap.
  (`TouchControlsSurface` does set `pointerEvents:none`; the ROOT does not.)

  **What I actually OBSERVED when I drove it** (chromium, 390×844, `hasTouch`): I never got into the game, so
  the hotbar was never even in the DOM (`[data-hud-interactive]` = 0, `gameStarted` = false). Two traps, both
  MINE, both worth knowing:
  1. `devices['iPhone 13']` carries `defaultBrowserType:'webkit'` → it silently switches browser, and the
     project's WebGL flags (`--use-angle=swiftshader`) are **chromium-only**, so the game never boots. Emulate
     touch explicitly (`browserName:'chromium'`, `hasTouch:true`) instead.
  2. A **dev-only** `z-50` FAB (`ui/DebugOverlay.jsx:167`, `fixed bottom-4 left-4`) intercepts taps on the
     phone viewport. **It is NOT in production** — do not report it as a bug (I nearly did).

  **The right harness already exists:** `scripts/visual/touch-probe.mjs` drives the real cold-start (taps
  "Start Adventure" via a live handle) and its own comments warn that a naive fixed-coordinate tap *"caused a
  false 'cold-start dead' alarm"* — the exact trap I fell into. **Extend THAT**, don't re-invent it.
  **Next step:** drive a hotbar tap through touch-probe's entry path and see what actually happens. If the tap
  is swallowed → fix (`pointerEvents:'none'` on the root, `'auto'` on the hit-targets, and skip routing for
  `[data-hud-interactive]`). If not → close this and delete the claim.
  *(Seams already landed for whichever way it goes: `data-hud-interactive` on the hotbar container +
  `data-hotbar-block={type}` per slot.)*
- ▢ **X2 [LOOP]** Touch has **no cooldown display at all** — `HUD.jsx:590` gates `<AbilityBar>` behind
  `!isTouchUIMode()`. Touch also lacks spell-select (1-4).

### E-ter. Other spec'd-but-unbuilt (from the full specs audit)

- ▢ **Incoming-hit hitstop** — `damagePlayer` sets `damageFlash` + `screenShake` but **never `hitstopUntil`**,
  and `cameraKick.js` has no `hurt` profile. Hitstop exists only for *outgoing* hits → enemies don't feel dangerous.
- ▢ **Boss entrance has no beat** — `bossSystem.js:44-55` sets a **text notification** and nothing else: no shake,
  no roar, no bloom spike, no mood snap. For the climax of the run. (= E4.)
- ▢ Voidhand **multi-phantom pool** (cap-4) · Soulbind **v2 faction protocol** (mob-vs-mob) · Elemancer **v2
  terrain chemistry** (⚠️ *parked behind the P4 no-mid-combat-re-mesh HARD VETO* — do not unpark without a
  measured trimesh re-cook budget).
- ▢ World **M4b biome palette / M4c topography / M5b seabed / M7 landmarks** (the "deferred refinements").
- ▢ Item **sets / set-bonuses** (affixes exist; sets never built) · `aspect-underbanked` denied-reason ·
  title-screen hint should read from `keyMap` · **WebGPU/TSL migration** (specced, never done — huge blast radius).
- ▢ The **coherence CUT-gate** stays **PARKED by design** (its own bound #1: inadmissible until a blind
  calibration scores 100% on must-NOT-cut negatives). **⇒ The pillars govern what to BUILD; they may NOT be used
  to authorize deletions.**

### F. Perf + polish
- ▢ **F1 [LOOP]** Per-frame allocations still real despite the CHANGELOG's "vein C DONE" claim:
  `Components.jsx:1123` allocates every frame; `Ocean.jsx gerstnerNormal()` returns a fresh array **per vertex
  per frame** (9409 verts, CPU displacement); `MobModel.jsx` does a full-subtree `traverse()` per mob per frame;
  `HUD.jsx:478` compass rebuilds its DOM via **per-frame `innerHTML`** (also restarting the marker CSS anim).
- ▢ **F2 [LOOP]** **Perf-harness honesty** — the median is quantized to the 60Hz vblank, so the M2 "budget" is
  effectively a boolean, and the C−B scenario delta structurally **cancels** the ocean/weather/spell VFX it
  claims to measure.
- ▢ **F3 [LOOP]** **Biome ground-tint** not wired into the terrain shader → all grass biomes look the same at
  ground level (Kevin: "how do different biomes appear?").
- ▢ **F4 [LOOP]** **i18n #73 unblock** — items are keyed by *display name* (name-as-identity), so translating
  breaks identity. The **id/display decouple refactor is pure engineering** and is the actual blocker. Do the
  refactor; the zh-CN content pass itself stays Kevin's go/no-go.

### G. Harness / docs
- ▢ **G1 [LOOP]** Doc-truth: `LOOP-CHARTER.md:225` still advertises `@react-three/test-renderer` as
  *"approved + landed (0f8cad9)"* — commit `8b6e3a44` **REMOVED** it (verified: not in package.json, imported
  nowhere). **That one stale line regenerated a week-sized proposal.** Also: the CHANGELOG "no per-frame allocs
  remain" overclaim; dead `quality.js TIERS.outlineWorldEdge` (zero readers); `SOTA-INITIATIVE.md` §3 stale.
- ▢ **G2 [LOOP]** Doc-currency **lint** (mechanical) + a doc-gardening pass, so staleness fails a gate instead
  of poisoning the next agent.
- ▢ **G3 [LOOP]** **Session-close ritual at the context watermark** — refresh the GitHub remote surfaces
  (README, repo description, CHANGELOG/STATUS) and push, every session.

### H. KEVIN-ONLY (the loop will not touch these)
- ▢ **#44 The holistic playtest.** The perennial one. It gates every taste sign-off: spell look, movement feel,
  storm, **audio mix (your ear)**, real-device touch feel.
- ▢ **S4 — multiplayer + monetization scope.** The plan's last frontier. Servers, accounts, real money, legal.
  The loop will NOT start netcode or payments without your model. (Hard line already recorded: no randomized
  gacha/lootboxes, COPPA, odds-disclosure-if-random.)
- ▢ **Shareable-moment / clip / photo-mode tooling** — a named *commercial* blocker.
- ▢ Final taste sign-offs (the v7 spell look; the art pass in D once it lands).

---

## 3. What's next (the cursor)

**Current campaign: v8 — "Playable Truth + Depth".**

**⚠️ The 18-domain review reordered this. `A-bis` (B1–B8) now outranks everything below it.** We were about to
spend the campaign building E2E scaffolding and an art pass on a game where the autosave destroys your world,
the swords don't exist, and you can accidentally murder every questgiver. **Fix the game first.** The gates
come with each fix (RED-first, mutation-proven), which is V2/V3 earned rather than scaffolded.

Order of attack:
1. **B1** friend/foe (you can kill the questgivers) → **B2** save/load (the autosave eats your world) →
   **B3** economy (swords uncraftable, crystals a black hole) → **B4** 2D mob AI (building is pointless) →
   **B5** the HUD lies (health bar invisible) → **B6** quests miscount → **B7** touch → **B8** combat/world feel.
2. **V1/V6** (vacuous-gate audit + CI) — stop shipping false confidence. *Each B-slice pays into this.*
3. **V2/V3** (input-driven E2E) — 54% of features still have no behavioral cover.
4. **C1** (control-scheme A) — authorized, unbuilt, rides the same verbRouter seam as V3.
5. **D** (art pass) — newly de-gated.
6. **E** (depth levers) — the retention spine.
7. **F/G** (perf, i18n unblock, doc-currency, session-close ritual).

The live cursor (which single unit is in flight *right now*) lives in `memory/ACTIVE_PLAN.md`.

---

## 4. The coherence pillars (P0–P5) — the bounds on EVERY item above

Full text: `docs/superpowers/specs/crafty-coherence-pillars.md`. Each is an "X even over Y" trade-off.

- **P0** Preserve novel "beyond-SOTA" seeds until proven incoherent → **PARK-AND-WATCH, never an autonomous cut.**
- **P1** Four Aspects, each **DEEP before next** — even over feature breadth. *(The Aspects ARE the identity.)*
- **P2** Cohesive loop: every system feeds fight→loot→build→fight-harder — even over standalone "cool" toys.
- **P3** ONE locked visual/UI language + a readable feedback grammar — even over raw effect count.
- **P4** Runs great in the **web / iPad / mobile + touch** envelope — even over GPU-maximal fidelity.
- **P5** Broad-audience legible (≈8 → adult), zh-CN-ready — even over hardcore gatekeeping. *(Marcus is a user,
  NOT a depth-lowering ceiling — real stakes are allowed.)*

**⛔ The only HARD VETOES in the system are P4's two invariants: (1) NO frequent mid-combat re-mesh;
(2) input via intent-abstraction, NOT `pointerLockElement`.** Everything else is a ranked support
(P1=P2 > P3 > P5≈P4-soft). **Accessibility never vetoes depth. Aesthetic verdicts are quarantined from
autonomous deletion. Default-KEEP under uncertainty; tie → DEEPEN.**

*(Note P4 invariant (2) is also precisely what makes the input-driven E2E harness in §V2 possible — verbs gate on
`getInput().active`, not on pointer-lock. The pillar and the test strategy are the same fact.)*

## 5. Anti-patterns this project has already paid for (do not repeat)

1. **A green headless gate proves code-PRESENCE, not lived result.** The founding rule. It has been violated
   repeatedly and every time Kevin's eyes caught it, not the gates.
2. **A gate that greps source text is not a gate.** (R1 sat green under a regex gate.)
3. **Never weaken/delete/skip a test to go green.** The ratchet is non-negotiable.
4. **Verify-before-assert.** Agent/workflow claims are T3 — this session a subagent fabricated a "RED test
   suite" crisis (it is green 1936/1936). Grep the cited file:line before acting on any claim, including your own.
5. **A stale doc is a live trap** — it regenerates dead work verbatim (see G1).
