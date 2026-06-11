# S3-M1 — The SoundManager Synth-Voice Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-11-crafty-s3-demonolith-design.md` (S3-M1 row + the 5-trap catalog — this milestone hits trap 1 only: aspect-sfx-gates reads SoundManager.jsx BY PATH and repoints IN THE SAME COMMIT).
> **The verified inventory (read at plan time):** 22 generator closures in SoundManager.jsx (:439 generateTone(freq,dur,type) + :474 generateNoise(dur) — the two PARAMETERIZED helpers — and 20 named voices :493-915), every one closing ONLY over `audioContext.current`; the registry block :401-437 assigns 24 named buffers (the first 6 via tone/noise calls, 18 via dedicated builders); DAY/NIGHT/BOSS_CHORDS at :5-16 (already module constants) + getArpeggiatorBpm :213 (reads the store inline — parameterize).

**Goal:** The first de-monolith milestone: SoundManager's ~480 LOC of pure DSP move to `audio/synthVoices.js` as `(ctx)=>AudioBuffer` factories behind ONE VOICES registry; the chords + bpm rule move to `audio/musicTheory.js`; the buffer shapes get their FIRST-EVER characterization (the closures were untestable until this move — the extraction IS the missing coverage). Extraction-only: same waveform math, byte-identical buffers.

**Architecture:** `makeTone(ctx, freq, dur, type)` / `makeNoise(ctx, dur)` exported helpers + each voice as `makeXxxSound(ctx)` (the closure body verbatim, `audioContext.current` → the `ctx` param) + `export const VOICES = { blockPlace: (ctx) => makeTone(ctx, 200, 0.1, 'square'), …, rune: makeRuneSound }` (all 24 names). SoundProvider keeps `sounds.current` + playback/occlusion/spatial; `generateSounds` collapses to a registry loop. jsdom can't run WebAudio — the characterization uses a FAKE ctx (`{ sampleRate: 44100, createBuffer: (ch, frames, rate) => ({ length: frames, sampleRate: rate, _d: new Float32Array(frames), getChannelData() { return this._d; } }) }`).

**Tech Stack:** the 22 closures (verbatim moves); aspect-sfx-gates.test.js (the ONE by-path gate: registry-line regexes `sounds\.current\.X =` + builder regexes `const generateXSound = ` — both shapes change); tests/gates/static-gates.test.js walks src/ by glob so audio/ is auto-covered.

---

### Task 1: `audio/synthVoices.js` + the characterization (one commit — the move IS the coverage)

**Files:** Create `frontend/src/audio/synthVoices.js` + `frontend/src/audio/synthVoices.test.js`; Modify `frontend/src/SoundManager.jsx`; Modify `frontend/tests/gates/aspect-sfx-gates.test.js`

- [ ] **Step 1:** create `audio/synthVoices.js`: the module docstring ("the all-synth voice bank (#74) — every game sound as a pure (ctx)=>AudioBuffer factory; extracted from SoundManager S3-M1: same math, byte-identical buffers; the fake-ctx tests are the DSP's first characterization"); move the 22 function bodies VERBATIM with `audioContext.current` → `ctx` (rename generate→make for the new idiom); export the VOICES map with all 24 registry names mapping the :403-436 assignments exactly (`blockPlace/blockBreak/footstep/jump/pickup/craft/magic/attack/hit/defeat/swing/magicCast/magicHit/magicExplosion/magicCharge/levelUp/roar/grab/hurl/slam/anvilHit/bind/ignite/freeze/zap/rune`).
- [ ] **Step 2:** SoundManager: delete the 22 closures + the 36-line registry block; `import { VOICES } from './audio/synthVoices';` and `const generateSounds = () => { if (!audioContext.current) return; for (const [name, make] of Object.entries(VOICES)) sounds.current[name] = make(audioContext.current); };`
- [ ] **Step 3:** the characterization (`audio/synthVoices.test.js`, the fake ctx above): (a) VOICES has EXACTLY the 26 names — no, exactly the 24-name list above (lock the set with a sorted-keys equality); (b) every factory returns a buffer with `length === Math.floor(expectedDur * 44100)` — table the durations from the sources (tone-based take their literal, dedicated voices their `duration` const); (c) every buffer is NON-SILENT (`some(|s| > 0.01)`) and UNCLIPPED (`every(|s| <= 1.0)`); (d) two spot waveform pins (the bind G4→C5 frequency step at t<0.18 vs after; the zap's fast decay: |s| at t=0.15 < |s| at t=0.01) — characterization, not over-pinning.
- [ ] **Step 4:** repoint aspect-sfx-gates IN THIS COMMIT: the registry-line check becomes (a) `read('audio/synthVoices.js')` contains `${n}:` in VOICES (or `const make${G}Sound`) for the 6 Aspect names + the 4 elemancer names, and (b) SoundManager still LOOPS the registry (`Object.entries(VOICES)`) — the wiring half (roar at the beast-enter site etc.) is untouched.
- [ ] **Step 5: full battery → commit** `refactor(s3-m1): the synth voices extract to audio/ — 22 pure factories, the DSP's first characterization`

### Task 2: `audio/musicTheory.js`

**Files:** Create `frontend/src/audio/musicTheory.js` + test; Modify `frontend/src/SoundManager.jsx`

- [ ] **Step 1:** move DAY/NIGHT/BOSS_CHORDS verbatim + `getArpeggiatorBpm(bossActive, hostileCount)` as a pure function (the :213 body with its inline `useGameStore.getState()` reads lifted to params; SoundManager's call sites pass them). Test: the chord tables' shapes + the bpm thresholds (read the :213-221 body at build and pin its exact branch values).
- [ ] **Step 2: battery → commit** `refactor(s3-m1): music theory extracts pure — chords + the arpeggiator bpm rule`

### Task 3: close-out — the spec's S3-M1 row ✅ · this plan SHIPPED · ACTIVE_PLAN → S3-M2 (the EnhancedMagicSystem data pulls) with the standing note that an EXPERIENCE interleave is due within ~2 milestones (content @83).

## Self-review
- Spec coverage: S3-M1 row = synthVoices + musicTheory + the in-commit characterization + the gate repoint — T1/T2 ✓. Trap 1 handled in T1-Step 4; traps 2-5 don't apply (no gated-token moves, no worker URLs, no SM blocks, no anchors in SoundManager).
- Placeholders: none — the 24-name registry list is enumerated; the fake-ctx shape is concrete; the two waveform pins are named.
- Type consistency: `(ctx)=>AudioBuffer` everywhere; VOICES name→factory; generateSounds' guard semantics preserved (the null-ctx early return).
