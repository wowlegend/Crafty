# Gameplay POINT — S9 Blight-Heart Climax + Win-State — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.
> Steps use checkbox (`- [ ]`). The CAPSTONE of the "give it a point" arc: S7 gave the journey stakes,
> S8 gave it destinations, S9 gives it a CLIMAX + an ENDING (a win-state).

**Goal:** Turn the boss from a context-free ~25-block ambush at level 5 into a FIXED, foreshadowed far-frontier
"Blight Heart" lair — the biggest thing on the horizon, compass-marked from early on, that you journey toward
and finally fight — and add a WIN-STATE on its defeat (a victory beat + a post-climax endless handoff so the
sandbox continues). This is Kevin's confirmed "Ember Frontier + grafted Blight-Heart climax" direction.

**Architecture:** a pure `blightHeartSite()` fixed deterministic far coord that the compass marker + the boss
spawn both consume (one source). `useBossSystem` (world/bossSystem.js) relocates its spawn there + gates the
battle on REACHING the lair (proximity) rather than auto-spawning at the player. A new win-state flag + a
Victory overlay fire on the existing `bossDefeated` transition. NO-RE-MESH; no new persistence beyond a won-flag.

**Tech Stack:** pure JS site kernel + tests; React hook (bossSystem) edit; HUD compass marker (capture-suppressed);
a small Victory overlay component + a `gameWon` store flag.

## Live-code grounding (read-before-architect — done)
- `world/bossSystem.js` `useBossSystem(playerLevel)`: at `playerLevel>=5 && !bossSpawned && !bossDefeated` it
  spawns the boss at `playerPos + (25,25)` y=ground+15 (the AMBUSH). Has `bossDefeated` state, `damageBoss`
  (on death: +XP, Legendary/Epic drops, "BOSS DEFEATED!" notification), `getBossPosition`, `bossPositionRef`,
  the dangerLevel=2 obsidian bridge, and a DEV `forceBossSpawn` (boss-closeup fixture — keep intact). NO win-state.
- `game/bossConfig.js` `BOSS_CONFIG` (health, phases[], xpReward).
- `game/compass.js` `bearingToMarker`; `HUD.jsx` marker block (HOME/boss/chest/SHRINE, all capture-suppressed).
- `world/zoneTier.js` (TIER_RING 256, MAX_TIER 4 -> tier-4 starts at radius 1024) — the Blight Heart sits in tier 4.
- NO existing win/victory/gameWon state anywhere (grep clean) -> S9c is net-new.

## Kevin gates (surface to KEVIN-REVIEW; this milestone is FEEL-heavy)
- Boss RELOCATION (ambush -> travel-to-lair) is a real encounter-FEEL change -> a Kevin playtest item once S9b lands.
- Boss difficulty/pacing at the lair (BOSS_CONFIG tunables) -> playtest. Default: keep current HP/phases.

---

