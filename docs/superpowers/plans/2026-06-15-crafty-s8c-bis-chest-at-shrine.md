# S8c-bis — Reward Chest at the Shrine (mining-of-destinations payoff) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** Put a guaranteed reward CHEST at each frontier shrine, so reaching a shrine (the S8 destination loop) has a tangible payoff beyond the Pilgrimage-quest XP — reinforcing "the world has a point."

**Architecture:** Entirely inside `useTreasureChests()` (QuestSystem.jsx), the hook that ALREADY owns `setChests`/`openChest`/`checkChestProximity` and ALREADY imports `nearestLandmark` + `zoneTier`. A new deterministic, capture-guarded, once-per-shrine spawner adds a `{ ...chest, shrine: true }` entry at the shrine base; it then renders (HUD reads `treasureChests.chests`) and opens (the existing proximity -> openChest -> CHEST_LOOT path) for free. The original S8c defer reason (cross-hook: the chest hook couldn't call the quest hook's updateQuestProgress) DISSOLVES because the spawn lives in the chest hook — no bridge needed.

**Tech Stack:** QuestSystem.jsx `useTreasureChests` (state + spawner + openChest), world/shrines.js `nearestLandmark`, world/zoneTier.js `zoneTier`, the existing 3D chest render (HUD/Terrain consume `chests`), vitest source-gates.

---

## Live-code grounding (read-before-architect — DONE 2026-06-15)
- `useTreasureChests()` (QuestSystem.jsx L605+) owns `chests` ({id,position:[x,y,z],opened,resolved}),
  `setChests`, `openedChestIds`, `chestId`, `openChest` (rolls CHEST_LOOT -> GameMethods.spawnLootDrop +
  notify), `checkChestProximity` (<4.5 blocks). Periodic spawner (30s, capped 5 unopened) + initial spawner;
  BOTH `isCaptureMode()`-guarded (chests are non-deterministic vs the drifting capture player -> excluded
  from baselines).
- `nearestLandmark(playerX, playerZ)` (world/shrines.js) returns `{cx,cz,worldX,worldZ,type,dist}|null`;
  ALREADY imported + used here for the Pilgrimage `reach_shrine` poll (L199-215, keyed once-per-shrine via a
  `reachedShrines` ref Set of `cx_cz`). `zoneTier(x,z)` (world/zoneTier.js) ALREADY imported.
- 3D chests render from `treasureChests.chests` (HUD.jsx L365 + ChestIndicator L536); a shrine chest is just
  another array entry -> renders + opens with NO new render/UI code.
- `getMobGroundLevel(x,z)` (store) gives the ground height for chest `y` (used by the existing spawners).

---

## Slice 1 — spawn a deterministic, once-per-shrine reward chest at the shrine base ✅ DONE
> Shipped: `shrineChestsSpawned` ref Set + a capture-guarded ~3s poll in useTreasureChests; spawns a
> `{...chest, shrine:true}` at the shrine base when the player is within 12 blocks of nearestLandmark,
> once per chunk, exempt from the 5-cap. Gate `shrine-chest-gates.test.js` (+3). No cross-hook bridge
> (spawn is in the setChests-owning hook); renders/opens via existing path. unit 1267->1270, build+eslint
> clean, captured+gate 20/20 (guarded -> no baseline leak).
**Files:** Modify `frontend/src/QuestSystem.jsx` (`useTreasureChests`); Test `frontend/tests/gates/shrine-chest-gates.test.js`

- [ ] **Step 1 — Write the source-gate (red).** `shrine-chest-gates.test.js` reads QuestSystem.jsx and asserts
  the shrine-chest spawner exists: references `nearestLandmark`, is `isCaptureMode()`-guarded, keys spawns
  once-per-shrine via a ref Set (a `shrineChestsSpawned`/similar), and tags the chest `shrine: true`. Run -> red.
