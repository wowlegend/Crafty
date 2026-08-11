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

## 1. Where Crafty actually is (re-measured 2026-07-27)

Crafty is a **mature, deployed, internally-coherent R3F voxel action-RPG** (**264 source files / 29.5K LOC**
excluding tests, auto-deploying to crafty-sand.vercel.app). **The masterplan's spine is complete.**

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
- Gates today (measured 2026-07-27): **2114 unit across 329 files · 24-state visual · 15 e2e specs ·
  build / knip / doc-currency clean · eslint clean and now BLOCKING on dead code** (`no-unused-vars` was
  promoted OFF → `warn` → `error` during the holistic-review campaign, `9387c7d`).

**The honest bar:** the plan's own end-state is "SOTA taste sign-off + S4 (multiplayer + monetization)".
S4 is at **literal zero** and is **Kevin's call**. Product-wise this is a **1–2 hour demo with excellent
moment-to-moment feel**. The single-player game is essentially feature-complete; what remains is the
registry below plus Kevin's decisions.

**⚠️ The finding that reframes everything — and be precise about which parts are MEASURED vs INHERITED:**

**MEASURED (re-run 2026-07-27; first measured 2026-07-13. Reproduce with the commands below):**
- **136 gate files in `tests/gates/`; 116 of them `readFileSync` + regex the SOURCE.** That is **85% of the
  entire gate corpus asserting TEXT, not behaviour.** Only **20** are behavioural.
  `ls tests/gates/*.test.js* | wc -l` · `grep -rl readFileSync tests/gates/ | wc -l`
  *(Moved the right way since 07-13: 124→136 gates, behavioural 10→20, so the text-assert share fell 92%→85%.
  The seam-extraction work in the holistic campaign is what bought that — but 85% is still the headline risk.)*
