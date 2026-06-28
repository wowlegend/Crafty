import { describe, it, expect } from 'vitest';
import { buildCooldownMirror } from './cooldownMirror.js';

// Pure HUD ability-bar model (Game-Loop-Isolation: Components mirrors this into the store). Locks:
// unowned verbs -> null, remaining/ready derived from cooldownUntil - now, per-verb durations, imbue
// always-ready (resource-gated elsewhere), and dodge always present with a default 0.8s cooldown.

describe('buildCooldownMirror', () => {
  it('returns null for verbs the player has not unlocked', () => {
    const m = buildCooldownMirror({ now: 100, owned: {} });
    expect(m.grab).toBeNull();
    expect(m.snare).toBeNull();
    expect(m.roar).toBeNull();
    expect(m.imbue).toBeNull();
    expect(m.dodge).not.toBeNull(); // dodge is innate, never gated by `owned`
  });

  it('an owned verb on cooldown reports remaining + not-ready, with its slot duration', () => {
    const m = buildCooldownMirror({ now: 100, voidhand: { cooldownUntil: 105 }, owned: { grab: 1 } });
    expect(m.grab.readyAt).toBe(105);
    expect(m.grab.remaining).toBeCloseTo(5, 10);
    expect(m.grab.ready).toBe(false);
    expect(m.grab.duration).toBe(0.6); // grab slot duration
  });

  it('an owned verb past its cooldown is ready with remaining 0', () => {
    const m = buildCooldownMirror({ now: 100, voidhand: { cooldownUntil: 95 }, owned: { grab: 1 } });
    expect(m.grab.remaining).toBe(0);
    expect(m.grab.ready).toBe(true);
  });

  it('uses the documented per-verb durations', () => {
    const m = buildCooldownMirror({
      now: 0,
      soulbind: { cooldownUntil: 0 }, beast: { cooldownUntil: 0 },
      owned: { snare: 1, roar: 1, imbue: 1 },
    });
    expect(m.snare.duration).toBe(1.5);
    expect(m.roar.duration).toBe(1.5);
    expect(m.imbue.duration).toBe(1.0);
  });

  it('imbue (owned) is always ready — it has no SM cooldown (resource-gated only)', () => {
    const m = buildCooldownMirror({ now: 9999, owned: { imbue: 1 } });
    expect(m.imbue.remaining).toBe(0);
    expect(m.imbue.ready).toBe(true);
  });

  it('dodge: derives readyAt from lastDodgeTime + cooldown', () => {
    const onCd = buildCooldownMirror({ now: 100, dodge: { lastDodgeTime: 100, cooldown: 0.8 } });
    expect(onCd.dodge.readyAt).toBeCloseTo(100.8, 10);
    expect(onCd.dodge.remaining).toBeCloseTo(0.8, 10);
    expect(onCd.dodge.ready).toBe(false);
    expect(onCd.dodge.duration).toBe(0.8);

    const ready = buildCooldownMirror({ now: 101, dodge: { lastDodgeTime: 100, cooldown: 0.8 } });
    expect(ready.dodge.remaining).toBe(0);
    expect(ready.dodge.ready).toBe(true);
  });

  it('dodge: defaults cooldown to 0.8 when the dodge ref is absent/partial', () => {
    const m = buildCooldownMirror({ now: 0 });
    expect(m.dodge.duration).toBe(0.8);
    expect(m.dodge.readyAt).toBeCloseTo(0.8, 10); // (0 lastDodge) + 0.8 default
    expect(m.dodge.ready).toBe(false); // now 0 < 0.8
  });
});
