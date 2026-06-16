import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(__dirname, '../../src/QuestSystem.jsx'), 'utf8');

// S8c-bis Slice 1: a guaranteed reward CHEST at each frontier shrine (the deferred S8 destination payoff).
// The spawn lives INSIDE useTreasureChests (which owns setChests) so no cross-hook bridge is needed. It is
// deterministic + once-per-shrine (keyed by chunk in a ref Set, mirroring the reach_shrine `reachedShrines`
// poll) + capture-guarded (shrines can sit near origin, so the guard keeps chests out of the 20 baselines).
describe('S8c-bis Slice 1 — a reward chest spawns at each shrine', () => {
  const i = src.indexOf('shrineChestsSpawned');
  const block = i > -1 ? src.slice(i, i + 1500) : '';

  it('has a once-per-shrine ref Set (shrineChestsSpawned)', () => {
    expect(i).toBeGreaterThan(-1);
    expect(/shrineChestsSpawned\s*=\s*useRef\(\s*new Set\(\)\s*\)/.test(src)).toBe(true);
  });

  it('the spawner finds the nearest shrine + is capture-guarded', () => {
    expect(block.includes('nearestLandmark(')).toBe(true);
    expect(block.includes('isCaptureMode()')).toBe(true);
  });

  it('spawns a chest tagged shrine:true via setChests (no cross-hook bridge)', () => {
    expect(/shrine:\s*true/.test(block)).toBe(true);
    expect(block.includes('setChests(')).toBe(true);
  });

  // Slice 2: a shrine chest pays MORE on the frontier -- openChest grants extra rolls scaled by zoneTier.
  it('openChest tier-scales the shrine chest reward (chest.shrine + zoneTier)', () => {
    const oi = src.indexOf('const openChest');
    expect(oi).toBeGreaterThan(-1);
    const open = src.slice(oi, oi + 1100);
    expect(open.includes('chest.shrine')).toBe(true);
    expect(/zoneTier\(/.test(open)).toBe(true);
  });
});
