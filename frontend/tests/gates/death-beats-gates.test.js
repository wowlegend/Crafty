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

  it('a dying corpse is swept (removed) only after the dissolve elapses, EVERY FRAME', () => {
    // The sweep moved out of SpawnerSystem's 1000ms spawn-check throttle, where the 320ms dissolve became
    // a 320-1320ms corpse lifetime. This gate pinned the inline `if (entity.dyingUntil)` block that lived
    // inside the throttle, so it went red at the fix; the deadline semantics it protects are now unit-
    // tested against wall-clock latency in systems/corpseSweep.test.js, and what remains here is the
    // WIRING: the sweep is called, and it is called from OUTSIDE the throttle.
    expect(npc).toMatch(/sweepExpiredCorpses\(mobsQuery\.entities, now, \(e\) => ecs\.remove\(e\)\)/);
    const call = npc.indexOf('sweepExpiredCorpses(mobsQuery.entities');
    const throttle = npc.indexOf('now - lastSpawnCheck.current >= 1000');
    expect(call, 'the sweep call is missing').toBeGreaterThan(-1);
    expect(throttle, 'the spawn throttle is missing').toBeGreaterThan(-1);
    expect(call, 'the corpse sweep is back inside the 1000ms spawn throttle').toBeLessThan(throttle);
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

  it('the boss-defeat beat fires a slow-mo (boss-tier hitstop) + a bloom flash', () => {
    expect(boss).toMatch(/import \{ HITSTOP \} from '\.\.\/game\/trauma\.js'/);
    // B2h: the boss-kill effects moved OUT of the setState updater into a post-commit isolated runner
    // (game/bossKill.js), so they are no longer positionally adjacent to `newHealth <= 0`. That a boss kill
    // ACTUALLY fires the hitstop + bloom (and that a throwing reward cannot void the win) is now proven
    // BEHAVIORALLY in boss-killblock-gates.test.jsx. Here we keep only the loose presence check.
    expect(boss).toMatch(/hitstopUntil: performance\.now\(\) \+ HITSTOP\.boss/);
    expect(boss).toMatch(/triggerBloomSpike\(/);
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
