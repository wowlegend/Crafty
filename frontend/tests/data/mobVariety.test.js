import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOB_TYPES, mobEntity } from '../../src/game/mobTypes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// S3-M3: MOB_TYPES now lives in its own pure module, so the registry contract asserts
// LIVE (structural — strictly stronger than the prior textual regex). The legMode copy is checked on the entity the
// spawner makes (game/mobTypes.js mobEntity). The two WIRING asserts stay textual: they pin that spawnMob makes its
// mobs with that factory and picks their type with weightedPick, which is behavior in the spawner, not shape in the
// registry object.
const src = readFileSync(resolve(HERE, '../../src/SimplifiedNPCSystem.jsx'), 'utf8')
  + readFileSync(resolve(HERE, '../../src/systems/SpawnerSystem.jsx'), 'utf8'); // A1.3: spawnMob moved to SpawnerSystem

describe('the mob-variety pass: the registry contract (LIVE)', () => {
  it('the three new types exist with their design stats', () => {
    expect(MOB_TYPES.skitterling).toMatchObject({ color: '#5B4FA8', health: 30, speed: 3.8 });
    expect(MOB_TYPES.duskhound).toMatchObject({ color: '#4A3A50', health: 70, speed: 3.2 });
    expect(MOB_TYPES.moss_brute).toMatchObject({ color: '#3D5A3A', health: 220, speed: 1.2 });
  });
  it('the skitterling carries spider legs; its entity copies legMode, and spawnMob makes its mobs that way (wiring stays textual)', () => {
    expect(MOB_TYPES.skitterling.legMode).toBe('spider');
    const at = { x: 1, y: 2, z: 3 };
    expect(mobEntity('skitterling', 1, at).legMode, 'the skitterling\'s entity lost its spider legs').toBe('spider');
    expect('legMode' in mobEntity('zombie', 2, at), 'a type with no legMode got one').toBe(false);
    expect(src).toMatch(/ecs\.add\(mobEntity\(type, /);
  });
  it('spawning is WEIGHTED — the brute carries a low weight + the spawner uses weightedPick', () => {
    expect(MOB_TYPES.moss_brute.weight).toBe(0.25);
    expect(src).toMatch(/weightedPick\(entriesFor\(hostileTypes\)/);
  });
});
