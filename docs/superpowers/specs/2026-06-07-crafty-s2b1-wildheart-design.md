# Crafty S2-B1 — WILDHEART (beast-transform Aspect) — design of record

> **Status:** DESIGN **v2 (reconciled)** — awaiting Kevin's spec review (the master-plan HARD GATE: no WILDHEART implementation before this is approved). The LEAD Aspect, locked with Kevin in `docs/superpowers/specs/2026-06-02-crafty-s2-game-design-design.md` §4 (S2-B1). This spec folds five code-seam maps (Player/collider, attack-intents/elements, VFX/bloom/capture, day-night/siege/HUD, save/talent/store) + live 2026 research (Rapier collider hot-swap; bloom-surviving stylized morph VFX) + a 3-lens adversarial review pass into the buildable design of record.
>
> **Prerequisite:** S2-A is merged (the signature-agnostic foundation — dodge i-frames, melee cone, persistence, wired talent trees, the day/night siege loop, the input-abstraction layer, a real FPS number). WILDHEART edits the systems S2-A establishes; it does not stand alone.
>
> **Two-layer deliverable discipline (the load-bearing frame of this spec):** WILDHEART splits cleanly into **(A) autonomously-buildable mechanics** — the transactional collider hot-swap, the transform state machine, the Ferocity meter, the combat re-skin, the talent nodes, persistence — all TDD-gated and machine-checkable; and **(B) the SIGNATURE LOOK** — the beast morph VFX + the 4 beast visual forms — which is a **reference-LOCK + in-world Kevin decision, NOT a blind build** (VFX discipline locked 2026-06-07). The spec keeps these two layers explicitly separated at every milestone.

---

## 0. Review reconciliation (provenance, honest)

This is **v2**, reconciled from a synthesized draft + 3 adversarial reviews (perf/invariant · VFX-discipline · scope/coherence). The synth draft was architecturally sound and seam-accurate (all three reviewers praised the grounding, the two-layer mechanics/look split, and the swap-first sequencing), but it had real defects. The **4 blocking defects corrected here:**

1. **Death-restore was wired to the WRONG transition** (CONVERGENT, R1+R3) — the no-permanent-beast restore was on the respawn edge (`isAlive` false→true) instead of the death edge (true→false), which would leave a kid in beast-form through the entire soft-death screen (violating the Marcus-floor + the core invariant). **Now: restore fires on the death edge** (§3a/§3b/§3f).
2. **Ferocity accrual stomped the already-owned single-writer `onMobKill` slot** (CONVERGENT, R1+R3) — a 2nd registrant would silently break quest kill-tracking. **Now: a store-level kill-event fan-out emitter** (the Aspect-meta scaffold) + a quest-kill regression test (new milestone M3.5, §3c/§6).
3. **The `wildheart_roar` unlock node would hard-crash `foldTalentEffects`** (R1) — the fold destructures `node.effect` unconditionally; an effect-less unlock node throws `TypeError` on every `getEffectiveAttributes()` call. **Now: fold tolerates effect-less nodes + an explicit node-shape contract** (§3e).
4. **The `roar` verb was claimed input-abstracted but would be wired imperatively** (R3) — the existing attack/cast intents are reserved-not-consumed; merely adding `'roar'` to `INTENT_KEYS` doesn't make it source-agnostic. **Now: roar is a real `useFrame` intent consumer** (§3b).

Plus 12 major + ~10 minor seam/persistence/atomicity/VFX corrections folded throughout (the live-collider load restore; the co-located swap+depenetration one-shot; the pinned atomicity site; `ferocityBanked` in the autosave-trigger; the capture-determinism contract; `restoreBaseController` resetting impulse/mass too; the §5 prior-miss forensic grounded in the already-shipped `SpellProjectileCore` recipe; the `captureStudio:false` wiring; the 120/call spark cap; the per-form locomotion table; the ferocity design token; the provisional-baseline split).

---

## 1. Goal

WILDHEART adds the first **Aspect** on top of the S2-A combat loop: **hold a roar → become an element-beast.** The currently-loaded spell element picks the form (fire→comet, ice→boulder-bull, lightning→hawk, arcane→golem); your two existing attack intents (melee cone + spell cast) **re-skin per beast** so skill transfers with zero new menu. A timed **Ferocity** meter banks during the day and unleashes in the night siege.

**What it adds to the loop.** S2-A makes Crafty a fun, cohesive, persistent action-RPG. WILDHEART is the first thing that makes a *build choice change how you fight* in a spectacular, clip-worthy way — and it does so by re-skinning verbs the player already knows, not by adding a parallel control scheme. It is the lowest-build-risk, highest-WOW validation that "an Aspect on S2-A = fun" (S2 spec §4, S2-B1), and it builds the **Aspect-meta scaffold** (a form-state authority + collider-swap pattern + a banked-resource meter + a kill-event fan-out) that VOIDHAND/SOULBIND/ELEMANCER reuse.

**Fun / clip metric (not a proxy).** A WILDHEART playtest passes when, without instruction, a player (and the 8-yo floor, Marcus) will: (a) **deliberately bank Ferocity in the day** to unleash a beast in the night siege ("save it for the big moment"), (b) **feel each of the 4 beasts as a different animal to pilot** — distinct in shape AND motion AND behavior, not a recolored capsule (the content-variety lens, S2 spec §7.7) — and (c) produce a **clip-worthy transform moment** in a normal session (the burst reads crisp + premium, not a bloom-blob). Machine-checkable proxies layer under each milestone (the transactional-restore unit tests, the no-re-mesh static gate, the boulder-bull real-device FPS number, the deterministic transform capture state) — because the only trustworthy verification surface is a harness that can go red (S2 spec §1).

**Marcus-floor (audience).** <60s legible, near-text-free, zh-CN-ready, joyful, kid-safe. The transform is a **high-reward power moment, never a penalty or lose-state**: no permadeath, no self-frustration trap. Beast form is a gift the player earns and chooses to spend, and exiting it (timer, death, manual) always returns safely — *immediately, at the death instant* — to the human you know.

---

## 2. Hard constraints honored — each mapped to a design choice

