# SOULBIND M4 — SNARE End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-10-crafty-s2b3-soulbind-design.md` §2/§3 M4.

**Goal:** Hold X on a weakened hostile → a 1.1s jade channel with a visible tether → the creature binds into the squad (Soul spent, mob converted, chime) — the verb that makes SOULBIND playable.

**Architecture:** KeyX → the `snare` intent (mirrors KeyV's edge shape at Components :401-426). A soulbind SM block sits as the voidhand block's sibling in the same `!isPerfProbe()` section (:600-648): per-frame target = nearest valid snareable from `GameMethods.checkMobsInMeleeCone(playerPos, aimDir, SNARE_RANGE, AIM_CONE_ARC)` (returns full entities); the bind apply-site debits SNARE_COST + `GameMethods.captureMob(id)` + jade re-tint + the bind chime. The channel state flows to render via a TRANSIENT module channel (`snareChannel.js`, the hurlChannel pattern — zero setState per frame); a thin SnareTetherSystem draws the ribbon; the snareable TELL = the mob health bar tints jade at ≤30% HP (an honest "weakened" indicator). Capture-inert: intents never fire in capture; the tether system self-nulls.

**Tech Stack:** inputState INTENT_KEYS (:40); decideSoulbind/soul.js (M2); captureMob/alliesQuery (M3); soulbind jade `#3DFFB0` (design §2); SoundManager named-buffer registry; ProceduralRibbonTrail/buildRibbonIndices (the sword-trail primitive — READ its props at build time before reusing).

---

### Task 1: the `snare` intent + KeyX edges

**Files:** Modify `frontend/src/input/inputState.js` (:40), `frontend/src/Components.jsx` (the KeyV blocks :401-426); extend the inputState test (locate `inputState.test.js` and twin the 'grab' assertions)

- [ ] **Step 1 (red):** extend the inputState test — INTENT_KEYS contains 'snare'; setIntent('snare', true) reads back; reset clears it (twin the 'grab' lines exactly).
- [ ] **Step 2:** `INTENT_KEYS = [..., 'roar', 'grab', 'snare']`. In Components keydown beside KeyV: `if (e.code === 'KeyX') { setIntent('snare', true); }` (+ the keyup false twin). Comment: `// S2-B3-M4: snare -> the abstract 'snare' intent (SOULBIND SM in useFrame). The Aspect-verb row: R=roar, V=grab, X=snare.`
- [ ] **Step 3: green + commit** `feat(soulbind-m4): the snare intent on KeyX (the Aspect-verb row R/V/X)`

### Task 2: the SM block + the bind apply-site (the playable core)

**Files:** Modify `frontend/src/Components.jsx` (sibling of the voidhand SM block, inside the same `!isPerfProbe()` guard); Create `frontend/src/game/snareChannel.js` + colocated test; Modify `frontend/src/SoundManager.jsx` (the 'bind' chime); extend `frontend/tests/gates/aspect-sfx-gates.test.js` NAMES + a call-site assertion

- [ ] **Step 1:** `snareChannel.js` — the transient render channel (hurlChannel's sibling, TDD):
```js
/**
 * snareChannel.js — S2-B3-M4: the TRANSIENT channel-state bridge (the hurlChannel pattern).
 * Components writes {channeling, targetId, progress, from, to} per frame; SnareTetherSystem
 * reads it in useFrame. Zero store writes per frame (Game-Loop-Isolation). Single slot.
 */
const _snare = { channeling: false, targetId: null, progress: 0, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 } };
export function writeSnareState(s) { Object.assign(_snare, s); }
export function readSnareState() { return _snare; }
export function clearSnareState() { _snare.channeling = false; _snare.targetId = null; _snare.progress = 0; }
```
  (test: write→read roundtrip; clear resets the flags.)
- [ ] **Step 2:** the SoundManager 'bind' chime — a 2-note rising jade resolve in the grab-chirp family (whole-tone rise that LANDS — binding completes):
```js
  // SOULBIND bind — the grab-chirp's resolved sibling: two whole-tone steps that LAND (a soft major land).
  const generateBindSound = () => {
    if (!audioContext.current) return null;
    const sampleRate = audioContext.current.sampleRate;
    const duration = 0.45;
    const frameCount = sampleRate * duration;
    const buffer = audioContext.current.createBuffer(1, frameCount, sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      const f = t < 0.18 ? 392 : 523.25; // G4 -> C5: the rise RESOLVES (binding lands)
      const tri = 2 * Math.abs(2 * (t * f - Math.floor(t * f + 0.5))) - 1;
      const shimmer = Math.sin(2 * Math.PI * f * 2 * t) * 0.2;
      const env = Math.min(t * 25, 1) * Math.exp(-t * 4.5);
      d[i] = (tri * 0.55 + shimmer) * env * 0.4;
    }
    return buffer;
  };
```
  + registry `sounds.current.bind = generateBindSound();` + wrapper `playBind: (pos) => ...` (the playGrab twin). Extend the aspect-sfx gate: NAMES += 'bind', builders += 'generateBindSound', call-site `playSpatialSound\('bind'` in Components.
- [ ] **Step 3:** the Components SM block (AFTER the voidhand block, same guard; imports: makeSoulbindState/decideSoulbind/SNARE_CHANNEL_SEC from game/soulbind, canSnare as sCanSnare + SNARE_COST from game/soul, alliesQuery from ecs/world, writeSnareState/clearSnareState from game/snareChannel, SOULBIND_JADE = '#3DFFB0' inline const):
```js
      // S2-B3-M4: the SOULBIND snare SM — the voidhand block's sibling. Target validity is computed
      // PER FRAME (the mob keeps moving; holding aim IS the skill — design §2).
      const snare = vin.snare;
      const snareEdge = snare && !prevSnareRef.current;
      prevSnareRef.current = snare;
      let snareTargetId = null;
      let snareTarget = null;
      if (GameMethods.checkMobsInMeleeCone) {
        const sDir = new THREE.Vector3();
        camera.getWorldDirection(sDir); // unflattened — aim where you LOOK (the aimedMobDist precedent)
        const candidates = GameMethods.checkMobsInMeleeCone(camera.position, sDir, SNARE_RANGE, Math.PI / 8) || [];
        // nearest snareable: weakened (<=30% HP), hostile (not passive; villager converter-blocked too)
        let best = null, bestD = Infinity;
        for (const e of candidates) {
          if (!e || e.passive || e.health > 0.3 * e.maxHealth || e.health <= 0) continue;
          const dx = e.position.x - camera.position.x, dz = e.position.z - camera.position.z;
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best) { snareTargetId = best.id; snareTarget = best; }
      }
      const squadCap = 2 + ((stv.unlockedTalents?.['soulbind_pack'] > 0) ? 1 : 0);
      const { sm: ssm, action: saction } = decideSoulbind(soulbindSMRef.current, {
        snareEdge,
        active: vin.active,
        alive: stv.isAlive,
        now: state.clock.getElapsedTime(),
        canSnare: sCanSnare(stv.soulBanked) && (stv.unlockedTalents?.['soulbind_snare'] > 0) && alliesQuery.entities.length < squadCap,
        targetId: snareTargetId,
      });
      soulbindSMRef.current = ssm;
      if (saction === 'bind') {
        stv.accrueSoul(-SNARE_COST); // canSnare vetted the bank
        const ally = GameMethods.captureMob ? GameMethods.captureMob(ssm.targetId ?? snareTargetId) : null;
        if (ally) {
          // the jade re-tint: lerp the body color 45% toward the SOULBIND identity (design §2)
          ally.color = new THREE.Color(ally.color).lerp(new THREE.Color(SOULBIND_JADE), 0.45).getStyle();
          if (stv.playSpatialSound) stv.playSpatialSound('bind', [ally.position.x, ally.position.y, ally.position.z], 1, 25);
        }
        clearSnareState();
      } else if (ssm.channeling && snareTarget) {
        writeSnareState({
          channeling: true, targetId: snareTargetId,
          progress: Math.min((state.clock.getElapsedTime() - ssm.channelStart) / SNARE_CHANNEL_SEC, 1),
          from: { x: camera.position.x, y: camera.position.y - 0.25, z: camera.position.z },
          to: { x: snareTarget.position.x, y: snareTarget.position.y + 0.4, z: snareTarget.position.z },
        });
      } else {
        clearSnareState();
      }
```
  NOTE the bind-action targetId: decideSoulbind clears `out.targetId`? READ the M2 SM — on 'bind' the reducer does NOT null targetId (only break/cancel do) — verify and use `ssm.targetId`; if the reducer nulls it, capture BEFORE the decide call from the previous frame's sm (`soulbindSMRef.current.targetId`). Pin whichever is true with a unit test on the SM (extend soulbind.test.js: 'bind preserves targetId for the apply-site').
  Refs to add at the top beside voidhandSMRef: `const soulbindSMRef = useRef(makeSoulbindState()); const prevSnareRef = useRef(false);` + `const SNARE_RANGE = 12;`
- [ ] **Step 4: full battery + commit** `feat(soulbind-m4): SNARE plays — channel, bind, Soul debit, capture, jade tint, chime`

### Task 3: the tether ribbon + the snareable tell (the look; judged in-world)

**Files:** Create `frontend/src/world/SnareTetherSystem.jsx`; Modify `frontend/src/Components.jsx` (mount beside `<HurlSystem />`); Modify the MobModel health-bar tint site in `frontend/src/SimplifiedNPCSystem.jsx`; extend `frontend/tests/gates/voidhand-noremesh-gates.test.js` GATED list with the new system file (it must stay voxel-free)

- [ ] **Step 1:** SnareTetherSystem — ONE always-mounted line-ish tether driven transiently (the impact-flash pattern; NO new lights): a thin stretched cylinder (or a 2-point ProceduralRibbonTrail if its API fits — READ Components :1260/:1496 first) from `readSnareState().from` to `.to`, jade `#3DFFB0`, opacity = 0.25 + 0.55 * progress (the channel VISIBLY tightens), `visible=false` whenever `!channeling` or `isCaptureMode()`.
- [ ] **Step 2:** the tell — in the MobModel floating health bar (locate the bar's color/material), tint the fill jade when `entity.health <= 0.3 * entity.maxHealth && !entity.passive` (an honest "weakened — bindable" read; static under capture since health is static).
- [ ] **Step 3:** in-world judge (the charter look-gate): drive a real snare — dev console: damage a spawned hostile to <30% via `GameMethods.damageMob(id, dmg)`, hold X aimed at it, screenshot mid-channel (the ?perf=C camera-lock method if the live SM fights it — the tether reads from the transient channel, so a synthetic `writeSnareState({...})` burst is the deterministic fallback for FRAMING only; the REAL channel smoke must also pass via __hurlDebug-style observation or the store/alliesQuery delta). Judge: does the tether read as a soul-ribbon (not a laser)? Does the jade bar tell? Iterate once if weak (the M7-T2 tune precedent).
- [ ] **Step 4: full battery** (visual 13/13 — the tether is capture-nulled) **+ commit** `look(soulbind-m4): the jade tether + the weakened tell (judged in-world)`

### Task 4: close-out
- [ ] Spec §3 M4 row ✅ · this plan ✅ SHIPPED · KRB playtest cue (weaken a zombie → hold X → watch the tether tighten → the bind chime + jade creature follows... no following until M5 — say so honestly: "it stands guard where bound until M5") · ACTIVE_PLAN → M5 (squad AI: the pure brain + the 15Hz bridge + AllyModel render).

## Self-review
- Spec coverage: M4 row = "intent + channel + tell + ribbon + bind conversion + SFX" — T1 (intent), T2 (channel SM + bind + SFX), T3 (ribbon + tell) ✓. The smoke ("snare a live low-HP mob → converts, no XP/kill emitted") is covered by the M3 invariant tests (conversion ≠ kill path — captureMob never touches damageMob) + the T3.3 real-channel smoke.
- Placeholders: T2 Step 3 carries the full block; the one open question (does 'bind' preserve sm.targetId) is flagged with a verify-then-pin instruction, not left silent. T3 Step 1's ribbon-vs-cylinder choice is an explicit read-then-pick at build, bounded to two named options.
- Type consistency: `decideSoulbind` ctx keys match M2's; `SNARE_RANGE=12`/`Math.PI/8` match the design §2 "12m cone"; SOULBIND_JADE matches the design token.
