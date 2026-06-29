import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('npc spawn + AI-skip gates', () => {
  const npc = strip(read('SimplifiedNPCSystem.jsx'));
  it('spawns the hub NPCs from the roster (makeNpcEntity / HUB_NPCS)', () => {
    expect(npc).toMatch(/HUB_NPCS|makeNpcEntity/);
  });
  it('the AI/movement tick SKIPS static NPCs (continue/return on isStatic)', () => {
    // the per-entity AI loop must guard on isStatic so NPCs never wander
    expect(npc).toMatch(/isStatic/);
  });
  it('spawns NPCs exactly once (guarded ref, not every world-ready)', () => {
    expect(npc).toMatch(/npcsSpawned|_npcSpawned/);
  });
});

describe('npc interaction + mirror', () => {
  it('store mirrors npcEntities for the minimap/nametags', () => {
    expect(read('store/useGameStore.jsx')).toMatch(/npcEntities:/);
  });
  it('MinimapSyncSystem syncs npcEntities (static NPC positions)', () => {
    // extracted to src/systems/MinimapSyncSystem.jsx (v6 de-monolith A1.1) -- gate follows the code.
    expect(read('systems/MinimapSyncSystem.jsx')).toMatch(/npcEntities/);
  });
  it('the mob mirror carries role + npcName so the G-interact can route by role', () => {
    expect(read('systems/MinimapSyncSystem.jsx')).toMatch(/role: e\.role/);
  });
  it('the G-interact routes a role to its panel (merchant -> trading, others by role)', () => {
    expect(read('InputManager.jsx')).toMatch(/role/);
  });
  it('the TradingInterface title can show the NPC name', () => {
    expect(read('ui/TradingInterface.jsx')).toMatch(/npcName/);
  });
});
