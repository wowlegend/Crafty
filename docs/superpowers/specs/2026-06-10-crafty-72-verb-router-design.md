# #72 — Mouse VERB ROUTER (build vs combat vs voidhand on shared buttons) — design of record

> **Status (2026-06-10): ✅ BUILT (commits `ffec759` router → `99e0c35` seam; plan
> `../plans/2026-06-10-crafty-72-verb-router.md`).** All §5 rows are unit tests (15) + 3 seam gates; the §6
> surgery landed as specced. **Build-discovered bonus (recorded honestly): the OLD Terrain listener was
> computing NaN coordinates — this rapier build exposes `timeOfImpact`, the legacy `hit.toi` is undefined —
> so instant mine/place at HEAD was silently broken (SFX, junk `NaN_NaN_NaN` save keys, no real edit).
> The router work fixed it + swept 2 more dead-field sites (GameScene occlusion march, block-target
> outline). Mining/placing actually work again.** 699 unit (74 files) · build · visual 13/13 · executor
> smoke mines a real voxel. M3 UNBLOCKED.
>
> Originally produced by a 3-lens design workflow (genre-comparables · code-reality · adversarial-edges)
> + orchestrator synthesis with the lens contradiction resolved by direct code verification
> (pre-M3 BLOCKER, STATE-REVIEW-2026-06-10 finding #6 / task #72).

## 0. The defect (verified)

Two independent `mousedown` listeners both consume buttons 0/2: `Components.jsx:424` (active-gated;
b0→melee, b2→cast) and `Terrain.jsx:571` (raw `pointerLockElement`-gated; b0→instant-MINE, b2→chest-open
or PLACE). Every melee swing near terrain deletes a block; every cast near a surface places one —
night-siege combat erodes the player's own wall, inverting BASE-AS-ANVIL. M3 binds HURL/SLAM onto the
same buttons, so the seam is REQUIRED first.

## 1. The decision: TARGET-PRIORITY ROUTER (no lanes, no modes, no clock)

A pure module `src/input/verbRouter.js`: `routeMouseVerb(button, ctx) -> 'attack' | 'cast' | 'mine' |
'place' | 'interact' | 'none'` — no React/Three/Rapier imports (node-testable; the pattern of
`game/dayNight.js`). ONE consumer: the existing Components.jsx active-gated listener. The Terrain.jsx
listener registration is DELETED; its raycast/mine/place/chest bodies become executor functions Terrain
registers (it keeps worker + Rapier ownership) — the established registry pattern (`GameMethods`).

**ctx (built once per click, all from EXISTING seams):**
- `held` — `voidhandHeld` (store).
- `meleeHit` — `GameMethods.checkMobsInMeleeCone(playerPos, lookDir, 4.5, π/2)` non-empty OR boss-in-cone:
  the IDENTICAL call melee damage uses → router-says-attack ≡ swing-actually-lands.
- `aimedMobDist` — nearest mob/boss distance inside a NARROW aim cone (`isPointInCone`, half-angle ~12°,
  range = spell range ~24m) — pure math over the bounded ECS mob list (~16-40 entities, microseconds).
- `terrainDist` — toi of the ONE Rapier ray Terrain already pays per click (8m), now passed in; else ∞.
- `chestTargeted` — floored ray-hit coords ∈ `store.chests`.

**Routing ladder — button 0 (first match wins):**
1. `held` → `attack` (M3's voidhand SM re-skins to HURL downstream — router unchanged at M3; no terrain
   checks while held: you AIM at your own wall for the 3× anvil hurl).
2. `meleeHit` → `attack`.
3. `aimedMobDist < terrainDist` → `attack` (whiff w/ swing SFX — the THROUGH-MOB GUARD, see §2).
4. `terrainDist < ∞` → `mine`.
5. else → `attack` (whiff; swing feel preserved).

**Routing ladder — button 2:**
1. `held` → `cast` (SM re-skins to SLAM).
2. `chestTargeted && terrainDist < aimedMobDist` → `interact` (open chest; occlusion-correct).
3. `aimedMobDist < terrainDist` → `cast`.
4. `terrainDist < ∞` → `place` (selectedBlock; existing normal/adjacency math in the executor).
5. else → `cast` (ranged projectile needs no surface).

**Day/night is NEVER an input** — night changes how often the mob branches fire, never the grammar
(mid-siege wall repair is the core BASE-AS-ANVIL loop; a time-split would kill it; the clock in input
routing is also a capture/replay-determinism hazard).

**Player sentence (age-8 legible, one breath):** *"Left-click hits what you're looking at — monster =
sword, block = pickaxe. Right-click uses what you're looking at — monster = magic, chest = open,
ground = build."*

## 2. The load-bearing verified fact (lens contradiction, resolved)

The code-reality and adversarial lenses CONTRADICTED on whether mobs are Rapier-ray-hittable.
**Verified by grep: `SimplifiedNPCSystem.jsx` contains ZERO `RigidBody`/collider — mobs are
collider-less ECS entities.** The terrain ray passes THROUGH a mob and hits the wall behind it. Two
consequences: (a) mob targeting MUST be the pure cone/aim math (an 8m ray can't classify mobs);
(b) without ladder rule b0-3 (the through-mob guard), a swing at a 6m mob (beyond the 4.5m melee cone,
inside the 8m mine reach) would still delete the wall behind it — the original bug at one remove.

## 3. Rejected (recorded with reversal paths)

- **Hands/lane model** (hotbar HAND slot = combat lane; block slots = build lane — the genre +
  adversarial lenses' preference): structurally kills both catastrophic routes, but the hotbar is
  blocks-only TODAY — a hand/weapon slot is a NEW system, and mid-siege repair would demand slot
  round-trips where target-priority is fluid. **REVISIT with #71 hotbar honesty** — if a HAND slot ships
  there, layering `lane` into ctx is a ~10-line ladder change on a tested pure module (the recorded
  reversal path). The adversarial lens's case for it rested partly on the refuted ray-hittable claim.
- **Explicit build/combat toggle key:** invisible mode state = the classic age-8 mode-amnesia trap; new
  HUD; violates the project's context-re-skinning-over-mode-UI pattern.
- **Day/night verb split:** breaks mid-siege repair + day-hostile defense (~0.7 day hostile chance).
- **Mob Rapier colliders for unified ray targeting:** a new physics system, real iPad cost (N dynamic
  colliders), out of seam scope.
- **Cooldown-fallthrough (attack on cooldown → mine):** spam-clicking a sieging mob would erode the wall
  — verb choice must be target-driven only (cooldown swallows the verb; never falls through).

## 4. Residual costs (accepted, eyes open)

- Intentional ground-AoE cast at EMPTY terrain in reach routes `place` (b2-4). Mitigations: spells are
  forward projectiles (ground-casting has ~no value without mobs); with mobs near, b2-3 wins and the
  projectile splashes them anyway. If playtest contradicts this, the lane model is the recorded fix.
- "Wanted place, mob crossed the crosshair" routes `cast` (mana + a projectile toward the threat —
  mid-cost, never base-destructive). The asymmetry is deliberate: mis-routes that DESTROY THE BASE are
  impossible by construction; the surviving mis-routes are whiffs/casts.
- Punch-a-tree with a mob aimed behind it: entity-priority wins (Minecraft-canon).

## 5. Edge-case table (the plan's test list — each becomes a unit test)

| # | State | Click | Verb |
|---|---|---|---|
| 1 | mob in melee cone, wall behind | b0 | `attack` (wall safe) |
| 2 | mob at 6m dead-center, wall behind (through-mob) | b0 | `attack` whiff (NEVER mine) |
| 3 | terrain in reach, no mob aimed | b0 | `mine` |
| 4 | HELD, aiming at own wall | b0 | `attack` (→HURL; never mine) |
| 5 | HELD, anything | b2 | `cast` (→SLAM; chest ignored) |
| 6 | chest nearest | b2 | `interact` |
| 7 | mob nearer than chest | b2 | `cast` |
| 8 | wall gap aimed, mobs beyond it (occluded) | b2 | `place` (repair) |
| 9 | mob IN the gap (nearer than terrain) | b2 | `cast` |
| 10 | sky / nothing | b0 / b2 | `attack` whiff / `cast` |
| 11 | terrain just beyond 8m reach | b0 / b2 | `attack` whiff / `cast` |
| 12 | chest, no mob | b0 | `mine` (break chest — existing cleanup preserved) |
| 13 | dead / !active / capture | any | `none` (consumer never routes; single active gate) |
| 14 | day vs night, same target state | any | IDENTICAL verb |

## 6. Seam surgery (what the plan doc builds)

1. `src/input/verbRouter.js` pure module + colocated TDD tests (the §5 table).
2. Components.jsx `handleMouseDown` → build ctx → route → dispatch to executors. The melee/spell triggers
   stay; `mine`/`place`/`interact` dispatch through the registry Terrain populates.
3. Terrain.jsx: DELETE the `mousedown` registration + its raw `pointerLockElement` gate (the gate
   unification kills the long-flagged S3 debt at this site); export the mine/place/chest bodies as
   executors (worker ownership unmoved → no-re-mesh gate footprint unchanged: the worker seam stays in
   Terrain, NOT in the router/Components path... router is pure; Components stays update_block-free —
   the dispatch is registry-indirect, same as today's GameMethods pattern).
4. Feedback cues (whiff SFX exists; out-of-reach tick + "select a build slot" hint are #71-adjacent
   polish — only the existing-SFX whiff ships with the seam).
5. Static-gate note: Components.jsx is already in the voidhand no-re-mesh GATED list — the registry
   dispatch must keep it free of the forbidden tokens (design holds: executors live in Terrain).
