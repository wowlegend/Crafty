import { describe, it, expect } from 'vitest';
import { buildCooldownMirror } from '../../src/game/cooldownMirror.js';

// The 4 Aspect SMs expose `cooldownUntil` (seconds, game-clock `now`); dodge ref uses
// `lastDodgeTime` + `cooldown`. buildCooldownMirror maps them to a JSON-safe HUD model.
describe('buildCooldownMirror', () => {
  const base = { now: 10 };
  it('returns null for a locked/unowned ability', () => {
    const m = buildCooldownMirror({
      now: 10,
      voidhand: null, soulbind: null, beast: null,
      dodge: { lastDodgeTime: 0, cooldown: 0.8 },
      owned: { grab: false, snare: false, roar: false, imbue: false },
    });
    expect(m.grab).toBeNull();
    expect(m.snare).toBeNull();
    expect(m.roar).toBeNull();
    expect(m.imbue).toBeNull();
  });
  it('an owned ability with cooldownUntil in the future reports {readyAt,duration,remaining}', () => {
    const m = buildCooldownMirror({
      now: 10,
      voidhand: { cooldownUntil: 12 }, soulbind: null, beast: null,
      dodge: { lastDodgeTime: 9.5, cooldown: 0.8 },
      owned: { grab: true, snare: false, roar: false, imbue: false },
    });
    expect(m.grab.readyAt).toBe(12);
    expect(m.grab.remaining).toBeCloseTo(2);
    expect(m.grab.ready).toBe(false);
  });
  it('dodge is always present (no ownership gate); ready when now-lastDodge>=cooldown', () => {
    const ready = buildCooldownMirror({ now: 10, voidhand: null, soulbind: null, beast: null, dodge: { lastDodgeTime: 9.0, cooldown: 0.8 }, owned: {} }).dodge;
    expect(ready.ready).toBe(true);
    const cooling = buildCooldownMirror({ now: 10, voidhand: null, soulbind: null, beast: null, dodge: { lastDodgeTime: 9.6, cooldown: 0.8 }, owned: {} }).dodge;
    expect(cooling.ready).toBe(false);
    expect(cooling.remaining).toBeCloseTo(0.4);
  });
});
