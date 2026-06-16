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
  const npc = read('SimplifiedNPCSystem.jsx');
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
