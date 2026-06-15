# Gameplay POINT — S8 Shrines as Destinations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.
> Steps use checkbox (`- [ ]`). The "see-it-go-to-it" payoff that makes the Ember-Frontier journey LEGIBLE
> (S7 gave the journey stakes+reward; S8 gives it visible DESTINATIONS to walk toward).

**Goal:** Turn the existing deterministic landmarks into SHRINES — visible far-off silhouettes you navigate to,
with a compass marker, a reward chest at the base, and a quest that says "reach the nearest shrine" (replacing
the targetless Travel-500 odometer). This is what converts "wander aimlessly" into "I see that spire — go there."

**Architecture:** landmarks already exist as a PURE deterministic hash (`world/landmarks.js`: `isLandmarkChunk`/
`landmarkTypeAt`, ~1.4% of chunks, rendered in `Terrain.jsx <LandmarksRender/>`). S8 adds a pure `nearestLandmark`
finder that the HUD compass marker, the reward-chest siting, and the quest all consume — no new placement tech,
no persistence (claimed-state derives from the existing opened-chest set). NO-RE-MESH.

**Tech Stack:** pure JS finder + tests; `game/compass.js bearingToMarker`; HUD marker DOM (capture-suppressed);
QuestSystem chest spawn + quest progress; Terrain.jsx LandmarksRender (silhouette + Emissive beacon).

## Live-code grounding (read-before-architect — done)
- `world/landmarks.js`: `isLandmarkChunk(cx,cz)` (hash<0.014), `landmarkTypeAt(cx,cz)` (0 Spire / 1 Sky-arch). CHUNK_SIZE=16.
- `game/compass.js`: `bearingToMarker(targetX, targetZ, playerX, playerZ, heading, fov)` -> `{inView, pct, dist}`.
- `HUD.jsx` ~L248-330: renders compass markers (HOME at origin L292-308 is the template), ALL capture-suppressed
  (so explore frames stay byte-identical). A SHRINE marker mirrors the HOME pattern.
- `QuestSystem.jsx`: chest spawn `setChests([{ id, position:[x,y,z], opened:false, resolved }])` (~L657, currently a
  single wandering chest); `openChest` (~L682) -> CHEST_LOOT + `updateQuestProgress('chest_open')`; the `explorer`
  quest `{type:'distance', target:500}` (L31); quest stats include `distance`.
