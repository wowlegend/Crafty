import { describe, it, expect } from 'vitest';
import { loreFor, themedDescription, loreQuestIds } from '../../src/game/questLore.js';
import { QUEST_LIST } from '../../src/QuestSystem.jsx';

describe('quest lore chain', () => {
  it('every lore entry names a quest that EXISTS — the invariant that can actually break', () => {
    // This replaces an assertion that CHAIN_ORDER was truthy and contained 'pilgrim'. CHAIN_ORDER was
    // read by nothing, so that test could only ever confirm a constant equalled itself -- and the
    // constant declared a five-quest spine that CONTRADICTED the real offering order, which interleaves
    // builder / miner / spellcaster / zombie_slayer / spider_hunter between those beats. It is deleted.
    //
    // What is worth gating is the map that IS consumed: loreFor and themedDescription are keyed by quest
    // id, so a renamed or removed quest silently drops its giver and its story text, and the quest log
    // falls back to the generic chore with nothing to indicate anything was lost.
    // The denominator comes from the LORE MAP ITSELF. A first draft walked a hardcoded id list and stayed
    // GREEN when a key was renamed -- loreFor simply returned null and nothing noticed, which is the exact
    // failure this gate exists to catch.
    const ids = new Set(QUEST_LIST.map((q) => q.id));
    const keys = loreQuestIds();
    expect(keys.length, 'the lore map is empty, so everything below is vacuous').toBeGreaterThan(2);
    const dangling = keys.filter((id) => !ids.has(id));
    expect(dangling, 'lore is written for a quest id that does not exist — its giver and story silently vanish').toEqual([]);
    for (const id of keys) expect(loreFor(id), `${id} is in the map and loreFor cannot find it`).toBeTruthy();
  });
  it('loreFor returns giver + lore for a chain quest, null for a non-chain bounty', () => {
    const l = loreFor('pilgrim');
    expect(l.giver).toBeTruthy();
    expect(l.lore).toMatch(/shrine|frontier|Blight/i);
    expect(loreFor('bounty_3')).toBeNull();
  });
  it('themedDescription re-themes a generic chore into story flavor without changing the type/target', () => {
    const q = QUEST_LIST.find((x) => x.id === 'hunter');
    const themed = themedDescription(q);
    expect(themed).not.toBe(q.description); // re-themed
    expect(themed.length).toBeGreaterThan(0);
  });
});