| # | Constraint | Design choice that honors it | Seam |
|---|---|---|---|
| **1** | **Game-loop isolation (CRITICAL)** | Beast-form state is read in `useFrame` **only via `getState()`/refs**, never a zustand subscription. The store fields (`beastFormActive`, `activeBeastForm`, `ferocityBanked`) are written **only on transitions** (roar-complete / form-exit / death / dawn). The collider swap is scheduled by a transition but **executed inside `useFrame`** (the one-shot swap-flag, §3a) so it never races the frame loop. | `Components.jsx:380-792` useFrame; `inputState.js:66` `getInput()` |
| **2** | **Single-writer** | ONE authority writes form state (`setBeastFormActive` sole writer; everything reads `isBeastFormActive()`, mirroring the verified `bossActive` value+getter at `useGameStore.jsx:352-354`). Kill events flow through a **single fan-out emitter** (§3c) — no 2nd `onMobKill` registrant. | `useGameStore.jsx:352-354`; new `emitMobKill`/`subscribeMobKill` |
| **3** | **Derive-never-bake** | Per-form damage/range/locomotion multipliers come from a static `BEAST_FORMS` table applied **at the read site**; talent bonuses fold through `foldTalentEffects` (`src/game/talentTree.js:51-62`) into `getEffectiveAttributes` (`useGameStore.jsx:135-138`). The persisted base capsule `[halfHeight 0.5, radius 0.4]` + base attributes are **never mutated** — form is a derived overlay. | `src/game/talentTree.js:51-62`; `useGameStore.jsx:135-138`; new `src/game/beasts.js` |
| **4** | **ZERO re-mesh** | WILDHEART touches **ZERO voxels**. Transform = `collider.setShape()` + a mesh-shell swap + particles — never a block edit. Asserted by a **static gate**: the beast module produces zero matches for `setWorldBlocks\|terrain.worker\|createChunk\|setBlock\|postMessage` (the last catches the `load_modifications` worker path). | static gate over the beast module + the swap site |
| **5** | **Input-intent gating** | The roar gates on an **abstract intent**: keydown/keyup call `setIntent('roar', …)` ONLY; the state-machine guard reads `getInput().roar` **transiently inside `useFrame`** (a real consumer, not an imperative trigger — deeper than the legacy reserved attack/cast intents). A future touch layer writes the SAME intent. | `inputState.js:37` `INTENT_KEYS`; `Components.jsx:318-378` listener + `:380+` loop |
| **6** | **Capture-determinism** | Every new VFX gates on `isCaptureMode()`; the morph capture state uses a **stable element-keyed seed** + a **frozen animation phase** (mirroring `uTime=-CAPTURE_SPARK_PHASE`) + a frozen dissolve clock; it registers **`captureStudio:false`** (in-world, not a sky-studio card) with a static gate enforcing that. The visual gate stays forced-`high`. | `src/devtest/captureMode.js`; `src/world/GPUSparkSystem.jsx:131-132`; `tests/gates/atmosphere-isolation-gates.test.js` |
| **7** | **Marcus-floor** | Transform = high-reward power moment, NO permadeath, NO self-frustration. The roar is a single hold-verb. **Death-in-form auto-exits to human at the death edge — before the soft-death screen** (never "you died as a scary thing you can't control"). zh-CN-ready (a meter + icon, no new text). | death-edge subscribe (§3a); HUD |
| **8** | **AST-safe / TDD / gates** | All `.jsx/.js` edits AST-safe (Edit only). TDD red-first per task. The deterministic visual + static gates must hold. No Claude commit footer. | project conventions (CLAUDE.md) |

---

## 3. Mechanics design (the autonomously-buildable, TDD part)

### 3a. The TRANSACTIONAL collider hot-swap + restore-invariant

**Research verdict (R1, all T1).** Rapier's JS `Collider` exposes `setShape(shape)`, `setRadius(r)`, `setHalfHeight(hh)` which **mutate the existing collider in place** — the handle and index 0 are preserved (`rapier.rs/.../Collider.html`; `collider.ts coSetShape`). `setShape` is officially hardened for runtime use (rapier.js CHANGELOG: "Add Collider.setShape" + "Fix a crash when calling collider.setShape"). The `KinematicCharacterController` stores **NO reference** to its collider — `computeColliderMovement(collider, …)` takes the collider as a **per-call argument every frame** — so there is **NO re-bind step** after a swap.

**Crafty already uses the swap-friendly pattern (verified live).** Player is `type="kinematicPosition"`, `colliders={false}`, a single static `<CapsuleCollider args={[0.5, 0.4]} />` (Rapier `CapsuleCollider` arg order is **`[halfHeight=0.5, radius=0.4]`** → 1.0 m capsule body — confirmed against `Components.jsx:808`), KCC built imperatively via `world.createCharacterController(0.05)` with autostep 1.05 / snap-to-ground 0.5 / 45° slope (`Components.jsx:151-164`), and the frame loop does `const collider = rigidBodyRef.current.collider(0); controllerRef.current.computeColliderMovement(collider, …, filterPredicate)` (`Components.jsx:693-701`). **Mutating that same `collider(0)` in place is a drop-in** — no JSX/`key`/`args` change, no remount.

**THE RULE: imperative live-mutate, never a React `key`/`args` remount.** Changing the `<CapsuleCollider>` `args`/`key` triggers a remount that destroys and recreates the collider (react-three-rapier `useChildColliderProps` recreates on dep change), losing the stable handle/index. So the JSX at `Components.jsx:801-809` stays **static**; the swap is purely imperative.

