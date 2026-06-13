# Mob aggro-snarl audio (enemy-presence split) Implementation Plan

> **✅ SHIPPED (loop iter 145, 2026-06-13).** `makeAggroGrowl` voice added to `synthVoices.js` (registered in `VOICES`, contract 30→31) + the false→true `isAggro` edge wired in `SimplifiedNPCSystem.jsx`'s worker-update loop (cooldown-guarded, spatial) + a `mob-aggro-audio-gate` wiring gate. Mobs now SNARL when they notice you (a threat cue before contact), distinct from the heroic WILDHEART roar. Battery: 1022→1024 unit · build clean · visual **18/18 byte-identical** (audio-only + capture-suppressed mobs → no re-baseline). Commit `<feat>`.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Give mobs an audible THREAT CUE — when a mob goes aggro (notices the player), it snarls spatially, so the player HEARS danger approaching instead of only hearing a mob when it's already hitting them. A fresh `aggroGrowl` synth voice (distinct from the heroic WILDHEART `roar`) fired on the false→true `isAggro` edge, cooldown-guarded.

**Architecture (charter §5 SOTA interleave — audio, the §6 "hit/kill audio split player vs enemy" item):** a pure `makeAggroGrowl(ctx)=>AudioBuffer` added to the existing `audio/synthVoices.js` voice bank (registered in `VOICES`, so `SoundProvider` loads it like every other voice) + a single rising-edge wire in `SimplifiedNPCSystem.jsx`'s worker-update loop (`:296`, where `entity.isAggro = update.isAggro` is applied) that fires `playSpatialSound('aggroGrowl', mobPos, 0.9, 22)` — a module-level global cooldown (~2.5s) keeps a siege turning aggro from a wall-of-growls.

**Why capture-safe (no re-baseline):** mobs are suppressed under `isCaptureMode()` (SpawnerSystem) → no aggro edge fires in capture; and audio never touches pixels. The 18 visual baselines stay byte-identical.

**Tech Stack:** the all-synth pure-factory voice bank (`(ctx)=>AudioBuffer`) + the fake-ctx vitest characterization pattern (`synthVoices.test.js`) + the miniplex worker-update seam.

---

### Task 1: the `aggroGrowl` voice (TDD red-first)

**Files:** Modify `frontend/src/audio/synthVoices.js`; Modify `frontend/src/audio/synthVoices.test.js`

