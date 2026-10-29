import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip, carriersOf } from './_srcWalk.js';
import { HUB_NPCS, makeNpcEntity } from '../../src/world/npcSpawn.js';
import { ecs, mobsQuery } from '../../src/ecs/world.js';
import { talkToNearest } from '../../src/input/talk.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';

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
 * THE COUPLING: every role in HUB_NPCS must be ROUTABLE. The roster is data and the talk verb (input/talk.js) is a
 * chain of role branches in another file, and nothing connected them. Add a fifth villager to the roster with no
 * matching branch and they spawn, stand at their anchor, show a nametag, and do the merchant's thing or nothing when
 * you press G — a feature that looks shipped and is inert. That is this repo's most-repeated defect class (four in one
 * day: compiling, gated green, never reached), and it is a relationship a tuner could break without noticing, which
 * R9 ranks above an example.
 *
 * BLIND SPOT, stated (R7): the router half drives talkToNearest against NPC entities in the ECS, not a G press in a
 * running game (tests/e2e/forge.spec.js presses G beside Mara on CI).
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

  it('EVERY roster role does its own thing when talked to — a new NPC cannot ship inert', () => {
    // The coupling, driven: each roster NPC spawned into the ECS beside the camera and talked to through the talk verb G
    // and the touch tray call (input/talk.js). `merchant` is the fall-through (the legacy role-less quest path); every
    // other role needs its own branch, or it would share the merchant's and open trading.
    const outcomes = {};
    for (const n of HUB_NPCS) {
      for (const e of [...ecs.entities]) ecs.remove(e);
      const e = ecs.add(makeNpcEntity(n, `npc-${n.role}`, 20));
      useGameStore.setState({ gameCamera: { position: { x: e.position.x + 1, y: 21.6, z: e.position.z } } });
      outcomes[n.role] = talkToNearest(useGameStore.getState());
      useGameStore.setState({ showForge: false, showTradingInterface: false });
    }
    for (const e of [...ecs.entities]) ecs.remove(e);
    expect(outcomes, 'a hub NPC role has no talk branch of its own — it does nothing, or the merchant\'s thing, on G')
      .toEqual({ merchant: 'trade', smith: 'forge', guide: 'hint', healer: 'heal' });
  });

  it('the AI tick SKIPS static NPCs, at the one line that builds the mob payload', () => {
    // Anchored to the filter that decides which entities the AI worker moves. A bare /isStatic/ grep
    // passed on the word appearing anywhere, including in the comment explaining it.
    expect(read('systems/AIWorkerSystem.jsx'), 'static NPCs are being fed to the AI worker — they will wander')
      .toMatch(/mobsQuery\.entities\.filter\([^)]*!e\.isStatic/);
  });

  it('makeNpcEntity stamps the three flags the rest of the wiring branches on', () => {
    // Driven, because those three booleans are what every downstream consumer keys off: isMob reuses the
    // render, isNPC makes the NPC undamageable (combat/targeting.js) and drives its daytime patrol
    // (systems/AIWorkerSystem.jsx), isStatic is the AI skip above.
    const e = makeNpcEntity(HUB_NPCS[0], 'npc-0', 42);
    expect({ isMob: e.isMob, isNPC: e.isNPC, isStatic: e.isStatic })
      .toEqual({ isMob: true, isNPC: true, isStatic: true });
    expect(e.speed, 'a hub NPC with a non-zero speed would drift off its post').toBe(0);
    expect(e.damage, 'a hub NPC that can damage the player is not passive').toBe(0);
  });

  it('the hub NPCs are read where they live: the mob query finds them, and no module reads a store copy', () => {
    // The 250 ms store mirror (mobEntities, npcEntities) is deleted (reset plan row 9): the minimap, the compass and
    // the G-talk read the ECS. A hub NPC must therefore be IN the query they loop over, as a villager.
    const npc = makeNpcEntity(HUB_NPCS[0], 99001, 52);
    ecs.add(npc);
    try {
      const found = mobsQuery.entities.find((e) => e.id === 99001);
      expect(found, 'a hub NPC is not in mobsQuery — the minimap and compass would never show it').toBeDefined();
      expect(found.type).toBe('villager');
    } finally {
      ecs.remove(npc);
    }
    // Presence before absence: the same walker finds the live query readers it is meant to see.
    expect(carriersOf(/\bmobsQuery\.entities\b/), 'SETUP: the walker sees no reader of the live mob query')
      .toEqual(expect.arrayContaining(['ui/compassMarkers.js', 'ui/RadialMinimap.jsx', 'input/talk.js']));
    expect(carriersOf(/\b(mobEntities|npcEntities|setMobEntities|setNpcEntities)\b/),
      'a module reads or writes a store copy of the mobs again').toEqual([]);
  });
});
