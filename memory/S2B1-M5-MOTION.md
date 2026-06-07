# S2-B1-M5 — MOTION / FEEL review artifact

The still-frame grayscale-silhouette gate (M7) proves the 4 beasts are distinct SHAPES. This artifact is the **MOTION half** — proving they MOVE + FIGHT distinctly (so they're not 4 differently-shaped-but-identically-handling capsules). A live video clip can't be captured headlessly, so the reviewable artifact is (a) the machine-asserted per-form profile below (`beasts.test.js` asserts pairwise-distinctness on every axis) + (b) a Kevin in-app motion check (steps at the bottom).

## Per-form profile (all derive-on-read; base attrs + base capsule never mutated)

| Beast (element) | moveMult | gravityMult | jumpMult | damageMult | cooldownMult | the feel |
|---|---|---|---|---|---|---|
| **Comet** (fire) | **1.40** (fastest) | 1.00 | 1.05 | 0.90 | **0.55** (snappiest) | fast, light, high-DPS-via-speed glass-cannon dasher |
| **Bull** (ice) | 0.70 | 1.10 | 0.80 | **1.60** (hardest) | 1.50 (slow) | heavy, slow, armor-pen bruiser/shover |
| **Hawk** (lightning) | 1.25 | **0.55** (floatiest) | **1.50** (highest hops) | 0.85 | 0.70 | agile, floaty **low-gravity hopper**, light quick hits |
| **Golem** (arcane) | **0.60** (slowest) | **1.20** (heaviest) | 0.70 | 1.55 | **1.60** (slowest swing) | slowest, heaviest, stun-leaning heavy blows |
| _human (no form)_ | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | identity — pre-M5 byte-identical |

**Distinctness (the two-axis sampler-trap defense):** every locomotion axis (move/gravity/jump) has 4 distinct values; the (damage, cooldown) combat tuple is pairwise-distinct. Each beast is the OPPOSITE of the bull on the axes that matter (comet=fast/light vs bull=slow/heavy; hawk=floaty-air vs golem=grounded-heavy).

## Where it's wired (all transient `getState()` reads — Game-Loop-Isolation)
- **Melee** (`Components.jsx` `triggerMeleeAttack`): cooldown `MELEE_COOLDOWN × cooldownMult`; damage `round(solveMeleeDamage × damageMult)` (rides on TOP of `getEffectiveAttributes()`); spark `type` = the form-electing `activeSpell` (colors per element). **Cone `range=4.5`/`arc=π/2` UNCHANGED → boss + mob hit-reg parity.**
- **Locomotion** (`Components.jsx` movement `useFrame`): `speed = 10 × moveMult`; jump `12.0 × jumpMult`; gravity `−32.0 × gravityMult × delta`.

## Kevin review items (KEVIN-REVIEW-BATCH §5)
1. **All numbers above are tunable** — change freely in `src/game/beasts.js` `BEAST_FORMS`; the read sites are data-driven.
2. **`turnRate` intentionally OMITTED.** The spec §3d listed it, but Crafty's controller is camera-relative pointer-lock → turning is mouse-driven/instant, so there is no turn-rate seam to multiply (a `turnRate` field would be a silently-dead param — the M4 lesson). Tank-style turning would be a controller change (S3+), not a table field. OK as-is?
3. **Deferred to a later milestone / Decision #5-#6:** per-form melee range/arc (changes boss hit-reg — kept out of M5 on purpose), the bull debris-shove, the per-form behavior hooks (crit/stun proc).

## In-app motion check (Kevin)
Bank Ferocity (kill mobs in the day) → roar in each of the 4 forms (load fire/ice/lightning/arcane spell first to pick the form) → confirm: comet darts + swings fast; bull/golem are heavy + slow; hawk hops floaty + high; melee sparks match the element; melee damage feels scaled. Cone reach should feel identical across forms (hit-reg parity).
