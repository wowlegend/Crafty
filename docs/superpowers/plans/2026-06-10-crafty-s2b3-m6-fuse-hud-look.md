# SOULBIND M6 — FUSE + Hybrid Roster + Soul HUD + The Look Judge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-10-crafty-s2b3-soulbind-design.md` §2/§3 M6.
> M6 also carries the CONSOLIDATED LOOK DEBT: the parked M4 tether judge (writeup + ranked hypotheses in
> `.superpowers/s2b3-soulbind-m4-refs/HOW.md` — NDC-projection check FIRST) + ally jade tint + hybrid
> silhouettes, judged in-world together.

**Goal:** Two bound allies FUSE into one curated hybrid (the Aspect's distinctive hook); the Soul bank reads on the HUD (jade, unlock-gated); SOULBIND's full look passes an in-world judge.

**Architecture:** `game/hybrids.js` owns the roster + lookup + `applyFusion` (consume two allies, spawn the hybrid AS an ally reusing the first consumed id — unique by construction). The FUSE channel is a `decideFuse` reducer twin INSIDE game/soulbind.js (same-file twin; 1.4s; **the channel only STARTS when fusion CAN complete** — pair-near + bank + a roster entry exist at start — so no mid-flight refuse state exists at all, a deliberate design simplification recorded here). One key, an apply-site arbiter: a valid SNARE target wins; else FUSE arms. HUD: `SoulBar` = the KineticBar twin + the 4-surface token chain (tokens → cssVars → tailwind → StatBar maps).

**Tech Stack:** alliesQuery/baseType (M3-M5); FUSE_COST/canFuse (M2); the KineticBar/token precedent (HUD.jsx :56-66, tokens.js :73, StatBar :9-10, cssVars, tailwind.config.cjs); the bind chime at rate 0.7 = the v1 fuse swell (deliberate reuse, zero new builder; M7 may upgrade).

---

### Task 1: `game/hybrids.js` — the curated roster + fusion (TDD)

**Files:** Create `frontend/src/game/hybrids.js` + `frontend/src/game/hybrids.test.js`

- [ ] **Step 1: failing tests:**
```js
import { describe, it, expect, afterEach } from 'vitest';
import { HYBRIDS, fuseKey, lookupHybrid, applyFusion, FUSE_RADIUS } from './hybrids';
import { ecs, alliesQuery } from '../ecs/world';

const added = [];
const addAlly = (id, baseType, x = 0) => {
  const e = ecs.add({ isAlly: true, position: { x, y: 10, z: 0 }, type: baseType, baseType, id,
    health: 60, maxHealth: 60, color: '#3DFFB0' });
  added.push(e);
  return e;
};
afterEach(() => { while (added.length) { try { ecs.remove(added.pop()); } catch { /* gone */ } } });

describe('S2-B3-M6: the curated hybrid roster', () => {
  it('carries the 3 designed hybrids keyed by sorted base pairs', () => {
    expect(lookupHybrid('spider', 'zombie').id).toBe('dreadweaver');
    expect(lookupHybrid('zombie', 'spider').id).toBe('dreadweaver'); // order-free
    expect(lookupHybrid('cow', 'skeleton').id).toBe('bonehide_bulwark');
    expect(lookupHybrid('skeleton', 'spider').id).toBe('marrowspinner');
    expect(lookupHybrid('pig', 'pig')).toBeUndefined(); // no entry -> no fuse (the channel never starts)
  });
  it('every hybrid is complete parametric MobModel data (render-ready, no lookups at draw time)', () => {
    for (const h of Object.values(HYBRIDS)) {
      for (const k of ['id', 'name', 'color', 'bodySize', 'headSize', 'health', 'speed', 'damage']) {
        expect(h[k], `${h.id} missing ${k}`).toBeDefined();
      }
    }
  });
  it('applyFusion consumes BOTH allies and spawns the hybrid as an ALLY at their midpoint (first id reused)', () => {
    const a = addAlly(101, 'spider', 0);
    const b = addAlly(102, 'zombie', 4);
    const before = alliesQuery.entities.length;
    const hy = applyFusion(ecs, a, b);
    expect(hy).not.toBe(null);
    expect(alliesQuery.entities.length).toBe(before - 1); // two consumed, one born
    expect(hy.id).toBe(101);
    expect(hy.isAlly).toBe(true);
    expect(hy.hybridId).toBe('dreadweaver');
    expect(hy.position.x).toBeCloseTo(2); // the midpoint
    expect(hy.maxHealth).toBe(HYBRIDS.dreadweaver.health);
    added.push(hy);
  });
  it('applyFusion refuses a pair with no roster entry (defense in depth behind the start-gate)', () => {
    const a = addAlly(103, 'pig', 0);
    const b = addAlly(104, 'pig', 2);
    expect(applyFusion(ecs, a, b)).toBe(null);
    expect(alliesQuery.entities.length).toBeGreaterThanOrEqual(2); // untouched
  });
});
```
- [ ] **Step 2: red** → **Step 3: implement:**
```js
/**
 * hybrids.js — S2-B3-M6: the CURATED fusion roster (the spec-locked v1 stance: lookup, never
 * procedural splicing). Keys are sorted baseType pairs; values are COMPLETE parametric MobModel
 * data (the BEAST_FORMS data-driven precedent) — render-ready, role-spread (skirmisher/bruiser/
 * harasser), names with weight. applyFusion consumes two allies and births ONE hybrid ally at
 * their midpoint, reusing the first consumed id (unique by construction; no id-allocator needed).
 */
export const FUSE_RADIUS = 6; // both allies must be this near the player to fuse

export const HYBRIDS = {
  dreadweaver: {
    id: 'dreadweaver', name: 'Dreadweaver', color: '#2E8B6A',
    bodySize: [1.2, 0.9, 1.5], headSize: [0.7, 0.6, 0.7], legMode: 'spider',
    health: 140, speed: 2.8, damage: 14, role: 'skirmisher',
  },
  bonehide_bulwark: {
    id: 'bonehide_bulwark', name: 'Bonehide Bulwark', color: '#C9CDB8',
    bodySize: [1.5, 1.3, 1.9], headSize: [0.8, 0.8, 0.9], legMode: 'quad',
    health: 240, speed: 1.2, damage: 10, role: 'bruiser',
  },
  marrowspinner: {
    id: 'marrowspinner', name: 'Marrowspinner', color: '#9FE8C8',
    bodySize: [0.8, 0.6, 1.3], headSize: [0.55, 0.5, 0.55], legMode: 'spider',
    health: 90, speed: 3.4, damage: 9, role: 'harasser',
  },
};

const PAIRS = {
  'spider+zombie': 'dreadweaver',
  'cow+skeleton': 'bonehide_bulwark',
  'skeleton+spider': 'marrowspinner',
};

export function fuseKey(a, b) {
  return [a, b].sort().join('+');
}

/** lookupHybrid(baseA, baseB) -> the hybrid def or undefined (no entry = the channel never starts). */
export function lookupHybrid(a, b) {
  return HYBRIDS[PAIRS[fuseKey(a, b)]];
}

/** applyFusion(world, allyA, allyB) -> the hybrid ally entity (allyA's id reused) or null. */
export function applyFusion(world, a, b) {
  if (!a || !b || !a.isAlly || !b.isAlly) return null;
  const def = lookupHybrid(a.baseType || a.type, b.baseType || b.type);
  if (!def) return null;
  const mid = { x: (a.position.x + b.position.x) / 2, y: Math.max(a.position.y, b.position.y), z: (a.position.z + b.position.z) / 2 };
  const id = a.id;
  world.remove(a);
  world.remove(b);
  return world.add({
    isAlly: true, id, position: mid, type: def.id, baseType: def.id, hybridId: def.id,
    color: def.color, bodySize: def.bodySize, headSize: def.headSize, legMode: def.legMode,
    health: def.health, maxHealth: def.health, speed: def.speed, damage: def.damage,
    lastAllyAttack: 0,
  });
}
```
  NOTE at build: check whether MobModel reads bodySize/headSize from MOB_TYPES[entity.type] or from the ENTITY — if from MOB_TYPES (likely: `mobConfig` lookup), the hybrid render needs MobModel to prefer `entity.bodySize ?? mobConfig.bodySize` (a 2-line fallback edit in MobModel, capture-safe since hybrids never exist in baselines; verify with the suite). Record whichever was true in the commit body.
- [ ] **Step 4: green** → **commit** `feat(soulbind-m6): the curated hybrid roster — 3 role-spread hybrids, order-free lookup, midpoint fusion`

### Task 2: the FUSE channel reducer (same-file twin in soulbind.js, TDD)

**Files:** Modify `frontend/src/game/soulbind.js` + extend `frontend/src/game/soulbind.test.js`

- [ ] **Step 1: failing tests** (append):
```js
import { makeFuseState, decideFuse, FUSE_CHANNEL_SEC } from './soulbind';

describe('S2-B3-M6: the FUSE channel (the snare reducer\'s twin)', () => {
  const fbase = { fuseEdge: false, active: true, alive: true, now: 10, canStart: false, pairNear: false };
  it('arms ONLY when canStart && pairNear (bank + roster entry + proximity all pre-vetted)', () => {
    expect(decideFuse(makeFuseState(), { ...fbase, fuseEdge: true }).action).toBe('none');
    expect(decideFuse(makeFuseState(), { ...fbase, fuseEdge: true, canStart: true, pairNear: true }).action).toBe('startFuse');
  });
  it('pair scatters mid-channel -> break (free); held to completion -> fuse + cooldown', () => {
    let s = decideFuse(makeFuseState(), { ...fbase, fuseEdge: true, canStart: true, pairNear: true }).sm;
    expect(decideFuse(s, { ...fbase, now: 10.5, pairNear: false }).action).toBe('fuseBreak');
    s = decideFuse(makeFuseState(), { ...fbase, fuseEdge: true, canStart: true, pairNear: true }).sm;
    const done = decideFuse(s, { ...fbase, now: 10 + FUSE_CHANNEL_SEC, pairNear: true });
    expect(done.action).toBe('fuse');
  });
  it('death/menu cancels', () => {
    const s = decideFuse(makeFuseState(), { ...fbase, fuseEdge: true, canStart: true, pairNear: true }).sm;
    expect(decideFuse(s, { ...fbase, now: 10.5, pairNear: true, alive: false }).action).toBe('cancel');
  });
});
```
- [ ] **Step 2: red** → **Step 3:** implement `FUSE_CHANNEL_SEC = 1.4`, `makeFuseState`, `decideFuse` — the decideSoulbind shape with {channeling, channelStart, cooldownUntil}; validity = ctx.pairNear; the same 1e-9 boundary epsilon; cooldown SNARE_COOLDOWN_SEC reused.
- [ ] **Step 4: green** → **commit** `feat(soulbind-m6): the FUSE channel reducer — arms only when fusion can complete`

### Task 3: the apply-site arbiter + execution + the fuse cue

**Files:** Modify `frontend/src/Components.jsx` (extend the soulbind block)

- [ ] **Step 1:** in the soulbind block: compute `fusePair` = the two nearest allies within FUSE_RADIUS of the player (read alliesQuery); `canStartFuse = !snareTargetId && fusePair && sCanFuse(stv.soulBanked) && !!lookupHybrid(fusePair[0].baseType, fusePair[1].baseType)`; step `decideFuse` with {fuseEdge: snareEdge (the SAME key — the arbiter: a snare target WINS, fuse arms otherwise), pairNear: !!fusePair, canStart: canStartFuse, ...}; on 'fuse': `accrueSoul(-FUSE_COST)` + `applyFusion(ecs, fusePair[0], fusePair[1])` + `playSpatialSound('bind', [mid...], 0.7, 25)` (the down-pitched chime = the v1 swell, recorded) — import ecs, lookupHybrid/applyFusion/FUSE_RADIUS, canFuse as sCanFuse + FUSE_COST.
- [ ] **Step 2:** wire the fuse channel into the tether visual: while fuse-channeling, writeSnareState between the TWO allies (the same transient; jade arc reads as the binding thread) — progress from the fuse SM.
- [ ] **Step 3: full battery** → **commit** `feat(soulbind-m6): FUSE plays — hold X by two bound creatures, one hybrid rises (arbiter: snare wins)`

### Task 4: the Soul HUD bar + the token chain

**Files:** Modify `frontend/src/theme/tokens.js` (+`soul:'#3DFFB0'`), `frontend/src/theme/cssVars.js` (`--ui-soul`), `frontend/tailwind.config.cjs` (the kinetic line's twin), `frontend/src/ui/primitives/StatBar.jsx` (FILL/ICON_COLOR += soul), `frontend/src/HUD.jsx` (SoulBar = the KineticBar twin: gate `soulbind_snare`, label `ready ? 'SNARE!' : null`, icon pick an existing gameIcon — check the icon registry for a soul/spirit-ish glyph at build; fallback 'magic')

- [ ] **Step 1:** the 4-surface chain + SoulBar + mount beside KineticBar. **Step 2:** extend the HUD/StatBar tests if twins exist (grep `kinetic` in tests/ and twin every hit). **Step 3: full battery** (visual 13/13 — the bar self-nulls at zero + unlock-gated, the KineticBar capture-safety precedent) → **commit** `feat(soulbind-m6): the Soul bar — jade, unlock-gated, the KineticBar twin`

### Task 5: THE LOOK JUDGE (the consolidated debt) + close-out

- [ ] **Step 1:** the parked tether hypotheses IN ORDER (HOW.md): (a) NDC-project the tether midpoint via __threeCamera — if |ndc|>1 the camera-relative math is wrong, fix; if inside, (b) inspect the C camera near/far/layers; (c) the plain-dev-game start path (read scripts/visual/capture.mjs's start sequence FIRST). Frame: tether + an ally (capture one via the real channel or inject an isAlly entity — injection is SAFE now: allies aren't worker-touched) + a hybrid (applyFusion two injected allies). Judge against the pillars: does the jade family read as ONE Aspect (tether/tint/bar)? Do the 3 hybrid silhouettes read distinct at siege distance?
- [ ] **Step 2:** iterate ONCE per weak read (the M7-T2 precedent); KRB before/afters; spec §3 M6 row ✅ + this plan ✅ SHIPPED + ACTIVE_PLAN → M7 (balance + the Aspect close).

## Self-review
- Spec coverage: M6 row = "FUSE + the hybrid roster + HUD (soul bar unlock-gated, jade) + the in-world look judge" — T1+T2+T3 (fuse), T4 (HUD), T5 (judge) ✓. The §2 refuse-toast became the start-gate (recorded design simplification — strictly better UX: no consumed-nothing fail state).
- Placeholders: the MobModel bodySize-source question and the icon pick are explicit verify-at-build instructions against named files, not TBDs.
- Type consistency: decideFuse ctx {fuseEdge, active, alive, now, canStart, pairNear} matches T2 tests; applyFusion(world, a, b) matches T1; FUSE_RADIUS exported from hybrids.js (consumed in T3) ✓.
