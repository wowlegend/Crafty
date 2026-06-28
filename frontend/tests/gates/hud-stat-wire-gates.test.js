import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// Regression (2026-06-28 audit, HIGH): the HUD stat bars must bind to keys the GameSystems
// context ACTUALLY exposes. The health bar passed health={gameSystems.health}, but the context
// only exposes `playerHealth` -> StatBar value falls back to its `value = 0` default -> the bar
// rendered 0/100 at full HP forever. The mana bar (gameSystems.mana) was correct, masking it.
describe('HUD stat-bar wiring — context-key integrity', () => {
  const hud = read('HUD.jsx');
  const gs = read('GameSystems.jsx');

  // the canonical `const value = { ... };` object the provider supplies
  const ctxKeys = (() => {
    const m = gs.match(/const value = \{([\s\S]*?)\};/);
    if (!m) throw new Error('GameSystems provider `const value = {...}` not found');
    return m[1]
      .split(',')
      .map((s) => s.trim().split(':')[0].trim())
      .filter(Boolean);
  })();

  it('the GameSystems context exposes the stat keys the HUD needs', () => {
    for (const k of ['playerHealth', 'maxHealth', 'mana', 'maxMana', 'hunger', 'isAlive']) {
      expect(ctxKeys).toContain(k);
    }
  });

  it('the health bar binds to gameSystems.playerHealth (not the nonexistent .health)', () => {
    expect(hud).toMatch(/<PlayerHealthBar\s+health=\{gameSystems\.playerHealth\}/);
    expect(hud).not.toMatch(/health=\{gameSystems\.health\}/);
  });

  it('every gameSystems.<key> the HUD reads exists on the context value (no silent 0-fallback)', () => {
    const reads = [...hud.matchAll(/gameSystems\.([A-Za-z]\w*)/g)].map((m) => m[1]);
    const missing = [...new Set(reads)].filter((k) => !ctxKeys.includes(k));
    expect(missing).toEqual([]);
  });
});
