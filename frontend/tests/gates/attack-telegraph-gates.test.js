import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attackPhase, WINDUP_MS } from '../../src/game/attackTelegraph.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// SOTA M2 #4 (attack telegraphs): enemy strikes are deferred behind a readable windup. The pure machine
// lives in game/attackTelegraph.js (unit-tested in its own file); the AI worker is a CLASSIC Worker so it
// can't import it -- these gates pin the inlined worker mirror to the same contract + lock the windupUntil
// round-trip (SNS mobsData -> worker -> updates -> readback), the channel the render (slice 2) reads.
describe('attack-telegraph gates (M2 #4)', () => {
  const worker = read('workers/ai.worker.js');
  const npc = read('SimplifiedNPCSystem.jsx');

  it('the worker mirror uses the same WINDUP_MS as the canonical pure module', () => {
    // sanity: the pure machine is the source of truth and is sane
    expect(WINDUP_MS).toBeGreaterThanOrEqual(300);
    expect(WINDUP_MS).toBeLessThanOrEqual(500);
    // the inlined worker constant matches it (kept in sync by hand -> this gate)
    expect(worker).toMatch(new RegExp(`const WINDUP_MS = ${WINDUP_MS}\\b`));
  });

  it('the worker DEFERS the strike behind a windup (no instant push at the old attack sites)', () => {
    // the three attack sites now stage a pendingAttack instead of striking + stamping cooldown inline
    expect(worker).toMatch(/pendingAttack = \{ id, type: 'projectile'/);
    expect(worker).toMatch(/pendingAttack = \{ id, type: 'leap'/);
    expect(worker).toMatch(/pendingAttack = \{ damage, type: 'melee' \}/);
    // the OLD instant-strike form (push + same-tick lastAttackTime) is gone from those sites
    expect(worker.includes("attacks.push({ id, type: 'projectile'")).toBe(false);
    expect(worker.includes("attacks.push({ id, type: 'leap'")).toBe(false);
  });

  it('the windup gate strikes only when it elapses, and whiffs if intent dropped (dodgeable)', () => {
    // begin-windup transition
    expect(worker).toMatch(/windupUntil = now \+ WINDUP_MS/);
    // strike only on elapse, gated on the pending intent still holding
    expect(/now >= windupUntil[\s\S]{0,140}if \(pendingAttack\) \{ attacks\.push\(pendingAttack\); lastAttackTime = now;/.test(worker)).toBe(true);
  });

  it('windupUntil round-trips: worker destructures + outputs it, SNS sends + reads it back', () => {
    expect(/let \{[\s\S]{0,200}lastAttackTime, windupUntil,/.test(worker)).toBe(true);   // destructure in
    expect(worker).toMatch(/updates\.push\(\{[\s\S]{0,160}lastAttackTime, windupUntil,/); // output back
    expect(npc).toMatch(/windupUntil: e\.windupUntil \|\| 0/);                            // SNS -> worker
    expect(npc).toMatch(/entity\.windupUntil = update\.windupUntil/);                     // readback for render
  });

  it('the pure machine itself is dodgeable (strike vs cancel on elapse)', () => {
    expect(attackPhase(1380, 1380, true).action).toBe('strike');
    expect(attackPhase(1380, 1380, false).action).toBe('cancel');
  });
});

// Slice 2: MobModel RENDERS the telegraph -- an anticipation pose + emissive charge ramp driven by
// entity.windupUntil (the field slice 1 round-trips). Imports the pure windupRamp (main-thread file).
describe('attack-telegraph render gates (M2 #4 Slice 2)', () => {
  const mob = read('render/MobModel.jsx');

  it('MobModel imports the pure windupRamp + WINDUP_MS from the canonical module', () => {
    expect(mob).toMatch(/import \{ windupRamp, WINDUP_MS \} from '\.\.\/game\/attackTelegraph'/);
  });
  it('renders an anticipation pose from entity.windupUntil (coil), composing after the flinch', () => {
    expect(/entity\.windupUntil && performance\.now\(\) < entity\.windupUntil/.test(mob)).toBe(true);
    expect(mob).toMatch(/windupRamp\(performance\.now\(\), entity\.windupUntil/);
  });
  it('ramps an emissive charge glow toward the strike, but the hit-flash still wins', () => {
    expect(mob).toMatch(/const charging = !isHit && entity\.windupUntil/);
    expect(mob).toMatch(/emissive\.copy\(chargeColor\)/);
    // hit-flash precedence preserved in the traverse
    expect(/if \(isHit\)[\s\S]{0,120}emissive\.copy\(hitColor\)/.test(mob)).toBe(true);
  });
});

// Slice 3: the boss Phase-3 lava AoE (its own attack loop in BossEntity, not the ai.worker) is telegraphed --
// the lava ring spawns as a harmless forming warning, then arms. Makes the previously-undodgeable
// instant-at-the-player lava dodgeable.
describe('boss lava-AoE telegraph gates (M2 #4 Slice 3)', () => {
  const boss = read('render/BossEntity.jsx');

  it('BossEntity imports windupRamp + defines a lava windup window', () => {
    expect(boss).toMatch(/import \{ windupRamp \} from '\.\.\/game\/attackTelegraph\.js'/);
    expect(boss).toMatch(/const LAVA_WINDUP_MS = \d+/);
  });
  it('a spawned lava zone carries a telegraphUntil warning window', () => {
    expect(boss).toMatch(/telegraphUntil: performance\.now\(\) \+ LAVA_WINDUP_MS/);
  });
  it('lava damage is GATED on the telegraph having elapsed (forming = harmless)', () => {
    expect(boss).toMatch(/const forming = now < l\.telegraphUntil/);
    expect(boss).toMatch(/if \(!forming && distSq < 7\.56\)/);
  });
  it('the forming ring grows in via windupRamp (the visible warning)', () => {
    expect(boss).toMatch(/windupRamp\(now, l\.telegraphUntil, LAVA_WINDUP_MS\)/);
  });
});
