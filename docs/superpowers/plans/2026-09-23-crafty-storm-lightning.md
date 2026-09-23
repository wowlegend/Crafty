# Storm Lightning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A storm has lightning: the sky and the world flash for a beat, a thunder crack follows after the time sound
takes to arrive, and the rumble swells — the storm that today only darkens and hisses gets its punctuation
(EXTERNAL-BASELINE-R2 #4, score 2.0; Vintage Story 1.22 tuned exactly this).

**Architecture:** A pure module `game/lightning.js` — a SEEDED strike scheduler (`nextStrikeIn(rng)`, in world ms,
only while the weather is a storm and never under capture), a flash envelope `flashAt(msSinceStrike)` (a fast
attack, a 200-300 ms decay with one re-strike flicker, 0 after), and `thunderDelayMs(distanceM) = distance / 343 s`.
A `LightningDriver` (render/, one useFrame, transient refs only — Game-Loop Isolation) owns the schedule, writes
`lightningFlashRef.current` each frame, and plays a `thunder` synth voice after the delay. Atmosphere reads the ref
and adds it to the hemisphere light and the sky dome's colours; nothing else subscribes.

**Tech Stack:** R3F `useFrame`, the existing synth voice bank (`audio/synthVoices.js`), the world clock (a hitstop
holds a flash too), vitest, a puppeteer/e2e probe.

**Spec:** this document. Source: `docs/superpowers/sota-2026-09/EXTERNAL-BASELINE-R2.md` item 4 and its *verify*.

## Global Constraints

- Capture mode: zero strikes, and the flash ref pinned to 0 (a declared reset, never an early return).
- No strikes unless the weather is a storm (`store.weather === 'storm'`).
- The flash is a LIGHT change, not a post effect: bold-flat, no bloom spike, no new pass.
- Photosensitivity: at most one strike per 4 s, flash peak bounded (a luminance jump, not a white-out), and the
  existing `juiceIntensity` dial scales the flash (0 = none) — the same dial the hitstop and shake obey.
- No new dependency; zero emoji; AST-safe edits; no backtick inside a shader template literal.

## Review Focus

1. A storm that ends mid-flash: the flash must finish decaying, never stick on.
2. A hitstop mid-flash: the flash holds with the world (world clock), then resumes.
3. Capture mode entered mid-storm: flash 0 at once, and no thunder scheduled after.
4. Thunder after the storm ended (a delayed crack scheduled before the end): allowed, it is sound already in flight.
5. `juiceIntensity` 0: no flash at all, thunder still plays (sound is not a photosensitivity risk).

---

### Task 1: `game/lightning.js`, pure

- [ ] Failing tests: the scheduler, over a seeded rng, never schedules closer than 4000 ms and averages within the
  design band (one per 8-20 s); zero strikes when not a storm or under capture; `flashAt(0)` = 0, peaks within 60 ms,
  is back to 0 by 400 ms and monotonic after the flicker; `thunderDelayMs(343) === 1000`, proportional; the flash
  scaled by `juiceIntensity` (0 -> 0). Mutations: the spacing floor dropped; plausible-wrong: thunder in m/ms; the
  capture gate dropped; the envelope never returns to 0.

### Task 2: the driver, the light, the voice

- [ ] `render/LightningDriver.jsx` + `lightningFlashRef` (render/mood.js beside `sunDirRef`); Atmosphere adds the
  flash; `synthVoices.thunder` (a noise crack into the existing low rumble). Structural pins in an existing
  source-reading gate (no new source-grep file).

### Task 3: prove it in the running game

- [ ] An e2e: force a storm, force a strike through the driver's own schedule seam, read the frame's mean luminance
  in a sky region and a terrain region before, at the peak and 400 ms after: up >= X% at the peak, back within noise
  after; a spy on the synth voice sees `thunder` after the flash, delayed. CONTROL: the same under capture — no
  change. OPEN the peak frame and look at it.

### Task 4: review with the leaves and the ores.
