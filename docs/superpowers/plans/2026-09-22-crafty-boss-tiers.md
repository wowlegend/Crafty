# Boss Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Shadow Dragon returns at the lair, stronger each time, on a visible cadence — and the first kill stays the win.

**Architecture:** A pure `game/bossTier.js` derives each tier's stats, reward and return rule from `BOSS_CONFIG`; persistence gains `tier` + `killNight`; `bossSystem` keys spawn, max health and the kill beat on the tier; the renderer and health bar read the tier's numbers.

**Tech Stack:** React 19, zustand 5, vitest (jsdom for the hook).

**Spec:** `docs/superpowers/specs/2026-09-22-crafty-boss-tiers-design.md`

## Global Constraints

- ROOT = the repo root (holds `.git`); APP = `frontend/`. npm and vitest from APP; git from ROOT.
- Tier 0 is today's fight exactly — same stats, loot, notifications, win.
- The kill beat stays a `runIsolatedEffects` list with the win latch LAST.
- Game-Loop-Isolation: no reactive subscription inside a `useFrame`.
- Item names must exist in `src/data/items.js` (`bossReward.test.js` pins the registry).
- Every gate mutation-proven with `scripts/dev/mutate.sh`, including a plausible-WRONG mutation.

## Review Focus

1. **Tier 0 drift.** Any scaling that is not the identity at n = 0 changes today's fight. Task 1 asserts `bossTierStats(0)` deep-equals the config-derived tier-0 shape.
2. **The win moved.** If the tier bump throws or runs after the latch, the win could strand. Task 3 drives a kill whose XP grant throws and asserts `gameWon` and the tier both land.
3. **Old saves.** A won pre-tier save must hydrate as tier 1 with a return pending, never tier 0 (which would re-fire the first fight's crown) and never NaN. Task 2.
4. **Return fires early or never.** Off-by-one on nights or levels. Task 1 pins both boundaries.
5. **Respawn at the wrong size.** A tier-2 fight at tier-0 HP. Task 3 asserts the respawned max health.

---

### Task 1: `game/bossTier.js` (pure)

**Files:** Create `frontend/src/game/bossTier.js`, `frontend/tests/gates/boss-tier-gates.test.js`.

**Interfaces — Produces:** `RETURN_NIGHTS = 3`, `LEVEL_STEP = 4`, `bossTierStats(tier) -> { tier, name, health, xpReward, phases, loot }`, `bossCanReturn({ tier, killNight, nightCount, level }) -> boolean`, `tierLabel(tier) -> string`.

- [ ] Failing tests: tier-0 identity vs `BOSS_CONFIG`/`BOSS_LOOT`; monotonic health/damage/XP over tiers 0–5; speed capped at ×1.3; crown only at tier 0, scales `2 + n` after; every loot name in the item registry; `bossCanReturn` false at `killNight + 2` nights, true at `+3` with the level met, false with the level one short; tier 0 never "returns" (the first spawn is the L5 rule).
- [ ] Implement; PASS; mutation-prove (tier-0 not identity; speed uncapped; crown every tier; `>` for `>=` on nights; level step ignored).
- [ ] Commit.

### Task 2: persistence

**Files:** Modify `frontend/src/game/bossPersistence.js`, `frontend/src/store/useGameStore.jsx` (store fields `bossTier`, `bossKillNight`; `setBossEncounter` carries them; load path passes `nightCount`); extend `frontend/src/game/bossPersistence.test.js`.

- [ ] Failing tests: round-trip `{ tier: 2, killNight: 17 }`; a won save with no tier hydrates `{ tier: 1, killNight: <nightCount>, defeated: true }`; an unwon, untiered save hydrates tier 0; junk tier/killNight coerce to safe integers.
- [ ] Implement; PASS; mutation-prove; commit.

### Task 3: bossSystem + renderer + health bar

**Files:** Modify `frontend/src/world/bossSystem.js`, `frontend/src/render/BossEntity.jsx`, `frontend/src/ui/BossHealthBar.jsx`; test `frontend/tests/gates/boss-tier-loop-gates.test.jsx` (renderHook over `useBossSystem`, driving the store).

- [ ] Failing tests: a kill at tier 0 sets `gameWon`, `bossTier` 1, `bossKillNight` = nightCount; a throwing XP grant still lands both; the spawn does not re-arm before the return; after advancing `nightCount` and `level`, arriving at the lair spawns a fight at `bossTierStats(1).health`; the reawakening notification fires once.
- [ ] Implement; PASS; mutation-prove; lint; build; commit.
- [ ] `/code-review high` over the three commits.
