import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// S2-B3-M1 (the exploit-closer): kill attribution must stay WIRED end-to-end. The moment any
// ally can kill, an unfiltered subscriber or an ungated damageMob side-effect re-opens the
// AFK-farm. damageMob is component-closure-scoped (untestable directly) — these source-shape
// gates pin the wiring; the bus semantics are unit-tested in mobKillBus.test.js.
describe('kill-attribution gates (S2-B3-M1)', () => {
  const npc = read('SimplifiedNPCSystem.jsx');

  it('damageMob carries the 4-arg attribution signature', () => {
    expect(npc).toMatch(/damageMob = \(id, damage = 25, type = 'physical', source = 'player'\)/);
  });

  it('hitstop, camera shake, and XP orbs are player-only', () => {
    expect(npc).toMatch(/if \(source === 'player'\) useGameStore\.setState\(\{ hitstopUntil/);
    expect(npc).toMatch(/source === 'player' && store\.triggerCameraShake/);
    expect(npc).toMatch(/source === 'player' \? Math\.max\(1, Math\.floor\(totalXP \/ orbValue\)\) : 0/);
  });

  it('the death emit threads source', () => {
    expect(npc).toMatch(/emitMobKill\(entity\.type, \[entity\.position\.x, entity\.position\.y, entity\.position\.z\], source\)/);
  });

  it('the meter accruals and quest credit filter on player kills', () => {
    const agf = read('AdvancedGameFeatures.jsx');
    expect((agf.match(/source === 'player' && s\.isDay && !isCaptureMode\(\)/g) || []).length).toBe(2); // ferocity + kinetic
    expect(read('QuestSystem.jsx')).toMatch(/if \(source !== 'player'\) return;/);
  });
});
