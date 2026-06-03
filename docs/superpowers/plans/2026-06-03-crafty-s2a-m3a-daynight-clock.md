# S2-A-M3 — Stakes loop (decomposition) · M3a — Day/night clock tick

> **Status:** PLAN (2026-06-03). Branch `s2a-m3a-daynight-clock` off `main`.
> **Method:** subagent-driven (Opus implementer + spec/quality review); TDD red-first; NO Claude footer; fix-ups = NEW commits; verify test state MYSELF; visual 12/12 must hold.

## M3 decomposition (flexible, mirrors the M2a/b/c/d pattern)

M3 = the **core stakes loop** (day→build→night-SIEGE→survive-to-dawn + loot juice), per the approved S2 spec. It is large + new-gameplay + carries real feel/balance decisions, so it ships in slices:

- **M3a (THIS) — Day/night CLOCK tick.** Make time actually advance so day↔night cycles (Kevin's reported "still day after defeating the dragon"). Mechanical + low-taste; the only knob (cycle length) is batched. **Foundation for M3b** (siege needs night to actually arrive).
- **M3b — Night SIEGE + survive-to-dawn + reward.** Escalating night danger (spawn ramp per night) tied into the existing `dangerLevel`→obsidian-mood bridge; a dawn-survival reward. NEW gameplay + balance → defaults batched to Kevin.
- **M3c — Loot juice.** Rarity drop-beams + pickup feedback (grep confirms NONE exists today). Visual/feel → batched.

This plan covers **M3a only**. M3b/M3c get their own plans (their design knobs are batched in KEVIN-REVIEW-BATCH now so Kevin can weigh in before they build).

## M3a goal

`isDay` (store) is consumed everywhere (SoundManager music, GameScene lighting `dayFactor`, Atmosphere mood, mob night-spawn, Terrain `timeOfDay` uniform) but **never auto-advances** — nothing ticks `gameTime`, so it's permanent day (manual Settings toggle only). M3a adds a Game-Loop-Isolation-safe ticker that advances `gameTime` over real time so the cycle runs, AND fixes a latent flip bug.

## The latent bug (in scope — "make the clock CORRECT, not just present")

`store.setGameTime` (useGameStore.jsx:515-522) flips `isDay` only when `newTime > 0 && newTime % 600 === 0` — an **exact-landing** check. This is brittle:
- Any tick step that doesn't divide 600 **skips** the exact multiple → no flip ever.
- A save resumed at a non-multiple `gameTime` (e.g. 437) can never reach an exact 600k by adding a fixed step → night never comes after load.

**Fix:** flip on **half-cycle boundary CROSSING**, not exact match:
```
const HALF = 600; // units per half-cycle (day or night)
setGameTime(timeArg): newTime = resolve(timeArg, state.gameTime)
  const crossed = Math.floor(newTime / HALF) !== Math.floor(state.gameTime / HALF);
  return crossed ? { gameTime: newTime, isDay: !state.isDay } : { gameTime: newTime };
```
Robust to any step + any resume value. `setTimeOfDay` (dev/capture) is unaffected (it sets `gameTime` + `isDay` directly, and the ticker is paused in capture). `setIsDay` (manual toggle) still works — a manual flip persists until the next boundary crossing (matches current toggle semantics). Extract `HALF` + the pure crossing/`isDayAtTime` logic to a testable module.

## Plan

### Pure module `src/game/dayNight.js` (NEW)
- `export const HALF_CYCLE_UNITS = 600;` (units per day or night half)
- `export const CYCLE_UNITS = 1200;` (full day+night)
- `export function crossedHalfCycle(prevTime, nextTime)` → bool (`floor(next/HALF) !== floor(prev/HALF)`).
- `export function isDayAtUnit(t)` → bool (`Math.floor(t / HALF_CYCLE_UNITS) % 2 === 0`) — derive-from-time helper (for resync correctness on load + tests; NOT used to override manual `setIsDay`).
- **Tick rate constant (the ONE knob, batched):** `export const GAME_UNITS_PER_SECOND = 4;` → step 4/s, `HALF/4 = 150 s` per half → **5-min full cycle (2.5 min day / 2.5 min night)**. 600 % 4 === 0 so integer landings still align; the crossing-fix makes exact landing unnecessary anyway. Documented as Kevin-tunable.

### Store fix `src/store/useGameStore.jsx`
- Import `crossedHalfCycle` (+ optionally `HALF_CYCLE_UNITS`) from `../game/dayNight`.
- Rewrite `setGameTime`'s flip to use `crossedHalfCycle(state.gameTime, newTime)` instead of `% 600 === 0`. Behavior for an exact-landing integer ticker is identical (still flips at 600/1200/…); the difference is robustness to non-aligned steps + resumed saves.

### Clock hook `src/game/useDayNightClock.js` (NEW — React wiring)
- A `setInterval` ticker (1000 ms) that calls `useGameStore.getState().setGameTime(t => t + GAME_UNITS_PER_SECOND)`. **NOT** `useFrame` (per-frame `set()` = render storm; 1/s is rare-change → safe).
- **Pause gates (advance ONLY when all true):** `isWorldBuilt` (passed in or from store) · `getInput().active` (input live — pauses time at click-to-play + when any menu is open, since opening a panel exits pointer-lock → `active=false`; coherent reuse of the M2d active SoT + player-friendly) · `gameSystems.isAlive !== false` · `!isCaptureMode()` (visual-gate determinism — the capture bridge pins lighting via `setTimeOfDay`; the ticker must not fight it). Cleanest: the interval callback reads these guards each tick and early-returns if paused (interval keeps running; cheap).
- Mount it once in `App.jsx` (alongside the other top-level hooks) — `useDayNightClock({ isWorldBuilt, isAlive: gameSystems?.isAlive })`.

### Tests (TDD red-first)
- `src/game/dayNight.test.js` — `crossedHalfCycle` (no-cross within a half; cross at 599→601 across 600; cross at 1199→1201; multi-step jump 580→640 crosses; resume-at-437 +4 stepping eventually crosses 600 → flips); `isDayAtUnit` (0..599 day, 600..1199 night, 1200..1799 day); the knob `600 % GAME_UNITS_PER_SECOND === 0`.
- A store test: `setGameTime` flips `isDay` on a boundary crossing from a non-aligned start (e.g. start 437, add 4 repeatedly → flips when crossing 600) — **the bug-fix gate** (RED against the old `%600` logic).
- Clock-pause static/behavior gate (optional): assert `useDayNightClock` reads `isCaptureMode` + `getInput().active` (a static-source gate, GPU-free) so the determinism + pause contract can't silently regress.

### Verify
- `npm run test:unit` green (451 + new) · `npm run build` clean · `npm run test:visual` **12/12** (the ticker is paused in capture → frames byte-stable; this is the load-bearing determinism check — if any frame drifts, the capture-pause gate is wrong, STOP).

## Behavior / parity notes
- Pre-M3a: permanent day (no ticker). Post-M3a: day↔night cycles every 2.5 min of active play; pauses in menus / at click-to-play / on death / during capture.
- The Settings manual day toggle (`setIsDay`) still works; the auto-cycle will re-assert at the next boundary crossing.
- `gameTime` is already saved/restored (saveSchema `game_state.gameTime`); the crossing-fix makes resumed saves cycle correctly (the bug-fix).

## Definition of done
- Day/night auto-cycles in active play; paused appropriately; capture frames unaffected (12/12).
- `setGameTime` flips on crossing (robust to step + resume); pure logic + bug-fix tested (red-first).
- `npm run test:unit` green · build clean · `npm run test:visual` 12/12.
- Adversarial review (spec/quality) → no BLOCKING unaddressed; merged to `main`; cycle-length knob batched to Kevin.

## Batched to Kevin (KEVIN-REVIEW-BATCH — feel/balance, reversible constants)
- **M3a cycle length** — default 5-min full cycle (2.5 day / 2.5 night), `GAME_UNITS_PER_SECOND=4`. Alternatives: 8-min cozier / 3-min frantic. Knob is one constant.
- **M3b (siege) intensity + reward + death stakes** — see review-batch entry (defaults proposed; built next).