## Slice S9a — Pure `blightHeartSite()` fixed-lair coord + red-first test
- [ ] **Step a.1 — failing test** `frontend/tests/world/blightHeart.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { blightHeartSite, BLIGHT_RADIUS } from '../../src/world/blightHeart.js';
import { zoneTier, MAX_TIER } from '../../src/world/zoneTier.js';
describe('blightHeartSite — the fixed far-frontier Blight Heart lair', () => {
  it('is a fixed {x,z} (deterministic, same every call/game)', () => {
    expect(blightHeartSite()).toEqual(blightHeartSite());
    const s = blightHeartSite();
    expect(typeof s.x).toBe('number'); expect(typeof s.z).toBe('number');
  });
  it('sits in the FAR frontier (top zone tier, radius >= BLIGHT_RADIUS)', () => {
    const s = blightHeartSite();
    expect(Math.hypot(s.x, s.z)).toBeGreaterThanOrEqual(BLIGHT_RADIUS);
    expect(zoneTier(s.x, s.z)).toBe(MAX_TIER); // deep tier 4 = the most dangerous ring
  });
});
```
- [ ] **Step a.2 — RED.** **Step a.3 — implement** `frontend/src/world/blightHeart.js`:
```js
import { TIER_RING, MAX_TIER } from './zoneTier.js';
// S9: the Blight Heart — a FIXED, foreshadowed far-frontier lair (NOT a random ambush). Same coord every
// game (the world seed is fixed), so it's a learnable destination you see + journey toward. Pure -> testable
// + capture-safe (far from the spawn-pinned capture camera, never in a baseline). Sits deep in the top zone
// tier (the most dangerous ring) in a fixed bearing so it reads as "the dark thing at the edge of the world".
export const BLIGHT_RADIUS = TIER_RING * (MAX_TIER + 1); // 256*5 = 1280 blocks -> deep tier 4
export function blightHeartSite() {
  // fixed bearing (NE-ish) at BLIGHT_RADIUS; integer coords for clean chunk alignment.
  return { x: Math.round(BLIGHT_RADIUS * 0.7071), z: Math.round(BLIGHT_RADIUS * 0.7071) };
}
```
- [ ] **Step a.4 — GREEN.** build clean; vitest grows; unused -> gate 20/20. Commit S9a.

## Slice S9b — site the boss at the lair + compass-mark it (foreshadow + travel-to)
- [ ] HUD compass marker: add a "BLIGHT HEART (Nm)" marker (consume `blightHeartSite()` + `bearingToMarker`,
  mirror the SHRINE marker; an ominous color e.g. obsidian-violet `#A24BFF`; capture-suppressed). Always shown
  (the ultimate goal) OR once `playerLevel>=3` (foreshadow before you can fight at 5). Lock with a small gate.
- [ ] `world/bossSystem.js`: replace the `playerPos + (25,25)` spawn with `blightHeartSite()` (y from the ground
  helper). Gate the BATTLE on BOTH `playerLevel>=5` AND the player being near the lair (~within 24 blocks of
  `blightHeartSite`) — so the dragon awakens when you ARRIVE at the marked lair, not as a random ambush. Keep
  `bossSpawned` once-guard + the DEV `forceBossSpawn` intact (capture fixture). VERIFY: build clean; vitest holds;
  capture-suppressed marker -> gate 20/20; commit. (FEEL change -> KEVIN playtest item.)

## Slice S9c — WIN-STATE on boss defeat + post-climax endless handoff
- [ ] On the `bossDefeated` transition (bossSystem damageBoss death branch): set a `gameWon` store flag (+ persist
  to the save so a returning winner keeps the badge). Add a `ui/VictoryOverlay.jsx` — a bold-flat victory beat
  ("The Blight Heart is shattered — the frontier is yours") with a "Keep exploring" button that dismisses it
  (post-climax endless handoff: the sandbox continues; mobs/shrines remain). Wire it in App/GameScene gated on
  `gameWon && !dismissed`. Capture-suppressed (it must not appear in any explore/menu baseline).
- [ ] VERIFY: build clean; vitest grows (a gameWon-flag test); capture-suppressed -> gate 20/20 (or re-capture to
  confirm no leak). Commit. Surface the whole climax to KEVIN-REVIEW (playtest the journey-to-lair + the win beat).

## Notes / Self-Review
- **One source:** `blightHeartSite()` feeds both the compass marker and the boss spawn (DRY).
- **Capture-safe:** the lair is far from the spawn-pinned capture cam; the marker + victory overlay are capture-suppressed.
- **Game-Loop-Isolation:** boss-proximity + marker use transient `.getState()` on the existing cadences, not per-frame reactive state.
- **NO-RE-MESH / no big new persistence** (just a gameWon flag). DEV `forceBossSpawn` (boss-closeup fixture) stays intact.
- **STUCK:** if relocating the spawn destabilizes the boss encounter -> 2 hypotheses; fall back to keeping the
  level-5 trigger but spawning AT the lair (player auto-teleport-marker), or ship S9a+S9c (win-state) and defer S9b.
