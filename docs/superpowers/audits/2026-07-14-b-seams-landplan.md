# B-seams land-plan (workflow wf_9104e3ca-cce, 2026-07-14)

> 9 remaining confirmed-bug seams, each dug + adversarially skeptic-checked. 7 LAND, 2 REVISE, 0 REJECT.
> Per-seam RED-first test drafts + fix plans: `2026-07-14-b-seams-drafts.json`.
> **These are DRAFTS.** Every gate is re-run RED-first and mutation-proven in the main session before landing.

# LAND-PLAN WORK ORDER — 9 seams (7 LAND / 2 REVISE / 0 REJECT)

## (1) LAND ORDER — severity-first, collision-groups atomic

**1. [GROUP A — ATOMIC] B2g-boss-reset + B2h-boss-killblock** → `src/world/bossSystem.js`
- Boss-fight progression blocker. B2g restructures the boss-hook state ownership; B2h's killblock fix lives INSIDE that same hook → land as ONE edit. Do NOT apply B2h's diff standalone (digger's B2h writeup was silent on B2g).
- Co-edit `tests/gates/death-beats-gates.test.js` in the SAME change (the fix breaks this static gate).
- Also touches: `useGameStore.jsx` (loadWorldData return + initial state), `saveSchema.js` (buildSaveData return), `App.jsx` (autosave sub).
- Leave green, do NOT touch: `boss-notif-timer-gates.test.js`, `boss-lair-gates.test.js`, `store/gameWon.test.js`.
- [B2h = REVISE — see §2]

**2. B2f-night-ratchet** → `useGameStore.jsx` (setGameTime 682-692, DELETE incrementNight action 649, dayNight import line 8) + `dayNight.js` (additive `crossedIntoNight` export) + `survivalSystem.js` + `tests/gates/siege-gates.test.js`
- **COORDINATE with Group A**: both edit `useGameStore.jsx`. Before committing the second-lander, grep the other seam's edited regions for `incrementNight` / night-counter / timeOfDay refs — B2f deletes `incrementNight`; if B2g's loadWorldData or initial-state references it, hand-merge as one. Placed adjacent to Group A for this reason.

**3. B3b-crystal-blackhole** → `useGameStore.jsx` seed region (587-596) + `EnhancedMagicSystem.jsx:175` + 3 grep-gates + `trading-interface.test.jsx` — ALL same commit. [REVISE — see §2]

**4. B3a-swords-uncraftable** — seam-local. Clean land.

**5. B3d-crafting-grid-eats** — seam-local. Clean land.

**6. B3c-free-placement** → `placementEconomy.js` (NEW) + `useGameStore.jsx` (accessor near :613) + `Terrain.jsx` (guard line after :841). Leave `Terrain.jsx:587-597` mine-grant UNTOUCHED. Regions distinct from B3b's seed(587-596)/B2f edits — low overlap, but re-verify if landed after them.

**7. [GROUP B — ATOMIC] B6a-quest-double-count + B6b-quest-mobtype-dead** → `src/game/questMatch.js` (NEW) + `QuestSystem.jsx` (196-201 match block + 317-318 double-dispatch) + `tests/gates/quest-mobtype-filter-gates.test.jsx`
- SAME reducer seam. One `questMatch.js` fixes both; one gate test asserts both. **If B6b carries its own separate 196-201 match-block edit in the batch, DROP that edit (keep only B6b's test)** — two rewrites of 196-201 textually conflict.

## (2) REVISIONS

**B2h-boss-killblock** (fold into Group A): cause independently verified real + live on HEAD (bossSystem.js:81+). Fix = merge into B2g's hook rewrite as ONE edit; co-edit `death-beats-gates.test.js` in-commit so it reflects the new correct behavior (not a mask).

**B3b-crystal-blackhole**: cause verified real + live on HEAD 4a2da96. Revision = land these 4 test-surfaces in the SAME commit, and one implementation constraint:
1. `wand-economy-gates.test.js:22` (flagged) — pins `inventory?.magic?.wand`; update when `:175 → getWands`.
2. `trade-fresh-prev-gates.test.js:21` (**skeptic-found, digger MISSED**) — pins `(prev.magic?.crystals || 0) - requiredCrystals`; breaks when spend routes through spendCrystals/blocks. Update.
3. `inventory-flat-bucket-gates.test.js` (**skeptic-found, digger MISSED**) — pins `[magicItem]: (prev.blocks[magicItem] || 0) + resultCount`. **CRITICAL: keep the wand-grant line VERBATIM as `prev.blocks[magicItem]`. The digger's `next.blocks[magicItem]` rewrite is WRONG — it breaks this grep. Reject that rewrite.**
4. `trading-interface.test.jsx:57-66` (flagged) — move magic→blocks.

## (3) REJECTED — NONE
All 9 causes confirmed real + live on HEAD. Do NOT drop any seam as "already fixed / not real." (The only "drop" is intra-Group-B dedup: B6b's redundant match-block edit if present — keep its test.)

## (4) RED-FIRST CHECKS BEFORE TRUSTING (skeptic flags)

- **B3b — highest distrust. Re-derive gate status yourself.** The digger MISSED 2 of its own breaking gates (trade-fresh-prev:21, inventory-flat-bucket) → the digger's RED/GREEN accounting for B3b is unreliable. Also: B3b's proof leans on **source-grep guard gates** (pin source strings) — those are GREEN-keep, NOT bug-demonstrating. Confirm a genuine BEHAVIORAL test goes RED on current HEAD showing crystals actually vanish, before trusting the fix. Verify `inventory-flat-bucket-gates` stays GREEN (line kept verbatim); verify the other two update in lockstep.
- **Group B — `quest-mobtype-filter-gates.test.jsx`**: RED-first confirm it fails on current HEAD for BOTH sub-bugs (each-kill-double-count AND mobtype-dead) before landing `questMatch.js`. One test must cover both.
- **Group A — `death-beats-gates.test.js`**: confirm currently GREEN; confirm the co-edit is minimal reflection of new correct behavior, not a mask of the killblock bug.

**External-sibling caution (outside these 9):** batch seams B2a-e touch quests+saves — may also edit `saveSchema.js` (Group A) and `QuestSystem.jsx` (Group B). Re-grep those two files for sibling edits before landing Groups A/B.
