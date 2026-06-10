# Crafty S2-B2 — VOIDHAND (kinetic / gravity-hand Aspect) — design of record

> **Status (2026-06-09): ✅ APPROVED + M1 BUILT (on `main`).** Kevin signed the §13 8-decision batch (recs as-is)
> + flagged the keybind conflict → grab = **`KeyV`** (`KeyG` was taken = chest/trade; keymap-audited). **M1 = the
> load-bearing no-re-mesh foundation is DONE** (commits `4d01cb5`→`254606b`→`3d08f6c`): pure `voidhand.js` SM +
> `kinetic.js` meter (TDD) · `world/PhantomBlockSystem.jsx` (orbiting phantom, self-nulls when !held, capture-frozen)
> · the `grab` intent + transient store fields · the Components SM wiring · the **NO-RE-MESH static gate GREEN**
> (`tests/gates/voidhand-noremesh-gates.test.js`) · a death-edge fix (proactive, from the WILDHEART review). Adversarial
> review CLEAN (0 blockers); 657 unit · build · visual 13/13.
> NOTE on process: M1 was built directly from the §12 milestone breakdown (a small foundational milestone — this spec
> served as its plan); M2+ each get their own `superpowers:writing-plans` plan doc in `../plans/`.
>
> **Status update (2026-06-10): ✅ M2 DONE — desktop FPS gate PASS.** Plan `../plans/2026-06-10-crafty-s2b2-m2-fps-gate.md`
> (scope amended by STATE-REVIEW-2026-06-10 §4: M1's phantom is render-only, so M2 measured render+light cost + a
> dev-probe dynamic hurl stand-in; the spec's "hurl→impact-burst" wording was pre-M3). Probe `?perf=A..E` (live siege,
> pinned dpr/tier) + `npm run perf:m2`. **C−B = 0.00ms median / +0.10ms p95 vs the pinned 1.5/3.0ms budget (Decision #5
> resolved: delta-from-baseline, per the rec)**; the grab-edge light hitch was engineered out (light-pool) and
> D-scenario-verified. Verdict + device protocol: `memory/S2B2-M2-PERF.md`; iPad confirmation parked to Kevin (does NOT
> block M3); ~~M3 re-gate item~~ (executed at M3 close-out, see below). 681 unit · build · visual 13/13.
>
> **Status update (2026-06-10): ✅ M3 DONE — HURL + SLAM are live** (plan
> `../plans/2026-06-10-crafty-s2b2-m3-hurl-slam.md`, after #72 shipped the verb-router pre-M3 blocker).
> Pure ballistic core (`game/hurl.js`, SUBSTEPPED — a smoke-found frame-spike tunneling bug was fixed TDD)
> + transient channel + `HurlSystem` (impact = damageMob + knockback, **element read AT IMPACT** per §3c)
> + the §3d SM re-skin (held clicks → SM 'hurl'/'slam'; melee/spell suppressed while held) + the
> looked-at-block grab tint (worldBlocks-known voxels; pristine-terrain color = M7 decision). SLAM centers
> on the phantom's ORBIT POINT (loop decision: timing-the-orbit = the aim skill). Verified vs a REAL
> spawned mob (hurl @30.3m arc-compensated → 60→30 HP; slam ×1.3). **M2 re-gate executed with REAL hurls:
> E−B = 0.00/0.00ms PASS** (`memory/S2B2-M2-PERF.md` §3b). The hit event carries pos+dir = the M4 anvil
> seam, ready. 714 unit · build · visual 13/13. **FPV-feel = Kevin's human gate, parked (KRB), non-blocking.
> NEXT = M4 (anvil 3× + kinetic meter + talent gate + autosave + HUD), then M5/M6 per spec seq.**
>
> Synthesized from 4 exploration lenses (seam-map, kit-design, no-re-mesh, adversarial) reconciled vs LIVE code;
> mirrors the WILDHEART spec format + REUSES its Aspect-meta scaffold. (§ M0 reference-lock = PASSED.)

## 0. Review reconciliation (provenance, honest)

The lenses agreed on the spine (phantom-chunk fallback, WILDHEART scaffold reuse, base-as-anvil
cohesion) but CONTRADICTED on four points. Resolved against the real code:

1. **"inCombat" definition.** Lens-C/D read `dangerLevel > 0` as the combat flag. FALSE in prod:
   `dangerLevel` (useGameStore.jsx:77-78) is written ONLY by the boss bridge
   (AdvancedGameFeatures.jsx:212-214) — an ordinary **night siege never sets it**. The honest
   combat-context predicate is `!isDay` (night). RESOLUTION: combat-context = `!store.isDay`;
   `dangerLevel>0` is a boss-only *intensifier*, not the gate.
2. **Knockback = impulse?** Lens-A claimed HURL routes a Rapier `applyImpulse` on the mob. FALSE:
   `entity.knockback` (SimplifiedNPCSystem.jsx:914 set, :759-762 apply) is a **1-frame position
   nudge** (`pos += knockback * delta * 4`, then nulled), magnitude 2. The ONLY real `applyImpulse`
   precedent is the boss shoving the PLAYER (AdvancedGameFeatures.jsx:519). RESOLUTION: HURL-on-mob
   reuses the existing `entity.knockback` nudge (proven, cheap); player-recoil (if any) reuses the
   boss `applyImpulse` path.
3. **Orbit = a Rapier constraint/joint?** Lens-D flagged a per-frame constraint solve as the top
   perf risk. RESOLUTION: the orbit is a **kinematic position write** (`setNextKinematicTranslation`
   each frame), NOT a distance-joint / constraint solve — same model as the WILDHEART transform-cam
   lerp. Zero solver cost; the only physics cost is one extra AABB in broad-phase.
4. **Pool isolation.** Lenses split on reusing the 200-cap debris pool vs a separate phantom pool.
   RESOLUTION: a **separate tiny PhantomBlockSystem pool (cap 4)** for the 1×1×1 grabbed proxy, so a
   held phantom can NEVER be evicted by an impact-burst, and the 0.25-shard debris pool stays
   uncontended. Debris on hurl-impact still draws from the existing 200-cap pool.

Verified anchors (all live): BlockParticleSystem.jsx (MAX_PARTICLES=200, ring-buffer recycle, 0.25
boxes); Terrain.jsx:647,675 (the ONLY two `update_block` posts); terrain.worker.js (re-mesh path);
SimplifiedNPCSystem.jsx:914/759-762 (knockback); AdvancedGameFeatures.jsx:519 (player applyImpulse);
beastTransform.js / beasts.js / ferocity.js (the scaffold); inputState.js:40 (INTENT_KEYS, `roar` is
a real consumer); talentTree.js:9-15 (ASPECT_TREES[0] = voidhand, 3 stat nodes, NO unlock node yet);
tests/gates/beast-noremesh-gates.test.js (the static-gate to clone).

## 1. Goal

A kinetic Aspect that grabs ONE block, orbits it as a shield in first-person, and unleashes it via
attack-intent verbs — making the player's **day-built wall the weapon's backstop** (base-as-anvil:
a mob spiked into a static wall takes bonus damage). Success: it reads as learned skill (not a
button), it FIRES in real sieges (the wall is reachable), and it NEVER re-meshes a chunk in combat.

## 2. Hard constraints honored — each mapped to a design choice

- **NO re-mesh in combat** → phantom-chunk fallback + static gate (§3b, §6). Combat grab spawns a
  pooled visual+physics proxy; it never calls `update_block`.
- **Web/iPad/mobile envelope** → kinematic orbit (no constraint solve), cap-4 phantom pool, M2
  real-device FPS gate BEFORE the verbs (de-risk order §11).
- **Deterministic visual gate** → phantom orbit phase is frozen on `isCaptureMode()`; the grab is
  capture-suppressed unless a dedicated capture seed places a phantom (§9).
- **Zero new menu** → the 2 existing attack intents (`attack`, `cast`) re-skin while VOIDHAND is
  active, exactly as WILDHEART re-skins melee (§4).
- **Kid-safe (Marcus, 8)** → no friendly-fire on the player in v1; SURF (the strong escape) is CUT
  from v1; the orbit is auto-positioned (no aim-fiddle to grab).
- **God-file discipline** → the SM extracts to a pure `src/game/voidhand.js` (like beastTransform.js)
  + `src/game/voidhandData.js` (like beasts.js); Components.jsx wires it (§7).

## 3. Mechanics design (the autonomously-buildable, TDD part)

### 3a. The grab STATE MACHINE (single-writer, real intent consumer)

Pure reducer `src/game/voidhand.js`, structural twin of `beastTransform.js`. States: IDLE →
CHARGING (hold the grab intent, ~0.35s anticipation) → HELD (phantom spawned + orbiting) →
release (a verb fires) → COOLDOWN → IDLE. The SM owns ONLY timers + the held-flag; the store's
`voidhandHeld` + `heldPhantom{x,y,z,blockType}` is the single source of truth (mirror
`beastFormActive`/`activeBeastForm`). `decideGrab(sm, ctx)` returns an action:
`'none'|'startCharge'|'cancel'|'grab'|'releaseHurl'|'releaseSlam'|'exitTimer'`.

- Entry gate `canGrab`: `alive && active(pointer-lock) && cooldownOff && unlockedTalents.voidhand_grasp>0 && kineticBanked >= GRAB_COST`.
- Read transiently in Components.jsx `useFrame` via `getInput().grab` (a NEW intent, §3d) — never subscribed (Game-Loop Isolation).
- While HELD, the SECOND attack intent fires the verb (re-skin, §4); a manual re-press of grab drops the phantom (cancel).
- Max hold duration (~10s) auto-drops the phantom (prevents pseudo-storage / a held phantom across a day→night flip).

### 3b. The PHANTOM-CHUNK fallback (the no-re-mesh heart) + the hard invariant

`src/game/voidhandPhantom.js` (pure lifecycle helpers) + a small `PhantomBlockSystem.jsx`
component (cap-4 `InstancedRigidBodies`, 1×1×1 boxes, color from the target block type).

Two-mode grab, branched on `store.isDay`:
- **CALM grab (`isDay` true, no active hostiles):** a *real* block edit is allowed — it posts
  `update_block` exactly like building (Terrain.jsx path). No perf pressure in the calm. This is the
  "bank blocks in the calm" half. (v1 MAY defer real-edit grabs entirely — see §10.)
- **COMBAT grab (`!isDay`):** NEVER touches a voxel. Spawns a phantom from the cap-4 pool, color
  read from `BLOCK_TYPES[target].color` (the same static config the build path reads), orbits it
  kinematically, hurls/slams it. The terrain voxel is untouched → zero re-mesh.

THE HARD INVARIANT (load-bearing): a combat-state grab NEVER calls `postMessage({type:'update_block'})`.
Enforced two ways: (1) the SM's combat branch has no worker handle in scope; (2) the static gate
(§9) asserts `src/game/voidhand*.js` + `PhantomBlockSystem.jsx` reference zero voxel-edit/worker
seams — a clone of `beast-noremesh-gates.test.js`'s `FORBIDDEN` regex.

**Phantom-source ruleset (resolving the adversarial gap):** v1 grabs a phantom of the **block the
player is looking at** (raycast, same as the build reticle), color-matched, but does NOT consume or
edit it. No structural-vs-player-placed heuristic (that was the exploit-vector the adversarial lens
flagged) — in combat the grab is ALWAYS a phantom, so "which voxel can be grabbed" is moot: any
looked-at block yields a phantom; nothing in the world changes.

### 3c. The orbit + the 2 verbs (HURL + SLAM)

- **Orbit:** the phantom is positioned each frame at `player.pos + R*(cos θ, yOffset, sin θ)`,
  θ advancing ~1 rev / 3s, R≈2.2m (outside the FPV nose-cam frustum to avoid clip — §6). Kinematic
  write, no solver. Reads as a controllable shield + an aim reference.
- **HURL** (the FIRST attack intent while HELD): phantom goes dynamic, launched along camera-forward.
  On mob contact → `entity.knockback` nudge (reuse :914 model) + element-typed damage via the
  existing damage path + `triggerGPUSparks` at the impact. Base-as-anvil: if the struck mob is within
  ~3m of a static block along the hurl line, apply the WALL-HIT bonus (§3e).
- **SLAM** (the SECOND attack intent while HELD): phantom drives straight DOWN for a short-range AoE
  stun + impact; same knockback + spark reuse, higher damage mult, no ranged travel.

Both verbs end the HELD state → COOLDOWN. Element of the verb = the player's loaded spell element
(fire/ice/lightning/arcane), re-skinning the spark + damage type transparently (reuse the
`resolveFormMelee`/`spellForElement` pattern — element is read at IMPACT, not stored on the phantom,
so spell-switching mid-hold can't desync).

### 3d. Input intent + the 2-intent re-skin (zero new menu)

Add ONE intent `'grab'` to `INTENT_KEYS` (inputState.js:40), written by the keyboard listener (**`KeyV`** —
Decision #6 RESOLVED 2026-06-09: `KeyG` was already taken = open-chest / trade-villager `InputManager.jsx:162`;
full keymap audit found A/B/C/D/E/F/G/Q/R/S/T/U/W all bound, so grab = the free ergonomic **`KeyV`**) and
consumed transiently — IDENTICAL contract to `roar`. While
VOIDHAND is HELD, the existing `attack` and `cast` intents re-skin to HURL/SLAM (no new keys, no new
menu) — the same "re-skin the 2 attack intents per-form" move WILDHEART uses. IDLE → the intents do
their normal melee/spell jobs.

### 3e. Base-as-anvil cohesion (the design-closure loop)

On a HURL/SLAM impact, raycast a short ray from the impact point along the hurl direction; if it hits
a static terrain/wall block within ~3m, apply a secondary WALL-HIT bonus (total ~3×) + a gold
"WALL HIT!" damage number + an impact flash on the wall face. A **one-shot guard** (lastBonusFrame per
mob per hurl) prevents double-counting on a bounce. Unit test: mob next to wall → 3×; same mob in
open air → 1×. This is the "building MATTERS in combat" closure — and it's a gameplay mechanic, not
new engine code (the wall colliders already exist).

### 3f. The KINETIC meter (bank / spend) + talent gate + persistence

`src/game/kinetic.js`, structural twin of `ferocity.js`. `KINETIC_MAX`, `GRAB_COST`,
`canGrab(banked)`, `clampKinetic(v)`. Banks in the calm, spends on a combat grab (a calm/real-edit
grab is free or low-cost — Kevin Decision #2). Dawn-reset semantics mirror Ferocity (Kevin Decision
#2). Store fields: `kineticBanked` + `setKineticBanked`/`accrueKinetic` (twin of
`ferocityBanked`:559-561), persisted in the save progression slice + the autosave-diff
(`|| s.kineticBanked !== prevS.kineticBanked`). HUD: a 5th StatBar under the Ferocity bar, neutral
placeholder color at M4, re-baselined at M7. The talent gate is a NEW effect-less node
`voidhand_grasp` added to `ASPECT_TREES[0]` (the voidhand tree, talentTree.js:11-14), modeled on
`wildheart_roar` (limit 1, prereq `voidhand_force`, skipped by the stat-fold, rank read at the SM
entry gate).

## 4. The 2-intent re-skin while VOIDHAND active (zero new menu)

IDLE: `attack` = melee, `cast` = spell (unchanged). HELD (phantom orbiting): `attack` → HURL the
phantom along camera-forward; `cast` → SLAM the phantom downward (AoE). The verb's element = the
loaded spell element, re-skinning spark + damage type. This is the WILDHEART move exactly — the same
two attack intents mean different things per active form/state, so there is no new menu, no new
hotbar slot, no mode UI. (v1 = HURL+SLAM; SURF is the 3rd verb, CUT to v2 — §10.)

## 5. The phantom LOOK = REFERENCE-LOCK DECISION (the VFX-discipline section)

The phantom must read as a HELD PROXY (temporary, kinetic), visually distinct from a placed voxel,
without breaking immersion. Reference options to LOCK with Kevin (Decision #1):
- **Color source:** exact `BLOCK_TYPES[target].color` vs a "kinetic tint" (block color blended toward
  white/violet for legibility).
- **Held treatment:** plain lit cube · semi-transparent · glowing rim (a single thin emissive shell,
  the proven WILDHEART layer recipe) · faint orbiting spark trail.
- **Element charge:** does a loaded element tint the held phantom (fire→amber, ice→cyan-frost), or is
  element purely an impact label (simpler)? (Default: impact-only for v1; visual charge is Decision #1.)
- **Impact spark per element:** spray vs arc vs spiral (reuse `triggerGPUSparks` types).
The look layers (M7) are gated on this lock; the mechanics (M1-M6) are blind-buildable NOW with a
placeholder cube.

## 6. FPV fit + spatial readability

The phantom orbits at R≈2.2m — OUTSIDE the nose-cam frustum so it never clips the camera (the FPV
camera is head-attached, Components.jsx; there is no shoulder-cam until the deferred S3 third-person
pivot). The horizontal swing + a small yOffset keep it readable as "left/right/forward of me" and as
a HURL aim reference (the block points where the camera points). This is the FPV STRENGTH the seed
calls out: an orbiting block is more FPV-friendly than a body-avatar. Honest weakness: a 2.2m orbit
trades some "intimate grab" feel for clip-safety; if it reads floaty, the v2 third-person pivot fixes
it — VOIDHAND does NOT block on it.

## 7. God-file extraction seams (where the SM lives)

| System | File | Role |
|---|---|---|
| pure grab SM | `src/game/voidhand.js` (NEW) | `makeGrabState`, `decideGrab(sm, ctx)` — charge/hold/release/cooldown, pure, unit-tested (twin of beastTransform.js) |
| grab data + tuning | `src/game/voidhandData.js` (NEW) | orbit R/speed/yOffset, hurl/slam damage mult, wall-hit range/bonus, phantom color map (twin of beasts.js) |
| kinetic economy | `src/game/kinetic.js` (NEW) | bank/spend/clamp + `canGrab` (twin of ferocity.js) |
| phantom lifecycle | `src/game/voidhandPhantom.js` (NEW) | pure spawn/orbit-pos/release/recycle helpers (no Rapier in the math) |
| phantom render+physics | `src/world/PhantomBlockSystem.jsx` (NEW) | cap-4 InstancedRigidBodies pool, kinematic orbit, dynamic-on-hurl (twin of BlockParticleSystem.jsx) |
| grab intent | `src/input/inputState.js` (EDIT) | add `'grab'` to INTENT_KEYS + the keyboard write |
| SM wiring + orbit loop | `src/Components.jsx` (EDIT) | subscribe to held-state, read `getInput().grab` transiently, drive the orbit + dispatch the HURL/SLAM actions in useFrame (the roar/beast wiring is the model) |
| hurl-on-mob impact | `src/SimplifiedNPCSystem.jsx` (EDIT) | a `hurtMobWithBlock(id, dmg, element, knockback)` helper reusing the :914 knockback nudge, decoupled from melee |
| talent gate node | `src/game/talentTree.js` (EDIT) | add effect-less `voidhand_grasp` to ASPECT_TREES[0] |
| store fields | `src/store/useGameStore.jsx` (EDIT) | `voidhandHeld`, `heldPhantom`, `kineticBanked` + setters + save/load + autosave-diff |

## 8. (folded into §7)

## 9. The static gate (machine-checkable no-update_block-in-combat)

A new `tests/gates/voidhand-noremesh-gates.test.js`, cloned from `beast-noremesh-gates.test.js`:
`FORBIDDEN = /setWorldBlocks|terrain\.worker|createChunk|setBlock|postMessage|update_block/`. Assert
that `src/game/voidhand.js`, `voidhandPhantom.js`, `voidhandData.js`, `kinetic.js`, and
`src/world/PhantomBlockSystem.jsx` match ZERO forbidden seams. (The CALM real-edit grab, if shipped,
lives in the Terrain.jsx build path — already out-of-combat — and is NOT in these gated files.) The
gate runs in `npm run test:unit` and the pre-commit hook; a future edit cannot silently re-introduce
a combat re-mesh.

## 10. What to CUT for a shippable v1

- **SURF** (the 3rd verb, JUGGERNAUT charge-dash wrecking-ball) → v2. Most complex (movement-velocity
  override + invulnerability + held-block dash physics) and the kid-safety risk (Marcus spamming a
  damage-immune escape). v1 = HURL + SLAM only.
- **Element-charge VISUAL** on the held phantom → v2; v1 applies element only at IMPACT (spark + damage
  type), no held tint.
- **CALM real-edit grab** (the literal "bank a real block in the day") → OPTIONAL for v1; the combat
  phantom IS the load-bearing path. v1 can ship combat-phantom-only and add real-edit calm-grab in a
  follow-up (it's the lower-risk half — out of combat, no perf gate).
- **Multi-grab / dual-orbit** → never v1 (single phantom, one `heldPhantom`).
- **Ballistic arc / ricochet hurl** → v2; v1 hurl is straight camera-forward.
- **HURL player-recoil** (applyImpulse on self) → defer; nice-to-have, not load-bearing.

## 11. De-risk order (hardest-first, WILDHEART model)

M0 reference-lock → then HARDEST FIRST: prove no-re-mesh + the FPS budget BEFORE building the verbs
(exactly like WILDHEART proved the transactional collider-swap + the M2 bull FPS gate before the
look). The real iPad FPS gate (M2) and the no-re-mesh static gate (M1) front-load the two risks that
could kill the feature; the FPV-feel playtest (M3) front-loads the "is it actually fun" human gate.

## 12. Milestone breakdown (M-by-M, TDD red-first)

| M | Title | Gate (RED→GREEN) |
|---|---|---|
| M0 | Reference-lock + seam-map presentation | Kevin signs Decision Batch §13 + the phantom-look ref-lock. NO code. |
| M1 | Grab SM + phantom spawn (combat) + NO-RE-MESH static gate | `voidhand.js` SM unit-tested; cap-4 phantom spawns + orbits a placeholder cube; **static gate (§9) green** — zero voxel seams in the gated files. |
| M2 | Real-device FPS gate (hardest perf risk) | iPad siege capture: grab → orbit 3s → hurl → impact-burst, FPS delta vs S2-A baseline ≤ the agreed budget (Decision #5). If over: kinematic-only / sphere-collider / sensor levers. |
| M3 | HURL + SLAM mechanics + impact + element + FPV-feel playtest | hurt-mob via the knockback nudge; element re-skins spark+damage; Kevin plays it in FPV and signs "the aim feels learnable" (human gate). |
| M4 | Base-as-anvil bonus + kinetic meter + talent gate + autosave + HUD | wall-hit 3× unit test (next-to-wall vs open-air) + one-shot guard; `voidhand_grasp` gates entry; `kineticBanked` persists + autosave-diff; provisional HUD bar. |
| M5 | Element-charge transparency | all 4 elements re-skin HURL+SLAM impact correctly (spark color + damage type); no desync on mid-hold spell-switch. |
| M6 | Phantom-pool eviction safety + UX | held-phantom pinned (never evicted); cap-full blocks a new grab with a soft sfx; debug HUD pool readout. |
| M7 | The LOOK (phantom rim/glow + impact + wall-hit flash) | re-baseline M1/M4 provisional frames; phantom reads as a held proxy; capture-deterministic. |
| M8 | Content-variety enumeration | grab phantoms of 8+ block types — distinct color + readable per type; HURL vs SLAM feel-distinct (not two flavors of one verb). |

Seq: M0 → M1 → **M2 (perf gate BEFORE verbs)** → M3 → parallel(M4-M6) → M7-M8 on the look-lock.
Each milestone: superpowers `writing-plans` → subagent-driven (implementer + spec-review +
code-review), TDD red-first, human-reviewed, then merged. 4-piece + pre-compact-flush per checkpoint.

## 13. KEVIN DECISION BATCH (the genuine taste/vision decisions to surface at the gate)

1. **Phantom look reference-lock** (HARD GATE — blocks M7): color source (exact block vs kinetic
   tint), held treatment (plain / transparent / rim-glow / spark trail), element held-tint (yes/no),
   impact spark per element. Rec: rim-glow + exact-color-with-faint-violet-tint; element impact-only in v1.
2. **Kinetic economy**: accrual rate, GRAB_COST, KINETIC_MAX, dawn-reset (50% vs full, like Ferocity),
   does death bleed it. Rec: mirror Ferocity (full dawn-bleed, no death penalty) for consistency.
3. **Base-as-anvil tuning**: 3× total only, or +stun? Does the wall take damage/deteriorate on use?
   Rec: 3× + brief stun, walls PRISTINE in v1 (rewards day-building directly; deterioration is a v2 lever).
4. **Combat-context predicate**: `!isDay` (any night) vs `!isDay && activeHostiles>0` (only when mobs
   are actually present). Rec: `!isDay` for v1 simplicity (resolves the dangerLevel contradiction in §0).
5. **M2 FPS target**: the pinned number on a mid-iPad (absolute 60/45 fps OR a delta from the S2-A
   baseline)? Rec: match the WILDHEART M2 methodology (delta-from-baseline).
6. **Grab keybind**: ✅ RESOLVED 2026-06-09 → **`KeyV`** (Kevin flagged `KeyG` = open-chest/trade `InputManager.jsx:162`; keymap audit: A/B/C/D/E/F/G/Q/R/S/T/U/W all bound; free = V/X/Z/H/N; grab = `KeyV`, mnemonic "Void"). Grab is keyboard-only, does NOT touch the mouse place/break (which own building); the orbit verbs reuse the existing attack/cast inputs.
7. **SURF in or out of v1?** Rec: OUT (v2). Confirm.
8. **CALM real-edit grab in or out of v1?** Rec: OUT (combat-phantom-only ships the fantasy); add the
   calm real-edit half as a fast follow. Confirm.

## 14. Risks + mitigations

| Risk | Mitigation |
|---|---|
| RE-MESH DEATH (combat grab edits a voxel → whole-chunk re-mesh → frame stall) | Combat branch never holds a worker handle + the §9 static gate (clone of the proven beast gate) + the `!isDay` runtime branch. |
| Perf: kinematic phantom AABB + broad-phase under siege | M2 real-iPad gate BEFORE verbs; levers: single phantom (already), sphere collider, sensor-only (callback, no solve). Orbit is a kinematic write, not a constraint solve (§0.3). |
| Phantom pool eviction mid-hold | Separate cap-4 pool + held-phantom PINNED + cap-full blocks a new grab (M6); unit test "hold → evict an unrelated phantom → held survives". |
| Base-as-anvil never fires (walls sparse / siege spawns far) | M3 forced-wall playtest confirms it fires; HURL is still a useful ranged knockback WITHOUT a wall (the bonus is additive, not load-bearing for the verb's baseline value). |
| FPV clip / floaty feel | R≈2.2m orbit outside the nose frustum; honest that the intimate feel waits on the S3 third-person pivot — VOIDHAND does not block on it. |
| Friendly-fire / kid-safety | v1: HURL/SLAM hit mobs only, no player self-damage, no AoE on passive mobs beyond the existing knockback; SURF (the immunity escape) CUT to v2. |
| Double-count on bounce | one-shot lastBonusFrame guard per mob per hurl (M4 unit test). |
| Capture flakiness | combat grab suppressed in capture unless a dedicated seed; phantom orbit phase frozen on `isCaptureMode()`; phantom-source is deterministic (looked-at block, no random fallback). |
| Held phantom as pseudo-storage across day→night | max-hold timer auto-drops the phantom; a combat phantom is never a real block, so nothing persists. |

## 15. Next step

Present this to Kevin → lock Decision Batch §13 (esp. #1 the look, #4 the combat predicate, #5 the
FPS target, #7/#8 the v1 cuts) → `writing-plans` for M0→M1 → subagent-driven build, hardest-first.
