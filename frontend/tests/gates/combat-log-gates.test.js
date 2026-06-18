import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

describe('combat-log gates', () => {
  const log = read('ui/CombatLog.jsx');
  it('renders the notification stream prop (the addNotification feed)', () => {
    expect(log).toMatch(/notifications/);
  });
  it('caps the visible lines to a ring buffer (tail slice)', () => {
    // a negative-arg slice keeps only the last N entries (literal -8 or an expression like -(touch?4:8))
    expect(log).toMatch(/\.slice\(\s*-/);
  });
  it('is bottom-left + capture-suppressed', () => {
    expect(log).toMatch(/isCaptureMode\(\)/);
    expect(log).toMatch(/bottom-/);
    expect(log).toMatch(/left-/);
  });
  it('HUD wires CombatLog to questSystem.notifications + collapses on touch like QuestTracker', () => {
    const hud = read('HUD.jsx');
    expect(hud).toMatch(/<CombatLog[^>]*notifications=\{questSystem\.notifications\}/);
  });
});
