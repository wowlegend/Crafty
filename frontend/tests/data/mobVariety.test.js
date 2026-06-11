import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// MOB_TYPES lives un-exported inside the god-file; characterize it textually (the
// established static-gate style) — the registry contract the variety pass relies on.
const src = readFileSync(resolve(HERE, '../../src/SimplifiedNPCSystem.jsx'), 'utf8');

describe('the mob-variety pass: the registry contract', () => {
  it('the three new types exist with their design stats', () => {
    expect(src).toMatch(/skitterling: \{ color: '#5B4FA8', health: 30, speed: 3\.8/);
    expect(src).toMatch(/duskhound: \{ color: '#4A3A50', health: 70, speed: 3\.2/);
    expect(src).toMatch(/moss_brute: \{ color: '#3D5A3A', health: 220, speed: 1\.2/);
  });
  it('the skitterling carries spider legs AND spawnMob copies legMode to the entity', () => {
    expect(src).toMatch(/skitterling:[^\n]*legMode: 'spider'/);
    expect(src).toMatch(/\.\.\.\(mobConfig\.legMode \? \{ legMode: mobConfig\.legMode \} : \{\}\)/);
  });
  it('spawning is WEIGHTED (the brute must not roll like a zombie)', () => {
    expect(src).toMatch(/moss_brute:[^\n]*weight: 0\.25/);
    expect(src).toMatch(/weightedPick\(entriesFor\(hostileTypes\)/);
  });
});
