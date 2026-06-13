import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOB_TYPES } from '../../src/game/mobTypes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// S3-M3: MOB_TYPES now lives in its own pure module, so the registry contract asserts
// LIVE (structural — strictly stronger than the prior textual regex). The two WIRING asserts
// stay textual: they pin the NPC-file spawner (legMode copy to the entity + weightedPick usage),
// which is behavior in SimplifiedNPCSystem, not shape in the registry object.
const src = readFileSync(resolve(HERE, '../../src/SimplifiedNPCSystem.jsx'), 'utf8');

describe('the mob-variety pass: the registry contract (LIVE)', () => {
  it('the three new types exist with their design stats', () => {
    expect(MOB_TYPES.skitterling).toMatchObject({ color: '#5B4FA8', health: 30, speed: 3.8 });
    expect(MOB_TYPES.duskhound).toMatchObject({ color: '#4A3A50', health: 70, speed: 3.2 });
    expect(MOB_TYPES.moss_brute).toMatchObject({ color: '#3D5A3A', health: 220, speed: 1.2 });
  });
  it('the skitterling carries spider legs; spawnMob copies legMode to the entity (wiring stays textual)', () => {
    expect(MOB_TYPES.skitterling.legMode).toBe('spider');
    expect(src).toMatch(/\.\.\.\(mobConfig\.legMode \? \{ legMode: mobConfig\.legMode \} : \{\}\)/);
  });
  it('spawning is WEIGHTED — the brute carries a low weight + the spawner uses weightedPick', () => {
    expect(MOB_TYPES.moss_brute.weight).toBe(0.25);
    expect(src).toMatch(/weightedPick\(entriesFor\(hostileTypes\)/);
  });
});
