# Perfect Dodge — the parry role, on the verb players already have (design)

**Status:** design, self-gated under LOOP-CHARTER §4. Source gap: EXTERNAL-BASELINE §3 "Evasion verb — dodge +
i-frames exist; **parry absent**". Survey of the input/strike paths: this session, 2026-09-23 (paths below).

## Decision

No new button. Every ergonomic key near WASD and the right mouse are already bound (Components.jsx 353-437,
InputManager.jsx 123-172, verbRouter.js 36-61); the free ones (middle mouse, I/J/K/N/O/P/Y) are awkward, and a new
touch button would crowd `ui/TouchControls.jsx`. The parry's ROLE — an active, timing-based answer to a telegraphed
strike, rewarded with an opening — goes to the DODGE (Shift / the touch dodge button): pressed in the last
`PERFECT_WINDOW_MS` of a nearby mob's windup, it is a **perfect dodge**: that mob's strike never lands and it is
**staggered** for `STAGGER_MS`, taking `RIPOSTE_MULT`x damage meanwhile. The existing 380 ms windup
(`game/attackTelegraph.js WINDUP_MS`) becomes the thing a skilled player reads and punishes.

## Numbers (tunable, stated as data in `game/perfectDodge.js`)

- `PERFECT_WINDOW_MS = 220` — the last 220 ms of the 380 ms windup (generous for web input latency).
- `PERFECT_RANGE = 3.4` horizontal m (covers the widest melee reach, moss_brute 3.2) and |dy| <= `VERTICAL_REACH`.
- `STAGGER_MS = 1400` on the WORLD clock (a hitstop holds it too).
- `RIPOSTE_MULT = 1.5` on damage dealt to a staggered mob.
- A perfect dodge refunds the dodge cooldown (chain them).

## Seams (each needs a gate that drives it)

1. **Detection** — at dodge start (Components.jsx ~911-946): `perfectDodgeTargets(mobs, playerPos, worldNow())`
   (pure). Sets `entity.staggerUntil` on each target.
2. **The strike never lands** — the worker must respect `staggerUntil` (a main-thread-owned payload field,
   mobStateSync `buildMobPayload`): no strike, no windup, no movement while staggered. Plus AIWorkerSystem drops an
   attack already in flight from a mob that is now staggered (the tick that produced it predates the dodge).
3. **Riposte** — CombatSystem `damageMob` (the one damage choke point) multiplies damage on a staggered mob.
4. **Feedback** — a "PERFECT!" floating text (combatVfx DamageNumber / spawnAnvilText precedent), sparks
   (triggerGPUSparks), heavy hitstop, a new procedural voice `parry` (audio/synthVoices.js VOICES), and a stagger
   pose in MobModel (read against `worldNow()`).
5. **Legibility** — keyMap Combat row text for dodge mentions the perfect timing; an onboarding tip; i18n en +
   zh-CN for any new UI string (tests/i18n ratchet).
6. **Capture** — no mob strikes run under capture (AIWorkerSystem returns early); feedback self-guards.

## Out of scope (v1)

The dragon (its attacks are timer-driven in BossEntity, no windupUntil), archer projectiles, allies.

## Acceptance

- E2E through the real listener: a zombie winds up beside the player; a synthetic Shift keydown dispatched in-page
  inside the window → the zombie is staggered, the player takes no damage from it, and a hit on it deals 1.5x. A
  press OUTSIDE the window (too early) → no stagger (the control).
- Mutation-proof: window ignored; range ignored; the worker ignores staggerUntil; the in-flight attack not dropped;
  riposte multiplier ignored; stagger on the wall clock.
