import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

// M3c loot juice: lock the wiring so the drop/pickup FEEL can't silently regress.
// The actual look (beam + pop) never appears in the 12 visual baselines (drops
// require mob kills, which are capture-suppressed), so these static gates are the
// only automated guard that the wiring stays in place.

describe('loot drop-beam (rarity-legible) wiring', () => {
  const src = read('src/SimplifiedNPCSystem.jsx');

  it('LootDropRender derives its look from the pure rarityBeam helper (rarity color source)', () => {
    // S3-M3 (trap 1): LootDropRender moved to render/pickupVfx.jsx — the look-source assertion
    // follows the component (one level up -> the '../game/lootJuice.js' import). The LootSystem
    // collection branch still imports rarityBeam in the NPC file, locked by the pop asserts below.
    const render = read('src/render/pickupVfx.jsx');
    expect(/import\s*\{\s*rarityBeam\s*\}\s*from\s*'\.\.\/game\/lootJuice\.js'/.test(render)).toBe(true);
    // The drop look is keyed off rarityBeam(rarity), not a hardcoded color switch.
    expect(/rarityBeam\(\s*rarity\s*\)/.test(render)).toBe(true);
  });

  it('rarityBeam is keyed off the locked RARITY_FILL palette (single rarity color SoT)', () => {
    const juice = read('src/game/lootJuice.js');
    expect(/import\s*\{\s*RARITY_FILL\s*\}\s*from\s*'\.\.\/theme\/tokens\.js'/.test(juice)).toBe(true);
    expect(/RARITY_FILL\[tier\]\.ring/.test(juice)).toBe(true);
  });
});

describe('loot pickup feedback (sound + pop) wiring', () => {
  const src = read('src/SimplifiedNPCSystem.jsx');

  // The loot collection branch (dist < 1.2) is the ONLY place loot pickup feedback
  // may fire. There are two `if (dist < 1.2)` guards (XP orb + loot); anchor on the
  // loot one via its unique addToInventory call so the asserts below cannot be
  // satisfied by the unrelated XP-orb branch's playPickup.
  const collectStart = src.indexOf('store.addToInventory(entity.item, 1)');
  const collectBranch = src.slice(collectStart, src.indexOf('ecs.remove(entity);', collectStart));

  it('the loot collection branch plays the pickup sound (LOCKED so it cannot regress to silence)', () => {
    // NOTE: playPickup() was already wired on main (commit 679f2cd "physical ground
    // loot"); this gate locks it in place. M3c's net-new pickup feel is the pop below.
    expect(collectStart).toBeGreaterThan(-1);
    expect(/playPickup\(\)/.test(collectBranch)).toBe(true);
  });

  it('the loot collection branch fires a rarity-tinted pickup pop', () => {
    expect(/GameMethods\.spawnLootPop\(/.test(collectBranch)).toBe(true);
    expect(/rarityBeam\(getItemRarity\(entity\.item\)\)\.color/.test(collectBranch)).toBe(true);
  });

  it('NPCSystem registers the spawnLootPop bridge + renders the pop component', () => {
    expect(/GameMethods\.spawnLootPop\s*=/.test(src)).toBe(true);
    expect(/<LootPopRender/.test(src)).toBe(true);
  });
});
