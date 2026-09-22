import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip, carriersOf } from './_srcWalk.js';
import { HUB_NPCS, makeNpcEntity } from '../../src/world/npcSpawn.js';

const read = (rel) => strip(readFileSync(resolve(SRC, rel), 'utf8'));

/**
 * Hub NPC spawn + the AI-skip that keeps them standing at their posts.
 *
 * REWRITTEN 2026-09-22, selected by `gate-census.mjs` at 0/5. Its assertions were bare-token greps over
 * two CONCATENATED files, and the worst of them — `expect(read('InputManager.jsx')).toMatch(/role/)` —
 * is satisfied by the word appearing anywhere in a 900-line file, including in a comment about roles.
 * That is not a check; it is the shape of one.
 *
 * `makeNpcEntity` is not re-tested here: it is pure and `tests/data/npcSpawn.test.js` already drives it.
 * This gate owns the WIRING, and the case worth the most is one the old version could not have had.
 *
 * THE COUPLING: every role in HUB_NPCS must be ROUTABLE. The roster is data and the G-interact router is
 * a chain of `role === '...'` branches in another file, and nothing connected them. Add a fifth villager
 * to the roster with no matching branch and they spawn, stand at their anchor, show a nametag, and do
 * nothing at all when you press G — a feature that looks shipped and is inert. That is this repo's
 * most-repeated defect class (four in one day: compiling, gated green, never reached), and it is a
 * relationship a tuner could break without noticing, which R9 ranks above an example.
 *
 * BLIND SPOT, stated (R7): the router half reads source. It proves a branch EXISTS for each role, not
 * that pressing G reaches it in a running game, nor that the panel it opens is the right one. Nothing
 * here spawns an NPC into a world either.
 *
 * Mutation-Proof: 4 mutations, recorded on the commit.
 */
describe('hub NPC spawn + AI-skip', () => {
  it('the roster is non-empty, and every entry carries the fields the wiring reads', () => {
    expect(HUB_NPCS.length).toBe(4);
    for (const n of HUB_NPCS) {
      expect(typeof n.role, `a roster entry has no role: ${JSON.stringify(n)}`).toBe('string');
      expect(typeof n.name).toBe('string');
    }
    expect(new Set(HUB_NPCS.map((n) => n.role)).size, 'two NPCs share a role — one of them is unreachable')
      .toBe(HUB_NPCS.length);
  });

  it('EVERY roster role has a G-interact branch — a new NPC cannot ship inert', () => {
    // The coupling. `merchant` is the fall-through (the legacy role-less quest path), so it is routable
    // by construction; every other role needs its own branch or pressing G does nothing.
    const im = read('InputManager.jsx');
    const unroutable = HUB_NPCS
      .map((n) => n.role)
      .filter((role) => role !== 'merchant' && !new RegExp(`role === '${role}'`).test(im));
    expect(unroutable, 'a hub NPC role has no interact branch — it would spawn and do nothing on G')
      .toEqual([]);
    // And the router must read the role off the NPC, not off something ambient.
    expect(im, 'the interact no longer reads the role from the targeted villager')
      .toMatch(/const role = nearestVillager\.role/);
  });

  it('the AI tick SKIPS static NPCs, at the one line that builds the mob payload', () => {
    // Anchored to the filter that decides which entities the AI worker moves. A bare /isStatic/ grep
    // passed on the word appearing anywhere, including in the comment explaining it.
    expect(read('systems/AIWorkerSystem.jsx'), 'static NPCs are being fed to the AI worker — they will wander')
      .toMatch(/mobsQuery\.entities\.filter\([^)]*!e\.isStatic/);
  });

  it('makeNpcEntity stamps the three flags the rest of the wiring branches on', () => {
    // Driven, because those three booleans are what every downstream consumer keys off: isMob reuses the
    // render, isNPC selects the minimap mirror, isStatic is the AI skip above.
    const e = makeNpcEntity(HUB_NPCS[0], 'npc-0', 42);
    expect({ isMob: e.isMob, isNPC: e.isNPC, isStatic: e.isStatic })
      .toEqual({ isMob: true, isNPC: true, isStatic: true });
    expect(e.speed, 'a hub NPC with a non-zero speed would drift off its post').toBe(0);
    expect(e.damage, 'a hub NPC that can damage the player is not passive').toBe(0);
  });

  it('the store owns the npcEntities mirror, and the sync system builds its payload', () => {
    // THE OLD VERSION OF THIS CASE WAS GREEN ON A COMMENT. It asserted `npcEntities` appears in
    // MinimapSyncSystem.jsx, reading the file WITHOUT stripping comments. Measured 2026-09-22: that
    // token appears there exactly twice and BOTH are in comments (a header note and a line explaining
    // what RadialMinimap consumes). Zero occurrences in code. The state it was guarding lives in the
    // store; the sync system builds the payload and calls the store action. The gate named the wrong
    // file and was kept alive by prose describing the right one — the fourth instance of that shape
    // found in this corpus in a single session.
    expect(read('store/useGameStore.jsx'), 'the npcEntities mirror is gone — minimap and nametags go blank')
      .toMatch(/npcEntities:/);
    // TWO modules, not three. `world/npcSpawn.js` was in this list an hour after it was written, on the
    // strength of a TRAILING comment — the shared `strip` helper removed block and full-line comments
    // but not `code; // trailing`, so a comment-derived entry got into a list whose whole purpose is to
    // pin real ones. Fixed in `_srcWalk.js`; this is the assertion that caught it.
    expect(carriersOf(/npcEntities/), 'the set of modules touching the NPC mirror changed')
      .toEqual(['store/useGameStore.jsx', 'ui/RadialMinimap.jsx']);
    // The sync payload must carry the two fields the consumers branch on: `role` routes the G-interact
    // and `isNPC` selects the gold blip. Asserted in CODE, which is what the old case could not do.
    const sync = read('systems/MinimapSyncSystem.jsx');
    expect(sync, 'the mirror payload no longer carries role — G cannot route by it').toMatch(/role: e\.role/);
    expect(sync, 'the mirror payload no longer marks NPCs — the minimap cannot tell them from mobs')
      .toMatch(/isNPC: e\.isNPC/);
  });
});
