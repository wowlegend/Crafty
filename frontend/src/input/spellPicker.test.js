import { describe, it, expect } from 'vitest';
import { SPELL_ORDER, spellLabelKey, spellAccent } from './spellPicker.js';
import { SPELL_TYPES } from '../game/spells.js';
import { STRINGS } from '../i18n/strings.js';

describe('spellPicker — the roster is DERIVED, not retyped', () => {
  it('offers exactly the spells the roster of record defines, in its order', () => {
    expect(SPELL_ORDER).toEqual(Object.keys(SPELL_TYPES));
    expect(SPELL_ORDER.length).toBeGreaterThan(1); // an empty roster would make everything below vacuous
  });

  it('covers what Digit1-4 selects — the picker must reach every spell the keyboard can', () => {
    // The whole defect was that touch could reach exactly one of these. If a spell is bound to a digit
    // but missing here, the touch player is still locked out of it.
    for (const id of ['fireball', 'iceball', 'lightning', 'arcane']) expect(SPELL_ORDER).toContain(id);
  });
});

describe('spellPicker — labels resolve in BOTH locales', () => {
  it('every spell has a real i18n key, en and zh-CN', () => {
    // The roster says `fireball`/`iceball`; the string tables say `spell.fire`/`spell.ice`. That mismatch
    // is mapped explicitly, and this is the assertion that stops a new spell shipping a blank button.
    for (const id of SPELL_ORDER) {
      const key = spellLabelKey(id);
      expect(STRINGS.en, `${id} -> ${key} (en)`).toHaveProperty(key);
      expect(STRINGS['zh-CN'], `${id} -> ${key} (zh-CN)`).toHaveProperty(key);
    }
  });

  it('maps the two ids that differ from their key, and passes the rest through', () => {
    expect(spellLabelKey('fireball')).toBe('spell.fire');
    expect(spellLabelKey('iceball')).toBe('spell.ice');
    expect(spellLabelKey('lightning')).toBe('spell.lightning');
    expect(spellLabelKey('arcane')).toBe('spell.arcane');
  });
});

describe('spellPicker — accent colour comes from the roster', () => {
  it('returns each spell own colour, so the button cannot drift from the projectile', () => {
    for (const id of SPELL_ORDER) expect(spellAccent(id)).toBe(SPELL_TYPES[id].color);
  });

  it('returns null for an unknown id rather than a plausible-looking default', () => {
    // A fallback colour would render a confident, wrong button. null is visible.
    expect(spellAccent('not-a-spell')).toBeNull();
    expect(spellAccent(undefined)).toBeNull();
  });
});
