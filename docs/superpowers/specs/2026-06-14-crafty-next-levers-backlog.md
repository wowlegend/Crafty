# Crafty Next-Levers Backlog (holistic player-experience review)

> **Status: LIVING BACKLOG** — produced iter 181 (2026-06-14) by a code-grounded multi-agent design-exploration
> Workflow (`crafty-next-lever-review`): 4 player-experience-lens reviewers (new-player / retention / combat-feel /
> polish) read the actual `frontend/src` + a synthesis ranked the gaps. This is the loop's prioritized "what to
> build next" queue now that single-unit gaps were getting incremental. **Every item was code-grounded, but a
> reviewer's claim is T3 — VERIFY each seam live before building** (iter-181 already caught that #1's premise was
> false: block-BREAK debris already exists via the worker→`BlockParticleSystem` channel).

## Verified-this-iteration corrections to the raw findings
- **#1 (mining juice) is largely SHIPPED:** block **breaking** already spawns 8 color-matched physics debris
  cubes (`terrain.worker.js` emits `block_broken` → `BlockParticleSystem.jsx`) + auto-collects to inventory.
  The only real sub-gap is **placing** has no visual feedback (worker emits only on `blockType===0`). Demoted.
- **#2 (time-of-day legibility) is REAL + split:** there is genuinely no HUD day-clock. Built the **dusk
  pre-warning toast** (the actionable "night is coming" piece) iter 181; the **persistent day-phase dial** is the
  fast-follow (needs a HUD placement pass — top corners are crowded — + a deliberate 6-7 frame re-baseline).

## Ranked quick-wins (one-iteration, capture-safe — the loop's near-term queue)
1. ~~Mining juice~~ → **block-PLACE puff only** (break already done). Small. Reuse `triggerGPUSparks` (store, 4-arg) with the placed block's color in `Terrain.jsx place()`.
2. **Day-phase DIAL** (persistent HUD clock; pairs with the iter-181 dusk warning). Driven by `gameTime`+`isDay` (capture-deterministic, frozen clock). Cost: a placement pass + re-baseline the in-world HUD frames.
3. **Wire the spell-upgrade progression (DEAD CODE):** `spellUpgrades.js` + `getSpellStats`/`upgradeSpell` are built + store-exposed, but `EnhancedMagicSystem.jsx:~180` reads static `spell.damage` from `SPELL_TYPES`, never `getSpellStats`. ~90% built — one combat-read line + a button in the existing `SpellUpgradePanel`. HIGH payoff. (Verify the exact seam.)
4. **Incoming-hit hitstop/screenshake:** reuse the `hitstopUntil` flag the player loop already reads + a new `KICK_PROFILES.hurt` (or `triggerCameraShake`). Makes enemies feel dangerous. Capture-safe (capture never calls damagePlayer).
5. **Coin sink (coins are a dead currency):** `TradingInterface` exists; add a coins-priced tab + a `spendCoins(n)` store action (mirror `addCoins`) selling existing `ITEMS`-registry consumables.
6. **Spell hotbar (1-4):** casting is a pillar but reduced to one text label while blocks get a slot hotbar. Mirror `MinecraftHotbar` (reuse Slot/Panel + `SPELL_COLOR_CLASS`/`SPELL_MANA_COSTS`). Adds a persistent HUD element → re-baseline.
7. **Reward fanfare + flourish:** achievement/quest-complete are silent text toasts. Add one synth fanfare voice (reuse the `makeDawnChime` ascending-bell template) wired to the existing achievement/quest hooks + a gold scale-pop Toast variant.
8. **Night-siege intensity ladder:** push a "Night N — the swarm grows" notification on the nightfall edge (reuse the `DayNightAudio`/`addNotification` seam) + optional siege-pip row. Surfaces a survival bragging number.
9. **Endless quest/loot tiers:** quests + dawn-loot terminate at night 7 / night 5. `claimQuest` already cycles; add repeatable/endless-tier quests + a stacking/"mythic" `dawnLootRarity` tier. Data-only.
10. **Recallable onboarding:** the first-session tip is a single 4s auto-dismiss toast that can't be recalled — add a Help/controls recall (the controls panel exists).
11. **Hearth on the compass:** the home anchor is unfindable (not on compass/minimap). Add a hearth marker to the existing `Compass`.

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
