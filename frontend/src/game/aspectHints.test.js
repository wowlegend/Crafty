import { describe, it, expect } from 'vitest';
import { aspectUnlockHint } from './aspectHints';

describe('aspectUnlockHint (just-in-time Aspect teaching)', () => {
  it('teaches the verb + key for each Aspect verb-talent (from KEY_MAP)', () => {
    expect(aspectUnlockHint('wildheart_roar')).toMatch(/WILDHEART/);
    expect(aspectUnlockHint('wildheart_roar')).toMatch(/press R/);
    expect(aspectUnlockHint('voidhand_grasp')).toMatch(/press V/);
    expect(aspectUnlockHint('soulbind_snare')).toMatch(/press X/);
    expect(aspectUnlockHint('elemancer_imbue')).toMatch(/press Z/);
  });
  it('returns null for non-Aspect-verb talents (no toast)', () => {
    expect(aspectUnlockHint('wildheart_endurance')).toBe(null);
    expect(aspectUnlockHint('nope')).toBe(null);
  });
});
