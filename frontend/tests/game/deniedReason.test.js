import { describe, it, expect } from 'vitest';
import { deniedReason } from '../../src/game/deniedReason.js';

describe('deniedReason — denial toast copy', () => {
  it('no-mana names the resource', () => {
    expect(deniedReason('no-mana')).toBe('Not enough mana');
  });
  it('aspect-locked teaches WHERE to unlock + names the Aspect', () => {
    const t = deniedReason('aspect-locked', 'WILDHEART');
    expect(t).toContain('WILDHEART');
    expect(t).toContain('Talents');
    expect(t).toContain('U');
  });
  it('aspect-locked without context still teaches the unlock path', () => {
    expect(deniedReason('aspect-locked')).toContain('Talents');
  });
  it('an unknown kind returns a safe generic (never empty)', () => {
    expect(deniedReason('whatever')).toBe("You can't do that yet");
    expect(deniedReason().length).toBeGreaterThan(0);
  });
});
