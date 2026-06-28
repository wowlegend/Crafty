import { describe, it, expect } from 'vitest';
import { deniedReason } from './deniedReason.js';

// Pure toast copy for the silent-denial paths (UX legibility). Pins the exact strings — especially the
// aspect-locked text that TEACHES the unlock path (open Talents / U), and its optional ctx prefix.

describe('deniedReason', () => {
  it('no-mana -> the mana shortfall message', () => {
    expect(deniedReason('no-mana')).toBe('Not enough mana');
  });

  it('aspect-locked with a ctx prefixes the aspect name + the teach-the-unlock copy', () => {
    expect(deniedReason('aspect-locked', 'Voidhand')).toBe('Voidhand not yet unlocked — open Talents (U)');
  });

  it('aspect-locked without a ctx has no leading space', () => {
    expect(deniedReason('aspect-locked')).toBe('not yet unlocked — open Talents (U)');
    expect(deniedReason('aspect-locked', '')).toBe('not yet unlocked — open Talents (U)'); // empty ctx is falsy
  });

  it('an unknown or absent kind falls back to the generic denial', () => {
    expect(deniedReason('something-else')).toBe("You can't do that yet");
    expect(deniedReason()).toBe("You can't do that yet");
  });
});
