import { describe, it, expect } from 'vitest';
import { ASPECT_VERBS, unlockedAspectVerbs, ringLayout, TAP_HOLD_MS } from './aspectWheel.js';
import { KEY_MAP } from '../game/keyMap.js';
import { INTENT_KEYS } from './inputState.js';

describe('aspectWheel — the registry is DERIVED, not retyped', () => {
  it('carries exactly the Aspect rows of KEY_MAP, in order', () => {
    const fromMap = KEY_MAP.filter((r) => r.group === 'Aspects' && r.verb && r.talent).map((r) => r.verb);
    expect(ASPECT_VERBS.map((a) => a.verb)).toEqual(fromMap);
    expect(ASPECT_VERBS.length).toBeGreaterThan(0); // a silent empty registry would make every test below vacuous
  });

  it('every verb it offers is a REAL intent the game already consumes', () => {
    // This is the whole claim of the feature: the ring writes the same intents the keyboard does, so nothing
    // downstream changes. If a verb here were not in INTENT_KEYS, the tap would go nowhere and look fine.
    for (const a of ASPECT_VERBS) expect(INTENT_KEYS).toContain(a.verb);
  });

  it('every verb carries the talent that gates it, and a human Aspect name', () => {
    for (const a of ASPECT_VERBS) {
      expect(a.talent, `${a.verb} talent`).toMatch(/^[a-z]+_[a-z]+$/);
      expect(a.aspect, `${a.verb} aspect`).toMatch(/^[A-Z]{4,}$/); // WILDHEART, VOIDHAND, ...
      expect(a.aspect).not.toContain('—'); // the label is split, not passed through whole
    }
  });
});

describe('aspectWheel — unlock gating', () => {
  const all = Object.fromEntries(ASPECT_VERBS.map((a) => [a.talent, 1]));

  it('offers nothing when nothing is unlocked', () => {
    expect(unlockedAspectVerbs({})).toEqual([]);
    expect(unlockedAspectVerbs(undefined)).toEqual([]);
  });

  it('offers only the unlocked verbs', () => {
    const one = ASPECT_VERBS[0];
    expect(unlockedAspectVerbs({ [one.talent]: 1 }).map((a) => a.verb)).toEqual([one.verb]);
  });

  it('offers all four when all are unlocked', () => {
    expect(unlockedAspectVerbs(all)).toHaveLength(ASPECT_VERBS.length);
  });

  it('treats rank 0 as LOCKED, not unlocked', () => {
    // The store writes rank numbers; `talentId in unlockedTalents` would wrongly admit a refunded talent.
    expect(unlockedAspectVerbs({ [ASPECT_VERBS[0].talent]: 0 })).toEqual([]);
  });
});

describe('aspectWheel — ring geometry', () => {
  it('places the first item at TOP and advances clockwise', () => {
    const p = ringLayout(4, 100);
    expect(p[0]).toEqual({ x: 0, y: -100 }); // top
    expect(p[1]).toEqual({ x: 100, y: 0 }); // right (screen +y is DOWN, so clockwise)
    expect(p[2]).toEqual({ x: 0, y: 100 }); // bottom
    expect(p[3]).toEqual({ x: -100, y: 0 }); // left
  });

  it('spaces N items evenly on the circle', () => {
    for (const n of [1, 2, 3, 4]) {
      const p = ringLayout(n, 80);
      expect(p).toHaveLength(n);
      for (const q of p) expect(Math.hypot(q.x, q.y)).toBeCloseTo(80, 0);
    }
  });

  it('returns nothing for a degenerate ring instead of NaN coordinates', () => {
    // A NaN offset renders a button at the top-left corner of the screen, silently, which is far worse
    // than an absent ring.
    expect(ringLayout(0, 100)).toEqual([]);
    expect(ringLayout(4, 0)).toEqual([]);
    expect(ringLayout(-1, 100)).toEqual([]);
  });
});

describe('aspectWheel — tap hold', () => {
  it('holds long enough that a once-per-frame state machine cannot miss the rising edge', () => {
    expect(TAP_HOLD_MS).toBeGreaterThan(1000 / 30); // > one frame at 30fps
    expect(TAP_HOLD_MS).toBeLessThan(400); // still reads as a tap, not a hold
  });
});
