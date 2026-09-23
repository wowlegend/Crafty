# The dragon returns — boss tiers (design, QUEUE C3 / Q23)

**Status:** self-gated per LOOP-CHARTER §4 · 2026-09-22 overnight.

## Read-before-architect

Read: `world/bossSystem.js` (spawn-on-arrival at the lair from L5, phase effect, the isolated kill beat with the
win latch LAST), `game/bossConfig.js` (700 HP, three phases with speed/damage/colour, `BOSS_LOOT`),
`game/bossPersistence.js` (serialize/hydrate with a won game outranking the save), `game/bossKill.js`,
`game/bossEntrance.js`, `render/BossEntity.jsx` (reads `BOSS_CONFIG.phases[bossPhase]` for speed/damage and
`attackRange/attackCooldown`), `ui/BossHealthBar.jsx` (the name), `store/useGameStore.jsx` (`bossHealth/Active/
Defeated`, `gameWon` + idempotent `markGameWon`, `nightCount` advanced only by `setGameTime`). They cover one
encounter, persisted, whose kill is the game's win. My proposal extends them by a TIER dimension over that
machinery: no new system, no new render path.

## Goal

The Shadow Dragon is a one-shot L5 event: after the win there is no apex threat left, and the project's own
review calls a recurring one "the single highest retention lever". Goal: **the dragon returns, stronger, on a
cadence the player can see coming — and the first kill stays the win.**

## Metric

1. Tier `n` = kills so far. Tier 0 is today's fight, byte-for-byte: same stats, loot, notifications, win.
2. After a kill, the dragon reawakens at the lair only when BOTH hold: `nightCount ≥ killNight + RETURN_NIGHTS`
   and `level ≥ 5 + LEVEL_STEP × n`. Each is a pure predicate, driven in a test.
3. Stats rise monotonically with tier (health, damage, a capped speed), reward rises with tier, and the crown
   drops at tier 0 only. Pinned by pure tests.
4. `gameWon` is set by the first kill and never unset; later kills never touch it.
5. Saves round-trip `{ tier, killNight }`; a save from before this change hydrates as tier 1 if it was won
   (killNight = its nightCount, so the first return is RETURN_NIGHTS away), tier 0 otherwise.
6. In the running game (bossSystem driven through the store in jsdom): a kill increments the tier and records the
   night; advancing the clock past the return and levelling up re-arms the spawn; the respawned fight uses the
   tier's max health.

## Strategy

- **Pure core** `game/bossTier.js`: `RETURN_NIGHTS = 3`, `LEVEL_STEP = 4`, `bossTierStats(tier)` → `{ name, health,
  xpReward, phases:[{hpPercent, speed, damage, color}], loot }` derived from `BOSS_CONFIG` (health ×(1+0.5n),
  damage ×(1+0.2n), speed ×min(1.3, 1+0.06n), XP ×(1+n); loot = `BOSS_LOOT` at 0, `Dragon Scale × (2+n)` after),
  `bossCanReturn({ tier, killNight, nightCount, level })`.
- **Persistence** adds `tier` + `killNight` to the boss block; `hydrateBossState` stops treating `gameWon` as
  "gone forever" and treats it as "tier ≥ 1".
- **bossSystem** keys the spawn on `tier === 0 ? level ≥ 5 : bossCanReturn(...)`, sizes the fight from
  `bossTierStats(tier)`, and in the kill beat increments the tier and stamps `killNight` BEFORE the win latch,
  which stays LAST and stays idempotent. A reawakening notification fires once when the return becomes due.
- **BossEntity / BossHealthBar** read the tier's phase stats and name instead of `BOSS_CONFIG` directly.

## Anti-attack

- **A farm.** Returning every 3 nights with rising XP could be farmed. Bounded by the level gate (a tier can
  only return once the player is `LEVEL_STEP` levels past the last one) and by rising difficulty.
- **A soft-lock.** A tier that outpaces the player's gear is a wall — but the dragon only ever waits at the lair;
  it never comes for the player, so an unwinnable tier is a fight the player can decline.
- **Breaking the win.** The kill beat's isolation and the win latch's position are unchanged; the tier bump is
  one more isolated effect before it.
- **Old saves.** The migration is total: absent fields read as tier 0/1 by `gameWon`, never NaN.

## Out of scope

New boss models, new attacks or phases per tier, new items (the tiered reward uses existing registry items).
