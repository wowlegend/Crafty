# Deep audit of the invisible-box class and buried debt, 2026-10-30

Kevin asked, after the invisible box (PR #59), for the same class of defect and any long-buried debt to be found across
the whole game. This is the record: the synthesis report of the audit (Workflow runs wf_b80f1171-bb1 and wf_f5258062-87b
at main 62159bc1: nine class hunters, 27 ultrareview findings from three of six whole-game chunks, a registry dedupe, one
repro verifier per serious or player-visible finding, then synthesis), followed by its completeness critic. Its rows are
in memory/registry.jsonl under AUDIT:*; the cursor task is ACTIVE_PLAN:T23. Paths into the session's scratch directory
are written as <session scratchpad>; that directory is not kept.

I could not write `report.md`: the harness refused it ("Subagents should return findings as text, not write report files"), and I did not route around that guard. The full report follows this summary. `rows.jsonl` is written, with 68 valid JSON rows and no id collisions against main's 609-row registry: `<session scratchpad>/audit/rows.jsonl`

**Counts.**
- **Verified, 47:** 40 CONFIRMED (6 HIGH, 22 MED, 12 LOW), 5 PLAUSIBLE (3 MED, 2 LOW), 2 REFUTED.
- **Not verified, 9:** all LOW.
- **Already known, 8:** 6 of them have no registry row. `REVIEW:fix-invisible-box:respawn-counts-mined` should be raised to HIGH: the verifier trapped the player in the ground with it.
- **New leads from verifiers, 2:**
  - The touch Settings gear is probably unreachable by a finger (PLAUSIBLE; HIGH if confirmed). That would leave touch players no route to Manage Worlds > Load.
  - Every mob-kill loot roll uses zone tier 0, so far-from-spawn kills never roll rarer drops (MED).
- **Rows:** 45 findings, 9 not-verified, 2 leads and 12 lanes.

CONFIRMED means an independent verifier reproduced the defect at 62159bc1 with real modules in jsdom or node, against a control. Nothing was run in a browser or on a device.

Main is now b48ec9f1. Its source change since the audit is only the W2-L LazyMotion swap, which touches none of these mechanisms. I read that diff but did not re-run the probes.

**The six HIGH findings:**
- every death on iOS crashes the game;
- a returning player's world is never resumed;
- World Manager Load drops the player out of the world;
- the context-loss resume wipes quests and the dragon fight;
- the boss hook ignores every load;
- the squad is never saved.

They compound: on iOS, every death crashes and the reload lands on a fresh level-1 world.

**Top five fix lanes:**
1. **L1, quick wins (small).** One guarded pointer-release helper fixes the iOS crash; App.jsx:322 fixes the touch Show Stats bug; one line restores the juice-dial setting; then a touch test decides the gear. A verifier mutant already shows each fix working.
2. **L2, every world switch is a boot (large).** Each switch saves, writes a resume note and reloads; boot loads the world before the first render and holds the player until the ground loads; the title gets Continue. This closes four HIGH findings and seven others, and supersedes the B2a "nothing resumes at boot" decision in DECISIONS.
3. **L3, the store owns per-world state (medium).** The boss fight reads from the store, quests re-seed on an empty save, the squad roster and shrine progress are saved, and every store key is declared. First decide how to repair dragon state already corrupted on players' disks; that choice cannot be undone.
4. **L4, the void line and spawn recovery (small to medium).** Hand it to the chaos-play lane and amend the respawn-counts-mined row.
5. **L5, one predicate for "input is live" (medium).** Covers the victory screen, the touch chest pause, the panel relock, typed world names, the scroll wheel and the modal backdrop.

**Not run:** ultrareview chunks 4-6 (ui, render, audio and scene).

---

# Crafty whole-game audit at 62159bc1

For the command session (ACTIVE_PLAN:T23) and Kevin. Line numbers are at 62159bc1.

**Freshness, measured 2026-10-30.** Main is b48ec9f1. Its `frontend/src` change since 62159bc1 is the W2-L LazyMotion swap: 14 files go from `motion` to `m`, and one provider wrap shifts App.jsx lines by about 3. No mechanism below is in that change; I read the diff and did not re-probe. Main's registry has 21 rows the audit tree lacks (W2-L, W3-B, e2e flakes, chaos-play, invisible-box records). None duplicates a finding here. REVIEW:w3b:reload-replays-entrance interacts with lane L2.

**What CONFIRMED measures.** An independent verifier reproduced the defect at 62159bc1 against the real modules (store, hooks, worker, mesher, Rapier, components) in jsdom or node, with a control that flipped; most runs also had a mutant. No finding was run in a browser, on a device or on a GPU. Each lane's lived proof is therefore its CI e2e.

## Counts

| Bucket | n | Breakdown |
|---|---|---|
| Verified input | 47 | 40 CONFIRMED (6 HIGH, 22 MED, 12 LOW), 5 PLAUSIBLE (3 MED, 2 LOW), 2 REFUTED |
| Not verified (hunter evidence only) | 9 | all LOW |
| Known | 8 | 1 still live and worse (panel-stack, carried as a finding); 6 have no registry row; 1 row to amend to HIGH (respawn-counts-mined) |
| New leads from verifiers | 2 | touch Settings gear (PLAUSIBLE, HIGH if confirmed); kill-loot tier always 0 (MED) |
| Fix lanes | 12 | |
| Rows in rows.jsonl | 68 | 45 findings + 9 not-verified + 2 leads + 12 lanes |

Severity changes made by verifiers:
- **Raised:** two-tabs (LOW to MED), world-manager-keys (LOW to MED), ultra-player-world-7 (LOW to MED).
- **Lowered:** touch-panel-world-runs, ipad-tray and delete-tool (HIGH to MED); block-debris, ultra-game-logic-3, isolation and runtime-reach (MED to LOW).

## 1. CONFIRMED findings, ranked by player harm (row ids are `AUDIT:<cls>:<key>`)

| # | Row | Sev | What the player experiences | Code path |
|---|---|---|---|---|
| 1 | input:ios-death-crash | HIGH | On iPhone and iPad (every iOS browser), every death shows the "Something went wrong / Reload" crash page instead of YOU DIED. Up to 5 s of pending autosave is lost. After the reload nothing resumes (#2). Android Chromium before 144 is probably affected too. | InputManager.jsx:175-177 calls exitPointerLock with no guard (the same call at :123 and :142 is not fatal); index.jsx:94-98 |
| 2 | persistence:returning-player-never-resumed | HIGH | On every return visit, Start begins a fresh level-1 world. The real world is reachable only through Esc > Settings > Manage Worlds > Load, among identical Save_<date> cards that show no level. Each visit mints another slot. At the storage quota every save stops silently, including the real world's. | MenuSystem.jsx:337-339, :81-88; useGameStore.jsx:1253-1269 (:1268 drops writeWorld's false); worldSaves.js:12, :46-56 |
| 3 | desync:load-drops-player-out-of-world | HIGH | World Manager Load of a far save: at low tier the player falls 21-25 m into a cave; at med/high they fall into the void at about 1.6 s and land at the origin. The autosave then writes the fallen position over the save. | useGameStore.jsx:1133, :1210-1214; Terrain.jsx:545-559, :636-651; Components.jsx:1034-1053 (only ContextLossPanel arms the hold); App.jsx:193-202 |
| 4 | debt:resume-clobbers-quests-and-boss | HIGH | The context-loss recovery reloads the right world but resets the quest log, the counters, the kill achievements and any dragon fight (a slain dragon is written back as alive). The wipe is saved about 5 s later with no notice. | ContextLossPanel.jsx:24-35 (the child loads first), then QuestSystem.jsx:212-219 and bossSystem.js:291-293 mirror effects overwrite it |
| 5 | softlocks:boss-hook-ignores-world-load | HIGH | After the dragon wakes, New World or Load leaves a 600-700 HP dragon that no hit can touch chasing a level-1 character. A mid-fight save loads at full HP and is saved that way (the B2g fix is dead in production). A won world's return fight never arms. | bossSystem.js:42-55, :291-293; Components.jsx:326, :545, :563; EnhancedMagicSystem.jsx:445; boss-persistence-hook-gates.test.jsx:37-42 loads before mount |
| 6 | verbs:squad-not-saved-and-leaks-across-worlds | HIGH | The bound squad (35 ember per bind, 120 for a hybrid) is never saved: it is lost at every reload and resume. Yet New World or Load carries it, plus aggroed mobs, into the next world. | saveSchema.js:227-294 (no roster; the spec s2b3:63-65 says the roster persists); useGameStore.jsx:1046-1239; SquadAISystem.jsx:42-55 |
| 7 | softlocks:touch-show-stats-kills-action | MED | On touch, Show Stats silently disables the action button (attack, mine, heavy) and the roar until the toggle is found again or the page reloads. Reaching it depends on the gear (lead G1). | App.jsx:322; TouchControls.jsx:97, :280, :361 |
| 8 | input:touch-panel-world-runs | MED | On touch, a chest opened from the world leaves the world running behind its scrim: mobs hit, Pause is covered, the player can die in the menu. | Terrain.jsx:815-823; worldClock.js:37-43 |
| 9 | input:victory-under-pointer-lock | MED | On desktop, at every first dragon kill VICTORY appears under the locked pointer. "Keep exploring" cannot be clicked, clicks mine or place behind the scrim, and the world runs on. Esc is the only exit, and it leaves Settings open underneath. | bossSystem.js:216; HUD.jsx:455-457; GameSystems.jsx:203-234 |
| 10 | persistence:new-world-keeps-old-quests | MED | New World shows and saves the old world's quests, counters and achievements. Quests already claimed are never offered there again. | QuestSystem.jsx:231, :212-219; SimpleExperienceSystem.jsx:47 |
| 11 | debt:shrine-facts-session-scoped | MED | Every reload reverts the HUD objective and re-arms shrine chests. A shrine reached before Pilgrimage is offered never counts. New World inherits the old shrine records. | QuestSystem.jsx:320-340, :868-893; HUD.jsx:207; saveSchema.js:227-233 |
| 12 | leaks:world-load-keeps-previous-world-state | MED | An in-session Load or New World keeps the old world's 5 chests (which block new spawns), its loot, orbs and mobs. Walking over them banks the items into the new save. | useGameStore.jsx:1046-1239; QuestSystem.jsx:770-772, :868; ecs/world.js:4-10 |
| 13 | verbs:debris-colliders-catch-mine-rays | MED | For 2 s after a break, debris catches the build ray. Clicks "mine" empty cells (break sound, quest counters move, no block given). Digging straight down wasted 81% of clicks. | BlockParticleSystem.jsx:113-120; Terrain.jsx:748, :779-810 |
| 14 | numeric:footprint-overwrites-solid-cells | MED | Wall, Floor, Cube and Delete overwrite ore, built blocks and chest wood silently, with a debit per cell and no drop. A covered chest then opens from a dirt block. | placeAtHit.js:75-96; terrain.worker.js:115-118, :126 |
| 15 | numeric:delete-tool-places-cube | MED | "Delete Tool" makes right-click build a 27-cell (up to 64) cube of the selected block; left-click still mines one block. | GamePanels.jsx:534, :538-540; buildFootprint.js:38-40, :68-73; placeAtHit.js:75 |
| 16 | ultra:ultra-game-logic-2 | MED | Wall Builder used on the ground lays a 1-high strip along +X whichever way the player faces, sometimes into the player's own cell. | buildFootprint.js:60, :63; build-footprint-gates.test.js:30-35 pins this behaviour |
| 17 | desync:void-guard-fires-inside-the-playable-world | MED | Walking the designed deep seabed (14.5% of the ground within 600 m; the nearest point is 127 m from spawn), or standing on any floor at y 9 or below, teleports the player to spawn. Combined with row respawn-counts-mined, it can trap the player. | spawnPlacement.js:5, :11 against oceanProfile.js:28-36; Components.jsx:1017-1023 |
| 18 | ultra:ultra-player-world-7 | MED | After a void reset the view freezes about 2 s and the player is dropped over unloaded spawn chunks. They fall again at med/high tier; at low tier with slow chunks they end stuck in the ground. | Components.jsx:1018-1022 (the respawn path at :221-229 does it right) |
| 19 | persistence:two-tabs-clobber-world | MED | Resuming play in an older tab writes its state over the newer tab's. Once the newer tab closes, its progress is gone. | useGameStore.jsx:1253-1269; worldSaves.js:46-56 |
| 20 | persistence:manual-save-renames-and-resets | MED | "Save Current World" renames the world to "Guest's World - <date>" and resets its creation date, permanently. | WorldManager.jsx:44, :47, :55 |
| 21 | ultra:ultra-game-logic-1 | MED | A saved juice dial, or Reduced Motion's 0, is overwritten with 1 the first time another setting changes in a later session. | settingsPersist.js:68-78, :94-95 |
| 22 | input:panel-stack-relock-still-live | MED | Pressing B, J, H or Tab twice over trade or a chest relocks the pointer with the panel still drawn, and clicks edit the world behind it. Esc never closes World Manager or Credits. July review :790, still live. | InputManager.jsx:104-145, :73-91; panelGroups.js:21-24 |
| 23 | softlocks:world-manager-keys-stolen | MED | A world name containing b, h or j cannot be typed ("Hobbit Hole" becomes "it "); each of those letters opens a panel. Tab in any panel opens Character. | InputManager.jsx:104-145, :171 |
| 24 | input:wheel-hotbar-per-event | MED | A trackpad swipe spins the hotbar (30 events, 30 slots); a sideways swipe walks it backwards. After a coal, iron or potion tile is selected, the wheel is dead. | InputManager.jsx:32-52 |
| 25 | input:touch-lacks-express-verbs | MED | Touch has no force-cast: Cast places a block (or shows "No Dirt left") whenever ground within 8 m is nearer than any mob in the ±11° cone. | TouchControls.jsx:288-291; verbRouter.js:54-60 |
| 26 | leaks:chest-board-slots-never-reclaimed | MED | After about 2 min of travel no periodic quest chest spawns anywhere (0 in 30 min at 600 m); only shrine chests appear. | QuestSystem.jsx:792, :962-970 |
| 27 | leaks:stranded-pickups-never-despawn | MED | Ranged-kill orbs and loot stay all session, carry into a new world and bank there. The per-frame cost grows linearly (801 rays per frame at 801 pickups). | XPOrbSystem.jsx:25-36; LootSystem.jsx:44-59; SpawnerSystem.jsx:191-201 |
| 28 | ultra:ultra-player-world-6 | MED | 22% of landmark chunks lie in ocean and are never drawn, but the beam, compass, minimap and HUD lead there. From 86 m west of spawn every guide points under 19 blocks of water. | shrines.js:11-24 against Terrain.jsx:326; Terrain.jsx:393 |
| 29 | desync:level-up-fanfare-on-load | LOW | Every Load of a higher save plays LEVEL UP and floats "+<lifetime XP>". | SimpleExperienceSystem.jsx:19-41 |
| 30 | numeric:load-mid-fight-full-heal | LOW | Load, or Save then Load, mid-fight is an unlimited full heal in place; the dragon keeps its wounds. | useGameStore.jsx:1123-1127, :1168-1169 |
| 31 | numeric:dragon-crater-pays-player-and-aims-at-air | LOW | Dragon craters pay their blocks into the bag (+181 over 60 strikes). About 96% of "top" picks are air. A chest it breaks becomes an invisible record that a re-placed chest wipes. | BossEntity.jsx:33-95; Terrain.jsx:534-544; placeAtHit.js:114-118 |
| 32 | numeric:empty-chest-pickup-returns-wood | LOW | Mining an empty chest returns 1 wood, not the chest bought for 8 wood. | Terrain.jsx:541-543, :800-805; blockIds.js:70 |
| 33 | numeric:potion-spent-at-full | LOW | Using a potion at full health or mana spends it with no effect and no notice. | GamePanels.jsx:204-213 |
| 34 | numeric:place-above-world-ceiling-swallows-block | LOW | Placing on a y 255 top spends the block and pays rewards but places nothing; a wall near the top loses up to 63 of 64 blocks. | placeAtHit.js:66-96; terrain.worker.js:115-116 |
| 35 | silent:block-debris-frustum-culled | LOW | Break debris is almost never drawn, because a bounding sphere computed once culls it. | BlockParticleSystem.jsx:121 |
| 36 | ultra:ultra-player-world-9 | LOW | The last dry shoreline column sounds "underwater" (79% of positions), and the far field draws it as sea. | climate.js:31 `<=` against terrain.worker.js:417-419 `<` |
| 37 | ultra:ultra-game-logic-3 | LOW | A wounded mob never seeks cover from a player 5 or more blocks above it behind a wall; skeletons keep shooting. | localPath.js:162; mobLineOfSight.js:30 |
| 38 | ultra:ultra-game-logic-4 | LOW | A chained re-imbue can evict, in the same tick, the zone it just refreshed. | elementZones.js:51-56, :77 |
| 39 | debt:isolation-swallows-errors | LOW | Not reachable today. A throwing subscriber or boss effect would freeze quests with no log for any instrument. | eventBus.js:46-50; bossSystem.js:114, :195 |
| 40 | debt:runtime-reach-per-shard | LOW | No player path. Each e2e shard reports alone, so 4 of 8 shards list the boss and dragon modules as never reached; empty or missing input exits 0. | ci.yml:178-187, :233-235, :257; runtime-reach.mjs:135, :165-167, :189-192 |

Probes and logs for each finding are in `<session scratchpad>/audit-verify/<verifier index>-<key>/`. That is session scratch and may be reaped, so each lane should promote the probe it needs into a gate.

**How findings compound:**
- #1 with #2: on iOS, every death lands the player on a fresh level-1 world.
- #2 with #3: the only resume path drops the player out of their world.
- #2 with lead G1: if the gear is dead on touch, touch players have no way back to a saved world.

## 2. PLAUSIBLE findings, and the run that decides each

| Row | Sev | What holds | Decided by |
|---|---|---|---|
| input:ipad-tray-ghost-click | MED | App half reproduced on the real components: the lift opens the panel and unmounts the row, then a backdrop click closes it. The browser half was observed in CI Chromium at this sha (F9: mousedown id=null 15 ms after the lift). Tablets and landscape phones are affected; WebKit is undecided. | Playwright Chromium on `iPad Pro 11 landscape` and 820x1180: tap each tray row, log the capture-phase target, require the panel open 1 s later; then Kevin's iPad in Safari |
| silent:ios-audiocontext-interrupted-never-resumed | MED | Code half reproduced with a mutant: the guards admit only `suspended`, and nothing resumes on visibility change or gesture. WebKit bugs 276016, 263627 and 273511 show iOS 17 failing to resume on its own. | Kevin's iPad with Web Inspector: Home for 10 s, return, Pause then tap; log `state` and whether `currentTime` advances |
| silent:ios-music-refused-play-swallowed-and-unmutable | MED | Real MusicPlayer under 5 browser models. iPhone: the track runs at full system volume and Mute All cannot silence it. Current iPad: the music never starts. Older iOS: silent, then tracks pile up. | iPhone and iPad: 30 s after Start, play past dusk, Mute All, logging each `play()` result; plus a fresh-profile desktop Chromium |
| numeric:mine-credit-paid-by-click-not-break | LOW | Real MinecraftWorld plus the quest hook: a second click within one frame credits the quest and plays the break sound, with no block given. | Real-input Playwright: two clicks within one rAF, compare the blocks_broken delta with the bag delta |
| desync:stale-ai-reply-strikes-after-death | LOW | The real reply handler lands a blow or arrow from a mob killed between the AI post and the reply. Frame-loop kills cannot hit that window. | Playwright counting TICK_RESULT attacks from dead ids while T is pressed at random phases |
| **Lead G1** input:touch-settings-gear-unreachable | HIGH if confirmed | The gear is not a touch-owned control, so its touchstart and touchend are cancelled (p15d), and the repo twice records that this kills the click. The gear is the only touch opener for Settings, Manage Worlds and Load. No e2e taps it. | Playwright touch: tap touch-tap-to-play, then `getByTestId('hud-settings').tap()`, then read `showSettings` (predicted false) |
| **Lead G2** numeric:kill-loot-tier-always-zero | MED | QuestSystem.jsx:433 reads `.x`/`.z` from an array position (CombatSystem.jsx:169), so every kill rolls at tier 0 (probe: `tierAsWritten=0 tierFromArrayIndices=4`). One probe only; not independently verified. | Unit gate: a kill at (900, 70, -1200) through the real bus rolls tier 4 |

## 3. Root seams

**S1. Per-world state has six owners and no world-load event.** The owners:
- the store;
- App-level hook `useState` (boss, quests, XP refs);
- hook refs and state (chests, shrines);
- the undeclared `shrineReached` key;
- the ECS (allies, mobs, orbs, loot);
- the Rapier body.

`loadWorldData` resets only the store. `questLoadedAt` re-seeds only the quest hook, and skips a null questState. Every load in the game runs after mount, yet the gates load before mount, which is how B2g and B2b were recorded FIXED.
- Findings: #3, #4, #5, #6 (carry half), #10, #11 (leak half), #12, #27 (world half), #29, #30.

**S2. The save slot has no lifecycle.** Nothing resumes at boot (the price of B2a). There is no slot reuse, no write epoch, failures are ignored, and the manual save is a second path.
- Findings: #2, #6 (persist half), #11 (persist half), #19, #20; known save-write-failure-silent and delete-current-world-resurrects; refuted ultra-state-saves-input-1 and -2 (latent).

**S3. "Input is live" is inferred from pointer lock instead of derived from what is on screen.**
- Touch has no lock.
- Victory releases nothing.
- A relock never asks whether a panel remains.
- The close lists are hand-kept and have drifted.
- The window keydown handler ignores its target.
- The lock API is called with no guard.
- Findings: #1, #7, #8, #9, #22, #23, #24, ipad-tray, G1; known panel-key-repeat; ultra-state-saves-input-10.

**S4. Verbs act and pay without asking the owner of the truth.** The worker owns the voxels, but the main thread decides placement, debits, credits and plays the sound at the click. Hazard edits share the player's credit channel, rays see non-terrain bodies, and an alias loses item identity. The invisible box was this seam.
- Findings: #13, #14, #15, #16, #25, #31, #32, #33, #34, mine-credit, xp-token.

**S5. One world fact, two derivations that drift.**
- void line against seabed (#17);
- void branch against respawn branch (#18);
- `<=` against `<` (#36);
- landmark finder against renderer (#28);
- the Infinity sentinel against its consumers (#37);
- juice choice against effective value (#21);
- the weather cull fix against its debris sibling (#35);
- alive checked on update but not on attack (stale-ai-reply);
- array against object position (G2);
- the panel predicate against an ad-hoc OR (#7);
- mirror literals (ultra-game-logic-6) and a copied basis (ultra-game-logic-7).

**S6. Pools whose only exit is a player action.**
- Findings: #26, #27, #38, ultra-player-world-8; part of #6 and #12.

**S7. Apple treated as desktop Chromium.** The visual probes stub missing APIs with no-ops (touch-probe.mjs:38, ipad-probe.mjs:65, _lookbookPage.mjs:67), and Playwright runs Chromium only.
- Findings: #1, ipad-tray, ios-audiocontext, ios-music.

**S8. Instruments that cannot see the failure.**
- The B2g gate loads before mount.
- new-world-reset-gates never mounts the hook.
- context-loss.spec checks only coins, a block and position.
- touch-hold-gates drives a prop, not App's wiring.
- build-footprint pins the inverted wall.
- The event bus swallows errors.
- runtime-reach reports per shard.
- knip cannot see object members.
- bossSystem.js:41's comment asserts a load order that never happens.
- Findings: #39, #40, comments-that-lie, three-call-channels-dead-wires.

## 4. Fix lanes, in order

**Read-Before-Architect check.** I have read the 11 hunters' and 47 verifiers' reports. Their reads cover loadWorldData, startNewWorld, saveActiveWorld, the App hook order, ContextLossPanel, InputManager, TouchControls, placeAtHit, buildFootprint, terrain.worker and the ECS pools. My proposal adds the grouping into seams and lanes; I did not re-read source beyond the diff since 62159bc1.

**Sizes.** S: 1-2 files plus a promoted probe. M: 3-6 files plus a new gate. L: a new seam across 5 or more files, a DECISIONS entry and a CI e2e.

**The plan as a whole:**
- **Win:** L2 makes every world switch a boot. That retires S1 by construction (ten findings, four of them HIGH) instead of patching six owners, and turns #2 into the front door (Continue).
- **Compose:**
  - L1 is independent and ships first.
  - L3 follows L2; it is needed anyway for the squad and shrines, and keeps an in-place load correct if one returns.
  - L4 goes to the chaos-play lane, already in flight.
  - L6 runs before L7, since both edit Terrain.jsx and placeAtHit.
  - L8 follows L2.
  - L12 can run alongside any lane.
- **Door:**
  - L2 can be reversed.
  - The one-way doors are L3's save-format additions and the boss state the resume wipe has already clobbered on players' disks. Decide that repair before boss sync is fixed, or each clobbered save wakes a 700 HP tier-1 dragon whose return is not due.
- **Rails:** touch and iOS lanes (L1, L5, L10) end on Kevin's device; CI e2e is Chromium-only.
- **Threat:**
  - L2's reload replays the dragon entrance (REVIEW:w3b:reload-replays-entrance).
  - The flush before the reload must be synchronous.
  - The spawn hold must start at load_modifications_done; the verifier showed that starting it earlier releases on the old colliders.

**L1. Quick wins (S).** HIGH.
- **Fixes:**
  - one guarded lock helper (release only when locked and the API exists; request on the canvas only) at InputManager.jsx:123, :142, :176, MenuSystem.jsx:83, InputManager.jsx:20 and App.jsx:115;
  - `otherPanelOpen={showAchievements}` at App.jsx:322;
  - hydrate juiceIntensityChoice at settingsPersist.js:95;
  - run lead G1's touch tap, and if the gear is dead, add `data-hud-interactive` plus a touch e2e.
- **Red-first gates:**
  - death with exitPointerLock deleted (verifier 19 p1);
  - the full-App touch Show Stats probe (verifier 17);
  - the three-session settings round trip (verifier 41);
  - a static ban on bare `document.exitPointerLock(` and on `document.body.requestPointerLock`.
- **Closes:** #1, #7, #21, ultra-state-saves-input-10, G1.

**L2. Every world switch is a boot; Continue on the title (L).** HIGH.
- **Fix:**
  - Continue, Load, New World and the context-loss resume each flush synchronously, write the breadcrumb (or a fresh-world flag) and reload.
  - index.jsx loads that world (on a plain visit, the most recently written world the player owns, reusing its slot) before `root.render`, and arms the spawn hold at load_modifications_done.
  - The title shows Continue (name, level, last played) and New World.
  - A DECISIONS entry supersedes B2a's "nothing resumes at boot".
- **Red-first gates:**
  - the returning-player gate (verifier 6 p1b plus its mutant);
  - the context-loss resume keeps questState and bossState (verifier 1 v2-real-app);
  - wake the dragon, then New World: no dragon, and hook equals store;
  - a CI e2e: save 3 or more chunks out, reload, Continue, sample body y for 10 s, never more than 1 m low, recording pageerror (for the node-only Rapier wipe crash).
- **Closes:** #2, #3, #4, #5, #10, #12, #29, and halves of #6, #11, #27 and #30.

**L3. The store owns per-world state (M).** HIGH.
- **Fixes:**
  - the boss fight is selected from the store and written with setBossEncounter (the mirror is deleted);
  - a null questState re-seeds the hook to defaults;
  - persist the squad roster;
  - persist reached and rewarded shrines, and credit Pilgrimage from the stored set (persisting the set alone makes the in-world bug permanent);
  - declare all 17 undeclared keys;
  - decide the repair for clobbered boss saves first.
- **Red-first gates:**
  - the squad round trip;
  - shrine save, reload and revisit;
  - a boss gate that mounts first, then loads;
  - an AST count of undeclared keys equal to 0.

**L4. Void line and spawn recovery (S-M).** HIGH, through row 570. Hand to the chaos-play lane (T22).
- **Fixes:**
  - derive the void line from the world, not y < 10;
  - one recovery helper for the void and respawn branches (move the camera, reset spawnProbeFailsRef, clear spawnPosSet);
  - spawn ground uses `worldBlocks.get(key) > 0`;
  - raise respawn-counts-mined to HIGH (verifier 36 p4/p5b/p6 trap).
- **Red-first gates:**
  - isVoidFall is false for a body standing on DEEP_FLOOR;
  - the seabed walk;
  - the dig-then-reset trap as a chaos-play seed;
  - the void branch has the camera at the origin on frame 0.

**L5. One predicate for "input is live" (M).** MED.
- **Fixes:**
  - isPlayPaused and verb permission derive from `gameStarted && alive && active && !anyBlockingSurface`, where the surfaces are PANEL_FLAGS plus Victory, Death and ContextLoss;
  - Victory releases the lock and is exempt from pause-on-unlock;
  - relock only when no panel remains;
  - close sweeps are built from PANEL_FLAGS;
  - keydown returns early on an editable target or `isComposing`, and lets Tab through;
  - `e.repeat` guard;
  - the Modal backdrop closes only when the pointerdown began there;
  - the wheel accumulates;
  - touch gets a force-cast, or a recorded DECISIONS exemption.
- **Red-first gates:**
  - an exhaustive device × surface × opener invariant;
  - a key sweep into a focused editable field;
  - Esc closes every PANEL_FLAG;
  - a victory e2e asserting worldBlocks is unchanged.

**L6. Build tools that do what they say (M).** MED.
- **Fixes:**
  - a worker `place_if_empty` that replies with the cells it applied; debit and record only those; refuse chest keys; refuse y outside 0-255;
  - the Delete Tool's left-click mines the footprint (or the row is removed, recorded in DECISIONS);
  - a wall grows up unless the normal points down;
  - the panel reads the store.
- **Red-first gates:**
  - a worker-backed property gate over random footprints;
  - a table gate over every tool id.

**L7. Credit from the effect, not the click (M).** MED.
- **Fixes:**
  - quest credit and the break sound come from a source-tagged block_broken, and hazards pay nothing;
  - rays exclude dynamic bodies at all 6 sites and in the KCC;
  - debris gets `frustumCulled={false}`, a park matrix on death and asleep bodies at mount;
  - a chest credits as a chest;
  - dragon picks use ceil(g)-1 together with source credit;
  - potions are refused at full;
  - the token XP rule is recorded in DECISIONS;
  - strikesToApply drops strikes from dead mobs.
- **Red-first gates:**
  - a verb ledger;
  - real-Rapier debris for 120 frames;
  - place-then-mine identity.

**L8. Save slot lifecycle (M).** MED.
- **Fixes:**
  - one save path through saveActiveWorld;
  - a rolling slot, or a prune beyond K slots;
  - a toast on write failure;
  - clear the session when the world in play is deleted;
  - a write epoch across tabs;
  - hardening from the two REFUTED findings;
  - the load-heal design call.
- **Red-first gates:**
  - 50 sessions leave at most K slots;
  - a failing setItem raises a notice;
  - two store instances keep the newer write;
  - a manual save keeps the name.

**L9. Pools with lifetimes (S-M).** MED.
- **Fixes:**
  - the chest cap counts only chests within 120 m;
  - pickups get a lifetime, an expiry collect and a cull;
  - zones evict the soonest expiry.
- **Red-first gate:** the player 600 m away for 10 simulated minutes, and every pool stays within its bound.

**L10. Apple audio and Kevin's device run (M).** MED.
- **Fixes:**
  - audio recovers on any non-running state (suspend then resume, on gesture, visibility change and pageshow);
  - music starts inside the gesture and routes through a GainNode on the Web Audio bus;
  - an "iOS document" fixture;
  - ban no-op stubs.
- **Red-first gates:** a fake `interrupted` context recovers on tap; fake Audio plays after Start and every track pauses within 1 s of mute.

**L11. One fact, one predicate (S each).** MED.
- **Fixes:**
  - `<` at climate.js:31;
  - the landmark finder applies the renderer's land filter;
  - line of sight uses the true column tops (the hunter's finite sentinel is wrong);
  - the kill loot reads `position[0]` and `position[2]`;
  - the cooldown mirror imports its constants;
  - planarBasis is shared.
- **Red-first gates:** one consistency gate per pair.

**L12. Instruments that can see (S-M).** MED as instrument risk.
- **Fixes:**
  - a merged runtime-reach job that fails on empty input and has a must-reach set;
  - isolated failures logged, plus a DEV counter (vite.config.js:50 strips console in builds);
  - AST gates;
  - the five lying comments fixed together with L2 and L3;
  - the wrong-order gates rewritten;
  - the capture-guard rule decided;
  - one history-comment ratchet that merges the 3 open rows.

## 5. Standing gates that generalize each class (the chaos-play pattern)

| Gate | Class | Invariant | Mutation that must turn it red |
|---|---|---|---|
| G-load | S1 | Seeded {mount, play, Load, Create, resume, autosave} in production order: hook = store = disk blob; nothing survives a switch; census of useState seeded from PERSISTED_KEYS with no re-seed | move the load back into the child effect |
| G-slots | S2 | N visits keep the slot count constant and Continue lands the save; two tabs never write older over newer; a failed write raises one notice | remove the resume or the epoch |
| G-surface | S3 | Device × surface × real opener: while the surface is visible, no world verb fires, the world is paused and the control is reachable; an editable-field key sweep; Esc closes every PANEL_FLAG | today's isPlayPaused |
| G-ios | S7 | An iOS fixture (no Pointer Lock, an `interrupted` AudioContext, play() refused outside a gesture, volume locked) drives death, panels, audio and music; static ban on no-op stubs | remove the helper guard |
| G-verbs | S4 | Seeded verbs against the real worker and Rapier with debris: no placement changes a non-air voxel; debit = cells applied; credit = player-sourced block_broken; place-then-mine identity; every refusal raises a notice | move credit back into mine(); drop the occupancy filter |
| G-facts | S5 | A consistency gate per duplicated fact, plus sibling censuses (moving InstancedMesh, alive-on-attack) | revert one predicate |
| G-pools | S6 | Player 600 m away for 10 min: every pool within bound, and 0 awake bodies at mount | remove the lifetime |
| G-instruments | S8 | Merged runtime-reach (8 files, more than 0 entries, must-reach set); AST counts at 0; failures counted | delete one must-reach mount |

**No gate covers yet:**
- real WebKit and iOS;
- GPU pixels and draw cost;
- browser task-scheduling races;
- real multi-tab, tab discard and bfcache;
- trackpad input streams;
- far-coordinate float precision;
- AI worker throws (no onerror);
- persistent useFrame throws;
- React StrictMode;
- ultrareview chunks 4-6.

## 6. Debt items, ranked by risk × cost

| # | Item | Risk | Cost |
|---|---|---|---|
| 1 | Gates run in an order the game never runs: B2g, new-world-reset, context-loss.spec, touch-hold-gates, the pinned build-footprint wall, the iPad stubs | HIGH: two FIXED records for live defects | S-M each |
| 2 | comments-that-lie (bossSystem.js:41 hid #4 and #5) | MED | S |
| 3 | isolation-swallows-errors (#39); production builds strip console | MED | S |
| 4 | three-call-channels-dead-wires: 17 undeclared keys, 17 dead setters, 3 channels | MED | S for the gate, L to consolidate the channels |
| 5 | ultra-state-saves-input-10: body-lock fallback | LOW-MED | S (L1) |
| 6 | ultra-player-world-8: debris bodies awake from mount | LOW | S (L7) |
| 7 | runtime-reach-per-shard (#40) | LOW | S |
| 8 | ultra-game-logic-6: mirror literals | LOW | S |
| 9 | ultra-game-logic-7: copied basis, "unify later" | LOW | S |
| 10 | ultra-player-world-10: capture guards | LOW | S-M (decide whether the rule stays) |
| 11 | ultra-game-logic-5: history comments (merge 3 rows) | LOW | M |
| 12 | God files: Components.jsx 1570, useGameStore.jsx 1275, App.jsx 1060, QuestSystem.jsx 1002 lines | MED | L; S1, S3 and S4 are the split lines; no hunter reached a plan |

## 7. Coverage

**Hunters run:** softlocks, numeric, leaks, input, debt, verbs, persistence, silent and desync, plus ultra (chunks 1-3). None was skipped.

What these targeted reads and probes support is P(no further finding is reachable by these methods). They do not support P(none exists).

**Not reached, by hunter:**
- **softlocks:** whether the touch resume undone by pointerlockerror (w3-d-row/b) also blocks Start on an iPad; World Manager sitting under the touch layer; the Aspect channel machines.
- **numeric:** float precision; the numerics of the AI worker, zones, hurl and squad.
- **leaks:** GPU memory; Web Audio node lifetime; arpeggiator catch-up after throttling.
  - Measured, no leak: Rapier's wasm heap stayed flat over 53k chunk mounts.
- **input:** touchHold, aspectWheel, spellPicker; non-QWERTY layouts and IME; no gamepad support exists.
- **debt:** splitting the god files; the workers; GameMethods going stale.
- **verbs:** hurl and slam refusals; respec in the middle of a channel; Forge UI wiring; iOS hover.
- **persistence:** a real browser; up to 5 s lost on a switch; a world whose index write failed; emoji chest keys.
  - Measured clean: all 27 PERSISTED_KEYS round-trip with 0 mismatches.
- **silent:** real iOS; AI worker fuzz; useFrame throws; NaN audits; bfcache audio.
  - Measured clean: the terrain-worker fuzz (7,803 chunks, 0 throws).
- **desync:** zone, burn and hurl state across a load; projectiles from removed mobs; a setState-after-unmount sweep.
- **ultra:** chunks 4 (ui), 5 (render) and 6 (audio, scene, rest) were not run.

**REFUTED (no rows):**
- **ultra-state-saves-input-1:** the defect is real, but no writer has ever written a world without its id (4 of 4 writers, 155 commits). Kept as L8 hardening.
- **ultra-state-saves-input-2:** only a hand-edited, non-pair blocks or chests blob throws (623 mutations), and real corruption is stopped before the claim. Kept as L8 hardening.

**Parts refuted inside confirmed findings:**
- #4: the next session's 700 HP dragon (it is latent on disk, not live).
- #8: the gear half.
- #26: "quests blocked" (they are slowed).
- #28: the "below y 32" half.
- #36: the landmark and lair halves.
- #37: the A* half.
- #18: "the origin never loads".
- #40: "would miss a dead feature".
- #31: "every pick is air" (it is about 96%).
- #3: "reachable from the title".
- #25: harmful Action-mines.

**Known items with no registry row (open one each):**
- delete-current-world-resurrects (:1185);
- save-write-failure-silent (:937);
- healer-unlimited-instant-heal (:845);
- inventory-tile-selects-unplaceable-item (:1068);
- dragon-reward-inert (:814; amend REVIEW:w2f:forge-orphan-loot to add the Crown and Scale);
- panel-key-repeat-strobe (:803).

Also: panel-stack (:790) is carried as #22, and ultra-player-world-4 is respawn-counts-mined (amend it to HIGH).

**Unrun leads, no rows:**
- enemy arrows have no terrain test;
- an LMB on an empty chest under a locked pointer deletes the chest;
- respawn at med/high tier drops late;
- Rapier wipe-and-readd crash (seen in node only);
- a horizontal swipe may trigger history-back;
- an achievement fanfare may fire on load;
- chests can land on canopies or underwater;
- holding F casts on every key repeat;
- touch Trading and World Manager onClose only request a lock.

**Hygiene.**
- All work ran in `cp -c` clones; no edits to the repo or the audit tree; no browser or port used.
- vitest rewrote the gitignored `frontend/node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json` through the node_modules symlink the brief prescribes.

---

# Completeness critic

The critic was written before the report above was saved to disk; its gap 1 (no report) is closed by this file.

# Completeness critic: the deep audit (wf_b80f1171-bb1, main 62159bc1)

**Verdict:** the audit's claim to cover the invisible-box class and buried debt across Crafty does not hold as written.
- **Missing report:** `report.md` was never written.
- **Dropped finding:** one reproduced MED finding has no row anywhere.
- **New defect:** I found an untracked defect of the same shape (enemy arrows pass through terrain).
- **Unread modules:** half the ultrareview chunks never ran, and five hunters' coverage notes exist nowhere on disk.
- **Labels and lanes:** several CONFIRMED labels and two lane groupings go further than their own evidence.

I ran nothing; every finding below rests on reads made in this run.

## Ranked gaps

### 1. The synthesis report does not exist, so coverage cannot be audited for 5 of 9 hunters
**CONFIRMED.**
- **What the brief requires:** `crafty-deep-audit-wf_b80f1171-bb1.js:114` says: "Write the full report to ${S}/audit/report.md … chained: write && test -s."
- **What exists:** reading `<session scratchpad>/audit/report.md` returns "File does not exist". The only synthesis artifact is `audit/synth/gen_rows.py`.
- **What is lost:** the report's sections (3) seams, (5) standing gates per class, (6) debt ranking and (7) coverage, including the one-line REFUTED list and the dedupe's "known" list.
- **Coverage on disk:** `audit/prior-hunts.json` holds notes for verbs, persistence, silent, desync and ultra only. Softlocks, numeric, leaks, input and debt left no coverage note on disk.
- **Failure:** Kevin is told the class is covered while 5 hunters' read lists cannot be checked.
- **Severity:** HIGH, for the audit's own claim.
- **Next probe:** pull the `synth` and `hunts[*].r.coverage` return values from workflow wf_b80f1171-bb1's journal, write `report.md`, and check with `test -s`.

### 2. A reproduced MED finding was dropped with no row, verifier, registry row or decision
**CONFIRMED.**
- **The finding:** `audit/dedupe/prior.txt:46` reads "##### verbs/healer-unlimited-instant-heal | MED | pv=True | repro=True". At `:51`: "HEALER five presses, same instant -> heal:100hp/100mp ×5".
- **The code:** `input/talk.js:39-43` heals at full on every G press, with no cooldown, cost or combat check.
- **Absence checks:**
  - rows.jsonl has 0 hits for `healer|Wren`.
  - The registry's `talk.js` hits (lines 474 and 507) are a Forge mutant row and an i18n row.
  - DECISIONS' "healer" hits (951, 1032) are photo framing.
  - No `audit-verify/*healer*` dir exists.
- **Failure:** fighting a siege within 4 m of the healer, spamming G keeps the player at full health and mana.
- **Severity:** MED.
- **Next probe (needs repro):** `cd <session scratchpad>/audit/verbs/tree/frontend && npx vitest run tests/probe-verbs/talk-and-pause.probe.test.jsx --maxWorkers=1 --reporter=verbose --silent=false`. Then file a row or a DECISIONS exemption.
- **Wider effect:** because the dedupe output was never persisted, other drops cannot be enumerated.

### 3. New defect of the box's shape: skeleton arrows ignore terrain, and archers fire without line of sight
**Mechanism CONFIRMED by reading; play outcome PLAUSIBLE.**
- **What it measures:** these reads show the code path. The claim needs an arrow to land through a solid wall in play.
- **The bolt ignores terrain:** `game/enemyProjectiles.js:30` takes `stepEnemyProjectiles(list, dt, playerPos)`, and `:45` tests only `p.position.distanceTo(playerPos) < ENEMY_PROJECTILE_HIT_RADIUS`. There is no terrain input.
- **The archer ignores line of sight:** `workers/ai.worker.js:212-216` reads "// Stop and shoot arrows … pendingAttack = { … type: 'projectile', damage: 15 …}" and is gated on range only (`:202`, `:207`). `hasLineOfSight` is used only for cover seeking (`:161`).
- **Not tracked anywhere:**
  - Row 37 calls it "a separate read-only lead" and never filed it.
  - A registry grep for arrow, bolt or projectile with wall, terrain or through: none.
  - The same grep over the July review: none.
- **Failure:** a player sealed in a shelter or box, within archery range, takes 15 per arrow through solid blocks it can see. This is the box's "second copy of the truth" with the roles reversed.
- **Severity:** MED, proposed.
- **Next probe (needs repro):** a script file `<session scratchpad>/critic/g3-arrow-wall.mjs` with this content:
  ```js
  import * as THREE from 'frontend/node_modules/three/build/three.module.js';
  import { stepEnemyProjectiles } from 'frontend/src/game/enemyProjectiles.js';
  const player = new THREE.Vector3(0, 30, 0);
  const p = { position: new THREE.Vector3(12, 30, 0), velocity: new THREE.Vector3(-0.4, 0, 0), age: 0 };
  let hits = 0;
  for (let i = 0; i < 120 && hits === 0; i++) hits += stepEnemyProjectiles([p], 1 / 60, player).hits;
  console.log('wall at x=5 never consulted; hits=' + hits);
  ```
  Run it with `node` and that path (expected `hits=1`). The decisive in-game step is a CI e2e: a skeleton at 12 m with a 3-high placed wall between, and player health sampled for 5 s.

### 4. Possible save-borne invisible box: the manual save writes the camera position
**PLAUSIBLE.**
- **What it measures:** the reads below show where each save takes its position. The claim needs a load to put the capsule inside rock.
- **The two save paths:**
  - The manual save `WorldManager.jsx:46` uses `buildSaveData(…, { position: useGameStore.getState().playerPosition })`.
  - `playerPosition` is the camera, rounded: `systems/PositionTracker.jsx:15-18` sets `Math.round(camera.position.x)` and so on.
  - The autosave uses the body: `App.jsx:197-199` calls `rb.translation()`.
- **Where the camera can be:** the camera sits at eye height. During the 1.2 s roar it is 4.5 m behind and 2.2 m up with no terrain query (`game/transformCam.js:20-22`, `:54`).
- **Known but unmeasured:** registry line 524 (`REVIEW:w2e-follow:player-place-at-camera`, LOW) says "a save made during the reveal would stand the player at the reveal camera on load", with nothing measured. Audit row 20 cites `WorldManager.jsx:43-66` and says "Progress lands in the right slot", which misses this.
- **Failure:** Save Current World in a 1×2 tunnel, or mid-roar against a cliff, then Load. The body is teleported to the eye or reveal point inside rock. That is Kevin's original trap, through the save path.
- **Severity:** HIGH if it traps.
- **Next probe (needs repro):** in a `cp -c -R` tree, use real WorldManager Save then Load with a real Rapier KCC. The body stands in a 2-high tunnel, then try 16 walk and jump attempts. Assert at least 0.1 m of movement and no capsule-to-solid overlap. Repeat with the roar's pose.

### 5. Class no brief named: the camera displaced into solid geometry
**Mechanism CONFIRMED by reading.**
- **No terrain test:** grepping `castRay|raycast|clip|collid|inside|solid|terrain` across `render/followView.js`, `game/transformCam.js`, `game/beastRevealCamera.js`, `game/cameraKick.js` and `game/bossEntrance.js` returns only a "clip-worthy" comment (`transformCam.js:5`).
- **Why it shows:** terrain renders FrontSide (`.claude/rules/voxel-mesher.md` §1), so a camera inside rock sees through it. That is the box's "nothing drawn" half.
- **Other readers follow the camera:** streaming, pickups and quest reach read the camera (registry lines 523 and 524).
- **Failure:** a roar or beast reveal in a tunnel shows the void for 1.2 s, and pickups or reach act from inside rock.
- **Severity:** LOW to MED.
- **Next probe:** a node census over `transformCam` poses at tunnel and cliff cells, checking whether the camera cell is solid. Then one real-GPU lookbook frame of a roar in a tunnel.

### 6. Other invisible-box shapes the nine briefs did not name
- **Non-player actors that skip the terrain truth:** arrows (gap 3), mob line of sight (row 37 found one instance), and dragon and ally paths are not swept. The desync brief (script `:40`) lists store, ECS, worker, refs, save and DOM pairs, not actors.
- **Refresh-rate dependence:** the box needed no-step frames at 120 Hz (DECISIONS item 133; `physics.md`). No brief names refresh rate. Probe 39 steps at a fixed 1/60 (`voidfall-recovery7.test.jsx:147-148`). Depth-2 probe scripts contain no 120 or 144 Hz.
  - **Limit:** my grep over `tests/probe*` trees was blind. Its control (`camDist`) also returned nothing, so this item is PLAUSIBLE.
- **Missing feature detection for platform APIs:** this was found only incidentally. `InputManager.jsx:176` calls `document.exitPointerLock()` unguarded, while `:165` and `Terrain.jsx:820` guard it. No census of other unguarded APIs was run.
- **Next probe:** `grep -rnE "document\.(exitPointerLock|body\.requestPointerLock)|\.requestFullscreen|navigator\.(vibrate|wakeLock)" frontend/src`, compared against the guards. Also rerun gaps 3 and 4 at a 1/120 frame step.

### 7. Subsystems and state machines no hunter reached
CONFIRMED from the coverage notes in `audit/prior-hunts.json`:
- **Ultrareview ran 3 of 6 chunks:** "Chunks 4 (ui), 5 (render), 6 (audio, scene, rest) not run yet." Unrun: `frontend/src/ui/`, `src/render/`, `src/audio/` and the rest.
- **Verbs not reached:**
  - hurl and slam refusals (`world/HurlSystem.jsx`, `game/hurl.js`, `game/hurlChannel.js`);
  - snare or fuse channels after a respec (`world/SnareTetherSystem.jsx`, `game/snareChannel.js`, `game/hybrids.js`);
  - dodge or jump in water or mid-swap;
  - Forge panel wiring (`ui/panels/ForgePanel.jsx`);
  - quest-giver flows past claim (`game/questClaim.js`, `ui/QuestLog.jsx`);
  - equip edge cases (`game/equipment.js`).
- **Silent not reached:** "Neither worker has an onerror handler" (`workers/ai.worker.js`, `world/terrain.worker.js`); about 100 useFrame callbacks.
- **Desync not reached:**
  - element-zone, burn and hurl state across a load;
  - projectiles from removed mobs (`systems/EnemyProjectileSystem.jsx`);
  - ChestInterface and Forge transfers (`ui/ChestInventoryPanel.jsx`);
  - grass versus chunk unload;
  - the setState-after-unmount and stale-closure sweep.

Cited by no row or verifier dir. These may have been read by the five hunters whose notes are missing, so they are leads, not proof:
- weather and lightning (`render/WeatherSystem.jsx`, `render/LightningDriver.jsx`, `game/lightning.js`, `game/weatherGate.js`);
- dungeons and caves (`world/dungeonStamp.js`, `world/caveCA.js`);
- talents and respec (`game/talentTree.js`, `ui/SpellUpgradePanel.jsx`);
- relics (`game/relics.js`);
- `render/tierGovernor.js`;
- `i18n/cjkFonts.js`.

**Next probe:** finish ultrareview chunks 4 to 6, then diff every hunter's read list against the 397 non-test files under `frontend/src`.

### 8. Conclusions that go further than their evidence
- **The control claim is template text.** `gen_rows.py:18` sets `C = "CONFIRMED … by an independent verifier (real modules in jsdom or node, a control that flips …)"` for every CONFIRMED row. The text measures nothing per row.
- **Labelled CONFIRMED though the decisive step was emulated.** The rubric at script `:106` calls that "PLAUSIBLE if … could not run the decisive step". These rows should read CONFIRMED for the code path and PLAUSIBLE for the player outcome:
  - Row 9 says "the lock emulated from the W3C Pointer Lock text".
  - Row 22 says "Not run: Chrome granting the lock from a B keydown".
  - Row 1 rests on MDN, caniuse and WebKit source plus jsdom with the API deleted, with no device run.
  - Row 3's fall comes from a node sim with a modelled streamer and "no browser".
- **Severities the evidence does not carry:**
  - **Row 25 (MED):** its own note says "the behaviour matches the design of record; the gap is parity". That is a design question, not a defect.
  - **Row 46 (HIGH):** the severity is unconditional on a lead that is "not independently verified", yet it sits in "L1 quick wins". My reads support the mechanism:
    - the gear (`GameHud.jsx:111`) carries neither selector in `input/touchOwnership.js:36`;
    - touch listeners register `{passive:false}` (`TouchControls.jsx:201-204`) and cancel at `:160-161`;
    - the pause route is covered by a full-screen tap-to-play (`:254-256`);
    - the resume overlay has no Settings (`MenuSystem.jsx:375-399`), and neither does the tray (`touchTray.js:14-20`).
    The real-WebKit click suppression is still unrun.
  - **Row 2 (HIGH):** re-states the recorded B2a condition, "NOTHING resumes a save at boot" (`useGameStore.jsx:1245`). Its verifier says no data is destroyed.
  - **Row 48:** filed with playerVisible false "with the not-verified bucket", while its note says it is arguably player-visible. Script `:85` verifies player-visible rows, so the flag let it skip verification.
- **REFUTED-CLAIM (row 51, touch half):** the row says the `.catch` TypeError "on the touch path stops setIsPointerLocked(true) and markGameStarted()". But `MenuSystem.jsx:83` guards with `else if (document.body.requestPointerLock)`, and on iOS that method is absent (row 1's premise). The touch harm is unreachable on reading; only the desktop body-lock half stands.
- **Lanes group unrelated mechanisms.** Script `:122` asked for seams grouped "by the design flaw".
  - L7 "credit-from-the-effect" also closes frustum culling (row 35, a bounding sphere), sleeping bodies (row 49, performance), a worker reply race (row 45) and a missing refusal (row 33, potion at full).
  - L5 "input-live-predicate" also closes wheel delta normalisation (row 24) and touch force-cast parity (row 25).
  - These groupings follow file adjacency, not a shared flaw.

### 9. Duplicates and overlaps with the registry
No `AUDIT:` row is in main's registry yet (0 hits), so nothing duplicates there today. Once landed:
- **Row 52** overlaps `REVIEW:w2g:comments-say-history` (registry 596), `REVIEW:w2d:gamehud-history-comments` and `REVIEW:w3b:comment-history-phrases`; the row says so itself.
- **Row 30** overlaps `REVIEW:w2f:hunger-load-health-by-construction`.
- **Rows 11, 18 and 26** share the camera-as-player-place root with registry 523 and 524 and do not cite them.
- **Row 17** amends `REVIEW:fix-invisible-box:respawn-counts-mined` (570). That is correct and not a duplicate.
- **Defects with no open row:** L8 lists delete-current-world-resurrects and save-write-failure-silent as "known" July items. The July review closed on 2026-08-05 and no open registry row holds them. They are live defects recorded only inside a lane's evidence string.

## Claims tested that held
- **Voxel writers:** exactly 3 (`placeAtHit.js:93`, `Terrain.jsx:792`, `BossEntity.jsx:87`), all covered by rows.
- **Row 1:** the death path is unguarded (`InputManager.jsx:176`).
- **Row 47:** CONFIRMED by reading.
  - `CombatSystem.jsx:169` emits `[x,y,z]` and `mobKillBus.js:7` documents `position[]`.
  - `QuestSystem.jsx:433` reads `position?.x`, which is undefined, so the tier is 0.
  - It is the only subscriber that reads the position (`accrualHooks.js:11` ignores it).
- **Not gaps:**
  - build ember is capped at 40 a day (`ember.js:23`);
  - trading is buy-only (`TradingInterface.jsx:9`);
  - mobs spawn on ground only, never under roofs (`SpawnerSystem.jsx:34-35`);
  - hub NPCs cannot be damaged (`combat/targeting.js:17-34`);
  - there is no hunger system (2 mentions in total);
  - the dragon entrance freeze is a bounded 220 ms beat (`bossEntrance.js:21`).

## Exhaustion
- **"No defect exists in scope"** is not mine to assert.
- **"None is reachable by what I read":** the gaps above are what my reads reached.
- **Read in this run:**
  - `rows.jsonl` (all 68 rows), `dedupe/prior.txt` (headers and titles), `prior-hunts.json` (coverage clauses), `gen_rows.py` (lines 1-80), the workflow script, DECISIONS 123-292;
  - registry lines 474, 488, 507, 524 and title greps;
  - about 25 source sites listed above, and the 397-file source list.
- **Could not check:**
  - `report.md`, which does not exist;
  - coverage for softlocks, numeric, leaks, input and debt;
  - the dedupe "known" list;
  - anything in a browser or on a device;
  - the contents of `tests/probe*` trees by grep (my control failed there).
