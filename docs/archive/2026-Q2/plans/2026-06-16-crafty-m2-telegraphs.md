# M2 Theme 2 — Attack Telegraphs (#4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Enemy + boss attacks no longer land instantly off cooldown — each strike is preceded by a readable **windup telegraph** (~380ms anticipation pose + emissive charge ramp), and is **dodgeable** (leave range during the windup → the strike whiffs).

**Architecture:** A pure windup→strike state machine (`game/attackTelegraph.js`) gates the worker's instant-attack sites. The worker (`ai.worker.js`) defers each strike behind a per-mob `windupUntil` (in `performance.now()` units — the worker's `now` IS `performance.now()`, sent from SNS), re-evaluating intent at strike time so dodging cancels it. `windupUntil` round-trips through the existing mob state channel (SNS mobsData → worker destructure → updates → readback), so MobModel reads it directly to render the charge pose. The boss AoE gets a ground-ring warning decal.

**Tech Stack:** Web Worker (module, imports resolve via Vite — the `oreGen.js` precedent), miniplex mob ECS, R3F/Three toon material, zustand, vitest.

**Locks honored:** bold-flat, BLOOM>=0.85 (the emissive charge ramp rides existing bloom), NEUTRAL tonemap, Ember+Blight palette (element-colored ramp; red reserved for heavy/unblockable). WINDUP timing/difficulty = Kevin FEEL **#50** (ship sensible 380ms default, tunable).

**Capture-determinism:** windups only fire when a mob is aggro'd + attacking the player — which never happens in the static capture states (diorama/showcase mobs don't engage). `entity.windupUntil` stays 0 in capture → no pose, no behavior change → gate holds 20/20. The effective attack cadence grows by ~WINDUP_MS, which only manifests in live combat.

