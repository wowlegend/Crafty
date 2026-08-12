import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const comp = readFileSync(resolve(HERE, '../../src/Components.jsx'), 'utf8');
const between = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i + 1); return i >= 0 && j > i ? s.slice(i, j) : ''; };

// M6 #3: a melee hit on the BOSS sparked nothing -- the mob loop sparks via damageMob, but the boss is a
// separate (non-ECS) entity so its hit branch only played a sound + crit shake. This pins the spark spray
// (reusing the GPU pool + the form sparkType) for verb-consistency. Capture-inert (melee = real input only).
describe('M6 #3 boss-melee sparks (verb-consistency with the mob path)', () => {
  it('Components imports sparkFor (the mob-path spark pull)', () => {
    expect(comp).toMatch(/import \{ sparkFor \} from '\.\/game\/mobHitFx/);
  });

  it('the boss-hit branch sprays GPU sparks at the boss point', () => {
    // ANCHORED TO CODE, NOT PROSE. This delimited the region with the comment 'Boss-cone branch', and
    // between() returns '' when its anchor is missing — so rewording or deleting that comment emptied
    // the region and the two toMatch assertions below would fail for a reason unrelated to behaviour
    // (or, had they been negations, pass over nothing). The call below occurs exactly once in the file.
    const branch = between(comp, 'isPointInCone(playerPos, lookDir, bossPoint', 'if (hitSomething');
    expect(branch, 'the boss-cone branch anchor no longer matches — re-anchor it').not.toBe('');
    expect(branch).toMatch(/triggerGPUSparks\(/);
    expect(branch).toMatch(/sparkFor\(sparkType, isCrit\)/);
  });
});
