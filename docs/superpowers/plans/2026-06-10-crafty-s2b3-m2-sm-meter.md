# SOULBIND M2 — SM + Soul Meter + Talent Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-10-crafty-s2b3-soulbind-design.md` §2/§3 M2.

**Goal:** The pure SOULBIND state machine (snare channel) + the Soul economy meter + the unlock talent nodes — fully persisted and dawn-bled, with zero render/system wiring (that's M3-M5).

**Architecture:** Three TDD twins of proven modules: `game/soul.js` ≅ kinetic.js (meter), `game/soulbind.js` ≅ voidhand.js (SM, but CHANNEL-shaped: validity-gated hold instead of charge-then-hold), talent nodes ≅ voidhand_grasp (effect-less unlock + an effect-less +1-cap node). Store/save/dawn wiring copies the kinetic sites exactly.

**Tech Stack:** vitest colocated tests; useGameStore (kineticBanked precedent ~775/829 load sites); saveSchema progression slice; AdvancedGameFeatures dawn-bleed block + accrual hooks; App.jsx autosave diff + hook mount.

---

### Task 1: `game/soul.js` — the meter (TDD)

**Files:** Create `frontend/src/game/soul.js` + `frontend/src/game/soul.test.js`

- [ ] **Step 1: failing tests** (`soul.test.js`):
```js
import { describe, it, expect } from 'vitest';
import { SOUL_MAX, SNARE_COST, FUSE_COST, soulForKill, clampSoul, canSnare, canFuse } from './soul';

describe('S2-B3-M2: the Soul economy (kinetic twin)', () => {
  it('constants: 100 bank, 35 snare, 50 fuse (design §2)', () => {
    expect(SOUL_MAX).toBe(100); expect(SNARE_COST).toBe(35); expect(FUSE_COST).toBe(50);
  });
  it('per-kill gradient matches the economy family (8/16/60, default 12)', () => {
    expect(soulForKill('pig')).toBe(8);
    expect(soulForKill('zombie')).toBe(16);
    expect(soulForKill('mega_boss')).toBe(60);
    expect(soulForKill('unknown_future_mob')).toBe(12);
  });
  it('clampSoul: rounds, clamps [0,MAX], swallows non-finite', () => {
    expect(clampSoul(150)).toBe(100); expect(clampSoul(-5)).toBe(0);
    expect(clampSoul(49.6)).toBe(50); expect(clampSoul(NaN)).toBe(0);
  });
  it('canSnare/canFuse gate on the respective costs', () => {
    expect(canSnare(35)).toBe(true); expect(canSnare(34)).toBe(false);
    expect(canFuse(50)).toBe(true); expect(canFuse(49)).toBe(false);
  });
});
```
- [ ] **Step 2: red** (`npx vitest run src/game/soul.test.js`)
- [ ] **Step 3: implement** — copy kinetic.js verbatim and rename (KINETIC→SOUL, GRAB_COST→SNARE_COST=35, + `export const FUSE_COST = 50;` + `canFuse`); docstring: "the SOULBIND Soul economy (pure), structural twin of kinetic.js/ferocity.js — bank on the many, bind the one (design §2: kills BANK soul, binding requires SPARING one)".
- [ ] **Step 4: green** → **Step 5: commit** `feat(soulbind-m2): the Soul economy — kinetic twin (35 snare / 50 fuse)`

### Task 2: `game/soulbind.js` — the snare-channel SM (TDD)

**Files:** Create `frontend/src/game/soulbind.js` + `frontend/src/game/soulbind.test.js`

- [ ] **Step 1: failing tests** (the voidhand.test.js shape — table the transitions):
```js
import { describe, it, expect } from 'vitest';
import { makeSoulbindState, decideSoulbind, SNARE_CHANNEL_SEC, SNARE_COOLDOWN_SEC } from './soulbind';

const base = { snareEdge: false, active: true, alive: true, now: 10, canSnare: true, targetId: null };

describe('S2-B3-M2: the snare-channel SM (voidhand twin, CHANNEL-shaped)', () => {
  it('idle + snareEdge + a valid target + canSnare -> startChannel (locks targetId)', () => {
    const { sm, action } = decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7 });
    expect(action).toBe('startChannel');
    expect(sm.channeling).toBe(true);
    expect(sm.targetId).toBe(7);
  });
  it('idle + snareEdge but NO valid target -> none (aim is the gate)', () => {
    expect(decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true }).action).toBe('none');
  });
  it('idle + snareEdge but !canSnare -> none (the bank gates)', () => {
    expect(decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7, canSnare: false }).action).toBe('none');
  });
  it('channeling: target validity loss (null or DIFFERENT id) -> channelBreak, no cooldown penalty', () => {
    let s = decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7 }).sm;
    const broke = decideSoulbind(s, { ...base, now: 10.5, targetId: null });
    expect(broke.action).toBe('channelBreak');
    expect(broke.sm.channeling).toBe(false);
    expect(broke.sm.cooldownUntil).toBe(0); // broken channels cost nothing (design §2)
    s = decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7 }).sm;
    expect(decideSoulbind(s, { ...base, now: 10.5, targetId: 9 }).action).toBe('channelBreak');
  });
  it('channeling: menu-close / death -> cancel', () => {
    const s = decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7 }).sm;
    expect(decideSoulbind(s, { ...base, now: 10.5, targetId: 7, active: false }).action).toBe('cancel');
    expect(decideSoulbind(s, { ...base, now: 10.5, targetId: 7, alive: false }).action).toBe('cancel');
  });
  it('channeling: held to completion -> bind + cooldown armed', () => {
    const s = decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7 }).sm;
    const done = decideSoulbind(s, { ...base, now: 10 + SNARE_CHANNEL_SEC, targetId: 7 });
    expect(done.action).toBe('bind');
    expect(done.sm.channeling).toBe(false);
    expect(done.sm.cooldownUntil).toBeCloseTo(10 + SNARE_CHANNEL_SEC + SNARE_COOLDOWN_SEC);
  });
  it('cooldown blocks a fresh channel', () => {
    const s = { ...makeSoulbindState(), cooldownUntil: 20 };
    expect(decideSoulbind(s, { ...base, now: 19, snareEdge: true, targetId: 7 }).action).toBe('none');
  });
});
```
- [ ] **Step 2: red** → **Step 3: implement** `soulbind.js`:
```js
/**
 * soulbind.js — S2-B3-M2: the SOULBIND snare-channel SM (pure reducer). Twin of voidhand.js, but
 * CHANNEL-shaped: instead of charge-then-hold, snare is a 1.1s aim-gated channel — ctx.targetId is
 * the per-frame VALIDITY verdict computed at the apply-site (nearest snareable in cone+range+alive;
 * the mob keeps moving, so holding aim IS the skill — design §2). Validity loss breaks the channel
 * FREE (no cooldown — cooldown only arms on bind/completion); menu/death cancels. The squad/roster
 * truth lives in the store (M3+); this SM owns only the channel timer + cooldown.
 */
export const SNARE_CHANNEL_SEC = 1.1;  // hold-to-bind window (Kevin-tunable)
export const SNARE_COOLDOWN_SEC = 1.5; // after a completed bind (anti-spam; breaks are free)

export function makeSoulbindState() {
  return { channeling: false, channelStart: 0, targetId: null, cooldownUntil: 0 };
}

/** decideSoulbind(sm, ctx) -> { sm, action }; action: 'none'|'startChannel'|'channelBreak'|'bind'|'cancel'.
 *  ctx: { snareEdge, active, alive, now, canSnare, targetId } — targetId = the CURRENT valid snareable
 *  target id or null (apply-site computes it; a different id than locked = validity loss). */
export function decideSoulbind(sm, ctx) {
  const out = { ...sm };

  if (sm.channeling) {
    if (!ctx.alive || !ctx.active) { out.channeling = false; out.targetId = null; return { sm: out, action: 'cancel' }; }
    if (ctx.targetId !== sm.targetId || ctx.targetId == null) {
      out.channeling = false; out.targetId = null;
      return { sm: out, action: 'channelBreak' }; // free — no cooldown (design §2)
    }
    if (ctx.now - sm.channelStart >= SNARE_CHANNEL_SEC) {
      out.channeling = false;
      out.cooldownUntil = ctx.now + SNARE_COOLDOWN_SEC;
      return { sm: out, action: 'bind' }; // apply-site spends SNARE_COST + converts the entity (M3/M4)
    }
    return { sm: out, action: 'none' };
  }

  if (ctx.snareEdge && ctx.now >= sm.cooldownUntil && ctx.alive && ctx.active && ctx.canSnare && ctx.targetId != null) {
    out.channeling = true;
    out.channelStart = ctx.now;
    out.targetId = ctx.targetId;
    return { sm: out, action: 'startChannel' };
  }

  return { sm: out, action: 'none' };
}
```
- [ ] **Step 4: green** → **Step 5: commit** `feat(soulbind-m2): the snare-channel SM — aim-gated 1.1s channel, breaks free, binds arm cooldown`

### Task 3: store + persistence + dawn bleed + accrual (the kinetic wiring, exactly)

**Files:** Modify `frontend/src/store/useGameStore.jsx`, `frontend/src/game/saveSchema.js`, `frontend/src/AdvancedGameFeatures.jsx`, `frontend/src/App.jsx`; Test: extend `frontend/src/game/saveSchema.test.js` (or its actual twin — locate the kineticBanked save test and mirror it)

- [ ] **Step 1: store fields** (beside kineticBanked): `soulBanked: 0`, `setSoulBanked: (v) => set({ soulBanked: clampSoul(v) })`, `accrueSoul: (amt) => set((s) => ({ soulBanked: clampSoul(s.soulBanked + amt) }))` (import clampSoul). Load path: mirror BOTH kineticBanked load sites (the ~775 clamp + the ~829 load-set — grep `kineticBanked` in the store and twin every hit).
- [ ] **Step 2: save slice** — `saveSchema.js` progression slice gains `soulBanked: state.soulBanked` (the kineticBanked line's sibling). Failing test first: locate the existing kineticBanked progression-slice assertion and add the soulBanked twin beside it.
- [ ] **Step 3: dawn bleed + accrual** — in AdvancedGameFeatures: add `useSoulAccrual` beside useKineticAccrual:
```js
export const useSoulAccrual = () => {
    useEffect(() => subscribeMobKill((mobType, _pos, source) => {
        const s = useGameStore.getState();
        // S2-B3: only YOUR kills bank Soul (the M1 attribution contract)
        if (source === 'player' && s.isDay && !isCaptureMode()) s.accrueSoul(soulForKill(mobType));
    }), []);
};
```
  and in the dawn block (where ferocity+kinetic reset): `setSoulBanked(0)` (read the block first; mirror exactly). In App.jsx: mount `useSoulAccrual()` next to useKineticAccrual() + extend the autosave diff with `|| s.soulBanked !== prevS.soulBanked`.
- [ ] **Step 4: full battery** → **Step 5: commit** `feat(soulbind-m2): soulBanked — store + save slice + dawn bleed + player-only accrual`

### Task 4: the talent nodes (effect-less unlocks)

**Files:** Modify `frontend/src/game/talentTree.js` (the soulbind tree, after soulbind_link); Test: extend the talent tests (locate the voidhand_grasp test and twin it)

- [ ] **Step 1: failing test** — twin the voidhand_grasp assertions for: `soulbind_snare` { limit: 1, prereq: 'soulbind_bond', effect-less }, `soulbind_pack` { limit: 1, prereq: 'soulbind_snare', effect-less }.
- [ ] **Step 2: implement**:
```js
      { id: 'soulbind_snare', name: 'Soul Snare', desc: 'Unlock the SNARE verb — bind a weakened creature to your squad (X).', limit: 1, prereq: 'soulbind_bond' },
      { id: 'soulbind_pack', name: 'Pack Warden', desc: '+1 squad slot — a third creature may walk beside you.', limit: 1, prereq: 'soulbind_snare' },
```
- [ ] **Step 3: green + full battery** → **Step 4: commit** `feat(soulbind-m2): soulbind_snare + soulbind_pack talent nodes (effect-less unlocks)`

### Task 5: close-out
- [ ] Spec §3 M2 row ✅ · this plan ✅ SHIPPED · ACTIVE_PLAN → M3 (the allegiance seam — the design's de-risk milestone: isAlly conversion + the FIVE-surface exclusion with serializer+apply-loop in the SAME commit + the worker-message static gate).

## Self-review
- Spec coverage: §3 M2 = "SM + meter + persistence + the talent nodes (TDD twins)" — T2 + T1 + T3 + T4 ✓. The §2 numbers (100/35/50, 1.1s, 1.5s) are pinned in tests ✓.
- Placeholders: none — every step carries code or an exact locate-then-twin instruction against a named precedent line.
- Type consistency: `decideSoulbind(sm, ctx) -> {sm, action}` matches the voidhand convention; `clampSoul` used in both store setters ✓. canFuse defined in T1, consumed by M6 (not referenced before it ships) ✓.