**Grounded live facts (Phase-B verified 2026-06-16):**
- `ai.worker.js` emits an `attacks[]` array; three instant-attack sites: archer/`projectile` (L247-250, `ATTACK_COOLDOWN+500`), spider/`leap` (L257-259, `LEAP_RANGE`, `+1000`) + spider/`melee` (L260-262), zombie/`melee` (L269-272). Each pushes the attack AND sets `lastAttackTime = now` the same tick — no anticipation.
- `now` is `e.data.now` (worker L123) = `performance.now()` from SNS (L346 → postMessage L415). Worker clock == render clock.
- Mob state round-trips: SNS `mobsData` (`lastAttackTime: e.lastAttackTime`, L400) → postMessage (L412) → worker destructure (L158-161) → worker `updates.push({...lastAttackTime...})` (L343) → SNS readback (`entity.lastAttackTime = update.lastAttackTime`, L321). `windupUntil` threads identically.
- SNS consumes `attacks` by type (L265-291): `projectile`→spawnEnemyProjectile, `leap`→knockback impulse, else→`damagePlayer`. (Slice 1 needs no new branch — windup is carried by `entity.windupUntil` via the update channel, not a new attack event.)
- Render: `MobModel.jsx` already animates a post-hit flinch from `entity.lastHit` (M2 #9) + reads `entity` transiently each frame — the windup pose hangs off the same per-frame `entity.windupUntil` read.

---

## Slice 1 (Commit) — the dodgeable windup→strike timing core

**Files:**
- Create: `frontend/src/game/attackTelegraph.js`
- Test: `frontend/src/game/attackTelegraph.test.js`
- Modify: `frontend/src/workers/ai.worker.js` (import + thread `windupUntil` + gate the 3 attack sites)
- Modify: `frontend/src/SimplifiedNPCSystem.jsx` (mobsData payload L400 + readback L321)
- Test: `frontend/tests/gates/attack-telegraph-gates.test.js` (source-shape wiring)

- [ ] **Step 1: Failing test** — `attackTelegraph.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { attackPhase, WINDUP_MS } from './attackTelegraph.js';

describe('attackPhase (the dodgeable windup->strike machine)', () => {
  it('idle when not in range / on cooldown (no intent)', () => {
    expect(attackPhase(1000, 0, false)).toEqual({ action: 'idle', windupUntil: 0 });
  });
  it('begins a windup when intent appears', () => {
    expect(attackPhase(1000, 0, true)).toEqual({ action: 'windup', windupUntil: 1000 + WINDUP_MS });
  });
  it('charges (does nothing) mid-windup, even if intent flickers', () => {
    expect(attackPhase(1100, 1380, true)).toEqual({ action: 'charge', windupUntil: 1380 });
    expect(attackPhase(1100, 1380, false)).toEqual({ action: 'charge', windupUntil: 1380 });
  });
  it('STRIKES when the windup elapses and intent still holds', () => {
    expect(attackPhase(1380, 1380, true)).toEqual({ action: 'strike', windupUntil: 0 });
  });
  it('CANCELS (whiff) when the windup elapses but the target dodged out of intent', () => {
    expect(attackPhase(1380, 1380, false)).toEqual({ action: 'cancel', windupUntil: 0 });
  });
  it('honors a custom windup window', () => {
    expect(attackPhase(0, 0, true, 500).windupUntil).toBe(500);
  });
});
```

- [ ] **Step 2: Run red** — `cd frontend && npx vitest run src/game/attackTelegraph.test.js` → FAIL.

- [ ] **Step 3: Implement** `attackTelegraph.js`:

```js
/**
 * Pure windup->strike telegraph state machine. An enemy that COULD attack this tick (hasIntent =
 * in-range + off-cooldown) first enters a WINDUP for `windupMs`; only when the windup elapses AND the
 * intent still holds does it STRIKE. If the target dodged out of intent during the windup it CANCELS
 * (a whiff) -- this is what makes telegraphed attacks dodgeable. `now`/`windupUntil` are performance.now()
 * units (the worker's clock == the render clock). RNG-free.
 * @returns {{action:'idle'|'windup'|'charge'|'strike'|'cancel', windupUntil:number}}
 */
export const WINDUP_MS = 380; // readable 300-500ms reaction band; Kevin FEEL #50 tunable

export function attackPhase(now, windupUntil, hasIntent, windupMs = WINDUP_MS) {
  if (windupUntil > 0) {
    if (now >= windupUntil) return { action: hasIntent ? 'strike' : 'cancel', windupUntil: 0 };
    return { action: 'charge', windupUntil };
  }
  if (hasIntent) return { action: 'windup', windupUntil: now + windupMs };
  return { action: 'idle', windupUntil: 0 };
}
```

- [ ] **Step 4: Run green.**

- [ ] **Step 5: Wire the worker** — `ai.worker.js`:
  1. Top import: `import { attackPhase } from '../game/attackTelegraph.js';`
  2. Destructure (L158-161): add `windupUntil` to the `let {...} = entity` list.
  3. In each of the three attack branches, replace `attacks.push(<X>); lastAttackTime = now;` with `pendingAttack = <X>;` (declare `let pendingAttack = null;` at the top of the per-mob block, after the destructure). Keep the range + cooldown conditions identical.
  4. At the END of the `if (isAggro) { ... }` block (after the type branches), add the gate:

```js
        // M2 #4 telegraph: defer the strike behind a readable windup; re-evaluate intent at strike
        // time so dodging out of range during the windup whiffs the attack.
        const ph = attackPhase(now, windupUntil || 0, pendingAttack !== null);
        windupUntil = ph.windupUntil;
        if (ph.action === 'strike') {
          attacks.push(pendingAttack);
          lastAttackTime = now;
        }
```

  5. Output (L343): add `windupUntil` to the `updates.push({...})` object.

- [ ] **Step 6: Wire SNS** — `SimplifiedNPCSystem.jsx`:
  - mobsData (L400 area): add `windupUntil: e.windupUntil || 0,`
  - readback (L321 area): add `entity.windupUntil = update.windupUntil;`

- [ ] **Step 7: Source-shape gate** — `attack-telegraph-gates.test.js`: assert the worker imports `attackPhase`, threads `windupUntil` (destructure + updates), and that the gated branches set `pendingAttack` rather than directly pushing+stamping `lastAttackTime` at the old sites; assert SNS sends + reads back `windupUntil`.

- [ ] **Step 8: Verify + commit** — `npx vitest run` (grows) · `npm run build` · `npx eslint <touched>` · `npm run visual:capture` THEN gate 20/20 (no combat in capture → no drift) · commit `-F` (no AI footer, no `git add -A`).

## Slice 2 (Commit) — render the telegraph (anticipation pose + emissive charge ramp)

**Files:** `frontend/src/render/MobModel.jsx` (+ possibly `MobToonMaterial`), gate test.

While `performance.now() < entity.windupUntil`, render a charge state on `modelRef`: a rear-back/crouch anticipation pose (a brief lean-back + slight squash, eased by the windup progress `t = 1 - (windupUntil-now)/WINDUP_MS`) and an emissive charge ramp on the toon body that brightens toward the strike (rides BLOOM>=0.85). Color by element where known, **red reserved for heavy/unblockable**. Must compose with the existing flinch block (flinch wins if `lastHit` is fresher). Optional: a one-shot charge whoosh via the `window.*` sound bridge. Capture-safe (windupUntil 0 in capture — verify `mobShowcase` doesn't engage). TDD any pure easing/ramp math; source-gate the pose+emissive read of `entity.windupUntil`. Commit.

## Slice 3 (Commit) — boss AoE ground-ring warning

**Files:** ground the boss attack path first (`world/bossSystem.js` / `render/BossEntity.jsx` / `game/bossConfig.js`), then add a ground-ring warning decal where a lava/AoE will land, shown during the windup. TDD the pure ring placement/timing; source-gate the render. Commit. (Boss attack grounding is deferred to build-time — `bossSystem.js` had no fireball/roar/lava literals in the Phase-B grep, so the boss may reuse the standard melee `damagePlayer` path or define abilities in `bossConfig.js`; verify before building.)

---

## Self-Review
- **Spec coverage:** Slice 1 = the windup→strike timing (the core of #4); Slice 2 = the visible anticipation (pose + emissive); Slice 3 = boss AoE ring. Covers the audit's "ZERO attack telegraphs".
- **Type consistency:** `attackPhase(now, windupUntil, hasIntent, windupMs?) → {action, windupUntil}`; `WINDUP_MS=380`; `entity.windupUntil` (performance.now() units) threaded SNS↔worker.
- **Dodgeability:** intent re-evaluated at strike → moving out of range during the windup cancels — the fairness/readability win, and it's unit-tested (the `cancel` case).
- **Anti-tunneling:** 3 commits; slice 1 touches worker+SNS+pure module (one cohesive feature, committed at the end).
- **Capture-determinism:** windups never fire in the static capture states → 20/20 holds; a moved frame = a leak to fix.
