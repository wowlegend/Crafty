import { describe, it, expect } from 'vitest';
import { deniedReason } from '../../src/game/deniedReason.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';

describe('deniedReason — denial toast copy', () => {
  it('no-mana names the resource', () => {
    expect(deniedReason('no-mana')).toBe('Not enough mana');
  });
  it('aspect-locked teaches WHERE to unlock + names the Aspect', () => {
    const t = deniedReason('aspect-locked', 'WILDHEART');
    expect(t).toContain('WILDHEART');
    expect(t).toContain('Talents');
    expect(t, 'the key that opens Talents (Character)').toContain('(Tab)');
  });
  it('aspect-locked without context still teaches the unlock path', () => {
    expect(deniedReason('aspect-locked')).toContain('Talents');
  });
  it('no-ember says the ember bar is short, in the player\'s language', () => {
    try {
      useGameStore.setState({ locale: 'en' });
      expect(deniedReason('no-ember')).toBe('Not enough ember');
      useGameStore.setState({ locale: 'zh-CN' });
      expect(deniedReason('no-ember')).toBe('余烬不足');
    } finally {
      useGameStore.setState({ locale: 'en' });
    }
  });
  it('an unknown kind returns a safe generic (never empty)', () => {
    expect(deniedReason('whatever')).toBe("You can't do that yet");
    expect(deniedReason().length).toBeGreaterThan(0);
  });
});