**The swap mechanism (executed inside `useFrame`, never in a subscribe callback).** A transition (roar-complete) sets a one-shot `pendingFormSwapRef`. The swap is **consumed inside `useFrame`** (atomicity, see below):
```
const rapier = useRapier();                                   // Components.jsx:144
const col = rigidBodyRef.current.collider(0);                 // Components.jsx:693
const form = BEAST_FORMS[activeBeastForm];                    // static table (src/game/beasts.js), derived from element
col.setShape(new rapier.Capsule(form.halfHeight, form.radius)); // in-place mutate; handle/index/groups/material preserved
```
Because `computeColliderMovement(collider(0), …)` re-reads `collider(0)` every frame, **the next frame automatically uses the new shape** — zero re-bind, zero voxel touch (constraint 4). `setShape`/`setRadius`/`setHalfHeight` mutate ONLY geometry; `collisionGroups`/`solverGroups`/friction/sensor/`activeHooks` are **preserved** (no re-author on swap). The kinematic player never sleeps → no `wakeUp()` concern (the pre-existing per-frame `wakeUp()` at `Components.jsx:398` is unrelated and not WILDHEART's concern).

**Atomicity — pin the consumption site (corrected).** Consume `pendingFormSwapRef` **immediately before the `:693 const collider = rigidBodyRef.current.collider(0)` read, AFTER all early-returns** (capture-mode early-return, hitstop, `!controllerRef.current`) — so a frame that skips `computeColliderMovement` also skips the swap (kept paired; a pending swap is never stranded by an early-return). Integration test: the swap and the first post-swap `computeColliderMovement` happen in the same frame.

**Grow-depenetration — co-locate, never race (corrected).** Enlarging the capsule near ground/walls can leave it intersecting geometry. Do **NOT** write `setNextKinematicTranslation` from a subscribe callback — the frame loop writes it every frame (`Components.jsx:706-712`) and would clobber it. Instead, in the SAME one-shot block (right after `setShape`, before the sweep): compute the half-height/radius **depenetration delta**, add it to `currentPos`, and let THIS frame's single `computeColliderMovement` + `setNextKinematicTranslation` carry both the nudge and the corrected movement. Rapier's broad-phase (0.27 BVH) optimizes large colliders, but a bigger AABB still produces more candidate pairs (the FPS gate, M2). Test: enter bull on ground ⇒ `translation.y` rises by the half-height delta, no penetration, no void-guard trigger.

**Restitution is NOT a kinematic-character property (R1, T1).** A kinematic character body has no restitution behavior (the KCC offset gap prevents real solver contacts). The boulder-bull's "bounce" is authored as **movement/VFX feel**, not a Rapier restitution number. If the bull must SHOVE dynamic debris, use `characterController.setApplyImpulsesToDynamicBodies(true)` + `setCharacterMass(bullMass)` — the only way a kinematic character imparts force to dynamics (Kevin Decision #6; FPS-gated on M2).

**THE TRANSACTIONAL RESTORE-INVARIANT — `restoreBaseController()` (the spec's hardest part; the no-permanent-beast bug).** A single helper resets BOTH **(a) the shape** (`setShape` back to base `[0.5, 0.4]`) **AND (b) the controller config** (`setApplyImpulsesToDynamicBodies(base=false)` + `setCharacterMass(base)`) — because the controller is a SINGLE shared instance (`controllerRef.current`, created once at `Components.jsx:154-158`) reused for all forms + human; restoring only the shape would leak the bull's shoving + heavy mass into the human and the next form (same permanent-beast class, different field). `restoreBaseController()` is called on **EVERY exit path:**

- **death** — the form authority **subscribes to `isAlive` and fires EXIT + `restoreBaseController()` + `setBeastFormActive(false)` on the TRUE→FALSE edge** (`damagePlayer`, `useGameStore.jsx:635-636`), mirroring the App.jsx:165 prevS-diff pattern (`if (!s.isAlive && prevS.isAlive) exitForm()`) — **BEFORE the soft-death screen** (constraint 7). The respawn-block restore (`Components.jsx:212-221`, false→true) is kept ONLY as an idempotent defense-in-depth backstop.
- **form-timer-end** (duration expiry),
- **manual exit** (roar/cancel input),
- **same-session load** — `loadWorldData` (`useGameStore.jsx:~756-794`) imperatively `setTranslation`s the LIVE body but never `setShape`; add `restoreBaseController()` to its imperative tail (after the setTranslation, guarded on `rigidBodyRef.current.collider`) so a quit-to-menu-mid-form → load re-shapes the live collider (the store flag alone does not — the collider is imperative live state, not store-derived),
- **reload/fresh mount** — `loadWorldData` never restores `beastFormActive` → defaults false → the static `<CapsuleCollider args={[0.5,0.4]}>` mounts as base,
- **error/catch** — any throw in the form path restores,
- **component unmount** — alongside the KCC `removeCharacterController` cleanup (`Components.jsx:159-162`).

Single-writer (constraint 2): only the form authority may mutate collider shape / controller config. **TDD red-first (M1):** enter → (death | same-session-load | save | error | timer-end | unmount) ⇒ assert (a) `collider(0)` is base dims, (b) controller `applyImpulses`/mass are base, (c) `isBeastFormActive()` false, (d) `collider(0).handle` unchanged across the cycle, (e) voxel chunk count + draw calls unchanged. The death test asserts restore fires **before** respawn (at the dead-but-not-respawned state). A 1000-enter/exit stress asserts handle stability + chunk count never moves.

**FPS de-risk (R1; M2 gate).** The bull's cost = a larger swept AABB → more broad-phase pairs + more expensive autostep/snap shape-casts, plus (if `applyImpulses` on) the per-contact impulse solve. Mitigation: tune `collisionGroups` to shrink the bull's filter set; keep autostep sane for the larger shape; restitution is not the lever. **M2:** a real-device FPS capture on the largest (bull) capsule, `applyImpulses` toggled, near a dense cluster, with the pass criterion a **human-baseline delta** (bull vs base capsule) against the pinned S2-A FPS target — **before** the other 3 beasts are built.

### 3b. The transform STATE MACHINE (single-writer, real intent consumer)

A 4-state machine, owned by the single form authority, gated on the abstract `roar` intent consumed in `useFrame`:

```
HUMAN ──(roar held + ferocity≥threshold + unlocked + alive + no modal)──▶ ANTICIPATION
ANTICIPATION ──(hold completes, charge window)──▶ [BURST flash masks swap] ──▶ ACTIVE(beastForm)
ANTICIPATION ──(release early / cancel)──▶ HUMAN  (no transform spent)
ACTIVE ──(duration timer end | death | manual exit | dawn boundary)──▶ EXIT
EXIT ──(restoreBaseController + reset)──▶ HUMAN
```

- **Roar = a REAL intent consumer (constraint 5, corrected).** keydown/keyup call `setIntent('roar', true/false)` ONLY (no direct trigger). The guard reads `getInput().roar` **transiently inside `useFrame`** (`Components.jsx:380+`, where it already reads `getState()`). Add `'roar'` to `INTENT_KEYS` (`inputState.js:37`) + an `inputState.test.js` case. Do NOT cite the legacy reserved F-key melee as a correctness precedent — roar is the deeper (correct) abstraction.
- **Guard condition (enumerated, testable).** Enter iff: `getInput().roar` held **AND** `getInput().active` **AND** `get().unlockedTalents['wildheart_roar'] > 0` (§3e) **AND** banked Ferocity ≥ threshold (§3c) **AND** `get().isAlive` **AND** no modal open — concretely `!showInventory && !showCrafting && !showMagic && !showBuildingTools && !showSettings` (enumerate, no ellipsis). The roar handler is the **sole writer** to `beastFormActive`.
- **Element → form pick.** At commit, read `get().activeSpell` (the form-picker single-writer; written by `InputManager.jsx:126-129` on Digit1-4, read at `useGameStore.jsx:455-456`): fire→comet, ice→boulder-bull, lightning→hawk, arcane→golem (`BEAST_FORMS`, `src/game/beasts.js`). `activeBeastForm` is set in the same transition.
- **Game-loop isolation (constraint 1).** Per-frame work (duration countdown, ACTIVE-state guard) is a transient `getState()`/ref read inside `useFrame`. The state *transitions* are the only zustand `set()` calls; the collider swap is scheduled by a transition but executed in the `useFrame` one-shot block (§3a) — never per-frame, never a subscription read in the loop.
- **Capture-determinism (constraint 6, pinned).** The morph capture state `spawnBeastTransform` uses: (1) a STABLE element-keyed seed `beast-transform-${activeBeastForm}` (not a global/wall-clock counter — identical across runs + per-form reviewable), (2) a FROZEN animation phase under `isCaptureMode()` (mirror `uTime=-CAPTURE_SPARK_PHASE`, `GPUSparkSystem.jsx:131-132`), (3) a frozen dissolve clock, (4) **`captureStudio:false`** (in-world Caribbean context, NOT a sky-studio card) — enforced by a static gate mirroring `tests/gates/atmosphere-isolation-gates.test.js` asserting the hook does NOT set `captureStudio:true`.
- **Input cleanliness + dodge preservation.** On EXIT, `setIntent('roar', false)` + a `formCooldownRef` gate prevents instant re-trigger. Dodge i-frames (`dodgeStateRef`, `Components.jsx:175-183`) are **preserved across the transition** (no invincibility break) and **reset clean on EXIT** (no i-frame carryover into human).

### 3c. The FEROCITY meter (bank in day / spend in siege) + a kill-event fan-out + HUD via StatBar

- **Store slice.** Add a sibling to the `nightCount` slice (`useGameStore.jsx:526-527`): `ferocityBanked: 0` + `setFerocityBanked(n)` + `accrueFerocity(delta)` (the single writer, **clamped `[0, FEROCITY_MAX]`** at the write site). `ferocityBanked` is **PERSISTED** (§3f); `beastFormActive`/`activeBeastForm` are **transient**.
- **Kill-event FAN-OUT (the corrected single-writer scaffold — new milestone M3.5).** `onMobKill` is a ONE-SLOT store field (`useGameStore.jsx:309-310`) ALREADY owned by QuestSystem (`QuestSystem.jsx:324`); the kill path is `SimplifiedNPCSystem.jsx:~927-952` → `store.onMobKill(type,pos)` at **~L951** (NOT the L544-567 spawn block). A 2nd registrant = last-writer-wins, silently breaking quests. **Fix:** replace the single slot with a fan-out — `subscribeMobKill(cb)→unsub` + `emitMobKill(type,pos)` that the single kill-path calls; migrate QuestSystem onto it; ferocity subscribes too. This is the Aspect-meta kill-event scaffold (VOIDHAND/SOULBIND reuse it; SOULBIND captures mobs on it). Ships with a **quest-kill regression test** (quests still count kills post-migration).
- **Accrual (day-only, single-writer, capture-guarded).** Ferocity accrues on **mob kill during day**: a fan-out subscriber calls `get().accrueFerocity(...)` reading `get().isDay` transiently (`useGameStore.jsx:517`) — banks only in daylight — guarded with `isCaptureMode()` (baselines don't drift), and runs **before** the player-health check so a kill coinciding with player-death still counts. Recommend **KILLS-ONLY with per-tier scaling** (pig=1, zombie=5, …, boss=50) for the most legible reward loop (Kevin Decision #2).
- **Day→night semantics (concrete).** Banked Ferocity is **permission to transform during the siege** (the §3b gate). Recommend **bleed-to-zero at dawn** inside `useSurvivalMode`'s `!prevIsDay && isDay` dawn branch (`AdvancedGameFeatures.jsx:32`), **before** the dawn-reward emission (`:33-44`) — so it does not carry across nights (no second-night spike) and never accidentally triggers a transform on reload. Form **duration** is a separate fixed timer ("meter = permission, timer = duration"). Reset semantics are Kevin Decision #2.
- **Persistence + autosave-trigger (corrected).** `App.jsx:165-178` triggers autosave only on level/equipment/chests/talentPoints/gameMode/worldBlocks/inventory/questState — pure ferocity accrual triggers none, so add `|| s.ferocityBanked !== prevS.ferocityBanked` to the diff (kills are discrete → isolation-safe). Persist via `buildSaveData`'s progression slice (`src/game/saveSchema.js:27-43`, mirroring `nightCount`/`lastRewardedNight`) + re-clamp+round on load.
- **HUD (transient-read + a real token).** Add a 4th `StatBar kind='ferocity'` after the hunger bar (`src/HUD.jsx:330-334`). **`StatBar`'s `FILL`/`ICON_COLOR` maps are CLOSED** (`src/ui/primitives/StatBar.jsx`): an unknown kind falls back to `bg-accent` (GOLD = the XP bar — the worst collision). So this requires a **new `'ferocity'` design token** via the bold-flat SoT chain (`src/theme/tokens.js` → `src/theme/cssVars.js` `--ui-*` → `tailwind.config.cjs`) + entries in BOTH maps — not a bare hex (Kevin Decision #7: distinguishable from the health bar AND the fire-spell color). The bar **subscribes only on transitions** (narrow selector / `getState()` on significant change), never per-frame (isolation). Shows "ready to roar" when banked ≥ threshold in the day; "unleashed" when a form is ACTIVE.

### 3d. Beast-form combat RE-SKIN of the 2 attack intents (zero new menu) + locomotion re-skin

**Attack re-skin — ALL sites enumerated.** The plumbing is reused unchanged; only damage/range/feel/spark-type re-skin per form, keyed off `isBeastFormActive()` at each trigger:
- **Melee** (`triggerMeleeAttack()`, `Components.jsx:223-295`; also the mousedown melee at `:355`): before the cone-test, if `isBeastFormActive()`, route damage through the per-form profile. The cone geometry (`isPointInCone`, `src/combat/cone.js:25-51`) is **reused as-is** — recommend all 4 beasts keep the SAME range (4.5) + arc (π/2) as human melee so boss/mob hit-reg is unchanged; only **damage multiplier + spark type** differ (Kevin Decision #5 on whether to also vary range/arc/cooldown). Damage flows through `solveMeleeDamage` (`src/utils/combat.js:1-14`) via `getEffectiveAttributes()` × the form multiplier (derive, constraint 3). Call `triggerGPUSparks(pos, color, count, type)` with the form's element (`src/world/GPUSparkSystem.jsx:115-195` already branches velocity on type — reuse).
- **Spell cast** (`triggerSpellCast()`, `Components.jsx:298-312`; also the **continuous held-F cast** at `Components.jsx:768-783`): **no new plumbing** — both read `activeSpell`, so `castSpell` → `createSpellImpact` → element-typed sparks re-skin transparently; the WILDHEART stat bonus is transparent via `getEffectiveAttributes()` in `solveSpellDamage` (`src/utils/combat.js:16-34`).
- Re-skin scope lives in the `BEAST_FORMS` table (`src/game/beasts.js`), derived on read.

**Locomotion re-skin (the MOTION half of distinctness — corrected).** "movement feel" needs a real seam: the per-form locomotion multipliers live in `BEAST_FORMS` (`moveSpeed`, `turnRate`, `jumpImpulse`/`gravityScale`) and are applied in the SAME `Components.jsx` `useFrame` block as the collider swap (the velocity/movement math). **Hawk is resolved to "fast, low-gravity hops / agile ground skirmisher"** (per-form `gravityScale`/`jumpImpulse` on the kinematic body) — **NOT true flight**, which fights the KCC snap-to-ground (0.5); true flight is explicitly OUT-OF-SCOPE (S3+). A **MOTION gate** beyond the still-frame grayscale test: a per-form locomotion-param assertion + a short motion clip for human review (so 4 differently-shaped-but-identically-handling capsules can't pass — the sampler-trap at the feel level).

### 3e. SIGNATURE wildheart talent nodes (derive via foldTalentEffects; effect-less-node contract)

The wildheart tree (`src/game/talentTree.js:18-25`) has 3 **stat nodes** (Beast Vigor +3 STR, Feral Swiftness +4 AGI, Blood Frenzy +3 AGI). WILDHEART **adds SIGNATURE nodes** to `ASPECT_TREES[1].nodes`:
- **Node-shape contract (corrected — prevents the hard crash).** `foldTalentEffects` (`src/game/talentTree.js:58`) currently destructures `node.effect` UNCONDITIONALLY → an effect-less node throws `TypeError` on every `getEffectiveAttributes()` (combat + load). **Fix the fold to tolerate effect-less nodes:** `if (!node || rank <= 0 || !node.effect) continue;`. Author the explicit contract: signature/unlock/ability nodes MAY omit `.effect`; the fold skips them; **ability-tuning levers** (duration/cooldown/accrual-rate) read `unlockedTalents['…']` rank at THEIR OWN site (the meter math / the duration timer), NOT the stat-fold. Add a fold-tolerance unit test (an unlock node present ⇒ `getEffectiveAttributes()` does not throw). `TALENT_LIMITS` (`.limit`) + `refundUnknownTalents` (the map) are unaffected. (This edits a shared pure module — flagged.)
- **`wildheart_roar` (Primal Roar)** — `limit: 1`, `prereq: 'wildheart_vigor'`, **no `.effect`** (a pure unlock). The roar handler reads `get().unlockedTalents['wildheart_roar'] > 0`. `unlockedTalents` already persists (`src/game/saveSchema.js:34`) — no new store/schema field.
- **Optional tuning nodes** (Kevin Decision #4): e.g. Ferocity-accrual-rate or form-duration — these read rank at the relevant math site (not the fold).
- **Migration safety.** `refundUnknownTalents` (`src/game/talentTree.js:64-73`) refunds-and-drops stale ids; a future rename of a signature id would drop the unlock + refund points unless a remap table is added to the migration — add that seam when/if ids change.

### 3f. Persistence (what persists vs transient; the NO-permanent-beast invariant)

| Field | Persist? | Where | Load behavior |
|---|---|---|---|
| `ferocityBanked` | **YES** | `buildSaveData` progression slice (`src/game/saveSchema.js:27-43`), one line beside `nightCount` | restored, **re-clamped `[0,MAX]` + rounded** (no float-bloat) |
| `unlockedTalents['wildheart_roar']` | **YES** (already) | `src/game/saveSchema.js:34` (no change) | auto-restored via the talents map |
| `beastFormActive` / `activeBeastForm` | **NO (transient)** | — | `loadWorldData` **never sets them** → default false/null → loads as HUMAN. |
| collider shape + controller config | **NO — but IMPERATIVE, not derived** | — | the static `<CapsuleCollider args={[0.5,0.4]}>` mounts base on a fresh mount; on a **same-session no-remount load**, `loadWorldData` must call `restoreBaseController()` (§3a) — clearing the store flag does NOT re-shape the live collider. |

**The no-permanent-beast invariant** is the union of: form state never persists active + `restoreBaseController()` on the death edge AND in `loadWorldData`'s imperative tail AND on EXIT-before-save. **TDD:** "load while in beast form (same session) → human, base capsule, base controller config, `isBeastFormActive()` false." The save guard already skips persist in capture mode (`saveActiveWorld`, `useGameStore.jsx:801-807`).

---

## 4. The 4 beasts — distinct in SHAPE + MOTION + BEHAVIOR (not a color-swap)

The content-variety lens (S2 spec §7.7): N instances must be **genuinely distinct in shape / motion / behavior / feel** — not stat/color swaps. Research R2: distinctness lives in **PROPORTION/MASS/POSE + MOTION ARC, not surface color** (the silhouette test; shape language: triangle=speed/danger, square=stability/power, round=soft). Element color is the **LAST identifier, never the first.** Each beast = a different mass-silhouette (real `setShape`) + a different **locomotion profile** (real `BEAST_FORMS` moveSpeed/turnRate/gravity, §3d) + a behavior hook:

| Beast | Element | Silhouette | Collider (`setShape`) | Locomotion (real params) | Melee re-skin | Behavior hook |
|---|---|---|---|---|---|---|
| **Comet** | fire | small, triangular, forward-leaning dart + dissolve tail | thin/short capsule | fast moveSpeed, high turnRate, snappy | fast low-cooldown swipes, crit-leaning (Feral Swiftness synergy) | glass-cannon dash — opposite of the bull on every axis |
| **Boulder-bull** | ice | heavy, square, low, wide | **fattest/shortest** (FPS target) | slow moveSpeed, low turnRate, authored bounce-feel; optional debris-shove (Decision #6) | wide slow high-impact armor-pen swing | the only form that shoves dynamics |
| **Hawk** | lightning | thin, angular, aerial-read | thin/tall capsule | **low gravityScale + high jumpImpulse = fast hops** (NOT flight); agile reposition | fast skirmish strikes (same cone range for hit-reg parity) | vertical/agile identity vs the grounded bull |
| **Golem** | arcane | tall, blocky, monolith + rune-decal accents | tall/wide capsule | slow moveSpeed, deliberate, heaviest | slow stun-leaning heavy blows | siege monolith — slow like the bull but vertical + control-flavored |

**The sampler-trap defense (now two-axis):** 4 mass-shapes (collider geometry actually differs) **+ 4 locomotion profiles** (moveSpeed/turn/gravity actually differ) + 4 behavior hooks (crit / shove / agile-hop / stun). The **grayscale-silhouette gate** (R2 silhouette test) is a per-beast review artifact: **ONE side-by-side desaturated sheet** of the 4 beast frames aligned (per the HD-tile/exhaustive-walk discipline) — identifiable from outline alone; if they only separate by hue, re-shape, don't re-tint. **The MOTION gate** (§3d) catches identical handling the still-frame can't. Exact collider dims, per-form numbers, and combat-differentiation depth are Kevin Decision #5.

---

## 5. SIGNATURE LOOK = REFERENCE-LOCK DECISION (the VFX-discipline section)

> **🔒 LOCKED (Kevin 2026-06-07): the look of record = "Hades silhouette + Genshin radiance, fused" at glow-level ③·5** (a notch hotter than the b8 mockup). Crisp ink silhouette (body fill NEVER blooms — carries identity) + a wide soft back-aura + a brighter tight aura + a glowing core/accents (only these clear the bloom threshold). This is the already-shipped `SpellProjectileCore` recipe (`src/EnhancedMagicSystem.jsx:708-830`), so it's proven on our renderer. Reference mockups (gitignored): `.superpowers/s2b1-wildheart-refs/mockup-b9.png` (LOCKED) + `mockup-b7.png` (the glow dial: ①core-only→③·5 locked→④ blob). **M0 = DONE.** The exact aura opacity (~0.85 tight + ~0.55 wide in the mock) is the one dial nudged against a real in-game frame at M7, judged in-world.

**This look is NOT to be blind-built.** Per the VFX discipline locked with Kevin 2026-06-07: the game's strong global Bloom (`luminanceThreshold ~1.0`, intensity 0.8→2.4 spike, Neutral/Khronos tone-mapping — `GameScene.jsx:850-887`) turns ANY bright additive emissive into a **soft fuzzy blob**; fighting it with brightness/HDR numbers just resizes the blob. **Crispness comes from silhouette/shape/contrast, not brightness.** The beast morph LOOK is a **reference-lock + Kevin-collaboration decision, judged in-world** (real bright-Caribbean context, NOT a sky-studio frame).

### 5a. Prior-miss forensic (the corrected, honest diagnosis — do this BEFORE M0)

The layered-emissive "contract" is **already shipped** and was in production WHEN the loot-VFX miss happened — so the miss was NOT a missing technique. `SpellProjectileCore` (`src/EnhancedMagicSystem.jsx:708-830`) already builds (1) a per-element silhouette mesh, (2) a tight near-white HOT CORE (`toneMapped={false}`, blooms past `luminanceThreshold 1.0`), (3) a soft outer glow — all capture-frozen at a flattering phase; its header (`:578`) already reasons about blooming "into a glowing heart." **The actual prior miss** (the loot beam, `src/SimplifiedNPCSystem.jsx:~1269-1278`) is a cylinder with `meshBasicMaterial` additive blending, **NO `toneMapped={false}`**, emissive clamped 0-1 by the Neutral tone-map ⇒ it likely **never clears `luminanceThreshold 1.0`** and reads as a flat dim wash — a **different root cause** than a "double-soft-glow." **So §5's build instruction is: apply the ALREADY-PROVEN `SpellProjectileCore` recipe (cite `src/EnhancedMagicSystem.jsx:708-830`) to the beast shell** — not a research-novel contract. Read both side-by-side at M0 and state the delta.

### 5b. The LAYER CONTRACT (grounded in the proven in-repo recipe)

Three separable layers with explicit bloom intent (per-material bloom: a material blooms only if its color exceeds 0-1 AND `toneMapped={false}`):
1. **SILHOUETTE / SHAPE layer** — the beast mesh-shell + a dissolve-reveal + an element-colored Fresnel RIM, kept `toneMapped` (sub-1.0) so global Bloom **never touches it** — the crisp identity layer (high rim power = sharp edge; pulse for the charged state).
2. **HOT-CORE layer** — a **tiny** core, authored as the proven **additive near-WHITE stack** (`#FFFFFF`, opacity 1, `toneMapped={false}`) — like `SpellProjectileCore`, NOT a literal `>1.0` color value (the material clamps it anyway). Let the **existing global Bloom pass BE its halo** — do NOT also author a soft glow sprite (double-soft = blob, the anti-pattern).
3. **BURST / MASK layer** — a sub-100 ms opaque screen-space + radial element FLASH that hides the collider/mesh swap frame, plus crisp spark shards. **Spark budget is 120/call** (`triggerSparkBurst` caps at `Math.min(count,120)`, `src/world/GPUSparkSystem.jsx:135`; the 1200 `MAX_SPARKS` is the SHARED ring-buffer total — combat sparks evict). For the once-per-transform signature, **author the burst shards as a DEDICATED short-lived mesh layer** (not the shared combat pool) so the WOW moment isn't eviction-coupled to combat. Add geometry, not flat additive planes (push vertex normals for volumetric crispness).

**Choreography = 3 beats** gated on the roar intent: **HOLD-ROAR anticipation** (Ferocity charge, inward-converging sparks, dark contrast particles) → **40-90 ms BURST flash + collider swap behind it** → **SETTLE** (rim eases to steady ambient beast-glow). All capture-guarded (`captureStudio:false`, stable element-keyed seed, frozen phase — §3b).

**STOP-rule (promote to an M7 review-gate item):** if you reach for a brightness/`*Intensity`/HDR constant to fix fuzziness, you're resizing the blob — fix silhouette/contrast/dissolve instead. The M7 review asserts the beast-burst diff changed NO `*Intensity`/HDR constant.

### 5c. Reference options to LOCK with Kevin (Kevin Decision #1)

| Reference | Why propose it | Technique to borrow |
|---|---|---|
| **Bayonetta Origins** (PlatinumGames) | premium-AND-crisp north star + direct antidote to the bloom-blob (banned luminescence/blur, still gorgeous); its picture-book ROAR is the literal WILDHEART verb | shape/line-driven VFX, NO glow on the form; glow reserved to a small warm core |
| **Brawl Stars** (Supercell) | closest tonal+platform comp (bright, cartoon, touch-readable, kid-safe = Marcus); hypercharge form-shifts ARE the WILDHEART beat, crisp on small bright screens | animate SHAPES + plane particles + heavy hand-keyed timing; high-contrast silhouette over glow |
| **LoL** transformation ults (Aurelion Sol / Elementalist Lux) | gold standard for clip-worthy, instantly-readable elemental form-shifts with per-element silhouette identity | staged anticipation→climax→aftermath; crisp dissolve + bright edge-band; element identity via SHAPE + motion |
| **Genshin** Elemental Bursts | benchmark for an element-typed POWER MOMENT re-skinned per element — exactly the "two intents re-skin per beast, zero menu" frame | unified burst choreography re-skinned per element; brief flash masks the state change; bloom on cores only |
| **Hades** (Supergiant) | best-in-class CRISP high-contrast burst on a busy bright screen; reassuring scope for a small team | bold flat shapes + hard edges + dark contrast holds; very short high-contrast flash beats |

**In-world judging frame (locked rule, now wired):** prototype each beast's burst in **real bright-Caribbean game context behind the visual gate** with **`captureStudio:false`** (static-gated, §3b), NOT a sky-studio still; judge crispness on a **grayscale side-by-side sheet** (can't be faked by hue).

### 5d. What is blind-buildable NOW vs gated on the reference-lock

| BLIND-BUILDABLE NOW (mechanics, TDD-gated) | GATED on Kevin reference-lock (the LOOK) |
|---|---|
| Transactional collider+controller restore (§3a) | The beast morph VFX (the 3-layer burst + dissolve + rim) |
| Transform state machine + roar intent (§3b) | The 4 beast visual forms / mesh-shells |
| Ferocity meter + kill-event fan-out + HUD plumbing (§3c) | The transform choreography timing curve (taste) |
| Combat + locomotion re-skin routing (§3d) | The Ferocity meter fill color / "feral" token |
| Signature talent nodes + fold-tolerance (§3e) | The grayscale-silhouette sign-off per beast |
| Persistence + no-permanent-beast invariant (§3f) | — |

**Explicit:** the mechanics LOGIC ships + gates green independently; the LOOK (and any look/color-dependent visual BASELINE) is gated on Kevin's lock and is not blind-built.

---

## 6. Milestone breakdown (M-by-M, TDD red-first)

Sequenced so the riskiest physics (the transactional swap + restore) is prototyped + gated FIRST behind the visual gate, then the bull FPS number, then the meter/re-skin/talents, with the premium VFX gated on Kevin's reference-lock. **M3/M4 visual baselines are PROVISIONAL** (plain-capsule + neutral placeholder meter — flagged for re-baseline at M7); all look/color-dependent baselines live at M7 behind the M0 lock.

| M | Deliverable | Machine-checkable gate |
|---|---|---|
| **M0** | **Reference-LOCK with Kevin** (before any VFX build) + the §5a prior-miss forensic. Present §5c reference set + the in-world/grayscale rule; Kevin locks the look + the Decision Batch (§8). | human gate — Kevin sign-off; no code |
| **M1** | **PROTOTYPE the transactional swap + `restoreBaseController()`** behind the visual gate, with a **PLAIN capsule grow/shrink (no beast art)**. `BEAST_FORMS` table + single-writer form authority + **death-edge subscribe**. | **Unit:** enter→(death/same-session-load/save/error/timer/unmount) restores base shape AND base controller config + `isBeastFormActive()` false; death-restore fires BEFORE respawn. **Stress:** 1000 cycles → `collider(0).handle` + chunk count + draw calls unchanged. **Static:** zero `setWorldBlocks\|terrain.worker\|createChunk\|setBlock\|postMessage` in the beast module (constraint 4). |
| **M2** | **Real-device FPS gate on the boulder-bull capsule** (largest), `applyImpulses` toggled, near a dense cluster; tune `collisionGroups`. **Gate the other 3 beasts on this.** | **Perf:** FPS + broad-phase pair count on a mid iPad meets the pinned S2-A target, as a **bull-vs-base-capsule delta** (not just absolute). No beast variants built until green. |
| **M3** | **Transform state machine + `roar` real intent consumer** (`INTENT_KEYS += 'roar'`; keydown→`setIntent` only; guard read in `useFrame`) + dodge-iframe preserve + the pinned swap-atomicity + co-located depenetration. | **Unit:** roar guard (alive + unlocked + ferocity≥threshold + active + no-modal, enumerated) gates enter; release cancels with no spend; `setIntent('roar',false)`+cooldown on exit; `inputState.test.js` 'roar' case; swap+first post-swap `computeColliderMovement` same frame. **Visual (PROVISIONAL):** plain-capsule `spawnBeastTransform` capture state (`captureStudio:false`) diffs <6%. |
| **M3.5** | **Kill-event FAN-OUT scaffold** — replace the single `onMobKill` slot with `subscribeMobKill`/`emitMobKill`; migrate QuestSystem; the kill-path emits at `SimplifiedNPCSystem.jsx:~951`. | **Unit + REGRESSION:** quests still count mob kills after migration; multiple subscribers all receive the event; one writer to the kill event. |
| **M4** | **Ferocity meter** — store slice + day-only kill accrual (via a fan-out subscriber, capture-guarded) + dawn bleed-to-zero (before reward) + autosave-trigger + HUD `StatBar kind='ferocity'` with a NEW design token (transient-read). | **Unit:** accrue only when `isDay` + not capture; clamp `[0,MAX]`; dawn bleed→0 before reward; persist round-trips clamped+rounded; `ferocityBanked` in the autosave diff. **Visual (PROVISIONAL):** HUD baseline with a NEUTRAL placeholder meter (flagged for M7 re-baseline once the feral token is locked). |
| **M5** | **Combat + locomotion re-skin** — per-form damage/spark in ALL attack sites (`triggerMeleeAttack`/mousedown-melee/`triggerSpellCast`/held-F) + the per-form locomotion table (moveSpeed/turn/gravity); `BEAST_FORMS` derive-never-bake. | **Unit:** melee in form X applies form-X multiplier × `getEffectiveAttributes()`; cone range/arc unchanged (boss hit-reg parity); spark type = form element; per-form locomotion params assert distinct. **Static:** no base-stat mutation. **MOTION clip** for human review. |
| **M6** | **Signature talent nodes** — fold-tolerance fix + node-shape contract; `wildheart_roar` (effect-less unlock) + optional tuning node in `ASPECT_TREES[1].nodes`. | **Unit:** unlock node present ⇒ `getEffectiveAttributes()` does NOT throw; `unlockedTalents['wildheart_roar']>0` gates roar; persists + survives `refundUnknownTalents`. |
| **M7** | **THE LOOK (gated on M0 lock)** — the 3-layer burst (SpellProjectileCore recipe) + dissolve + the 4 beast mesh-shells + choreography; the feral color token; **re-baseline M3/M4's provisional states**. | **Visual:** per-beast capture states (`captureStudio:false`) diff <6%; **grayscale side-by-side sheet** review per beast; STOP-rule gate (no `*Intensity`/HDR constant changed in the burst diff); layer-contract check (silhouette `toneMapped`, only the tiny core `toneMapped={false}`). |
| **M8** | **Replicate to the other 3 beasts** via the `BEAST_FORMS` data table (zero new swap code) + per-beast tuning. | All prior gates green per beast; content-variety review (the 4 distinct in shape+motion+behavior, §4). |

Per phase: `superpowers:writing-plans` → subagent-driven-development (Opus per task; TDD red-first; the deterministic visual + static gates; human-eyeball baselines) → update the 4-piece docs + pre-compact-flush. WILDHEART is "done" only when deep, shipped, fun-verified, and green — before VOIDHAND starts.

---

## 7. Coherence-pillar trace + risks

### Pillar trace (anti-slop)

| Piece | Pillar served | Disposition |
|---|---|---|
| Transactional collider+controller restore | Engine integrity (no kill-risk; the scaffold all 4 Aspects reuse) | DEEPEN |
| Transform state machine + roar intent | Distinctive ability identity (the LEAD) + touch-ready abstraction | DEEPEN |
| Kill-event fan-out | Engine integrity (single-writer; reused by VOIDHAND/SOULBIND) | DEEPEN |
| Ferocity meter (bank/unleash) | Session loop with stakes (day→night arc) | KEEP |
| Combat + locomotion re-skin (zero menu) | Cohesion (skill transfers) + Marcus-floor (legible) | KEEP |
| Signature talent nodes | Build choice changes how you fight | KEEP |
| The LOOK (reference-locked) | SOTA-as-a-game (clip-worthy) + premium craft | SCAFFOLD-KEEP until M0, then DEEPEN |
| Persistence / no-permanent-beast | Kid-safe + cohesion | KEEP |

### Risks + mitigations

- **Permanent-beast bug (hardest part).** `restoreBaseController()` (shape AND controller config) on EVERY exit path — **death edge** (not respawn), same-session load tail, EXIT-before-save, timer/manual/error/unmount; single-writer authority; M1 restore tests + 1000-cycle handle-stability; `loadWorldData` never restores form state.
- **Cross-form controller contamination.** The shared single KCC's `applyImpulses`/`mass` are in the restore set (not just the shape).
- **Bloom-blob look.** The LAYER CONTRACT grounded in the proven `SpellProjectileCore` recipe; reference-lock + in-world grayscale judging BEFORE any emissive build; the STOP-rule (M7 gate).
- **Re-mesh (engine kill-risk).** ZERO voxel edits, static-gated (`+postMessage`); the swap is `setShape` + mesh-shell + particles (M1 chunk-count invariant).
- **Scope / sampler-trap.** 4 mass-shapes + 4 locomotion profiles + 4 behavior hooks (§4); the grayscale sheet (M7) + the MOTION clip (M5); WILDHEART must pass §1's fun metric before VOIDHAND.
- **FPS on the bull.** Restitution is NOT the lever; the M2 real-device delta gate before the other 3 beasts; `collisionGroups` to shrink the filter set.
- **Single-writer regression.** Kill-event fan-out + a quest-kill regression test (M3.5); form state read via `getState()`/refs in `useFrame`, `set()` only on transitions; the meter subscribes only on transitions.

---

## 8. KEVIN DECISION BATCH (the genuine taste/vision decisions to surface at the gate)

1. **🔒 LOOK REFERENCE-LOCK (#1, blocks the VFX milestones M7/M8).** Pick the direction from §5c (Bayonetta Origins / Brawl Stars / LoL / Genshin / Hades — or a blend) + confirm the in-world, grayscale-judged, `captureStudio:false` rule. The morph VFX + the 4 forms + the feral token are NOT built until this is locked. *(The mechanics M1-M6 + M3.5 proceed in parallel; only the look/color BASELINES wait.)*
2. **Ferocity tuning + reset semantics.** Accrual source — **KILLS-ONLY w/ per-tier scaling** (recommended) vs kills+damage vs time? The unlock **threshold**? `FEROCITY_MAX`? Dawn rule — **bleed-to-zero each dawn** (recommended) vs carry-forward? Form **duration** (fixed vs level/talent-scaled)?
3. **Beast roster confirm — incl. the inversion flag.** Confirm the 4 forms + the **counter-intuitive** element mapping (**fire→comet, ice→boulder-bull** — defensible as comet=fire-streak / bull=ice-mass, but flag it; lightning→hawk, arcane→golem) + the identity verbs (comet=crit-dash / bull=shove-charge / hawk=agile-hop / golem=stun-monolith). Final model names?
4. **Talent-node taxonomy.** Beyond `wildheart_roar` (the unlock), do you want tuning nodes (Ferocity-accrual-rate / form-duration), at what limits/prereqs?
5. **Per-beast combat differentiation depth.** Damage multiplier + spark type only (cheapest, hit-reg-safe) or also range/arc/cooldown (richer, changes boss hit-reg)? Plus per-form **collider dims** + **locomotion params** (the actual numbers).
6. **The bull's debris-shove.** Should the bull actually shove dynamic debris (`setApplyImpulsesToDynamicBodies(true)` + `setCharacterMass`) — cool but FPS-costed, gated on M2 — or is the bounce purely movement/VFX feel?
7. **Ferocity meter HUD placement + token color.** 4th bar under hunger (recommended) + the new **"feral" design token** (orange/crimson?) — must be distinguishable from the health bar AND the fire-spell color specifically (it's a real token through the SoT chain, not a hex).
8. **Roar keybinding.** Default key for the roar hold (e.g. `R`, or a long-hold on an existing key)? *(The intent is source-agnostic; this is just the default KB map; touch is S3.)*

---

## 9. Next step

On Kevin's approval of this spec (+ the M0 reference-lock) → `superpowers:writing-plans` for the WILDHEART milestones → subagent-driven build, M1 first (the transactional swap + restore behind the visual gate). The mechanics (M1-M6 + M3.5) proceed without the look-lock; the VFX (M7-M8) wait for M0.
