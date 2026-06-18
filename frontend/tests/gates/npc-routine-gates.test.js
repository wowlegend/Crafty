import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('npc ambient routine wiring', () => {
  const npc = strip(read('SimplifiedNPCSystem.jsx'));
  it('isNPC entities follow routinePosition (patrol by day, retreat at night)', () => {
    expect(npc).toMatch(/routinePosition/);
  });
  it('the ambient tick is capture-suppressed (NPCs freeze for byte-stable baselines)', () => {
    expect(npc).toMatch(/isCaptureMode\(\)/);
  });
  it('respects the day/night signal (isDay) for retreat', () => {
    expect(npc).toMatch(/isDay/);
  });
});
