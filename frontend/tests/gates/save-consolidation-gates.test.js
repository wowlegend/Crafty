import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('save consolidation gates', () => {
  it('the dead axios saveGame/loadGame are gone from the store', () => {
    const src = read('src/store/useGameStore.jsx');
    expect(/saveGame:\s*async/.test(src)).toBe(false);
    expect(/loadGame:\s*async/.test(src)).toBe(false);
  });
  it('WorldManager builds no inline full-payload literal (uses buildSaveData)', () => {
    const src = read('src/WorldManager.jsx');
    expect(/buildSaveData/.test(src)).toBe(true);
    expect(/world_data:\s*\{\s*blocks:\s*Array\.from/.test(src)).toBe(false);
  });
  it('buildSaveData serializes the progression slice + chests', () => {
    const src = read('src/game/saveSchema.js');
    for (const f of ['progression', 'level', 'attributes', 'equipment', 'talentPoints', 'unlockedTalents', 'chests']) {
      expect(src.includes(f)).toBe(true);
    }
  });
  it('App wires the autosave (createAutosave + flush on tab-hide/unload)', () => {
    const src = read('src/App.jsx');
    expect(/createAutosave/.test(src)).toBe(true);
    expect(/beforeunload/.test(src)).toBe(true);
  });
});
