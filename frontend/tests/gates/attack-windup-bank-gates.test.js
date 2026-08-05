import { describe, it, expect, beforeAll } from 'vitest';

// A-bis B4b — a mob could BANK a windup across de-aggro and cash it in as an undodgeable hit.
//
// `attackPhase()` is only called inside the `if (isAggro)` branch, so a mob that loses aggro mid-windup
// freezes `windupUntil` at a past timestamp. When it re-aggros, `now >= windupUntil` is already true and
// the very first tick returns 'strike' — an instant blow with no telegraph to read and no window to dodge.
// The ~380ms windup IS the fairness contract of the attack; a banked one is worse than no telegraph,
// because the player has been taught to expect a wind-up that never comes.
//
// Executes the real worker (see mob-senses-gates.test.js for why this shape rather than a source grep).
const posted = [];
let onmessage;

beforeAll(async () => {
  globalThis.self = { postMessage: (m) => posted.push(m), set onmessage(fn) { onmessage = fn; }, get onmessage() { return onmessage; } };
  await import('../../src/workers/ai.worker.js');
});

const NOW = 20_000_000;
const mob = (over = {}) => ({
  id: 'm1', passive: false, x: 0, y: 0, z: 0, targetX: 0, targetZ: 0, isMoving: false, isAggro: true,
  lastAttackTime: 0, windupUntil: 0, damage: 5, type: 'zombie', moveTimer: 0, speed: 1, rotation: 0,
  health: 100, maxHealth: 100, heightGrid: null, ...over,
});
const run = (playerPos, now, m) => {
  posted.length = 0;
  onmessage({ data: { type: 'TICK', playerPos, now, delta: 0.016, mobs: [m] } });
  const out = posted[posted.length - 1];
  return { update: out.updates[0], attacks: out.attacks };
};

describe('B4b — a windup cannot be banked across de-aggro', () => {
  it('clears the pending windup when the mob loses aggro', () => {
    // Adjacent: the mob starts a windup.
    const a = run([1.5, 0, 0], NOW, mob());
    expect(a.update.windupUntil).toBeGreaterThan(0);

    // Player escapes past the 1.5x leash. The mob must drop BOTH the aggro and the half-charged swing.
    const b = run([200, 0, 0], NOW + 100, mob({ windupUntil: a.update.windupUntil }));
    expect(b.update.isAggro).toBe(false);
    expect(b.update.windupUntil).toBe(0);
  });

  it('does NOT strike on the first tick after re-aggro — the telegraph is honoured again', () => {
    // This is the player-facing assertion: walk away, come back, and the first thing that happens must not
    // be an instant hit. Carry a STALE windup in deliberately, as the pre-fix worker would have.
    const stale = NOW - 5000; // long expired
    const back = run([1.5, 0, 0], NOW, mob({ isAggro: false, windupUntil: stale }));
    expect(back.attacks).toEqual([]);
    expect(back.update.windupUntil).toBeGreaterThan(NOW); // a FRESH windup, not the banked one
  });

  it('still strikes after the fresh windup elapses — the fix must not disarm the mob', () => {
    // The counter-case. Clearing windups everywhere would satisfy both assertions above and make mobs
    // harmless, so the normal attack path is asserted in the same file.
    const first = run([1.5, 0, 0], NOW, mob());
    const second = run([1.5, 0, 0], NOW + 600, mob({ windupUntil: first.update.windupUntil, lastAttackTime: first.update.lastAttackTime }));
    expect(second.attacks.length).toBeGreaterThan(0);
    expect(second.attacks[0].type).toBe('melee');
  });

  it('a mob that stays aggro keeps charging — de-aggro is the only thing that cancels', () => {
    const first = run([1.5, 0, 0], NOW, mob());
    const mid = run([1.5, 0, 0], NOW + 100, mob({ windupUntil: first.update.windupUntil }));
    expect(mid.update.isAggro).toBe(true);
    expect(mid.update.windupUntil).toBe(first.update.windupUntil); // same charge, still counting down
    expect(mid.attacks).toEqual([]);
  });
});
