import { describe, it, expect, beforeEach } from 'vitest';
import { subscribeMobKill, emitMobKill } from './mobKillBus.js';
import { EVENTS, subscriberCount, _resetBus } from './eventBus.js';

// The kill-event fan-out bus: every kill consumer subscribes and the kill path emits once. A single store slot could
// hold one consumer, and the last to register silently replaced the others. Quests and the ember accrual subscribe.

beforeEach(() => _resetBus());

describe('mobKillBus', () => {
  it('delivers (mobType, position) to a subscriber', () => {
    const seen = [];
    subscribeMobKill((t, p) => seen.push([t, p]));
    emitMobKill('zombie', [1, 2, 3]);
    expect(seen).toEqual([['zombie', [1, 2, 3]]]);
  });

  it('fans out to ALL subscribers (the whole point — quests AND ember)', () => {
    let a = 0, b = 0;
    subscribeMobKill(() => a++);
    subscribeMobKill(() => b++);
    emitMobKill('pig', [0, 0, 0]);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it('unsubscribe stops delivery + decrements the count', () => {
    let n = 0;
    const unsub = subscribeMobKill(() => n++);
    expect(subscriberCount(EVENTS.mobKill)).toBe(1);
    unsub();
    expect(subscriberCount(EVENTS.mobKill)).toBe(0);
    emitMobKill('skeleton', [0, 0, 0]);
    expect(n).toBe(0);
  });

  it('emit with no subscribers does not throw', () => {
    expect(() => emitMobKill('ghost', [0, 0, 0])).not.toThrow();
  });

  it('one throwing subscriber does NOT block the others (isolation)', () => {
    let reached = false;
    subscribeMobKill(() => { throw new Error('quest handler blew up'); });
    subscribeMobKill(() => { reached = true; });
    expect(() => emitMobKill('boss', [0, 0, 0])).not.toThrow();
    expect(reached).toBe(true); // the second subscriber still ran
  });
});

describe('S2-B3-M1: kill attribution', () => {
  it('passes source through to subscribers', () => {
    const seen = [];
    subscribeMobKill((type, pos, source) => seen.push(source));
    emitMobKill('zombie', [0, 0, 0], 'ally');
    expect(seen).toEqual(['ally']);
  });
  it("defaults source to 'player' (back-compat for every existing emit)", () => {
    const seen = [];
    subscribeMobKill((type, pos, source) => seen.push(source));
    emitMobKill('zombie', [0, 0, 0]);
    expect(seen).toEqual(['player']);
  });
});

describe('S2-B4-M1: the hazard source (zone kills bank nothing by construction)', () => {
  it("a 'player'-filtered subscriber (the economy shape) banks NOTHING from a 'hazard' emit", () => {
    let banked = 0;
    subscribeMobKill((type, pos, source) => { if (source === 'player') banked += 1; });
    emitMobKill('zombie', [0, 0, 0], 'hazard');
    expect(banked).toBe(0);
    emitMobKill('zombie', [0, 0, 0]); // the default stays player
    expect(banked).toBe(1);
  });
});
