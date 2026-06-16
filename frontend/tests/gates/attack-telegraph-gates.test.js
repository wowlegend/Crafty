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
