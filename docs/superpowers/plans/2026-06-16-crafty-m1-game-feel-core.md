# M1 — Game-Feel Core + Quick-Win Bug Cluster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Land the highest-leverage of the SOTA-audit backlog: a shared game-feel core (weight-tiered hitstop + trauma-based directional screenshake + a `juiceIntensity` dial) plus the verified one-line bug fixes — directly attacking the audit's Theme-1 ("works but flat/floaty") and Theme-2 ("built but unwired").

**Phase-B verification (DONE 2026-06-16, all audit claims confirmed against live code):**
- Hitstop flat 28ms: `SimplifiedNPCSystem.jsx:458` `if (source==='player') setState({hitstopUntil: now+28})`.
- Screenshake `Math.random`: `Components.jsx:1158-1160` (already below an isCaptureMode early-return — capture-safe).
- Ore-debris white: `terrain.worker.js:104` `BLOCK_COLORS[prevBlock] || [1,1,1]`; `BLOCK_COLORS` (`:539`) maps only 1-9 + 255 — missing ore codes 10(coal)/11(iron)/12(gold)/13(diamond).
- `playCraft` zero callers (only the def `SoundManager.jsx:595`); `doCraft` (`CraftingTable.jsx:85`) plays no sound.
- `playSpatialSound` def `GameScene.jsx:248` (fixed playbackRate; early-returns when `sounds` null -> inert in capture).
- `npm test` = `node test_swarm.js` (rubber-stamp); the real suite is `test:unit` = `vitest run` (`package.json:29-30`).

---

## Slice 1 — quick-win bug cluster (verified, tiny, high-confidence) [THIS COMMIT]
- [ ] **Ore-debris color:** add codes 10-13 to `BLOCK_COLORS` (terrain.worker.js) using the locked BLOCK_TYPES ore colors via `toLinear` — coal `#2F2F2F`, iron `#D8AF93`, gold `#FCEE4B`, diamond `#4FD0E7`. Restores the mining reward beat (debris no longer shatters white).
- [ ] **`npm test` repoint:** `"test": "vitest run"` (was `node test_swarm.js` rubber-stamp) so a naive CI/contributor gets the real 1277-test suite.
- [ ] **Spatial pitch-jitter:** `playSpatialSound(soundName, position, playbackRate=1, distance=20, jitter=true)` — apply `playbackRate * (0.93 + Math.random()*0.14)` (±7%) when `jitter`, kills machine-gun fatigue across all ~25 combat/footstep call sites at once. Capture-safe (the fn early-returns when `sounds` is null in capture, so no RNG runs). Stingers/motifs (played via non-spatial `playSound`) are unaffected; callers can pass `jitter=false`.
- [ ] **Wire `playCraft`:** bridge `window.playCraft = playCraft` in App.jsx (mirror `window.playFanfare`), destructure `playCraft` from `useGameSounds()`; call `if (window.playCraft) window.playCraft();` in `doCraft` (CraftingTable.jsx) — crafting is silent today.
- [ ] VERIFY: `npx vitest run` holds-or-grows · build clean · eslint clean · capture+gate 20/20 (no render change). Commit.

## Slice 2 — trauma game-feel core (pure module + unit) [NEXT COMMIT]
- [ ] NEW pure `src/game/trauma.js`: a trauma accumulator + shake derivation. `addTrauma(state, amount)` clamps trauma to [0,1]; `decayTrauma(state, dt)` linear decay; `shakeOffset(trauma, seed, dirX, dirZ, intensity)` -> `{x,y,z}` where magnitude = `trauma^2 * intensity` (quadratic falloff = the SOTA trauma model) using value-noise (seeded, NOT Math.random, so it's deterministic + testable), with an optional directional bias. A `HITSTOP = {light:45, heavy:90, crit:130, boss:160}` table (ms).
- [ ] TDD unit `src/game/trauma.test.js`: trauma clamps at 1 + never negative; decay reduces over dt; `shakeOffset` magnitude scales with trauma^2 (0 at trauma 0); directional bias sign; HITSTOP ordering light<heavy<crit<boss.

## Slice 3 — wire trauma-shake + tiered hitstop + juiceIntensity [NEXT COMMIT]
- [ ] Add `juiceIntensity` to the store (default 1; 0 = off — doubles as the M3 accessibility dial).
- [ ] Replace the `Math.random` shake (Components.jsx:1152-1194) with `shakeOffset(...)` fed by a store `trauma` value (events `addTrauma`), scaled by `juiceIntensity`. Keep the existing isCaptureMode early-return (capture-safe). Game-Loop-Isolation: transient reads in the camera-follow rAF, no per-frame React state.
- [ ] Replace the flat `hitstopUntil: now+28` (SimplifiedNPCSystem.jsx:458) with `now + HITSTOP[weight] * juiceIntensity` from a weight arg (light/heavy/crit derived from the already-computed isCrit/damage); freeze the struck mob's anim clock for the window. Route `triggerCameraShake` (Components.jsx:310 etc.) through `addTrauma`.
- [ ] VERIFY: unit grows · build clean · capture+gate 20/20 (shake/hitstop inert in capture) · LIVE-PROBE LOOK (pov-probe) that a hit now reads with weight. Commit. EAR/FEEL tuning (the ms/magnitudes) -> KEVIN-REVIEW (#50 FEEL-timing).

## Notes
- Trauma model: `shake = trauma^2 * maxAngle/offset`, trauma added per-event + decayed per-frame (the standard "trauma" approach, quadratic so small hits barely shake + big hits punch). Seeded value-noise (not Math.random) keeps it capture-deterministic + unit-testable.
- `juiceIntensity` is the single multiplier the M3 Settings/accessibility slider will expose (reduced-motion -> 0).
- Locks hold: no PBR/bloom/tonemap change; this is feel + audio wiring, not the render lock.
