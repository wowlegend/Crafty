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
  const npc = read('SimplifiedNPCSystem.jsx') + read('systems/CombatSystem.jsx'); // A1.8: damageMob/attribution moved to CombatSystem

  it('damageMob carries the 4-arg attribution signature', () => {
    // extension-tolerant: asserts the (id, damage, type, source) attribution prefix is intact;
    // a trailing orthogonal param (e.g. spawnRing, the impact-ring dedup) is allowed.
    expect(npc).toMatch(/damageMob = \(id, damage = 25, type = 'physical', source = 'player'(,|\))/);
  });

  it('hitstop, camera shake, and XP orbs are player-only', () => {
    // The guard used to be the literal `source === 'player'` in all four places. It is now two NAMED
    // predicates, because the two questions came apart: a fireball burn tick is the player's damage
    // (XP, kill credit) but NOT the player's input (hitstop, shake, impact ring). Asserting the literal
    // is what made this gate go red at the fix instead of at a regression.
    expect(npc).toMatch(/if \(isDirectPlayerHit\(source\)\)\s*\{[\s\S]{0,260}hitstopUntil:\s*performance\.now\(\)\s*\+\s*HITSTOP\[/);
    expect(npc).toMatch(/isDirectPlayerHit\(source\) && store\.triggerCameraShake/);
    // XP orbs are player-SOURCED (direct hit or burn tick), and the orb count is 0 when totalXP is 0.
    expect(npc).toMatch(/const totalXP = isPlayerSource\(source\) \? \(entity\.xp \|\| 10\) : 0/);
    expect(npc).toMatch(/const count = totalXP > 0 \?[\s\S]{0,80}: 0/);
  });

  it('FEEL and ATTRIBUTION stay separate predicates — collapsing them re-opens one bug or the other', () => {
    // Using isPlayerSource for feel puts the burn tick's hitstop and camera shake back. Using
    // isDirectPlayerHit for attribution silently zeroes every burn kill's XP and quest credit. The
    // defect is available in both directions, so the gate asserts the split itself.
    expect(npc.includes('isDirectPlayerHit(source)'), 'the feel guard is gone').toBe(true);
    expect(npc.includes('isPlayerSource(source)'), 'the attribution guard is gone').toBe(true);
    expect(/hitstopUntil[\s\S]{0,80}/.test(npc)).toBe(true);
    expect(/isPlayerSource\(source\) && store\.triggerCameraShake/.test(npc), 'feel is gated on attribution again').toBe(false);
    expect(/const totalXP = isDirectPlayerHit\(source\)/.test(npc), 'attribution is gated on feel again').toBe(false);
  });

  it('the impact ring is direct-only — a DoT tick is not an impact', () => {
    expect(npc).toMatch(/if \(spawnRing && isDirectPlayerHit\(source\)\) setShockwaves/);
  });

  it('the death emit threads source, normalised to the bus vocabulary', () => {
    // The bus publishes 'player' | 'ally' | 'hazard'; subscribers count quest kills and bank Resonance
    // off that string, so a burn kill has to arrive as a player kill rather than as a new fourth value.
    expect(npc).toMatch(/emitMobKill\(entity\.type, \[entity\.position\.x, entity\.position\.y, entity\.position\.z\], attributionSource\(source\)\)/);
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
