# SFX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.
> Kevin's mega-directive point (1): "do a thorough review and enhancement of all sound effects too."
> AUDIO QUALITY IS EAR-GATED — build the autonomous-verifiable infrastructure + surface tuning for Kevin's ear.

**Goal:** A cleaner, louder-without-clipping, more cohesive soundscape: route the whole mix through ONE master
bus + limiter (no more per-voice clipping when many sounds sum), confirm robust autoplay-resume, then review
per-SFX levels/timbre + fill gaps — the quality pass judged by Kevin's ear.

## Live-code grounding (read-before-architect — done)
- `SoundManager.jsx` `useSounds()`: ONE shared `audioContext.current` for music + SFX. `generateSounds()` builds
  the buffer bank from `VOICES` (audio/synthVoices.js, pure `(ctx)=>AudioBuffer` factories, 37 voices, already
  characterization-tested). `playSound(name, rate)` plays a buffered SFX. `resume()` IS called on the ctx in the
  music-start paths (L122/L278).
- **THE GAP (verified):** there is NO single master bus + limiter. Every voice connects STRAIGHT to
  `audioContext.current.destination` — music pad (L175), waterBass (L190), arp (L288), `playSound` SFX (L485),
  `playTone` (L512). So when many sounds sum the mix can exceed 0 dBFS and CLIP; there's also no single
  master-volume/headroom point. (synthVoices keep per-buffer headroom, but the SUM is unmanaged.)
- Audio is ALL-SYNTH (Kevin decision #74 — external gen rejected). Quality = Kevin's ear (no headless ear).

---

## Slice 1 — pure `createMasterBus(ctx)` helper + red-first test (the testable kernel)
- [ ] Create `frontend/src/audio/masterBus.js`: `createMasterBus(ctx)` -> `{ input, limiter }` where
  `input` (GainNode) -> `limiter` (DynamicsCompressor as a brickwall-ish limiter: threshold -3, knee 0,
  ratio 20, attack 0.003, release 0.25) -> `ctx.destination`. Pure over a caller-supplied ctx (mirrors
  synthVoices) -> unit-testable with a fake ctx. Returns null for a nullish ctx.
- [ ] Red-first `frontend/src/audio/masterBus.test.js` (mirror the synthVoices fake-ctx pattern): null ctx -> null;
  with a fake ctx -> returns {input, limiter}; input.connect(limiter) + limiter.connect(destination) wired;
  the 5 limiter params set via setValueAtTime.
- [ ] VERIFY: build clean; npx vitest run grows; helper unused (no consumer yet) -> gate 20/20. Commit.

## Slice 2 — route the whole mix through the master bus (the autonomous infra win)
- [ ] In `SoundManager.jsx` `useSounds()`: a `masterBusRef` + a lazy `getMasterBus()` that calls
  `createMasterBus(audioContext.current)` once (re-create if the ctx changed). Replace every
  `audioContext.current.destination` connect-target (the 5 sites above) with `(getMasterBus()?.input || audioContext.current.destination)`.
  Now music + SFX sum through the limiter before the speakers -> no clipping; one headroom point.
- [ ] A static/source gate: SoundManager imports createMasterBus + has no remaining `.connect(audioContext.current.destination)` at the voice sites (or asserts getMasterBus is used). VERIFY build + unit + gate 20/20 (audio is runtime, not in the visual gate). Commit. EAR-CHECK (Kevin): the mix should sound fuller + never crackle when many sounds fire — surface to KEVIN-REVIEW.

## Slice 3 — autoplay-resume robustness (verify, fix if needed)
- [ ] resume() exists in the music-start paths; confirm a FIRST USER GESTURE reliably resumes the ctx for SFX
  too (an `enterPlay`/pointer-gesture resume), so early SFX aren't dropped on a suspended ctx. If a gap exists,
  add a one-time resume on first gesture. Autonomous-verifiable (the call wiring). Commit.

## Slice 4 — (EAR-GATED) per-SFX level/timbre review + gaps
- [ ] With the bus in place, review per-voice gains for balance (e.g. footsteps quieter, the boss roar/anvil
  punchier) + add any missing SFX (e.g. a shrine-reached chime, a victory sting if not covered). All in
  `audio/synthVoices.js` (+ the VOICES registry + its 37-name test). Build + unit; EAR-CHECK -> KEVIN-REVIEW
  (do NOT claim quality headless). This is the "thorough review" — surface a checklist for Kevin's ear.

## Notes / Self-Review
- **DRY/testable:** the bus is a pure helper (like synthVoices) so the DSP-ish wiring is unit-tested off a fake ctx.
- **One shared ctx** already exists -> the bus can unify everything; no multi-context problem.
- **ALL-SYNTH** (decision #74) — no external audio. **Quality is EAR-GATED** -> Slices 1-3 are autonomous; Slice 4 + the overall mix feel are Kevin ear-checks.
- **STUCK:** if rerouting destabilizes the music timing -> route SFX through the bus first, leave music direct, iterate.
