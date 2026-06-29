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
    const npc = read('SimplifiedNPCSystem.jsx') + read('systems/CombatSystem.jsx'); // A1.8: captureMob moved to CombatSystem
    expect(npc).toMatch(/GameMethods\.captureMob = captureMob/);
    expect(npc).toMatch(/convertMobToAlly\(ecs, entity\)/);
  });
  it('nothing outside allegiance.js removes the isMob component (the seam is the ONLY door)', () => {
    const npc = read('SimplifiedNPCSystem.jsx');
    expect(npc).not.toMatch(/removeComponent\([^)]*'isMob'/);
    expect(read('Components.jsx')).not.toMatch(/removeComponent\([^)]*'isMob'/);
  });

  // ELEMANCER-M1: worldBlocks keys are UNDERSCORE-shaped (`x_y_z`) — a comma-template reader
  // shipped as a silent always-miss (Components.jsx:808, found by the B4 design workflow).
  it('no worldBlocks reader uses a comma-template key (the always-miss shape)', () => {
    for (const f of ['Components.jsx', 'SimplifiedNPCSystem.jsx', 'world/Terrain.jsx', 'render/BossEntity.jsx']) {
      expect(read(f), `${f} has a comma-keyed worldBlocks lookup`).not.toMatch(/worldBlocks\.(has|get)\(`[^`]*,\$\{/);
    }
  });
});
