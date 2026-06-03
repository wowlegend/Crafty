import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('progression single-source gates', () => {
  it('SimpleExperienceSystem no longer owns level/currentXP/totalXP useState', () => {
    const src = read('src/SimpleExperienceSystem.jsx');
    expect(/const\s*\[\s*playerLevel\s*,/.test(src)).toBe(false);
    expect(/const\s*\[\s*currentXP\s*,/.test(src)).toBe(false);
    expect(/const\s*\[\s*totalXP\s*,/.test(src)).toBe(false);
  });
  it('App no longer re-pushes a getPlayerLevel lambda into the store', () => {
    expect(/setGetPlayerLevel/.test(read('src/App.jsx'))).toBe(false);
  });
  it('GameSystems no longer derives maxHealth (store owns it)', () => {
    expect(/newMaxHealth\s*=\s*100\s*\+/.test(read('src/GameSystems.jsx'))).toBe(false);
  });
  it('the level-up max-stat formula lives only in progression.js', () => {
    for (const f of ['src/store/useGameStore.jsx', 'src/GameSystems.jsx', 'src/SimpleExperienceSystem.jsx']) {
      expect(/100\s*\+\s*\(\s*level\s*-\s*1\s*\)\s*\*\s*10\s*\+/.test(read(f))).toBe(false);
    }
  });
});
