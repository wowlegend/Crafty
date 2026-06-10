import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// S2-B3-M3: the capture path must stay wired through the allegiance module (never inline
// component-twiddling at call sites — the converter owns the semantics + the blocklist).
describe('allegiance gates (S2-B3-M3)', () => {
  it('captureMob is registered and routes through convertMobToAlly', () => {
    const npc = read('SimplifiedNPCSystem.jsx');
    expect(npc).toMatch(/GameMethods\.captureMob = captureMob/);
    expect(npc).toMatch(/convertMobToAlly\(ecs, entity\)/);
  });
  it('nothing outside allegiance.js removes the isMob component (the seam is the ONLY door)', () => {
    const npc = read('SimplifiedNPCSystem.jsx');
    expect(npc).not.toMatch(/removeComponent\([^)]*'isMob'/);
    expect(read('Components.jsx')).not.toMatch(/removeComponent\([^)]*'isMob'/);
  });
});
