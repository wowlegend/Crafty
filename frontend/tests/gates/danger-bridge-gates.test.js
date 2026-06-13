import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

// A5: the boss-obsidian signature mood never fired in prod because nothing in gameplay
// wrote `dangerLevel` (S1-audit finding). useBossSystem now bridges bossActive -> the
// danger mood. These static gates lock that wiring + its capture-guard so a future edit
// can't silently re-break "obsidian during boss fights".
describe('boss → obsidian dangerLevel bridge', () => {
  // S3-M4 p4 (trap 1): useBossSystem + its dangerLevel bridge moved to world/bossSystem.js.
  const src = read('src/world/bossSystem.js');

  it('useBossSystem bridges bossActive to setDangerLevel (2 active / 0 cleared)', () => {
    expect(/setDangerLevel\(\s*bossActive\s*\?\s*2\s*:\s*0\s*\)/.test(src)).toBe(true);
  });

  it('the bridge is capture-guarded (keeps the boss-closeup/obsidian visual fixtures stable)', () => {
    const idx = src.indexOf('setDangerLevel(bossActive');
    expect(idx).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, idx - 220), idx);
    expect(/isCaptureMode\)\s*return/.test(before)).toBe(true);
  });
});
