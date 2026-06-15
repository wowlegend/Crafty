import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(__dirname, '../../src/world/bossSystem.js'), 'utf8');

// S9b.2: the Shadow Dragon is now the FIXED Blight Heart climax (you journey to the lair you have been
// seeing on the compass), NOT a level-5 ambush spawned at `playerPos + 25`. Locks the relocation so a
// future edit can't silently revert to the ambush.
describe('S9b.2 boss relocated to the Blight Heart lair', () => {
  it('imports + uses blightHeartSite (the fixed lair)', () => {
    expect(/import\s*\{\s*blightHeartSite\s*\}\s*from\s*'\.\/blightHeart\.js'/.test(src)).toBe(true);
    expect(src.includes('blightHeartSite(')).toBe(true);
  });
  it('no longer spawns the boss as an ambush at playerPos + 25', () => {
    expect(/playerPos\.x\s*\+\s*25/.test(src)).toBe(false);
    expect(/playerPos\.z\s*\+\s*25/.test(src)).toBe(false);
  });
  it('still keeps the level-5 gate + the once-guard + the DEV force-spawn fixture', () => {
    expect(src.includes('playerLevel')).toBe(true);
    expect(src.includes('bossSpawned.current')).toBe(true);
    expect(src.includes('forceBossSpawn')).toBe(true); // boss-closeup capture fixture must survive
  });
});
