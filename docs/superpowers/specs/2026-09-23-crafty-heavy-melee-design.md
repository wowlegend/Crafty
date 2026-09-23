# Heavy Melee — hold to charge (design)

**Status:** design, self-gated under LOOP-CHARTER §4. Source: EXTERNAL-BASELINE-R2 Top 5 #1 — three genre leaders
shipped a held/charged heavy attack beside the light one inside twelve months (Hytale EA 2026-01, Minecraft's spear
2025-12-09, Enshrouded U8 2026-04-21), and Crafty's melee is one instant cone check on a 300 ms cooldown
(`Components.jsx` `triggerMeleeAttack`, `MELEE_COOLDOWN`), re-checked in source 2026-09-23.

## Decision

**No new button, and no latency on the tap.** Melee fires on PRESS today (LMB on a mob or a whiff, or T), and a
light attack that waited for the release would feel late on every click. So the tap stays exactly today's light swing,
fired on press. KEEPING the button held past `HEAVY_HOLD_MS` begins a CHARGE; releasing it once the charge has run
`HEAVY_CHARGE_MS` throws the **heavy** swing. Releasing earlier does nothing more (the tap already swung). This is the
"jab, then wind up" shape: a player who never holds never meets it.

The heavy swing: `HEAVY_MULT` x the light damage (the same solver and weapon), the existing heavy hitstop tier
(damageMob sizes the hitstop from the damage, so a doubled hit reaches it by itself), a longer shove, and it
STAGGERS a non-boss mob it hits for `HEAVY_STAGGER_MS` — the perfect dodge's stagger (`game/perfectDodge.js`), so the
riposte multiplier then applies to the follow-up. It is what the brute's winded window and a perfect dodge's opening
are for.

## Numbers (tunable, data in `game/heavyAttack.js`)

- `HEAVY_HOLD_MS = 280` — held past a tap (a deliberate hold, not a slow click).
- `HEAVY_CHARGE_MS = 420` — the charge; the heavy is ready 700 ms after the press.
- `HEAVY_MULT = 2`, `HEAVY_STAGGER_MS = 800` (world clock), `HEAVY_SHOVE_MULT = 2.5`.
- Charging slows walking to `HEAVY_WALK_MULT = 0.55` (the commitment); a dodge, a hit taken, death or losing input
  CANCELS the charge (nothing fires).

## Seams (each needs a gate that drives it)

1. **The state machine** — pure `game/heavyAttack.js`: `press(now)`, `release(now) -> 'heavy' | null`,
   `cancel()`, `chargeLevel(now)` in [0,1] for the render, `isCharging(now)`. Module state, read transiently (Game-Loop
   Isolation: no React state per frame).
2. **Input** — `Components.jsx`: the press path already routes LMB-attack and T to `triggerMeleeAttack()`; it also
   calls `press`. A new `mouseup` (button 0) and the T keyup call `release`; a 'heavy' result calls
   `triggerMeleeAttack({ heavy: true })`. T's OS key-repeat must not re-press (`e.repeat`). Mining (LMB on a block) and
   the held-block hurl never press.
3. **The swing** — `triggerMeleeAttack({ heavy })`: damage x `HEAVY_MULT`, `staggerUntil` on each non-boss mob hit,
   the shove scaled. The boss takes the damage but is not staggered (its attacks are timer-driven; v1 scope).
4. **Cancel** — the dodge start, `damagePlayer`, death and the input-inactive edge call `cancel`.
5. **Feel** — the FPV hand pulls back with `chargeLevel` and a rim glow brightens toward ready
   (`render/playerRender.jsx`, read transiently); a soft ready tick (`audio/synthVoices.js` `heavyReady`); the release
   plays the existing swing plus the heavy hit.
6. **Legibility** — keyMap's LMB/T rows ("hold to charge"), an onboarding tip, i18n en + zh-CN for any new string.

## Out of scope (v1)

Touch (the touch attack button is tap-only; a hold there is its own design), beast forms (their melee re-skins have
their own cooldowns — the heavy is the human sword), the boss stagger.

## Acceptance

- E2E through the real input: a real mouse HOLD (down, wait, up) on a spawned zombie deals >= 1.8x a tap's damage,
  sets `staggerUntil`, and the tap in the same spec (the control) sets no stagger.
- Mutation-proof: the multiplier halved; the stagger removed; the hold threshold ignored (a tap charges); cancel on
  dodge removed.
