import { describe, it, expect } from 'vitest';
import { ASPECT_VERBS, unlockedAspectVerbs, fanLayout, fanItemStyle, fanOpenerStyle, fanItemInnerEdge, FAN_ANCHOR_RIGHT, TOUCH_BTN, ASPECT_ROW_BOTTOM, SPELL_ROW_BOTTOM, TAP_HOLD_MS, cooldownFraction, anyOnCooldown } from './aspectWheel.js';
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

describe('aspectWheel — fan geometry, measured in px against the viewport', () => {
  // THE OLD RING PUT ITEM 1 ENTIRELY OFF-SCREEN.
  //
  // ringLayout fanned items around a FULL circle from a control pinned to the bottom-right edge, so the
  // item at angle 0 landed at `right: 26 - 78 = -52px` — a 52px button beginning exactly at the viewport's
  // right edge, zero tappable pixels. iceball, the second of four spells, was permanently unreachable on
  // touch. The gate that was supposed to cover this asserted the glyph was in the jsdom document, and
  // jsdom has no layout, so it could not have seen the defect under any circumstances.
  //
  // These assertions are in PIXELS, against a declared minimum viewport. That is the only form of this
  // test that could have gone red.
  const MIN_VIEWPORT_W = 320; // narrowest phone we claim to support

  it('every item of a FULL four-item fan stays inside the narrowest supported viewport', () => {
    const fan = fanLayout(4);
    expect(fan).toHaveLength(4);
    for (const [i, q] of fan.entries()) {
      const outer = fanItemInnerEdge(q); // distance from the right edge to the item's far side
      expect(outer, `item ${i} runs past the left of a ${MIN_VIEWPORT_W}px viewport`).toBeLessThanOrEqual(MIN_VIEWPORT_W);
      expect(FAN_ANCHOR_RIGHT - q.x, `item ${i} sits at a NEGATIVE right offset, i.e. off the screen`).toBeGreaterThanOrEqual(0);
    }
  });

  it('adjacent items never overlap — two 52px targets 58px apart', () => {
    const fan = fanLayout(4);
    for (let i = 1; i < fan.length; i++) {
      const gap = Math.abs(fan[i].x - fan[i - 1].x);
      expect(gap, `items ${i - 1} and ${i} overlap`).toBeGreaterThanOrEqual(TOUCH_BTN);
    }
  });

  it('the fan does not climb, so it cannot collide with the opener one row above', () => {
    // The Aspect row sits 78px below the spell row. ANY upward component at r=78 lands one fan item
    // exactly on the other opener — which paints later in DOM order and therefore steals the tap.
    for (const q of fanLayout(4)) expect(q.y).toBe(0);
    expect(SPELL_ROW_BOTTOM - ASPECT_ROW_BOTTOM).toBeGreaterThanOrEqual(TOUCH_BTN);
  });

  it('item 0 lands exactly on its opener — the affordance, and the control for the offsets above', () => {
    expect(fanItemStyle(SPELL_ROW_BOTTOM, fanLayout(4)[0])).toEqual(fanOpenerStyle(SPELL_ROW_BOTTOM));
  });

  it('emits the CSS the component actually renders, both rows', () => {
    // The style seam is shared by the hit-target layer and the glyph layer, so this is the string both
    // draw with — not a reimplementation of it.
    const s0 = fanItemStyle(SPELL_ROW_BOTTOM, { x: -58, y: 0 });
    expect(s0.right).toBe('calc(env(safe-area-inset-right,0px) + 84px)');
    expect(s0.bottom).toBe('calc(11% + 182px)');
    expect(s0.width).toBe(TOUCH_BTN);
    const a0 = fanItemStyle(ASPECT_ROW_BOTTOM, { x: -116, y: 0 });
    expect(a0.right).toBe('calc(env(safe-area-inset-right,0px) + 142px)');
    expect(a0.bottom).toBe('calc(11% + 104px)');
  });

  it('returns nothing for a degenerate fan instead of NaN coordinates', () => {
    // A NaN offset renders a button at the top-left corner of the screen, silently, which is far worse
    // than an absent fan.
    expect(fanLayout(0)).toEqual([]);
    expect(fanLayout(4, 0)).toEqual([]);
    expect(fanLayout(-1)).toEqual([]);
  });
});

describe('aspectWheel — tap hold', () => {
  it('holds long enough that a once-per-frame state machine cannot miss the rising edge', () => {
    expect(TAP_HOLD_MS).toBeGreaterThan(1000 / 30); // > one frame at 30fps
    expect(TAP_HOLD_MS).toBeLessThan(400); // still reads as a tap, not a hold
  });
});

describe('aspectWheel — cooldown fraction (X2)', () => {
  it('returns null when there is nothing to draw', () => {
    // Each of these renders a wedge if mishandled; a NaN one covers the glyph with a full black disc.
    expect(cooldownFraction(null)).toBeNull();
    expect(cooldownFraction(undefined)).toBeNull();
    expect(cooldownFraction({ ready: true, remaining: 0, duration: 2 })).toBeNull();
    expect(cooldownFraction({ remaining: 1 })).toBeNull(); // no duration -> would divide by zero
    expect(cooldownFraction({ remaining: 1, duration: 0 })).toBeNull();
    expect(cooldownFraction({ remaining: NaN, duration: 2 })).toBeNull();
    expect(cooldownFraction({ remaining: 0, duration: 2 })).toBeNull(); // elapsed
  });

  it('returns the share of the cooldown still to burn', () => {
    expect(cooldownFraction({ remaining: 1, duration: 2 })).toBe(0.5);
    expect(cooldownFraction({ remaining: 2, duration: 2 })).toBe(1);
  });

  it('clamps a remaining that exceeds its duration instead of over-sweeping', () => {
    expect(cooldownFraction({ remaining: 9, duration: 2 })).toBe(1);
  });

  it('anyOnCooldown answers for the CLOSED ring, which is its whole job', () => {
    const [a, b] = ASPECT_VERBS;
    expect(anyOnCooldown({}, ASPECT_VERBS)).toBe(false);
    expect(anyOnCooldown({ [a.verb]: { ready: true, duration: 2 } }, ASPECT_VERBS)).toBe(false);
    expect(anyOnCooldown({ [a.verb]: { remaining: 1, duration: 2 } }, ASPECT_VERBS)).toBe(true);
    // only the verbs actually offered count — a locked Aspect cooling down is not the player's business
    expect(anyOnCooldown({ [b.verb]: { remaining: 1, duration: 2 } }, [a])).toBe(false);
  });
});
