import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

// S3-M3 T3: the 5 leaf VFX renderers extracted from SimplifiedNPCSystem -> render/.
// These renderers never appear in the 13 visual baselines (drops/hits/pickups are
// capture-suppressed — the loot-juice gate documents this), so the visual gate CANNOT
// see a regression in them. This static gate is the only automated lock on (a) the move
// landing (imported, not duplicated) and (b) the capture-determinism freeze surviving it.

describe('S3-M3: the leaf VFX renderers extracted to render/', () => {
  const npc = read('src/SimplifiedNPCSystem.jsx');
  const combat = read('src/render/combatVfx.jsx');
  const pickup = read('src/render/pickupVfx.jsx');

  it('NPCSystem imports the 5 renderers from render/ (extracted, not duplicated)', () => {
    expect(/import\s*\{[^}]*DamageNumber[^}]*ImpactShockwave[^}]*\}\s*from\s*'\.\/render\/combatVfx'/.test(npc)).toBe(true);
    expect(/import\s*\{[^}]*XPOrbRender[^}]*LootDropRender[^}]*LootPopRender[^}]*\}\s*from\s*'\.\/render\/pickupVfx'/.test(npc)).toBe(true);
  });

  it('the renderer DEFINITIONS no longer live in the NPC file (no leave-behind duplication)', () => {
    expect(npc).not.toMatch(/const\s+DamageNumber\s*=/);
    expect(npc).not.toMatch(/const\s+ImpactShockwave\s*=/);
    expect(npc).not.toMatch(/const\s+XPOrbRender\s*=/);
    expect(npc).not.toMatch(/const\s+LootDropRender\s*=/);
    expect(npc).not.toMatch(/const\s+LootPopRender\s*=/);
  });

  it('the moved loot renderers KEEP their capture-determinism freeze (the visual gate cannot see this — no baseline drops loot)', () => {
    // LootDropRender's bob/spin reads the live clock unless capture pins elapsed=0;
    // LootPopRender holds a fixed mid-pop pose under capture. Both gates must survive the move.
    expect(pickup).toMatch(/isCaptureMode\(\)\s*\?\s*0\s*:\s*state\.clock\.getElapsedTime\(\)/); // LootDropRender freeze
    expect((pickup.match(/if \(isCaptureMode\(\)\)/g) || []).length).toBeGreaterThanOrEqual(2); // LootDrop + LootPop both gated
  });

  it('the combat VFX renderers export cleanly (DamageNumber + ImpactShockwave)', () => {
    expect(combat).toMatch(/export const DamageNumber/);
    expect(combat).toMatch(/export const ImpactShockwave/);
  });

  it('the pickup VFX renderers export cleanly (XPOrb + LootDrop + LootPop) and import getItemRarity from the registry (no NPC re-export coupling)', () => {
    expect(pickup).toMatch(/export const XPOrbRender/);
    expect(pickup).toMatch(/export const LootDropRender/);
    expect(pickup).toMatch(/export const LootPopRender/);
    expect(/import\s*\{\s*getItemRarity\s*\}\s*from\s*'\.\.\/data\/items\.js'/.test(pickup)).toBe(true);
  });
});
