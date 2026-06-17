import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const terrain = readFileSync(resolve(HERE, '../../src/world/Terrain.jsx'), 'utf8');

// M6 dead-wire fix: the onBlockPlace/onBlockBreak callbacks are registered by QuestSystem (and increment
// blocks_placed/blocks_broken + updateQuestProgress) but the mine()/place() executors never invoked them,
// so building/mining silently advanced NO quest (builder/architect/world_builder/miner) or achievement
// (Master Builder / Deep Digger). This pins the wiring: break fires in mine(), place fires in place(),
// each exactly once (no cross-wire, no double-count). The callback BODIES are covered by QuestSystem tests.
const between = (src, start, end) => {
  const i = src.indexOf(start);
  const j = src.indexOf(end, i + 1);
  return i >= 0 && j > i ? src.slice(i, j) : '';
};

describe('M6 block place/break advance quests + achievements (dead-wire fix)', () => {
  it('mine() fires the registered onBlockBreak callback (not onBlockPlace)', () => {
    const mineBody = between(terrain, 'const mine = (h) =>', 'const place = (h) =>');
    expect(mineBody).toMatch(/store\.onBlockBreak\?\.\(\)/);
    expect(mineBody).not.toMatch(/onBlockPlace/);
  });

  it('place() fires the registered onBlockPlace callback (not onBlockBreak)', () => {
    const placeBody = between(terrain, 'const place = (h) =>', 'const open = (h) =>');
    expect(placeBody).toMatch(/store\.onBlockPlace\?\.\(\)/);
    expect(placeBody).not.toMatch(/onBlockBreak/);
  });

  it('each callback is wired exactly once (no double-count via the worker handler)', () => {
    expect((terrain.match(/onBlockBreak\?\.\(\)/g) || []).length).toBe(1);
    expect((terrain.match(/onBlockPlace\?\.\(\)/g) || []).length).toBe(1);
  });
});