- [ ] **Step 2 — Implement the spawner** in `useTreasureChests` (mirror the `reachedShrines` pattern from the
  reach_shrine poll): a `shrineChestsSpawned = useRef(new Set())`; a `useEffect` with a ~3s `setInterval`
  (return-early on `isCaptureMode()`): read `playerPos`; `const s = nearestLandmark(playerPos.x, playerPos.z)`;
  if `!s` or `Math.hypot(playerPos.x - s.worldX, playerPos.z - s.worldZ) > 12` return; `const key = ${s.cx}_${s.cz}`;
  if `shrineChestsSpawned.current.has(key)` return; mark it; resolve ground `y` via `getMobGroundLevel(s.worldX, s.worldZ)`
  (fallback like the other spawners); `setChests(prev => [...prev, { id: chestId.current++, position: [s.worldX, y, s.worldZ], opened: false, resolved, shrine: true }])`.
  This is EXEMPT from the 5-cap (it's a guaranteed reward, spawned at most once per shrine). Game-Loop-Isolation:
  transient `getState()` reads in a setInterval, not useFrame. Capture-safe: guarded + shrines may sit near
  origin so the guard is load-bearing.
- [ ] **Step 3 — Run gate + full unit + build.** gate PASS; `npx vitest run` grows; `npm run build` clean.
- [ ] **Step 4 — Visual gate.** `npm run visual:capture` then the gate -> expect 20/20 (spawner is
  capture-guarded -> no chest in any baseline). If a frame moves, the guard leaked -> fix, don't re-bless.
- [ ] **Step 5 — Commit** (`-F`): "S8c-bis Slice 1: a reward chest spawns at each shrine".

## Slice 2 — tier-scale the shrine chest's reward (far shrines pay more) ✅ DONE — S8c-bis COMPLETE
> Shipped: in openChest (chest-find moved above the loot roll), a `chest.shrine` chest gets `(1 + zoneTier)`
> extra rolls biased to the rarer half of CHEST_LOOT (zoneTier caps at MAX_TIER -> far shrines pay more);
> non-shrine unchanged. Gate +1 (openChest refs chest.shrine + zoneTier). unit 1270->1271, build+eslint
> clean, gate 20/20. **S8c-bis MILESTONE COMPLETE** — shrine destinations now have a tangible, frontier-
> scaled payoff. Reward magnitude + 12-block radius = playtest tunables (KEVIN-REVIEW #47).
**Files:** Modify `frontend/src/QuestSystem.jsx` (`openChest`); extend `shrine-chest-gates.test.js`

- [ ] **Step 1 — Extend the gate (red).** Assert `openChest` references `chest.shrine` + `zoneTier` (a shrine
  chest's loot is boosted by its zone tier). Run -> red.
- [ ] **Step 2 — Implement.** In `openChest`, after finding the chest: if `chest.shrine`, compute
  `const tier = zoneTier(chest.position[0], chest.position[2])` and grant EXTRA rolls / a guaranteed
  non-common item scaled by tier (reuse CHEST_LOOT; e.g. `tier` extra guaranteed rolls, capped). Keep the
  base behavior for normal chests unchanged. Match the S7 lootTier philosophy (far = better).
- [ ] **Step 3 — Verify** (gate + unit + build + capture-gate 20/20) + **Commit**:
  "S8c-bis Slice 2: shrine chests pay out scaled by zone tier".
- [ ] **Step 4 — Mark S8c-bis COMPLETE** in ACTIVE_PLAN + CHANGELOG; KEVIN-REVIEW note: the chest reward
  magnitude + the 12-block trigger radius are playtest tunables.

## Notes / Self-Review
- **Spec coverage:** reaching a shrine now yields a visible, openable reward chest (Slice 1) that pays more on
  the frontier (Slice 2) — the deferred S8c payoff, completing the S8 destination loop.
- **No cross-hook bridge:** the spawn lives in the hook that owns `setChests` -> the original eslint no-undef
  defer reason is gone. No store/GameMethods bridge added.
- **No placeholders:** exact hook, exact pattern (mirrors the existing `reachedShrines` reach_shrine poll),
  exact spawn shape (`{...chest, shrine:true}`), exact render/open reuse (no new components).
- **Locks:** capture-determinism (guarded spawner; deterministic site but excluded from baselines);
  Game-Loop-Isolation (setInterval + transient reads); NO-RE-MESH (chests are scene entities, not voxels);
  no design-lock touched (no new colors/textures/audio).
- **Deferred:** a distinct shrine-chest VISUAL (gilded vs normal chest) — taste, out of scope; a chest-open
  SFX already exists via the loot path.