- **15 e2e specs; exactly ZERO fire a real key or click.** They drive `__craftyTest` / `getState()` — the
  store, not the game. `grep -rlE "keyboard\.|mouse\.|\.click\(|\.press\(" tests/e2e/` → 1 hit, and it is a
  COMMENT in `panel-overflow.spec.js` ("close it without a keyboard"), not a real input call. Still zero.

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
- ▣✓ **R9 — ESC out of the pause menu FROZE THE PLAYER. FIXED + SHIPPED `8e68425` (2026-08-05).**
  Kevin, playing: *"whenever I press ESC to bring up the menus, and then press ESC to quit it, I'm unable
  to navigate / move — the character remains frozen, and dies from a mob hitting."*
  **Root cause is a documented browser refusal, not a race.** ESC is the browser's DEFAULT UNLOCK GESTURE,
  and per MDN (`Element.requestPointerLock`, accessed 2026-08-05) a `requestPointerLock()` issued
  immediately after that gesture **"will fail, even if a transient activation is available."** Every panel
  `onClose` in `MenuSystem.jsx` relocks optimistically (KEVIN-FIX C4), so on the ESC path the relock is
  **always** refused. `pointerlockerror` then called `setActive(false)` — already false — so no state
  changed, nothing re-rendered, no transition ran. The player held: no panel, `active=false` (all movement
  gates on it, `Components.jsx:861`) and no title menu (suppressed once `gameStarted`, `panelState.js:49`).
  **No surface, no input, and mobs gate on neither.** Only a reload escaped.
  **Fix:** `shouldShowResumeOverlay()` — a recovery surface DERIVED FROM STATE, not opened by a handler,
  so no close path (present or future) can strand a player. No retry can work: the browser demands a fresh
  user gesture by design, so only a clickable surface recovers. App's pause-open moved to `useLayoutEffect`
  so the one intermediate render never paints.
  **Gate:** exhaustive over lock × gameStarted × isAlive × every panel (252 states, denominator asserted) —
  input-dead-and-alive must imply a way back. Mutation-proven RED against the old behaviour, where it names
  the two stranded states exactly.
  **Two defects only the FRAME showed:** the first draft used `text-text-inverse` (`#231708`, *"text on gold
  fills"*) on a near-black scrim — every jsdom assertion passed and it rendered dark-brown-on-black; and the
  S1-C design-language gate correctly rejected a frosted-glass backdrop.
  **⚠️ Why no gate caught this for months:** `scripts/visual/esc-pause-probe.mjs` presses ESC **once**, and at
  its line 54 substitutes `document.exitPointerLock()` for the native ESC — the one path MDN says does *not*
  trigger the refusal. It is green over exactly the half of the flow the bug lives in. New
  `scripts/visual/pause-resume-probe.mjs` covers the second press and asserts a working movement BASELINE
  before asserting the freeze (without that denominator, "did not move" proves nothing).
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

### A-bis. ✅ THE 18-DOMAIN REVIEW — 91 confirmed bugs — **ALL 8 SEAMS CLOSED 2026-08-05.**

> **Loop-actionable work in this block is DONE.** B1-B8 are all `▣✓`. What remains inside it is
> KEVIN-gated, not code: the two owed visual re-baselines (B5's HUD, B7's `mobile.png`) and B8's 3 taste
> items. Verify before re-opening anything here — B3 was already closed when a queue told me to start on it.
> Last two seams: **B4/B4b** (mobs hit you through 200 blocks of rock; windups bankable across de-aggro) and
> **B6c** (2 of 12 achievements dead on arrival — `updateLevel` had zero callers).


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
- ▣✓ **B2 — 8 of 8 FIXED.** (`…`, `f98d3c4`, `9200986`, 2026-07-14; B2g 2026-08-03.) ✓ B2a-e ✓ **B2f**
  night-ratchet ✓ **B2h** the kill block ran inside a setState updater (one throw voided the win) —
  extracted to `game/bossKill.js` (pure `applyBossDamage` + a post-commit isolated `runBossKillEffects`,
  win latch LAST).
  - **B2g ✓** the boss FIGHT survives a reload, not just the win. It was hook-local React state seeded from
    `BOSS_CONFIG.health`, so a refresh at 5% HP handed the player back all 700. Health/active/defeated now
    ride the store (joining the `bossActive` mirror that already existed) into `saveSchema`, restored
    through a pure `game/bossPersistence.js` whose hydrate ENFORCES the invariants rather than spreading:
    a won game can never re-arm the dragon, a defeated one stays defeated, health clamps into `[0, max]`,
    and a save with no boss block reads as "not started". **Phase is deliberately NOT persisted** — it is
    derived from health, and a second copy of one fact is free to drift; `phaseForHealth` is now the single
    derivation the hook's phase effect AND the rehydrate both call. **Two findings while wiring it:**
    (1) rehydrating mid-fight would have fired the `PHASE 3: ENRAGED!` banner on load, announcing a
    transition the player passed before quitting — the hook now seeds the phase from restored HP;
    (2) the encounter mirror needed its OWN effect: folded into the existing callback-registration effect
    (keyed on `[damageBoss, bossPositionRef, bossActive]`) health would have reached the store only when
    active FLIPPED — stale through the whole fight, i.e. the same bug wearing a fix.
    **Mutation-proven 3 ways.** Reverting the hook seed turns the hook gate RED while the store gate stays
    GREEN — which is why both files exist: the store round-trip alone would have shipped this.
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
- ▣✓ **B4 — BOTH HALVES FIXED 2026-08-05. `distToPlayer2D` is gone from the worker entirely.**
  `ai.worker.js:119` destructured the player as `const [playerX, , playerZ] = playerPos` under a comment
  reading *"Y is elided: the mob brain reasons on the XZ plane only"* — **the Y was always being sent and
  thrown away**, so no message plumbing was needed, only the decision to use it. Consequence: a zombie 200
  blocks below you and one block away horizontally was inside `MELEE_RANGE` and swung, so pillaring up,
  walling in and going underground gave ZERO protection and building was strategically pointless.
  Seam-extracted to pure `src/game/mobSenses.js`: **SENSING** (aggro, de-aggro leash, archery engagement)
  is now 3D, **REACHING** (melee, leap) additionally requires vertical proximity, and **MOVEMENT is
  untouched** — mobs still steer by setting `targetX/targetZ` to the player's XZ. eslint's
  `no-unused-vars` is what proved every call site had migrated: the old flat variable became dead.
  `VERTICAL_REACH = 2.5` is a **TASTE CALL, veto-able** — a 2-block ledge is still hittable, a 3-block wall
  is not; a spider's LEAP may cover as much height as ground so a low wall is not an auto-win. Both
  directions gated (14 pure + 11 scenario assertions incl. the counter-case that mobs must STILL reach a
  player on level ground) and mutation-proven: reverting the melee line to the XZ comparison reddens 2.
  - ▣✓ **B4b FIXED 2026-08-05 — the attack telegraph can no longer be BANKED.** `attackPhase()` is called
    only inside `if (isAggro)`, so a mob that de-aggroed mid-windup froze `windupUntil` at a past
    timestamp; on re-engagement `now >= windupUntil` was already true and the first tick returned `strike`
    — an instant hit with no telegraph to read and no window to dodge. The ~380ms windup IS the fairness
    contract, so a banked one is worse than none. **My first fix (clear on de-aggro) was WRONG and the gate
    caught it:** those are `else if` arms, so a mob arriving already carrying a stale windup never passes
    through the de-aggro branch and cashed the swing anyway. Now cleared on the **rising edge** of aggro —
    a fresh engagement gets a fresh telegraph however the mob got there. Counter-cases gated in the same
    file (a normal windup must still land, and a mob that stays aggro must keep its charge counting down),
    and mutation-proven: deleting the rising-edge reset reddens the re-aggro case.
- ▣✓ **B5 [LOOP] THE HUD LIES — DONE, 2026-07-14: dial (`712ea78`) + stat-stack layout (`7e0f004`) + progression-modal (`690b070`) FIXED; inventory-"+" verified STALE. Only the owed visual re-baseline remains (capture harness unhealthy).**
  ✓ **The day/night dial is now synced to the real clock.** It was a quarter-cycle (90°) out of phase —
  the inline `angleDeg - 180` assumed `cf=0` was MIDNIGHT, but the game's authoritative phase
  (`dayNight.isDayAtUnit`) is day=`[0,600)` / night=`[600,1200)`, so real noon is t=300. Symptom: the sun
  was drawn at ZENITH one second before nightfall (and underground at dawn); the moon rode high in the sky
  most of the night. Fix: moved the offset to `- 90` in a pure `dayPhase.markerAngleDeg` seam +
  `markerQuadrant` geometry helper → sun above the horizon all day, moon below it all night
  (sunrise-left / noon-top / sunset-right / midnight-bottom). RED-first against the REAL clock (not the
  module's own mislabeled comment — that mislabel was the trap), mutation-proven (`-90`→`-180` goes RED).
  unit 2040→2044.
  ✓ **The stat-stack layout is FIXED (`7e0f004`, 2026-07-14).** The health/mana bars are no longer buried:
  moved the stack from `top-16 left-4` (under the opaque QuestTracker panel — 100% invisible, only a ~2-char
  mana-value sliver poked past the panel's right edge) to the free **bottom-left** corner, and made the
  container a real `flex flex-col gap-2 w-44` column (StatBar's `inline-flex` root made `space-y-2` a no-op →
  the 7 bars had ribboned horizontally). Verified in a REAL browser — new **`tests/e2e/hud-layout.spec.js`**
  measures rendered geometry: RED-first showed health at (16,72) inside the quest panel (16..296 × 16..279)
  and mana on the same row; GREEN after the fix puts health at (16,736), mana below at (16,764), both clear
  of the quest panel. Non-vacuous (className is the sole RED→GREEN variable). `HUD.jsx:547`, `StatBar.jsx:18`.
  **B5 REMAINDER:** ✓ **Progression panel header FIXED (`690b070`)** — it put flex-centering + `overflow-y-auto`
  on the SAME element, so the ~1962px-tall panel's header (+ close X) was clipped 556px above the viewport,
  unreachable. Fixed with the two-div scrollable-modal pattern (outer scroll, inner `min-h-full` flex-center).
  Lived e2e (`panel-overflow.spec.js`) at 1280×800: RED header top −556 → GREEN +169. Mutation-proven.
  ✓ **Inventory "+" buttons — VERIFIED STALE (already reachable), 2026-07-14.** The registry claimed they were
  "below the fold with no scroll", but the modal was refactored to a fixed `h-[440px]` body in a ~505px panel
  that FITS an 800px viewport (grid-centered) with Column 1 (the "+" buttons) on its own `overflow-y-auto`.
  Lived @1280×800: the "+" measured top=572, hittable=true, and stayed reachable through two layout mutations.
  No code change (fixing a non-bug would be the dial-detour trap); no permanent gate kept (a reachability
  assertion couldn't be made to fail → decoration). **B5 is DONE** (dial + layout + progression fixed; this
  verified stale). **+ VISUAL
  RE-BASELINE OWED** — the gameplay HUD baselines still show the OLD buried position; a re-capture is owed
  once machine load < ~10 (was ~24; the capture harness times out above that). Intended change → KEVIN-REVIEW.
- ▣✓ **B6 — ALL THREE FIXED.** (B6a+B6b `df90131` 2026-07-14; B6c 2026-08-05.)
  - **B6c ✓ 2 of the 12 achievements were DEAD ON ARRIVAL.** 'Rising Star' (level 5) and 'Shining Star'
    (level 10) key off `stats.level`, which is written by exactly one function — `updateLevel` in
    `QuestSystem.jsx`. It was returned from the hook and **published nowhere**: every sibling event
    (`onSpellCast`, `onBlockPlace`, `onChestOpen`, `onNightSurvived`…) is put on the store for its emitter
    to call, and this one was simply left off that list, so nothing ever called it and `stats.level` never
    moved off 1. Published as `onLevelChanged` and called from the XP system's level effect — deliberately
    OUTSIDE its increase-only branch, so a save loaded at level 7 retroactively unlocks Rising Star.
    Gated behaviourally at BOTH ends (mount the real quest hook and drive the real unlock set; mount the
    real XP hook and move the store's level) and mutation-proven both ways: deleting the publish reddens 6,
    deleting the call reddens 2. *An earlier draft asserted the emitter with a source-grep; replaced with a
    mount before `gate-shape` had to reject it.*
  - ▣✓ **B6a+B6b (`df90131`, 2026-07-14).** ✓ **B6a** double-count + ✓ **B6b** dead mobType filter —
  one pure `game/questMatch.js` seam replaced the buggy inline matcher: a 'kill' quest advances only on the
  'kill' dispatch (not the kill_type echo), a 'kill_type' quest only for its own mob. RED-first e2e through the
  real hook + emitMobKill; mutation-proven both ways. **Still open (separate, LOW): the 2 unlockable
  achievements — `updateLevel` has zero callers (`QuestSystem.jsx:398-404`).**
- ~~▢ **B6 [LOOP] QUESTS MISCOUNT.**~~ Every "Defeat N mobs" quest **completes at half the advertised cost** —
  `onMobKill` fires `updateQuestProgress('kill')` AND `('kill_type')` and the match arm accepts both, so **each
  kill counts twice**. The **mobType filter is dead code** — killing any mob advances every targeted-hunt quest
  ("Defeat 5 moss brutes" completes on 5 spider kills). Two of the twelve achievements **can never unlock**
  (`updateLevel` has zero callers). `QuestSystem.jsx:197-199/317-318/398-404`.
- ▣✓ **B7 [LOOP] TOUCH — ALL 4 SUB-BUGS FIXED, 2026-07-14: colors (`d45b698`) + stray-tap (`83ef50d`) + pause-mistap (`9f6c422`) + hotbar-overflow (`efa844e`). Only the owed `mobile.png` re-baseline remains (capture harness unhealthy).**
  ✓ **Pause-mistap FIXED.** The transparent Pause touch hit-target was disjoint from the visible Pause glyph
  and sat on top of the GameHud Settings gear: on a 390px phone the glyph was at x280–326 but the hit-target
  at x338–382 (`right: 8`), overlapping the gear (x332–374) → tapping Settings paused the game, tapping the
  Pause icon did nothing. Fix: aligned the hit-target to its glyph (`right: 64, 46×46`, `TouchControls.jsx`).
  Verified in a REAL touch browser (`touch-controls.spec.js` measures the 3 rects): RED-first hit disjoint
  from glyph + covering the gear; GREEN hit exactly under the glyph + clear of the gear. Mutation-proven. Only
  the transparent hit-target moved → no baseline impact.
  ✓ **Stray-tap-kills-joystick FIXED.** The touch zone router made EVERY left-half touch a 'move' touch, so a
  stray tap while the joystick was held also owned the move zone — and `handleTouchEnd` clears all four move
  intents when ANY move touch ends, so the tap's release froze the player mid-run. Fix (pure, in
  `touchMath.js makeTouchRouter.onStart`): exactly ONE move touch may be active; a second concurrent left-half
  touch is routed to an inert `'ignore'` zone. RED-first pure unit test (router + `handleTouchEnd`, no DOM),
  mutation-proven. unit 2044→2046. No render change → no baseline impact.
  ✓ **The joystick knob + all touch-button borders are now visible.** They were bare `var(--ui-*)` used as
  colours against space-separated **RGB-channel** tokens (`--ui-accent: 201 168 106`) → invalid colour →
  transparent knob + dropped borders (the lucide glyphs survived on a literal hex). Fix: wrapped the INK/GOLD
  constants in `rgb(...)` (`ui/TouchControlsSurface.jsx`). Verified in a REAL touch browser — new
  **`tests/e2e/touch-controls.spec.js`** (chromium + `hasTouch`) reads the knob's computed style: RED-first
  `bg rgba(0,0,0,0)` / `border 0px`; GREEN `bg rgb(201,168,106)` / `border 4px`. Mutation-proven (constants
  are the sole RED→GREEN variable). ✓ **Hotbar-overflow FIXED (`efa844e`):** the 9 slots (≈622px centered)
  ran off both edges of a 390px phone (grass/dirt/cobblestone/chest off-screen). Fixed with a viewport-
  responsive `max-[640px]:scale-[0.56] origin-bottom` (all 9 fit + stay centered; tablets keep full size).
  Lived e2e measures every `[data-hotbar-block]` rect (RED off-screen → GREEN all within [0,390]),
  mutation-proven. **B7 DONE.** The only remainder is the owed `mobile.png` re-baseline (capture harness
  unhealthy — see the owed-re-baseline batch). Touch-target-size vs all-9-visible is a taste note for Kevin.
- ▣✓ **B8 [LOOP] COMBAT + WORLD FEEL — ALL 5 FIXABLE DONE, 3 → Kevin.** ✓ fireball · ✓ arcane-pierce · ✓ alt-tab
  · ✓ ocean-in-caves · ✓ **spatial-audio (`e78bd1c`)** — was dead until the first hostile spawned: the SoundProvider
  context exposed `audioContext.current`/`sounds.current` (refs read at render) but populated them in a mount-effect,
  so consumers got stale undefined/{} until an unrelated re-render (first-hostile via the music effect); fix =
  `setAudioReady(true)` re-render after init. RED-first jsdom (mock Web Audio), mutation-proven. **Aural confirmation
  (footsteps audible from start) → a quick Kevin ear.** → KEVIN (design/feel): chest-mining, 500ms damage-lockout,
  camera-shake-per-frame, B4 mob-AI-2D. **B8 autonomous work COMPLETE.**
  ✓ **Fireball 12m cap** (`9c7c1af`) · ✓ **Arcane pierce triple-hit** (`a845bef`) · ✓ **Alt-tab stuck keys**
  (`92d92ec` — held move intents now cleared on blur/tab-hide via `input/blurReset.js` + `clearHeldIntents`).
  ✓ **Ocean-in-caves FIXED (`05082fa`):** the ocean plane rendered + CPU-recomputed ~9.4k Gerstner vertices
  every frame even buried inland / inside caves (~14% budget). Fix: pure `world/oceanVisibility.js`
  `oceanVisibleNear()` (samples surface height at the camera + a ring; hidden when all-land-above-sea-level →
  plane fully buried) gates the render + recompute in `render/Ocean.jsx`; capture-suppressed so baselines are
  byte-identical. RED-first pure unit, mutation-proven, safe-by-construction. ✅ **Lived probe DONE (2026-07-20,
  load ~6):** `scripts/visual/ocean-probe.mjs` (hardened for hygiene first) — 4 coast/surface/underwater shots
  all CLEAN: ocean renders at the coast (crisp coastline, animated water + foam in topdown-coast), depth-tint +
  shore→deep ramp underwater, NO black voids / missing chunks / ocean-into-land bleed → **no coastal regression**
  from the visibility gate. Caveat: these are COAST shots — the in-cave suppression is covered by the pure
  `oceanVisibleNear` unit (returns false all-land-above-sea), NOT lived-confirmed (this probe takes no cave shot);
  an in-cave lived shot + the water aesthetic sign-off remain → Kevin (KEVIN-REVIEW-BATCH).
  **(all fixable B8 bugs now shipped — see the header; spatial-audio was the last, fixed `e78bd1c`.)**
  **→ KEVIN-REVIEW (routed 2026-07-14 — design/feel, do NOT change):** **chest-mining** (LMB on a chest MINES
  it + loses its stored inventory; RMB opens; but `verbRouter.test.js` §5-12 EXPLICITLY tests LMB→mine as
  "break chest, existing cleanup" → a design call, recommended LMB-opens-not-mines); the 500ms *global*
  damage-lockout (a pack of N deals the damage of ONE); camera-shake decays per-frame-not-per-second (1067ms
  @30fps vs 267ms @120fps). **B4** mob-AI-2D→3D → Kevin. Details in KEVIN-REVIEW-BATCH.

**MEDIUM (32) + LOW (13)** — enumerated in the audit doc. Fold them into the seam slices above where they share
a root cause; do not open 45 separate tickets.

### B-terrain. Terrain/grass SOTA queue — `docs/superpowers/TERRAIN-GRASS-SOTA-PLAN.md`

▣✓ S1 `71c24ca` mesher extracted + behavioural geometry gate · ▣✓ S3 `d676069` UV transposition (five of
six face directions) · ▣✓ S5 `03c4297` scoped mask clear. Next: S6 (grass motes seeded at origin with no
chunk offset), then S7-S15.

- ⊘ **S4 DEFERRED — the plan's flip condition is probably inverted, and I could not settle it.** —
  `node -e "…"` *(reasoning below; no command settles a taste question)*
  S4 wants the greedy quad's triangulation diagonal chosen by AO so gradients stop creasing along one
  fixed diagonal. The plan says flip "when the current diagonal is the brighter one". Working the concrete
  case of one dark corner and three light: `a0+a2 = 3` vs `a1+a3 = 6`, and flipping is what confines the
  darkness to the corner that is actually occluded — i.e. flip when the current diagonal is the DARKER
  pair, the opposite of what the plan says. The canonical voxel formulation appears to read the other way
  again, so all three readings disagree.
  **Why it is deferred rather than guessed:** S4 is purely aesthetic. No behavioural test distinguishes
  correct from inverted — both windings stay CCW, both pass every gate — so the ONLY verification is
  looking at the render, and the visual harness is exactly what is broken (§B-race). Shipping a coin-flip
  into a blind harness would produce a green push and an unverifiable result.
  **Unblocks when §B-race does.** Then: implement, capture, and LOOK at a face with strong AO contrast.

### B-race. ✅ CLOSED — but the closing claim was TOO BROAD, and S8 falsified it the next day.

> **⚠️ AMENDED 2026-08-08 (`c472533`). Read this before trusting any visual diff.**
> The block below closes B-race with "HARNESS DETERMINISTIC". **Determinism was never a property of the
> harness.** It was a property of *(harness x the code state it was measured against)*, and this section
> recorded it as if it were general. S8 (`947748f`) — one per-chunk `instanceColor` buffer and one shader
> permutation — was enough to break it:
>
> | `explore-day` run-to-run self-diff | |
> |---|---|
> | pre-S8 control | 0.075% |
> | S8, on the harness this section blessed | **1.646%** (22x) |
> | S8, after `c472533` | **0.083%** |
>
> Root cause: `capture.mjs` polled the chunk COUNT and then slept a fixed `delay(2500)` for the mesh
> swap-in it admitted the count could not see. A sleep encodes an assumption about frame cost that any
> commit can invalidate. It is now a CONDITION — `waitForStableFrame` in `scripts/visual/_probe.mjs`
> polls until the frame stops changing, refuses a blank frame, and WARNs loudly rather than
> screenshotting anyway. Current state: worst **0.083%**, 0 of 31 above 1%, **22 of 31 byte-identical**,
> zero never-stabilized warnings.
>
> **The lesson is the one the pass-13 note already carried, one level up.** "Three runs agreed" is not
> determinism, in the same way one run is not. Determinism is a claim about a code state, so it expires
> when the code does — **re-measure it on any commit that changes frame cost, and never inherit it from
> this document.** Also note the whole 1.646% sat under the 6% gate: the visual gate reported GREEN
> throughout.

**THE RE-BASELINE IS DONE.** Three consecutive runs at loads ~5.5 / ~25.9 / ~14.7 all logged
`player settled at y=52.2 via terrain-formula+hearth (physics + visual)` — same source, same value, three
different machine loads. Run-to-run diff across all 31 frames: **worst 0.045%** (`hearth`), **0 of 31 above
1%**, against a 6% gate threshold. The only warning is `title-mascot`, which is UNGATED and non-fatal by
design — so this is determinism by SUCCESS, not the shared-failure trap of pass 13.

**27 baselines re-frozen** (4 unchanged). Opened `beast-fire` (dragon planted on the Hearth pad, lodge
behind, ground glow, sunset) and `explore-day` (HUD, quests, compass, hotbar, landscape) before committing —
a green diff is not a lived result, and opening images is what caught the cut-off head and the buried dragon
earlier in this campaign.

*(Passes 6-16 below are the investigation that got here. ~16 hypotheses were measured dead; the header they
carried — "THE VISUAL HARNESS IS NON-DETERMINISTIC" — was itself the first thing disproved.)*

> **⚠️ EVERYTHING BELOW THIS BLOCK IS THE 2026-08-05 INVESTIGATION AND ITS PREMISE IS SUPERSEDED.**
> Kept because passes 1-5 are a record of how the wrong conclusion was reached five times. Read the header
> as: *the "non-determinism" was never the disease.*

**PASS 6 (2026-08-08) — ran the prescribed experiment: FULL capture twice, identical code, every frame
diffed between runs.** Result: **0 of 31 frames differ by more than 1%.** Worst is `explore-night` at
**0.08%**; the four `beast-*` frames are **0.00%**. The 2026-08-05 reading — *"15 of 31 differ, beast-* by
69-72%"* — **does not reproduce.**

- **The load/environment hypothesis is DISCONFIRMED, and it was mine.** I predicted the variance was
  machine-load-driven (the box was at load 22.49, `AGENTS.md` says the capture harness is load-sensitive,
  and the compositor is intermittent). Run B executed at load **18.06** — high — and still produced 0.00%.
  High load does not produce the variance. Recorded because it was the stated reason for running this.
- **Compositor ALIVE** at 62-65 rAF/1.2s across three separate checks. Also intermittent-by-history, so
  re-check it, but it did not gate this work.

**WHAT IS ACTUALLY WRONG — and 0.00% is what exposed it.** Determinism is not correctness: the two runs
agree because they are consistently producing the SAME WRONG FRAME. **Open `beast-fire.png`: it is a
distant snow mountain against an orange sky, with no beast anywhere.** The committed BASELINE is the same
beast-less mountain. So the visual gate has been comparing one empty mountain against another and passing
— **4 of 31 gated states assert nothing about the subject they are named for.** This is the project's own
vacuous-gate defect, in the visual harness.

**ROOT CAUSE, measured in the REAL capture sequence (not a shortcut — that was pass 2's error).**
Instrumented the beast stage in place and read the state at hook-fire time, all four elements identical:

```
[DBG-B6] fire: rbPresent=true t={"x":0,"y":100,"z":0} beastFormActive=true studio=false
```

- `rbPresent=true`, so the silent `{x:0,y:55,z:0}` fallback at `App.jsx:353` **never fires** — that
  candidate is dead too.
- The player rigid body is at **(0, 100, 0) — the spawn position** (`Components.jsx:1304`), never fallen.
- `GameScene.jsx:231` is `<Physics gravity={[0,-30,0]} paused={isCaptureMode}>` — **physics is frozen in
  capture mode BY DESIGN, for determinism.** So the player can NEVER settle during a capture.
- `spawnBeastTransform` (`App.jsx:352-361`) is the **only** fixture that frames its camera relative to the
  player's physics position. Its comment says *"Player is settled on terrain by now."* That is not stale —
  it is **structurally impossible**. The camera is therefore placed ~101 units above the world origin,
  looking at empty sky with the terrain far below. That is exactly the frame.
- Corroboration: the four beast baselines differ from each other by only 5.6-6.4%, and lightning-vs-arcane
  by **0.06%** — precisely what the per-element `CAMS` offsets predict (their entries differ by 0.1 in y
  alone). So the camera IS applied per element; it is applied around a point where there is nothing.

**⚠️ DO NOT "FIX" THIS BY WAITING FOR THE PLAYER TO SETTLE — it would hang forever.** Physics is paused
deliberately. The fix must make the fixture independent of the frozen body: position the beast + camera at
a known deterministic point, or drive the fixture from terrain height rather than `rb.translation()`.

**STILL OPEN (stated, not inferred):** the camera looks at (0, 100.55, 0) from 3 units away, and the beast
is player-attached, so it arguably SHOULD be in frame even at spawn altitude — yet nothing is visible.
Whether the beast mesh fails to mount in capture mode, or mounts somewhere other than the rigid body, is
**unresolved**. Do not assume; measure it before fixing.

**PASS 7 (2026-08-08) — FOUR MORE CANDIDATES KILLED, AND MY OWN PASS-6 EXPLANATION IS PARTLY WRONG.**
All measured in the REAL capture sequence (instrumented in place, restored from a verified-clean cp-backup).

- **The beast IS mounted, positioned and visible.** 21 meshes within **0.64 units** of the body at
  worldY≈120 — `MeshToonMaterial` body parts plus `MeshBasicMaterial` glow spheres — several `visible:true`.
  So "the mesh fails to mount" and "the mesh mounts somewhere else" are both DEAD.
- **The camera is correctly placed AND correctly aimed.** pos `(1.7, 121.45, 2.8)`, rotation applied
  (`-15.4°, 31.3°` — so the `lookAt` is NOT being dropped), **angle to the beast 8.5°** against a 37.5°
  half-FOV, `beastInFrustum: true`, distance 3.4, near 0.1 / far 500. So "camera mis-aimed" is DEAD.
- **⚠️ CORRECTION TO PASS 6:** I wrote that physics being `paused={isCaptureMode}` means "the player never
  leaves spawn (0,100,0)". **That is wrong.** The body reads y=**100** at hook-fire and y=**120** one second
  later at screenshot time — it is being driven upward (~20 units/s) during the stage. The camera tracks it
  (121.45 = 120 + 1.45), so the two stay aligned, but the fixture is NOT static and the pause does NOT
  freeze this body. The y=100 reading was real; the mechanism I attached to it was not.

**SO THE CONTRADICTION IS NOW SHARP AND SMALL.** At screenshot time every piece of scene state is correct —
beast present, visible, 3.4 units away, 8.5° off the camera axis, inside the frustum — **and the written PNG
is a distant mountain.** The state and the pixels disagree. That points at the COMPOSITED FRAME not
reflecting the state (a render-freshness problem, consistent with this repo's documented intermittent
compositor), not at the fixture's geometry. **Do not re-litigate mount/camera/position — they are measured
and correct.** Next: prove whether a fresh frame is composited after the state change (e.g. force rAF ticks
and re-shoot, or compare against a shot taken after an additional flush), and only then design the fix.

**METHOD NOTE — cost this bought.** Each probe is a ~6-minute full capture. Two runs were wasted: one to a
`setInterval` that survived into a detached frame, one to two background jobs racing on the same file so a
"clean" cp-backup captured the other job's instrumentation. **Instrument, run, and restore in ONE job, verify
the backup is byte-identical to HEAD before trusting it, and never run two capture jobs at once (both bind
port 4178).**

**PASS 8 (2026-08-08) — TWO MORE CANDIDATES DEAD, AND PASS 7'S KEY EVIDENCE WAS OVER-ATTRIBUTED (mine).**

- **DEAD: "the store camera is not the render camera."** There is exactly **ONE** camera in the whole scene
  graph, and it **IS** `st.gameCamera`, at `(1.7, 121.45, 2.8)` — so everything measured in pass 7 was
  measured on the camera that renders. (`__r3f` was unreachable so identity could not be read from R3F's
  own store, but a single-camera graph settles it.)
- **DEAD: render-freshness via demand-mode.** `GameScene.jsx:120` `<Canvas>` sets **no `frameloop` prop**, so
  R3F defaults to `"always"` and re-renders every frame. rAF is alive (preflight 70 frames/1.2s), and
  `flushFrames` awaits 8 real rAF ticks and returns.
- **How the pinned pose actually works** (`Components.jsx:502-517`): the capture branch hard-sets
  **`state.camera`** — the render camera — every frame from `getCaptureOpts().camera`, which is a **STATIC**
  pose stored in module-level `_opts` (`devtest/captureMode.js:18,39`) at the last `enterCaptureMode` call.
  `spawnBeastTransform` computes that pose from `rb.translation()` at HOOK-FIRE time. Since the body drifts
  upward during the stage, hook-time `t` and screenshot-time `t` need not agree — worth keeping in mind, but
  in the measured run camera (121.45) and body (120) DID agree, so this is not yet shown to be the fault.

**⚠️ SELF-CORRECTION — PASS 7'S "THE BEAST IS MOUNTED" IS NOT ESTABLISHED.** I reported "21 meshes within
0.64 units of the body, therefore the beast is mounted and visible". That inference is unsound: **five other
systems mount at the SAME RigidBody** — `PhantomBlockSystem`, `HurlSystem`, `SnareTetherSystem`,
`SquadAISystem`, `ElementZoneSystem` (`Components.jsx:1310-1315`). The geometry I saw (BoxGeometry +
MeshToonMaterial, SphereGeometry + MeshBasicMaterial) is CONSISTENT with `beastAvatarParts` (boxes + core +
aura) but is NOT SPECIFIC to it — PhantomBlock renders boxes at that mount too. Proximity is not identity.
**So "is the beast rendering at all?" is OPEN again**, and it is the question to answer next.

**THE DECISIVE NEXT PROBE (do this one, not another proximity scan):** identify the beast's own meshes by
**material COLOR** against `ELEMENT_COLOR[element]` in `src/render/beastAvatarParts.js`, and by the box COUNT
in `FORM_PARTS[element].boxes`. Report, for those meshes specifically: world position, world SCALE (the entry
animation has a scale overshoot and the file claims capture "FREEZES to the SETTLED beast" — an unfrozen
entry would leave scale 0), material opacity, and NDC projection. That distinguishes "not mounted" from
"mounted at scale 0" from "mounted and on-screen", which proximity never could.

**PASS 9 (2026-08-08) — THE BEAST IS FOUND. IT RENDERS ~20 UNITS BELOW THE FRAME. FIX IS PARTIAL.**

Identified the avatar's OWN meshes by material colour (`#3a1206` body ink / `#ff6a2c` glow / `#ffe3c0` core
from `ELEMENT_COLOR`), not by proximity — which is what pass 7 got wrong. **16 beast meshes found, 13 of the
14 fire boxes**, and they are unambiguous:

```
part=body  BoxGeometry  visible=TRUE  scale=[1,1,1]  opacity=1  wpos.y=100.0..101.6  ndc.y = -2.87..-3.19
```

- **The beast is mounted, visible, at full scale, fully opaque.** "Not mounted" and "scale 0" are both DEAD.
- **`ndc.y ≈ -3`** — the valid range is -1..1, so every beast mesh is off the BOTTOM of the screen.
- **The two sources of truth diverge:** the avatar RENDERS at y≈100-101.6 (the RigidBody's declared
  `position={[0,100,0]}` + `FEET_OFFSET -0.9` + box offsets — an exact arithmetic match), while
  `rb.translation()` reports y=**120** and the camera was framed from THAT. Physics is `paused` in capture,
  so rapier never syncs the visual transform from the physics body.

**SHIPPED:** `spawnBeastTransform` no longer frames off `rb.translation()`. The framing is extracted to a
pure, tested module (`src/game/beastRevealCamera.js`) and anchored to a shared `PLAYER_SPAWN`
(`src/game/playerSpawn.js`, now also used by `Components.jsx` so the two literals cannot drift). Gated by
`tests/gates/beast-reveal-camera-gates.test.js` — 13 assertions on *distance from the avatar origin*, which
is precisely what a 20-unit divergence breaks; mutation-proved (framed fire 20 units high → 3 RED).

**⚠️ BUT THE LIVED FRAME STILL HAS NO BEAST — DO NOT RECORD THIS AS FIXED.** Re-captured and opened the
image: still a mountain. The fix DID take effect (before-vs-after diff **15.66%**, so the camera moved; 0%
would have meant nothing changed). So framing from `rb.translation()` was **necessary but not sufficient**.

**THE NARROWED NEXT STEP.** A constant is still an assumption: the avatar renders at the RigidBody GROUP's
world transform, which is not guaranteed to equal `PLAYER_SPAWN` on every run (rb itself read 100 in one run
and 120 in another). **Frame from the avatar's ACTUAL RENDERED WORLD POSITION** — e.g. expose the
`BeastAvatar` group (or the RigidBody's object3D) and read `getWorldPosition()` at hook time — then re-capture
and OPEN THE IMAGE. Measure the group's world position first; do not assume it is `PLAYER_SPAWN`.

**PASS 10 (2026-08-08) — THE BEAST RENDERED, THEN DIDN'T. THE POSITION IS NON-DETERMINISTIC. THE HARNESS
CAN NO LONGER LIE ABOUT IT.**

- **The framing fix WORKS — verified by opening the image.** At load ~5, with `bfc1528` in place: 16 beast
  meshes, **16 of 16 ON SCREEN**, first sample `ndc [0, -0.15, 0.95]` (dead centre), camera `[1.7, 101.45,
  2.8]`, beast worldY 99.4-101.6. `beast-fire.png` shows the reared dragon — horns, spread bat-wings,
  glowing core. **The first correct beast frame this project has ever captured.**
- **⚠️ AND THEN THE SAME CODE FAILED.** A later run, no source change, load ~17: `16 mesh(es) in the scene
  but only 0 project on screen`. Earlier the same day, load ~30 produced a beast-less frame too.
  **So the avatar's RENDERED position is NOT deterministic across runs** — `rb.translation()` has read 100
  and 120 on different runs, and the visual group evidently varies with it. Framing from the constant
  `PLAYER_SPAWN` matches only when the group happens to land at 100. **A constant was still an assumption,
  and it is now falsified.** Do NOT treat the beast fixture as fixed.
- **THE REAL REMAINING FIX** is the one the loop prompt already named and I short-cut: frame from the
  avatar's ACTUAL RENDERED WORLD POSITION (`getWorldPosition()` on the mounted group), not from `rb`, and
  not from a constant. Note the ordering trap: `spawnBeastTransform` sets `beastFormActive` and calls
  `enterCaptureMode` in the SAME synchronous block, BEFORE React mounts `BeastAvatar` — so the group does
  not exist yet at hook time. The camera must therefore be re-derived AFTER the mount (or the fixture split
  into mount-then-frame).

**SHIPPED — the capture can no longer write a picture of the wrong thing.**
`scripts/visual/_probe.mjs` gains `subjectVerdict` (pure) + `assertSubjectOnScreen`, and the beast stage
uses it. It identifies the subject **by material colour** derived from `ELEMENT_COLOR` (now exported, so the
palette is never re-typed), and **separates the two failure shapes** — NOT MOUNTED vs MOUNTED-BUT-OUT-OF-FRAME
— because they need different fixes. Non-fatal by design (same graceful-degradation shape as the menu
diorama): it SKIPS the bad frame, keeps the last-good one, continues so the other 27 states and any
re-baseline still capture, and **exits the run NON-ZERO at the end**.

*Live mutation proof, twice:* framed fire 20 units high → the run refused with `"beast-ice": 11 mesh(es) in
the scene but only 0 project on screen`; and the unmutated run refused `beast-fire` under load. Both times
the harness declined to write a beast-less PNG that a byte-comparison would have blessed forever. Unit-level:
`tests/gates/subject-on-screen-gates.test.js`, 8 assertions, mutation-proved (disabling the out-of-frame
branch → 3 RED).

**CONSEQUENCE TO EXPECT:** `visual:capture` now exits non-zero whenever a beast state has no beast — which
is most runs until the position fix lands. **That is the harness working.** It is the difference between a
red run and four baselines of a mountain.

**PASS 11 (2026-08-08) — THE BEAST IS FIXED AND VISIBLE IN EVERY RUN. THE BACKDROP IS NOT DETERMINISTIC.**

**SHIPPED — the fixture now frames from where the avatar ACTUALLY RENDERED.** `BeastAvatar` publishes its
group to the store (same transient-ref idiom as `playerRigidBodyRef`), and a second hook
`frameBeastReveal(element)` re-derives the shot from `getWorldPosition()` AFTER the mount.
`spawnBeastTransform` can only guess, because it triggers the mount and frames in the SAME synchronous
block — React has not run yet, so the group does not exist. The capture calls spawn → flush → **re-frame**
→ flush → assert → shoot. The feet-offset is compensated from the exported `FEET_OFFSET` (the published
group sits at the FEET; the reveal offsets were authored against the capsule CENTRE — ice looks at −0.15,
i.e. BELOW its origin, which is only meaningful from a centre. Framing straight off the group cut the
dragon's head off, and the image is what showed it).

**VERIFIED BY OPENING THE IMAGES, at three different machine loads:** the fire dragon (horns, spread
bat-wings, glowing core) and the ice brute (horned quadruped, distinct silhouette) both render, framed, in
every run. `capture exit=0`; `assertSubjectOnScreen` never fires.

**⚠️ AND THE DETERMINISM CHECK — my own rule, and it paid — FOUND THE LAST DEFECT.** Re-ran the same code:
the avatar framed at **y=53.2** where the previous two runs framed at **y=100**. The camera tracked it
correctly (beast in frame both times, which is the fix working across a 47-unit swing), but the frames
differ **44-56%** between runs because the WORLD BEHIND the beast is completely different — at y≈53 the
player has settled onto terrain and the shot is the intended in-world Hearth reveal; at y≈100 it is still
at spawn altitude and the beast floats in empty sky.

**SO: the 4 beast states render correctly but STILL CANNOT BE BASELINED.** Not because the beast is
missing — that is fixed — but because the gate's 6% threshold cannot survive a 44-56% backdrop swing.

**THE LAST DEFECT, precisely stated:** the PLAYER'S capture-time position is a race — sometimes settled on
terrain (~53), sometimes still at spawn (~100), and `rb.translation()` has also read 120. Physics is
`paused={isCaptureMode}`, so something other than gravity is moving that kinematic body, and whether it has
finished by the beast stage varies. **Fix that and the beast states become baselineable; it is also the
same root cause behind the earlier 100-vs-120 readings.** Note this is a CAPTURE-DETERMINISM defect that
happens to be visible here — it may affect any stage whose content depends on player position.

**KEVIN-GATED, do NOT decide unilaterally:** if the player position cannot be made deterministic cheaply,
the alternative is making the beast reveal a STUDIO card like `boss-closeup` (fixed SX/SY/SZ, clean sky
backdrop). That would REVERSE a recorded design decision — the fixture is IN-WORLD on purpose, so the
silhouette is judged in its true context (`setCaptureStudio(false)`, and the code comment says so). Surface
it; do not just do it.

**PASS 12 (2026-08-08) — THE THREE POSITIONS ARE NAMED CONSTANTS. THE PHYSICS BODY IS DETERMINISTIC NOW.
THE VISUAL GROUP IS NOT — AND THAT IS THE LAST LINK.**

**Every observed player position is now identified, not guessed** (`src/game/spawnPlacement.js`):
| observed | constant | meaning |
|---|---|---|
| **100** | `PLAYER_SPAWN` | the RigidBody's DECLARED transform — the settle never ran |
| **120** | `SPAWN_FREEZE_Y` | "hold in the sky until the world builds" |
| **~53.2** | `spawnTargetY(groundY)` | settled on terrain — the INTENDED in-world state |

**WHY IT RACED.** `capture.mjs` calls `enterCapture` at `:187`, BEFORE the world builds. The Player's
spawn-settle (`Components.jsx:793-843`) lives BELOW the capture early-return in the same `useFrame`, so once
capture mode is on the settle can NEVER finish — the body freezes at whatever stage it had reached.
Counter-intuitively the LOADED machine settled and the fast one did not: a slow box takes longer to
round-trip the `enterCapture` evaluate, giving the app more frames first.

**SHIPPED:** test hook `settlePlayerToGround` runs the SAME pure decision the Player uses
(`resolveSpawnGround` + `spawnTargetY`) on demand, and the harness calls it after `waitForStableTerrain`,
bounded-retry, loud on failure. **It works: `player settled at y=53.2` on every run.**

**⚠️ AND IT IS NOT ENOUGH — the last link, measured.** Two full runs after the settle: the beast framed at
**y=120** in one and **y=100** in the other, neither at the settled 53.2. **`setTranslation` moves the
PHYSICS body; the VISUAL group does not follow, because paused physics never syncs them** — the same
desync that started this whole investigation, now biting the settle. `frameBeastReveal` correctly reads the
VISUAL group (which is why the beast is always in frame), but that group sits at its declared 100, or 120
when a sync happens to have occurred.

▶ **NEXT — make the VISUAL transform deterministic, not just the physics body.** The RigidBody's own
Object3D is the thing that must move (or be synced) under capture. Options to evaluate, cheapest first:
(a) publish the RigidBody's Object3D the way `beastGroupRef` is published and set its position in the settle
hook; (b) let rapier run ONE step at settle time so it syncs, then re-pause; (c) run the spawn-settle ABOVE
the capture early-return so it completes normally under capture. **(c) is the most honest** — it makes the
captured world the world the game actually produces — but it touches the frame loop, so gate it carefully
and re-check every other baseline.
**Do NOT re-litigate:** the beast is correctly framed in all of these runs; only the BACKDROP varies.

**PASS 13 (2026-08-08) — ALL 31 FRAMES ARE NOW WITHIN THE NOISE FLOOR. BUT THE STABILITY RESTS ON A
FAILING SETTLE, SO DO NOT BASELINE ON IT YET.**

**Measured, two full runs, identical code:** **0 of 31 frames differ by >1%** (gate threshold is 6%). Worst
is `menu` **0.13%**; the four beast frames are **0.01-0.03%**, down from 44-56%. The harness is
byte-stable — *including* the beast states that could never be baselined.

**SHIPPED — the visual side moves too.** `Components.jsx` mounts a marker `<group ref={playerVisualAnchorRef} />`
as a RigidBody child, so `.parent` IS the RigidBody's own Object3D — reachable from mount, unlike the beast
avatar. `settlePlayerToGround` now sets BOTH the physics body (`setTranslation`) and that Object3D
(`position.set` + `updateMatrixWorld`), because paused physics never syncs one from the other. The harness
reports both sides and warns if the visual anchor is missing.

**⚠️ AND THE STABILITY IS FOR THE WRONG REASON — caught by reading the warning instead of the diff.** Both
runs logged `settlePlayerToGround never resolved a ground`: the hook returned false through all 10 retries
(5s), and both runs therefore fell back to the SAME state — the declared `PLAYER_SPAWN` y=100. That is
determinism by CONSISTENT FAILURE, not by the fix working. An hour earlier the settle DID resolve (y=53.2),
and the frames DID move. **A baseline frozen now would encode the beast-floating-in-sky shot and would break
the first time the ground probe happens to resolve.** This is the same "a 0.00% diff is not good news" trap
in a new costume, and it nearly got reported as a win.

**WHY THE PROBE FAILS is not yet established.** `resolveSpawnGround` returns `retry` when the physics
raycast is null/NaN/`<= PROBE_MIN_Y`, and the hook returns a bare `false` that cannot say WHICH branch — so
the harness log cannot distinguish "no probe available" from "probe returned garbage" from "no placed
blocks". **First change next pass: make the hook return the REASON, not `false`.** A diagnostic that cannot
name its own failure is why this took an extra pass.

▶ **THEN A GENUINE DESIGN FORK — SURFACE IT, DO NOT PICK IT:**
**(A) always settle** → the intended in-world Hearth reveal; needs a robust ground probe (and the probe
depends on streamed origin chunks, which is itself timing-dependent).
**(B) never settle in capture** → pin the player to a KNOWN position by construction; deterministic with no
probe at all, and closest to "capture-determinism is the DESIGN". But the beast then floats in sky rather
than standing in-world, which is a visibly worse review frame and touches the recorded decision that this
fixture is IN-WORLD on purpose.
Both are defensible; the choice changes what Kevin SEES in four review frames, so it is his.

**PASS 14 (2026-08-08) — DETERMINISTIC BY CONSTRUCTION NOW, NOT BY SHARED FAILURE. THE SHOT IS THE
INTENDED IN-WORLD HEARTH REVEAL.**

**Root cause of pass 13's "never resolved a ground": my own hook.** It passed `probeFails = 0` on EVERY
call, so `resolveSpawnGround` could never exhaust its retry budget and reach the documented
`SPAWN_FALLBACK_Y` branch — it returned `retry` forever. **A retry counter that never counts is not a retry
counter.** The harness then gave up, both runs kept whatever transform they happened to hold, and they
agreed by accident.

**FIXED:** the hook takes `{ force }` and passes `SPAWN_PROBE_MAX_FAILS` on the harness's last attempt, so
it takes the SAME landing the Player itself reaches after 120 failed frames. It also returns the FAILURE
BRANCH by name (`getMobGroundLevel absent` / `probe returned null (origin chunks not streamed)` /
`returned NaN` / `at or below PROBE_MIN_Y`) plus `physicsY`, `probeAvailable`, `blocks` — a diagnostic that
could not name its own branch is what cost pass 13.

**MEASURED, two runs at loads 3.8 and 33.8:** both log
`player settled at y=61.2 via fallback (physics + visual)`, the beast frames at 61.2 in both, and the
run-to-run diff is **0 of 31 frames >1%** (worst `menu` 0.51%). Same landing, same source, same frames —
**deterministic because the fallback is deliberately TAKEN**, not because two runs failed the same way.

**Opened the image:** the dragon stands at the Hearth — lodge roof, table, grass, trees, sunset sky. This
is the in-world reveal the fixture was designed for, so the earlier (A)-vs-(B) fork is effectively RESOLVED
AS (A) *without* reversing the recorded in-world decision: the fallback is the game's own documented
behaviour, not a studio card.

**⚠️ STILL OPEN, and it is now small:** the physics ground PROBE still never resolves, so the landing is
`SPAWN_FALLBACK_Y = 60` rather than true terrain (~52) — the beast sits ~8 units high, visible in the frame
as a slight hover over the Hearth. The next pass should log the last non-forced retry's `reason` (the loop
currently swallows it) to learn WHY `getMobGroundLevel` never returns a valid Y under capture. **Baselining
should wait for that**: freezing now would encode the hover.

**PASS 15 (2026-08-08) — THE BEAST STANDS ON THE HEARTH. TWO OF MY OWN CLAIMS CORRECTED.**

**Opened the image: the dragon is standing ON the Hearth pad** — feet on the stone cap, lodge behind,
grass and trees to the side, sunset sky. No hover, no burial. This is the in-world reveal the fixture was
designed for, and the best frame the project has produced for this state.

**CORRECTION 1 — "the probe cannot work under paused physics" was TOO STRONG (I wrote it this pass).**
`getMobGroundLevel` is a rapier `world.castRay`, and I inferred a paused world can never answer it. This
run resolved `via physics-probe` at y=53.2. The colliders exist whether or not the world steps; what the
probe actually needs is **streamed ORIGIN COLLIDERS**, and my earlier 12×500ms retry window simply expired
before they arrived. The mechanism is a TIMING race, not a hard incapacity. Recorded because the wrong
version was one inference away from becoming settled fact.

**CORRECTION 2 — `surfaceBlockAt` is the WRONG ground at the origin, and the image proved it.** Using the
generator's raw grade landed the player at y=50.2 and the capture came back with the dragon **buried in
terrain** — voxel walls either side, lodge roof overhead, camera underground. Its own comment says it
ignores the Hearth stamp; `stampHomeAnchor` caps the footprint at **`HEARTH_Y = 51`** and clears above, so
the real walkable surface at (0,0) is 51, not the raw grade 49. **Predicted from the 49-vs-52 gap, then
CONFIRMED by opening the image** — the formula was right about terrain and wrong about ground.

**SHIPPED:** the settle's physics-free path uses `Math.max(surfaceBlockAt(0,0).surfaceY, HEARTH_Y)` — the
higher of the generator grade and the Hearth cap, so it stays correct if the fixture ever moves off the pad
— and reports its `source` (`physics-probe` / `terrain-formula+hearth` / `fallback`). Three named ground
sources, each deterministic, in preference order.

**STATE:** physics + visual both move · beast framed at the settle every run · `assertSubjectOnScreen`
never fires · 0 of 31 frames >1% run-to-run (worst `menu` 0.51%, measured at loads 3.8 and 33.8).
▶ **NEXT: re-run twice to confirm the SOURCE is stable** (this run took `physics-probe`, earlier ones took
the fallback — different sources could mean different Y and a different backdrop). Only when two runs agree
on both source AND y should the 31 baselines be frozen.

**PASS 16 (2026-08-08) — SOURCE VARIANCE REMOVED BY CONSTRUCTION, NOT BY HOPING TWO RUNS AGREE.**

The settle had resolved through three different ground sources on identical code — `physics-probe` 53.2,
`fallback` 61.2, `terrain-formula+hearth` 50.2 -> 52.2. **Different source means different Y means a
different BACKDROP, so the frames could never be baselined.** Rather than re-run and hope two runs matched,
the variance is now gone by construction: **the settle no longer consults the physics probe at all.**

`getMobGroundLevel` is a rapier `castRay` that needs streamed ORIGIN COLLIDERS, so whether it answers is a
TIMING race. The pure path — `max(surfaceBlockAt(0,0).surfaceY, HEARTH_Y)` — is always available, needs
zero physics steps, and cannot vary with machine load. **Capture wants determinism over gameplay-accuracy.**
The probe remains the right answer for real gameplay; it is simply the wrong tool for a fixture.

*(The zero-emoji gate caught three `⇒` characters in the comment I wrote for this change. Fixed the comment,
never the gate — same shape as the `backdrop-blur` incident.)*

▶ **NEXT, and it is now short:** run the capture TWICE, confirm both log the SAME `source` and `y`, diff all
31 frames (expect ≤~0.5%), then freeze with `--baseline` and OPEN several images before committing.

**WHAT THIS UNBLOCKS.** The re-baseline was blocked on "the harness is non-deterministic". It is not. The
**27 non-beast states are re-baselineable now** (noise floor ≤0.08%). The **4 beast states must be FIXED
FIRST** — re-baselining them today would re-freeze an empty mountain, which is how the current baselines
got there.

Measured, not inferred: captured twice with **identical code**, diffed the two runs against each other.
**15 of 31 frames differ**, and the four `beast-*` frames differ by **69–72%**.

> **COMPOSITOR STATUS — intermittent, re-confirmed 2026-08-05.** It produced 63 rAF frames/1.2s earlier
> this session (the window that made all the lived verification possible) and **0 frames/1.2s later the
> same session**, dying mid-investigation and timing out `Page.captureScreenshot`. It is not "fixed" and
> it is not permanently dead. Check it (`rAF` count, ~3s) before planning any browser work, and expect
> to lose it mid-run.

Opening the two frames settles what it is: one run renders the beast in close-up, the other renders a
distant snow mountain with **no beast anywhere**. The showcase camera/spawn is a coin-flip. That also
explains the standing note that "the 4 `beast-*` baselines contain NO BEAST" — those baselines were
frozen on a losing flip, and a future re-baseline can just as easily freeze another one.

Noise floor for the rest: `menu` 2.6%, `explore-day` 1.1%, `biome-snow` 0.7%, `mobile` 0.3%, everything
else under 0.05%. So the gate's 6% threshold is comfortably above the noise for 27 states and **meaningless
for the four beast frames**, which pass or fail at random.

**How this was nearly mis-recorded, which is the transferable part.** The S3 UV fix was isolated by
capturing pre-fix and post-fix and diffing them — and that diff showed `beast-*` changing 70%. Written up
directly it would have read "the UV fix transformed the beast frames", which is false. The control run —
same code, twice — is what separated signal from harness noise. **A before/after diff means nothing until
you know the floor.** Same shape as asserting an absence without a baseline.

- ⊘ **PASS 5 (2026-08-07) — THE "ABSENT STORE FIELDS" MEASUREMENT DOES NOT REPRODUCE. The contradiction
  was mine, not the app's.** — `window.__trace` poller over the live capture sequence
  Installed an in-page recorder sampling every 200ms across the whole sequence (`enterCapture` → wait
  chunk → `start` → `setTimeOfDay` → `spawnBeastTransform`). **103 samples, denominator asserted.**
  `playerRigidBodyRef`, `playerRigidBodyRef.current`, `performVerb` and `gameCamera` are **ALL present
  continuously from t=202ms to the last sample** — including the exact stage where two earlier probes
  reported them absent. Polling was chosen specifically to catch a brief mount/unmount window; there
  isn't one, they simply never go false.
  So: the Player mounts, its effects run, the store reflects it, and the camera is applied. **Every
  measured fact is now consistent and no app-level contradiction remains.** Passes 3 and 4 were arguing
  about an artefact of my own probes; I could not reproduce the "absent" reading and am not going to
  invent a mechanism for it.
  **Store identity is settled too** (it was the leading hypothesis): the same probes read
  `isSpawnChunkLoaded` and watched `beastFormActive` flip through `window.useGameStore`, so the exposed
  store is unambiguously the one the app writes to.
- ▢ **[LOOP] SO THE ORIGINAL QUESTION IS STILL OPEN, AND IT IS NARROWER NOW.** With the compositor alive,
  fired `spawnBeastTransform` twice in the SAME page and screenshotted both: **0.00% difference,
  byte-identical.** The beast render is not racy in itself.
  **⚠️ Caveat, stated because this is exactly how pass 2 went wrong:** that probe went `start` → beast
  directly, skipping the ~10 intermediate stages `capture.mjs` runs before it (menu, explore-day, hearth,
  landmark, ocean-*, biome-snow, each calling `enterCapture` with new options plus hooks like `spawnMob`
  and `setDangerLevel`). **It is a SHORTER PATH than the real one**, so this narrows the cause without
  proving it. What it does establish: the 69-72% between-run variance is **not** in the beast hook, and
  the next suspect is accumulated state across the preceding stages, or page-load-to-page-load variation.
  **Next experiment:** run the FULL capture twice and diff `beast-*` against each other while also
  diffing the stage BEFORE it — if the preceding stage is stable and the beast one is not, the drift
  enters between them.
- ⊘ **DISPROVEN 2026-08-05 (pass 4) — "the Player never mounts during capture" is FALSE.** —
  `node -e` diff of `hearth.png` vs `landmark.png` from the SAME capture run
  **The disproof needed no browser**, which is why it was worth trying while the compositor was dead.
  Stages that request DIFFERENT pinned camera poses, compared *within one run*: hearth vs landmark
  **79.7%**, hearth vs biome-snow **73.9%**, landmark vs ocean-depth **80.3%**, explore-day vs hearth
  **78.3%**. If the pinned pose were never applied every stage would render the same default view of the
  same world and these would be ~0%. So the pose IS applied — and it is consumed in exactly one place,
  `Components.jsx:509`, inside the Player's `useFrame`. **The Player mounts and its frame loop runs.**
  **What that leaves.** The store measurement was not wrong — `playerRigidBodyRef`, `performVerb` and
  `gameCamera` really do read absent from `window.useGameStore` during capture, twice, at every stage.
  But `Components.jsx:145-147` and `:150-162` are plain unconditional `useEffect`s, so a mounted Player
  must set them. Both facts stand and cannot both mean what they appear to, so **one of them is measuring
  the wrong object** — the likeliest unexamined branch is that `window.useGameStore` (exposed at
  `index.jsx:61`) is not the instance the R3F tree writes to. RULED OUT already: `enterCaptureMode` does
  not reset the store (it only sets module-level `_captureMode`/`_opts`).
  **Next, and it needs the compositor:** evaluate INSIDE the page whether the Player is in the R3F tree,
  and compare the identity of `window.useGameStore` against the store the components import.
  *This is the fourth pass and the third wrong conclusion. Each was a correct measurement paired with an
  inference that outran it. The pattern is not carelessness about data — it is treating "the only
  explanation I can see" as "the only explanation".*
- ⊘ **SUPERSEDED — 2026-08-05 second measurement, "the Player never mounts during capture"** (disproven
  directly above; kept for the trail). —
  `node -e` diff of hearth/landmark within one run
  This supersedes the
  framing below (which was itself a correction of the framing before it — each pass got closer).
  Probed the EXACT `capture.mjs` sequence (`enterCapture` → wait spawn chunk → `start` → `setTimeOfDay` →
  `spawnBeastTransform`), sampling at every stage, twice. Stable in both runs, at every stage:
  `playerRigidBodyRef` **absent from the store** (the ref object itself, not just `.current`),
  `performVerb` **absent**, `gameCamera` **null**, `playerPosition` still `{0,0,0}`.
  Those are three independent writes owned by `Components.jsx` (the Player) — `playerRigidBodyRef` and
  `performVerb` are set in its effects, and all three are missing together. **The Player component does
  not mount, or never runs its effects, during visual capture.**
  **Consequence for the beast frames:** the beast IS the player's rendered form (`Components.jsx:215`,
  `:794`). If the player is not there, `beast-*` can never reliably show a beast — this was never a race
  inside the beast code. `spawnBeastTransform` flips `beastFormActive:true` and `form:'fire'` correctly
  (measured), and there is nothing to apply it to.
  **⚠️ THE OPEN QUESTION, AND IT IS BIGGER THAN THE BEAST FRAMES — UNVERIFIED, DO NOT ACT ON IT YET.**
  `getCaptureOpts().camera` is consumed in exactly ONE place: `Components.jsx:509`, inside the Player's
  `useFrame`. If the Player never mounts, that pinned pose is never applied — which would mean the
  "pinned camera" every visual baseline depends on is not pinning anything. **BUT** the captured frames
  plainly differ per stage (explore-day, hearth, landmark all show their intended subjects), so
  *something* is positioning the camera. Those two facts are in TENSION and I could not resolve it: the
  decisive A/B test (request two wildly different poses, screenshot both, diff) was written and then
  **blocked when the compositor died mid-run** (`Page.captureScreenshot` timed out). Resolve this first
  next iteration — it decides whether the harness's determinism problem is four frames or all of them.
- ▢ **[LOOP] the beast-showcase race — first root-cause pass 2026-08-05 (superseded above, kept for the trail).**
  `App.jsx:351-352` frames the beast camera off `store.playerRigidBodyRef?.current`, read *before*
  `enterCaptureMode` pauses physics — which looks like the obvious culprit. **It is not.** Probed the live
  capture path twice, sampling at 0/1/2/4/8s: `playerRigidBodyRef.current` is **null at every sample in
  both runs**. So the hook always takes its `{x:0, y:55, z:0}` fallback and the camera is *deterministic*.
  What varies is whether the BEAST is rendered at that spot at all — one capture shows it in close-up,
  the next shows empty landscape from the same camera. **A mount/spawn race, not a framing race.**
  Next step is to determine what positions the beast when there is no player rigid body, and why it
  sometimes is not present by capture time. `spawnCharacterCloseup` (`:318`) is the pattern to copy — it
  places its subject at FIXED constants and documents why ("capture pauses physics → the ground raycast
  is null, so place the subject at a FIXED elevated Y"). `spawnBeastTransform` is the only showcase hook
  that depends on live physics state.
  **Success criterion, so the next attempt is checkable:** two consecutive `visual:capture` runs must
  produce byte-stable `beast-*` frames (currently 69-72% different). That is measurable without judging
  the aesthetics, which matters because the harness being fixed is the same one that would judge them.
  *Deliberately NOT fixed on a guess — shipping a speculative change into a blind harness is the exact
  pattern the rest of this file exists to stop.*
- ▢ **[LOOP] add a determinism CONTROL to the visual harness** — capture twice, diff run-to-run, and fail
  on any frame above a floor. A regression gate whose own instrument drifts reports noise as signal, and
  nothing currently measures that.
- ▢ **[KEVIN] the re-baseline** stays owner-gated and should wait for both of the above.

### B. Verification truth (the structural gap)
- ▢ **V1 [LOOP] Vacuous-gate audit — ⚠️ MY OWN HEADLINE WAS OVERSTATED. Corrected below.**
  > **I was saying "114 of 124 gates are source-greps — 92% of the corpus asserts TEXT not behaviour."**
  > That framing is **wrong in its implication**: reading the source is not the same as being vacuous.
  > Correcting it here, because an overstated claim is still a false claim (and this file is the SoT).

  **Measured (2026-07-13, first-pass classification of all 124 files in `frontend/tests/gates/`):**
  | Class | Count | Meaning |
  |---|---|---|
  | **VACUOUS** | **3** (ALL DONE ✅) | asserts a code line EXISTS as a proxy for behaviour that *could* be tested behaviourally → the dangerous class. `boss-notif-timer` ✅ seam→behavioral (`8ab8938`), `melee-swing-audio` ✅ seam→behavioral (`8a1da93`), `survival-quests` ✅ (2026-07-20) — **RULE-2 correction: it was MIXED, only 1 of its 5 tests was a source-grep; the other 4 are genuine data-driven contract tests. Seam-extracted just the dawn-wiring sub-test.** |
  | **STRUCTURAL (legit)** | ~31 | a cross-file invariant that genuinely CANNOT be behavioural — e.g. the `ai.worker.js` inline-mirror sync gate (a classic worker cannot import, so comparing source IS the correct tool), zero-emoji-in-src, no-raw-hex-outside-theme, capture-determinism (no `Math.random`) |
  | **NEEDS REVIEW** | ~~~80~~ **0 — CLASSIFIED 2026-08-11** | see the replacement tally directly below |
  | **BEHAVIOURAL** | 10 | already execute the code |

  **✅ THE CLASSIFICATION IS DONE (2026-08-11).** All 116 ledger entries classified with per-test evidence
  and two adversarial review lenses each. Plan of record:
  `docs/superpowers/plans/2026-08-11-crafty-v1-gate-corpus.md`. Post-attack tally over the **115 real
  files** (the 116th was a ghost — see below): **MIXED 82 · VACUOUS 20 · STRUCTURAL-CORRECT 8 ·
  BRITTLE 5.**

  **The headline is MIXED at 82 (71%), and it reframes the work.** The FILE is almost never the right
  unit: nearly every gate in this corpus pairs a real invariant with a proxy assertion sitting beside it.
  So "convert gate X" is the wrong instruction — the instruction is per-TEST. That also corrects the
  first pass in both directions at once: `~31 STRUCTURAL-legit` over-counted whole files and badly
  under-counted structural *tests*.

  **⚠️ The classification is a HYPOTHESIS per file, not a verdict.** The corpus-level facts were verified
  by hand; the per-gate labels were not. This item's own recorded lesson applies to its successor —
  `survival-quests` was labelled vacuous and turned out to be 4 of 5 legitimate data-driven tests. Open
  the gate at the moment of conversion.

  **✅ CLOSED THE SAME DAY — the ratchet was holding against a file that does not exist.** The ledger
  froze the `.test.js` spelling of `aspect-hint-gate`; the file on disk is
  `tests/gates/aspect-hint-gate.test.jsx` and contains zero `readFileSync`, having already gone
  behavioural. (Spelling the dead path out in full here is itself blocked by `doc-currency`, which
  reddened on this paragraph's first draft — the two gates guard the same class from opposite sides.) `gate-shape` therefore printed *"115
  source-grep gates (ratchet holding)"* against a frozen `_count` of **116**. The miscount was the
  smaller half: **a stale entry is a FREE SLOT**, because `added` is computed with `frozen.includes(g)`,
  so a brand-new source-grep gate created at that exact path would have been waved through by the gate
  whose only job is to refuse it. Fixed at the mechanism, not the entry —
  `frontend/scripts/ci/_gate-ratchet.mjs` compares BOTH directions, `gate-shape` now fails on a stale
  entry with the re-freeze instruction, and the ledger is re-frozen at 115.

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
  **PROGRESS (2026-07-20) — ALL 3 DONE exactly this way:** `boss-notif-timer` → `world/bossNotifTimers.js`
  (`makeNotifClearTracker`, `8ab8938`); `melee-swing-audio` → `game/attackSounds.js` (`makeAttackSoundPlayer` —
  the whoosh composition: playSwing NOW + playAttack after 100ms; behavioral fake-timer test, mutation-proven
  by dropping `playSwing()`, `8a1da93`); `survival-quests` → `world/dawnSurvival.js` (`resolveDawn` — the
  survive_nights quest is credited EXACTLY ONCE per genuinely-survived night, gated on the grant descriptor so
  a re-fired dawn can't double-count; behavioral test, mutation-proven by keying credit on `nightCount>0`
  instead of the grant result). All source-greps that were genuinely vacuous removed. **RULE-2 lesson: the
  "vacuous" label is a HYPOTHESIS — `survival-quests` was mostly legit (4/5 data-driven); VERIFY before rewriting.**
  **NEXT:** no more pre-identified vacuous gates. Either triage the ~80 unclassified (classify then seam-fix the
  genuinely-vacuous), or start V2·V3 input-driven E2E. Do NOT mass-rewrite the structural gates — for a
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
- ☑ **V6 [LOOP]** **CI + pre-push hook — DONE 2026-07-13 (`58972b4`).** *This item carried a stale
  "VERIFIED: no `.github/workflows`, no `core.hooksPath`" for 14 days after both had landed — a
  false OPEN item in the file that claims to win every disagreement. Corrected 2026-07-27.*
  Live today: `.github/workflows/ci.yml` (lint → unit+static gates → knip → build → bundle-budget, plus a
  separate playwright e2e job) and `.githooks/pre-push` (the fast deterministic subset; visual + e2e
  deliberately excluded as load-sensitive).
  **▢ RESIDUAL — the pre-push hook validates the WORKING TREE, not the commits being pushed.** A dirty tree
  that fixes a broken commit lets that broken commit through green; this is not theoretical — it happened on
  `a72bffd` (a gate-breaking import deletion pushed clean because the fix was already uncommitted in the
  tree, then landed separately as `b443141`). CI catches it after the fact, but only after Vercel has already
  auto-deployed the push. Fix: have the hook test the pushed refs (`git stash --include-untracked` around the
  run, or a temporary worktree at the pushed sha).

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
- ▣ **E3 — FIRST SLICE SHIPPED 2026-08-05: behaviour is now per-type DATA, not a `type ===` ladder.**
  *(Registry correction: this line said all 10 types share **one** behaviour tree. Verified against live
  code — there are **three** arms (`skeleton` archery, `spider` leap, everything else beeline+bonk), so
  §D2's "3 AI brains" was the accurate line. Of the 7 hostiles, **five** were undifferentiated.)*
  `game/mobArchetypes.js` moves aggro radius / de-aggro leash / melee reach / attack cooldown / vertical
  reach into a per-type table the worker resolves inside the mob loop. **Safety property: the defaults ARE
  the former module-scope constants**, asserted literal-by-literal, so an undesigned type plays exactly as
  before and a one-line edit cannot silently re-tune every mob in the game.
  Three archetypes designed from each mob's OWN stats, veto-able (feel = FYI, not a block, per §E):
  **moss_brute** relentless (leash 1.5→4.0, reach 2.5→3.2, swing 1500→2400ms so the big damage is
  dodgeable) · **skitterling** swarmer (cooldown 700ms, reach 1.8, leash 1.15 so a swarm is escapable) ·
  **duskhound** pack hunter (aggro 20→28, cooldown 950ms). **zombie and emberhusk deliberately LEFT AT
  BASELINE** — if every mob is special, none reads as special.
  Gated by EXECUTING the worker (identical input, opposite outcome purely from the archetype) plus a
  regression guard that the undesigned mobs are untouched; mutation-proven: replacing the lookup with fixed
  constants reddens the 5 differentiation cases while the 4 baseline guards correctly stay green.
  - ▢ **STILL OPEN:** the three arms themselves are unchanged — a moss_brute still *pathfinds* like a
    zombie. Distinct MOVEMENT (a brute that shoulders through, a hound that flanks) is the next slice.
- ▢ **E4 [LOOP]** **Cinematic beats** — boss-entrance mood SNAP, dawn/dusk payoff spike.
- Balance/feel constants ship with sensible defaults + a dial, and surface to KEVIN-REVIEW as **FYI, not a block**.

### E-bis. ⛔ THE HARD COHERENCE VIOLATION (highest-priority build item found in the specs audit)

- ▣✓ **X1 SHIPPED `23f6cfa` — the Aspect ring.** `src/input/aspectWheel.js` (pure, KEY_MAP-derived) +
  a toggle/ring in TouchControls mirroring the M3a tray; taps write the SAME `setIntent` booleans the
  keyboard writes, so no downstream change. Only UNLOCKED verbs get a sector. Gate is BEHAVIOURAL
  (`tests/gates/aspect-ring-gates.test.jsx`, 6 render tests, mutation-proven) + 11 pure-geometry tests.
  **NOT lived-verified — the compositor fault blocked touch-probe; layout/thumb-reach routed to Kevin.**
  *(Original finding kept below for the record.)*
- ~~▢ **X1 [LOOP] The four Aspects are UNREACHABLE ON TOUCH.**~~ Verified: `grep "roar|grab|snare|imbue"` across
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
- ▣✓ **X3 CONFIRMED then FIXED 2026-08-05 — and it was TWO bugs stacked, not one.** The compositor came
  back after nine dead iterations; `touch-probe.mjs` answered immediately and unambiguously:
  `tapped "dirt" (was "grass") -> selected "grass"` — the tap WAS being swallowed. Now:
  `tapped "dirt" (was "grass") -> selected "dirt"`, all 7 checks PASS, exit 0.
  - **Layer 1 — the overlay swallowed the tap.** `ui/TouchControls.jsx`'s root is `fixed; inset:0; z-40`
    and was hit-testable, so it was the TOPMOST element over the entire viewport; `data-touch-btn` buttons
    only ever worked because they are its CHILDREN. Fix is exactly what the old hypothesis below predicted:
    `pointerEvents:'none'` on the root, `'auto'` on the hit-targets, ownership routing via the new pure
    `src/input/touchOwnership.js`, and the touch listeners moved to `window` (a `pointer-events:none` root
    stops being an ancestor of the target, so listeners bound to it would never fire and move/look would die).
  - **Layer 2 — the handler then THREW, on DESKTOP too.** With the tap finally landing, the probe reported
    `PAGEERROR: gameState.setSelectedBlock is not a function`. The HUD slice in `App.jsx` carried
    `selectedBlock` but not its setter, so **every mouse click on a hotbar slot had been throwing** — hidden
    because the keyboard/scroll path calls the store directly, so selection LOOKED fine. Slice extracted to
    `src/store/hudState.js` so the producer/consumer contract is testable at all; gated behaviourally.
  - **A regression I caused and the probe caught:** moving the listeners to `window` made `onEnd`'s
    UNCONDITIONAL `preventDefault()` fire for menu taps, killing touch cold-start outright
    (`STUCK on title`). It is now gated on `getInput().active` AND on the touch not being UI-owned.
    Cleanup still runs unconditionally, or a touch ending after the gate closes leaves the player walking.
  - **Process note worth keeping:** the hypothesis recorded below was RIGHT, including the exact remedy, and
    my first attempt ignored it and merely widened a selector — which changed nothing, because the
    ownership test was being handed the overlay rather than the hotbar. A live DOM probe
    (`elementsFromPoint` at the slot centre) settled in one run what two readings had not. **Verify against
    the running thing, not against the source.**
- ▢ **X1-bis [LOOP/KEVIN] THE ASPECT RING HAS THUMB-LEVEL DEFECTS — found 2026-08-05 by DRIVING it.**
  `touch-probe.mjs` now exercises X1/X2a/X2b (it never did — the loop called it "the only lived check they
  have" for nine iterations while it checked only joystick/camera/action/hotbar; that claim was false).
  - **▢ `touch-aspect-grab` is OFF-SCREEN**: laid out at `x=390` on a 390px viewport, so the entire 52x52
    target sits past the right edge and VOIDHAND cannot be tapped at all on an iPhone-class screen. The ring
    is centred on a toggle at the right thumb edge with radius 78. **KEVIN — layout/ergonomics call.**
  - **▢ the ring does NOT close after a selection in a real browser** (4 sectors still open after a
    dispatched tap) so it eats the next tap. **`aspect-ring-gates.test.jsx` asserts this and PASSES in
    jsdom** — the house defect again: green over behaviour that does not happen. NOT root-caused; stopped
    rather than guess.
  - **▣ ROOT CAUSE FOUND 2026-08-05 — ONE geometry defect produces all of it, and it is NOT "the ring
    fails to close".** Both radial menus use `ringLayout(n, 78)` and their anchors are **exactly 78px
    apart** (`TouchControls.jsx:219` aspect toggle at `bottom: calc(11% + 104)`, `:243` spell toggle at
    `calc(11% + 182)`; sectors render at `right: 26 - x`, `bottom: anchor - y`). `ringLayout` puts index 0
    at `{x:0, y:-78}` and index 1 at `{x:78, y:0}`. Therefore, by arithmetic:
    - aspect sector 0 lands at `right 26, bottom 182` = **exactly the spell toggle's box** (both 52x52 at
      the same anchor). The spell toggle renders LATER in the DOM, so with equal z it takes the tap.
    - spell option 2 lands at `bottom 104` = **exactly the aspect toggle's box** — the same collision,
      mirrored.
    - aspect sector 1 and spell option 1 land at `right 26 - 78 = -52`, i.e. **entirely off the right
      edge** (that is the `touch-aspect-grab@390,595` report, and it is not specific to grab).
    **So the probe's "ring does not close" is a MISREADING — of my own instrument.** It taps the first
    `touch-aspect-*` in DOM order (roar, index 0), whose centre is the spell toggle; the tap opens the
    SPELL PICKER, the ring is never told anything, and it stays open. Then X2b's step taps `touch-spells`
    again, which now CLOSES the picker it just opened — hence "0 spell options". `tapTestId` returns
    `dispatched=true` because it only checks the element has non-zero size, never that the point it taps
    is occupied by the element it named. **Two registry lines were wrong in the same way: an unverified
    reading of a probe that reported success over something it never actually hit.**
  - **▢ [KEVIN — ergonomics] the fix is a LAYOUT decision, not a bug fix.** A ring of radius 78 hung off a
    26px-from-the-right-edge anchor cannot fit on a 390px screen, and two such rings stacked 78 apart
    necessarily collide. Recommendation: fan both menus into a LEFT-FACING ARC (nothing right of its
    anchor, so nothing can leave the screen), and make opening one CLOSE the other — two overlapping
    radial menus under one thumb is a bad trade even when they fit. Needs a taste call before building;
    the invariant to gate it with is pure and cheap: *no two simultaneously-visible touch targets overlap,
    and every one is fully inside a 390x844 viewport.*
  - **▢ `touch-spells` cannot be tapped while the ring is open.** *Claim CORRECTED 2026-08-05 on a re-run
    (the compositor came back): it does NOT leave the DOM.* It is present and fully on-screen —
    `52x52 @312,517` in a `390x844` viewport — and the tap is refused because the four still-open ring
    sectors sit over it. That is bullet 2's *"it will eat the next tap"* happening, measured. **So X2b has
    no independent defect of its own yet: fix ring-close first and re-run before treating it as one.**
  - **▣✓ FIXED in passing:** both `TouchControls` and `TouchControlsSurface` read `unlockedTalents` via a
    non-reactive `getState()` during render, so unlocking an Aspect did not surface its sector until an
    unrelated re-render (closing a panel) happened to fire. 0 sectors before the fix, 4 after.
- ▣✓ **X2a SHIPPED `f04d79b` — cooldown feedback on touch.** The sweep went ON the ring sectors rather
  than porting `<AbilityBar>` to a new region: a touch placement would have to dodge the joystick, the
  action cluster, the tray AND the ring — four constraints, decided blind. Closed toggle carries an
  aggregate dot (the ring is shut most of the time). `cooldownFraction()` is pure + 6-case tested; wiring
  is behaviourally gated + mutation-proven. **Look not yet verified — compositor fault; queued for Kevin.**
- ▣✓ **X2b SHIPPED `667ea0d` — every spell reachable on touch.** `src/input/spellPicker.js` (pure,
  DERIVED from `SPELL_TYPES`) + a second ring one row above the Aspect ring, writing the EXISTING
  `setActiveSpell` seam. UNGATED, matching Digit1-4 (gating touch would make it stricter than keyboard).
  Buttons tinted from each spell's own roster colour. Behavioural gate (6 render tests, mutation-proven
  both ways) + 6 pure tests incl. both-locale label resolution. **NOT lived-verified — compositor fault.**
  *(Original finding kept below.)*
- ~~▢ **X2b [LOOP] TOUCH IS LOCKED TO ONE SPELL — verified 2026-08-03, and it is worse than "no picker".**
  `setActiveSpell` is called from **exactly one place**: `InputManager.jsx:131-134` on Digit1-4. There is no
  touch path, so a touch player casts `fireball` (the store default, `useGameStore.jsx:561`) **forever** —
  three of the four spells are unreachable on the stated iPad target, the same shape of defect as X1.
  Build: the X1 ring is the template (`src/input/aspectWheel.js` + `tests/gates/aspect-ring-gates.test.jsx`
  are the worked example) — a second ring or a spell row writing `setActiveSpell`, gated behaviourally.

### E-ter. Other spec'd-but-unbuilt (from the full specs audit)

- ▣✓ **Incoming-hit hitstop — SHIPPED 2026-08-05.** Both clauses were verified on live HEAD before the fix:
  `damagePlayer` set `damageFlash`/`screenShake`/`lastHitDir` and no `hitstopUntil`, and `KICK_PROFILES` had
  melee/cast/slam/land and no `hurt`. So the player's own swings had weight and the enemies' did not — a
  moss brute's 25 landed exactly like a skitterling's 5, which mattered more once B4 let mobs actually reach
  you and E3 made them behave differently. Pure `game/hurtFeel.js`: `hurtStopMs` grades the freeze on a
  FRACTION of max health (so the same blow reads devastating at L1 and survivable at L20) reusing the same
  light/heavy/crit vocabulary as outgoing hits, and returns **0 for a fully-mitigated hit** so armour never
  makes the screen stutter more as it absorbs more. `isNewHit` is the edge detector the per-frame camera
  controller polls — a reactive subscription there is the GLI trap, and without the edge one hit would kick
  every frame. `lastHitDir` is now stamped on EVERY accepted hit (it previously only updated when an
  attacker position was supplied), because that stamp doubles as the kick signal.
  Gated through the real `damagePlayer` (i-frames, damage-cooldown and death must NOT freeze) and
  mutation-proven. **The FEEL is Kevin's** — surfaced as FYI.
  - ▢ **Next slice:** a DIRECTIONAL flinch. `hurt` is currently undirected (`right = 0`) though the store
    already computes `lastHitDir.angle` and `trauma.js` already biases shake by direction. Deliberately not
    done blind: it is a feel change that wants a human eye on a real hit.
- ▣ **Boss entrance beat — SHIPPED 2026-08-05 (= E4).** The arrival was a text notification and nothing
  else, while the KILL fires eight isolated effects. Now freeze (220ms) + bloom swell (650ms) + shake (1.4)
  via pure `game/bossEntrance.js`, run through the isolation helper so a cosmetic throw cannot suppress the
  message. **Capture-SUPPRESSED** — the visual gate has boss states and a spawn-time bloom/shake would make
  those frames non-deterministic (same guard the A5 bridge uses). Tuned AGAINST the kill deliberately: the
  entrance freezes slightly longer and swells longer (dread), the kill snaps shorter but carries the payoff.
  Gated by driving the REAL hook to the REAL spawn condition; mutation-proven both ways (beat removed → 3
  RED; capture guard removed → 1 RED).
  *(Registry correction: this line listed **"no mood snap"** among the gaps. `bossSystem.js:156` has driven
  `setDangerLevel(bossActive ? 2 : 0)` since the A5 bridge landed — the mood snap always worked. There is
  now a regression test pinning it so the correction stays true.)*
  - ▢ **STILL OPEN: no ROAR.** The sound API exposes only `defeat`/`fanfare`/`victory`; nothing reads as a
    dragon, and inventing an audio asset is outside a loop slice. The beat ships SILENT rather than firing
    `playVictory` at an entrance because it was the closest thing to hand. Needs an asset decision.
- ▣✓ **The generic isolation helper moved to `game/isolatedEffects.js`** (`runIsolatedEffects`). It was
  always generic; calling `runBossKillEffects` from a SPAWN path would have been a name-lie. `bossKill.js`
  re-exports the old name, so existing callers and their gates are untouched.
- ▢ Voidhand **multi-phantom pool** (cap-4) · Soulbind **v2 faction protocol** (mob-vs-mob) · Elemancer **v2
  terrain chemistry** (⚠️ *parked behind the P4 no-mid-combat-re-mesh HARD VETO* — do not unpark without a
  measured trimesh re-cook budget).
- ▢ World **M4b biome palette / M4c topography / M5b seabed / M7 landmarks** (the "deferred refinements").
- ▢ Item **sets / set-bonuses** (affixes exist; sets never built) · `aspect-underbanked` denied-reason ·
  ~~title-screen hint should read from `keyMap`~~ **(2026-08-05: investigated, and the real defect was the
  OPPOSITE direction — see §G below. The title hints are deliberately abbreviated copy; rewriting them to
  render from KEY_MAP would change visible title-screen text, which the `menu` baseline covers and the
  compositor cannot currently verify. The discoverability bug it was pointing at is fixed.)** · **WebGPU/TSL migration** (specced, never done — huge blast radius).
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
- ▣✓ `2e2da50` **[LOOP] NAME THE ENFORCER for dead-copy classification — DONE 2026-08-08.** `src/i18n/keyReachability.js` is the pure classifier (literal / dynamic / table / fixture / dead) with all five near-misses as regression fixtures; `node frontend/scripts/ci/i18n-dead-keys.mjs` emits the dead set as a command; `tests/i18n/key-resolution.test.js` now gates on it instead of a bare `<= 10 unreachable` count. Measured at HEAD: 131 keys — 121 literal, 4 dynamic, 5 table, 1 fixture (`ui.level`, exactly as documented), **0 dead**. Original text below.
- ▢ **[SUPERSEDED by the line above] NAME THE ENFORCER for dead-copy classification — the analysis that authorized a delete was
  ungated.** Every gate here is RED-first + mutation-proven; the bash pipeline that decided which 22 lines of
  i18n copy to delete had no test, no mutation proof, no denominator guard. It was wrong FOUR times (regex
  dot matched `rarity-common`; `-F` prefix matched `ui.level_short`; `C.rarity.common` was a colour-token
  property path; and `ui.level` is the FIXTURE proving interpolation). **Build it:** extend
  `tests/i18n/key-resolution.test.js` into a pure classifier that reports reachability by KIND — literal
  `t()` / bare key in a data table / dynamic prefix / TEST-FIXTURE-only / dead — with those four near-misses
  as regression fixtures, and emit the dead set from a command so a future deletion consumes THAT, not a
  human's grep. Small, and it closes the class rather than the instance.
- ▣✓ **i18n DEAD COPY DELETED 2026-08-05 — ELEVEN keys, not the twelve first measured.** Of 21 keys
  unreachable by literal `t()` analysis: 7 are reached as BARE keys in data tables, 2 via the one dynamic
  call site, and 11 were genuinely dead — `ui.health`, `ui.mana`, `ui.hunger`, the four `rarity.*`, the four
  `showcase.*`. Removed from BOTH locales (22 lines two translators maintained for nothing); the
  `key-resolution` cap dropped 22 → 10 and locale parity holds at 128/128.
  **`ui.level` was in the original list of 12 and is KEPT** — the corrected whole-token check found it in
  `tests/i18n/i18n.test.js:29` (`t('ui.level', { n: 7 })`, the fixture that proves interpolation works) and
  cited by name in `scripts/ci/i18n-adoption.mjs`. **Unreferenced-by-`src/` is NOT the same as dead**: a key
  can be the fixture that proves the machinery works. That was the FOURTH time the verification method
  changed the answer on this one audit — after an unescaped `.` matched `rarity-common`, a `-F` prefix match
  hit `ui.level_short`, and a colour-token property path `C.rarity.common` masqueraded as a key.
- ▣✓ **KEY_MAP's anti-drift gate only ever ran ONE WAY, and two real bindings had fallen through
  (2026-08-05).** The file exists so "the HUD can never again advertise a key with no handler" (the
  `M - Magic` lie) and its gate asserts exactly that. Nothing asserted the converse. **`L` (quest log,
  M-NARRATIVE.3) and `Q` (claim completed quests) were handled live in `InputManager.jsx` and advertised
  NOWHERE** — so the controls panel never taught either. Q at least appeared on the title screen; **L was
  invisible entirely**, sitting beside the E/M/C/B/U toggles that ARE listed. An advertised key with no
  handler is a lie; a handler with no advertisement is a feature the player never finds. Both rows added;
  the gate now runs BOTH directions, with the `1–4` compound row exempted explicitly and a second test
  asserting the exemption list can only name codes a real row actually covers (or it becomes a place to
  hide orphans). Mutation-proven per row. Visually safe: `showControls` defaults false, so no baseline
  captures the controls panel.
- ▣✓ **CLI-on-import sweep — DONE 2026-08-03, and it found nothing left to fix.** The defect (a module
  running its CLI at import, so a test importing it dies mid-collection and vitest reports "no tests" while
  every assertion silently skips) bit twice: `scripts/ci/i18n-adoption.mjs` and `scripts/visual/capture.mjs`.
  Swept every file under `scripts/` that has an `export`: **6 total.** Five carry an argv guard
  (`measure`, `queue-ledger`, `i18n-adoption`, `mutation-proof-trailer`, `capture`). The sixth,
  `scripts/visual/_serve.mjs`, has **no guard and needs none** — it is a pure helper with zero top-level
  executable statements, so importing it does nothing. Do not add a guard there; it would be cargo-cult.
- ▣✓ `6817df3` **The enforcer now exists: `scripts/ci/cli-guard.mjs`, ninth pre-push gate.** Flags a file
  under `scripts/` only when all three hold — it has an `export`, it has top-level EXECUTABLE statements (a
  bare expression, a branch, a loop, or a `const` initialised by a call; declarations are inert), and it has
  no guard. Deliberately narrow: anything looser flags harmless module setup, and noise is how a check gets
  switched off. Runs BEFORE `test:unit`, because the unit run is exactly what this defect corrupts — that
  ordering converts "1 failed | no tests" into a named cause. It re-derives the sweep above independently:
  **34 scripts scanned, 6 pre-existing exporters, zero offenders**, with `_serve.mjs` correctly silent.
  **Mutation-proofing found a false negative that reading the code did not:** `hasGuard` began as a
  source-wide regex for `import.meta.url`, but `dirname(fileURLToPath(import.meta.url))` is the ordinary
  self-directory idiom — `i18n-adoption.mjs` carries it on line 52 quite apart from its real guard on line
  133 — so a script with an export, top-level work and only that path line scored as GUARDED. A guard must
  now COMPARE, tested line-scoped. *A false negative in the exact shape a checker exists to catch is worse
  than no checker, because it also silences the reviewer.*
- ▣✓ `6817df3` **`.agent/AGENTS.md` said "Six gates authorize a push" above a table already showing eight**
  — a headline contradicting its own table, inside the paragraph written to fix an undercount. Now NINE,
  and it carries the command to recount from the hook instead of from memory.
- ▢ **G1 [LOOP]** Doc-truth: `LOOP-CHARTER.md:225` still advertises `@react-three/test-renderer` as
  *"approved + landed (0f8cad9)"* — commit `8b6e3a44` **REMOVED** it (verified: not in package.json, imported
  nowhere). **That one stale line regenerated a week-sized proposal.** Also: the CHANGELOG "no per-frame allocs
  remain" overclaim; dead `quality.js TIERS.outlineWorldEdge` (zero readers); `SOTA-INITIATIVE.md` §3 stale.
- ▣ **G2 — doc-currency now also checks cross-doc SECTION citations (2026-08-05).** It only ever verified
  PATHS; docs point at each other by section too (`charter §6.4`, `STATUS §2`) and those rot identically —
  §G1 below records that ONE stale charter line "regenerated a week-sized proposal". Pure
  `scripts/ci/doc-anchors.mjs` parses heading ids and resolves citations; a ZERO-TARGET (frozen 0)
  after the correction below. Mutation-proven: a genuinely dangling citation fails the push and is named.
  - ▣✓ **RETRACTION — the five it first "found" were FALSE POSITIVES, and the checker was wrong, not the
    docs.** The first version modelled only ATX headings. These docs anchor three ways: headings
    (`## 6.4`), ITEM ids inside a section (`- ▢ **V1 [LOOP] …` living under `### B. Verification truth`),
    and COMPOUND refs (`charter` section 2 item 5, which really is the interleave rule cited). Once
    `doc-anchors.mjs` learned all three the live count went to **zero**, so the freeze is **0** — any
    dangling citation now fails the push outright.
    **I wrote those five into this file as "genuinely stale" before checking a single one by hand.** A lint
    that manufactures dead work for the next reader is worse than the rot it hunts, and freezing at 5 would
    have permanently licensed five phantom findings and taught the next reader to distrust the lint. The
    guard for this exact failure was already in `unresolved` for unloaded aliases; it arrived through a
    door I had not modelled.
  - *(`kernel` is deliberately NOT an alias: LOOP-KERNEL-PROMPT.md has no numbered headings, so resolving
    against it would flag every `kernel §N` on the strength of the checker's own parse failure.)*
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

**⚠️ 2026-08-05 — THE COMPOSITOR IS INTERMITTENT.** It came back on its own after nine dead iterations (no
reboot, uptime 8d 23h), stayed up for roughly ONE HOUR (~03:11-04:00), and was dead again by ~04:20 with
the identical signature — rAF 0 firings/1.2s on a bare `data:` URL, `Page.captureScreenshot` timing out —
at load 7.7, so not load. **It cycles.** Corrects the earlier reading that it had simply "cleared".
**Operational rule: when the window is open, do BROWSER work first** — everything this session found came
out of that one hour. What it bought:
- **X3 confirmed AND fixed** (`5b64f69`) — two bugs stacked, the second of which was breaking the hotbar
  click on DESKTOP as well. See §E-bis X3.
- **X1 / X2a / X2b have now been SEEN.** They render and are reachable. Two touch-HUD layout defects are
  visible at 390x844 and are routed to Kevin: the health/mana bars OVERLAP the hotbar's left slots, and the
  top-right controls collide with one clipping off the right edge. The rings are still only seen CLOSED.
- **The visual gate ran: 26 of 32 pass.** `mobile` 6.11% is expected (baseline predates the ring toggles);
  `explore-day-low` 6.55% is the known intended diff; and **the four `beast-*` baselines are BROKEN — they
  contain no beast at all.** The fixture exists to show the four silhouettes; the baselines are empty
  landscapes blessed 2026-06-22 without anyone looking, so the gate has compared against a broken reference
  for six weeks. The current captures are correct. **Not re-baselined — Kevin's call**, but the evidence
  says those four must be replaced. *A baseline nobody looked at is the same defect as a gate that reports
  PASS over input it never examined.*

**Harness ratchets are now closed as a class.** `mutation-proof-trailer` (a new gate must state its proof),
`queue-ledger` (a finding must carry its own marker), `gate-shape` (no assertion satisfiable by a comment),
the i18n ratchet, `measure.mjs` (one authority for repo counts) and now `cli-guard` (§G) each convert a
one-off sweep into something that cannot silently regress. Nine gates authorize a push.

**Next code work, in order:** ~~A-bis~~ **(CLOSED 2026-08-05 — all 8 seams)** · D Art (Kevin DE-GATED) ·
E gameplay levers · E-ter · F perf. **Verify each is still open before working it** —
much of the older A-bis/V1 work is DRAINED, and X3 (hotbar tap possibly swallowed) answers itself from
`touch-probe.mjs` on the first clean compositor run rather than from a code reading.

**Current campaign: v9 — "HOLISTIC SOTA" (2026-07-20 → ).** A 3-workflow adversarial self-review produced
**215 verified findings** (`docs/superpowers/HOLISTIC-REVIEW-2026-07-21.md` — the queue of record), worked
category-by-category. **~154/215 closed** as of 2026-07-27: probe-hygiene (25), comment-lie (34), doc-drift
(21), coverage-gaps (8), inconsistency (11), enhancement (7), dead-code (38, which eslint revealed to be 80
actual items) — plus a 7-fix Phase-2b correctness batch. Test-vacuity (32) is TRIAGED, not fixed: mostly
false-positives, 3 genuinely-weak gates strengthened, ~24 deferred as low-ROI.

**Open in this campaign:** the docs REORG (Wave-1 ~83 shipped-plan archives → `docs/archive/2026-Q2/plans/`;
Wave-2 the 4 lint-CRITICAL docs, archive-not-delete) — **not started; `docs/archive/` does not exist yet and
`docs/superpowers/plans/` still holds 100 files.** Then the deferred test-vacuity tail.

**✅ 2026-08-02 — the awaiting-decision backlog is CLEARED.** All nine items decided under Kevin's explicit
delegation and recorded in `docs/superpowers/DECISIONS.md` (the decision record this process never had).
Net effect on this registry: **V6's residual is closed** (pre-push now certifies the pushed refs via a
detached worktree, and the docs-only skip path is gone); the **dependency debt is closed** (0 vulnerabilities,
0 open dependabot alerts); **CI can conclude** and both known-red tests are resolved without weakening a
threshold; the **visual gate went from 24 of 31 states asserting to 31 of 31**, which immediately exposed
that it had never been deterministic (weather cycles mid-capture — fixed). Two new mechanical gates now
block a push: `gate-shape.mjs` (no assertion may be satisfied by a comment — the mechanical kill for the
85%-source-grep vacuity class) and the i18n adoption ratchet (109 hardcoded strings frozen, may only shrink).

**⚠️ Two process facts, recorded honestly:** (1) the loop went **dormant 2026-07-21 → 07-27** (6 days, no
commits). (2) For the whole campaign it did **not** honour its own "update STATUS each batch" rule — this
file went untouched for **65 commits** (last edit `03036c6`, 2026-07-20) while ACTIVE_PLAN and CHANGELOG were
kept current. That is exactly the drift this file's own preamble says must never happen; repaired 2026-07-27.

**The v8 campaign below is SUPERSEDED as the driver but its registry (§2) is still the open-work truth.**
*v8 — "Playable Truth + Depth":*

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
4. **Verify-before-assert.** Agent/workflow claims are T3 — a subagent once fabricated a "RED test suite"
   crisis (the suite was green: 1936/1936 *as of 2026-07-14; the total moves, read it from
   `npm run test:unit`*). Grep the cited file:line before acting on any claim, including your own.
5. **A stale doc is a live trap** — it regenerates dead work verbatim (see G1).
6. **ANTI-REDO — do NOT "fix" the tone mapping or re-add a mood grade** (verified 2026-06-15, relocated here
   from LOOP-CHARTER §6 on 2026-08-03). ToneMapping is **already NEUTRAL, not ACES**, and the per-mood
   `MOOD_GRADE` script **already ships** in `src/render/mood.js`. The world reading "dim/flat" was a
   three-bug postproc chain, not the grade — re-tuning either is a day spent undoing someone's fix. Related:
   capture mode used to DISABLE cast shadows and landmark emissive crowns, so every visual baseline reviewed
   before S3 was the flattest, beacon-less version of the world rather than real play.