- `Terrain.jsx <LandmarksRender/>` ~L474-496: Spire = 5 tiers of Cubes + an Emissive beacon (#46E0FF intensity 3.2)
  at top, **capture-suppressed** (`!isCaptureMode()`); Sky-arch = 2 legs + lintel. `LANDMARK_PAL`. h/baseY/tiers.

## Kevin decisions (defaults — surfaced in KEVIN-REVIEW; proceeding on defaults)
- Shrine theming (#4): **generic reward shrines + one Aspect accent color** (NOT full per-Aspect biome gating yet).
- Lit/claimed-region grade-flip (#3): **deferred** (bigger visual change; revisit after S8 core lands; default-yes when built).

---

## Slice S8a — Pure `nearestLandmark` finder + red-first test

- [ ] **Step a.1 — failing test** `frontend/tests/world/shrines.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { nearestLandmark } from '../../src/world/shrines.js';
import { isLandmarkChunk } from '../../src/world/landmarks.js';
describe('nearestLandmark — deterministic nearest shrine to the player', () => {
  it('returns null when no landmark chunk is within the search radius', () => {
    // a tiny radius almost never contains a 1.4%-rare landmark
    expect(nearestLandmark(8, 8, 0)).toBeNull();
  });
  it('finds a landmark and reports its world center + type + planar distance', () => {
    const r = nearestLandmark(0, 0, 12);
    if (r) { // with radius 12 (~25x25 chunks) a hit is near-certain, but guard anyway
      expect(isLandmarkChunk(r.cx, r.cz)).toBe(true);
      expect(r.worldX).toBe(r.cx * 16 + 8);
      expect(r.worldZ).toBe(r.cz * 16 + 8);
      expect(r.type === 0 || r.type === 1).toBe(true);
      expect(r.dist).toBeGreaterThanOrEqual(0);
    }
  });
  it('is deterministic (same player cell -> same shrine)', () => {
    expect(nearestLandmark(40, 40, 12)).toEqual(nearestLandmark(40, 40, 12));
  });
  it('returns the CLOSEST landmark (no farther candidate beats a nearer one)', () => {
    const r = nearestLandmark(0, 0, 12);
    if (r) {
      // brute-scan the same window; r.dist must be the minimum
      let min = Infinity;
      const pcx = Math.floor(0 / 16), pcz = Math.floor(0 / 16);
      for (let dz = -12; dz <= 12; dz++) for (let dx = -12; dx <= 12; dx++) {
        const cx = pcx + dx, cz = pcz + dz;
        if (!isLandmarkChunk(cx, cz)) continue;
        const d = Math.hypot((cx*16+8) - 0, (cz*16+8) - 0);
        if (d < min) min = d;
      }
      expect(r.dist).toBeCloseTo(min, 5);
    }
  });
});
```
- [ ] **Step a.2 — run RED** (`shrines.js` missing).
- [ ] **Step a.3 — implement** `frontend/src/world/shrines.js`:
```js
import { isLandmarkChunk, landmarkTypeAt } from './landmarks.js';
const CHUNK = 16;
// Pure deterministic nearest-landmark (shrine) finder: scan the chunk grid within `maxChunks` of the
// player's chunk for a landmark chunk, return the nearest {cx,cz,worldX,worldZ,type,dist} or null.
// Uses only the deterministic landmark hash -> capture-safe + unit-testable. The HUD marker, reward-chest
// siting and the "reach nearest shrine" quest all consume this. Cheap (<= (2r+1)^2 hash calls per call;
// callers throttle to once a second, never per-frame -> Game-Loop-Isolation).
export function nearestLandmark(playerX, playerZ, maxChunks = 8) {
  const pcx = Math.floor(playerX / CHUNK), pcz = Math.floor(playerZ / CHUNK);
  let best = null;
  for (let dz = -maxChunks; dz <= maxChunks; dz++) {
    for (let dx = -maxChunks; dx <= maxChunks; dx++) {
      const cx = pcx + dx, cz = pcz + dz;
      if (!isLandmarkChunk(cx, cz)) continue;
      const worldX = cx * CHUNK + 8, worldZ = cz * CHUNK + 8;
      const dist = Math.hypot(worldX - playerX, worldZ - playerZ);
      if (!best || dist < best.dist) best = { cx, cz, worldX, worldZ, type: landmarkTypeAt(cx, cz), dist };
    }
  }
  return best;
}
```
- [ ] **Step a.4 — GREEN.** build clean; vitest grows; finder unused -> gate 20/20. Commit S8a.

## Slice S8b — HUD "nearest shrine" compass marker
- [ ] In `HUD.jsx` (the marker block ~L292, mirroring the HOME marker), once a second compute
  `nearestLandmark(playerPos.x, playerPos.z)` (throttle like the existing marker recompute; transient read).
  If non-null, `bearingToMarker(s.worldX, s.worldZ, playerPos.x, playerPos.z, heading, fov)` -> push a
  "SHRINE (Nm)" marker (Spire = teal accent, Sky-arch = amber, generic). Capture-SUPPRESSED (like HOME/boss/chest).
- [ ] VERIFY: build clean; unit holds; capture-suppressed -> gate 20/20. Commit S8b.

## Slice S8c — reward chest sited at the nearest shrine + "reach nearest shrine" quest
- [ ] Chest siting (QuestSystem chest spawn ~L657): instead of a wandering position, site the single reward chest
  at the nearest UNCLAIMED shrine base (`nearestLandmark` -> worldX/worldZ; y from the ground helper). "Claimed"
  derives from the opened-chest set (no new persistence). Keep capture-mode's fixture override (L761-764) intact.
- [ ] Quest swap (L31): replace the `explorer` Travel-500 quest with `{ id:'pilgrim', type:'reach_shrine', ... }`;
  add `reach_shrine` progress in the quest-progress switch — fire when distance to `nearestLandmark` < ~8 blocks.
- [ ] VERIFY: build clean; unit grows (a reach_shrine progress test); runtime -> gate 20/20. Commit S8c.

## Slice S8d — taller shrine silhouettes + brighter real-play beacons (the LOOK fix)
- [ ] In `Terrain.jsx <LandmarksRender/>` (~L479-496): raise the Spire `h`/`tiers` so it reads as a tall far-off
  silhouette (a real wayfinding landmark), and brighten/enlarge the Emissive beacon in the REAL-PLAY branch
  (the `!isCaptureMode()` Emissive) — this fixes the pov "beacons FAINT" finding WITHOUT touching capture.
- [ ] The SILHOUETTE (tiers) renders in capture -> `landmark.png` WILL change: `npm run visual:capture` then gate;
  LOOK `landmark.png` (taller spire reads) + `pov` (beacon glows as a destination, not garish). Deliberate
  re-baseline (landmark.png + any other landmark-bearing frame). Commit S8d.

## Notes / Self-Review
- **Pure finder, one source:** `nearestLandmark` is the single shrine-targeting kernel; HUD/chest/quest import it.
- **No persistence / NO-RE-MESH:** claimed-state derives from the opened-chest set; landmark placement unchanged.
- **Game-Loop-Isolation:** the finder runs on the existing ~1s marker/quest cadence via transient `.getState()`, never per-frame.
- **Capture:** S8a/b/c are capture-safe (suppressed markers / runtime); only S8d changes baselines (intended, re-baselined + LOOK'd).
- **STUCK:** if the chest-siting fights the capture fixture override -> keep the wandering chest, add a SEPARATE shrine chest; if landmark.png reads wrong at higher tiers -> tune h/tiers, re-capture.
