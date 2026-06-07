import { describe, it, expect, beforeEach } from 'vitest';
import { subscribeMobKill, emitMobKill, mobKillSubscriberCount, _resetMobKillBus } from './mobKillBus.js';

// S2-B1-M3.5: the kill-event fan-out bus replaces the single-slot store.onMobKill (which only ONE
// consumer could own — a last-writer-wins trap the M1 review flagged). Quests + ferocity (+ future
// Aspects, e.g. SOULBIND capture-on-kill) all subscribe; the kill-path emits once.

beforeEach(() => _resetMobKillBus());

describe('mobKillBus', () => {
  it('delivers (mobType, position) to a subscriber', () => {
    const seen = [];
    subscribeMobKill((t, p) => seen.push([t, p]));
    emitMobKill('zombie', [1, 2, 3]);
    expect(seen).toEqual([['zombie', [1, 2, 3]]]);
  });

  it('fans out to ALL subscribers (the whole point — quests AND ferocity)', () => {
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
    expect(mobKillSubscriberCount()).toBe(1);
    unsub();
    expect(mobKillSubscriberCount()).toBe(0);
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
