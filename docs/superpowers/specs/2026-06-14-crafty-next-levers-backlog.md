# Crafty Next-Levers Backlog (holistic player-experience review)

> **Status: LIVING BACKLOG** — produced iter 181 (2026-06-14) by a code-grounded multi-agent design-exploration
> Workflow (`crafty-next-lever-review`): 4 player-experience-lens reviewers (new-player / retention / combat-feel /
> polish) read the actual `frontend/src` + a synthesis ranked the gaps. This is the loop's prioritized "what to
> build next" queue now that single-unit gaps were getting incremental. **Every item was code-grounded, but a
> reviewer's claim is T3 — VERIFY each seam live before building** (iter-181 already caught that #1's premise was
> false: block-BREAK debris already exists via the worker→`BlockParticleSystem` channel).

## ⚠️ Reliability note (iter 183): this backlog's PREMISES are systematically over-optimistic
The reviewers read code but repeatedly missed already-wired systems. **VERIFY each "gap" is genuinely missing
before building.** Corrected so far: **#1** break-debris already exists (only place lacked it ✅ shipped iter 182);
**#3** spell-upgrades are REDUNDANT (spell damage already scales via the intellect attribute through
`solveSpellDamage` — `SPELL_UPGRADES` is an unused parallel system; delete-or-repurpose, NOT a feature gap);
**#4** incoming-hit flash+screenshake already fire from `damagePlayer` (only *hitstop* on incoming is absent);
**#7** ✅ SHIPPED iter 183 (and uncovered a real BUG — the level-up sound was dead via an unassigned
`window.playLevelUpSound`; fixed). Net: of the top-7 quick-wins, 1/3/4 were already-done/redundant, 1b/7
shipped. Remaining plausibly-real: #2 day-dial, #8 night-count, #10 recallable onboarding (#5 coin sink, #17 hearth-on-compass ✅ shipped iters 184-185) —
verify each first.

## Verified-this-iteration corrections to the raw findings
- **#1 (mining juice) is largely SHIPPED:** block **breaking** already spawns 8 color-matched physics debris
  cubes (`terrain.worker.js` emits `block_broken` → `BlockParticleSystem.jsx`) + auto-collects to inventory.
  The only real sub-gap is **placing** has no visual feedback (worker emits only on `blockType===0`). Demoted.
- **#2 (time-of-day legibility) is REAL + split:** there is genuinely no HUD day-clock. Built the **dusk
  pre-warning toast** (the actionable "night is coming" piece) iter 181; the **persistent day-phase dial** is the
  fast-follow (needs a HUD placement pass — top corners are crowded — + a deliberate 6-7 frame re-baseline).

