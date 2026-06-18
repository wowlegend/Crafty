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
    // hitstop is player-only (SOTA M1 made it a weight-tiered block; the player-only guard is preserved).
    expect(npc).toMatch(/if \(source === 'player'\)\s*\{[\s\S]{0,260}hitstopUntil:\s*performance\.now\(\)\s*\+\s*HITSTOP\[/);
    expect(npc).toMatch(/source === 'player' && store\.triggerCameraShake/);
    // XP orbs are player-only: totalXP is 0 unless source==='player', and the orb count is 0 when totalXP is 0.
    expect(npc).toMatch(/const totalXP = source === 'player' \? \(entity\.xp \|\| 10\) : 0/);
    expect(npc).toMatch(/const count = totalXP > 0 \?[\s\S]{0,80}: 0/);
  });

  it('the death emit threads source', () => {
    expect(npc).toMatch(/emitMobKill\(entity\.type, \[entity\.position\.x, entity\.position\.y, entity\.position\.z\], source\)/);
  });

  it('EVERY meter accrual subscriber filters on player kills (self-extending invariant)', () => {
    // S3-M4 (trap 1): the accrual hooks moved to world/accrualHooks.js — the per-subscriber invariant follows them.
    const hooks = read('world/accrualHooks.js');
    // The invariant is per-subscriber, not a fixed meter count: each kill-bus accrual hook
    // must carry the attribution filter (ferocity + kinetic + soul today; future meters auto-gated).
    const subscribers = (hooks.match(/subscribeMobKill\(/g) || []).length;
    const filtered = (hooks.match(/source === 'player' && s\.isDay && !isCaptureMode\(\)/g) || []).length;
    expect(subscribers).toBeGreaterThanOrEqual(3);
    expect(filtered).toBe(subscribers);
    expect(read('QuestSystem.jsx')).toMatch(/if \(source !== 'player'\) return;/);
  });
});
