import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dissolvePose, DEATH_DISSOLVE_MS } from '../../src/game/deathFx.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// SOTA M2 #7 (death beats): a mob kill no longer instantly vanishes -- the corpse dissolves
// (shrink + spin) over DEATH_DISSOLVE_MS before ecs.remove, so the kill has weight. The XP / spark /
// kill-bus still fire at health<=0 (unchanged); only the REMOVAL is deferred.
describe('death-weight dissolve gates (M2 #7 S1)', () => {
  const npc = read('SimplifiedNPCSystem.jsx') + read('systems/SpawnerSystem.jsx') + read('systems/CombatSystem.jsx'); // A1.3 sweep + A1.8 dyingUntil set
  const mob = read('render/MobModel.jsx');

  it('the pure dissolve is sane (full->gone)', () => {
    expect(dissolvePose(0).scale).toBe(1);
    expect(dissolvePose(1).scale).toBeCloseTo(0);
  });

  it('the kill DEFERS removal behind a dissolve (sets dyingUntil, not an immediate ecs.remove)', () => {
    // the death finisher fires once (guarded so a hit on a dissolving corpse cannot re-kill it)
    expect(npc).toMatch(/if \(entity\.health <= 0 && !entity\.dyingUntil\)/);
    // removal is deferred to dyingUntil, NOT done inline in the death branch
    expect(npc).toMatch(/entity\.dyingUntil = performance\.now\(\) \+ DEATH_DISSOLVE_MS/);
    // the kill-bus + XP + spark still fire (kept)
    expect(npc).toMatch(/emitMobKill\(entity\.type/);
  });

  it('a dying corpse is swept (removed) only after the dissolve elapses', () => {
    expect(/if \(entity\.dyingUntil\) \{[\s\S]{0,140}performance\.now\(\) >= entity\.dyingUntil\) ecs\.remove/.test(npc)).toBe(true);
  });

  it('a dissolving corpse keeps RENDERING (the filter includes dyingUntil)', () => {
    expect(npc).toMatch(/entity\.health > 0 \|\| entity\.dyingUntil/);
  });

  it('MobModel renders the dissolve pose from dyingUntil via the shared windupRamp', () => {
    expect(mob).toMatch(/import \{ dissolvePose, DEATH_DISSOLVE_MS \} from '\.\.\/game\/deathFx'/);
    expect(mob).toMatch(/if \(entity\.dyingUntil\)/);
    expect(mob).toMatch(/windupRamp\(performance\.now\(\), entity\.dyingUntil, DEATH_DISSOLVE_MS\)/);
    expect(mob).toMatch(/dissolvePose\(dt\)/);
  });
});

// S1b: the boss kill gets a climactic slow-mo freeze + bloom flash (the victory stinger + overlay
// already fire on bossDefeated).
describe('boss-kill climactic beat gates (M2 #7 S1b)', () => {
  const boss = read('world/bossSystem.js');

  it('the boss-defeat branch fires a slow-mo (boss-tier hitstop) + a bloom flash', () => {
    expect(boss).toMatch(/import \{ HITSTOP \} from '\.\.\/game\/trauma\.js'/);
    expect(/newHealth <= 0\)[\s\S]{0,1300}hitstopUntil: performance\.now\(\) \+ HITSTOP\.boss/.test(boss)).toBe(true);
    expect(/newHealth <= 0\)[\s\S]{0,1400}triggerBloomSpike\(/.test(boss)).toBe(true);
  });
});

// S2: the Death + Victory overlays are rebuilt on the Panel/Button primitives + theme tokens (were raw
// Tailwind: bg-black panels, text-red-500/amber-300 titles, bg-green-600/amber-500 buttons) + a run summary.
describe('death/victory overlays on theme tokens (M2 #7 S2)', () => {
  const gs = read('GameSystems.jsx');

  it('imports the Panel + Button primitives', () => {
    expect(gs).toMatch(/import \{ Panel \} from '\.\/ui\/primitives\/Panel\.jsx'/);
    expect(gs).toMatch(/import \{ Button \} from '\.\/ui\/primitives\/Button\.jsx'/);
  });
  it('both overlays render on Panel + Button (not raw Tailwind buttons)', () => {
    expect((gs.match(/<Panel variant="raise"/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((gs.match(/<Button variant="primary" size="lg"/g) || []).length).toBeGreaterThanOrEqual(2);
    // the old off-token surfaces are gone
    expect(gs.includes('bg-green-600')).toBe(false);
    expect(gs.includes('bg-amber-500 hover:bg-amber-400')).toBe(false);
    expect(gs.includes('text-red-500')).toBe(false);
  });
  it('titles use the danger/warn tokens', () => {
    expect(gs).toMatch(/font-bold text-danger/);  // death
    expect(gs).toMatch(/font-bold text-warn/);    // victory
  });
  it('shows a run summary (level + nights survived)', () => {
    expect((gs.match(/<RunStat label="Level" value=\{level\}/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(gs).toMatch(/RunStat label="Nights survived" value=\{nights\}/);
    expect((gs.match(/useGameStore\.getState\(\)\.nightCount/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