## Ranked quick-wins (one-iteration, capture-safe — the loop's near-term queue)
1. ~~Mining juice~~ → ~~block-PLACE puff~~ ✅ SHIPPED iter 182 (GPU-spark dust puff at the placed block color; break shatters / place poofs).
2. **Day-phase DIAL** (persistent HUD clock; pairs with the iter-181 dusk warning). Driven by `gameTime`+`isDay` (capture-deterministic, frozen clock). Cost: a placement pass + re-baseline the in-world HUD frames.
3. **Spell-upgrade progression — DEAD CODE, but MEDIUM not a quick-win (scope corrected iter 182):** `world/spellUpgrades.js` (the `useSpellUpgrades` hook) has `getSpellStats`/`upgradeSpell` + a `SPELL_UPGRADES` table (3 levels/spell, damage 50→80→120) and store-exposes them, AND `spellLevels` IS persisted in saveSchema. BUT the system is DOUBLY dead: **(a)** `upgradeSpell` has ZERO callers — the `SpellUpgradePanel.jsx` is actually the *talent-tree* panel ("Aspects — Talent Trees"), NOT a spell-upgrade UI, so the player can never upgrade; **(b)** `castSpell` (`EnhancedMagicSystem.jsx:180`) feeds the static `SPELL_TYPES` base into `solveSpellDamage`, ignoring the level. To make it live needs THREE pieces: (1) combat wire — feed `getSpellStats(spellType).damage`/`.manaCost` into the cast (BALANCE-SAFE: `SPELL_TYPES` base + `SPELL_MANA_COSTS` exactly equal upgrade L1, so L1 play is unchanged, only L2/L3 add power); (2) a real upgrade UI surface (a "Spell Mastery" section — the progression panel is the thematic home; mirror its existing talent Upgrade-button pattern); (3) restore-on-load — re-seed the hook's `spellLevels` from the store on `questLoadedAt`-style load (currently saved but never restored into the hook). Capture-clean (panel isn't a capture state). HIGH value (a dead RPG progression pillar); worth its own brief plan doc.
4. **Incoming-hit hitstop/screenshake:** reuse the `hitstopUntil` flag the player loop already reads + a new `KICK_PROFILES.hurt` (or `triggerCameraShake`). Makes enemies feel dangerous. Capture-safe (capture never calls damagePlayer).
5. **Coin sink (coins are a dead currency):** `TradingInterface` exists; add a coins-priced tab + a `spendCoins(n)` store action (mirror `addCoins`) selling existing `ITEMS`-registry consumables.
6. **Spell hotbar (1-4):** casting is a pillar but reduced to one text label while blocks get a slot hotbar. Mirror `MinecraftHotbar` (reuse Slot/Panel + `SPELL_COLOR_CLASS`/`SPELL_MANA_COSTS`). Adds a persistent HUD element → re-baseline.
7. **Reward fanfare + flourish:** achievement/quest-complete are silent text toasts. Add one synth fanfare voice (reuse the `makeDawnChime` ascending-bell template) wired to the existing achievement/quest hooks + a gold scale-pop Toast variant.
8. **Night-siege intensity ladder:** push a "Night N — the swarm grows" notification on the nightfall edge (reuse the `DayNightAudio`/`addNotification` seam) + optional siege-pip row. Surfaces a survival bragging number.
9. ~~Endless quest/loot tiers~~ ✅ QUESTS SHIPPED iter 186 (makeRepeatableQuest endless bounty fallback in claimQuest). (Optional remainder: a stacking/"mythic" dawnLootRarity tier — dawn loot already plateaus at legendary night 5.)
10. **Recallable onboarding:** the first-session tip is a single 4s auto-dismiss toast that can't be recalled — add a Help/controls recall (the controls panel exists).
11. ~~Hearth on the compass~~ ✅ SHIPPED iter 185 (gold HOME marker via the pure `game/compass.js` bearingToMarker; capture-suppressed).

## Bigger levers (MILESTONE-scale — each warrants its own plan doc)
- **A recurring apex threat fused to the night-siege (the post-L5 challenge spine):** the only boss is a one-shot
  L5 event; the back half has no escalating challenge. Boss-tier variants keyed off a `bossTier`, integrated with
  `siegeParams` so the apex IS the siege climax; reuse `BossEntity` + the obsidian-mood bridge. The single highest
  retention lever.
- **Build-identity talent system:** ~20 ranks of flat +stat nodes that drain by ~L18 with no capstones, no
  mutually-exclusive choices, no respec → no reason for a 2nd run. Add per-Aspect capstones (mutually-exclusive,
  read at the verb site) + a `respecTalents()` action. Converts "I leveled up" → "I built a character".
- **Enemy combat-depth layer (telegraphs + archetypes):** hostiles attack with zero windup (the dodge i-frame
  system has nothing to react to) + all melee mobs share one "beeline+bonk" brain (10 types → ~3 behaviors). Add
  `windupUntil` to the AI worker (telegraph + damage-at-expiry) then 2-3 archetype branches (brute slow AOE slam,
  skitterling flank, emberhusk on-death AOE). Makes the siege skillful, not attrition.
- **Recurring cinematic-beat pass:** boss entrance (camera shake + bloom + roar + mood SNAP on the `setBossActive`
  edge), dawn/dusk sky payoff (~600ms godray/bloom warm-spike + accelerated mood lerp on the `isDay` edge), and
  reward-moment fanfares. The "this game feels alive + premium" read for the SOTA taste bar.

## Provenance
Raw synthesis: `tasks/wq6ypr8gs.output` (run `wf_69d28bc6-96c`, 5 agents / ~629k tok). Items are evidence-grounded
but T3 — confirm each seam live before building (the loop's verify-before-assert discipline).