- [ ] **Step 1 (RED):** in `synthVoices.test.js` add `'aggroGrowl'` to `ALL_NAMES` and bump the contract count `30 → 31`; add a pin asserting the snarl is SHORTER and HIGHER than the heroic roar (it's an enemy, not the hero):
```js
it('waveform pin: aggroGrowl is a shorter, higher snarl than the heroic roar', () => {
  const growl = VOICES.aggroGrowl(fakeCtx());
  const roar = VOICES.roar(fakeCtx());
  expect(growl.length).toBeLessThan(roar.length);              // a bark, not a bellow
  const crossings = (buf, sec) => { const d = buf.getChannelData(0); const w = Math.floor(0.08 * 44100);
    const i0 = Math.floor(sec * 44100); let c = 0;
    for (let i = i0 + 1; i < i0 + w && i < d.length; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) c++; return c; };
  expect(crossings(growl, 0.02)).toBeGreaterThan(crossings(roar, 0.02)); // higher pitch = more crossings
});
```
Run `npx vitest run src/audio/synthVoices.test.js` → FAIL (`VOICES.aggroGrowl` undefined + count 30≠31).

- [ ] **Step 2 (GREEN):** in `synthVoices.js` add the factory (place after `makeRoarSound`) and register it in `VOICES`:
```js
export const makeAggroGrowl = (ctx) => {
    if (!ctx) return null;
    const sampleRate = ctx.sampleRate;
    const duration = 0.34;                       // a short bark vs the roar's 0.7 bellow
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const k = t / duration;
      const freq = 130 + 60 * Math.exp(-k * 6) - 40 * k; // a lunge: ~190 snaps down to ~90Hz
      const saw = 2 * (t * freq - Math.floor(t * freq + 0.5));
      const rasp = Math.sin(2 * Math.PI * freq * 1.5 * t) * 0.4; // a dissonant fifth = menace
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 10) * 0.4; // a teeth/bite transient
      const env = Math.min(t * 60, 1) * Math.exp(-t * 5.5);          // snap-attack, quick decay
      d[i] = (saw * 0.55 + rasp + noise) * env * 0.42;               // peak ~0.5 (headroom safe)
    }
    return buffer;
};
```
Register: add `aggroGrowl: makeAggroGrowl,` to the `VOICES` object (after `roar: makeRoarSound,`).
Run the test → PASS (31 names; the pin holds).

### Task 2: wire the rising aggro edge + a wiring gate

**Files:** Modify `frontend/src/SimplifiedNPCSystem.jsx`; Create `frontend/tests/gates/mob-aggro-audio-gate.test.js`

- [ ] **Step 1 (gate RED):** create the gate asserting the edge is wired (the "signature-fires-in-prod" insurance):
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __dir = dirname(fileURLToPath(import.meta.url));
const npc = readFileSync(resolve(__dir, '../../src/SimplifiedNPCSystem.jsx'), 'utf8');
describe('mob aggro-snarl audio is wired (enemy-presence cue)', () => {
  it('fires aggroGrowl on the false->true isAggro edge, cooldown-guarded', () => {
    expect(npc).toMatch(/playSpatialSound\(\s*['"]aggroGrowl['"]/);
    expect(npc).toMatch(/!entity\.isAggro\s*&&\s*update\.isAggro/); // the rising edge, not every frame
    expect(npc).toMatch(/_lastAggroGrowl/);                          // cooldown state present
  });
});
```
Run `npx vitest run tests/gates/mob-aggro-audio-gate.test.js` → FAIL.

- [ ] **Step 2 (GREEN):** in `SimplifiedNPCSystem.jsx` add module-level state near the other module consts (top of file, after imports):
```js
const AGGRO_GROWL_COOLDOWN_SEC = 2.5; // a turning siege snarls ONCE, not 20x
let _lastAggroGrowl = -Infinity;
```
Then in the worker-update loop replace the bare `entity.isAggro = update.isAggro;` (`:296`) with the edge-detect BEFORE the assignment:
```js
            // AUDIO (enemy-presence split): the false->true aggro edge SNARLS spatially — you HEAR a
            // hostile notice you before it reaches you (global cooldown so a siege turn isn't a wall of growls).
            if (!entity.passive && !entity.isAggro && update.isAggro && store.playSpatialSound) {
              const nowS = performance.now() / 1000;
              if (nowS - _lastAggroGrowl > AGGRO_GROWL_COOLDOWN_SEC) {
                _lastAggroGrowl = nowS;
                store.playSpatialSound('aggroGrowl', [entity.position.x, entity.position.y, entity.position.z], 0.9, 22);
              }
            }
            entity.isAggro = update.isAggro;
```
Run the gate → PASS.

### Task 3: verify + close-out

- [ ] **Step 1: battery** (from `frontend/`): `npx vitest run` (count GROWS — Task1 pin + Task2 gate; 0 fail) · `npm run build` clean · `npx vitest run --config vitest.visual.config.js` → **18/18 byte-identical** (audio-only + capture-suppressed mobs) · arrow-grep the two touched/created src+test files (zero-emoji gate).
- [ ] **Step 2: commit + close-out** — `feat(audio): mob aggro-snarl on the isAggro edge (enemy-presence cue, aggroGrowl voice)` + banner this plan ✅ SHIPPED + ACTIVE_PLAN/CHANGELOG + SOTA interleave-ledger refresh (audio @ this iter). Ear-verify is Kevin-async (KEVIN-REVIEW-BATCH note: new enemy snarl, tunable AGGRO_GROWL_COOLDOWN_SEC / range 22 / vol 0.9).

## Self-Review
**Spec coverage:** §6 "hit/kill audio split (player vs enemy)" + "ambient presence" ✓. **Placeholder scan:** all code is concrete (synth math + the exact edge-wire). **Type consistency:** `playSpatialSound(name, [x,y,z], vol, range)` matches the motif call-sites (Components:589 `('motifWildheart', [..], 1, 40)`). **Headroom:** peak ~0.5 < 1.0 (test enforces ≤1.0). **Capture-safety:** mobs suppressed in capture → edge never fires; audio never renders → 18/18 holds.
