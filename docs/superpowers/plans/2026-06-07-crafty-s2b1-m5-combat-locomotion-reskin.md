# S2-B1-M5 — Combat + Locomotion Re-skin (the MOTION/FEEL half of beast distinctness)

> Plan-of-record for WILDHEART milestone M5. Spec: `docs/superpowers/specs/2026-06-07-crafty-s2b1-wildheart-design.md` §3d + §5 + the M5 gate row. Branch `s2b1-m5-reskin` off `main@9c6a847`.

## Goal
Make the 4 beast forms FIGHT and MOVE distinctly — so they are not 4 differently-shaped-but-identically-handling capsules (the sampler-trap at the feel level). **Derive-never-bake:** all per-form multipliers live in the static `BEAST_FORMS` table and apply AT the read site; base attributes + the base capsule are never mutated (form is a derived overlay).

## Scope (the M5 gate, verbatim)
- **Combat:** melee in form X applies a form-X **damage multiplier** × `getEffectiveAttributes()`; **spark type = form element**; cone **range/arc UNCHANGED** (boss hit-reg parity). Plus a hit-reg-safe **cooldown multiplier** (the "fast comet / slow bull" feel — not range/arc, so boss hit-reg is untouched).
- **Locomotion:** per-form `moveMult` / `gravityMult` / `jumpMult` applied in the same `Components.jsx` `useFrame` as the collider swap. Hawk = **low-gravity hops** (low gravityMult + high jumpMult), NOT flight (true flight fights the KCC snap-to-ground 0.5 — OUT-OF-SCOPE / S3+).
- **Static:** no base-stat mutation.
- **MOTION review artifact** (the still-frame grayscale gate can't catch identical handling).

### Scope decision: `turnRate` OMITTED (flag for Kevin, KEVIN-REVIEW-BATCH §5 #5)
The spec §3d listed `turnRate`, but Crafty's controller is **camera-relative pointer-lock** (Components.jsx:735-748 — movement is built from the camera forward/side vectors; turning is mouse-driven and instant). There is **no turn-rate seam** to multiply. Baking a `turnRate` field nothing reads would be a silently-dead param (the M4 `PER_KILL`-gradient lesson: a table key with no live reader is dead weight that masks intent). So locomotion distinctness = `moveMult` + `gravityMult` + `jumpMult` (3 real seams). If Kevin wants tank-style turning later, that's a controller change (S3+), not a table field.

### Deferred (Kevin Decision #5/#6, not M5): range/arc per form, bull debris-shove, per-form behavior hooks (crit/stun). M5 is damage-mult + spark + cooldown + locomotion — the hit-reg-safe set.

## Architecture (testable seams)
**`src/game/beasts.js`** — extend each `BEAST_FORMS[element]` with combat + locomotion fields; add PURE helpers that return the **identity (1)** for null/unknown element (so the human form is the no-op):
- `formDamageMult(element)` -> number (melee damage scalar)
- `formMeleeCooldownMult(element)` -> number (MELEE_COOLDOWN scalar)
- `formLocomotion(element)` -> `{ moveMult, gravityMult, jumpMult }` (each 1 for human)

Numbers (Kevin-tunable) — each beast distinct on every axis (the two-axis sampler-trap defense):
| form (el) | damageMult | cooldownMult | moveMult | gravityMult | jumpMult | feel |
|---|---|---|---|---|---|---|
| comet (fire) | 0.9 | 0.55 | 1.40 | 1.00 | 1.05 | fast weak-hit DPS dasher (glass cannon) |
| bull (ice) | 1.60 | 1.50 | 0.70 | 1.10 | 0.80 | slow heavy armor-pen bruiser/shover |
| hawk (lightning) | 0.85 | 0.70 | 1.25 | 0.55 | 1.50 | agile floaty low-gravity hopper, light hits |
| golem (arcane) | 1.55 | 1.60 | 0.60 | 1.20 | 0.70 | slowest, heaviest, stun-leaning heavy blows |

(All `moveMult`/`gravityMult`/`jumpMult` pairwise-distinct; `(damageMult,cooldownMult)` pairwise-distinct.)

**`src/Components.jsx`** read sites (transient `getState()` — Game-Loop-Isolation):
- `triggerMeleeAttack` (259): read the form once at the top; cooldown check `< MELEE_COOLDOWN * formMeleeCooldownMult(el)` (261); `damage = round(solved.damage * formDamageMult(el))`; `damageMob(id, damage, beast ? activeSpell : 'physical')` (295 — `activeSpell` IS the spark type that picked the form, maps to the sparkColor cases); `damageBoss(damage)` (309) gets the multiplied damage. **Cone `range=4.5` / `angleRad=π/2` UNCHANGED.**
- movement `useFrame`: compute `const loco = formLocomotion(beastEl)` once (after the M3 SM tick, before `const speed` at 491); `speed = 10 * loco.moveMult` (491); jump `velocityY.current = 12.0 * loco.jumpMult` (689); gravity `velocityY.current += -32.0 * loco.gravityMult * delta` (699).

## TDD steps
1. **beasts.test.js** (extend): identity for null/human; each form's mults present + in range; pairwise-distinct locomotion + combat tuples (the sampler-trap assertion); the spark-type-from-activeSpell mapping (fire->fireball spark etc. — assert `elementForSpell`/`SPELL_TO_ELEMENT` round-trips so the form's element's spell IS a valid sparkColor case).
2. Implement the beasts.js table + helpers -> green.
3. Wire Components melee (damage/cooldown/spark) + locomotion (speed/jump/gravity).
4. Verify MYSELF: `npm run test:unit` (full) + `npm run build` + `npm run test:visual` (must stay 13/13 — locomotion only matters in motion; the static capture states don't enter beast form, so byte-identical) + a **locomotion-profile comparison table** as the MOTION review artifact (live video clip is a Kevin-in-app check — can't capture headlessly).
5. Adversarial review (multi-lens: combat-correctness / hit-reg-parity / locomotion-physics / isolation) -> fix -> merge -> 4-piece -> flush.

## Invariants to hold (the recurring sharp edges)
- **Derive-never-bake:** no write to base `strength`/capsule; form mult is read-site only. A static test asserts no base-stat mutation.
- **Game-Loop-Isolation:** the locomotion read is `getState()` per frame (transient), never a subscription.
- **Hit-reg parity:** the cone `range`/`angleRad` literals are untouched (the boss + mob cone tests must pass unchanged).
- **No silently-dead params:** every `BEAST_FORMS` field added has a live reader in Components (turnRate omitted for exactly this reason).
