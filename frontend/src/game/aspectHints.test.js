import { describe, it, expect } from 'vitest';
import { aspectUnlockHint } from './aspectHints';
import { tIn } from '../i18n/i18n.js';

const say = (talent, locale = 'en') => { const h = aspectUnlockHint(talent); return tIn(locale, h.key, h.vars); };

describe('aspectUnlockHint (just-in-time Aspect teaching)', () => {
  it('teaches the verb + key for each Aspect verb-talent (from KEY_MAP)', () => {
    expect(say('wildheart_roar')).toMatch(/WILDHEART/);
    expect(say('wildheart_roar')).toMatch(/press R/);
    expect(say('voidhand_grasp')).toMatch(/press V/);
    expect(say('soulbind_snare')).toMatch(/press X/);
    expect(say('elemancer_imbue')).toMatch(/press Z/);
    expect(say('elemancer_imbue', 'zh-CN')).toMatch(/按 Z/);
  });
  it('returns null for non-Aspect-verb talents (no toast)', () => {
    expect(aspectUnlockHint('wildheart_endurance')).toBe(null);
    expect(aspectUnlockHint('nope')).toBe(null);
  });
});
