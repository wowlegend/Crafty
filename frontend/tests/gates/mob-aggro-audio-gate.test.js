import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// The "signature-fires-in-prod" insurance (player-experience lens): the aggroGrowl voice exists in the
// bank (synthVoices.test) AND is actually triggered on the aggro edge here, cooldown-guarded. A future
// refactor of the worker-update loop that drops the wire turns this red instead of silently muting mobs.
const __dir = dirname(fileURLToPath(import.meta.url));
const npc = readFileSync(resolve(__dir, '../../src/SimplifiedNPCSystem.jsx'), 'utf8')
  + readFileSync(resolve(__dir, '../../src/systems/AIWorkerSystem.jsx'), 'utf8'); // A1.4: aggro-snarl moved to AIWorkerSystem

describe('mob aggro-snarl audio is wired (enemy-presence cue)', () => {
  it('fires aggroGrowl on the false->true isAggro edge, cooldown-guarded', () => {
    expect(npc).toMatch(/playSpatialSound\(\s*['"]aggroGrowl['"]/);
    expect(npc).toMatch(/!entity\.isAggro\s*&&\s*update\.isAggro/); // the rising edge, not every frame
    expect(npc).toMatch(/_lastAggroGrowl/);                          // cooldown state present
  });
});
