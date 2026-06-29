import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const SRC = readFileSync(resolve(process.cwd(), 'src/SimplifiedNPCSystem.jsx'), 'utf8')
  + readFileSync(resolve(process.cwd(), 'src/systems/CombatSystem.jsx'), 'utf8'); // A1.8: death FX wiring moved to CombatSystem
const FX = readFileSync(resolve(process.cwd(), 'src/game/mobHitFx.js'), 'utf8');
describe('W2-T5 death FX wiring', () => {
  // The kill path no longer hardcodes the literal -- it now passes the deathBurst descriptor's
  // `db.burst` tag (which IS 'death'), so the tint-floored color + branch tag flow together. Assert
  // the real contract: the descriptor's burst:'death' literal lives in mobHitFx, and the kill site
  // forwards db.burst into the GPU pool rather than re-typing the string.
  it("death-burst tag 'death' is the GPU pool's branch literal (in mobHitFx)", () => { expect(FX).toMatch(/burst:\s*'death'/); });
  it('the kill site forwards the deathBurst descriptor (db.color/db.count/db.burst) into the GPU pool', () => {
    expect(SRC).toMatch(/deathBurst/);
    expect(SRC).toMatch(/db\.burst/);
  });
  it('the kill site spawns the t=0 flash + ground decal via spawnDeathFx', () => { expect(SRC).toMatch(/spawnDeathFx/); });
});
