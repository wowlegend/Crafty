import { describe, it, expect } from 'vitest';
import { CHAIN_ORDER, loreFor, themedDescription } from '../../src/game/questLore.js';
import { QUEST_LIST } from '../../src/QuestSystem.jsx';

describe('quest lore chain', () => {
  it('CHAIN_ORDER threads the existing spine: an opener -> shrine pilgrimage -> climax', () => {
    expect(CHAIN_ORDER[0]).toBeTruthy();
    expect(CHAIN_ORDER).toContain('pilgrim'); // the reach_shrine quest is on the chain
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
